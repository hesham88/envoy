import { useId } from 'react';
import {
  Briefcase,
  Camera,
  Cloud,
  Cpu,
  FlaskConical,
  House,
  Mail,
  PenTool,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { SAMPLES, type Sample, type SampleId } from './samples';

const ICON: Record<SampleId, LucideIcon> = {
  lease: House,
  offer: Briefcase,
  lab: FlaskConical,
  freelance: PenTool,
  loan: Sun,
};

function Card({
  sample,
  onAsk,
  onPhoto,
}: {
  sample: Sample;
  onAsk: (s: Sample, q: string) => void;
  onPhoto?: () => void;
}) {
  const id = useId();
  const Icon = ICON[sample.id];
  return (
    <div
      role="group"
      aria-labelledby={id}
      className="flex flex-col gap-2.5 rounded-[16px] border border-line bg-surface/60 p-4"
    >
      <div className="flex items-start gap-2.5">
        <Icon
          size={18}
          strokeWidth={1.75}
          className="mt-0.5 flex-none text-muted"
          aria-hidden="true"
        />
        <div>
          <h2 id={id} className="m-0 font-display text-[1.08rem] leading-tight font-[560] text-ink">
            {sample.label}
          </h2>
          <p className="m-0 text-[12.5px] text-muted">{sample.blurb}</p>
        </div>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {sample.questions.map((q) => {
          const device = q.where === 'device';
          const Where = device ? Cpu : Cloud;
          return (
            <li key={q.text}>
              <button
                type="button"
                onClick={() => onAsk(sample, q.text)}
                className={`flex w-full items-start gap-2 rounded-[10px] border border-line/70 px-2.5 py-2 text-left text-[13.5px] leading-snug text-ink ${device ? 'hover:border-device/70' : 'hover:border-cloud/70'}`}
              >
                <Where
                  size={14}
                  className={`mt-[3px] flex-none ${device ? 'text-device' : 'text-cloud'}`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">{q.text}</span>
                <span
                  className={`mt-px flex-none text-[11.5px] ${device ? 'text-device-on-tint' : 'text-cloud-on-tint'}`}
                >
                  {device ? 'on this device' : 'cloud, masked'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {onPhoto && (
        <button
          type="button"
          onClick={onPhoto}
          className="flex items-center gap-2 self-start rounded-full border border-dashed border-device/60 px-3 py-1.5 text-[13px] text-device-on-tint hover:border-device"
        >
          <Camera size={14} aria-hidden="true" />
          Try a photo of this bill
        </button>
      )}
    </div>
  );
}

/** The empty chat: five fictional documents from real situations, one click from a real run. */
export function SampleCards({
  onAsk,
  onEmail,
  onPhoto,
  compact,
}: {
  onAsk: (s: Sample, question: string) => void;
  onEmail: () => void;
  /** Loads the sample photo of the lab bill (web app only: it ships the samples folder). */
  onPhoto?: () => void;
  /** The extension side panel: one column. */
  compact: boolean;
}) {
  return (
    <div className="flex w-full flex-col gap-3">
      <div className={`grid gap-3 ${compact ? '' : 'md:grid-cols-2'}`}>
        {SAMPLES.map((s) => (
          <Card
            key={s.id}
            sample={s}
            onAsk={onAsk}
            {...(s.id === 'lab' && onPhoto ? { onPhoto } : {})}
          />
        ))}
        <div className="flex flex-col justify-between gap-3 rounded-[16px] border border-dashed border-line p-4">
          <p className="m-0 text-[13.5px] text-muted">
            No document? Write a message with your own details in it, and Envoy masks them before
            anything leaves.
          </p>
          <button
            type="button"
            onClick={onEmail}
            className="flex items-center gap-2 self-start rounded-full border border-line px-3.5 py-1.5 text-[13.5px] text-ink hover:border-device/60"
          >
            <Mail size={14} aria-hidden="true" /> Ask about a private email
          </button>
        </div>
      </div>
      <p className="m-0 text-[12px] leading-snug text-muted">
        All people, IDs and numbers are fictional. In Private mode, Gemma 4 decides each time where
        to answer: in our test runs it usually answered the green questions on this device, and the
        blue ones sent a masked excerpt. Without the on-device model, Basic protection sends every
        question, masked.
      </p>
    </div>
  );
}
