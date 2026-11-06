import { convertDwgBuffer, to3dHomeSourceCad } from 'dwg-json'
import { DxfConverter, type CadConverter, type CadRawEntity } from './cad'
import type { ProjectDocument } from './model'

/** DWG data is retained as a complete JSON archive in document.metadata.dwgJson. */
export class DwgConverter implements CadConverter<ArrayBuffer> {
  async convert(input: ArrayBuffer, projectId: string, reference?: { entityId: string; lengthMeters: number }): Promise<ProjectDocument> {
    if (input.byteLength < 6 || !/^AC10\d{2}$/.test(new TextDecoder('ascii').decode(input.slice(0, 6)))) {
      throw new Error('DWG inválido: assinatura AutoCAD ausente')
    }

    const archive = convertDwgBuffer(new Uint8Array(input))
    if (archive.completeness.parseStatus === 'archive-only') {
      throw new Error(`DWG preservado, mas estrutura ainda não suportada: ${archive.diagnostics[0]?.message ?? archive.source.dwgVersion}`)
    }

    const spaceName = archive.modelSpace.entities.length
      ? 'Model'
      : archive.layouts.find(layout => layout.entities.length)?.name
    if (!spaceName) throw new Error('DWG sem entidades legíveis em modelo ou layout')

    const source = to3dHomeSourceCad(archive, spaceName)
    const raw: CadRawEntity[] = source.rawEntities.map(entity => ({
      handle: entity.id,
      type: entity.type,
      layer: entity.layer,
      vertices: entity.points,
      text: entity.text,
      closed: entity.original.closed === true,
      originalCad: entity.original,
    }))
    // Keep the editor document small; the archive retains every block body.
    const blockIndex = Object.fromEntries(archive.blocks.map(block => [block.name, {
      handleHex: block.handleHex,
      name: block.name,
      entityHandleHexes: block.entityHandleHexes,
      layoutHandleHex: block.layoutHandleHex,
      base: block.base,
    }]))
    const document = new DxfConverter().convertEntities(
      raw, archive.header as Record<string, unknown>, blockIndex, projectId, reference,
    )
    document.sourceCad.format = 'DWG'
    document.metadata.dwgParser = {
      name: 'acadrust-js / dwg-json',
      parseStatus: archive.completeness.parseStatus,
      decodedRecordCount: archive.completeness.decodedRecordCount,
      recordCount: archive.completeness.recordCount,
      activeSpace: spaceName,
    }
    document.metadata.dwgJson = archive
    return document
  }
}
