import { useEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { HouseScene } from './HouseScene'
import type { Scene } from '../types'

type ViewMode = 'top' | '3d'

export default function HouseViewer3D() {
  const [scene, setScene] = useState<Scene | null>(null)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<ViewMode>(new URLSearchParams(window.location.search).get('view') === '3d' ? '3d' : 'top')
  const [reset, setReset] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/house/scene', { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(`A API retornou ${response.status}`); return response.json() })
      .then(setScene)
      .catch(err => { if (err.name !== 'AbortError') setError('Não foi possível carregar a planta. Verifique se o backend e o PostGIS estão ativos.') })
    return () => controller.abort()
  }, [])

  const counts = useMemo(() => ({ paths: scene?.lines.length ?? 0, walls: scene?.walls.length ?? 0 }), [scene])
  const empty = scene && counts.paths === 0

  return <main className="app-shell">
    <header className="topbar">
      <div className="identity"><span className="identity-mark">628</span><div><h1>Casa 628</h1><p>Leitura espacial da planta</p></div></div>
      <div className="project-meta"><span>TERRENO</span><strong>{scene ? `${scene.site.width} × ${scene.site.depth} m` : '12 × 33 m'}</strong></div>
    </header>
    <section className="workspace" aria-label="Visualização da casa">
      {scene && !empty && <Canvas orthographic shadows dpr={[1, 2]} gl={{ antialias: true }}><HouseScene scene={scene} mode={mode} reset={reset} /></Canvas>}
      {!scene && !error && <div className="state-message">Carregando a planta…</div>}
      {error && <div className="state-message error">{error}</div>}
      {empty && <div className="state-message">Nenhuma geometria importada. Defina <code>HOUSE_IMPORT_FILE</code> e reinicie o backend.</div>}
      {scene && !empty && <div className="canvas-label">{mode === 'top' ? 'PLANTA · VISTA SUPERIOR' : 'MODELO · VISTA 3D'}</div>}
      <div className="view-controls" aria-label="Controles da câmera">
        <button type="button" className={mode === 'top' ? 'active' : ''} onClick={() => setMode('top')}>Vista superior</button>
        <button type="button" className={mode === '3d' ? 'active' : ''} onClick={() => setMode('3d')}>Vista 3D</button>
        <span className="control-divider" aria-hidden="true" />
        <button type="button" onClick={() => setReset(value => value + 1)}>Centralizar</button>
      </div>
      <div className="compass" aria-hidden="true"><span>N</span><i /></div>
    </section>
    <footer className="statusbar">
      <div className="status-items"><span><b>{counts.paths}</b> trechos vetoriais</span><span><b>{counts.walls}</b> segmentos com volume</span></div>
      <div className="legend"><span><i className="swatch wall"/> Parede candidata</span><span><i className="swatch estimated"/> Altura estimada</span><span><i className="swatch line"/> Traçado original</span></div>
      <p>Arraste para girar · botão direito para mover · roda para ampliar</p>
    </footer>
  </main>
}
