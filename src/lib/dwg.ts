import { convertDwgBuffer, to3dHomeSourceCad } from 'dwg-json'
import { DxfConverter, type CadConverter, type CadRawEntity } from './cad'
import type { ProjectDocument } from './model'
import { findDwgPlans, projectDwgPlan } from './dwg-plans'

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
