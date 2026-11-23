import type { FirebaseApp } from 'firebase/app';
import { fetchAndActivate, getRemoteConfig, getValue } from 'firebase/remote-config';

export interface RemoteSettings {
  /** The most capable cloud model people can choose (Remote Config `cloud_model`). */
  cloudModel: string;
  /** The fast cloud model (Remote Config `cloud_model_fast`). */
  fastCloudModel: string;
  /** Which of the two people get until they choose (Remote Config `cloud_default`). */
  cloudDefault: 'fast' | 'capable';
  /** Version of the on-device prompts, so tuned prompts can roll out without a redeploy. */
  promptVersion: string;
}

export const DEFAULT_SETTINGS: RemoteSettings = {
  // Gemini 4 Hydrogen: the stable model Firebase recommends for production (Nov 2026).
  cloudModel: 'gemini-4-hydrogen',
  fastCloudModel: 'gemini-3.5-flash-lite',
  // Fast by default: Hydrogen took 10-50 s per answer in our tests, Flash-Lite about 1.4 s.
  cloudDefault: 'fast',
  promptVersion: 'v1',
};

/** Loads Remote Config; any failure (offline, blocked, not configured) returns the safe defaults. */
export async function loadRemoteSettings(app: FirebaseApp): Promise<RemoteSettings> {
  try {
    const rc = getRemoteConfig(app);
    rc.settings.minimumFetchIntervalMillis = 3_600_000;
    rc.defaultConfig = {
      cloud_model: DEFAULT_SETTINGS.cloudModel,
      cloud_model_fast: DEFAULT_SETTINGS.fastCloudModel,
      cloud_default: DEFAULT_SETTINGS.cloudDefault,
      prompt_version: DEFAULT_SETTINGS.promptVersion,
    };
    await fetchAndActivate(rc);
    const cloudModel = getValue(rc, 'cloud_model').asString() || DEFAULT_SETTINGS.cloudModel;
    const promptVersion =
      getValue(rc, 'prompt_version').asString() || DEFAULT_SETTINGS.promptVersion;
    const fastCloudModel =
      getValue(rc, 'cloud_model_fast').asString() || DEFAULT_SETTINGS.fastCloudModel;
    const cloudDefault =
      getValue(rc, 'cloud_default').asString() === 'capable' ? 'capable' : 'fast';
    return { cloudModel, fastCloudModel, cloudDefault, promptVersion };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
