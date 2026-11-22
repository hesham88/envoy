/**
 * Runtime hook: starts Firebase once, loads Remote Config, tracks the on-device model,
 * and builds the per-step models the pipeline needs.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DETECT_SCHEMA, MINIMIZE_SCHEMA, ROUTE_SCHEMA, type Step } from '@envoy/core';
import {
  createStepModel,
  DEFAULT_SETTINGS,
  getDeviceStatus,
  initEnvoy,
  loadRemoteSettings,
  runPrivate,
  type Deps,
  type FirebaseEnv,
  type DeviceStatus,
  type JsonSchema,
  type RemoteSettings,
} from '@envoy/ai';

const SCHEMAS: Partial<Record<Step, JsonSchema>> = {
  detect: DETECT_SCHEMA as unknown as JsonSchema,
  minimize: MINIMIZE_SCHEMA as unknown as JsonSchema,
  route: ROUTE_SCHEMA as unknown as JsonSchema,
};
const STEPS: Step[] = ['detect', 'minimize', 'route', 'answerLocal', 'reason'];

export type EnvoyStatus = DeviceStatus | 'checking';

export interface EnvoyRuntime {
  status: EnvoyStatus;
  progress: number | null;
  settings: RemoteSettings;
  deps: Deps | null;
  configError: string | null;
  /** Must be called from a click handler: Chrome needs a user gesture to download the model. */
  enablePrivateMode: () => void;
  refreshStatus: () => Promise<void>;
  /**
   * Loads the on-device model ahead of the first real step (the first call is the slow one). Safe to call
   * often: it runs once, and only when the model is available. Await it before a run so the two never
   * hold sessions at the same time.
   */
  warmUp?: () => Promise<void>;
}

/** Where the Firebase settings come from: each app reads its own build environment. */
export interface EnvoyConfig {
  readEnv: () => FirebaseEnv;
  cloudModelOverride?: () => string | undefined;
  /** Development build: allows the App Check debug token. */
  dev: boolean;
}

export function useEnvoy(config: EnvoyConfig): EnvoyRuntime {
  const boot = useMemo(() => {
    try {
      return {
        ...initEnvoy(config.readEnv(), { dev: config.dev }),
        error: null as string | null,
      };
    } catch (e) {
      return { app: null, ai: null, error: (e as Error).message };
    }
  }, []);
  const [status, setStatus] = useState<EnvoyStatus>('checking');
  const [progress, setProgress] = useState<number | null>(null);
  const [settings, setSettings] = useState<RemoteSettings>(DEFAULT_SETTINGS);
  const polling = useRef<number | null>(null);

  const refreshStatus = useCallback(async () => setStatus(await getDeviceStatus()), []);

  useEffect(() => {
    void refreshStatus();
    if (boot.app) {
      void loadRemoteSettings(boot.app).then((s) =>
        setSettings({ ...s, cloudModel: config.cloudModelOverride?.() ?? s.cloudModel }),
      );
    }
    return () => {
      if (polling.current) window.clearInterval(polling.current);
    };
  }, [boot.app, refreshStatus]);

  const deps = useMemo<Deps | null>(() => {
    if (!boot.ai) return null;
    const models = Object.fromEntries(
      STEPS.map((s) => [s, createStepModel(boot.ai!, s, settings, SCHEMAS[s])]),
    ) as Deps['models'];
    return { runPrivate, models, getDeviceStatus };
  }, [boot.ai, settings]);

  const enablePrivateMode = useCallback(() => {
    if (!deps) return;
    setProgress(0);
    setStatus('downloading');
    if (!polling.current) polling.current = window.setInterval(() => void refreshStatus(), 2000);
    deps.models.route
      .initializeDeviceModel((p) => setProgress(p))
      .then(refreshStatus)
      .catch(refreshStatus)
      .finally(() => {
        setProgress(null);
        if (polling.current) window.clearInterval(polling.current);
        polling.current = null;
      });
  }, [deps, refreshStatus]);

  const warm = useRef<Promise<void> | null>(null);
  const warmUp = useCallback(() => {
    if (!deps || status !== 'available') return Promise.resolve();
    // A tiny guarded on-device call (it appears in the network ledger as a device call, like any other).
    warm.current ??= deps
      .runPrivate(deps.models.answerLocal, 'Reply with the single word: ready', 'answerLocal')
      .then(
        () => undefined,
        () => undefined,
      );
    return warm.current;
  }, [deps, status]);

  return {
    status,
    progress,
    settings,
    deps,
    configError: boot.error,
    enablePrivateMode,
    refreshStatus,
    warmUp,
  };
}
