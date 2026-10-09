import { useEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { HouseScene } from './HouseScene'
import type { LayoutMode, Scene } from '../types'

type ViewMode = 'cad' | '3d'

export default function HouseViewer3D() {
  const [scene, setScene] = useState<Scene | null>(null)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<ViewMode>(new URLSearchParams(window.location.search).get('view') === '3d' ? '3d' : 'cad')
  const [layout, setLayout] = useState<LayoutMode>('ORIGINAL_LAYOUT')
  const [reset, setReset] = useState(0)
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/house/scene?layout=${layout}`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(`A API retornou ${response.status}`); return response.json() })
      .then(setScene)
      .catch(err => { if (err.name !== 'AbortError') setError('Não foi possível carregar a planta. Verifique se o backend e o PostGIS estão ativos.') })
    return () => controller.abort()
  }, [layout])

  const counts = useMemo(() => ({ paths: scene?.lines.length ?? 0, walls: scene?.walls.length ?? 0,
    windows: scene?.openings.filter(o => o.type === 'WINDOW').length ?? 0,
    doors: scene?.openings.filter(o => o.type === 'DOOR').length ?? 0,
    gates: scene?.openings.filter(o => o.type === 'GATE' && o.spanStart).length ?? 0 }), [scene])
  const empty = scene && counts.paths === 0

  return <main className="app-shell">
    <header className="topbar">
      <div className="identity"><span className="identity-mark">628</span><div><h1>Casa 628</h1><p>Leitura espacial da planta</p></div></div>
      <div className="project-meta"><span>TERRENO</span><strong>{scene ? `${scene.site.width} × ${scene.site.depth} m` : '12 × 33 m'}</strong></div>
    </header>
    <section className="workspace" aria-label="Visualização da casa">
      {scene && !empty && <Canvas key={mode} orthographic={mode === 'cad'} shadows dpr={[1, 2]} gl={{ antialias: true }}><HouseScene scene={scene} mode={mode} reset={reset} selectedRoom={selectedRoom} onSelectRoom={setSelectedRoom} /></Canvas>}
      {!scene && !error && <div className="state-message">Carregando a planta…</div>}
      {error && <div className="state-message error">{error}</div>}
      {empty && <div className="state-message">Nenhuma geometria importada. Defina <code>HOUSE_IMPORT_FILE</code> e reinicie o backend.</div>}
      {scene && !empty && <div className="canvas-label">{mode === 'cad' ? 'PLANTA · MODO CAD' : 'MODELO · VISTA 3D'}</div>}
      <div className="layout-controls" aria-label="Transformação da planta">
        <span>GEOMETRIA</span>
        <button type="button" className={layout === 'ORIGINAL_LAYOUT' ? 'active' : ''} onClick={() => setLayout('ORIGINAL_LAYOUT')}>Original</button>
        <button type="button" className={layout === 'RECTIFIED_LAYOUT' ? 'active' : ''} onClick={() => setLayout('RECTIFIED_LAYOUT')}>Retificada</button>
      </div>
      <div className="view-controls" aria-label="Controles da câmera">
        <button type="button" className={mode === 'cad' ? 'active' : ''} onClick={() => setMode('cad')}>Vista superior · CAD</button>
        <button type="button" className={mode === '3d' ? 'active' : ''} onClick={() => setMode('3d')}>Vista 3D</button>
        <span className="control-divider" aria-hidden="true" />
        <button type="button" onClick={() => setReset(value => value + 1)}>Centralizar</button>
      </div>
      <div className="compass" aria-hidden="true"><span>N</span><i /></div>
      {scene && scene.rooms.length > 0 && <div className="room-index" aria-label="Ambientes numerados na planta">
        <strong>Ambientes da planta</strong>
        <div>{scene.rooms.map(room => <button type="button" key={room.id}
          className={selectedRoom === room.number ? 'selected' : ''} onClick={() => setSelectedRoom(room.number)}
          title={`Marcar ambiente ${room.number}`}><b>{room.number}</b><span>{room.name ?? `Ambiente ${room.number}`}</span></button>)}</div>
        <small>Numeração original do desenho; limites dos cômodos ainda em conferência.</small>
      </div>}
    </section>
    <footer className="statusbar">
      <div className="status-items"><span><b>{counts.paths}</b> trechos vetoriais</span><span><b>{counts.walls}</b> paredes consolidadas</span><span><b>{counts.windows}</b> janelas anotadas</span><span><b>{counts.doors}</b> portas identificadas</span><span><b>{counts.gates}</b> portões com span candidato</span></div>
      <div className="legend"><span><i className="swatch wall"/> Faces pareadas</span><span><i className="swatch estimated"/> Altura visual provisória</span><span><i className="swatch line"/> Referência vetorial</span></div>
      <p>Arraste para girar · botão direito para mover · roda para ampliar</p>
    </footer>
  </main>
}
