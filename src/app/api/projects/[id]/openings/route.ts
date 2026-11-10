import { readProject, writeDraft } from '@/lib/db'
import { loadDwgArchiveBytes, unpackDwgArchive, type DwgArchiveReference } from '@/lib/dwg-archive'
import { addBlockOpenings } from '@/lib/dwg'
import { projectDwgPlan } from '@/lib/dwg-plans'
import { applyDwgWallHeights, integrateDwgOpeningsIntoWalls } from '@/lib/dwg-walls'
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
    if(document.metadata.dwgOpeningRecovery==='wall-openings-v2')return Response.json({document,draftVersion:current.draftVersion,baseRevision:current.baseRevision})
    const archive=unpackDwgArchive(await loadDwgArchiveBytes(id,archiveRef),archiveRef)
    const oldIds=new Set(document.openings.filter(opening=>opening.properties.association==='DWG_BLOCK').map(opening=>opening.id))
    document.openings=document.openings.filter(opening=>!oldIds.has(opening.id))
    for(const wall of document.walls)wall.openingIds=wall.openingIds.filter(openingId=>!oldIds.has(openingId))
    applyDwgWallHeights(document,archive)
    addBlockOpenings(document,archive,planId,projectDwgPlan(archive,planId))
    integrateDwgOpeningsIntoWalls(document)
    document.metadata.dwgOpeningRecovery='wall-openings-v2'
    const draftVersion=await writeDraft(id,document,current.draftVersion,current.baseRevision)
    return Response.json({document,draftVersion,baseRevision:current.baseRevision})
  }catch(error){return failure(error)}
}
