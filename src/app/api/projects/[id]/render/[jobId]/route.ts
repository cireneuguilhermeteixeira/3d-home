import { get } from '@vercel/blob'
import { db,ownedProject } from '@/lib/db'
import { failure } from '@/lib/http'
export const runtime='nodejs'
export async function GET(_:Request,{params}:{params:Promise<{id:string;jobId:string}>}){try{const {id,jobId}=await params;await ownedProject(id);const rows=await db()`SELECT image_url FROM render_jobs WHERE id=${jobId} AND project_id=${id} AND status='finished'`;if(!rows.length)throw new Error('Imagem não encontrada');const blob=await get(rows[0].image_url,{access:'private'});if(blob?.statusCode!==200)throw new Error('Imagem não encontrada');return new Response(blob.stream,{headers:{'Content-Type':'image/png','Content-Disposition':`inline; filename="forma-${jobId}.png"`}})}catch(e){return failure(e)}}
