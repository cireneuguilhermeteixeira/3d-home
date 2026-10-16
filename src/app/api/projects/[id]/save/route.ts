import { z } from 'zod'
import { saveProject } from '@/lib/db'
import { failure } from '@/lib/http'
export const runtime='nodejs'
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{const {expectedRevision}=z.object({expectedRevision:z.number().int().nonnegative()}).parse(await request.json());return Response.json(await saveProject((await params).id,expectedRevision))}catch(e){return failure(e)}}
