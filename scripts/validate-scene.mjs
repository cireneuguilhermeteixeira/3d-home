import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const scene = JSON.parse(readFileSync(process.argv[2] ?? '/tmp/casa628-v2-scene.json', 'utf8'))
const byAnnotation = id => scene.openings.find(opening => opening.annotationId === id)
const associated = opening => opening?.wallId || (opening?.spanStart && opening?.spanEnd)

assert.equal(scene.site.layoutMode, 'ORIGINAL_LAYOUT')
assert.equal(scene.rooms.length, 6)
assert.equal(scene.rooms.find(room => room.number === '3')?.roomType, 'KITCHEN')
assert.equal(scene.measurements.length, 69)
assert.equal(scene.openings.filter(opening => opening.type === 'WINDOW' && opening.annotationId?.startsWith('ann-')).length, 9)
for (const id of ['ann-015', 'ann-016', 'ann-017']) assert.ok(byAnnotation(id).wallId)
assert.equal(scene.openings.filter(opening => opening.type === 'WINDOW' && opening.wallId).length, 10)
assert.equal(byAnnotation('ann-014').status, 'OWNER_CONFIRMED')
assert.equal(byAnnotation('ann-014').height, 1.22)
assert.equal(byAnnotation('P007').type, 'DOOR')
assert.ok(byAnnotation('P007').wallId)
assert.equal(byAnnotation('P009').type, 'WINDOW')
assert.ok(byAnnotation('P009').wallId)
assert.equal(byAnnotation('P009').height, null)
assert.equal(byAnnotation('P009').sillHeight, null)
assert.equal(byAnnotation('P001').type, 'DOOR')
assert.ok(byAnnotation('P001').wallId)
assert.notEqual(byAnnotation('P001').wallId, byAnnotation('ann-022').wallId)

const kitchenWindow = byAnnotation('ann-021')
const kitchenDoor = byAnnotation('user-room3-bottom-door')
assert.equal(kitchenWindow.type, 'WINDOW')
assert.equal(kitchenDoor.type, 'DOOR')
assert.ok(kitchenWindow.wallId && kitchenDoor.wallId)
assert.equal(kitchenWindow.wallId, kitchenDoor.wallId)
assert.ok(kitchenWindow.spanEnd.x < kitchenDoor.spanStart.x)
assert.ok(kitchenDoor.sourcePathIds.length > 0)
assert.equal(kitchenDoor.height, null)
assert.equal(scene.openings.filter(opening => opening.type === 'DOOR' && opening.wallId).length, 7)
assert.equal(scene.openings.filter(opening => opening.type === 'DOOR' && opening.height === null).length, 6)
for (const id of ['user-room3-bottom-door', 'geometry:59989a47-6161-5709-b350-dfcac5a51710', 'ann-013'])
  assert.equal(byAnnotation(id).status, 'OWNER_CONFIRMED')

const room5Window = byAnnotation('ann-022')
assert.equal(room5Window.type, 'WINDOW')
assert.ok(associated(room5Window))
assert.equal(room5Window.height, 0.8)
assert.equal(room5Window.sillHeight, 1.18)
assert.equal(room5Window.transomHeight, 0.2)
assert.ok(Math.abs(room5Window.center.x - 5.232) < 0.05)
assert.ok(Math.abs(room5Window.center.y - 17.56) < 0.1)

for (const id of ['ann-018', 'ann-019', 'ann-020']) {
  const window = byAnnotation(id)
  assert.equal(window.type, 'WINDOW')
  assert.ok(window.wallId)
  assert.equal(window.height, 1.2)
  assert.equal(window.sillHeight, 0.96)
}
for (const id of ['ann-008', 'ann-009']) {
  const gate = byAnnotation(id)
  assert.equal(gate.subtype, 'SLIDING_GATE')
  assert.ok(gate.spanStart && gate.spanEnd)
  assert.ok(gate.sourcePathIds.length >= 2)
}
for (const id of ['ann-010', 'ann-011', 'ann-012']) {
  const gate = byAnnotation(id)
  assert.equal(gate.type, 'GATE')
  assert.equal(gate.status, 'BOUNDARY_SPAN_CANDIDATE')
  assert.ok(gate.spanStart && gate.spanEnd)
}
assert.ok(byAnnotation('ann-010').spanStart.x > 4.3, 'O portão superior não deve ocupar o vão da janela ann-014')
assert.ok(byAnnotation('ann-011').spanStart.x > 7.4, 'O portão lateral deve ocupar o vão junto ao cômodo 5')
assert.equal(scene.openings.filter(opening => opening.type === 'GATE' && opening.spanStart).length, 5)
assert.equal(byAnnotation('ann-013').transomHeight, 0.42)
assert.ok(Math.abs(byAnnotation('ann-013').center.x - 4.165) < 0.02)
assert.ok(byAnnotation('ann-013').center.y > 4.6 && byAnnotation('ann-013').center.y < 5.8)
assert.ok(Math.abs(byAnnotation('R2-P003').center.x - 4.165) < 0.02)
assert.ok(Math.abs(byAnnotation('R2-P003').center.y - 9.33) < 0.08)
const restoredWall = scene.walls.find(wall => wall.sourcePathIds.includes('abfbebf8-3f45-534d-8e5b-c240cceb92e7'))
assert.ok(restoredWall)
assert.ok(!scene.openings.some(opening => opening.type === 'DOOR' && opening.wallId === restoredWall.id),
  'A parede onde a porta foi colocada por engano deve permanecer inteira')
const missingWall = scene.walls.find(wall => wall.sourcePathIds.includes('1a5527eb-a79d-5720-850a-0f9091e6ab95'))
assert.ok(missingWall && Math.abs(missingWall.thickness - 0.403) < 0.005)
assert.ok(scene.walls.every(wall => wall.height === null || wall.heightSourceId))
assert.ok(scene.elements.some(element => element.type === 'LOW_WALL'))
assert.ok(scene.elements.some(element => element.type === 'RAILING'))
assert.equal(scene.measurements.filter(measurement => measurement.associations.length).length, 26)
assert.equal(scene.measurements.filter(measurement => measurement.associations.some(link => link.status === 'ASSOCIATED_GEOMETRY')).length, 26)
assert.ok(scene.elements.some(element => element.id === 'P004' && element.type === 'FURNITURE_ACCESS'))
assert.ok(scene.walls.some(wall => wall.status === 'JUNCTION_CLOSED'))
for (const [target, sources] of [
  [[0.977, 18.983], ['1c2b3674-4332-5602-ab18-fc960607b520', '1277946c-0376-53bc-87cc-e0b3c79bdcc3']],
  [[4.165, 12.070], ['6bc59619-3d51-5b1a-a2a4-efadc612fdc1', 'a02a54f5-398b-58bf-95eb-c4e842b4c488']],
  [[1.042, 15.784], ['75ee3ce1-ab63-56c0-9cfd-0106f8fcbfeb', '1c2b3674-4332-5602-ab18-fc960607b520', '00d90ef9-a3e5-5980-a9eb-2dd0256ed7a8']],
  [[1.023, 12.070], ['26c7051d-e1fd-5c28-8420-f827f9b3879f', 'a02a54f5-398b-58bf-95eb-c4e842b4c488']],
  [[1.026, 8.890], ['26c7051d-e1fd-5c28-8420-f827f9b3879f', '238d0edc-4df9-54cc-b6d6-34b32a91d748', '0ea19d86-04de-542f-b875-5fe5e97ca9f8']]
]) for (const source of sources) {
  const wall = scene.walls.find(wall => wall.sourcePathIds.includes(source))
  assert.ok(wall, `Parede ausente no encontro ${source}`)
  const distance = Math.min(Math.hypot(wall.start.x - target[0], wall.start.y - target[1]),
    Math.hypot(wall.end.x - target[0], wall.end.y - target[1]))
  assert.ok(distance < 0.02, `Encontro aberto em ${target}: ${source}`)
}
const leftBoundaryWalls = scene.walls.filter(wall => wall.start.x < 0 && wall.end.x < 0 &&
  Math.min(wall.start.y, wall.end.y) >= 2.3).sort((a, b) =>
  Math.min(a.start.y, a.end.y) - Math.min(b.start.y, b.end.y))
assert.ok(leftBoundaryWalls.length >= 10)
for (let index = 1; index < leftBoundaryWalls.length; index++) {
  const previousEnd = Math.max(leftBoundaryWalls[index - 1].start.y, leftBoundaryWalls[index - 1].end.y)
  const nextStart = Math.min(leftBoundaryWalls[index].start.y, leftBoundaryWalls[index].end.y)
  assert.ok(nextStart - previousEnd < 0.02, `Fresta no muro lateral: ${previousEnd}–${nextStart}`)
}
assert.ok(Math.min(...scene.site.boundary.map(point => point.x)) < -1)

for (let i = 0; i < scene.walls.length; i++) for (let j = i + 1; j < scene.walls.length; j++) {
  const a = scene.walls[i], b = scene.walls[j]
  const dx = a.end.x - a.start.x, dy = a.end.y - a.start.y
  const length = Math.hypot(dx, dy), ux = dx / length, uy = dy / length
  const bx = b.end.x - b.start.x, by = b.end.y - b.start.y
  if (Math.abs((dx * bx + dy * by) / (length * Math.hypot(bx, by))) < 0.999) continue
  const offset = Math.abs((b.start.x - a.start.x) * uy - (b.start.y - a.start.y) * ux)
  const p = ux * (b.start.x - a.start.x) + uy * (b.start.y - a.start.y)
  const q = ux * (b.end.x - a.start.x) + uy * (b.end.y - a.start.y)
  const overlap = Math.min(length, Math.max(p, q)) - Math.max(0, Math.min(p, q))
  assert.ok(offset >= 0.035 || overlap <= 0.12, `Paredes duplicadas: ${a.id} e ${b.id}`)
}

console.log('Cena semântica validada: cômodos, aberturas, cotas e referências de origem.')
