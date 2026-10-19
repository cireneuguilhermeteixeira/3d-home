import DxfParser from 'dxf-parser'
import type { ProjectDocument,Point } from './model'
import { documentSchema } from './model'

export interface CadConverter<T=string> { convert(input:T, projectId:string, reference?:{entityId:string;lengthMeters:number}):ProjectDocument|Promise<ProjectDocument> }
export type CadRawEntity={handle?:string;type:string;layer?:string;vertices?:{x:number;y:number;z?:number}[];start?:{x:number;y:number};end?:{x:number;y:number};startPoint?:{x:number;y:number};position?:{x:number;y:number};center?:{x:number;y:number};radius?:number;startAngle?:number;endAngle?:number;text?:string;closed?:boolean;shape?:boolean;originalCad?:Record<string,unknown>;[key:string]:unknown}
type Raw=CadRawEntity
const unitMeters:Record<number,number>={1:0.0254,2:0.3048,4:0.001,5:0.01,6:1,7:1000,10:0.9144,14:0.1}
const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y)
const p=(value:{x:number;y:number},factor:number):Point=>({x:value.x*factor,y:value.y*factor})
function points(e:Raw):Point[]{
  if(e.vertices?.length) return e.vertices.map(v=>({x:v.x,y:v.y}))
  if(e.start&&e.end) return [e.start,e.end]
  if(e.center&&e.radius){const start=e.type==='ARC'?Number(e.startAngle??0):0;const end=e.type==='ARC'?Number(e.endAngle??360):360;const out:Point[]=[];const steps=Math.max(16,Math.ceil(Math.abs(end-start)/8));for(let i=0;i<=steps;i++){const a=(start+(end-start)*i/steps)*Math.PI/180;out.push({x:e.center.x+e.radius*Math.cos(a),y:e.center.y+e.radius*Math.sin(a)})}return out}
  return e.position?[e.position]:e.startPoint?[e.startPoint]:[]
}
function wallFaces(entities:ProjectDocument['sourceCad']['rawEntities']){
  const faces:{id:string;layer:string;a:Point;b:Point}[]=[]
  for(const e of entities) if(/wall|parede|alvenaria|muro/i.test(e.layer??'')) for(let i=1;i<e.points.length;i++) if(dist(e.points[i-1],e.points[i])>=0.35) faces.push({id:e.id,layer:e.layer??'',a:e.points[i-1],b:e.points[i]})
  const matches:{i:number;j:number;score:number;thickness:number;a:Point;b:Point}[]=[]
  for(let i=0;i<faces.length;i++)for(let j=i+1;j<faces.length;j++){
    const a=faces[i],b=faces[j];if(a.layer!==b.layer)continue
    const al=dist(a.a,a.b),bl=dist(b.a,b.b),ux=(a.b.x-a.a.x)/al,uy=(a.b.y-a.a.y)/al,vx=(b.b.x-b.a.x)/bl,vy=(b.b.y-b.a.y)/bl
    if(Math.abs(ux*vx+uy*vy)<Math.cos(3*Math.PI/180))continue
    const cross=(v:Point)=>ux*(v.y-a.a.y)-uy*(v.x-a.a.x),o1=cross(b.a),o2=cross(b.b),thickness=(Math.abs(o1)+Math.abs(o2))/2
    if(o1*o2<=0||thickness<0.08||thickness>0.35||Math.abs(o1-o2)>Math.max(0.04,thickness*0.2))continue
    const proj=(v:Point)=>ux*(v.x-a.a.x)+uy*(v.y-a.a.y),lo=Math.min(proj(b.a),proj(b.b)),hi=Math.max(proj(b.a),proj(b.b)),start=Math.max(0,lo),end=Math.min(al,hi),overlap=end-start
    if(overlap<0.35||overlap/Math.min(al,bl)<0.8)continue
    const pointAt=(station:number):Point=>({x:a.a.x+ux*station-uy*(o1+o2)/4,y:a.a.y+uy*station+ux*(o1+o2)/4})
    matches.push({i,j,score:overlap/Math.max(al,bl),thickness,a:pointAt(start),b:pointAt(end)})
  }
  matches.sort((a,b)=>b.score-a.score);const used=new Set<number>()
  return matches.filter(m=>{if(used.has(m.i)||used.has(m.j))return false;used.add(m.i);used.add(m.j);return true}).map(m=>({id:`wall-${faces[m.i].id}-${faces[m.j].id}`,start:m.a,end:m.b,height:null,thickness:m.thickness,materialId:null,color:'#e8e7df',roomIds:[],openingIds:[],sourceEntityIds:[faces[m.i].id,faces[m.j].id],measureSource:null}))
}
function openingType(label:string):'DOOR'|'WINDOW'|'GATE'|null {
  if(/janela/i.test(label))return 'WINDOW'
  if(/port[aã]o/i.test(label))return 'GATE'
  if(/porta/i.test(label))return 'DOOR'
  return null
}
function measures(label:string){
  const normalized=label.replace(/,/g,'.')
  const value=(code:string)=>{const match=normalized.match(new RegExp(`(?:^|[^A-Z])${code}\\s*[:=]?\\s*(\\d+(?:\\.\\d+)?)`,'i'));return match?Number(match[1]):null}
  const dimensions=normalized.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i)
  const architecturalCodes=Object.fromEntries([...normalized.matchAll(/\b(PDL|PDV|PDF|PD|H)\s*[:=]?\s*(\d+(?:\.\d+)?)/gi)].map(m=>[m[1].toUpperCase(),Number(m[2])]))
  return {width:dimensions?Number(dimensions[1]):null,height:value('H')??(dimensions?Number(dimensions[2]):null),sill:value('PD'),architecturalCodes}
}
function openingsFromEvidence(doc:ProjectDocument){
  const entities=doc.sourceCad.rawEntities
  const notes=entities.filter(e=>e.text&&openingType(e.text))
  const geometry=entities.filter(e=>e.points.length>=2&&['LINE','LWPOLYLINE','POLYLINE'].includes(e.type)&&openingType(e.layer??''))
  const candidates=[...geometry,...notes.filter(n=>!geometry.some(g=>dist({x:(g.points[0].x+g.points.at(-1)!.x)/2,y:(g.points[0].y+g.points.at(-1)!.y)/2},n.points[0])<0.75))]
  for(const candidate of candidates){
    const midpoint=candidate.points.length>=2?{x:(candidate.points[0].x+candidate.points.at(-1)!.x)/2,y:(candidate.points[0].y+candidate.points.at(-1)!.y)/2}:candidate.points[0]
    if(!midpoint)continue
    const nearNote=notes.map(n=>({entity:n,distance:dist(n.points[0],midpoint)})).sort((a,b)=>a.distance-b.distance)
    const note=nearNote[0]?.distance<0.75&&(nearNote.length===1||nearNote[1].distance-nearNote[0].distance>0.05)?nearNote[0].entity:null
    const label=`${candidate.layer??''} ${candidate.text??''} ${note?.text??''}`
    const type=openingType(label);if(!type)continue
    const details=measures(label)
    const measuredWidth=candidate.points.length>=2?dist(candidate.points[0],candidate.points.at(-1)!):null
    const width=measuredWidth&&measuredWidth>=0.4&&measuredWidth<=6?measuredWidth:details.width
    const matches=doc.walls.map(w=>{const length=dist(w.start,w.end),ux=(w.end.x-w.start.x)/length,uy=(w.end.y-w.start.y)/length,station=(midpoint.x-w.start.x)*ux+(midpoint.y-w.start.y)*uy,offset=Math.abs((midpoint.x-w.start.x)*uy-(midpoint.y-w.start.y)*ux);return {wall:w,station,offset,length}}).filter(m=>m.station>=0&&m.station<=m.length&&m.offset<=Math.max(0.45,m.wall.thickness/2+0.25)).sort((a,b)=>a.offset-b.offset)
    const match=matches[0]&&(!matches[1]||matches[1].offset-matches[0].offset>0.05)?matches[0]:null
    const id=`opening-${candidate.id}`
    const sourceEntityIds=[candidate.id,...(note&&note.id!==candidate.id?[note.id]:[])]
    doc.openings.push({id,type,wallId:match?.wall.id??null,center:midpoint,width:width??null,height:details.height,sillHeight:type==='WINDOW'?details.sill:0,positionAlongWall:match?.station??null,annotation:note?.text??candidate.text??candidate.layer??null,sourceEntityIds,properties:{architecturalCodes:details.architecturalCodes,association:match?'NEAREST_UNAMBIGUOUS_WALL':'UNRESOLVED'}})
    if(match)match.wall.openingIds.push(id)
  }
}
export class DxfConverter implements CadConverter {
  convert(input:string,projectId:string,reference?:{entityId:string;lengthMeters:number}):ProjectDocument {
    const parsed=new DxfParser().parseSync(input);if(!parsed)throw new Error('DXF inválido')
    return this.convertEntities((parsed.entities??[]) as unknown as Raw[],parsed.header as Record<string,unknown>??{},parsed.blocks as unknown as Record<string,unknown>??{},projectId,reference)
  }
  convertEntities(raw:Raw[],header:Record<string,unknown>,blocks:Record<string,unknown>,projectId:string,reference?:{entityId:string;lengthMeters:number}):ProjectDocument {
    const units=Number(header.$INSUNITS??0)
    let factor=unitMeters[units]??null
    if(!factor&&reference){const match=raw.find((e,i)=>(e.handle??`entity-${i}`)===reference.entityId);const pts=match?points(match):[];if(pts.length<2||reference.lengthMeters<=0)throw new Error('Medida de referência inválida');factor=reference.lengthMeters/dist(pts[0],pts[1])}
    const base:ProjectDocument={schemaVersion:1,projectId,revision:0,site:{boundary:[],width:null,depth:null},coordinateSystem:{unit:'m',sourceUnit:units?String(units):null,metersPerSourceUnit:factor,calibrationStatus:factor?'CONFIRMED':'NEEDS_REFERENCE'},sourceCad:{fileId:null,format:'DXF',rawEntities:[],header,blocks},rooms:[],walls:[],openings:[],surfaces:[],assets:[],preferences:{styles:[],features:[],brief:''},materials:{},camera:{position:{x:0,y:1.65,z:0},direction:{x:0,y:0,z:-1},fov:60,roomId:null,timeOfDay:'day'},metadata:{}}
    base.sourceCad.rawEntities=raw.map((e,i)=>({id:e.handle??`entity-${i}`,type:e.type,layer:e.layer??'',original:e.originalCad??e,points:points(e).map(v=>p(v,factor??1)),text:e.text}))
    if(factor){
      const all=base.sourceCad.rawEntities.flatMap(e=>e.points);if(all.length){const minX=Math.min(...all.map(v=>v.x)),maxX=Math.max(...all.map(v=>v.x)),minY=Math.min(...all.map(v=>v.y)),maxY=Math.max(...all.map(v=>v.y));base.site={width:maxX-minX,depth:maxY-minY,boundary:[]}}
      base.walls=wallFaces(base.sourceCad.rawEntities)
      openingsFromEvidence(base)
      for(const e of base.sourceCad.rawEntities){if(!/room|ambiente|comodo|cômodo/i.test(e.layer??''))continue;if(e.points.length>=3&&e.type.includes('POLYLINE')){const polygon=e.points;let area=0;for(let i=0;i<polygon.length;i++){const j=(i+1)%polygon.length;area+=polygon[i].x*polygon[j].y-polygon[j].x*polygon[i].y}area=Math.abs(area)/2;const center={x:polygon.reduce((s,v)=>s+v.x,0)/polygon.length,y:polygon.reduce((s,v)=>s+v.y,0)/polygon.length};base.rooms.push({id:`room-${e.id}`,name:'Ambiente sem nome',type:'OTHER',polygon,center,area,ceilingHeight:null,floorMaterialId:null,wallMaterialId:null,assetIds:[],preferences:{},sourceEntityIds:[e.id]})}}
    }
    return documentSchema.parse(base)
  }
}
