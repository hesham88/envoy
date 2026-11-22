/**
 * Fast, rules-only scan for live use (a text field as the user types, a CLI hook, a file before upload).
 * No model, no network: deterministic detectors, secrets and the user's own rules, in well under a
 * millisecond per kilobyte. Run the on-device model separately, on pause or on request.
 */
import { detectWithRules, type RuleOptions } from './rules';
import { assignTags, maskText, type TagMap } from './tags';
import type { Entity, EntityType } from './types';

export interface Finding {
  type: EntityType;
  value: string;
  start: number;
  end: number;
  /** The meaning-preserving tag this value becomes, e.g. [EMAIL], [PROJECT_2]. */
  tag: string;
  /** For user rules, the rule's label. */
  role?: string;
}

export interface ScanResult {
  findings: Finding[];
  /** The text with every finding replaced by its tag. */
  masked: string;
  tags: TagMap;
  entities: Entity[];
}

export function scanText(text: string, opts: RuleOptions = {}): ScanResult {
  const entities = detectWithRules(text, opts);
  const tags = assignTags(entities);
  const findings = entities.map((e) => ({ type: e.type, value: e.value, start: e.start, end: e.end, tag: tags.tagOf(e), ...(e.role ? { role: e.role } : {}) }));
  return { findings, masked: maskText(text, entities, tags), tags, entities };
}

/** Masks only the findings whose tag is not in `keep` (values the user chose to leave as they are). */
export function maskFindings(text: string, scan: ScanResult, keep: ReadonlySet<string> = new Set()): string {
  return maskText(
    text,
    scan.entities.filter((e) => !keep.has(scan.tags.tagOf(e))),
    scan.tags,
  );
}
