import { Download, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { DeviceStatus } from '@envoy/ai';

export type DeviceState = DeviceStatus | 'checking';

const ICON = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const;

/** Header pill: what kind of protection this browser can give right now. Always icon + words, never colour alone. */
export function StatusPill({ status, progress }: { status: DeviceState; progress: number | null }) {
  const base = 'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold';
  if (status === 'available') {
    return (
      <span role="status" className={`${base} bg-device-tint text-device-on-tint`}>
        <ShieldCheck {...ICON} /> Private mode on · on-device model ready
      </span>
    );
  }
  if (status === 'downloading') {
    const pct = progress === null ? null : Math.round(progress * 100);
    return (
      <span role="status" className={`${base} bg-device-tint text-device-on-tint`}>
        <Loader2 {...ICON} className="animate-spin motion-reduce:animate-none" />
        Downloading on-device model{pct === null ? '…' : ` ${pct}%`}
      </span>
    );
  }
  if (status === 'downloadable') {
    return (
      <span role="status" className={`${base} bg-cloud-tint text-cloud-on-tint`}>
        <Download {...ICON} /> Private mode available
      </span>
    );
  }
  if (status === 'checking') {
    return (
      <span role="status" className={`${base} bg-surface text-muted border border-line`}>
        <Loader2 {...ICON} className="animate-spin motion-reduce:animate-none" /> Checking on-device AI…
      </span>
    );
  }
  return (
    <span role="status" className={`${base} bg-detected text-ink`}>
      <ShieldAlert {...ICON} /> Basic protection
    </span>
  );
}
