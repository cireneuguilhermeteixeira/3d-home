import OpenAI from 'openai'
import { z } from 'zod'
import { readProject,writeDraft } from '@/lib/db'
import { applyOperations, catalog, operation, type Operation } from '@/lib/operations'
import { reservePaid } from '@/lib/rate'
import { failure } from '@/lib/http'
export const runtime='nodejs'
const input=z.object({message:z.string().min(2).max(1000),selectedRoomId:z.string().nullable().optional(),selectedElementId:z.string().nullable().optional(),draftVersion:z.number().int(),baseRevision:z.number().int()})
const field={type:['string','null']} as const
const schema={type:'object',additionalProperties:false,properties:{clarification:{type:['string','null']},operations:{type:'array',items:{type:'object',additionalProperties:false,properties:{type:{type:'string',enum:['SET_WALL_COLOR','SET_FLOOR_MATERIAL','ADD_ASSET','MOVE_ASSET','REMOVE_ASSET']},targetId:field,roomId:field,catalogId:field,color:field,materialId:field,x:{type:['number','null']},y:{type:['number','null']},z:{type:['number','null']},rotation:{type:['number','null']}},required:['type','targetId','roomId','catalogId','color','materialId','x','y','z','rotation']}}},required:['clarification','operations']} as const
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{
  if(!process.env.OPENAI_API_KEY)throw new Error('OPENAI_API_KEY não configurada')
  const id=(await params).id;const body=input.parse(await request.json());const current=await readProject(id)
  if(current.draftVersion!==body.draftVersion||current.baseRevision!==body.baseRevision)throw new Error('Conflito de rascunho')
  await reservePaid('ai',30)
  const room=current.document.rooms.find(r=>r.id===body.selectedRoomId)??null
  const selectedWall=current.document.walls.find(w=>w.id===body.selectedElementId)??null
  const selectedAsset=current.document.assets.find(a=>a.id===body.selectedElementId)??null
  const context={preferences:current.document.preferences,room:room?{id:room.id,name:room.name,type:room.type,polygon:room.polygon,floorMaterialId:room.floorMaterialId}:null,selectedWall:selectedWall?{id:selectedWall.id,color:selectedWall.color}:null,selectedAsset:selectedAsset?{id:selectedAsset.id,name:selectedAsset.name,position:selectedAsset.position}:null,nearbyAssets:current.document.assets.filter(a=>a.roomId===room?.id).map(a=>({id:a.id,name:a.name,position:a.position})),roomIds:current.document.rooms.map(r=>({id:r.id,name:r.name,type:r.type})),materials:Object.values(current.document.materials).map(m=>({id:m.id,name:m.name})),catalog:catalog.map(a=>({id:a.id,name:a.name}))}
  const client=new OpenAI();const response=await client.responses.create({model:process.env.OPENAI_TEXT_MODEL??'gpt-4.1-mini',instructions:'Interprete comandos de decoração em português. Use exclusivamente IDs presentes no contexto. Não altere geometria. Se a referência for ambígua ou falta posição, peça esclarecimento em clarification e retorne operations vazia. Para ADD_ASSET escolha catálogo existente e posição dentro do polígono do ambiente. Retorne somente operações necessárias.',input:JSON.stringify({message:body.message,context}),text:{format:{type:'json_schema',name:'design_operations',strict:true,schema}}})
  const parsed=JSON.parse(response.output_text) as {clarification:string|null;operations:Record<string,unknown>[]}
  if(parsed.clarification)return Response.json({clarification:parsed.clarification,operations:[]})
  const ops:Operation[]=parsed.operations.map(raw=>{
    if(raw.type==='SET_WALL_COLOR')return operation.parse({type:raw.type,wallId:raw.targetId,color:raw.color})
    if(raw.type==='SET_FLOOR_MATERIAL')return operation.parse({type:raw.type,roomId:raw.roomId,materialId:raw.materialId})
    if(raw.type==='ADD_ASSET')return operation.parse({type:raw.type,assetId:crypto.randomUUID(),roomId:raw.roomId,catalogId:raw.catalogId,position:{x:raw.x,y:raw.y,z:raw.z}})
    if(raw.type==='MOVE_ASSET')return operation.parse({type:raw.type,assetId:raw.targetId,position:{x:raw.x,y:raw.y,z:raw.z},rotation:raw.rotation??undefined})
    return operation.parse({type:raw.type,assetId:raw.targetId})
  })
  if(!ops.length)return Response.json({clarification:'Descreva a alteração desejada com mais detalhes.',operations:[]})
  const updated=applyOperations(current.document,ops);const draftVersion=await writeDraft(id,updated,current.draftVersion,current.baseRevision)
  return Response.json({operations:ops,document:updated,draftVersion,baseRevision:current.baseRevision})
}catch(e){return failure(e)}}
