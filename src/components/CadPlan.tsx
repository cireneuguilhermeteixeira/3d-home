'use client'
import type { ProjectDocument } from '@/lib/model'
import { useEditor } from '@/stores/editor-store'
import Icon from './PrototypeIcon'
export default function CadPlan({document:doc}:{document:ProjectDocument}){
  const select=useEditor(s=>s.select),selected=useEditor(s=>s.selected),apply=useEditor(s=>s.apply)
  const points=[...doc.site.boundary,...doc.walls.flatMap(w=>[w.start,w.end]),...doc.rooms.flatMap(r=>r.polygon),...doc.sourceCad.rawEntities.flatMap(e=>e.points)]
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.min(...xs,0),minY=Math.min(...ys,0),maxX=Math.max(...xs,12),maxY=Math.max(...ys,12),spanX=Math.max(1,maxX-minX),spanY=Math.max(1,maxY-minY)
  const w=420,h=665,pad=33,scale=Math.min((w-2*pad)/spanX,(h-2*pad)/spanY),offsetX=(w-spanX*scale)/2,offsetY=(h-spanY*scale)/2
  const x=(v:number)=>offsetX+(v-minX)*scale,y=(v:number)=>offsetY+(v-minY)*scale
  const palette=['#dfe9de','#e8e5db','#e2e9ef','#e8e1ec','#e9e6dc','#e0e9e4','#e4eadf','#f0f2ed']
  const path=(pts:{x:number;y:number}[])=>pts.map((p,i)=>`${i?'L':'M'}${x(p.x)} ${y(p.y)}`).join(' ')+' Z'
  return <div className="cad-canvas"><div className="cad-paper"><svg className="cad-svg" viewBox="0 0 420 665" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={`Planta com ${doc.rooms.length} ambientes`}><defs><pattern id="fineGrid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#c4d1c6" strokeWidth=".35"/></pattern></defs><rect width="420" height="665" fill="url(#fineGrid)"/>
    {doc.rooms.map((r,i)=><path key={r.id} d={path(r.polygon)} fill={palette[i%palette.length]} fillOpacity=".78" stroke={selected?.id===r.id?'#5d986a':'none'} strokeWidth="3" onClick={()=>select({kind:'ROOM',id:r.id})} style={{cursor:'pointer'}}/>)}
    {doc.sourceCad.rawEntities.filter(e=>e.points.length>=3&&(e.original.closed||e.original.shape)&&!doc.rooms.some(r=>r.sourceEntityIds.includes(e.id))).map(e=><path key={e.id} d={path(e.points)} fill="#a8c9ab" fillOpacity=".15" stroke="#779a7b" strokeDasharray="4 3" onClick={()=>apply({type:'ADD_ROOM_FROM_ENTITY',entityId:e.id})} style={{cursor:'pointer'}}/>)}
    {doc.sourceCad.rawEntities.filter(e=>e.points.length>=2&&!doc.walls.some(w=>w.sourceEntityIds.includes(e.id))).map(e=><path key={e.id} d={e.points.map((p,i)=>`${i?'L':'M'}${x(p.x)} ${y(p.y)}`).join(' ')} fill="none" stroke="#7b9185" strokeWidth="1"/>)}
    {doc.walls.map(w=><line key={w.id} x1={x(w.start.x)} y1={y(w.start.y)} x2={x(w.end.x)} y2={y(w.end.y)} stroke={selected?.id===w.id?'#446f51':'#54645d'} strokeWidth={Math.max(3,w.thickness*scale)} strokeLinecap="square" onClick={()=>select({kind:'WALL',id:w.id})} style={{cursor:'pointer'}}/>)}
    {doc.openings.map(o=>o.wallId&&o.width&&o.positionAlongWall!==null&&(()=>{const wall=doc.walls.find(w=>w.id===o.wallId);if(!wall)return null;const len=Math.hypot(wall.end.x-wall.start.x,wall.end.y-wall.start.y);const unitX=(wall.end.x-wall.start.x)/len,unitY=(wall.end.y-wall.start.y)/len;return <line key={o.id} x1={x(o.center.x-unitX*o.width/2)} y1={y(o.center.y-unitY*o.width/2)} x2={x(o.center.x+unitX*o.width/2)} y2={y(o.center.y+unitY*o.width/2)} stroke={o.type==='WINDOW'?'#6fa5ad':'#fcfcf9'} strokeWidth={Math.max(5,wall.thickness*scale+2)}/>})())}
    <g className="room-map-labels" fontFamily="DM Sans, sans-serif" textAnchor="middle" fill="#62736a" fontSize="9.5" fontWeight="700">{doc.rooms.map((r,i)=><text key={r.id} x={x(r.center.x)} y={y(r.center.y)} onClick={()=>select({kind:'ROOM',id:r.id})} style={{cursor:'pointer'}}>{r.name==='Ambiente sem nome'?`AMBIENTE ${String(i+1).padStart(2,'0')}`:r.name.toUpperCase()}</text>)}</g>
    <g fill="#83958b" fontSize="10" fontFamily="DM Sans, sans-serif"><text x="210" y="660" textAnchor="middle">{spanX.toFixed(1)} METROS</text></g></svg></div><div className="cad-overlay-hint"><Icon name="pin"/> Selecione um ambiente ou uma parede</div><div className="canvas-bottom-note">{doc.metadata.demo?'PLANTA DEMONSTRATIVA · EDITÁVEL':'PLANTA IMPORTADA · EDITÁVEL'}</div></div>
}
