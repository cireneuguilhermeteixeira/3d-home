import { handleUpload,type HandleUploadBody } from '@vercel/blob/client'
import { ownedProject } from '@/lib/db'
import { failure } from '@/lib/http'
export const runtime='nodejs'
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{
  const id=(await params).id;await ownedProject(id)
  const body=await request.json() as HandleUploadBody
  const result=await handleUpload({body,request,onBeforeGenerateToken:async pathname=>{
    if(!pathname.startsWith(`cad/${id}/`)||!/.+\.(dwg|dxf)$/i.test(pathname))throw new Error('Nome de arquivo inválido')
    return {allowedContentTypes:['application/octet-stream','application/acad','application/dxf','image/vnd.dwg','application/x-dxf'],maximumSizeInBytes:50*1024*1024,addRandomSuffix:true}
  },onUploadCompleted:async()=>{}})
  return Response.json(result)
}catch(e){return failure(e)}}
