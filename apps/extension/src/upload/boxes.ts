/** Photo masks in the upload card: plain-word labels, toggling, and the one-line summary. */
import { maskLabel, type MaskBox } from '@envoy/core';

export const boxLabel = maskLabel;

/** A new list with box `i` switched between masked and kept visible. */
export function toggle(boxes: readonly MaskBox[], i: number): MaskBox[] {
  return boxes.map((b, j) => (j === i ? { ...b, on: !b.on } : b));
}

export function summarize(boxes: readonly MaskBox[]): string {
  if (!boxes.length)
    return 'No private details found on this device. Drag on the photo to draw a box yourself.';
  const kept = boxes.filter((b) => !b.on).length;
  const head = `Found ${boxes.length} private ${boxes.length === 1 ? 'detail' : 'details'} on this device.`;
  return kept
    ? `${head} ${boxes.length - kept} masked, ${kept} kept visible.`
    : `${head} Press a box to keep that part visible.`;
}

/** A box the person drew by hand. */
export function toImageBox(r: { x: number; y: number; w: number; h: number }): MaskBox {
  return { ...r, type: 'CUSTOM', value: 'Your box', on: true };
}
