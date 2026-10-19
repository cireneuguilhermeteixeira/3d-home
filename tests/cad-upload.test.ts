import { afterEach, describe, expect, it, vi } from 'vitest'
import { uploadCadFile } from '../src/lib/cad-upload'
const file=new File(['CAD data'],'planta.dwg',{type:'application/octet-stream'})
const projectId='a316eac5-a3cc-4dbc-b25b-f6c2e52232f7'
afterEach(()=>vi.restoreAllMocks())
describe('upload CAD por URL assinada',()=>{
  it('transfere direto ao Blob e retorna o caminho persistido',async()=>{
    const fetchMock=vi.spyOn(globalThis,'fetch')
      .mockResolvedValueOnce(Response.json({presignedUrl:'https://blob.example/signed'}))
      .mockResolvedValueOnce(Response.json({pathname:'cad/'+projectId+'/00000000-0000-4000-8000-000000000000-planta.dwg'}))
    vi.spyOn(crypto,'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000000')
    await expect(uploadCadFile(projectId,file)).resolves.toEqual({pathname:`cad/${projectId}/00000000-0000-4000-8000-000000000000-planta.dwg`})
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/projects/${projectId}/upload`)
    expect(fetchMock.mock.calls[1][0]).toBe('https://blob.example/signed')
    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({method:'PUT',body:file}))
  })
  it('usa armazenamento local em desenvolvimento quando Blob não está configurado',async()=>{
    vi.spyOn(crypto,'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000000')
    const pathname=`cad/${projectId}/00000000-0000-4000-8000-000000000000-planta.dwg`
    const fetchMock=vi.spyOn(globalThis,'fetch')
      .mockResolvedValueOnce(Response.json({error:'Vercel Blob não configurado'},{status:503}))
      .mockResolvedValueOnce(Response.json({pathname}))
    await expect(uploadCadFile(projectId,file)).resolves.toEqual({pathname})
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({method:'POST',body:expect.any(FormData)}))
  })
  it('mostra falhas de armazenamento local',async()=>{
    vi.spyOn(globalThis,'fetch')
      .mockResolvedValueOnce(Response.json({error:'Vercel Blob não configurado'},{status:503}))
      .mockResolvedValueOnce(Response.json({error:'Upload local disponível somente em desenvolvimento'},{status:503}))
    await expect(uploadCadFile(projectId,file)).rejects.toThrow('Upload local disponível somente em desenvolvimento')
  })
})
