import { z } from 'zod'
import { documentSchema, asset, type ProjectDocument } from './model'

export const operation = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ADD_ROOM_FROM_ENTITY'), entityId: z.string() }),
  z.object({ type: z.literal('REMOVE_ROOM'), roomId: z.string() }),
  z.object({ type: z.literal('NAME_ROOM'), roomId: z.string(), name: z.string().min(1).max(80), roomType: z.enum(['LIVING_ROOM','BEDROOM','KITCHEN','BATHROOM','OFFICE','GARAGE','BACKYARD','DECK','LAUNDRY','OTHER']) }),
  z.object({ type: z.literal('SET_WALL_COLOR'), wallId: z.string(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }),
  z.object({ type: z.literal('SET_FLOOR_MATERIAL'), roomId: z.string(), materialId: z.string().nullable() }),
  z.object({ type: z.literal('ADD_ASSET'), assetId: z.uuid(), roomId: z.string(), catalogId: z.string(), position: z.object({ x:z.number(), y:z.number(), z:z.number() }) }),
  z.object({ type: z.literal('RESTORE_ASSET'), asset }),
  z.object({ type: z.literal('MOVE_ASSET'), assetId: z.string(), position: z.object({ x:z.number(), y:z.number(), z:z.number() }), rotation: z.number().optional() }),
  z.object({ type: z.literal('REMOVE_ASSET'), assetId: z.string() })
])
export type Operation = z.infer<typeof operation>

export const catalog = [
  { id:'sofa', name:'Sofá de couro e madeira', category:'Sofás', width:2.1, depth:0.9, modelUrl:'/assets/sheen-sofa.glb', price:null },
  { id:'chair', name:'Poltrona estofada', category:'Poltronas', width:0.85, depth:0.85, modelUrl:'/assets/sheen-chair.glb', price:null }
] as const
function inside(p:{x:number;z:number}, polygon:{x:number;y:number}[]) {
  if (polygon.length < 3) return false
  let yes=false
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    if ((polygon[i].y>p.z)!==(polygon[j].y>p.z) && p.x<(polygon[j].x-polygon[i].x)*(p.z-polygon[i].y)/(polygon[j].y-polygon[i].y)+polygon[i].x) yes=!yes
  }
  return yes
}
function fits(position:{x:number;z:number},polygon:{x:number;y:number}[],width:number,depth:number,rotation=0){
  const c=Math.cos(rotation),s=Math.sin(rotation)
  return [[-1,-1],[-1,1],[1,-1],[1,1]].every(([sx,sz])=>{const x=sx*width/2,z=sz*depth/2;return inside({x:position.x+x*c-z*s,z:position.z+x*s+z*c},polygon)})
}
export function applyOperations(doc:ProjectDocument, ops:Operation[]):ProjectDocument {
  const next:ProjectDocument=structuredClone(doc)
  for(const op of ops) {
    if(op.type==='ADD_ROOM_FROM_ENTITY') {
      const e=next.sourceCad.rawEntities.find(e=>e.id===op.entityId);if(!e||!e.type.includes('POLYLINE')||e.points.length<3||!(e.original.closed||e.original.shape))throw new Error('Polilinha fechada não encontrada')
      if(next.rooms.some(r=>r.sourceEntityIds.includes(e.id)))throw new Error('Ambiente já identificado')
      const polygon=e.points;let area=0;for(let i=0;i<polygon.length;i++){const j=(i+1)%polygon.length;area+=polygon[i].x*polygon[j].y-polygon[j].x*polygon[i].y}area=Math.abs(area)/2;if(area<0.5)throw new Error('Área muito pequena para ambiente')
      const center={x:polygon.reduce((s,v)=>s+v.x,0)/polygon.length,y:polygon.reduce((s,v)=>s+v.y,0)/polygon.length}
      next.rooms.push({id:`room-${e.id}`,name:'Ambiente sem nome',type:'OTHER',polygon,center,area,ceilingHeight:null,floorMaterialId:null,wallMaterialId:null,assetIds:[],preferences:{},sourceEntityIds:[e.id]})
    } else if(op.type==='REMOVE_ROOM') {
      const room=next.rooms.find(r=>r.id===op.roomId);if(!room)throw new Error('Ambiente não encontrado');if(room.assetIds.length)throw new Error('Remova os móveis antes de excluir o ambiente');next.rooms=next.rooms.filter(r=>r.id!==op.roomId)
    } else if(op.type==='NAME_ROOM') {
      const room=next.rooms.find(r=>r.id===op.roomId); if(!room) throw new Error('Ambiente não encontrado')
      room.name=op.name; room.type=op.roomType
    } else if(op.type==='SET_WALL_COLOR') {
      const wall=next.walls.find(w=>w.id===op.wallId); if(!wall) throw new Error('Parede não encontrada')
      wall.color=op.color
    } else if(op.type==='SET_FLOOR_MATERIAL') {
      const room=next.rooms.find(r=>r.id===op.roomId); if(!room) throw new Error('Ambiente não encontrado')
      if(op.materialId&&!next.materials[op.materialId]) throw new Error('Material não encontrado')
      room.floorMaterialId=op.materialId
    } else if(op.type==='ADD_ASSET') {
      const room=next.rooms.find(r=>r.id===op.roomId); if(!room) throw new Error('Ambiente não encontrado')
      const item=catalog.find(a=>a.id===op.catalogId); if(!item) throw new Error('Móvel fora do catálogo')
      if(!fits(op.position,room.polygon,item.width,item.depth)) throw new Error('Móvel atravessa o limite do ambiente')
      if(next.assets.some(a=>a.id===op.assetId))throw new Error('Móvel duplicado')
      next.assets.push({id:op.assetId,catalogId:item.id,roomId:room.id,name:item.name,position:op.position,rotation:0,scale:1,materialId:null,price:item.price,metadata:{modelUrl:item.modelUrl}}); room.assetIds.push(op.assetId)
    } else if(op.type==='RESTORE_ASSET') {
      if(next.assets.some(a=>a.id===op.asset.id))throw new Error('Móvel duplicado')
      const room=next.rooms.find(r=>r.id===op.asset.roomId);if(!room)throw new Error('Ambiente não encontrado')
      const item=catalog.find(a=>a.id===op.asset.catalogId);if(!item)throw new Error('Móvel fora do catálogo')
      if(!fits(op.asset.position,room.polygon,item.width,item.depth,op.asset.rotation))throw new Error('Móvel atravessa o limite do ambiente')
      next.assets.push(op.asset);room.assetIds.push(op.asset.id)
    } else if(op.type==='MOVE_ASSET') {
      const asset=next.assets.find(a=>a.id===op.assetId); if(!asset) throw new Error('Móvel não encontrado')
      const room=next.rooms.find(r=>r.id===asset.roomId)!;const item=catalog.find(a=>a.id===asset.catalogId);if(!item||!fits(op.position,room.polygon,item.width,item.depth,op.rotation??asset.rotation)) throw new Error('Móvel atravessa o limite do ambiente')
      asset.position=op.position; if(op.rotation!==undefined) asset.rotation=op.rotation
    } else {
      const asset=next.assets.find(a=>a.id===op.assetId); if(!asset) throw new Error('Móvel não encontrado')
      next.assets=next.assets.filter(a=>a.id!==op.assetId); next.rooms.find(r=>r.id===asset.roomId)!.assetIds=next.rooms.find(r=>r.id===asset.roomId)!.assetIds.filter(id=>id!==op.assetId)
    }
  }
  return documentSchema.parse(next)
}
