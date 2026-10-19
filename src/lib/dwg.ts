import path from 'node:path'
import { Dwg_File_Type, LibreDwg, type DwgDatabase } from '@mlightcad/libredwg-web'
import { DxfConverter, type CadConverter, type CadRawEntity } from './cad'
import type { ProjectDocument } from './model'

type Coordinate = { x: number; y: number; z?: number }
type JsonSafe<T> = T extends bigint ? string : T extends (infer Item)[] ? JsonSafe<Item>[] : T extends object ? { [Key in keyof T]: JsonSafe<T[Key]> } : T

/** JSONB has no BigInt type; retain exact CAD values as decimal strings. */
export function jsonSafeDwg<T>(value: T): JsonSafe<T> {
  return JSON.parse(JSON.stringify(value, (_, item: unknown) => typeof item === 'bigint' ? item.toString() : item)) as JsonSafe<T>
}
function point(value: unknown): Coordinate | undefined {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Record<string, unknown>
  if (typeof candidate.x !== 'number' || typeof candidate.y !== 'number') return undefined
  return { x: candidate.x, y: candidate.y, ...(typeof candidate.z === 'number' ? { z: candidate.z } : {}) }
}
function pointArray(value: unknown): Coordinate[] | undefined {
  return Array.isArray(value) ? value.map(point).filter((item): item is Coordinate => !!item) : undefined
}

/** Adapt LibreDWG entities to the shared CAD normalizer while retaining each full source entity. */
export function entitiesFromDwg(database: DwgDatabase): CadRawEntity[] {
  return database.entities.map((entity) => {
    const original = entity as unknown as Record<string, unknown>
    const type = entity.type === 'POLYLINE2D' || entity.type === 'POLYLINE3D' ? 'POLYLINE' : entity.type
    const adapted: CadRawEntity = {
      handle: entity.handle, type, layer: entity.layer,
      originalCad: original,
      text: typeof original.text === 'string' ? original.text : undefined,
    }
    if (type === 'LINE') {
      adapted.start = point(original.startPoint)
      adapted.end = point(original.endPoint)
    } else if (type === 'LWPOLYLINE' || type === 'POLYLINE') {
      adapted.vertices = pointArray(original.vertices)
      adapted.closed = !!((Number(original.flag) || 0) & 1)
    } else if (type === 'CIRCLE' || type === 'ARC') {
      adapted.center = point(original.center)
      adapted.radius = Number(original.radius)
      // LibreDWG exposes angles in radians; the shared normalizer expects degrees.
      if (type === 'ARC') {
        adapted.startAngle = Number(original.startAngle) * 180 / Math.PI
        adapted.endAngle = Number(original.endAngle) * 180 / Math.PI
      }
    } else if (type === 'SPLINE') {
      adapted.vertices = pointArray(original.fitPoints)?.length ? pointArray(original.fitPoints) : pointArray(original.controlPoints)
    } else if (type === 'ELLIPSE') {
      const center = point(original.center), axis = point(original.majorAxisEndPoint)
      if (center && axis) {
        const ratio = Number(original.axisRatio)
        const start = Number(original.startAngle), end = Number(original.endAngle)
        const stepCount = Math.max(16, Math.ceil(Math.abs(end - start) * 12))
        adapted.vertices = Array.from({ length: stepCount + 1 }, (_, index) => {
          const angle = start + (end - start) * index / stepCount
          return { x: center.x + axis.x * Math.cos(angle) - axis.y * ratio * Math.sin(angle), y: center.y + axis.y * Math.cos(angle) + axis.x * ratio * Math.sin(angle) }
        })
      }
    } else {
      adapted.position = point(original.insertionPoint) ?? point(original.startPoint) ?? point(original.definitionPoint)
    }
    return adapted
  })
}

export class DwgConverter implements CadConverter<ArrayBuffer> {
  async convert(input: ArrayBuffer, projectId: string, reference?: { entityId: string; lengthMeters: number }): Promise<ProjectDocument> {
    if (input.byteLength < 6 || !new TextDecoder('ascii').decode(input.slice(0, 4)).startsWith('AC10')) {
      throw new Error('DWG inválido: assinatura AutoCAD ausente')
    }
    const wasmDirectory = path.join(process.cwd(), 'node_modules/@mlightcad/libredwg-web/wasm')
    const parser = await LibreDwg.create(wasmDirectory)
    let data: number | undefined
    try {
      data = parser.dwg_read_data(input, Dwg_File_Type.DWG)
      if (!data) throw new Error('LibreDWG não conseguiu ler este DWG')
      const { database, stats } = parser.convertEx(data)
      if (!database.entities.length) throw new Error('DWG sem entidades legíveis no espaço de modelo')
      const header = jsonSafeDwg({ ...(database.header as unknown as Record<string, unknown>), $INSUNITS: database.header.INSUNITS ?? 0 })
      const blocks = jsonSafeDwg(Object.fromEntries(database.tables.BLOCK_RECORD.entries.map(block => [block.name, block])) as Record<string, unknown>)
      const document = new DxfConverter().convertEntities(jsonSafeDwg(entitiesFromDwg(database)), header, blocks, projectId, reference)
      document.sourceCad.format = 'DWG'
      document.metadata.dwgParser = { name: 'LibreDWG WebAssembly', unknownEntityCount: stats.unknownEntityCount }
      return document
    } catch (error) {
      if (error instanceof Error && /DWG sem|LibreDWG não/.test(error.message)) throw error
      throw new Error(`Falha ao interpretar DWG com LibreDWG: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      if (data) parser.dwg_free(data)
    }
  }
}
