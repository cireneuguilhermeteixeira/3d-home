import { describe,it,expect } from 'vitest'
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import path from 'node:path'
import { DxfConverter } from '../src/lib/cad'
import { simpleDxf } from './fixture'

const enabled=!!process.env.TEST_BASE_URL&&!!process.env.DATABASE_URL
describe.skipIf(!enabled)('fluxo HTTP com PostGIS',()=>{
  it('envia DWG binário local, converte, persiste e recupera as coordenadas',async()=>{
    const sql=postgres(process.env.DATABASE_URL!);let id='',sessionId='',pathname=''
    try{
      const created=await fetch(`${process.env.TEST_BASE_URL}/api/projects`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Importação DWG local'})})
      expect(created.status).toBe(201)
      const cookie=created.headers.get('set-cookie')!.split(';')[0];sessionId=cookie.split('=')[1];id=(await created.json()).id
      pathname=`cad/${id}/${crypto.randomUUID()}-sample_2000.dwg`
      const form=new FormData();form.set('pathname',pathname);form.set('file',new File([readFileSync(new URL('./fixture-sample-2000.dwg',import.meta.url))],'sample_2000.dwg',{type:'image/vnd.dwg'}))
      const uploaded=await fetch(`${process.env.TEST_BASE_URL}/api/projects/${id}/upload`,{method:'POST',headers:{Cookie:cookie},body:form})
      expect(uploaded.ok,await uploaded.text()).toBe(true)
      const imported=await fetch(`${process.env.TEST_BASE_URL}/api/projects/${id}/import`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({pathname})})
      const result=await imported.json();expect(imported.ok,JSON.stringify(result)).toBe(true)
      expect(result.document.sourceCad.format).toBe('DWG')
      expect(result.document.sourceCad.rawEntities).toHaveLength(6)
      expect(result.document.sourceCad.rawEntities.find((entity:{type:string})=>entity.type==='CIRCLE').points[0].x).toBeCloseTo(.2196812627452187)
      const loaded=await fetch(`${process.env.TEST_BASE_URL}/api/projects/${id}`,{headers:{Cookie:cookie}}).then(response=>response.json())
      expect(loaded.document.sourceCad.rawEntities).toHaveLength(6)
      expect(loaded.document.sourceCad.fileId).toBeTruthy()
    }finally{
      if(id)await sql`DELETE FROM projects WHERE id=${id}`
      if(sessionId)await sql`DELETE FROM sessions WHERE id=${sessionId}`
      if(pathname)await unlink(path.join(process.cwd(),'.forma-local-files',pathname)).catch(()=>{})
      await sql.end()
    }
  },30_000)
  it.skipIf(!!process.env.BLOB_READ_WRITE_TOKEN || !!process.env.BLOB_STORE_ID)('explica a falta de conexão Blob',async()=>{
    const sql=postgres(process.env.DATABASE_URL!);let id='',sessionId=''
    try{
      const created=await fetch(`${process.env.TEST_BASE_URL}/api/projects`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Diagnóstico de upload'})})
      expect(created.status).toBe(201)
      const cookie=created.headers.get('set-cookie')!.split(';')[0];sessionId=cookie.split('=')[1];id=(await created.json()).id
      const response=await fetch(`${process.env.TEST_BASE_URL}/api/projects/${id}/upload`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({pathname:`cad/${id}/00000000-0000-4000-8000-000000000000-planta.dwg`,size:1024})})
      expect(response.status).toBe(503)
      expect((await response.json()).error).toContain('Vercel Blob não configurado')
    }finally{if(id)await sql`DELETE FROM projects WHERE id=${id}`;if(sessionId)await sql`DELETE FROM sessions WHERE id=${sessionId}`;await sql.end()}
  },30_000)
  it('cria a casa de demonstração editável e sincroniza a geometria espacial',async()=>{
    const sql=postgres(process.env.DATABASE_URL!);let id='',sessionId=''
    try{
      const response=await fetch(`${process.env.TEST_BASE_URL}/api/projects`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Demonstração HTTP',demo:true})})
      expect(response.status).toBe(201)
      const cookie=response.headers.get('set-cookie')!.split(';')[0];sessionId=cookie.split('=')[1]
      const created=await response.json();id=created.id
      expect(created.document.rooms).toHaveLength(8)
      expect(created.document.sourceCad.format).toBeNull()
      const rows=await sql`SELECT kind,count(*)::int AS count FROM spatial_elements WHERE project_id=${id} GROUP BY kind`
      expect(rows.find(r=>r.kind==='ROOM')?.count).toBe(8)
      expect(rows.find(r=>r.kind==='WALL')?.count).toBe(created.document.walls.length)
      const project=await fetch(`${process.env.TEST_BASE_URL}/api/projects/${id}`,{headers:{Cookie:cookie}}).then(r=>r.json())
      expect(project.document.assets).toHaveLength(2)
      const patch=await fetch(`${process.env.TEST_BASE_URL}/api/projects/${id}/draft`,{method:'PATCH',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({draftVersion:0,baseRevision:0,operations:[{type:'NAME_ROOM',roomId:'demo-room-1',name:'Sala personalizada',roomType:'LIVING_ROOM'}]})})
      expect(patch.ok).toBe(true)
      const save=await fetch(`${process.env.TEST_BASE_URL}/api/projects/${id}/save`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({expectedRevision:0})})
      expect(save.ok).toBe(true)
      const reloaded=await fetch(`${process.env.TEST_BASE_URL}/api/projects/${id}`,{headers:{Cookie:cookie}}).then(r=>r.json())
      expect(reloaded.document.rooms[0].name).toBe('Sala personalizada')
    }finally{if(id)await sql`DELETE FROM projects WHERE id=${id}`;if(sessionId)await sql`DELETE FROM sessions WHERE id=${sessionId}`;await sql.end()}
  },30_000)
  it('cria, edita, salva, recupera e restaura revisões',async()=>{
    const sql=postgres(process.env.DATABASE_URL!);let id='',sessionId=''
    try{
      const created=await fetch(`${process.env.TEST_BASE_URL}/api/projects`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Fluxo automatizado'})})
      expect(created.status).toBe(201);const cookie=created.headers.get('set-cookie')!.split(';')[0];sessionId=cookie.split('=')[1];id=(await created.json()).id
      const doc=new DxfConverter().convert(simpleDxf,id);doc.materials.porcelain={id:'porcelain',name:'Porcelanato cinza-claro',color:'#c7c9c5',unitPrice:null,supplierUrl:null}
      await sql`UPDATE project_drafts SET document=${sql.json(JSON.parse(JSON.stringify(doc)))} WHERE project_id=${id}`
      let version=0,revision=0
      const api=async(path:string,method:string,body?:unknown)=>{const response=await fetch(`${process.env.TEST_BASE_URL}/api/projects/${id}${path}`,{method,headers:{'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});const result=await response.json();expect(response.ok,JSON.stringify(result)).toBe(true);return result}
      let result=await api('/draft','PATCH',{draftVersion:version,baseRevision:revision,operations:[{type:'NAME_ROOM',roomId:'room-R1',name:'Cozinha',roomType:'KITCHEN'},{type:'SET_WALL_COLOR',wallId:doc.walls[0].id,color:'#A3AC97'},{type:'SET_FLOOR_MATERIAL',roomId:'room-R1',materialId:'porcelain'}]});version=result.draftVersion
      expect(result.document.walls[0].color).toBe('#A3AC97');expect(result.document.rooms[0].floorMaterialId).toBe('porcelain')
      result=await api('/save','POST',{expectedRevision:revision});revision=result.revision;version=result.draftVersion;expect(revision).toBe(1)
      result=await api('','GET');expect(result.document.walls[0].color).toBe('#A3AC97')
      const csv=await fetch(`${process.env.TEST_BASE_URL}/api/projects/${id}/budget`,{headers:{Cookie:cookie}})
      expect(csv.ok).toBe(true)
      expect(csv.headers.get('content-type')).toContain('text/csv')
      expect(await csv.text()).toContain('Porcelanato cinza-claro')
      const assetId=crypto.randomUUID();result=await api('/draft','PATCH',{draftVersion:version,baseRevision:revision,operations:[{type:'ADD_ASSET',assetId,roomId:'room-R1',catalogId:'chair',position:{x:2,y:0,z:2}},{type:'MOVE_ASSET',assetId,position:{x:2.2,y:0,z:2},rotation:1.2}]});version=result.draftVersion
      result=await api('/save','POST',{expectedRevision:revision});revision=result.revision;version=result.draftVersion;expect(revision).toBe(2)
      result=await api('','GET');expect(result.document.assets[0].position.x).toBe(2.2);expect(result.document.assets[0].rotation).toBe(1.2)
      result=await api('/revisions','POST',{revision:1});version=result.draftVersion;expect(result.document.assets).toHaveLength(0)
      result=await api('/save','POST',{expectedRevision:2});expect(result.revision).toBe(3)
      result=await api('','GET');expect(result.document.assets).toHaveLength(0);expect(result.document.walls[0].color).toBe('#A3AC97')
      const spatial=await sql`SELECT count(*)::int AS count FROM spatial_elements WHERE project_id=${id}`;expect(spatial[0].count).toBeGreaterThan(0)
    }finally{if(id)await sql`DELETE FROM projects WHERE id=${id}`;if(sessionId)await sql`DELETE FROM sessions WHERE id=${sessionId}`;await sql.end()}
  },30_000)
})
