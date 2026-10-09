/**
 * Shape-based recognition of a hand-drawn character.
 *
 * Each character in the deck is stored as a small binary bitmap, built from its
 * stroke centrelines (see scripts/build-glyph-index.ts). A drawing is normalised the
 * same way (fitted into a square, centred), rasterised at the same resolution, and
 * compared with every stored bitmap. Cells are compared with a one-cell tolerance so
 * that small shifts and wobbles in the stroke do not cost the match.
 */

export interface Point {
  x: number;
  y: number;
}

export type Polyline = Point[];

export const GLYPH_GRID = 24;
const PAD = 0.08;
const INK_RADIUS = 1.3; // in grid cells

/** Fits every stroke into the unit square, keeping aspect ratio and centring the result. */
export function normalizeStrokes(strokes: Polyline[]): Polyline[] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of strokes) {
    for (const p of s) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!Number.isFinite(minX)) return [];

  const span = Math.max(maxX - minX, maxY - minY, 1e-6);
  const offX = (1 - (maxX - minX) / span) / 2;
  const offY = (1 - (maxY - minY) / span) / 2;
  const scale = 1 - PAD * 2;

  return strokes.map((s) =>
    s.map((p) => ({
      x: PAD + (offX + (p.x - minX) / span) * scale,
      y: PAD + (offY + (p.y - minY) / span) * scale,
    }))
  );
}

function distanceToSegment(px: number, py: number, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - a.x) * dx + (py - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const ex = a.x + t * dx - px;
  const ey = a.y + t * dy - py;
  return Math.sqrt(ex * ex + ey * ey);
}

/** Rasterises unit-square strokes into a grid of 0/1 cells. */
export function rasterize(strokes: Polyline[], grid = GLYPH_GRID): Uint8Array {
  const cells = new Uint8Array(grid * grid);
  const r = INK_RADIUS / grid;
  for (const s of strokes) {
    // A single tap still leaves a dot
    const segs: [Point, Point][] =
      s.length === 1 ? [[s[0], s[0]]] : s.slice(1).map((p, i) => [s[i], p] as [Point, Point]);
    for (const [a, b] of segs) {
      const minX = Math.max(0, Math.floor((Math.min(a.x, b.x) - r) * grid));
      const maxX = Math.min(grid - 1, Math.ceil((Math.max(a.x, b.x) + r) * grid));
      const minY = Math.max(0, Math.floor((Math.min(a.y, b.y) - r) * grid));
      const maxY = Math.min(grid - 1, Math.ceil((Math.max(a.y, b.y) + r) * grid));
      for (let gy = minY; gy <= maxY; gy++) {
        for (let gx = minX; gx <= maxX; gx++) {
          const px = (gx + 0.5) / grid;
          const py = (gy + 0.5) / grid;
          if (distanceToSegment(px, py, a, b) <= r) cells[gy * grid + gx] = 1;
        }
      }
    }
  }
  return cells;
}

/** Dilates a binary grid by one cell in each direction. */
function dilate(cells: Uint8Array, grid = GLYPH_GRID): Uint8Array {
  const out = new Uint8Array(cells.length);
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      if (!cells[y * grid + x]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < grid && ny < grid) out[ny * grid + nx] = 1;
        }
      }
    }
  }
  return out;
}

/** Packs a 0/1 grid into a hex string, one bit per cell, row by row. */
export function packCells(cells: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < cells.length; i += 4) {
    const nibble = (cells[i] << 3) | (cells[i + 1] << 2) | (cells[i + 2] << 1) | cells[i + 3];
    hex += nibble.toString(16);
  }
  return hex;
}

export function unpackCells(hex: string, grid = GLYPH_GRID): Uint8Array {
  const cells = new Uint8Array(grid * grid);
  for (let i = 0; i < hex.length; i++) {
    const nibble = parseInt(hex[i], 16);
    cells[i * 4] = (nibble >> 3) & 1;
    cells[i * 4 + 1] = (nibble >> 2) & 1;
    cells[i * 4 + 2] = (nibble >> 1) & 1;
    cells[i * 4 + 3] = nibble & 1;
  }
  return cells;
}

export interface Match {
  hanzi: string;
  score: number;
}

/** A stored bitmap decoded once, with its one-cell neighbourhood and ink count. */
export interface PreparedGlyph {
  hanzi: string;
  cells: Uint8Array;
  near: Uint8Array;
  ink: number;
}

/**
 * Decodes the index for matching. Do this once per index: decoding and dilating
 * every bitmap is most of the cost, and repeating it on each stroke stalls a phone.
 */
export function prepareGlyphs(index: Record<string, string>): PreparedGlyph[] {
  const glyphs: PreparedGlyph[] = [];
  for (const [hanzi, hex] of Object.entries(index)) {
    const cells = unpackCells(hex);
    let ink = 0;
    for (const v of cells) ink += v;
    if (ink > 0) glyphs.push({ hanzi, cells, near: dilate(cells), ink });
  }
  return glyphs;
}

/**
 * Ranks the prepared characters against a drawing. Score is the harmonic mean of the
 * share of drawn ink that lies near the template and the share of template ink that
 * lies near the drawing, so both missing strokes and extra strokes are penalised.
 */
export function recognize(drawing: Polyline[], glyphs: PreparedGlyph[], limit = 5): Match[] {
  const user = normalizeStrokes(drawing);
  if (user.length === 0) return [];
  const userCells = rasterize(user);
  const userNear = dilate(userCells);
  let userInk = 0;
  for (const v of userCells) userInk += v;
  if (userInk === 0) return [];

  const matches: Match[] = [];
  for (const { hanzi, cells, near, ink } of glyphs) {
    let userHit = 0;
    let tplHit = 0;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] && userNear[i]) tplHit++;
      if (userCells[i] && near[i]) userHit++;
    }
    const precision = userHit / userInk;
    const recall = tplHit / ink;
    const score = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    matches.push({ hanzi, score });
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, limit);
}
