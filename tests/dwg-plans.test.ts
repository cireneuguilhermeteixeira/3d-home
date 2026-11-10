import { describe, expect, it } from 'vitest'
import type { DwgDocument } from 'dwg-json'
import { findDwgOpeningInserts, findDwgPlans, projectDwgPlan } from '../src/lib/dwg-plans'

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
  it('preserva portas e janelas representadas por blocos anônimos',()=>{
    const lines=Array.from({length:80},(_,index)=>({handleHex:`L${index}`,type:'LINE',layerName:'ARQ-ALV-ALT',geometry:{start:{x:index,y:0},end:{x:index,y:1}}}))
    const document={modelSpace:{entities:[{handleHex:'I1',type:'INSERT',geometry:{blockHandleHex:'ROOT',insertionPoint:{x:100,y:200}}}]},layouts:[],blocks:[
      {handleHex:'ROOT',name:'BASE TERREO',base:{x:0,y:0},entities:[...lines,
        {handleHex:'D1',type:'INSERT',layerName:'ARQ-POR-002',geometry:{blockHandleHex:'DOOR',insertionPoint:{x:2,y:3}}},
        {handleHex:'W1',type:'INSERT',layerName:'ARQ-CXO-002',geometry:{blockHandleHex:'WINDOW',insertionPoint:{x:5,y:3}}}]},
      {handleHex:'DOOR',name:'*U',base:{x:0,y:0},entities:[{handleHex:'ARC',type:'ARC',layerName:'ARQ-PRJ',geometry:{center:{x:0,y:0},radius:0.8,startAngle:0,endAngle:Math.PI/2}}]},
      {handleHex:'WINDOW',name:'*U',base:{x:0,y:0},entities:[{handleHex:'PANE',type:'LINE',layerName:'ARQ-CXO-002',geometry:{start:{x:0,y:0},end:{x:1.4,y:0}}}]},
    ]} as unknown as DwgDocument
    const projected=projectDwgPlan(document,'I1')
    const openings=findDwgOpeningInserts(document,'I1',projected)
    expect(openings.map(item=>item.type)).toEqual(['DOOR','WINDOW'])
    expect(openings[0].start).toEqual({x:102,y:203})
    expect(openings[0].end.x).toBeCloseTo(102.8)
    expect(openings[1].start.x).toBeCloseTo(105)
    expect(openings[1].end.x).toBeCloseTo(106.4)
  })
})
