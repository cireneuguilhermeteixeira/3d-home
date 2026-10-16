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
  const centers = scene.rooms
  const free = (point: Point) => canStand(point, barriers, 0.22) && scene.elements.every(element =>
    !element.center || Math.hypot(point.x - element.center.x, point.y - element.center.y) > (element.radius ?? 0.4) + 0.3)
  for (const room of centers) if (free(room.center)) return room.center
  const center = centers[0]?.center ?? { x: scene.site.width / 2, y: scene.site.depth / 2 }
  for (let radius = 0.25; radius <= 2; radius += 0.25)
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
      const point = { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }
      if (free(point)) return point
    }
  return center
}

export function walkHeading(spawn: Point, barriers: Barrier[]): number {
  let best = 0.7, bestScore = -Infinity
  for (let i = 0; i < 16; i++) {
    const angle = 0.7 + i * Math.PI / 8
    let distance = 0
    for (let step = 1; step <= 40; step++) {
      const probe = {x: spawn.x - Math.sin(angle) * step * 0.15, y: spawn.y - Math.cos(angle) * step * 0.15}
      if (!canStand(probe, barriers, 0.22)) break
      distance = step * 0.15
    }
    if (distance < 1.2) continue
    const score = -Math.abs(distance - 2.8) - i * 0.005
    if (score > bestScore) { bestScore = score; best = angle }
  }
  return best
}

