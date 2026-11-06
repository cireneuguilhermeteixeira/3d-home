import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { originalDwgBytes, type DwgDocument } from 'dwg-json'
import { DwgConverter } from '../src/lib/dwg'
import { packDwgArchive, unpackDwgArchive } from '../src/lib/dwg-archive'
import { documentSchema } from '../src/lib/model'

const projectId = 'f6f08f36-b2ec-44c1-b1de-e67141478ae0'
const fixture = readFileSync(new URL('./fixture-sample-2000.dwg', import.meta.url))
const source = fixture.buffer.slice(fixture.byteOffset, fixture.byteOffset + fixture.byteLength)

describe('importação DWG com acadrust-js e dwg-json', () => {
  it('guarda o JSON completo e projeta as entidades para o editor', async () => {
    const document = await new DwgConverter().convert(source, projectId)
    const archive = document.metadata.dwgJson as DwgDocument
    expect(document.sourceCad.format).toBe('DWG')
    expect(document.sourceCad.rawEntities).toHaveLength(6)
    expect(document.sourceCad.rawEntities.find(entity => entity.type === 'TEXT')?.text).toContain('Jen teksto')
    expect(document.sourceCad.rawEntities.find(entity => entity.type === 'CIRCLE')?.points.length).toBeGreaterThan(16)
    expect(document.coordinateSystem.calibrationStatus).toBe('NEEDS_REFERENCE')
    expect(document.metadata.dwgParser).toMatchObject({ name: 'acadrust-js / dwg-json', recordCount: 61 })
    expect(archive.layouts.map(layout => layout.name)).toEqual(['Layout1', 'Layout2'])
    expect(archive.tables.xrecords?.length).toBe(5)
    expect(originalDwgBytes(JSON.parse(JSON.stringify(archive)) as DwgDocument)).toEqual(fixture)
    const persisted = documentSchema.parse(JSON.parse(JSON.stringify(document)))
    expect(originalDwgBytes(persisted.metadata.dwgJson as DwgDocument)).toEqual(fixture)
    const packed = packDwgArchive(archive, `cad/${projectId}/fixture.dwg.json.gz`)
    expect(packed.bytes.byteLength).toBeLessThan(packed.reference.jsonByteLength)
    expect(originalDwgBytes(unpackDwgArchive(packed.bytes, packed.reference))).toEqual(fixture)
  })

  it('aceita calibração por medida de referência', async () => {
    const unscaled = await new DwgConverter().convert(source, projectId)
    const line = unscaled.sourceCad.rawEntities.find(entity => entity.type === 'LINE' && entity.points.length > 1)!
    const length = Math.hypot(line.points[1].x - line.points[0].x, line.points[1].y - line.points[0].y)
    const document = await new DwgConverter().convert(source, projectId, { entityId: line.id, lengthMeters: length * 0.001 })
    expect(document.coordinateSystem.metersPerSourceUnit).toBeCloseTo(0.001)
    expect(document.coordinateSystem.calibrationStatus).toBe('CONFIRMED')
    expect(document.sourceCad.rawEntities.find(entity => entity.type === 'CIRCLE')?.points[0].x).toBeCloseTo(0.2196812627452187)
  })

  it('recusa arquivo DXF renomeado como DWG', async () => {
    await expect(new DwgConverter().convert(new TextEncoder().encode('0\nSECTION\n').buffer, projectId))
      .rejects.toThrow('assinatura AutoCAD ausente')
  })
})
