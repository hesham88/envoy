import type { DeviceStatus } from '@envoy/ai';

export interface GateState {
  pill: string;
  ready: boolean;
  showEnable: boolean;
  showFixHints: boolean;
}

/** Maps the raw device status to what the panel shows. Pure, so it is unit-testable. */
export function gateState(status: DeviceStatus | 'checking'): GateState {
  switch (status) {
    case 'available':
      return {
        pill: "Private mode: Chrome's built-in model is ready",
        ready: true,
        showEnable: false,
        showFixHints: false,
      };
    case 'downloadable':
    case 'downloading':
      return {
        pill: 'On-device model downloading…',
        ready: false,
        showEnable: true,
        showFixHints: true,
      };
    case 'no-api':
      return {
        pill: 'Basic protection · no on-device model',
        ready: false,
        showEnable: false,
        showFixHints: true,
      };
    case 'unavailable':
      return { pill: 'Basic protection', ready: false, showEnable: false, showFixHints: true };
    default:
      return { pill: 'Checking device…', ready: false, showEnable: false, showFixHints: false };
  }
}

export const FIX_HINTS =
  'Chrome downloads its built-in model the first time you turn on private mode. It needs a desktop computer and several gigabytes of free disk space; chrome://on-device-internals shows its status. Until then, Envoy uses Basic protection: local rules that hide IDs, numbers, emails and accounts.';
