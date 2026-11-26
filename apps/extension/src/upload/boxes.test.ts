import { describe, expect, it } from 'vitest';
import type { MaskBox } from '@envoy/core';
import { boxLabel, summarize, toggle, toImageBox } from './boxes';

const box = (type: MaskBox['type'], on = true): MaskBox => ({
  x: 0,
  y: 0,
  w: 10,
  h: 10,
  type,
  value: 'v',
  on,
});

describe('photo masks', () => {
  it('names each box in plain words', () => {
    expect(boxLabel(box('PERSON'))).toBe('Name');
    expect(boxLabel(box('NATIONAL_ID'))).toBe('National ID');
    expect(boxLabel(box('ACCOUNT'))).toBe('Account or record no.');
    expect(boxLabel({ ...box('BARCODE'), value: 'QR code' })).toBe('QR code');
  });

  it('toggling keeps every other box as it was, and returns a new list', () => {
    const list = [box('PHONE'), box('EMAIL')];
    const next = toggle(list, 1);
    expect(next.map((b) => b.on)).toEqual([true, false]);
    expect(list[1]!.on).toBe(true);
    expect(toggle(next, 1)[1]!.on).toBe(true);
  });

  it('says how many details were found, and how many stay visible', () => {
    expect(summarize([])).toBe(
      'No private details found on this device. Drag on the photo to draw a box yourself.',
    );
    expect(summarize([box('PERSON'), box('PHONE'), box('BARCODE')])).toBe(
      'Found 3 private details on this device. Press a box to keep that part visible.',
    );
    expect(summarize([box('PERSON'), box('PHONE', false)])).toBe(
      'Found 2 private details on this device. 1 masked, 1 kept visible.',
    );
  });

  it('a box drawn by hand is a masked box of its own kind', () => {
    expect(toImageBox({ x: 5, y: 6, w: 7, h: 8 })).toEqual({
      x: 5,
      y: 6,
      w: 7,
      h: 8,
      type: 'CUSTOM',
      value: 'Your box',
      on: true,
    });
  });
});
