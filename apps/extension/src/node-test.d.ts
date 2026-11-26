// The few Node APIs scratch-guard.test.ts uses (it runs in Node; the extension never imports these).
declare module 'node:fs' {
  export interface Dirent {
    name: string;
    isDirectory(): boolean;
  }
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readdirSync(path: string, options: { withFileTypes: true }): Dirent[];
}
declare module 'node:path' {
  export function resolve(...paths: string[]): string;
  export function dirname(path: string): string;
  export function join(...paths: string[]): string;
  export function relative(from: string, to: string): string;
}
declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}

// vite.config.ts reads one build flag from the environment.
declare const process: { env: Record<string, string | undefined> };
