'use client'
import { useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { Box3, PerspectiveCamera, Shape, Vector3, type Camera, type WebGLRenderer } from 'three'
import { HouseScene } from './legacy/HouseScene'
import type { Scene } from './types'
import type { ProjectDocument } from '@/lib/model'
import { useEditor } from '@/stores/editor-store'
import { catalog } from '@/lib/operations'
let currentRenderer:WebGLRenderer|null=null
let currentCamera:Camera|null=null
export function captureView(){if(!currentRenderer||!currentCamera)throw new Error('Visualização indisponível');const d=new Vector3();currentCamera.getWorldDirection(d);return {screenshot:currentRenderer.domElement.toDataURL('image/png'),camera:{position:{x:currentCamera.position.x,y:currentCamera.position.y,z:currentCamera.position.z},direction:{x:d.x,y:d.y,z:d.z},fov:currentCamera instanceof PerspectiveCamera?currentCamera.fov:45}}}

function oldScene(doc:ProjectDocument):Scene{
  const boundary=doc.site.boundary
  return {site:{width:doc.site.width??10,depth:doc.site.depth??10,boundary,layoutMode:'ORIGINAL_LAYOUT'},walls:doc.walls.map(w=>({id:w.id,start:w.start,end:w.end,length:Math.hypot(w.end.x-w.start.x,w.end.y-w.start.y),height:w.height,thickness:w.thickness,color:w.color,status:'DERIVED',heightEstimated:w.height===null,thicknessEstimated:false,sourcePathIds:w.sourceEntityIds,heightSourceId:w.measureSource})),openings:doc.openings.map(o=>({id:o.id,type:o.type==='UNKNOWN'?'UNKNOWN_OPENING':o.type,status:'DERIVED',wallId:o.wallId,center:o.center,positionAlongWall:o.positionAlongWall,width:o.width,height:o.height,sillHeight:o.sillHeight,sourcePathIds:o.sourceEntityIds,sourceTextIds:[],measurementIds:[],annotationId:o.annotation,subtype:null,transomHeight:null,spanStart:null,spanEnd:null})),lines:doc.sourceCad.rawEntities.filter(e=>e.points.length>1).map(e=>({id:e.id,sourcePathId:e.id,layer:e.layer??'',candidateClass:'wall_candidate',representedByWall:doc.walls.some(w=>w.sourceEntityIds.includes(e.id)),points:e.points})),rooms:doc.rooms.map((r,i)=>({id:r.id,number:String(i+1),name:r.name,center:r.center,status:'REFERENCE_MARKER',sourceTextId:r.sourceEntityIds[0]??'',roomType:r.type})),measurements:[],elements:doc.assets.map(a=>{const item=catalog.find(c=>c.id===a.catalogId);return {id:a.id,type:a.catalogId,status:'DESIGN',center:{x:a.position.x,y:a.position.z},radius:item?Math.max(item.width,item.depth)*a.scale/2:0.5,height:null,heightSourceId:null,sourceTextIds:[]}})}
}
function Selections({doc}:{doc:ProjectDocument}){
  const select=useEditor(s=>s.select),selected=useEditor(s=>s.selected),mode=useEditor(s=>s.mode),apply=useEditor(s=>s.apply)
  return <>{doc.rooms.filter(r=>r.polygon.length>=3).map(r=>{const shape=new Shape();r.polygon.forEach((p,i)=>i?shape.lineTo(p.x,-p.y):shape.moveTo(p.x,-p.y));shape.closePath();const mat=r.floorMaterialId?doc.materials[r.floorMaterialId]:null;return <mesh key={`floor-${r.id}`} rotation={[-Math.PI/2,0,0]} position={[0,-0.005,0]} receiveShadow onClick={e=>{e.stopPropagation();select({kind:'ROOM',id:r.id})}}><shapeGeometry args={[shape]}/><meshStandardMaterial color={mat?.color??'#e6e9df'} side={2}/></mesh>})}
    {mode==='cad'&&doc.sourceCad.rawEntities.filter(e=>e.type.includes('POLYLINE')&&e.points.length>=3&&(e.original.closed||e.original.shape)&&!doc.rooms.some(r=>r.sourceEntityIds.includes(e.id))).map(e=>{const shape=new Shape();e.points.forEach((p,i)=>i?shape.lineTo(p.x,-p.y):shape.moveTo(p.x,-p.y));shape.closePath();return <mesh key={e.id} position={[0,0.03,0]} rotation={[-Math.PI/2,0,0]} onClick={event=>{event.stopPropagation();apply({type:'ADD_ROOM_FROM_ENTITY',entityId:e.id})}}><shapeGeometry args={[shape]}/><meshBasicMaterial color="#91b49a" transparent opacity={0.1} depthWrite={false} side={2}/></mesh>})}
    {mode!=='cad'&&doc.walls.map(w=>{const length=Math.hypot(w.end.x-w.start.x,w.end.y-w.start.y);return <mesh key={w.id} position={[(w.start.x+w.end.x)/2,(w.height??2.8)/2,(w.start.y+w.end.y)/2]} rotation={[0,-Math.atan2(w.end.y-w.start.y,w.end.x-w.start.x),0]} onClick={e=>{e.stopPropagation();select({kind:'WALL',id:w.id})}}><boxGeometry args={[length,w.height??2.8,w.thickness+0.006]}/><meshStandardMaterial color={w.color} transparent opacity={selected?.id===w.id?0.95:0.01} depthWrite={false}/></mesh>})}
    {mode!=='cad'&&doc.assets.map(a=><GltfAsset key={a.id} asset={a} onClick={()=>select({kind:'ASSET',id:a.id})}/>)}
  </>
}
function GltfAsset({asset,onClick}:{asset:ProjectDocument['assets'][number];onClick:()=>void}){
  const item=catalog.find(c=>c.id===asset.catalogId)
  if(!item)return null
  return <GltfModel asset={asset} url={item.modelUrl} width={item.width} depth={item.depth} onClick={onClick}/>
}
function GltfModel({asset,url,width,depth,onClick}:{asset:ProjectDocument['assets'][number];url:string;width:number;depth:number;onClick:()=>void}){
  const gltf=useGLTF(url)
  const {object,scale,offset}=useMemo(()=>{const object=gltf.scene.clone(true);const bounds=new Box3().setFromObject(object);const size=bounds.getSize(new Vector3());const center=bounds.getCenter(new Vector3());const scale=Math.min(width/Math.max(size.x,.01),depth/Math.max(size.z,.01));object.traverse(node=>{if('castShadow' in node) (node as unknown as {castShadow:boolean}).castShadow=true});return {object,scale,offset:{x:-center.x,y:-bounds.min.y,z:-center.z}}},[gltf.scene,width,depth])
  return <group position={[asset.position.x,asset.position.y,asset.position.z]} rotation={[0,asset.rotation,0]} scale={asset.scale} onClick={e=>{e.stopPropagation();onClick()}}><group scale={scale}><primitive object={object} position={[offset.x,offset.y,offset.z]}/></group></group>
}
export default function ProjectViewer({document}:{document:ProjectDocument}){
  const mode=useEditor(s=>s.mode),select=useEditor(s=>s.select),[reset]=useState(0),[walkActive,setWalkActive]=useState(false)
  const scene=useMemo(()=>oldScene(document),[document])
  return <div className="viewer"><Canvas key={mode==='cad'?'ortho':'perspective'} orthographic={mode==='cad'} shadows gl={{preserveDrawingBuffer:true}} camera={{position:[0,30,0],near:0.05,far:500}} onCreated={({gl,camera})=>{currentRenderer=gl;currentCamera=camera}}><HouseScene scene={scene} mode={mode} reset={reset} attentionPoints={[]} placing={false} onPick={()=>{}} onSelectPoint={()=>{}} walkActive={walkActive} onWalkActiveChange={setWalkActive}/><Selections doc={document}/></Canvas>{mode==='walk'&&!walkActive&&<button className="walk-entry-button" onClick={()=>setWalkActive(true)}>Clique para explorar · WASD para mover</button>}<div className="view-tabs">{(['cad','3d','walk'] as const).map(m=><button key={m} className={mode===m?'active':''} disabled={m!=='cad'&&document.coordinateSystem.calibrationStatus!=='CONFIRMED'} onClick={()=>{setWalkActive(false);useEditor.getState().setMode(m);select(null)}}>{m==='cad'?'Planta CAD':m==='3d'?'Maquete 3D':'Primeira pessoa'}</button>)}</div></div>
}
