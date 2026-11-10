import { to3dHomeSourceCad, type DwgDocument } from 'dwg-json'
import type { ProjectDocument, Point } from './model'

const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y)
type HeightMarker={id:string;code:'PDL'|'PDV'|'PDF'|'PD';value:number;point:Point}

/** Model-space height notes sit beside the plan INSERTs, not inside their blocks. */
export function applyDwgWallHeights(document:ProjectDocument,archive:DwgDocument){
  const factor=document.coordinateSystem.metersPerSourceUnit??1
  const points=document.walls.flatMap(wall=>[wall.start,wall.end])
  if(!points.length)return
  const bounds={minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y))}
  const markers:HeightMarker[]=to3dHomeSourceCad(archive,'Model').rawEntities.flatMap(entity=>{
    const match=entity.text?.match(/\b(PDL|PDV|PDF|PD)\s*:\s*(\d+(?:[,.]\d+)?)\s*m?\b/i)
    const source=entity.points[0]
    if(!match||!source)return []
    const point={x:source.x*factor,y:source.y*factor},value=Number(match[2].replace(',','.'))
    if(!Number.isFinite(value)||value<1.8||value>5.8||point.x<bounds.minX-2||point.x>bounds.maxX+2||point.y<bounds.minY-2||point.y>bounds.maxY+2)return []
    return [{id:entity.id,code:match[1].toUpperCase() as HeightMarker['code'],value,point}]
  })
  document.metadata.dwgHeightMarkers=markers
  const ceiling=markers.filter(marker=>marker.code==='PDL'&&marker.value>=2.2&&marker.value<=3.6)
  for(const wall of document.walls){
    if(wall.height!==null)continue
    const center={x:(wall.start.x+wall.end.x)/2,y:(wall.start.y+wall.end.y)/2}
    const nearest=ceiling.map(marker=>({marker,distance:distance(center,marker.point)})).sort((a,b)=>a.distance-b.distance)[0]
    if(nearest&&nearest.distance<=4){wall.height=nearest.marker.value;wall.measureSource=nearest.marker.id}
  }
  document.metadata.dwgWallHeightMethod='nearest-PDL-within-4m'
}

type Gap={first:ProjectDocument['walls'][number];second:ProjectDocument['walls'][number];start:Point;end:Point;width:number}
function wallGaps(walls:ProjectDocument['walls']):Gap[]{
  const gaps:Gap[]=[]
  for(let i=0;i<walls.length;i++)for(let j=i+1;j<walls.length;j++){
    const first=walls[i],second=walls[j]
    const length=distance(first.start,first.end),otherLength=distance(second.start,second.end)
    if(length<0.35||otherLength<0.35)continue
    const ux=(first.end.x-first.start.x)/length,uy=(first.end.y-first.start.y)/length
    const vx=(second.end.x-second.start.x)/otherLength,vy=(second.end.y-second.start.y)/otherLength
    if(Math.abs(ux*vx+uy*vy)<0.985)continue
    const offset=Math.abs((second.start.x-first.start.x)*uy-(second.start.y-first.start.y)*ux)
    if(offset>Math.max(0.18,(first.thickness+second.thickness)/2))continue
    const s1=(second.start.x-first.start.x)*ux+(second.start.y-first.start.y)*uy
    const s2=(second.end.x-first.start.x)*ux+(second.end.y-first.start.y)*uy
    const lo=Math.min(s1,s2),hi=Math.max(s1,s2)
    let start:Point,end:Point
    if(lo>length){start=first.end;end=s1<s2?second.start:second.end}
    else if(hi<0){start=s1>s2?second.start:second.end;end=first.start}
    else continue
    const width=distance(start,end)
    if(width>=0.3&&width<=3.6)gaps.push({first,second,start,end,width})
  }
  return gaps
}

/** Fill the plan gaps with wall pieces whose 3D geometry is cut by the opening. */
export function integrateDwgOpeningsIntoWalls(document:ProjectDocument){
  const structural=document.walls.filter(wall=>!wall.id.startsWith('wall-opening-'))
  const gaps=wallGaps(structural)
  const grouped=new Map<string,{gap:Gap;openings:ProjectDocument['openings']}>()
  for(const opening of document.openings){
    if(opening.properties.association!=='DWG_BLOCK')continue
    const a=opening.properties.spanStart as Point|undefined,b=opening.properties.spanEnd as Point|undefined
    if(!a||!b||!opening.width)continue
    const openingWidth=opening.width
    const spanLength=distance(a,b)
    const ux=(b.x-a.x)/spanLength,uy=(b.y-a.y)/spanLength
    const candidates=gaps.map(gap=>{
      const center={x:(gap.start.x+gap.end.x)/2,y:(gap.start.y+gap.end.y)/2}
      const vx=(gap.end.x-gap.start.x)/gap.width,vy=(gap.end.y-gap.start.y)/gap.width
      return {gap,distance:distance(center,opening.center),alignment:Math.abs(ux*vx+uy*vy),score:distance(center,opening.center)+Math.abs(gap.width-openingWidth)*0.18}
    }).filter(candidate=>candidate.distance<Math.max(0.9,candidate.gap.width/2+0.25)&&candidate.alignment>0.92)
      .sort((a,b)=>a.score-b.score)
    const match=candidates[0]
    if(!match)continue
    const key=[match.gap.first.id,match.gap.second.id].sort().join('|')
    const group=grouped.get(key)??{gap:match.gap,openings:[]}
    group.openings.push(opening)
    grouped.set(key,group)
  }
  const remove=new Set<string>()
  for(const {gap,openings} of grouped.values()){
    const primary=openings[0]
    const center={x:(gap.start.x+gap.end.x)/2,y:(gap.start.y+gap.end.y)/2}
    const wallId=`wall-opening-${primary.id}`
    const height=Math.max(gap.first.height??0,gap.second.height??0)||null
    const wall={id:wallId,start:gap.start,end:gap.end,height,thickness:(gap.first.thickness+gap.second.thickness)/2,
      materialId:gap.first.materialId,color:gap.first.color,roomIds:[...new Set([...gap.first.roomIds,...gap.second.roomIds])],
      openingIds:[primary.id],sourceEntityIds:[...new Set([...gap.first.sourceEntityIds,...gap.second.sourceEntityIds])],measureSource:gap.first.measureSource??gap.second.measureSource}
    document.walls.push(wall)
    primary.wallId=wallId;primary.center=center;primary.positionAlongWall=gap.width/2;primary.width=gap.width
    primary.properties={...primary.properties,association:'DWG_WALL_GAP',spanStart:gap.start,spanEnd:gap.end,
      mergedSourceIds:openings.flatMap(item=>item.sourceEntityIds)}
    primary.sourceEntityIds=[...new Set(openings.flatMap(item=>item.sourceEntityIds))]
    for(const extra of openings.slice(1))remove.add(extra.id)
  }
  const rawFaces=document.sourceCad.rawEntities.filter(entity=>/ARQ-ALV|WALL|PAREDE/i.test(entity.layer??'')&&entity.points.length>=2)
    .flatMap(entity=>entity.points.slice(1).map((end,index)=>({start:entity.points[index],end,id:entity.id})))
    .filter(face=>distance(face.start,face.end)>=0.35)
  for(const opening of document.openings){
    if(remove.has(opening.id)||opening.properties.association!=='DWG_BLOCK')continue
    const a=opening.properties.spanStart as Point|undefined,b=opening.properties.spanEnd as Point|undefined
    if(!a||!b||!opening.width)continue
    const length=distance(a,b),ux=(b.x-a.x)/length,uy=(b.y-a.y)/length
    const supports=[...structural.map(wall=>({start:wall.start,end:wall.end,thickness:wall.thickness,height:wall.height,
      measureSource:wall.measureSource,color:wall.color,sourceEntityIds:wall.sourceEntityIds})),
      ...rawFaces.map(face=>({start:face.start,end:face.end,thickness:0.15,height:null,measureSource:null,color:'#e8e7df',sourceEntityIds:[face.id]}))]
      .map(support=>{
        const supportLength=distance(support.start,support.end),vx=(support.end.x-support.start.x)/supportLength,vy=(support.end.y-support.start.y)/supportLength
        const alignment=Math.abs(ux*vx+uy*vy)
        const normal=Math.abs((support.start.x-a.x)*uy-(support.start.y-a.y)*ux)
        const s1=(support.start.x-a.x)*ux+(support.start.y-a.y)*uy,s2=(support.end.x-a.x)*ux+(support.end.y-a.y)*uy
        const lo=Math.min(s1,s2),hi=Math.max(s1,s2),gap=Math.max(0,-hi,lo-length)
        return {support,normal,gap,alignment,score:normal+gap*0.7}
      }).filter(candidate=>candidate.alignment>0.96&&candidate.normal<0.8&&candidate.gap<1.3)
      .sort((a,b)=>a.score-b.score)
    const nearest=supports[0]
    if(!nearest)continue
    const support=nearest.support
    const supportLength=distance(support.start,support.end)
    const vx=(support.end.x-support.start.x)/supportLength,vy=(support.end.y-support.start.y)/supportLength
    const snap=(point:Point)=>{const station=(point.x-support.start.x)*vx+(point.y-support.start.y)*vy;return {x:support.start.x+station*vx,y:support.start.y+station*vy}}
    const start=snap(a),end=snap(b),width=distance(start,end)
    if(width<0.35)continue
    const center={x:(start.x+end.x)/2,y:(start.y+end.y)/2}
    const margin=0.1,along={x:(end.x-start.x)/width,y:(end.y-start.y)/width}
    const wallId=`wall-opening-${opening.id}`
    const marker=(document.metadata.dwgHeightMarkers as HeightMarker[]|undefined)?.filter(item=>item.code==='PDL'&&item.value>=2.2&&item.value<=3.6)
      .map(item=>({item,distance:distance(item.point,center)})).sort((a,b)=>a.distance-b.distance)[0]
    const height=support.height??(marker&&marker.distance<=4?marker.item.value:null)
    const wall={id:wallId,start:{x:start.x-along.x*margin,y:start.y-along.y*margin},end:{x:end.x+along.x*margin,y:end.y+along.y*margin},
      height,thickness:support.thickness,materialId:null,color:support.color,roomIds:[],openingIds:[opening.id],
      sourceEntityIds:support.sourceEntityIds,measureSource:support.measureSource??(height?marker?.item.id??null:null)}
    document.walls.push(wall)
    opening.wallId=wallId;opening.center=center;opening.positionAlongWall=width/2+margin;opening.width=width
    opening.properties={...opening.properties,association:'DWG_WALL_SPAN',spanStart:start,spanEnd:end}
  }
  document.openings=document.openings.filter(opening=>!remove.has(opening.id))
  document.metadata.dwgWallOpenings='gap-infill-v2'
}
