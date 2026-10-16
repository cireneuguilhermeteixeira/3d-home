import { describe,it,expect } from 'vitest'
import postgres from 'postgres'
import { DxfConverter } from '../src/lib/cad'
import { simpleDxf } from './fixture'

const enabled=!!process.env.TEST_BASE_URL&&!!process.env.DATABASE_URL
describe.skipIf(!enabled)('fluxo HTTP com PostGIS',()=>{
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
