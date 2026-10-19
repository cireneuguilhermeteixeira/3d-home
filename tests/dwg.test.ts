import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DwgConverter, jsonSafeDwg } from '../src/lib/dwg'

const projectId = 'f6f08f36-b2ec-44c1-b1de-e67141478ae0'
const fixture = readFileSync(new URL('./fixture-sample-2000.dwg', import.meta.url))
const source = fixture.buffer.slice(fixture.byteOffset, fixture.byteOffset + fixture.byteLength)

describe('importação DWG real com LibreDWG', () => {
  it('lê um DWG binário, mantém entidades originais e interpreta unidades', async () => {
    const document = await new DwgConverter().convert(source, projectId)
    expect(document.sourceCad.format).toBe('DWG')
    expect(document.sourceCad.rawEntities).toHaveLength(6)
    expect(document.coordinateSystem.sourceUnit).toBe('4')
    expect(document.coordinateSystem.metersPerSourceUnit).toBe(0.001)
    expect(document.sourceCad.rawEntities.find(entity => entity.type === 'TEXT')?.text).toContain('Jen teksto')
    const circle = document.sourceCad.rawEntities.find(entity => entity.type === 'CIRCLE')
    expect(circle?.points.length).toBeGreaterThan(16)
    expect(circle?.original).toMatchObject({ type: 'CIRCLE', radius: 20 })
    expect(document.metadata.dwgParser).toMatchObject({ name: 'LibreDWG WebAssembly', unknownEntityCount: 0 })
  }, 30_000)

  it('recusa arquivo DXF renomeado como DWG', async () => {
    await expect(new DwgConverter().convert(new TextEncoder().encode('0\nSECTION\n').buffer, projectId)).rejects.toThrow('assinatura AutoCAD ausente')
  })
  it('preserva BigInt de metadados CAD como string decimal exata no JSON', () => {
    const source = { header: { handle: 9007199254740993n }, entities: [{ id: 42n, nested: { count: 18446744073709551615n } }] }
    const sanitized = jsonSafeDwg(source)
    expect(JSON.stringify(sanitized)).toContain('"9007199254740993"')
    expect(sanitized.entities[0].nested.count).toBe('18446744073709551615')
  })
})
