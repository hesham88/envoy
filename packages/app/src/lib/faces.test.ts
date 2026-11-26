import { describe, expect, it } from 'vitest';
import { faceBox, mergeFaces, tiles, type Rect } from './faces';

const r = (x: number, y: number, w: number, h: number, score = 0.9): Rect => ({ x, y, w, h, score });

describe('face boxes', () => {
  it('merges the same face found in the full frame and in a tile, keeping the surest', () => {
    const merged = mergeFaces([r(100, 100, 80, 90, 0.7), r(104, 98, 78, 92, 0.95), r(400, 120, 60, 70)]);
    expect(merged).toHaveLength(2);
    expect(merged[0]!.score).toBe(0.95);
  });

  it('drops a box that sits inside a surer one (a tile can see half a face)', () => {
    expect(mergeFaces([r(100, 100, 100, 100, 0.9), r(120, 130, 30, 30, 0.6)])).toHaveLength(1);
  });

  it('grows a face box to cover hair and chin, without leaving the image', () => {
    const b = faceBox(r(10, 10, 100, 100), 120, 125);
    expect(b).toMatchObject({ type: 'FACE', value: 'Face', on: true, x: 0, y: 0 });
    expect(b.x + b.w).toBeLessThanOrEqual(120);
    expect(b.y + b.h).toBeLessThanOrEqual(125);
    const inner = faceBox(r(200, 200, 100, 100), 1000, 1000);
    expect(inner.x).toBeLessThan(200);
    expect(inner.y).toBeLessThan(200);
    expect(inner.w).toBeGreaterThan(100);
  });

  it('scans large photos in overlapping tiles, small ones whole', () => {
    expect(tiles(800, 600)).toEqual([]);
    const t = tiles(2000, 1500);
    expect(t.length).toBeGreaterThan(3);
    // Every pixel is covered by some tile.
    for (const [x, y] of [
      [0, 0],
      [1999, 1499],
      [1000, 750],
    ] as const)
      expect(t.some((k) => x >= k.x && x < k.x + k.w && y >= k.y && y < k.y + k.h)).toBe(true);
  });
});
