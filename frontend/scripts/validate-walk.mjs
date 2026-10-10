import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transform } from 'esbuild'

const source = readFileSync(new URL('../src/components/walkCollision.ts', import.meta.url), 'utf8')
const compiled = await transform(source, { loader: 'ts', format: 'esm' })
const { buildBarriers, canStand, moveWithCollisions, walkSpawn } =
  await import('data:text/javascript;base64,' + Buffer.from(compiled.code).toString('base64'))

const wall = { id: 'wall', start: { x: 0, y: 2 }, end: { x: 4, y: 2 }, length: 4,
  thickness: 0.2, height: null }
const base = { site: { width: 4, depth: 4, boundary: [
  { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }, { x: 0, y: 0 }
] }, walls: [wall], rooms: [{ number: '3', center: { x: 2, y: 1 } }] }
const doorway = { type: 'DOOR', wallId: 'wall', positionAlongWall: 2, width: 0.8 }
const barriers = buildBarriers({ ...base, openings: [doorway] })
assert.ok(canStand({ x: 2, y: 2 }, barriers), 'The classified doorway must be passable')
assert.ok(!canStand({ x: 0.8, y: 2 }, barriers), 'Masonry must remain solid')
assert.ok(moveWithCollisions({ x: 2, y: 1 }, 0, 2, barriers).y > 2.8)
assert.ok(moveWithCollisions({ x: 0.8, y: 1 }, 0, 2, barriers).y < 2)
assert.ok(!canStand({ x: 2, y: 2 }, buildBarriers({ ...base,
  openings: [{ ...doorway, type: 'WINDOW' }] })), 'Windows cannot be walked through')

const scene = JSON.parse(readFileSync(process.argv[2] ?? '/tmp/casa628-r2-scene.json', 'utf8'))
const realBarriers = buildBarriers(scene)
assert.ok(canStand(walkSpawn(scene, realBarriers), realBarriers))
for (const id of ['ann-013', 'R2-P003']) {
  const door = scene.openings.find(opening => opening.annotationId === id)
  assert.ok(door?.wallId && door.width >= 0.6, `${id} must have an associated walkable span`)
  assert.ok(canStand(door.center, realBarriers), `${id} must not be blocked by masonry`)
}
console.log('Caminhada validada: paredes bloqueiam e portas permitem passagem.')
