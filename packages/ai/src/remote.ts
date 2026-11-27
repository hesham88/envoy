import type { FirebaseApp } from 'firebase/app';
import { fetchAndActivate, getRemoteConfig, getValue } from 'firebase/remote-config';
import { validateCustomRule, type CustomRule } from '@envoy/core';

/**
 * An organisation's masking rules, published once in Remote Config (`policy_pack`) and picked up by
 * every Envoy user without a redeploy: project codenames, client names, internal ID formats. Shown
 * read-only next to a person's own rules. Rules are words or patterns, never data; nothing about a
 * person or a document goes back to Firebase.
 */
export interface PolicyPack {
  name: string;
  rules: CustomRule[];
}

const MAX_POLICY_RULES = 50;

/** Parses `policy_pack`: invalid rules are dropped, a broken pack is ignored (never fatal). */
export function parsePolicyPack(json: string): PolicyPack | undefined {
  if (!json.trim()) return undefined;
  try {
    const v = JSON.parse(json) as { name?: unknown; rules?: unknown };
    if (!Array.isArray(v.rules)) return undefined;
    const rules = (v.rules as CustomRule[])
      .filter((r) => !!r && typeof r === 'object' && typeof r.label === 'string')
      .map((r) => ({
        label: r.label,
        ...(Array.isArray(r.terms) ? { terms: r.terms.filter((t) => typeof t === 'string') } : {}),
        ...(typeof r.pattern === 'string' ? { pattern: r.pattern } : {}),
      }))
      .filter((r) => !validateCustomRule(r))
      .slice(0, MAX_POLICY_RULES);
    if (!rules.length) return undefined;
    const name =
      typeof v.name === 'string' && v.name.trim()
        ? v.name.trim().slice(0, 60)
        : 'Your organisation';
    return { name, rules };
  } catch {
    return undefined;
  }
}

export interface RemoteSettings {
  /** The most capable cloud model people can choose (Remote Config `cloud_model`). */
  cloudModel: string;
  /** The fast cloud model (Remote Config `cloud_model_fast`). */
  fastCloudModel: string;
  /** Which of the two people get until they choose (Remote Config `cloud_default`). */
  cloudDefault: 'fast' | 'capable';
  /** Version of the on-device prompts, so tuned prompts can roll out without a redeploy. */
  promptVersion: string;
  /** The organisation's masking rules (Remote Config `policy_pack`), if one is published. */
  policyPack?: PolicyPack;
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
      policy_pack: '',
    };
    await fetchAndActivate(rc);
    const cloudModel = getValue(rc, 'cloud_model').asString() || DEFAULT_SETTINGS.cloudModel;
    const promptVersion =
      getValue(rc, 'prompt_version').asString() || DEFAULT_SETTINGS.promptVersion;
    const fastCloudModel =
      getValue(rc, 'cloud_model_fast').asString() || DEFAULT_SETTINGS.fastCloudModel;
    const cloudDefault =
      getValue(rc, 'cloud_default').asString() === 'capable' ? 'capable' : 'fast';
    const policyPack = parsePolicyPack(getValue(rc, 'policy_pack').asString());
    return {
      cloudModel,
      fastCloudModel,
      cloudDefault,
      promptVersion,
      ...(policyPack ? { policyPack } : {}),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
