import { db,ownedProject,readProject } from '@/lib/db'
import { failure } from '@/lib/http'
export const runtime='nodejs'
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){try{const id=(await params).id;await ownedProject(id);const rows=await db()`SELECT revision,created_at FROM project_revisions WHERE project_id=${id} ORDER BY revision DESC`;return Response.json({revisions:rows})}catch(e){return failure(e)}}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{
  const id=(await params).id;const revision=Number((await request.json()).revision);if(!Number.isInteger(revision)||revision<1) throw new Error('Revisão inválida')
  const current=await readProject(id);const rows=await db()`SELECT document FROM project_revisions WHERE project_id=${id} AND revision=${revision}`;if(!rows.length) throw new Error('Revisão não encontrada')
  const document={...rows[0].document,revision:current.baseRevision};const version=await (await import('@/lib/db')).writeDraft(id,document,current.draftVersion,current.baseRevision)
  return Response.json({document,draftVersion:version,baseRevision:current.baseRevision})
}catch(e){return failure(e)}}
