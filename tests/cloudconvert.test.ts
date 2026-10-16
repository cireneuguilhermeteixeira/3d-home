import { afterEach,describe,expect,it,vi } from 'vitest'
import { conversionStatus,signedSource,startDwgConversion,verifySource } from '../src/lib/cloudconvert'

const previous = {
  CLOUDCONVERT_API_KEY: process.env.CLOUDCONVERT_API_KEY,
  CLOUDCONVERT_SOURCE_SECRET: process.env.CLOUDCONVERT_SOURCE_SECRET,
  APP_URL: process.env.APP_URL
}
afterEach(() => {
  vi.unstubAllGlobals()
  for (const [name,value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

describe('contrato da conversão DWG',() => {
  it('assina somente a origem temporária e inicia job import/url → DWG/DXF → export/url',async() => {
    process.env.CLOUDCONVERT_API_KEY = 'test-key'
    process.env.CLOUDCONVERT_SOURCE_SECRET = 'test-secret'
    process.env.APP_URL = 'https://forma.example'
    const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>({data:{id:'job-1',status:'waiting'}})})
    vi.stubGlobal('fetch',fetchMock)
    const fileId='f6f08f36-b2ec-44c1-b1de-e67141478ae0'
    const source=new URL(signedSource(fileId))
    expect(source.pathname).toBe(`/api/cad-source/${fileId}`)
    expect(verifySource(fileId,source.searchParams.get('exp')!,source.searchParams.get('sig')!)).toBe(true)
    expect(verifySource('00000000-0000-0000-0000-000000000000',source.searchParams.get('exp')!,source.searchParams.get('sig')!)).toBe(false)
    expect(await startDwgConversion(fileId)).toMatchObject({id:'job-1'})
    const [endpoint,request]=fetchMock.mock.calls[0] as [string,RequestInit]
    expect(endpoint).toBe('https://api.cloudconvert.com/v2/jobs')
    expect((request.headers as Record<string,string>).Authorization).toBe('Bearer test-key')
    const body=JSON.parse(request.body as string)
    expect(body.tasks.source.operation).toBe('import/url')
    const jobSource=new URL(body.tasks.source.url)
    expect(jobSource.pathname).toBe(source.pathname)
    expect(verifySource(fileId,jobSource.searchParams.get('exp')!,jobSource.searchParams.get('sig')!)).toBe(true)
    expect(body.tasks.convert).toMatchObject({operation:'convert',input:'source',input_format:'dwg',output_format:'dxf'})
    expect(body.tasks.export).toMatchObject({operation:'export/url',input:'convert'})
    await conversionStatus('job-1')
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.cloudconvert.com/v2/jobs/job-1')
  })
})
