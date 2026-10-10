import { useEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { HouseScene } from './HouseScene'
import type { AttentionPoint, LayoutMode, Point, Scene } from '../types'

type ViewMode = 'cad' | '3d'
const STORAGE_KEY = 'casa628.attention-points.v1'

function loadAttentionPoints(): AttentionPoint[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(saved)) return []
    return saved.filter((point): point is AttentionPoint =>
      typeof point?.id === 'string' && typeof point?.note === 'string' &&
      Number.isFinite(point?.position?.x) && Number.isFinite(point?.position?.y) &&
      (point?.layoutMode === 'ORIGINAL_LAYOUT' || point?.layoutMode === 'RECTIFIED_LAYOUT'))
  } catch { return [] }
}

function exportPoint(point: AttentionPoint) {
  return { id: point.id, message: point.note, roomNumber: point.roomNumber,
    layoutMode: point.layoutMode, coordinatesMeters: {
      x: Number(point.position.x.toFixed(3)), y: Number(point.position.y.toFixed(3)) } }
}

export default function HouseViewer3D() {
  const [scene, setScene] = useState<Scene | null>(null)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<ViewMode>(new URLSearchParams(window.location.search).get('view') === '3d' ? '3d' : 'cad')
  const [layout, setLayout] = useState<LayoutMode>('ORIGINAL_LAYOUT')
  const [reset, setReset] = useState(0)
  const [attentionPoints, setAttentionPoints] = useState(loadAttentionPoints)
  const [placing, setPlacing] = useState(false)
  const [draft, setDraft] = useState<AttentionPoint | null>(null)
  const [copyStatus, setCopyStatus] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/house/scene?layout=' + layout, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('A API retornou ' + response.status); return response.json() })
      .then((loaded: Scene) => { setScene(loaded); setError('') })
      .catch(err => { if (err.name !== 'AbortError') setError('Não foi possível carregar a planta. Verifique se o backend e o PostGIS estão ativos.') })
    return () => controller.abort()
  }, [layout])

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(attentionPoints)) }, [attentionPoints])
  useEffect(() => {
    if (!draft) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setDraft(null) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [draft])

  const counts = useMemo(() => ({ paths: scene?.lines.length ?? 0, walls: scene?.walls.length ?? 0,
    windows: scene?.openings.filter(o => o.type === 'WINDOW').length ?? 0,
    doors: scene?.openings.filter(o => o.type === 'DOOR').length ?? 0,
    gates: scene?.openings.filter(o => o.type === 'GATE' && o.spanStart).length ?? 0 }), [scene])
  const empty = scene && counts.paths === 0
  const exportText = JSON.stringify(attentionPoints.map(exportPoint), null, 2)

  const startPlacing = () => { setMode('cad'); setPlacing(true); setDraft(null); setCopyStatus('') }
  const pickPoint = (position: Point) => {
    const next = Math.max(0, ...attentionPoints.map(point => Number(point.id.match(/^P(\d+)$/)?.[1] ?? 0))) + 1
    setDraft({ id: 'P' + String(next).padStart(3, '0'), layoutMode: layout, position, note: '', roomNumber: null })
    setPlacing(false)
  }
  const savePoint = () => {
    if (!draft?.note.trim()) return
    const saved = { ...draft, note: draft.note.trim() }
    setAttentionPoints(points => [...points.filter(point => point.id !== saved.id), saved])
    console.info('Casa 628 · ponto de atenção:', JSON.stringify(exportPoint(saved)))
    setDraft(null)
  }
  const deletePoint = () => {
    if (!draft) return
    setAttentionPoints(points => points.filter(point => point.id !== draft.id))
    setDraft(null)
  }
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setCopyStatus('Copiado. Cole os dados na conversa.') }
    catch { setCopyStatus('Selecione o JSON abaixo e copie manualmente.') }
  }

  return <main className="app-shell">
    <header className="topbar">
      <div className="identity"><span className="identity-mark">628</span><div><h1>Casa 628</h1><p>Leitura espacial da planta</p></div></div>
      <div className="project-meta"><span>TERRENO</span><strong>{scene ? scene.site.width + ' × ' + scene.site.depth + ' m' : '12 × 33 m'}</strong></div>
    </header>
    <section className={'workspace' + (placing ? ' placing-point' : '')} aria-label="Visualização da casa">
      {scene && !empty && <Canvas key={mode} orthographic={mode === 'cad'} shadows dpr={[1, 2]} gl={{ antialias: true }}>
        <HouseScene scene={scene} mode={mode} reset={reset} attentionPoints={attentionPoints} placing={placing}
          onPick={pickPoint} onSelectPoint={id => { setPlacing(false); setDraft(attentionPoints.find(point => point.id === id) ?? null) }} />
      </Canvas>}
      {!scene && !error && <div className="state-message">Carregando a planta…</div>}
      {error && <div className="state-message error">{error}</div>}
      {empty && <div className="state-message">Nenhuma geometria importada. Defina <code>HOUSE_IMPORT_FILE</code> e reinicie o backend.</div>}
      {scene && !empty && <div className="canvas-label">{placing ? 'CLIQUE NA PLANTA PARA MARCAR' : mode === 'cad' ? 'PLANTA · MODO CAD' : 'MODELO · VISTA 3D'}</div>}
      <div className="layout-controls" aria-label="Transformação da planta">
        <span>GEOMETRIA</span>
        <button type="button" className={layout === 'ORIGINAL_LAYOUT' ? 'active' : ''} onClick={() => { setLayout('ORIGINAL_LAYOUT'); setPlacing(false) }}>Original</button>
        <button type="button" className={layout === 'RECTIFIED_LAYOUT' ? 'active' : ''} onClick={() => { setLayout('RECTIFIED_LAYOUT'); setPlacing(false) }}>Retificada</button>
      </div>
      <div className="view-controls" aria-label="Controles da câmera">
        <button type="button" className={mode === 'cad' ? 'active' : ''} onClick={() => setMode('cad')}>Vista superior · CAD</button>
        <button type="button" className={mode === '3d' ? 'active' : ''} onClick={() => { setMode('3d'); setPlacing(false) }}>Vista 3D</button>
        <span className="control-divider" aria-hidden="true" />
        <button type="button" onClick={() => setReset(value => value + 1)}>Centralizar</button>
      </div>
      <div className="compass" aria-hidden="true"><span>N</span><i /></div>
      <aside className="attention-panel" aria-label="Pontos de atenção">
        <strong>Pontos de atenção</strong>
        <p>Marque um local e descreva a correção. As coordenadas ficam em metros no modo selecionado.</p>
        <button type="button" className="attention-add" onClick={placing ? () => setPlacing(false) : startPlacing}>
          {placing ? 'Cancelar marcação' : '+ Adicionar ponto'}
        </button>
        {attentionPoints.length > 0 && <>
          <div className="attention-list">{attentionPoints.map(point => <button type="button" key={point.id}
            onClick={() => { setPlacing(false); setDraft(point) }}>
            <b>{point.id}</b><span>{point.note}</span><small>{point.layoutMode === 'ORIGINAL_LAYOUT' ? 'Original' : 'Retificada'} · {point.position.x.toFixed(2)}, {point.position.y.toFixed(2)} m</small>
          </button>)}</div>
          <button type="button" className="attention-copy" onClick={() => copy(exportText)}>Copiar todos para enviar</button>
          <details><summary>Ver JSON para copiar</summary><textarea readOnly value={exportText} aria-label="Pontos de atenção em JSON" /></details>
        </>}
        {copyStatus && <small className="copy-status" role="status">{copyStatus}</small>}
      </aside>
      {draft && <div className="attention-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setDraft(null) }}>
        <form className="attention-dialog" role="dialog" aria-modal="true" aria-label={'Ponto de atenção ' + draft.id}
          onSubmit={event => { event.preventDefault(); savePoint() }}>
          <div className="dialog-heading"><div><small>PONTO DE ATENÇÃO</small><h2>{draft.id}</h2></div><button type="button" onClick={() => setDraft(null)} aria-label="Fechar">×</button></div>
          <p className="dialog-coordinates">{draft.layoutMode === 'ORIGINAL_LAYOUT' ? 'Geometria original' : 'Geometria retificada'} · X {draft.position.x.toFixed(3)} m · Y {draft.position.y.toFixed(3)} m</p>
          <label htmlFor="attention-room">Ambiente, se souber</label>
          <select id="attention-room" value={draft.roomNumber ?? ''} onChange={event => setDraft({ ...draft, roomNumber: event.target.value || null })}>
            <option value="">Não informado</option>
            {scene?.rooms.map(room => <option key={room.id} value={room.number}>{room.name ?? 'Ambiente ' + room.number}</option>)}
          </select>
          <label htmlFor="attention-note">O que precisa ser corrigido?</label>
          <textarea id="attention-note" autoFocus required maxLength={1200} value={draft.note}
            onChange={event => setDraft({ ...draft, note: event.target.value })}
            placeholder="Ex.: falta uma parede neste trecho; esta abertura é uma janela, não uma porta." />
          <div className="dialog-actions">
            {attentionPoints.some(point => point.id === draft.id) && <button type="button" className="delete" onClick={deletePoint}>Excluir</button>}
            <button type="button" onClick={() => setDraft(null)}>Cancelar</button>
            <button type="submit" className="primary">Salvar ponto</button>
          </div>
        </form>
      </div>}
    </section>
    <footer className="statusbar">
      <div className="status-items"><span><b>{counts.paths}</b> trechos vetoriais</span><span><b>{counts.walls}</b> paredes consolidadas</span><span><b>{counts.windows}</b> janelas anotadas</span><span><b>{counts.doors}</b> portas identificadas</span><span><b>{counts.gates}</b> portões com span candidato</span></div>
      <div className="legend"><span><i className="swatch wall"/> Faces pareadas</span><span><i className="swatch estimated"/> Altura visual provisória</span><span><i className="swatch line"/> Referência vetorial</span></div>
      <p>Arraste para girar · botão direito para mover · roda para ampliar</p>
    </footer>
  </main>
}
