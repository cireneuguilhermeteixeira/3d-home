export type Point = { x: number; y: number }
export type Site = { width: number; depth: number; boundary: Point[] }
export type Wall = { id: string; start: Point; end: Point; length: number; height: number; thickness: number; status: string; heightEstimated: boolean; thicknessEstimated: boolean }
export type DrawingLine = { id: string; layer: string; candidateClass: string; points: Point[] }
export type Scene = { site: Site; walls: Wall[]; lines: DrawingLine[]; rooms: unknown[]; openings: unknown[]; measurements: unknown[] }
