import { describe,it,expect } from 'vitest'
import { DxfConverter } from '../src/lib/cad'
import { applyOperations } from '../src/lib/operations'
import { budget } from '../src/lib/budget'
import { buildBarriers,walkHeading,walkSpawn } from '../src/components/legacy/walkCollision'
import type { Scene } from '../src/components/types'
import { simpleDxf } from './fixture'
const id='f6f08f36-b2ec-44c1-b1de-e67141478ae0'
describe('normalização CAD e edição',()=>{
  it('mantém entidades originais, escala métrica e paredes pareadas',()=>{
    const doc=new DxfConverter().convert(simpleDxf,id)
    expect(doc.coordinateSystem.calibrationStatus).toBe('CONFIRMED')
    expect(doc.sourceCad.rawEntities).toHaveLength(3)
    expect(doc.walls).toHaveLength(1)
    expect(doc.walls[0].thickness).toBeCloseTo(.2)
    expect(doc.rooms).toHaveLength(1)
    expect(doc.rooms[0].area).toBeCloseTo(11.56)
  })
  it('recusa inventar escala quando unidade está ausente',()=>{
    const unknown=simpleDxf.replace('70\n6\n','70\n0\n')
    const doc=new DxfConverter().convert(unknown,id)
    expect(doc.coordinateSystem.calibrationStatus).toBe('NEEDS_REFERENCE')
    expect(doc.walls).toHaveLength(0)
    const calibrated=new DxfConverter().convert(unknown,id,{entityId:'A1',lengthMeters:4})
    expect(calibrated.walls).toHaveLength(1)
  })
  it('interpreta abertura apenas com evidência explícita e preserva cotas arquitetônicas',()=>{
    const withOpening=simpleDxf.replace('0\nENDSEC\n0\nEOF',`0
LINE
5
W1
8
JANELA
10
1
20
0.1
11
2.2
21
0.1
0
TEXT
5
T1
8
ANNOTATION
10
1.6
20
0.1
1
JANELA 1,20x1,00 h=1,00 PD=0,90 PDL=2,80 PDV=2,60 PDF=2,40
0
ENDSEC
0
EOF`)
    const doc=new DxfConverter().convert(withOpening,id)
    expect(doc.openings).toHaveLength(1)
    expect(doc.openings[0]).toMatchObject({type:'WINDOW',height:1,sillHeight:.9,wallId:doc.walls[0].id})
    expect(doc.openings[0].width).toBeCloseTo(1.2)
    expect(doc.openings[0].properties.architecturalCodes).toMatchObject({H:1,PD:.9,PDL:2.8,PDV:2.6,PDF:2.4})
    expect(doc.walls[0].openingIds).toEqual([doc.openings[0].id])
  })
  it('aplica cor, piso e móvel sem modificar raw CAD',()=>{
    const doc=new DxfConverter().convert(simpleDxf,id)
    doc.materials.porcelain={id:'porcelain',name:'Porcelanato cinza-claro',color:'#c7c9c5',unitPrice:null,supplierUrl:null}
    const raw=JSON.stringify(doc.sourceCad)
    const updated=applyOperations(doc,[{type:'NAME_ROOM',roomId:'room-R1',name:'Cozinha',roomType:'KITCHEN'},{type:'SET_WALL_COLOR',wallId:doc.walls[0].id,color:'#A3AC97'},{type:'SET_FLOOR_MATERIAL',roomId:'room-R1',materialId:'porcelain'},{type:'ADD_ASSET',assetId:'eab8c731-6a63-4d1f-a395-7a37ddf0be76',roomId:'room-R1',catalogId:'chair',position:{x:2,y:0,z:2}}])
    expect(JSON.stringify(updated.sourceCad)).toBe(raw)
    expect(updated.rooms[0].floorMaterialId).toBe('porcelain')
    expect(updated.assets).toHaveLength(1)
    expect(budget(updated).find(r=>r.element==='Piso')?.estimatedCost).toBeNull()
    expect(()=>applyOperations(updated,[{type:'MOVE_ASSET',assetId:updated.assets[0].id,position:{x:8,y:0,z:8}}])).toThrow(/limite/)
  })
  it('inicia a caminhada fora dos móveis e voltada ao espaço livre',()=>{
    const doc=new DxfConverter().convert(simpleDxf,id)
    const scene:Scene={site:{width:4,depth:4,boundary:[],layoutMode:'ORIGINAL_LAYOUT'},walls:doc.walls.map(w=>({id:w.id,start:w.start,end:w.end,length:4,height:null,thickness:w.thickness,status:'DERIVED',heightEstimated:true,thicknessEstimated:false,sourcePathIds:w.sourceEntityIds,heightSourceId:null})),openings:[],lines:[],rooms:[{id:'room-R1',number:'1',name:'Sala',center:{x:2,y:2},status:'REFERENCE_MARKER',sourceTextId:'R1',roomType:'OTHER'}],measurements:[],elements:[{id:'chair',type:'chair',status:'DESIGN',center:{x:2,y:2},radius:0.5,height:null,heightSourceId:null,sourceTextIds:[]}]}
    const barriers=buildBarriers(scene),spawn=walkSpawn(scene,barriers)
    expect(Math.hypot(spawn.x-2,spawn.y-2)).toBeGreaterThan(0.8)
    expect(Math.cos(walkHeading(spawn,barriers))).toBeGreaterThan(0.2)
  })
})
