import OpenAI,{toFile} from 'openai'
import { put } from '@vercel/blob'
import { z } from 'zod'
import { db,readProject } from '@/lib/db'
import { reservePaid } from '@/lib/rate'
import { failure } from '@/lib/http'
export const runtime='nodejs'
export const maxDuration=60
const camera=z.object({position:z.object({x:z.number(),y:z.number(),z:z.number()}),direction:z.object({x:z.number(),y:z.number(),z:z.number()}),fov:z.number().positive()})
const input=z.object({mode:z.enum(['screenshot','metadata']).default('screenshot'),screenshot:z.string().optional(),camera})
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{
  if(!process.env.OPENAI_API_KEY)throw new Error('OPENAI_API_KEY não configurada')
  const id=(await params).id;const body=input.parse(await request.json());const current=await readProject(id)
  if(body.mode==='screenshot'&&(!body.screenshot?.startsWith('data:image/png;base64,')||body.screenshot.length>6_000_000))throw new Error('Screenshot PNG inválido ou grande demais')
  await reservePaid('render',5)
  const doc=current.document;const room=doc.rooms.find(r=>r.id===doc.camera.roomId)??doc.rooms[0]
  const context={room:room?{name:room.name,type:room.type,area:room.area,polygon:room.polygon}:null,camera:body.camera,site:doc.site,walls:doc.walls.map(w=>({start:w.start,end:w.end,height:w.height,thickness:w.thickness,color:w.color})),openings:doc.openings.map(o=>({type:o.type,center:o.center,width:o.width,height:o.height,sillHeight:o.sillHeight})),assets:doc.assets.map(a=>({name:a.name,position:a.position,rotation:a.rotation,color:a.color})),materials:doc.materials,preferences:doc.preferences,timeOfDay:doc.camera.timeOfDay}
  const prompt=`Fotografia arquitetônica realista da vista atual de uma casa. Preserve aproximadamente a perspectiva, distribuição espacial, paredes, posições de janelas, cores, materiais e móveis presentes. Não adicione móveis não solicitados. Iluminação natural e materiais realistas. Contexto estruturado: ${JSON.stringify(context)}`
  const client=new OpenAI();const model=process.env.OPENAI_IMAGE_MODEL??'gpt-image-1';const quality=(process.env.OPENAI_IMAGE_QUALITY??'medium') as 'low'|'medium'|'high'
  const jobId=crypto.randomUUID();await db()`INSERT INTO render_jobs(id,project_id,revision,mode,status,camera) VALUES(${jobId},${id},${current.baseRevision},${body.mode},'processing',${db().json(body.camera)})`
  try{
    const result=body.mode==='screenshot'?await client.images.edit({model,image:await toFile(Buffer.from(body.screenshot!.split(',')[1],'base64'),'scene.png',{type:'image/png'}),prompt,quality,size:'1536x1024'}):await client.images.generate({model,prompt,quality,size:'1536x1024'})
    const encoded=result.data?.[0]?.b64_json;if(!encoded)throw new Error('API não retornou imagem')
    const blob=await put(`renders/${id}/${jobId}.png`,Buffer.from(encoded,'base64'),{access:'private',contentType:'image/png'})
    await db()`UPDATE render_jobs SET status='finished',image_url=${blob.url} WHERE id=${jobId}`
    return Response.json({jobId,imageUrl:`/api/projects/${id}/render/${jobId}`})
  }catch(error){await db()`UPDATE render_jobs SET status='error',error=${error instanceof Error?error.message:String(error)} WHERE id=${jobId}`;throw error}
}catch(e){return failure(e)}}
