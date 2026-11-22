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
      return { pill: 'Private mode on · Gemini Nano ready', ready: true, showEnable: false, showFixHints: false };
    case 'downloadable':
    case 'downloading':
      return { pill: 'On-device model downloading…', ready: false, showEnable: true, showFixHints: true };
    case 'no-api':
      return { pill: 'Basic protection · no on-device model', ready: false, showEnable: false, showFixHints: true };
    case 'unavailable':
      return { pill: 'Basic protection', ready: false, showEnable: false, showFixHints: true };
    default:
      return { pill: 'Checking device…', ready: false, showEnable: false, showFixHints: false };
  }
}

export const FIX_HINTS =
  'If the download fails instantly ("Update error"): enable chrome://flags/#gemma4-for-built-in-ai, keep ~5 GB free in %TEMP% (Chrome checks twice the package size there), relaunch Chrome with TEMP/TMP on a roomy drive, and on older GPUs add the CPU-backend flags OnDeviceModelForceCpuBackend,OnDeviceModelCpuBackend.';
