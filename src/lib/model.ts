import { z } from 'zod'

export const point = z.object({ x: z.number().finite(), y: z.number().finite() })
export const color = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const material = z.object({ id: z.string(), name: z.string(), color: color.optional(), unitPrice: z.number().nonnegative().nullable().default(null), supplierUrl: z.url().nullable().default(null) })
const roomType = z.enum(['LIVING_ROOM','BEDROOM','KITCHEN','BATHROOM','OFFICE','GARAGE','BACKYARD','DECK','LAUNDRY','OTHER'])
export const entity = z.object({ id: z.string(), type: z.string(), layer: z.string().optional(), original: z.record(z.string(), z.unknown()), points: z.array(point).default([]), text: z.string().optional() })
export const wall = z.object({ id: z.string(), start: point, end: point, height: z.number().positive().nullable(), thickness: z.number().positive(), materialId: z.string().nullable(), color: color, roomIds: z.array(z.string()), openingIds: z.array(z.string()), sourceEntityIds: z.array(z.string()), measureSource: z.string().nullable() })
export const opening = z.object({ id: z.string(), type: z.enum(['DOOR','WINDOW','GATE','UNKNOWN']), wallId: z.string().nullable(), center: point, width: z.number().positive().nullable(), height: z.number().positive().nullable(), sillHeight: z.number().nonnegative().nullable(), positionAlongWall: z.number().nonnegative().nullable(), annotation: z.string().nullable(), sourceEntityIds: z.array(z.string()), properties: z.record(z.string(), z.unknown()).default({}) })
export const room = z.object({ id: z.string(), name: z.string(), type: roomType, polygon: z.array(point), center: point, area: z.number().nonnegative().nullable(), ceilingHeight: z.number().positive().nullable(), floorMaterialId: z.string().nullable(), wallMaterialId: z.string().nullable(), assetIds: z.array(z.string()), preferences: z.record(z.string(), z.unknown()).default({}), sourceEntityIds: z.array(z.string()) })
export const asset = z.object({ id: z.string(), catalogId: z.string(), roomId: z.string(), name: z.string(), position: z.object({ x: z.number(), y: z.number(), z: z.number() }), rotation: z.number(), scale: z.number().positive(), color: color.optional(), materialId: z.string().nullable(), price: z.number().nonnegative().nullable(), metadata: z.record(z.string(), z.unknown()).default({}) })
export const documentSchema = z.object({
  schemaVersion: z.literal(1), projectId: z.uuid(), revision: z.number().int().nonnegative(),
  site: z.object({ boundary: z.array(point), width: z.number().nonnegative().nullable(), depth: z.number().nonnegative().nullable() }),
  coordinateSystem: z.object({ unit: z.literal('m'), sourceUnit: z.string().nullable(), metersPerSourceUnit: z.number().positive().nullable(), calibrationStatus: z.enum(['CONFIRMED','NEEDS_REFERENCE']) }),
  sourceCad: z.object({ fileId: z.string().nullable(), format: z.enum(['DWG','DXF']).nullable(), rawEntities: z.array(entity), header: z.record(z.string(), z.unknown()).default({}), blocks: z.record(z.string(), z.unknown()).default({}) }),
  rooms: z.array(room), walls: z.array(wall), openings: z.array(opening), surfaces: z.array(z.object({ id: z.string(), roomId: z.string().nullable(), kind: z.enum(['FLOOR','CEILING','OTHER']), polygon: z.array(point), materialId: z.string().nullable() })),
  assets: z.array(asset), preferences: z.object({ styles: z.array(z.string()), features: z.array(z.string()), brief: z.string() }), materials: z.record(z.string(), material),
  camera: z.object({ position: z.object({ x: z.number(), y: z.number(), z: z.number() }), direction: z.object({ x: z.number(), y: z.number(), z: z.number() }), fov: z.number().positive(), roomId: z.string().nullable(), timeOfDay: z.string() }),
  metadata: z.record(z.string(), z.unknown())
})
export type ProjectDocument = z.infer<typeof documentSchema>
export type Point = z.infer<typeof point>

export function emptyDocument(projectId: string, preferences?: Partial<ProjectDocument['preferences']>): ProjectDocument {
  return { schemaVersion: 1, projectId, revision: 0, site: { boundary: [], width: null, depth: null }, coordinateSystem: { unit: 'm', sourceUnit: null, metersPerSourceUnit: null, calibrationStatus: 'NEEDS_REFERENCE' }, sourceCad: { fileId: null, format: null, rawEntities: [], header: {}, blocks: {} }, rooms: [], walls: [], openings: [], surfaces: [], assets: [], preferences: { styles: preferences?.styles ?? [], features: preferences?.features ?? [], brief: preferences?.brief ?? '' }, materials: {wood:{id:'wood',name:'Madeira',color:'#a98a64',unitPrice:null,supplierUrl:null},porcelain:{id:'porcelain',name:'Porcelanato cinza-claro',color:'#c7c9c5',unitPrice:null,supplierUrl:null},concrete:{id:'concrete',name:'Cimento queimado',color:'#a6a6a0',unitPrice:null,supplierUrl:null}}, camera: { position: {x:0,y:1.65,z:0}, direction:{x:0,y:0,z:-1}, fov:60, roomId:null, timeOfDay:'day' }, metadata: {} }
}
