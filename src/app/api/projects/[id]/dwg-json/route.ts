import { readProject } from '@/lib/db'
import { loadDwgArchiveBytes, type DwgArchiveReference } from '@/lib/dwg-archive'
import { failure } from '@/lib/http'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id
    const { document } = await readProject(id)
    const reference = document.metadata.dwgArchive as DwgArchiveReference | undefined
    if (!reference) throw new Error('JSON DWG não disponível para este projeto')
    const bytes = await loadDwgArchiveBytes(id, reference)
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Encoding': 'gzip',
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return failure(error)
  }
}
