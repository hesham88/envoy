/** The privacy receipt: what left the device, what stayed, and where each step ran. */
import { canonical } from './tags';
import type { Chunk, Entity, EntityType, Step } from './types';

export interface ReceiptStep {
  step: Step;
  source: 'on_device' | 'in_cloud' | 'rules' | 'code';
  ms: number;
}

export interface Receipt {
  found: Partial<Record<EntityType, number>>;
  foundTotal: number;
  sharedTags: string[];
  keptTotal: number;
  charsSent: number;
  clausesSent: number;
  pagesTotal: number;
  pagesSent: number;
  steps: ReceiptStep[];
  mode: 'private' | 'basic';
  /** Details the user explicitly chose to share in Review. */
  sharedByUser: number;
}

export function buildReceipt(args: {
  sharedByUser?: number;
  entities: Entity[];
  outbound: string | null;
  chunksSent: Chunk[];
  chunksAll: Chunk[];
  steps: ReceiptStep[];
  mode: 'private' | 'basic';
}): Receipt {
  const distinct = new Map<string, EntityType>();
  for (const e of args.entities) distinct.set(`${e.type}:${canonical(e.value, e.type)}`, e.type);
  const found: Partial<Record<EntityType, number>> = {};
  for (const type of distinct.values()) found[type] = (found[type] ?? 0) + 1;

  const sharedTags = args.outbound ? [...new Set(args.outbound.match(/\[[A-Z][A-Z0-9_]*\]/g) ?? [])] : [];
  return {
    found,
    foundTotal: distinct.size,
    sharedTags,
    keptTotal: distinct.size - (args.sharedByUser ?? 0),
    sharedByUser: args.sharedByUser ?? 0,
    charsSent: args.outbound?.length ?? 0,
    clausesSent: args.outbound ? args.chunksSent.length : 0,
    pagesTotal: Math.max(1, ...args.chunksAll.map((c) => c.page)),
    pagesSent: args.outbound ? new Set(args.chunksSent.map((c) => c.page)).size : 0,
    steps: args.steps,
    mode: args.mode,
  };
}
