import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { networkLog } from '@envoy/ai';
import { NetworkInspector } from './NetworkInspector';

afterEach(() => networkLog.clear());

describe('NetworkInspector', () => {
  it('labels the cloud reply as coming back, not as sent', () => {
    networkLog.record({ at: 1, step: 'reason', target: 'cloud', blocked: false, payload: 'q' });
    networkLog.record({
      at: 2,
      step: 'reason',
      target: 'cloud',
      blocked: false,
      payload: 'Up to {{RENT * 1.10}}.',
      direction: 'in',
    });
    render(<NetworkInspector open onClose={() => {}} />);
    expect(screen.getAllByText('→ Cloud')).toHaveLength(1);
    expect(screen.getAllByText('← From the cloud')).toHaveLength(1);
  });
});
