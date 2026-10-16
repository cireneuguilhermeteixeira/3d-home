import { z } from 'zod'
import { readProject, writeDraft } from '@/lib/db'
import { documentSchema } from '@/lib/model'
import { operation, applyOperations } from '@/lib/operations'
import { failure } from '@/lib/http'
export const runtime='nodejs'
const input=z.object({draftVersion:z.number().int(),baseRevision:z.number().int(),operations:z.array(operation).min(1).max(20)})
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){try{
  const id=(await params).id;const body=input.parse(await request.json());const current=await readProject(id)
  if(current.draftVersion!==body.draftVersion||current.baseRevision!==body.baseRevision) throw new Error('Conflito: o rascunho mudou em outra sessão. Recarregue o projeto.')
  const updated=documentSchema.parse(applyOperations(current.document,body.operations))
  const draftVersion=await writeDraft(id,updated,body.draftVersion,body.baseRevision)
  return Response.json({document:updated,draftVersion,baseRevision:body.baseRevision})
}catch(e){return failure(e)}}
