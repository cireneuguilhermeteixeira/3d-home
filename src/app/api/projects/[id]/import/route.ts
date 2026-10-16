import { get,head,put } from '@vercel/blob'
import { z } from 'zod'
import { db,readProject,writeDraft } from '@/lib/db'
import { DxfConverter } from '@/lib/cad'
import { conversionStatus,startDwgConversion } from '@/lib/cloudconvert'
import { failure } from '@/lib/http'
export const runtime='nodejs'
const input=z.object({pathname:z.string().optional(),fileId:z.string().uuid().optional(),jobId:z.string().uuid().optional(),reference:z.object({entityId:z.string(),lengthMeters:z.number().positive()}).optional()})
async function finish(id:string,fileId:string,text:string,format:'DWG'|'DXF',reference?:{entityId:string;lengthMeters:number}){
  const current=await readProject(id);const imported=new DxfConverter().convert(text,id,reference)
  imported.preferences=current.document.preferences;imported.materials=current.document.materials;imported.sourceCad.fileId=fileId;imported.sourceCad.format=format
  const version=await writeDraft(id,imported,current.draftVersion,current.baseRevision,true)
  return {status:imported.coordinateSystem.calibrationStatus,document:imported,draftVersion:version,baseRevision:current.baseRevision}
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{
  const id=(await params).id;const body=input.parse(await request.json());await readProject(id)
  if(body.fileId){const rows=await db()`SELECT pathname,format FROM project_files WHERE id=${body.fileId} AND project_id=${id}`;if(!rows.length)throw new Error('Arquivo não encontrado');if(rows[0].format==='DWG'){const job=await db()`SELECT id FROM conversion_jobs WHERE file_id=${body.fileId} ORDER BY created_at DESC LIMIT 1`;if(!job.length)throw new Error('Conversão DWG não encontrada');body.jobId=job[0].id}else body.pathname=rows[0].pathname}
  if(body.jobId){
    const jobs=await db()`SELECT provider_job_id,file_id,status FROM conversion_jobs WHERE id=${body.jobId} AND project_id=${id}`;if(!jobs.length)throw new Error('Conversão não encontrada')
    const job=await conversionStatus(jobs[0].provider_job_id)
    if(job.status==='error')throw new Error('Falha na conversão DWG')
    if(job.status!=='finished')return Response.json({status:'PROCESSING',jobId:body.jobId})
    const file=job.tasks.find(t=>t.name==='export')?.result?.files?.[0];if(!file)throw new Error('DXF convertido indisponível')
    const dxfResponse=await fetch(file.url);if(!dxfResponse.ok)throw new Error('Falha ao obter DXF convertido')
    const dxf=await dxfResponse.text();const result=await finish(id,jobs[0].file_id,dxf,'DWG',body.reference)
    await db()`UPDATE conversion_jobs SET status='finished' WHERE id=${body.jobId}`
    return Response.json(result)
  }
  if(!body.pathname||!body.pathname.startsWith(`cad/${id}/`))throw new Error('Arquivo não pertence ao projeto')
  const format=body.pathname.toLowerCase().endsWith('.dwg')?'DWG':body.pathname.toLowerCase().endsWith('.dxf')?'DXF':null;if(!format)throw new Error('Formato inválido')
  const meta=await head(body.pathname);if(meta.size>50*1024*1024)throw new Error('Arquivo excede 50 MB')
  const fileId=body.fileId??crypto.randomUUID();if(!body.fileId)await db()`INSERT INTO project_files(id,project_id,pathname,url,format,size_bytes) VALUES(${fileId},${id},${body.pathname},${meta.url},${format},${meta.size})`
  if(format==='DWG'){
    const job=await startDwgConversion(fileId);const jobId=crypto.randomUUID()
    await db()`INSERT INTO conversion_jobs(id,project_id,file_id,provider_job_id,status) VALUES(${jobId},${id},${fileId},${job.id},${job.status})`
    return Response.json({status:'PROCESSING',jobId})
  }
  const blob=await get(body.pathname,{access:'private'});if(blob?.statusCode!==200)throw new Error('Arquivo não encontrado no armazenamento')
  const text=await new Response(blob.stream).text();return Response.json(await finish(id,fileId,text,'DXF',body.reference))
}catch(e){return failure(e)}}
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){try{const id=(await params).id;await readProject(id);const files=await db()`SELECT f.id,f.pathname,f.format,j.id AS job_id,j.status FROM project_files f LEFT JOIN conversion_jobs j ON j.file_id=f.id WHERE f.project_id=${id} ORDER BY f.created_at DESC LIMIT 1`;return Response.json({latestFile:files[0]??null})}catch(e){return failure(e)}}
