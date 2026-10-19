'use client'

/** Sends CAD data directly from the browser to a private Blob via a short-lived URL. */
export async function uploadCadFile(projectId: string, file: File): Promise<{ pathname: string }> {
  if (!/\.(dwg|dxf)$/i.test(file.name) || file.size < 1 || file.size > 50 * 1024 * 1024) {
    throw new Error('Envie um arquivo DWG ou DXF de até 50 MB')
  }
  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_')
  const pathname = `cad/${projectId}/${crypto.randomUUID()}-${safeName}`
  const authorization = await fetch(`/api/projects/${projectId}/upload`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pathname, size: file.size }),
  })
  const authorizationBody = await authorization.json().catch(() => null) as { presignedUrl?: string; error?: string } | null
  if (!authorization.ok) {
    if (authorization.status === 503 && authorizationBody?.error?.includes('Vercel Blob não configurado')) {
      const form = new FormData()
      form.set('pathname', pathname)
      form.set('file', file)
      const local = await fetch(`/api/projects/${projectId}/upload`, { method: 'POST', body: form })
      const result = await local.json().catch(() => null) as { pathname?: string; error?: string } | null
      if (!local.ok || result?.pathname !== pathname) throw new Error(result?.error ?? 'Falha ao armazenar CAD localmente')
      return { pathname }
    }
    throw new Error(authorizationBody?.error ?? `Falha ao autorizar upload (HTTP ${authorization.status})`)
  }
  if (!authorizationBody?.presignedUrl) throw new Error('URL de upload não recebida do servidor')
  const transferred = await fetch(authorizationBody.presignedUrl, {
    method: 'PUT', body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  })
  if (!transferred.ok) {
    const transferBody = await transferred.json().catch(() => null) as { error?: string } | null
    throw new Error(transferBody?.error ?? `Falha ao enviar arquivo ao Vercel Blob (HTTP ${transferred.status})`)
  }
  const result = await transferred.json().catch(() => null) as { pathname?: string } | null
  if (result?.pathname !== pathname) throw new Error('Resposta de upload CAD inválida')
  return { pathname }
}
