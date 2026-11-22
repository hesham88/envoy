import { analyze, type Analysis, type AnalyzeProgress, type DeviceStatus, type Deps } from '@envoy/ai';

export const NOTICES = {
  downloading: 'Your on-device model is still downloading, so this run uses Basic protection.',
  noModel: 'No on-device model is ready in this browser, so Envoy uses Basic protection: built-in local rules hide IDs, phones, emails, IBANs and amounts. Check the names it flagged before you approve.',
} as const;

/** Runs the pipeline and explains, in one sentence, why a run used Basic protection (if it did). */
export async function runAnalysis(
  deps: Deps,
  doc: string,
  question: string,
  status: DeviceStatus | 'checking',
  onProgress?: (p: AnalyzeProgress) => void,
): Promise<{ analysis: Analysis; notice: string | null }> {
  const analysis = await analyze(doc, question, deps, onProgress ? { onProgress } : {});
  if (analysis.mode === 'private') return { analysis, notice: null };
  if (analysis.fallbackReason) return { analysis, notice: analysis.fallbackReason };
  return { analysis, notice: status === 'downloading' ? NOTICES.downloading : NOTICES.noModel };
}
