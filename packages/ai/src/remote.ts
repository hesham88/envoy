import type { FirebaseApp } from 'firebase/app';
import { fetchAndActivate, getRemoteConfig, getValue } from 'firebase/remote-config';

export interface RemoteSettings {
  /** Cloud model for the reason step (and the cloud side of every hybrid model). */
  cloudModel: string;
  /** Version of the on-device prompts, so tuned prompts can roll out without a redeploy. */
  promptVersion: string;
}

export const DEFAULT_SETTINGS: RemoteSettings = {
  cloudModel: 'gemini-3.8-flash',
  promptVersion: 'v1',
};

/** Loads Remote Config; any failure (offline, blocked, not configured) returns the safe defaults. */
export async function loadRemoteSettings(app: FirebaseApp): Promise<RemoteSettings> {
  try {
    const rc = getRemoteConfig(app);
    rc.settings.minimumFetchIntervalMillis = 3_600_000;
    rc.defaultConfig = {
      cloud_model: DEFAULT_SETTINGS.cloudModel,
      prompt_version: DEFAULT_SETTINGS.promptVersion,
    };
    await fetchAndActivate(rc);
    const cloudModel = getValue(rc, 'cloud_model').asString() || DEFAULT_SETTINGS.cloudModel;
    const promptVersion =
      getValue(rc, 'prompt_version').asString() || DEFAULT_SETTINGS.promptVersion;
    return { cloudModel, promptVersion };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
