import { useSyncExternalStore } from 'react';
import { WifiOff } from 'lucide-react';

function subscribe(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

/** Dark banner while offline: Envoy keeps working with the on-device model. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="bg-ink text-paper">
      <p
        role="status"
        className="m-0 mx-auto flex max-w-[1200px] flex-wrap items-center gap-3 px-8 py-3.5 text-[15px]"
      >
        <WifiOff size={20} strokeWidth={1.75} aria-hidden="true" />
        <strong>You're offline.</strong>
        <span className="opacity-80">
          Envoy keeps answering on this device. Questions that need the cloud can wait here until
          you're back online, or get a lighter answer on this device now.
        </span>
      </p>
    </div>
  );
}
