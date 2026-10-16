import { describe,expect,it } from 'vitest'
import { DxfConverter } from '../src/lib/cad'
import { applyOperations,type Operation } from '../src/lib/operations'
import { useEditor } from '../src/stores/editor-store'
import { simpleDxf } from './fixture'

describe('edição interpretada no draft',() => {
  it('preserva vista e seleção e permite desfazer/refazer operação recebida da IA',() => {
    const doc=new DxfConverter().convert(simpleDxf,'f6f08f36-b2ec-44c1-b1de-e67141478ae0')
    useEditor.getState().load(doc,0,0)
    useEditor.getState().setMode('3d')
    useEditor.getState().select({kind:'WALL',id:doc.walls[0].id})
    const ops:Operation[]=[{type:'SET_WALL_COLOR',wallId:doc.walls[0].id,color:'#A3AC97'}]
    const serverDraft=applyOperations(doc,ops)
    useEditor.getState().acceptRemote(ops,serverDraft,1)
    expect(useEditor.getState()).toMatchObject({mode:'3d',draftVersion:1,saved:false,pending:[],selected:{kind:'WALL',id:doc.walls[0].id}})
    expect(useEditor.getState().document?.walls[0].color).toBe('#A3AC97')
    useEditor.getState().undoAction()
    expect(useEditor.getState().document?.walls[0].color).toBe(doc.walls[0].color)
    expect(useEditor.getState().pending).toHaveLength(1)
    useEditor.getState().redoAction()
    expect(useEditor.getState().document?.walls[0].color).toBe('#A3AC97')
  })
})
