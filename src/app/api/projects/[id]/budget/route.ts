import { readProject } from '@/lib/db'
import { budget,csv } from '@/lib/budget'
import { failure } from '@/lib/http'
export const runtime='nodejs'
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){try{const id=(await params).id;const rows=budget((await readProject(id)).document);return new Response(csv(rows),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="forma-${id}.csv"`}})}catch(e){return failure(e)}}
