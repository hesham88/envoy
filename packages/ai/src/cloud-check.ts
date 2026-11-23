/**
 * Why the cloud step didn't answer. With PREFER_IN_CLOUD the SDK quietly falls back to the device on
 * any cloud error, so the reason is lost. After a fallback this asks App Check for a token itself and
 * names the cause, so the person (or a judge) knows what to fix.
 */
import { getLimitedUseToken, type AppCheck } from 'firebase/app-check';

export type CloudProblem =
  | { kind: 'offline'; message: string }
  | { kind: 'app-check'; message: string }
  | { kind: 'model'; message: string };

export const CLOUD_PROBLEM_TEXT = {
  offline: "You're offline, so Envoy answered on this device. Reconnect to use the cloud model.",
  appCheck:
    "Firebase App Check didn't accept this browser, so Envoy answered on this device. Its reCAPTCHA check scores a browser started for testing or remote debugging as automated. Open Envoy in an ordinary Chrome window to use the cloud.",
  model:
    "The cloud model didn't answer (it may be busy), so Envoy answered on this device. Try again, or switch the cloud model.",
} as const;

export async function diagnoseCloud(
  appCheck: AppCheck | null,
  online: boolean = typeof navigator === 'undefined' ? true : navigator.onLine,
): Promise<CloudProblem> {
  if (!online) return { kind: 'offline', message: CLOUD_PROBLEM_TEXT.offline };
  if (appCheck) {
    try {
      await getLimitedUseToken(appCheck);
    } catch {
      return { kind: 'app-check', message: CLOUD_PROBLEM_TEXT.appCheck };
    }
  }
  return { kind: 'model', message: CLOUD_PROBLEM_TEXT.model };
}
