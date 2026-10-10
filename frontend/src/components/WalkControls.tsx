import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { Point, Scene } from '../types'
import { buildBarriers, moveWithCollisions, walkSpawn } from './walkCollision'

const EYE_HEIGHT = 1.65
const WALK_SPEED = 2.1
const LOOK_SENSITIVITY = 0.0022

export function WalkControls({ scene, reset, active, onActiveChange }: {
  scene: Scene; reset: number; active: boolean; onActiveChange: (active: boolean) => void
}) {
  const { camera, gl } = useThree()
  const barriers = useMemo(() => buildBarriers(scene), [scene])
  const spawn = useMemo(() => walkSpawn(scene, barriers), [scene, barriers])
  const position = useRef<Point>({ ...spawn })
  const yaw = useRef(0)
  const pitch = useRef(-0.04)
  const activeRef = useRef(active)
  const keys = useRef(new Set<string>())
  const drag = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    activeRef.current = active
    if (!active) keys.current.clear()
  }, [active])

  useEffect(() => {
    position.current = { ...spawn }
    yaw.current = 0
    pitch.current = -0.04
    camera.near = 0.05
    camera.far = 250
    camera.rotation.order = 'YXZ'
    camera.position.set(spawn.x, EYE_HEIGHT, spawn.y)
    camera.rotation.set(pitch.current, yaw.current, 0)
    camera.updateProjectionMatrix()
  }, [camera, spawn, reset])

  useEffect(() => {
    const canvas = gl.domElement
    const look = (dx: number, dy: number) => {
      yaw.current -= dx * LOOK_SENSITIVITY
      pitch.current = Math.max(-1.22, Math.min(1.22, pitch.current - dy * LOOK_SENSITIVITY))
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!activeRef.current || event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement) return
      const key = event.key.toLowerCase()
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(key)) {
        keys.current.add(key)
        event.preventDefault()
      }
    }
    const onKeyUp = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase())
    const onMouseMove = (event: MouseEvent) => {
      if (!activeRef.current) return
      if (document.pointerLockElement === canvas) look(event.movementX, event.movementY)
      else if (drag.current) {
        look(event.clientX - drag.current.x, event.clientY - drag.current.y)
        drag.current = { x: event.clientX, y: event.clientY }
      }
    }
    const onPointerDown = (event: PointerEvent) => {
      if (activeRef.current && document.pointerLockElement !== canvas && event.button === 0)
        drag.current = { x: event.clientX, y: event.clientY }
    }
    const onPointerUp = () => { drag.current = null }
    const onLockChange = () => {
      const locked = document.pointerLockElement === canvas
      onActiveChange(locked)
      if (!locked) keys.current.clear()
    }
    const onBlur = () => keys.current.clear()
    const onCanvasClick = () => {
      if (activeRef.current && document.pointerLockElement !== canvas)
        canvas.requestPointerLock?.().catch(() => {})
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('pointerlockchange', onLockChange)
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('click', onCanvasClick)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('pointerlockchange', onLockChange)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('click', onCanvasClick)
      if (document.pointerLockElement === canvas) document.exitPointerLock()
    }
  }, [gl, onActiveChange])

  useFrame((_, delta) => {
    if (!activeRef.current) return
    const forward = Number(keys.current.has('w') || keys.current.has('arrowup')) -
      Number(keys.current.has('s') || keys.current.has('arrowdown'))
    const sideways = Number(keys.current.has('d') || keys.current.has('arrowright')) -
      Number(keys.current.has('a') || keys.current.has('arrowleft'))
    const length = Math.hypot(forward, sideways)
    if (length > 0) {
      const speed = WALK_SPEED * (keys.current.has('shift') ? 1.45 : 1) * Math.min(delta, 0.05) / length
      const dx = (-Math.sin(yaw.current) * forward + Math.cos(yaw.current) * sideways) * speed
      const dy = (-Math.cos(yaw.current) * forward - Math.sin(yaw.current) * sideways) * speed
      position.current = moveWithCollisions(position.current, dx, dy, barriers)
    }
    camera.position.set(position.current.x, EYE_HEIGHT, position.current.y)
    camera.rotation.set(pitch.current, yaw.current, 0)
  })

  return null
}
