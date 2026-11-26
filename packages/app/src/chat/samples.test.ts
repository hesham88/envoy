import { describe, expect, it } from 'vitest';
import { EN_LEASE, needsCalculation } from '@envoy/core';
import { SAMPLES, sampleFromUrl } from './samples';

describe('samples', () => {
  it('offers five documents from real situations', () => {
    expect(SAMPLES.map((s) => s.id)).toEqual(['lease', 'offer', 'lab', 'freelance', 'loan']);
    expect(SAMPLES[0]!.doc.text).toBe(EN_LEASE.text);
  });

  it('every sample has a question answered on the device and one that needs the cloud', () => {
    for (const s of SAMPLES) {
      expect(
        s.questions.some((q) => q.where === 'device'),
        s.id,
      ).toBe(true);
      expect(
        s.questions.some((q) => q.where === 'cloud'),
        s.id,
      ).toBe(true);
    }
  });

  it('no "on this device" question would be forced to the cloud by the calculation guard', () => {
    const device = SAMPLES.flatMap((s) => s.questions.filter((q) => q.where === 'device'));
    expect(device.filter((q) => needsCalculation(q.text)).map((q) => q.text)).toEqual([]);
  });

  it('every sample doc is marked as a fictional sample', () => {
    for (const s of SAMPLES) {
      expect(s.doc.source).toBe('sample');
      expect(s.doc.notice).toBe('All people, IDs and numbers are fictional.');
    }
  });

  it('opens a sample from the link', () => {
    expect(sampleFromUrl('?sample=lab')?.id).toBe('lab');
    expect(sampleFromUrl('?sample=lease')?.id).toBe('lease');
    expect(sampleFromUrl('?sample=nope')).toBeNull();
    expect(sampleFromUrl('')).toBeNull();
  });
});
