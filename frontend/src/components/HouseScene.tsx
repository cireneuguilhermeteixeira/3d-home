import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { BufferGeometry, Float32BufferAttribute, Object3D, OrthographicCamera, Shape } from 'three'
import type { InstancedMesh } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { Scene, Wall } from '../types'

type Bounds = { minX: number; minY: number; width: number; depth: number; centerX: number; centerY: number }

function boundsOf(scene: Scene): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const line of scene.lines) for (const p of line.points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
  }
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = scene.site.width; maxY = scene.site.depth }
  const width = Math.max(scene.site.width, maxX - minX)
  const depth = Math.max(scene.site.depth, maxY - minY)
  return { minX, minY, width, depth, centerX: minX + width / 2, centerY: minY + depth / 2 }
}

function CameraControls({ bounds, mode, reset }: { bounds: Bounds; mode: 'top' | '3d'; reset: number }) {
  const { camera, size } = useThree()
  const controls = useRef<OrbitControlsImpl>(null)
  useEffect(() => {
    const cam = camera as OrthographicCamera
    const aspect = size.width / Math.max(size.height, 1)
    const half = Math.max(bounds.depth * 0.62, bounds.width * 0.62 / aspect)
    cam.left = -half * aspect; cam.right = half * aspect; cam.top = half; cam.bottom = -half
    cam.zoom = mode === '3d' ? 1.3 : 1
    cam.position.set(bounds.centerX + (mode === '3d' ? bounds.width * 1.1 : 0),
      mode === '3d' ? Math.max(bounds.depth * 0.8, 16) : 50,
      bounds.centerY + (mode === '3d' ? bounds.depth * 0.85 : 0))
    cam.up.set(0, mode === '3d' ? 1 : 0, mode === '3d' ? 0 : -1)
    cam.lookAt(bounds.centerX, 0, bounds.centerY)
    cam.updateProjectionMatrix()
    controls.current?.target.set(bounds.centerX, 0, bounds.centerY)
    controls.current?.update()
  }, [camera, size.width, size.height, bounds, mode, reset])
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.12} screenSpacePanning minZoom={0.5} maxZoom={15} />
}

function Floor3D({ scene }: { scene: Scene }) {
  const shape = useMemo(() => {
    const points = scene.site.boundary.length >= 3 ? scene.site.boundary : [
      { x: 0, y: 0 }, { x: scene.site.width, y: 0 },
      { x: scene.site.width, y: scene.site.depth }, { x: 0, y: scene.site.depth }
    ]
    const result = new Shape()
    points.forEach((point, index) => index === 0 ? result.moveTo(point.x, -point.y) : result.lineTo(point.x, -point.y))
    result.closePath()
    return result
  }, [scene])
  return <mesh position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
    <shapeGeometry args={[shape]} /><meshStandardMaterial color="#e9edea" roughness={1} side={2} />
  </mesh>
}

function WallInstances({ walls, color }: { walls: Wall[]; color: string }) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    if (!ref.current) return
    const object = new Object3D()
    walls.forEach((wall, index) => {
      object.position.set((wall.start.x + wall.end.x) / 2, wall.height / 2, (wall.start.y + wall.end.y) / 2)
      object.rotation.set(0, -Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x), 0)
      object.scale.set(wall.length, wall.height, wall.thickness)
      object.updateMatrix()
      ref.current!.setMatrixAt(index, object.matrix)
    })
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [walls])
  if (walls.length === 0) return null
  return <instancedMesh ref={ref} args={[undefined, undefined, walls.length]} castShadow receiveShadow>
    <boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color={color} roughness={0.82} />
  </instancedMesh>
}

function Walls3D({ walls }: { walls: Wall[] }) {
  const measured = useMemo(() => walls.filter(w => !w.heightEstimated), [walls])
  const estimated = useMemo(() => walls.filter(w => w.heightEstimated), [walls])
  return <><WallInstances walls={measured} color="#adc6c7" /><WallInstances walls={estimated} color="#c8d1d0" /></>
}

function DrawingLines3D({ scene }: { scene: Scene }) {
  const geometry = useMemo(() => {
    const coords: number[] = []
    scene.lines.forEach(line => {
      for (let i = 1; i < line.points.length; i++) {
        const a = line.points[i - 1], b = line.points[i]
        coords.push(a.x, 0.025, a.y, b.x, 0.025, b.y)
      }
    })
    const result = new BufferGeometry()
    result.setAttribute('position', new Float32BufferAttribute(coords, 3))
    return result
  }, [scene])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <lineSegments geometry={geometry}><lineBasicMaterial color="#586c73" transparent opacity={0.72} depthWrite={false} /></lineSegments>
}

export function HouseScene({ scene, mode, reset }: { scene: Scene; mode: 'top' | '3d'; reset: number }) {
  const bounds = useMemo(() => boundsOf(scene), [scene])
  return <>
    <color attach="background" args={["#dfe5e5"]} />
    <ambientLight intensity={0.9} />
    <directionalLight position={[bounds.centerX + 10, 24, bounds.centerY + 8]} intensity={1.25} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-30} shadow-camera-right={30} shadow-camera-top={35} shadow-camera-bottom={-35} shadow-bias={-0.0004} shadow-radius={3} />
    <Floor3D scene={scene} /><Walls3D walls={scene.walls} /><DrawingLines3D scene={scene} />
    <CameraControls bounds={bounds} mode={mode} reset={reset} />
  </>
}
