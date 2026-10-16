import postgres from 'postgres'
import { cookies } from 'next/headers'
import { documentSchema, type ProjectDocument } from './model'

const url=process.env.DATABASE_URL
export const sql=url ? postgres(url,{max:5,prepare:false}) : null
export const serializable=(value:unknown):postgres.JSONValue=>JSON.parse(JSON.stringify(value))
export function db(){if(!sql) throw new Error('DATABASE_URL não configurada');return sql}

export async function session(create=false) {
  const jar=await cookies(); let id=jar.get('forma_session')?.value
  if(id && !/^[0-9a-f-]{36}$/.test(id)) id=undefined
  if(id) { const rows=await db()`SELECT id FROM sessions WHERE id=${id}`; if(rows.length) return id }
  if(!create) throw new Error('Sessão de projeto ausente')
  id=crypto.randomUUID(); await db()`INSERT INTO sessions(id) VALUES(${id})`
  jar.set('forma_session',id,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:60*60*24*365})
  return id
}
export async function ownedProject(id:string) {
  const owner=await session(); const rows=await db()`SELECT id,name,revision FROM projects WHERE id=${id} AND owner_session_id=${owner}`
  if(!rows.length) throw new Error('Projeto não encontrado')
  return rows[0] as {id:string;name:string;revision:number}
}
export async function readProject(id:string){
  const project=await ownedProject(id)
  const rows=await db()`SELECT document,base_revision,draft_version FROM project_drafts WHERE project_id=${id}`
  return {project,document:documentSchema.parse(rows[0].document),baseRevision:Number(rows[0].base_revision),draftVersion:Number(rows[0].draft_version)}
}
export async function writeDraft(id:string, document:ProjectDocument, expectedVersion:number, baseRevision:number, syncRaw=false) {
  await ownedProject(id)
  const valid=documentSchema.parse(document)
  return db().begin(async tx=>{
    const rows=await tx`UPDATE project_drafts SET document=${tx.json(serializable(valid))},draft_version=draft_version+1,updated_at=now() WHERE project_id=${id} AND draft_version=${expectedVersion} AND base_revision=${baseRevision} RETURNING draft_version`
    if(!rows.length) throw new Error('Conflito: o rascunho mudou em outra sessão. Recarregue o projeto.')
    await syncSpatial(tx,id,valid,syncRaw)
    return Number(rows[0].draft_version)
  })
}
type Transaction=postgres.TransactionSql
async function syncSpatial(tx:Transaction,id:string,doc:ProjectDocument,syncRaw:boolean){
  if(syncRaw){await tx`DELETE FROM cad_entities WHERE project_id=${id}`
  for(const entity of doc.sourceCad.rawEntities){
    const wkt=entity.points.length>1?`LINESTRING(${entity.points.map(p=>`${p.x} ${p.y}`).join(',')})`:entity.points.length===1?`POINT(${entity.points[0].x} ${entity.points[0].y})`:null
    if(wkt) await tx`INSERT INTO cad_entities(project_id,entity_id,raw,geom) VALUES(${id},${entity.id},${tx.json(serializable(entity))},ST_GeomFromText(${wkt},0))`
    else await tx`INSERT INTO cad_entities(project_id,entity_id,raw) VALUES(${id},${entity.id},${tx.json(serializable(entity))})`
  }}
  await tx`DELETE FROM spatial_elements WHERE project_id=${id}`
  for(const wall of doc.walls){
    const wkt=`LINESTRING(${wall.start.x} ${wall.start.y},${wall.end.x} ${wall.end.y})`
    await tx`INSERT INTO spatial_elements(project_id,element_id,kind,geom) VALUES(${id},${wall.id},'WALL',ST_GeomFromText(${wkt},0))`
  }
  for(const room of doc.rooms) if(room.polygon.length>=3){
    const pts=[...room.polygon,room.polygon[0]]; const wkt=`POLYGON((${pts.map(p=>`${p.x} ${p.y}`).join(',')}))`
    await tx`INSERT INTO spatial_elements(project_id,element_id,kind,geom) VALUES(${id},${room.id},'ROOM',ST_GeomFromText(${wkt},0))`
  }
}
export async function saveProject(id:string, expectedRevision:number){
  await ownedProject(id)
  return db().begin(async tx=>{
    const rows=await tx`SELECT document,base_revision FROM project_drafts WHERE project_id=${id} FOR UPDATE`
    if(Number(rows[0].base_revision)!==expectedRevision) throw new Error('Conflito de revisão. Recarregue o projeto.')
    const next=expectedRevision+1; const doc=documentSchema.parse(rows[0].document); doc.revision=next
    const updated=await tx`UPDATE projects SET revision=${next},updated_at=now() WHERE id=${id} AND revision=${expectedRevision} RETURNING revision`
    if(!updated.length) throw new Error('Conflito de revisão. Recarregue o projeto.')
    await tx`INSERT INTO project_revisions(project_id,revision,document) VALUES(${id},${next},${tx.json(serializable(doc))})`
    const draft=await tx`UPDATE project_drafts SET document=${tx.json(serializable(doc))},base_revision=${next},draft_version=draft_version+1 WHERE project_id=${id} RETURNING draft_version`
    return {revision:next,draftVersion:Number(draft[0].draft_version),document:doc}
  })
}
