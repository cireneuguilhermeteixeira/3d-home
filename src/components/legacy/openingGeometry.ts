import type { Opening, Wall } from '../types'

/** A source opening can cut its infill wall and any overlapping original wall segment. */
export function openingIntervalOnWall(wall:Wall,opening:Opening):{start:number;end:number}|null{
  const length=wall.length
  if(length<0.01)return null
  if(opening.wallId===wall.id&&opening.positionAlongWall!==null&&opening.width!==null){
    const start=Math.max(0,opening.positionAlongWall-opening.width/2),end=Math.min(length,opening.positionAlongWall+opening.width/2)
    return end-start>=0.2?{start,end}:null
  }
  const a=opening.spanStart,b=opening.spanEnd
  if(!a||!b)return null
  const spanLength=Math.hypot(b.x-a.x,b.y-a.y)
  if(spanLength<0.2)return null
  const ux=(wall.end.x-wall.start.x)/length,uy=(wall.end.y-wall.start.y)/length
  const vx=(b.x-a.x)/spanLength,vy=(b.y-a.y)/spanLength
  if(Math.abs(ux*vx+uy*vy)<0.98)return null
  const offset=(p:{x:number;y:number})=>Math.abs((p.x-wall.start.x)*uy-(p.y-wall.start.y)*ux)
  if(Math.max(offset(a),offset(b))>Math.max(0.22,wall.thickness/2+0.12))return null
  const station=(p:{x:number;y:number})=>(p.x-wall.start.x)*ux+(p.y-wall.start.y)*uy
  const start=Math.max(0,Math.min(station(a),station(b))),end=Math.min(length,Math.max(station(a),station(b)))
  return end-start>=0.2?{start,end}:null
}
