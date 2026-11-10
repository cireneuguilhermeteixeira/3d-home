import { get, head } from '@vercel/blob'
import { z } from 'zod'
import { db, readProject, writeDraft } from '@/lib/db'
import { DxfConverter } from '@/lib/cad'
import { DwgConverter } from '@/lib/dwg'
import { dwgArchivePathname, loadDwgArchiveBytes, saveDwgArchive, unpackDwgArchive, type DwgArchiveReference } from '@/lib/dwg-archive'
import { findDwgPlans } from '@/lib/dwg-plans'
import type { DwgDocument } from 'dwg-json'
import { loadLocalCad, validCadPath } from '@/lib/cad-storage'
import { failure } from '@/lib/http'

export const runtime = 'nodejs'
export const maxDuration = 60
const input = z.object({
  pathname: z.string().optional(),
  fileId: z.string().uuid().optional(),
  planId: z.string().optional(),
  reference: z.object({ entityId: z.string(), lengthMeters: z.number().positive() }).optional(),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id
    const body = input.parse(await request.json())
    const current = await readProject(id)
    let pathname = body.pathname
    if (body.fileId) {
      const rows = await db()`SELECT pathname FROM project_files WHERE id=${body.fileId} AND project_id=${id}`
      if (!rows.length) throw new Error('Arquivo CAD não encontrado')
      pathname = rows[0].pathname
    }
    if (!pathname || !validCadPath(id, pathname)) throw new Error('Arquivo não pertence ao projeto')
    const format = pathname.toLowerCase().endsWith('.dwg') ? 'DWG' : pathname.toLowerCase().endsWith('.dxf') ? 'DXF' : null
    if (!format) throw new Error('Formato CAD inválido')
    const local = await loadLocalCad(id, pathname)
    const meta = local ?? await head(pathname)
    if (meta.size < 1 || meta.size > 50 * 1024 * 1024) throw new Error('Arquivo CAD vazio ou maior que 50 MB')
    const existing = await db()`SELECT id FROM project_files WHERE project_id=${id} AND pathname=${pathname} ORDER BY created_at DESC LIMIT 1`
    const fileId = body.fileId ?? existing[0]?.id ?? crypto.randomUUID()
    if (!existing.length) {
      await db()`INSERT INTO project_files(id,project_id,pathname,url,format,size_bytes) VALUES(${fileId},${id},${pathname},${meta.url},${format},${meta.size})`
    }
    const blob = local ? null : await get(pathname, { access: 'private' })
    if (!local && blob?.statusCode !== 200) throw new Error('Arquivo CAD não encontrado no armazenamento')
    const source = local ? Uint8Array.from(local.bytes).buffer : await new Response(blob!.stream).arrayBuffer()
    const imported = format === 'DWG'
      ? await new DwgConverter().convert(source, id, body.reference, body.planId)
      : new DxfConverter().convert(new TextDecoder().decode(source), id, body.reference)
    if (format === 'DWG') {
      const archive = imported.metadata.dwgJson as DwgDocument
      const previous = current.document.metadata.dwgArchive as DwgArchiveReference | undefined
      const archivePath = dwgArchivePathname(id, pathname)
      imported.metadata.dwgArchive = previous?.pathname === archivePath && previous.sourceSha256 === archive.source.sha256
        ? previous
        : await saveDwgArchive(id, pathname, archive, !!local)
      delete imported.metadata.dwgJson
    }
    imported.preferences = current.document.preferences
    imported.materials = current.document.materials
    imported.sourceCad.fileId = fileId
    imported.sourceCad.format = format
    const draftVersion = await writeDraft(id, imported, current.draftVersion, current.baseRevision, true)
    return Response.json({ status: imported.coordinateSystem.calibrationStatus, document: imported, draftVersion, baseRevision: current.baseRevision })
  } catch (error) {
    return failure(error)
  }
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id
    const current=await readProject(id)
    const files = await db()`SELECT id,pathname,format,created_at FROM project_files WHERE project_id=${id} ORDER BY created_at DESC`
    let plans=current.document.metadata.dwgPlans
    const archive=current.document.metadata.dwgArchive as DwgArchiveReference|undefined
    if(!plans&&archive){
      const document=unpackDwgArchive(await loadDwgArchiveBytes(id,archive),archive)
      plans=findDwgPlans(document)
    }
    if(Array.isArray(plans)){
      const seen=new Set<string>()
      plans=plans.filter((plan:{blockName?:string;id:string})=>{const key=plan.blockName??plan.id;if(seen.has(key))return false;seen.add(key);return true})
    }
    return Response.json({ latestFile: files[0] ?? null, files, plans:plans??[] })
  } catch (error) {
    return failure(error)
  }
}
