import type { Point, Scene } from '../types'

export type Barrier = { start: Point; end: Point; halfWidth: number }

const pointAt = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t
})

/** Door spans are the only gaps in a walkable masonry barrier. */
export function buildBarriers(scene: Scene): Barrier[] {
  const barriers: Barrier[] = []
  for (const wall of scene.walls) {
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y)
    if (length < 0.01) continue
    const gaps = scene.openings.filter(opening => opening.type === 'DOOR' && opening.wallId === wall.id &&
      opening.positionAlongWall !== null && opening.width !== null && opening.width >= 0.45)
      .map(opening => ({ start: Math.max(0, opening.positionAlongWall! - opening.width! / 2),
        end: Math.min(length, opening.positionAlongWall! + opening.width! / 2) }))
      .sort((a, b) => a.start - b.start)
    let cursor = 0
    const add = (from: number, to: number) => {
      if (to - from < 0.01) return
      barriers.push({ start: pointAt(wall.start, wall.end, from / length),
        end: pointAt(wall.start, wall.end, to / length), halfWidth: wall.thickness / 2 })
    }
    for (const gap of gaps) {
      add(cursor, gap.start)
      cursor = Math.max(cursor, gap.end)
    }
    add(cursor, length)
  }
  const boundary = scene.site.boundary
  for (let i = 1; i < boundary.length; i++)
    barriers.push({ start: boundary[i - 1], end: boundary[i], halfWidth: 0.04 })
  if (boundary.length > 2 && Math.hypot(boundary[0].x - boundary.at(-1)!.x,
    boundary[0].y - boundary.at(-1)!.y) > 0.01)
    barriers.push({ start: boundary.at(-1)!, end: boundary[0], halfWidth: 0.04 })
  return barriers
}

function distanceToSegment(point: Point, barrier: Barrier): number {
  const dx = barrier.end.x - barrier.start.x, dy = barrier.end.y - barrier.start.y
  const lengthSquared = dx * dx + dy * dy
  const station = lengthSquared > 0 ? Math.max(0, Math.min(1,
    ((point.x - barrier.start.x) * dx + (point.y - barrier.start.y) * dy) / lengthSquared)) : 0
  return Math.hypot(point.x - barrier.start.x - station * dx,
    point.y - barrier.start.y - station * dy)
}

export function canStand(point: Point, barriers: Barrier[], radius = 0.17): boolean {
  return barriers.every(barrier => distanceToSegment(point, barrier) > radius + barrier.halfWidth)
}

export function moveWithCollisions(from: Point, dx: number, dy: number, barriers: Barrier[], radius = 0.17): Point {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.06))
  let point = { ...from }
  for (let step = 0; step < steps; step++) {
    const x = { x: point.x + dx / steps, y: point.y }
    if (canStand(x, barriers, radius)) point = x
    const y = { x: point.x, y: point.y + dy / steps }
    if (canStand(y, barriers, radius)) point = y
  }
  return point
}

export function walkSpawn(scene: Scene, barriers: Barrier[]): Point {
  const centers = [...scene.rooms.filter(room => room.number === '3'), ...scene.rooms.filter(room => room.number !== '3')]
  for (const room of centers) if (canStand(room.center, barriers, 0.22)) return room.center
  const center = centers[0]?.center ?? { x: scene.site.width / 2, y: scene.site.depth / 2 }
  for (let radius = 0.25; radius <= 2; radius += 0.25)
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
      const point = { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }
      if (canStand(point, barriers, 0.22)) return point
    }
  return center
}

