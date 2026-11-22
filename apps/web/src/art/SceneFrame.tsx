/** /studio/scene?frame=0.5 — one frame of the DelegationScene at an exact point of its timeline (for renders). */
import { DelegationScene } from '@envoy/ui';

export function SceneFrame() {
  const raw = new URLSearchParams(location.search).get('frame');
  const frame = raw === null ? undefined : Math.min(1, Math.max(0, Number(raw)));
  return (
    <div className="bg-paper" data-scene-frame>
      <DelegationScene frame={frame} />
    </div>
  );
}
