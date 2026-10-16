import { z } from 'zod'
import { db, session, serializable } from '@/lib/db'
import { emptyDocument } from '@/lib/model'
import { failure } from '@/lib/http'
export const runtime='nodejs'
const input=z.object({name:z.string().min(1).max(100).default('Minha casa'),preferences:z.object({styles:z.array(z.string()),features:z.array(z.string()),brief:z.string()}).optional()})
export async function POST(request:Request){try{
  const body=input.parse(await request.json()); const owner=await session(true); const id=crypto.randomUUID(); const doc=emptyDocument(id,body.preferences)
  await db().begin(async tx=>{await tx`INSERT INTO projects(id,owner_session_id,name) VALUES(${id},${owner},${body.name})`;await tx`INSERT INTO project_drafts(project_id,document,base_revision) VALUES(${id},${tx.json(serializable(doc))},0)`})
  return Response.json({id,document:doc},{status:201})
}catch(e){return failure(e)}}
export async function GET(){try{const owner=await session();const rows=await db()`SELECT id,name,revision,updated_at FROM projects WHERE owner_session_id=${owner} ORDER BY updated_at DESC`;return Response.json({projects:rows})}catch(e){return failure(e)}}
