import { to3dHomeSourceCad, type DwgDocument, type DwgRecord } from 'dwg-json'
import type { CadRawEntity } from './cad'

type Matrix = { a:number;b:number;c:number;d:number;x:number;y:number }
export type DwgPlan = { id:string;name:string;blockName:string;entityCount:number }
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
