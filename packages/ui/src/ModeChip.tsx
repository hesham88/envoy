import { Cloud, Laptop } from 'lucide-react';

/** Green + laptop = on this device. Blue + cloud = in the cloud. Always with words. */
export function ModeChip({ kind, children }: { kind: 'device' | 'cloud'; children: React.ReactNode }) {
  const Icon = kind === 'device' ? Laptop : Cloud;
  return (
    <span
      className={`inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${
        kind === 'device' ? 'bg-device-tint text-device-on-tint' : 'bg-cloud-tint text-cloud-on-tint'
      }`}
    >
      <Icon size={14} strokeWidth={2} aria-hidden="true" />
      {children}
    </span>
  );
}
