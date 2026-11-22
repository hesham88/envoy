import { describe, expect, it, vi } from 'vitest';
import type { Analysis, Deps } from '@envoy/ai';

const analyze = vi.fn();
vi.mock('@envoy/ai', () => ({ analyze: (...a: unknown[]) => analyze(...a) }));
const { NOTICES, runAnalysis } = await import('./actions');

const deps = {} as Deps;
const result = (mode: 'private' | 'basic', fallbackReason: string | null = null) => ({ mode, fallbackReason }) as unknown as Analysis;

describe('runAnalysis', () => {
  it('analyze during download uses basic mode with notice', async () => {
    analyze.mockResolvedValueOnce(result('basic'));
    const out = await runAnalysis(deps, 'doc', 'Q?', 'downloading');
    expect(out.notice).toBe('Your on-device model is still downloading, so this run uses Basic protection.');
  });

  it('explains Basic protection when the browser has no on-device model', async () => {
    analyze.mockResolvedValueOnce(result('basic'));
    expect((await runAnalysis(deps, 'doc', 'Q?', 'no-api')).notice).toBe(NOTICES.noModel);
  });

  it('passes on the reason when the model stopped mid-run', async () => {
    analyze.mockResolvedValueOnce(result('basic', 'The on-device model stopped (quota), so this run uses Basic protection.'));
    expect((await runAnalysis(deps, 'doc', 'Q?', 'available')).notice).toMatch(/stopped \(quota\)/);
  });

  it('has no notice in private mode', async () => {
    analyze.mockResolvedValueOnce(result('private'));
    expect((await runAnalysis(deps, 'doc', 'Q?', 'available')).notice).toBeNull();
  });
});
