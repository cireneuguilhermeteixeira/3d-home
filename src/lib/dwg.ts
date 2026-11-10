import { convertDwgBuffer, to3dHomeSourceCad } from 'dwg-json'
import { DxfConverter, type CadConverter, type CadRawEntity } from './cad'
import type { ProjectDocument } from './model'
import { findDwgOpeningInserts, findDwgPlans, projectDwgPlan } from './dwg-plans'
import { applyDwgWallHeights, integrateDwgOpeningsIntoWalls } from './dwg-walls'

export function addBlockOpenings(document:ProjectDocument, archive:Parameters<typeof findDwgOpeningInserts>[0], planId:string, raw:CadRawEntity[]){
  const factor=document.coordinateSystem.metersPerSourceUnit??1
  const evidence=findDwgOpeningInserts(archive,planId,raw)
  for(const item of evidence){
    const scale=(p:{x:number;y:number})=>({x:p.x*factor,y:p.y*factor})
    let start=scale(item.start),end=scale(item.end)
    const midpoint={x:(start.x+end.x)/2,y:(start.y+end.y)/2}
    const width=Math.hypot(end.x-start.x,end.y-start.y)
    if(width<0.35||width>8)continue
    const ux=(end.x-start.x)/width,uy=(end.y-start.y)/width
    const nearby=document.walls.map(wall=>{
      const length=Math.hypot(wall.end.x-wall.start.x,wall.end.y-wall.start.y)
      const vx=(wall.end.x-wall.start.x)/length,vy=(wall.end.y-wall.start.y)/length
      const station=(midpoint.x-wall.start.x)*vx+(midpoint.y-wall.start.y)*vy
      const normal=Math.abs((midpoint.x-wall.start.x)*vy-(midpoint.y-wall.start.y)*vx)
      const gap=Math.max(0,-station,station-length)
      return {wall,length,vx,vy,station,normal,gap,alignment:Math.abs(ux*vx+uy*vy)}
    }).filter(candidate=>candidate.normal<1.4&&candidate.gap<1.5&&(item.type==='DOOR'||candidate.alignment>0.9))
      .sort((a,b)=>a.normal+a.gap*0.65+(1-a.alignment)*0.2-(b.normal+b.gap*0.65+(1-b.alignment)*0.2))
    const nearest=nearby[0]
    if(item.type==='DOOR'&&nearest){
      const ends=[end,...(item.alternateEnd?[scale(item.alternateEnd)]:[])]
      const endOnWall=ends.sort((a,b)=>{
        const offset=(p:{x:number;y:number})=>Math.abs((p.x-nearest.wall.start.x)*nearest.vy-(p.y-nearest.wall.start.y)*nearest.vx)
        return offset(a)-offset(b)
      })[0]
      end=endOnWall
    }
    if(nearest){
      const snap=(p:{x:number;y:number})=>{
        const station=(p.x-nearest.wall.start.x)*nearest.vx+(p.y-nearest.wall.start.y)*nearest.vy
        return {x:nearest.wall.start.x+station*nearest.vx,y:nearest.wall.start.y+station*nearest.vy}
      }
      start=snap(start);end=snap(end)
    }
    const actualWidth=Math.hypot(end.x-start.x,end.y-start.y)
    if(actualWidth<0.35||actualWidth>8)continue
    const center={x:(start.x+end.x)/2,y:(start.y+end.y)/2}
    if(document.openings.some(existing=>existing.id===item.id||existing.type===item.type&&Math.hypot(existing.center.x-center.x,existing.center.y-center.y)<0.25))continue
    const attached=nearest&&nearest.normal<0.2&&nearest.alignment>0.9&&nearest.station>actualWidth/2&&nearest.station<nearest.length-actualWidth/2?nearest:null
    const opening={id:item.id,type:item.type,wallId:attached?.wall.id??null,center,width:actualWidth,height:item.type==='WINDOW'?1:item.type==='GATE'?2.4:2.1,sillHeight:item.type==='WINDOW'?1:0,positionAlongWall:attached?.station??null,annotation:null,sourceEntityIds:item.sourceEntityIds,properties:{association:'DWG_BLOCK',spanStart:start,spanEnd:end,heightEstimated:true}}
    document.openings.push(opening)
    if(attached)attached.wall.openingIds.push(opening.id)
  }
}

/** DWG data is retained as a complete JSON archive in document.metadata.dwgJson. */
export class DwgConverter implements CadConverter<ArrayBuffer> {
  async convert(input: ArrayBuffer, projectId: string, reference?: { entityId: string; lengthMeters: number }, planId?: string): Promise<ProjectDocument> {
    if (input.byteLength < 6 || !/^AC10\d{2}$/.test(new TextDecoder('ascii').decode(input.slice(0, 6)))) {
      throw new Error('DWG inválido: assinatura AutoCAD ausente')
    }

    const archive = convertDwgBuffer(new Uint8Array(input))
    if (archive.completeness.parseStatus === 'archive-only') {
      throw new Error(`DWG preservado, mas estrutura ainda não suportada: ${archive.diagnostics[0]?.message ?? archive.source.dwgVersion}`)
    }

    const spaceName = archive.modelSpace.entities.length
      ? 'Model'
      : archive.layouts.find(layout => layout.entities.length)?.name
    if (!spaceName) throw new Error('DWG sem entidades legíveis em modelo ou layout')

    const plans=findDwgPlans(archive)
    const requested=planId?archive.modelSpace.entities.find(entity=>entity.handleHex===planId):null
    const requestedBlockHandle=(requested?.geometry as {blockHandleHex?:string}|undefined)?.blockHandleHex
    const requestedBlock=archive.blocks.find(block=>block.handleHex===requestedBlockHandle)
    const selectedPlan=planId?plans.find(plan=>plan.id===planId)??plans.find(plan=>plan.blockName===requestedBlock?.name):plans[0]
    if(planId&&!selectedPlan)throw new Error('Planta DWG não encontrada neste arquivo')
    const raw: CadRawEntity[] = selectedPlan?projectDwgPlan(archive,selectedPlan.id):to3dHomeSourceCad(archive, spaceName).rawEntities.map(entity => ({
      handle: entity.id,
      type: entity.type,
      layer: entity.layer,
      vertices: entity.points,
      text: entity.text,
      closed: entity.original.closed === true,
      originalCad: entity.original,
    }))
    const drawingPoints=raw.flatMap(entity=>entity.vertices??[])
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity
    for(const point of drawingPoints){minX=Math.min(minX,point.x);minY=Math.min(minY,point.y);maxX=Math.max(maxX,point.x);maxY=Math.max(maxY,point.y)}
    const architecturalLines=raw.filter(entity=>entity.type==='LINE'&&/ARQ-ALV|PAREDE|WALL/i.test(entity.layer??'')).length
    const inferredMeters=!!selectedPlan&&architecturalLines>=20&&maxX-minX>=3&&maxX-minX<=100&&maxY-minY>=3&&maxY-minY<=100
    let factorOverride:number|undefined
    if(reference){
      const entity=raw.find(item=>item.handle===reference.entityId||item.handle?.endsWith(`/${reference.entityId}`))
      let points=entity?.vertices
      if(!points){const model=to3dHomeSourceCad(archive,'Model').rawEntities.find(item=>item.id===reference.entityId);points=model?.points}
      if(!points||points.length<2)throw new Error('Linha de referência não encontrada neste DWG. Clique em uma linha visível da planta.')
      const sourceLength=Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y)
      if(sourceLength<=0)throw new Error('A linha de referência não tem comprimento válido.')
      factorOverride=reference.lengthMeters/sourceLength
    }
    // Keep the editor document small; the archive retains every block body.
    const blockIndex = Object.fromEntries(archive.blocks.map(block => [block.name, {
      handleHex: block.handleHex,
      name: block.name,
      entityHandleHexes: block.entityHandleHexes,
      layoutHandleHex: block.layoutHandleHex,
      base: block.base,
    }]))
    const header={...archive.header,...(inferredMeters?{$INSUNITS:6}:{})} as Record<string,unknown>
    const document = new DxfConverter().convertEntities(raw,header,blockIndex,projectId,undefined,factorOverride)
    if(selectedPlan){
      applyDwgWallHeights(document,archive)
      addBlockOpenings(document,archive,selectedPlan.id,raw)
      integrateDwgOpeningsIntoWalls(document)
      document.metadata.dwgOpeningRecovery='wall-openings-v2'
    }
    if(inferredMeters&&!reference)document.coordinateSystem.sourceUnit='inferred:m'
    document.sourceCad.format = 'DWG'
    document.metadata.dwgParser = {
      name: 'acadrust-js / dwg-json',
      parseStatus: archive.completeness.parseStatus,
      decodedRecordCount: archive.completeness.decodedRecordCount,
      recordCount: archive.completeness.recordCount,
      activeSpace: selectedPlan?.name??spaceName,
    }
    document.metadata.dwgPlans=plans
    document.metadata.dwgPlanId=selectedPlan?.id??null
    document.metadata.scaleInference=inferredMeters&&!reference?'architectural-geometry':null
    document.metadata.dwgJson = archive
    return document
  }
}
