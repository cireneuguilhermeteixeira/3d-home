import { readProject } from '@/lib/db'
import { failure } from '@/lib/http'
export const runtime='nodejs'
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){try{return Response.json(await readProject((await params).id))}catch(e){return failure(e)}}
