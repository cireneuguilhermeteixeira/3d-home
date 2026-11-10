import { describe, expect, it } from 'vitest'
import type { DwgDocument } from 'dwg-json'
import { findDwgPlans, projectDwgPlan } from '../src/lib/dwg-plans'

describe('plantas em blocos DWG',()=>{
  it('encontra a planta no espaço modelo e projeta blocos aninhados',()=>{
    const lines=Array.from({length:80},(_,index)=>({handleHex:`L${index}`,type:'LINE',layerName:'ARQ-ALV-ALT',geometry:{start:{x:index,y:0},end:{x:index,y:1}}}))
    const nested={handleHex:'N1',type:'INSERT',geometry:{blockHandleHex:'B2',insertionPoint:{x:2,y:3},scale:{x:1,y:1},rotation:Math.PI/2}}
    const root={handleHex:'I1',type:'INSERT',geometry:{blockHandleHex:'B1',insertionPoint:{x:100,y:200},scale:{x:1,y:1},rotation:0}}
    const duplicate={handleHex:'I2',type:'INSERT',geometry:{blockHandleHex:'B1',insertionPoint:{x:300,y:200},scale:{x:1,y:1},rotation:0}}
    const document={modelSpace:{entities:[root,duplicate]},layouts:[],blocks:[
      {handleHex:'B1',name:'BASE TERREO',base:{x:0,y:0},entities:[...lines,nested]},
      {handleHex:'B2',name:'PORTA',base:{x:0,y:0},entities:[{handleHex:'DOOR',type:'LINE',geometry:{start:{x:0,y:0},end:{x:2,y:0}}}]},
    ]} as unknown as DwgDocument
    expect(findDwgPlans(document)).toMatchObject([{id:'I1',name:'BASE TERREO'}])
    const projected=projectDwgPlan(document,'I1')
    expect(projected).toHaveLength(81)
    expect(projected[0].vertices).toEqual([{x:100,y:200},{x:100,y:201}])
    expect(projected.at(-1)?.vertices?.[0]).toEqual({x:102,y:203})
    expect(projected.at(-1)?.vertices?.[1].x).toBeCloseTo(102)
    expect(projected.at(-1)?.vertices?.[1].y).toBeCloseTo(205)
  })
})
