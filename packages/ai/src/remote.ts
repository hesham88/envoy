import type { FirebaseApp } from 'firebase/app';
import { fetchAndActivate, getRemoteConfig, getValue } from 'firebase/remote-config';

export interface RemoteSettings {
  /** Cloud model for the reason step (and the cloud side of every hybrid model). */
  cloudModel: string;
  /** The faster cloud model people can choose instead (Remote Config `cloud_model_fast`). */
  fastCloudModel: string;
  /** Version of the on-device prompts, so tuned prompts can roll out without a redeploy. */
  promptVersion: string;
}

export const DEFAULT_SETTINGS: RemoteSettings = {
  // Gemini 4 Hydrogen: the stable model Firebase recommends for production (Nov 2026).
  cloudModel: 'gemini-4-hydrogen',
  fastCloudModel: 'gemini-3.5-flash-lite',
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
      prompt_version: DEFAULT_SETTINGS.promptVersion,
    };
    await fetchAndActivate(rc);
    const cloudModel = getValue(rc, 'cloud_model').asString() || DEFAULT_SETTINGS.cloudModel;
    const promptVersion =
      getValue(rc, 'prompt_version').asString() || DEFAULT_SETTINGS.promptVersion;
    const fastCloudModel =
      getValue(rc, 'cloud_model_fast').asString() || DEFAULT_SETTINGS.fastCloudModel;
    return { cloudModel, fastCloudModel, promptVersion };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
