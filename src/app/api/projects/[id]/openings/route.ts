import { readProject, writeDraft } from '@/lib/db'
import { loadDwgArchiveBytes, unpackDwgArchive, type DwgArchiveReference } from '@/lib/dwg-archive'
import { addBlockOpenings } from '@/lib/dwg'
import { projectDwgPlan } from '@/lib/dwg-plans'
import { failure } from '@/lib/http'

export const runtime='nodejs'

export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const id=(await params).id
    const current=await readProject(id)
    const document=current.document
    const archiveRef=document.metadata.dwgArchive as DwgArchiveReference|undefined
    const planId=document.metadata.dwgPlanId
    if(document.sourceCad.format!=='DWG'||!archiveRef||typeof planId!=='string')throw new Error('Planta DWG não disponível para recuperar esquadrias')
    if(document.metadata.dwgOpeningRecovery==='block-inserts-v1')return Response.json({document,draftVersion:current.draftVersion,baseRevision:current.baseRevision})
    const archive=unpackDwgArchive(await loadDwgArchiveBytes(id,archiveRef),archiveRef)
    addBlockOpenings(document,archive,planId,projectDwgPlan(archive,planId))
    const draftVersion=await writeDraft(id,document,current.draftVersion,current.baseRevision)
    return Response.json({document,draftVersion,baseRevision:current.baseRevision})
  }catch(error){return failure(error)}
}
