import { documentSchema, emptyDocument, type ProjectDocument } from './model'
import { applyOperations } from './operations'

// A sample drawn in metres. It is explicitly separate from an imported CAD source.
export function demoDocument(projectId:string, preferences?:Partial<ProjectDocument['preferences']>):ProjectDocument {
  let doc=emptyDocument(projectId,preferences)
  doc.site={boundary:[{x:0,y:0},{x:12,y:0},{x:12,y:33},{x:0,y:33}],width:12,depth:33}
  doc.coordinateSystem={unit:'m',sourceUnit:'m',metersPerSourceUnit:1,calibrationStatus:'CONFIRMED'}
  doc.metadata={demo:true,description:'Casa demonstrativa desenhada para explorar o editor; não foi importada de um arquivo CAD.'}
  const rect=(x1:number,y1:number,x2:number,y2:number)=>[{x:x1,y:y1},{x:x2,y:y1},{x:x2,y:y2},{x:x1,y:y2}]
  const rooms:[string,ProjectDocument['rooms'][number]['type'],number,number,number,number][]=[
    ['Sala de estar','LIVING_ROOM',0,0,5.5,5.4],['Cozinha','KITCHEN',5.5,0,12,5.4],
    ['Quarto','BEDROOM',0,5.4,5.5,11.4],['Escritório','OFFICE',5.5,5.4,12,11.4],
    ['Banheiro','BATHROOM',0,11.4,7,16.4],['Garagem','GARAGE',7,11.4,12,16.4],
    ['Área de serviço','LAUNDRY',0,16.4,12,20],['Quintal','BACKYARD',0,20,12,33]
  ]
  doc.rooms=rooms.map(([name,type,x1,y1,x2,y2],i)=>({id:`demo-room-${i+1}`,name,type,polygon:rect(x1,y1,x2,y2),center:{x:(x1+x2)/2,y:(y1+y2)/2},area:(x2-x1)*(y2-y1),ceilingHeight:type==='BACKYARD'?null:2.8,floorMaterialId:null,wallMaterialId:null,assetIds:[],preferences:{},sourceEntityIds:[]}))
  const addWall=(id:string,x1:number,y1:number,x2:number,y2:number,roomIds:string[]=[])=>doc.walls.push({id:`demo-wall-${id}`,start:{x:x1,y:y1},end:{x:x2,y:y2},height:2.8,thickness:id.startsWith('outer')?.2:.16,materialId:null,color:'#e7e9e2',roomIds,openingIds:[],sourceEntityIds:[],measureSource:'demo'})
  addWall('outer-top',0,0,12,0,['demo-room-1','demo-room-2']);addWall('outer-right',12,0,12,20,['demo-room-2','demo-room-4','demo-room-6','demo-room-7']);addWall('outer-left',0,0,0,20,['demo-room-1','demo-room-3','demo-room-5','demo-room-7']);addWall('outer-bottom',0,20,12,20,['demo-room-7','demo-room-8'])
  addWall('partition-a',5.5,0,5.5,11.4);addWall('partition-b',7,11.4,7,16.4)
  for(const [i,y] of [5.4,11.4,16.4].entries())addWall(`cross-${i}`,0,y,12,y)
  const addOpening=(id:string,wallId:string,type:'DOOR'|'WINDOW',station:number,width:number,sill=0)=>{const w=doc.walls.find(w=>w.id===`demo-wall-${wallId}`)!;const len=Math.hypot(w.end.x-w.start.x,w.end.y-w.start.y);const center={x:w.start.x+(w.end.x-w.start.x)*station/len,y:w.start.y+(w.end.y-w.start.y)*station/len};doc.openings.push({id:`demo-opening-${id}`,type,wallId:w.id,center,width,height:type==='DOOR'?2.1:1.2,sillHeight:sill,positionAlongWall:station,annotation:null,sourceEntityIds:[],properties:{demo:true}});w.openingIds.push(`demo-opening-${id}`)}
  addOpening('entry','outer-top','DOOR',2.2,1);addOpening('living-kitchen','partition-a','DOOR',2.7,.95);addOpening('bed-office','partition-a','DOOR',8.4,.9)
  for(const [i,station] of [2.2,8.5].entries()){addOpening(`cross-a-${i}`,'cross-0','DOOR',station,.9);addOpening(`cross-b-${i}`,'cross-1','DOOR',station,.9)}
  addOpening('cross-c','cross-2','DOOR',6,.95);addOpening('garden','outer-bottom','DOOR',6,1.5)
  addOpening('living-window','outer-left','WINDOW',2.7,1.6,.9);addOpening('kitchen-window','outer-right','WINDOW',2.7,1.5,.9);addOpening('bed-window','outer-left','WINDOW',8.2,1.4,.9);addOpening('office-window','outer-right','WINDOW',8.2,1.4,.9)
  doc.camera={position:{x:2.7,y:1.65,z:2.7},direction:{x:1,y:0,z:0},fov:60,roomId:'demo-room-1',timeOfDay:'16:00'}
  doc=applyOperations(doc,[{type:'ADD_ASSET',assetId:'5bb876d5-324b-4c9a-b954-5841de04748d',roomId:'demo-room-1',catalogId:'sofa',position:{x:1.6,y:0,z:3.8}},{type:'ADD_ASSET',assetId:'b098ff9a-6d7b-491e-a2e0-790a07c5ace8',roomId:'demo-room-4',catalogId:'chair',position:{x:8.6,y:0,z:8.4}}])
  return documentSchema.parse(doc)
}
