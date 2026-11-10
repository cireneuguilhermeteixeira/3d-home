'use client'
import { useEffect, useRef, useState } from 'react'
import type { ProjectDocument, Point } from '@/lib/model'
import { useEditor } from '@/stores/editor-store'

export default function CadPlan({document:doc,referenceId,onSelectReference}:{document:ProjectDocument;referenceId?:string;onSelectReference?:(id:string)=>void}){
  const select=useEditor(state=>state.select)
  const selected=useEditor(state=>state.selected)
  const paper=useRef<HTMLDivElement>(null)
  const [size,setSize]=useState({width:900,height:600})
  const [zoom,setZoom]=useState(1)
  useEffect(()=>{
    const element=paper.current
    if(!element)return
    const observer=new ResizeObserver(([entry])=>setSize({width:entry.contentRect.width,height:entry.contentRect.height}))
    observer.observe(element)
    return()=>observer.disconnect()
  },[])
  useEffect(()=>setZoom(1),[doc.sourceCad.fileId,doc.metadata.dwgPlanId])
  const structural=[...doc.site.boundary,...doc.walls.flatMap(wall=>[wall.start,wall.end]),...doc.rooms.flatMap(room=>room.polygon)]
  const drawing=doc.sourceCad.rawEntities.filter(entity=>entity.points.length>1).flatMap(entity=>entity.points)
  const points=doc.metadata.dwgPlanId&&drawing.length?drawing:structural.length?structural:drawing.length?drawing:[{x:0,y:0},{x:12,y:12}]
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity
  for(const point of points){minX=Math.min(minX,point.x);minY=Math.min(minY,point.y);maxX=Math.max(maxX,point.x);maxY=Math.max(maxY,point.y)}
  const spanX=Math.max(maxX-minX,.01),spanY=Math.max(maxY-minY,.01)
  const w=Math.max(size.width,1),h=Math.max(size.height,1),pad=Math.min(68,w*.1,h*.12)
  const scale=Math.min((w-2*pad)/spanX,(h-2*pad)/spanY)
  const offsetX=(w-spanX*scale)/2,offsetY=(h-spanY*scale)/2
  const x=(value:number)=>offsetX+(value-minX)*scale
  const y=(value:number)=>offsetY+(value-minY)*scale
  const path=(vertices:Point[],closed=false)=>vertices.map((point,index)=>`${index?'L':'M'}${x(point.x)} ${y(point.y)}`).join(' ')+(closed?' Z':'')
  const zoomIn=()=>setZoom(value=>Math.min(value*1.4,12))
  const zoomOut=()=>setZoom(value=>Math.max(value/1.4,.5))
  return <div className="cad-canvas">
    <div className="cad-paper" ref={paper}>
      <svg className="cad-svg" viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg" role="img" aria-label={`Planta CAD com ${doc.rooms.length} ambientes`}>
        <defs><pattern id="fineGrid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#dbe4e8" strokeWidth=".6"/></pattern></defs>
        <rect width={w} height={h} fill="url(#fineGrid)"/>
        <g transform={`translate(${w/2} ${h/2}) scale(${zoom}) translate(${-w/2} ${-h/2})`}>
          {doc.rooms.map((room,index)=><path key={room.id} d={path(room.polygon,true)} fill={['#e6eef0','#eef1ed','#e8edf3'][index%3]} fillOpacity=".65" stroke={selected?.id===room.id?'#0a7186':'#afc0c8'} strokeWidth={selected?.id===room.id?2.4:1.2} onClick={()=>select({kind:'ROOM',id:room.id})} className="cad-interactive"/>)}
          {doc.sourceCad.rawEntities.filter(entity=>entity.points.length>=2&&!doc.walls.some(wall=>wall.sourceEntityIds.includes(entity.id))).map(entity=><path key={entity.id} d={path(entity.points)} fill="none" stroke={referenceId===entity.id?'#e0723f':/ALV|PAREDE|WALL/i.test(entity.layer??'')?'#20343d':/POR|PORTA|DOOR/i.test(entity.layer??'')?'#647b85':'#8ca0aa'} strokeWidth={referenceId===entity.id?3:/ALV|PAREDE|WALL/i.test(entity.layer??'')?1.35:.9} strokeLinecap="round" strokeLinejoin="round" onClick={()=>onSelectReference?.(entity.id)} className={onSelectReference?'cad-interactive':''}/>)}
          {doc.walls.map(wall=><line key={wall.id} x1={x(wall.start.x)} y1={y(wall.start.y)} x2={x(wall.end.x)} y2={y(wall.end.y)} stroke={selected?.id===wall.id?'#0a7186':'#263b45'} strokeWidth={Math.max(2,Math.min(8,wall.thickness*scale))} onClick={()=>select({kind:'WALL',id:wall.id})} className="cad-interactive"/>)}
          {doc.sourceCad.rawEntities.filter(entity=>entity.text&&entity.points.length===1).slice(0,150).map(entity=><text key={`text-${entity.id}`} x={x(entity.points[0].x)} y={y(entity.points[0].y)} fill="#6a7e88" fontSize="8" fontFamily="Arial, sans-serif">{entity.text?.slice(0,50)}</text>)}
          {doc.rooms.map((room,index)=><text key={`label-${room.id}`} x={x(room.center.x)} y={y(room.center.y)} textAnchor="middle" fill="#31515e" fontSize="10" fontWeight="600" fontFamily="Arial, sans-serif" onClick={()=>select({kind:'ROOM',id:room.id})} className="cad-interactive">{room.name==='Ambiente sem nome'?`Ambiente ${index+1}`:room.name}</text>)}
        </g>
      </svg>
    </div>
    <div className="cad-zoom" aria-label="Zoom da planta"><button onClick={zoomOut} aria-label="Afastar">−</button><button onClick={()=>setZoom(1)}>Ajustar</button><button onClick={zoomIn} aria-label="Aproximar">+</button></div>
    <div className="cad-scale">{spanX.toFixed(1)} × {spanY.toFixed(1)} {doc.coordinateSystem.calibrationStatus==='CONFIRMED'?'m':'unidades do desenho'}</div>
  </div>
}
