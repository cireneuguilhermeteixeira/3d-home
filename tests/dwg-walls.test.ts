import { describe,expect,it } from 'vitest'
import { emptyDocument } from '../src/lib/model'
import { integrateDwgOpeningsIntoWalls } from '../src/lib/dwg-walls'
import { openingIntervalOnWall } from '../src/components/legacy/openingGeometry'
import { blocksFor } from '../src/components/legacy/HouseScene'
import type { Opening,Wall } from '../src/components/types'

describe('paredes com aberturas DWG',()=>{
  it('fecha a lacuna da parede apenas acima e abaixo de uma janela',()=>{
    const doc=emptyDocument('00000000-0000-0000-0000-000000000000')
    const wall=(id:string,start:number,end:number)=>({id,start:{x:start,y:0},end:{x:end,y:0},height:2.8,thickness:0.15,
      materialId:null,color:'#e8e7df',roomIds:[],openingIds:[],sourceEntityIds:[id],measureSource:'PDL-1'})
    doc.walls=[wall('left',0,2),wall('right',3,5)]
    doc.openings=[{id:'window-1',type:'WINDOW',wallId:null,center:{x:2.5,y:0},width:1,height:1,sillHeight:1,
      positionAlongWall:null,annotation:null,sourceEntityIds:['insert-1'],properties:{association:'DWG_BLOCK',spanStart:{x:2,y:0},spanEnd:{x:3,y:0}}}]
    integrateDwgOpeningsIntoWalls(doc)
    const bridge=doc.walls.find(item=>item.id.startsWith('wall-opening-'))!
    expect(bridge.start).toEqual({x:2,y:0})
    expect(bridge.end).toEqual({x:3,y:0})
    expect(bridge.height).toBe(2.8)
    expect(doc.openings[0].wallId).toBe(bridge.id)
    expect(openingIntervalOnWall({...bridge,length:1,heightEstimated:false,thicknessEstimated:false,status:'DERIVED',sourcePathIds:[],heightSourceId:null} as Wall,
      {...doc.openings[0],status:'DERIVED',sourcePathIds:[],sourceTextIds:[],measurementIds:[],annotationId:null,subtype:null,transomHeight:null,
        spanStart:{x:2,y:0},spanEnd:{x:3,y:0}} as Opening)).toEqual({start:0,end:1})
  })
  it('corta também um segmento original que atravessa o vão de uma porta',()=>{
    const wall={id:'original',start:{x:0,y:0},end:{x:4,y:0},length:4,height:2.8,thickness:0.15,color:'#e8e7df'} as Wall
    const opening={type:'DOOR',wallId:'infill',positionAlongWall:0.5,width:1,height:2.1,sillHeight:0,spanStart:{x:1,y:0},spanEnd:{x:2,y:0}} as Opening
    expect(openingIntervalOnWall(wall,opening)).toEqual({start:1,end:2})
    expect(blocksFor([wall],[opening]).blocks.map(block=>[block.startX,block.endX,block.bottom])).toEqual([[0,1,0],[1,2,2.1],[2,4,0]])
  })
  it('gera peitoril e verga para janela e só verga para porta',()=>{
    const wall={id:'infill',start:{x:0,y:0},end:{x:1,y:0},length:1,height:2.8,thickness:0.15,
      color:'#e8e7df',status:'DERIVED',heightEstimated:false,thicknessEstimated:false,sourcePathIds:[],heightSourceId:null} as Wall
    const opening={id:'opening',wallId:'infill',center:{x:0.5,y:0},positionAlongWall:0.5,width:1,height:1,
      sillHeight:1,spanStart:{x:0,y:0},spanEnd:{x:1,y:0},type:'WINDOW',status:'DERIVED',sourcePathIds:[],sourceTextIds:[],
      measurementIds:[],annotationId:null,subtype:null,transomHeight:null} as Opening
    const windowBlocks=blocksFor([wall],[opening]).blocks
    expect(windowBlocks.map(block=>[block.bottom,Number(block.height.toFixed(2))])).toEqual([[0,1],[2,0.8]])
    const doorBlocks=blocksFor([wall],[{...opening,type:'DOOR',height:2.1,sillHeight:0}]).blocks
    expect(doorBlocks.map(block=>[block.bottom,Number(block.height.toFixed(2))])).toEqual([[2.1,0.7]])
  })
})
