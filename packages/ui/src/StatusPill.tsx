import { Download, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { DeviceStatus } from '@envoy/ai';

export type DeviceState = DeviceStatus | 'checking';

const ICON = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const;

/**
 * What kind of protection this browser can give right now. Always icon + words, never colour alone.
 * `compact` shortens the wording for narrow surfaces (the extension side panel).
 */
export function StatusPill({ status, progress, compact = false }: { status: DeviceState; progress: number | null; compact?: boolean }) {
  const base = `inline-flex items-center gap-2 rounded-full font-semibold whitespace-nowrap ${compact ? 'px-2.5 py-1 text-[13px]' : 'px-3 py-1.5 text-sm'}`;
  if (status === 'available') {
    return (
      <span role="status" className={`${base} bg-device-tint text-device-on-tint`}>
        <ShieldCheck {...ICON} /> {compact ? 'On-device ready' : 'Private mode on · on-device model ready'}
      </span>
    );
  }
  if (status === 'downloading') {
    const pct = progress === null ? null : Math.round(progress * 100);
    return (
      <span role="status" className={`${base} bg-device-tint text-device-on-tint`}>
        <Loader2 {...ICON} className="animate-spin motion-reduce:animate-none" />
        {compact ? 'Downloading' : 'Downloading on-device model'}
        {pct === null ? '…' : ` ${pct}%`}
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
      <span role="status" className={`${base} border border-line bg-surface text-muted`}>
        <Loader2 {...ICON} className="animate-spin motion-reduce:animate-none" /> {compact ? 'Checking…' : 'Checking on-device AI…'}
      </span>
    );
  }
  return (
    <span role="status" className={`${base} bg-detected text-ink`}>
      <ShieldAlert {...ICON} /> Basic protection
    </span>
  );
}
