/** History: past chats, kept encrypted on this device (see lib/vault.ts). Open, delete, lock with a passcode. */
import { useEffect, useRef, useState } from 'react';
import { KeyRound, Lock, Trash2, X } from 'lucide-react';
import type { VaultApi } from '../lib/useVault';

export function HistoryDialog({
  vault,
  onOpen,
  onClose,
}: {
  vault: VaultApi;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [passcode, setPasscode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d || d.open) return;
    if (typeof d.showModal === 'function') d.showModal();
    else d.setAttribute('open', '');
  }, []);

  const run = async (fn: () => Promise<void>, ok?: string) => {
    setMessage(null);
    try {
      await fn();
      setPasscode('');
      if (ok) setMessage(ok);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="history-h"
      className="envoy-uv m-auto w-[min(560px,calc(100vw-32px))] rounded-[20px] border border-line p-0 text-ink backdrop:bg-black/60"
    >
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 id="history-h" className="m-0 font-display text-[26px] font-[560]">
            History
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <p className="m-0 text-[14px] leading-relaxed text-muted">
          Your chats are encrypted on this device (AES-GCM, with a key that never leaves this
          browser) and are never sent anywhere. Add a passcode so they can only be opened with it.
        </p>

        {vault.state === 'unavailable' && (
          <p className="m-0 text-[14px] text-muted">
            This browser can't store encrypted history, so nothing is kept.
          </p>
        )}

        {vault.state === 'locked' && (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => vault.unlock(passcode));
            }}
          >
            <label className="sr-only" htmlFor="vault-unlock">
              Passcode
            </label>
            <input
              id="vault-unlock"
              type="password"
              autoComplete="current-password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Passcode"
              className="min-w-[12rem] flex-1 rounded-[10px] border border-line bg-paper px-3 py-2 text-[15px] text-ink"
            />
            <button
              type="submit"
              className="rounded-full bg-device px-4 py-2 text-[14.5px] font-semibold text-uv-deep"
            >
              Unlock
            </button>
          </form>
        )}

        {vault.state === 'ready' && (
          <>
            <ul className="m-0 flex max-h-[40vh] list-none flex-col gap-1.5 overflow-auto p-0">
              {vault.entries.length === 0 && (
                <li className="text-[14px] text-muted">No saved chats yet.</li>
              )}
              {vault.entries.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center gap-2 rounded-[12px] border border-line px-3 py-2"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onOpen(e.id);
                      onClose();
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-[14.5px] text-ink">{e.title}</span>
                    <span className="block text-[12px] text-muted">
                      {new Date(e.updatedAt).toLocaleString()}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void run(() => vault.remove(e.id))}
                    aria-label={`Delete ${e.title}`}
                    className="text-muted hover:text-danger"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>

            <form
              className="flex flex-wrap items-center gap-2 border-t border-line pt-4"
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  () => vault.setPasscode(passcode),
                  'Passcode set. History now opens only with it.',
                );
              }}
            >
              <KeyRound size={16} aria-hidden="true" className="text-muted" />
              <label className="sr-only" htmlFor="vault-passcode">
                {vault.hasPasscode ? 'New passcode' : 'Passcode'}
              </label>
              <input
                id="vault-passcode"
                type="password"
                autoComplete="new-password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder={
                  vault.hasPasscode ? 'Change passcode' : 'Add a passcode (6+ characters)'
                }
                className="min-w-[12rem] flex-1 rounded-[10px] border border-line bg-paper px-3 py-2 text-[15px] text-ink"
              />
              <button
                type="submit"
                disabled={passcode.length < 6}
                className="rounded-full border border-line px-4 py-2 text-[14px] text-ink disabled:opacity-40"
              >
                {vault.hasPasscode ? 'Change' : 'Set passcode'}
              </button>
            </form>

            <div className="flex flex-wrap gap-2">
              {vault.hasPasscode && (
                <button
                  type="button"
                  onClick={() => vault.lock()}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[13.5px] text-ink"
                >
                  <Lock size={14} aria-hidden="true" /> Lock now
                </button>
              )}
              {confirmWipe ? (
                <button
                  type="button"
                  onClick={() =>
                    void run(
                      () => vault.destroyAll(),
                      'All history and its key were deleted.',
                    ).then(() => setConfirmWipe(false))
                  }
                  className="rounded-full border border-danger/60 bg-danger-tint px-3 py-1.5 text-[13.5px] text-danger"
                >
                  Delete everything, for good
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmWipe(true)}
                  className="rounded-full border border-line px-3 py-1.5 text-[13.5px] text-muted hover:text-danger"
                >
                  Delete all history
                </button>
              )}
            </div>
          </>
        )}

        {message && (
          <p role="status" className="m-0 text-[13.5px] text-muted">
            {message}
          </p>
        )}
      </div>
    </dialog>
  );
}
