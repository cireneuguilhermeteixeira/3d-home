import { issueSignedToken, presignUrl } from '@vercel/blob'
import { z } from 'zod'
import { ownedProject } from '@/lib/db'
import { saveLocalCad, validCadPath } from '@/lib/cad-storage'
import { failure } from '@/lib/http'

export const runtime = 'nodejs'
const maxSize = 50 * 1024 * 1024
const uploadRequest = z.object({ pathname: z.string(), size: z.number().int().positive().max(maxSize) })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id
    await ownedProject(id)
    if (request.headers.get('content-type')?.includes('multipart/form-data')) {
      if (process.env.NODE_ENV !== 'development') throw new Error('Upload local disponível somente em desenvolvimento')
      const form = await request.formData()
      const pathname = form.get('pathname')
      const file = form.get('file')
      if (typeof pathname !== 'string' || !validCadPath(id, pathname) || !(file instanceof File)) throw new Error('Arquivo CAD inválido')
      await saveLocalCad(id, pathname, new Uint8Array(await file.arrayBuffer()))
      return Response.json({ pathname })
    }
    const { pathname, size } = uploadRequest.parse(await request.json())
    if (!validCadPath(id, pathname)) {
      throw new Error('Nome de arquivo CAD inválido')
    }
    const validUntil = Date.now() + 10 * 60 * 1000
    let signedToken
    try {
      signedToken = await issueSignedToken({ pathname, operations: ['put'], validUntil, maximumSizeInBytes: size })
    } catch (error) {
      if (error instanceof Error && /No blob credentials found|No read-write token found/i.test(error.message)) {
        throw new Error('Vercel Blob não configurado. Conecte uma store Blob ao projeto Vercel com OIDC ou configure BLOB_READ_WRITE_TOKEN no ambiente local.')
      }
      throw error
    }
    const { presignedUrl } = await presignUrl(signedToken, {
      pathname, operation: 'put', access: 'private', validUntil,
      maximumSizeInBytes: size, addRandomSuffix: false,
    })
    return Response.json({ presignedUrl })
  } catch (error) {
    return failure(error)
  }
}
