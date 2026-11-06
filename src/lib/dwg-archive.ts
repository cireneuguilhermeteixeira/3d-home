import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
import { get, put } from '@vercel/blob'
import { originalDwgBytes, type DwgDocument } from 'dwg-json'
import { validCadPath } from './cad-storage'

export interface DwgArchiveReference {
  encoding: 'gzip'
  pathname: string
  sourceSha256: string
  jsonSha256: string
  gzipSha256: string
  jsonByteLength: number
  gzipByteLength: number
  layouts: string[]
}

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

export function packDwgArchive(document: DwgDocument, pathname: string): { bytes: Buffer; reference: DwgArchiveReference } {
  const json = Buffer.from(JSON.stringify(document))
  const bytes = gzipSync(json, { level: 6 })
  return {
    bytes,
    reference: {
      encoding: 'gzip', pathname,
      sourceSha256: document.source.sha256,
      jsonSha256: hash(json), gzipSha256: hash(bytes),
      jsonByteLength: json.byteLength, gzipByteLength: bytes.byteLength,
      layouts: document.layouts.map(layout => layout.name),
    },
  }
}

export function unpackDwgArchive(bytes: Uint8Array, reference: DwgArchiveReference): DwgDocument {
  if (bytes.byteLength !== reference.gzipByteLength || hash(bytes) !== reference.gzipSha256) {
    throw new Error('Arquivo JSON DWG compactado não confere com SHA-256')
  }
  const json = gunzipSync(bytes)
  if (json.byteLength !== reference.jsonByteLength || hash(json) !== reference.jsonSha256) {
    throw new Error('JSON DWG recuperado não confere com SHA-256')
  }
  const document = JSON.parse(json.toString('utf8')) as DwgDocument
  if (document.source.sha256 !== reference.sourceSha256) throw new Error('DWG original não confere com o arquivo JSON')
  originalDwgBytes(document)
  return document
}

export function dwgArchivePathname(projectId: string, cadPathname: string): string {
  if (!validCadPath(projectId, cadPathname) || !cadPathname.toLowerCase().endsWith('.dwg')) {
    throw new Error('Caminho DWG inválido para arquivo JSON')
  }
  return `${cadPathname}.json.gz`
}

export async function saveDwgArchive(
  projectId: string, cadPathname: string, document: DwgDocument, local: boolean,
): Promise<DwgArchiveReference> {
  const pathname = dwgArchivePathname(projectId, cadPathname)
  const { bytes, reference } = packDwgArchive(document, pathname)
  if (local) {
    if (process.env.NODE_ENV !== 'development') throw new Error('Arquivo JSON local disponível somente em desenvolvimento')
    const target = path.join(process.cwd(), '.forma-local-files', pathname)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, bytes)
  } else {
    await put(pathname, bytes, { access: 'private', contentType: 'application/gzip', addRandomSuffix: false, allowOverwrite: true })
  }
  return reference
}

export async function loadDwgArchiveBytes(projectId: string, reference: DwgArchiveReference): Promise<Buffer> {
  if (!reference.pathname.startsWith(`cad/${projectId}/`) ||
    dwgArchivePathname(projectId, reference.pathname.slice(0, -'.json.gz'.length)) !== reference.pathname) {
    throw new Error('Arquivo JSON DWG não pertence ao projeto')
  }
  if (process.env.NODE_ENV === 'development') {
    try {
      const bytes = await readFile(path.join(process.cwd(), '.forma-local-files', reference.pathname))
      if (bytes.byteLength !== reference.gzipByteLength || hash(bytes) !== reference.gzipSha256) {
        throw new Error('Arquivo JSON DWG compactado não confere com SHA-256')
      }
      return bytes
    } catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error
    }
  }
  const blob = await get(reference.pathname, { access: 'private' })
  if (blob?.statusCode !== 200) throw new Error('Arquivo JSON DWG não encontrado')
  const bytes = Buffer.from(await new Response(blob.stream).arrayBuffer())
  if (bytes.byteLength !== reference.gzipByteLength || hash(bytes) !== reference.gzipSha256) {
    throw new Error('Arquivo JSON DWG compactado não confere com SHA-256')
  }
  return bytes
}
