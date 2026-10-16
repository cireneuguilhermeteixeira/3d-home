import { describe, expect, it } from 'vitest'
import { demoDocument } from '../src/lib/demo'
import { documentSchema } from '../src/lib/model'
import { applyOperations } from '../src/lib/operations'
import { buildBarriers, canStand, moveWithCollisions, walkSpawn } from '../src/components/legacy/walkCollision'
import type { Scene } from '../src/components/types'
const id='c8c43b0a-0aac-46fd-bfe1-57a6ca367cc7'
describe('casa de demonstração funcional',()=>{
  it('possui cômodos, paredes, portas, janelas e móveis válidos em metros',()=>{
    const doc=documentSchema.parse(demoDocument(id))
    expect(doc.metadata.demo).toBe(true)
    expect(doc.sourceCad.format).toBeNull()
    expect(doc.rooms).toHaveLength(8)
    expect(doc.walls.length).toBeGreaterThan(8)
    expect(doc.openings.some(o=>o.type==='DOOR')).toBe(true)
    expect(doc.openings.some(o=>o.type==='WINDOW')).toBe(true)
    expect(doc.assets).toHaveLength(2)
    expect(doc.coordinateSystem.calibrationStatus).toBe('CONFIRMED')
    for(const opening of doc.openings)expect(doc.walls.find(w=>w.id===opening.wallId)?.openingIds).toContain(opening.id)
    const changed=applyOperations(doc,[{type:'NAME_ROOM',roomId:'demo-room-1',name:'Sala nova',roomType:'LIVING_ROOM'}])
    expect(changed.rooms[0].name).toBe('Sala nova')
    expect(doc.rooms[0].name).toBe('Sala de estar')
  })
  it('cria pontos livres para caminhar e respeita barreiras',()=>{
    const doc=demoDocument(id)
    const scene={site:{width:12,depth:33,boundary:doc.site.boundary},walls:doc.walls.map(w=>({id:w.id,start:w.start,end:w.end,thickness:w.thickness})),openings:doc.openings.map(o=>({id:o.id,type:o.type,wallId:o.wallId,positionAlongWall:o.positionAlongWall,width:o.width})),rooms:doc.rooms.map(r=>({center:r.center})),elements:doc.assets.map(a=>({center:{x:a.position.x,y:a.position.z},radius:.6}))} as Scene
    const barriers=buildBarriers(scene),spawn=walkSpawn(scene,barriers)
    expect(canStand(spawn,barriers)).toBe(true)
    const movement=moveWithCollisions(spawn,0.4,0,barriers)
    expect(canStand(movement,barriers)).toBe(true)
  })
})
