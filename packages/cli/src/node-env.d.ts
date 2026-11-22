declare module 'node:fs' {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function writeFileSync(path: string, data: string, encoding?: 'utf8'): void;
  export function mkdtempSync(prefix: string): string;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
}

declare module 'node:os' {
  export function homedir(): string;
  export function tmpdir(): string;
}

declare module 'node:path' {
  export function join(...paths: string[]): string;
}

interface NodeBuffer extends Uint8Array {
  toString(encoding?: 'utf8'): string;
}

declare const Buffer: {
  from(input: string): NodeBuffer;
  concat(list: readonly Uint8Array[]): NodeBuffer;
};

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  stdin: AsyncIterable<string | Uint8Array>;
  stdout: { write(chunk: string): boolean };
  stderr: { write(chunk: string): boolean };
  exit(code?: number): never;
};
