// The few Node APIs some tests use (RecordedRun, no-telemetry); the app never imports these.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}
declare module 'node:path' {
  export function resolve(...paths: string[]): string;
  export function dirname(path: string): string;
}
declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}
declare module 'node:module' {
  export function createRequire(url: string | URL): { resolve(id: string): string };
}
