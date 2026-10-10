import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Html, OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { BufferGeometry, Float32BufferAttribute, Object3D, OrthographicCamera, PerspectiveCamera, Shape } from 'three'
import type { InstancedMesh } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { AttentionPoint, Opening, Point, Scene, Wall } from '../types'
import { WalkControls } from './WalkControls'

type Bounds = { width: number; depth: number; centerX: number; centerY: number }
type Block = { startX: number; startY: number; endX: number; endY: number; bottom: number; height: number; thickness: number; estimated: boolean }
type Cut = { start: number; end: number; sill: number; mainTop: number; top: number; opening: Opening }
const configuredDoorHeight = Number(import.meta.env.VITE_VISUAL_DOOR_HEIGHT ?? 2.1)
const VISUAL_DOOR_HEIGHT = Number.isFinite(configuredDoorHeight) && configuredDoorHeight > 0 ? configuredDoorHeight : 2.1
// These display dimensions are provisional; the database retains unknown source values.
const VISUAL_UNMEASURED_WINDOW_HEIGHT = 1.0
const VISUAL_UNMEASURED_WINDOW_SILL = 1.0

function boundsOf(scene: Scene): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const line of scene.lines) for (const point of line.points) {
    minX = Math.min(minX, point.x); minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y)
  }
  for (const point of scene.site.boundary) {
    minX = Math.min(minX, point.x); minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y)
  }
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = scene.site.width; maxY = scene.site.depth }
  return { width: maxX - minX, depth: maxY - minY, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 }
}

function CameraControls({ bounds, mode, reset }: { bounds: Bounds; mode: 'cad' | '3d'; reset: number }) {
  const { camera, size } = useThree()
  const controls = useRef<OrbitControlsImpl>(null)
  useEffect(() => {
    const aspect = size.width / Math.max(size.height, 1)
    const half = Math.max(bounds.depth * 0.62, bounds.width * 0.62 / aspect)
    if (camera instanceof OrthographicCamera) {
      camera.left = -half * aspect; camera.right = half * aspect
      camera.top = half; camera.bottom = -half; camera.zoom = 1
      camera.position.set(bounds.centerX, 50, bounds.centerY)
      camera.up.set(0, 0, -1)
    } else {
      const cam = camera as PerspectiveCamera
      cam.fov = 45; cam.aspect = aspect
      cam.position.set(bounds.centerX + Math.max(bounds.width * 1.2, 15),
        Math.max(bounds.depth * 0.8, 22), bounds.centerY + bounds.depth * 0.75)
      cam.up.set(0, 1, 0)
    }
    camera.lookAt(bounds.centerX, 0, bounds.centerY)
    camera.updateProjectionMatrix()
    controls.current?.target.set(bounds.centerX, 0, bounds.centerY)
    controls.current?.update()
  }, [camera, size.width, size.height, bounds, mode, reset])
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.12}
    screenSpacePanning minDistance={3} maxDistance={130} minZoom={0.5} maxZoom={15} enableRotate={mode === '3d'} />
}

function siteShape(scene: Scene) {
    const points = scene.site.boundary.length >= 3 ? scene.site.boundary : [
      { x: 0, y: 0 }, { x: scene.site.width, y: 0 },
      { x: scene.site.width, y: scene.site.depth }, { x: 0, y: scene.site.depth }
    ]
    const result = new Shape()
    points.forEach((point, index) => index === 0 ? result.moveTo(point.x, -point.y) : result.lineTo(point.x, -point.y))
    result.closePath()
    return result
}

function Floor3D({ scene }: { scene: Scene }) {
  const shape = useMemo(() => siteShape(scene), [scene])
  return <mesh position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
    <shapeGeometry args={[shape]} /><meshStandardMaterial color="#e9edea" roughness={1} side={2} />
  </mesh>
}

function PickPlane({ scene, onPick }: { scene: Scene; onPick: (point: Point) => void }) {
  const shape = useMemo(() => siteShape(scene), [scene])
  return <mesh position={[0, 0.16, 0]} rotation={[-Math.PI / 2, 0, 0]}
    onClick={event => { if (event.button !== 0) return; event.stopPropagation(); onPick({ x: event.point.x, y: event.point.z }) }}>
    <shapeGeometry args={[shape]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} />
  </mesh>
}

function cutsFor(wall: Wall, openings: Opening[], visualHeight: number): Cut[] {
  const cuts = openings.filter(opening => opening.wallId === wall.id && opening.positionAlongWall !== null &&
    opening.width !== null && (opening.height !== null || opening.type === 'DOOR' || opening.annotationId === 'P009') &&
    opening.type !== 'UNKNOWN_OPENING')
    .map(opening => {
      const sill = opening.type === 'WINDOW'
        ? (opening.sillHeight ?? (opening.annotationId === 'P009' ? VISUAL_UNMEASURED_WINDOW_SILL : null)) : 0
      if (sill === null) return null
      const start = Math.max(0, opening.positionAlongWall! - opening.width! / 2)
      const end = Math.min(wall.length, opening.positionAlongWall! + opening.width! / 2)
      const mainTop = sill + (opening.height ?? (opening.type === 'WINDOW'
        ? VISUAL_UNMEASURED_WINDOW_HEIGHT : VISUAL_DOOR_HEIGHT))
      const top = mainTop + (opening.transomHeight ?? 0)
      if (end - start < 0.25 || top >= visualHeight - 0.05) return null
      return { start, end, sill, mainTop, top, opening }
    }).filter((cut): cut is Cut => cut !== null).sort((a, b) => a.start - b.start)
  return cuts.filter((cut, index) => index === 0 || cut.start >= cuts[index - 1].end)
}

function blocksFor(walls: Wall[], openings: Opening[]): { blocks: Block[]; openingCuts: { wall: Wall; cut: Cut }[] } {
  const blocks: Block[] = [], openingCuts: { wall: Wall; cut: Cut }[] = []
  for (const wall of walls) {
    const height = wall.height ?? 2.8
    const cuts = cutsFor(wall, openings, height)
    const pointAt = (station: number) => ({ x: wall.start.x + (wall.end.x - wall.start.x) * station / wall.length,
      y: wall.start.y + (wall.end.y - wall.start.y) * station / wall.length })
    const add = (from: number, to: number, bottom: number, blockHeight: number) => {
      if (to - from < 0.01 || blockHeight < 0.01) return
      const a = pointAt(from), b = pointAt(to)
      blocks.push({ startX: a.x, startY: a.y, endX: b.x, endY: b.y, bottom,
        height: blockHeight, thickness: wall.thickness, estimated: wall.height === null })
    }
    let cursor = 0
    for (const cut of cuts) {
      add(cursor, cut.start, 0, height)
      add(cut.start, cut.end, 0, cut.sill)
      add(cut.start, cut.end, cut.top, height - cut.top)
      openingCuts.push({ wall, cut })
      cursor = cut.end
    }
    add(cursor, wall.length, 0, height)
  }
  return { blocks, openingCuts }
}

function BlockInstances({ blocks, color }: { blocks: Block[]; color: string }) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    if (!ref.current) return
    const object = new Object3D()
    blocks.forEach((block, index) => {
      const length = Math.hypot(block.endX - block.startX, block.endY - block.startY)
      object.position.set((block.startX + block.endX) / 2, block.bottom + block.height / 2,
        (block.startY + block.endY) / 2)
      object.rotation.set(0, -Math.atan2(block.endY - block.startY, block.endX - block.startX), 0)
      object.scale.set(length, block.height, block.thickness)
      object.updateMatrix()
      ref.current!.setMatrixAt(index, object.matrix)
    })
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [blocks])
  if (blocks.length === 0) return null
  return <instancedMesh ref={ref} args={[undefined, undefined, blocks.length]} castShadow receiveShadow>
    <boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color={color} roughness={0.82} />
  </instancedMesh>
}

function Walls3D({ walls, openings, walking }: { walls: Wall[]; openings: Opening[]; walking: boolean }) {
  const { blocks, openingCuts } = useMemo(() => blocksFor(walls, openings), [walls, openings])
  const measured = useMemo(() => blocks.filter(block => !block.estimated), [blocks])
  const estimated = useMemo(() => blocks.filter(block => block.estimated), [blocks])
  return <>
    <BlockInstances blocks={measured} color="#adc6c7" />
    <BlockInstances blocks={estimated} color="#c8d1d0" />
    {openingCuts.map(({ wall, cut }) => {
      const station = (cut.start + cut.end) / 2
      const centerX = wall.start.x + (wall.end.x - wall.start.x) * station / wall.length
      const centerY = wall.start.y + (wall.end.y - wall.start.y) * station / wall.length
      const width = cut.end - cut.start
      const mainHeight = cut.mainTop - cut.sill
      return <group key={cut.opening.id} position={[centerX, 0, centerY]}
        rotation={[0, -Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x), 0]}>
        {cut.opening.type === 'WINDOW' ? <>
          <mesh position={[0, cut.sill + mainHeight / 2, 0]}><boxGeometry args={[width - 0.06, mainHeight - 0.06, 0.025]} />
            <meshStandardMaterial color="#83abb5" transparent opacity={0.38} depthWrite={false} /></mesh>
          {cut.opening.transomHeight && <mesh position={[0, cut.mainTop + cut.opening.transomHeight / 2, 0]}>
            <boxGeometry args={[width - 0.06, cut.opening.transomHeight - 0.03, 0.025]} />
            <meshStandardMaterial color="#91b8bf" transparent opacity={0.34} depthWrite={false} /></mesh>}
          <OpeningFrame width={width} bottom={cut.sill} top={cut.top} divider={cut.opening.transomHeight ? cut.mainTop : null} />
        </> : <>
          <group position={walking ? [-width / 2 + 0.04, 0, 0] : [0, 0, 0]}
            rotation={walking ? [0, -1.2, 0] : [0, 0, 0]}>
            <mesh position={walking ? [(width - 0.08) / 2, mainHeight / 2, 0.035] : [0, mainHeight / 2, 0.035]}>
              <boxGeometry args={[width - 0.08, mainHeight - 0.06, 0.055]} />
              <meshStandardMaterial color={cut.opening.subtype === 'WOODEN_DOOR' ? '#8a654b' : '#7c6858'} roughness={0.78} />
            </mesh>
            <mesh position={walking ? [width - 0.18, Math.min(1.03, mainHeight / 2), 0.071] :
              [Math.max(0.08, width / 2 - 0.18), Math.min(1.03, mainHeight / 2), 0.071]}>
              <sphereGeometry args={[0.035, 8, 6]} /><meshStandardMaterial color="#d9c29a" metalness={0.55} roughness={0.36} />
            </mesh>
          </group>
          {cut.opening.transomHeight && <mesh position={[0, cut.mainTop + cut.opening.transomHeight / 2, 0]}>
            <boxGeometry args={[width - 0.06, cut.opening.transomHeight - 0.03, 0.025]} />
            <meshStandardMaterial color="#91b8bf" transparent opacity={0.32} depthWrite={false} /></mesh>}
          <OpeningFrame width={width} bottom={0} top={cut.top} divider={cut.opening.transomHeight ? cut.mainTop : null} />
        </>}
      </group>
    })}
  </>
}

function OpeningFrame({ width, bottom, top, divider }: { width: number; bottom: number; top: number; divider: number | null }) {
  const frame = '#566d71'
  return <>
    {[-1, 1].map(side => <mesh key={side} position={[side * (width / 2 - 0.025), (bottom + top) / 2, 0]}>
      <boxGeometry args={[0.05, top - bottom, 0.07]} /><meshStandardMaterial color={frame} /></mesh>)}
    {[bottom, top, ...(divider === null ? [] : [divider])].map(y => <mesh key={y} position={[0, y, 0]}>
      <boxGeometry args={[width, 0.05, 0.07]} /><meshStandardMaterial color={frame} /></mesh>)}
  </>
}

function Gates3D({ openings }: { openings: Opening[] }) {
  return <>{openings.filter(o => o.type === 'GATE' && o.spanStart && o.spanEnd && o.height).map(gate => {
    const a = gate.spanStart!, b = gate.spanEnd!, width = Math.hypot(b.x - a.x, b.y - a.y)
    return <group key={gate.id} position={[(a.x + b.x) / 2, 0, (a.y + b.y) / 2]}
      rotation={[0, -Math.atan2(b.y - a.y, b.x - a.x), 0]}>
      <mesh position={[0, gate.height! / 2, 0]}><boxGeometry args={[width - 0.04, gate.height! - 0.04, 0.045]} />
        <meshStandardMaterial color={gate.subtype === 'SLIDING_GATE' ? '#768c91' : '#879799'} roughness={0.78} side={2} /></mesh>
      <mesh position={[0, 0.05, 0]}><boxGeometry args={[width, 0.04, 0.12]} />
        <meshStandardMaterial color="#536b70" /></mesh>
    </group>
  })}</>
}

function DrawingLines3D({ scene, mode }: { scene: Scene; mode: 'cad' | '3d' }) {
  const geometry = useMemo(() => {
    const coords: number[] = []
    scene.lines.forEach(line => {
      if (mode === '3d') {
        if (line.representedByWall) return
        if (!['wall_candidate', 'opening_candidate', 'floor_candidate', 'structure_candidate'].includes(line.candidateClass)) return
      }
      for (let i = 1; i < line.points.length; i++) {
        const a = line.points[i - 1], b = line.points[i]
        coords.push(a.x, 0.025, a.y, b.x, 0.025, b.y)
      }
    })
    const result = new BufferGeometry()
    result.setAttribute('position', new Float32BufferAttribute(coords, 3))
    return result
  }, [scene, mode])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <lineSegments geometry={geometry}><lineBasicMaterial color="#586c73" transparent opacity={mode === 'cad' ? 0.75 : 0.43} depthWrite={false} /></lineSegments>
}

export function HouseScene({ scene, mode, reset, attentionPoints, placing, onPick, onSelectPoint, walkActive, onWalkActiveChange }: {
  scene: Scene; mode: 'cad' | '3d' | 'walk'; reset: number; attentionPoints: AttentionPoint[];
  placing: boolean; onPick: (point: Point) => void; onSelectPoint: (id: string) => void;
  walkActive: boolean; onWalkActiveChange: (active: boolean) => void
}) {
  const bounds = useMemo(() => boundsOf(scene), [scene])
  return <>
    <color attach="background" args={["#dfe5e5"]} />
    <ambientLight intensity={0.9} />
    <directionalLight position={[bounds.centerX + 10, 24, bounds.centerY + 8]} intensity={1.25}
      castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-30} shadow-camera-right={30}
      shadow-camera-top={35} shadow-camera-bottom={-35} shadow-bias={-0.0004} shadow-radius={3} />
    <Floor3D scene={scene} />
    {mode !== 'cad' && <><Walls3D walls={scene.walls} openings={scene.openings} walking={mode === 'walk'} /><Gates3D openings={scene.openings} /></>}
    {mode !== 'walk' && <DrawingLines3D scene={scene} mode={mode} />}
    {mode === 'cad' && placing && <PickPlane scene={scene} onPick={onPick} />}
    {/* Prime the HTML overlay portal: its first mount can be empty during initial WebGL render. */}
    <Html position={[0, 0, 0]}><span style={{ display: 'none' }} /></Html>
    {mode !== 'walk' && attentionPoints.filter(point => point.layoutMode === scene.site.layoutMode).map(point => <Html key={point.id}
      position={[point.position.x, mode === 'cad' ? 0.25 : 0.2, point.position.y]}
      center distanceFactor={mode === '3d' ? 20 : undefined} zIndexRange={[20, 0]}>
      <button type="button" className="attention-marker" title={`${point.id}: ${point.note}`}
        onClick={event => { event.stopPropagation(); onSelectPoint(point.id) }}>{point.id}</button>
    </Html>)}
    {mode === 'walk' ? <WalkControls scene={scene} reset={reset} active={walkActive} onActiveChange={onWalkActiveChange} /> :
      <CameraControls bounds={bounds} mode={mode} reset={reset} />}
  </>
}
