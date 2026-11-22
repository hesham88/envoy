/** The pipeline steps. Private steps run only on the device; `reason` may use the cloud. */
export type Step = 'detect' | 'minimize' | 'route' | 'answerLocal' | 'reason';

export type EntityType =
  | 'PERSON'
  | 'ORG'
  | 'ADDRESS'
  | 'EMAIL'
  | 'PHONE'
  | 'NATIONAL_ID'
  | 'IBAN'
  | 'CARD'
  | 'MONEY'
  | 'DATE'
  /** API keys, tokens, private keys and password assignments. */
  | 'SECRET'
  /** Matched by one of the user's own rules; `role` holds the rule's label. */
  | 'CUSTOM';

/** A personal detail found in the document. `start`/`end` are offsets into the source text. */
export interface Entity {
  type: EntityType;
  value: string;
  start: number;
  end: number;
  confidence: number;
  source: 'rules' | 'nano';
  /** Role in the document (landlord, tenant, rent, …), used for meaning-preserving tags. */
  role?: string;
}

/** A clause or paragraph of the document. */
export interface Chunk {
  id: number;
  label: string;
  text: string;
  start: number;
  end: number;
  page: number;
}

export const PRIVATE_STEPS: readonly Step[] = ['detect', 'minimize', 'route', 'answerLocal'];
