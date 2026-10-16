'use client'
import { create } from 'zustand'
import { applyOperations, type Operation } from '../lib/operations'
import type { ProjectDocument } from '../lib/model'

type Selection = { kind:'WALL'|'ROOM'|'ASSET'; id:string } | null
type History = { forward:Operation; backward:Operation }
type Mode = 'cad'|'3d'|'walk'
type State = {
  document:ProjectDocument|null
  draftVersion:number
  baseRevision:number
  pending:Operation[]
  undo:History[]
  redo:History[]
  selected:Selection
  mode:Mode
  saved:boolean
  error:string
  load:(document:ProjectDocument,draftVersion:number,baseRevision:number)=>void
  apply:(op:Operation)=>void
  acceptRemote:(ops:Operation[],document:ProjectDocument,draftVersion:number)=>void
  undoAction:()=>void
  redoAction:()=>void
  ack:(count:number,draftVersion:number)=>void
  select:(selected:Selection)=>void
  setMode:(mode:Mode)=>void
  setError:(error:string)=>void
  markSaved:(revision:number,draftVersion:number)=>void
}
function inverse(doc:ProjectDocument,op:Operation):Operation {
  if(op.type==='ADD_ROOM_FROM_ENTITY')return {type:'REMOVE_ROOM',roomId:`room-${op.entityId}`}
  if(op.type==='REMOVE_ROOM'){const r=doc.rooms.find(r=>r.id===op.roomId)!;return {type:'ADD_ROOM_FROM_ENTITY',entityId:r.sourceEntityIds[0]}}
  if(op.type==='NAME_ROOM'){const r=doc.rooms.find(r=>r.id===op.roomId)!;return {type:'NAME_ROOM',roomId:r.id,name:r.name,roomType:r.type}}
  if(op.type==='SET_WALL_COLOR'){const w=doc.walls.find(w=>w.id===op.wallId)!;return {type:'SET_WALL_COLOR',wallId:w.id,color:w.color}}
  if(op.type==='SET_FLOOR_MATERIAL'){const r=doc.rooms.find(r=>r.id===op.roomId)!;return {type:'SET_FLOOR_MATERIAL',roomId:r.id,materialId:r.floorMaterialId}}
  if(op.type==='ADD_ASSET')return {type:'REMOVE_ASSET',assetId:op.assetId}
  if(op.type==='RESTORE_ASSET')return {type:'REMOVE_ASSET',assetId:op.asset.id}
  if(op.type==='MOVE_ASSET'){const a=doc.assets.find(a=>a.id===op.assetId)!;return {type:'MOVE_ASSET',assetId:a.id,position:a.position,rotation:a.rotation}}
  return {type:'RESTORE_ASSET',asset:doc.assets.find(a=>a.id===op.assetId)!}
}
export const useEditor=create<State>((set,get)=>({
  document:null,draftVersion:0,baseRevision:0,pending:[],undo:[],redo:[],selected:null,mode:'cad',saved:true,error:'',
  load:(document,draftVersion,baseRevision)=>set({document,draftVersion,baseRevision,pending:[],undo:[],redo:[],selected:null,mode:'cad',saved:true,error:''}),
  apply:(op)=>{
    const old=get().document;if(!old)return
    try{
      const backward=inverse(old,op),document=applyOperations(old,[op])
      set(s=>({document,pending:[...s.pending,op],undo:[...s.undo,{forward:op,backward}],redo:[],saved:false,error:''}))
    }catch(e){set({error:e instanceof Error?e.message:'Operação inválida'})}
  },
  acceptRemote:(ops,document,draftVersion)=>{
    let local=get().document
    if(!local)throw new Error('Projeto não carregado')
    if(get().pending.length)throw new Error('Rascunho local ainda não sincronizado')
    const history:History[]=[]
    for(const op of ops){
      const backward=inverse(local,op)
      local=applyOperations(local,[op])
      history.push({forward:op,backward})
    }
    if(JSON.stringify(local)!==JSON.stringify(document))throw new Error('A resposta da IA difere do rascunho local; recarregue o projeto')
    set(s=>({document,draftVersion,undo:[...s.undo,...history],redo:[],saved:false,error:''}))
  },
  undoAction:()=>{
    const s=get();if(!s.undo.length||!s.document)return
    const entry=s.undo.at(-1)!
    try{const document=applyOperations(s.document,[entry.backward]);set({document,pending:[...s.pending,entry.backward],undo:s.undo.slice(0,-1),redo:[...s.redo,entry],saved:false})}
    catch(e){set({error:String(e)})}
  },
  redoAction:()=>{
    const s=get();if(!s.redo.length||!s.document)return
    const entry=s.redo.at(-1)!
    try{const document=applyOperations(s.document,[entry.forward]);set({document,pending:[...s.pending,entry.forward],redo:s.redo.slice(0,-1),undo:[...s.undo,entry],saved:false})}
    catch(e){set({error:String(e)})}
  },
  ack:(count,draftVersion)=>set(s=>({draftVersion,pending:s.pending.slice(count),error:''})),
  select:(selected)=>set({selected}),setMode:(mode)=>set({mode}),setError:(error)=>set({error}),
  markSaved:(revision,draftVersion)=>set(s=>({baseRevision:revision,draftVersion,document:s.document?{...s.document,revision}:null,saved:true}))
}))
