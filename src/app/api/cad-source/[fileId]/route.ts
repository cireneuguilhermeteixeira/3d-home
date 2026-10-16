import { get } from '@vercel/blob'
import { db } from '@/lib/db'
import { verifySource } from '@/lib/cloudconvert'
export const runtime='nodejs'
export async function GET(request:Request,{params}:{params:Promise<{fileId:string}>}){
  const {fileId}=await params;const url=new URL(request.url);if(!verifySource(fileId,url.searchParams.get('exp')??'',url.searchParams.get('sig')??''))return new Response('Forbidden',{status:403})
  const rows=await db()`SELECT pathname FROM project_files WHERE id=${fileId} AND format='DWG'`;if(!rows.length)return new Response('Not found',{status:404})
  const result=await get(rows[0].pathname,{access:'private'});if(result?.statusCode!==200)return new Response('Not found',{status:404})
  return new Response(result.stream,{headers:{'Content-Type':'application/acad','Content-Disposition':'attachment; filename="floorplan.dwg"'}})
}
