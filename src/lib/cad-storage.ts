import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.join(process.cwd(), '.forma-local-files')
const maxSize = 50 * 1024 * 1024

export function validCadPath(projectId: string, pathname: string): boolean {
  return new RegExp(`^cad/${projectId}/[a-f0-9-]{36}-[A-Za-z0-9._-]+\\.(dwg|dxf)$`, 'i').test(pathname) && !pathname.includes('..')
}

function localPath(projectId: string, pathname: string): string {
  if (!validCadPath(projectId, pathname)) throw new Error('Nome de arquivo CAD inválido')
  return path.join(root, pathname)
}

export async function saveLocalCad(projectId: string, pathname: string, bytes: Uint8Array): Promise<void> {
  if (process.env.NODE_ENV !== 'development') throw new Error('Armazenamento local disponível somente em desenvolvimento')
  if (bytes.byteLength < 1 || bytes.byteLength > maxSize) throw new Error('Envie um arquivo DWG ou DXF de até 50 MB')
  const target = localPath(projectId, pathname)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, bytes, { flag: 'wx' })
}

export async function loadLocalCad(projectId: string, pathname: string): Promise<{ bytes: Buffer; size: number; url: string } | null> {
  if (process.env.NODE_ENV !== 'development') return null
  const target = localPath(projectId, pathname)
  try {
    const info = await stat(target)
    if (info.size < 1 || info.size > maxSize) throw new Error('Arquivo CAD vazio ou maior que 50 MB')
    return { bytes: await readFile(target), size: info.size, url: `local://${pathname}` }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
}
