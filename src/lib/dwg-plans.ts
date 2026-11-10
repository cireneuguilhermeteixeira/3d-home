import { to3dHomeSourceCad, type DwgDocument, type DwgRecord } from 'dwg-json'
import type { CadRawEntity } from './cad'

type Matrix = { a:number;b:number;c:number;d:number;x:number;y:number }
export type DwgPlan = { id:string;name:string;blockName:string;entityCount:number }
export type DwgOpeningEvidence = { id:string;type:'DOOR'|'WINDOW'|'GATE';start:{x:number;y:number};end:{x:number;y:number};alternateEnd?:{x:number;y:number};sourceEntityIds:string[] }
const identity:Matrix={a:1,b:0,c:0,d:1,x:0,y:0}
const multiply=(left:Matrix,right:Matrix):Matrix=>({
  a:left.a*right.a+left.c*right.b,b:left.b*right.a+left.d*right.b,
  c:left.a*right.c+left.c*right.d,d:left.b*right.c+left.d*right.d,
  x:left.a*right.x+left.c*right.y+left.x,y:left.b*right.x+left.d*right.y+left.y,
})
const point=(p:{x:number;y:number},m:Matrix)=>({x:m.a*p.x+m.c*p.y+m.x,y:m.b*p.x+m.d*p.y+m.y})
function insertion(record:DwgRecord,base:{x:number;y:number}):Matrix|null {
  const geometry=record.geometry as {insertionPoint?:{x:number;y:number};scale?:{x:number;y:number};rotation?:number}|undefined
  if(!geometry?.insertionPoint)return null
  const angle=geometry.rotation??0,sx=geometry.scale?.x??1,sy=geometry.scale?.y??1
  const a=Math.cos(angle)*sx,b=Math.sin(angle)*sx,c=-Math.sin(angle)*sy,d=Math.cos(angle)*sy
  return {a,b,c,d,x:geometry.insertionPoint.x-a*base.x-c*base.y,y:geometry.insertionPoint.y-b*base.x-d*base.y}
}
function blockOf(document:DwgDocument,record:DwgRecord){
  const handle=(record.geometry as {blockHandleHex?:string}|undefined)?.blockHandleHex
  return document.blocks.find(block=>block.handleHex===handle)
}

export function findDwgPlans(document:DwgDocument):DwgPlan[]{
  const candidates=document.modelSpace.entities.filter(record=>record.type==='INSERT').map(record=>({record,block:blockOf(document,record)}))
    .filter((item):item is {record:DwgRecord;block:DwgDocument['blocks'][number]}=>!!item.block&&item.block.entities.length>=80&&/base|pav|piso|t[eé]rreo|planta/i.test(item.block.name))
  const seen=new Set<string>()
  return candidates.filter(({block})=>{if(seen.has(block.handleHex))return false;seen.add(block.handleHex);return true})
    .map(({record,block})=>({id:record.handleHex,name:block.name,blockName:block.name,entityCount:block.entities.length}))
    .sort((a,b)=>Number(/terreo|térreo|base/i.test(b.blockName))-Number(/terreo|térreo|base/i.test(a.blockName)))
}

export function projectDwgPlan(document:DwgDocument,planId:string):CadRawEntity[]{
  const root=document.modelSpace.entities.find(record=>record.handleHex===planId&&record.type==='INSERT')
  const rootBlock=root&&blockOf(document,root)
  if(!root||!rootBlock)throw new Error('Planta DWG não encontrada')
  const projected:CadRawEntity[]=[]
  const visit=(block:typeof rootBlock,transform:Matrix,prefix:string,depth:number,ancestors:Set<string>)=>{
    if(depth>6||projected.length>=12000||ancestors.has(block.handleHex))return
    const lineage=new Set(ancestors);lineage.add(block.handleHex)
    const source=to3dHomeSourceCad({...document,modelSpace:{entities:block.entities}},'Model')
    for(let i=0;i<block.entities.length&&projected.length<12000;i++){
      const record=block.entities[i],entity=source.rawEntities[i]
      if(record.type==='INSERT'){
        const child=blockOf(document,record)
        if(child?.entities.length){const matrix=insertion(record,child.base as {x:number;y:number}??{x:0,y:0});if(matrix)visit(child,multiply(transform,matrix),`${prefix}/${record.handleHex}`,depth+1,lineage)}
        continue
      }
      if(!entity||!entity.points.length)continue
      projected.push({handle:`${prefix}/${record.handleHex}`,type:record.type,layer:entity.layer,vertices:entity.points.map(p=>point(p,transform)),text:entity.text,
        closed:entity.original.closed===true,originalCad:{type:record.type,sourceHandle:record.handleHex,sourceBlock:block.name,closed:entity.original.closed===true}})
    }
  }
  const matrix=insertion(root,rootBlock.base as {x:number;y:number}??{x:0,y:0})
  if(matrix)visit(rootBlock,multiply(identity,matrix),root.handleHex,0,new Set())
  return projected
}

/** Keep the semantic meaning of INSERTs after their strokes have been flattened. */
export function findDwgOpeningInserts(document:DwgDocument,planId:string,projected:CadRawEntity[]):DwgOpeningEvidence[]{
  const root=document.modelSpace.entities.find(record=>record.handleHex===planId&&record.type==='INSERT')
  const rootBlock=root&&blockOf(document,root)
  const rootMatrix=root&&rootBlock&&insertion(root,rootBlock.base as {x:number;y:number}??{x:0,y:0})
  if(!rootBlock||!rootMatrix)return []
  const result:DwgOpeningEvidence[]=[]
  for(const insert of rootBlock.entities.filter(record=>record.type==='INSERT')){
    const child=blockOf(document,insert)
    if(!child)continue
    const labels=[child.name,insert.layerName,...child.entities.map(entity=>entity.layerName)].join(' ').toLocaleLowerCase('pt-BR')
    const type: DwgOpeningEvidence['type']|null=/port[aã]o|gate/.test(labels)?'GATE':/esquadria.*vidro|janela|arq-cxo/.test(labels)?'WINDOW':/arq-por-002|porta/.test(labels)&&child.entities.some(entity=>entity.type==='ARC')?'DOOR':null
    if(!type)continue
    const sourceEntityIds=projected.filter(entity=>entity.handle?.startsWith(`${planId}/${insert.handleHex}/`)).map(entity=>entity.handle!)
    const points=projected.filter(entity=>entity.handle?.startsWith(`${planId}/${insert.handleHex}/`)).flatMap(entity=>entity.vertices??[])
    if(points.length<2)continue
    let start:{x:number;y:number},end:{x:number;y:number},alternateEnd:{x:number;y:number}|undefined
    if(type==='DOOR'){
      const arc=child.entities.find(entity=>entity.type==='ARC')
      const geometry=arc?.geometry as {center?:{x:number;y:number};radius?:number;startAngle?:number;endAngle?:number}|undefined
      const childMatrix=insertion(insert,child.base as {x:number;y:number}??{x:0,y:0})
      if(!geometry?.center||!geometry.radius||!childMatrix)continue
      const matrix=multiply(rootMatrix,childMatrix)
      start=point(geometry.center,matrix)
      const angle=geometry.startAngle??0
      end=point({x:geometry.center.x+geometry.radius*Math.cos(angle),y:geometry.center.y+geometry.radius*Math.sin(angle)},matrix)
      const lastAngle=geometry.endAngle??angle
      alternateEnd=point({x:geometry.center.x+geometry.radius*Math.cos(lastAngle),y:geometry.center.y+geometry.radius*Math.sin(lastAngle)},matrix)
      if(Math.hypot(end.x-start.x,end.y-start.y)<0.35)continue
    }else{
      const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x))
      const minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y))
      if(maxX-minX>=maxY-minY){const y=(minY+maxY)/2;start={x:minX,y};end={x:maxX,y}}
      else{const x=(minX+maxX)/2;start={x,y:minY};end={x,y:maxY}}
      if(Math.hypot(end.x-start.x,end.y-start.y)<0.35)continue
    }
    result.push({id:`opening-${planId}/${insert.handleHex}`,type,start,end,alternateEnd,sourceEntityIds})
  }
  return result
}
