// The few Node APIs links.test.ts uses (it runs in Node; the app itself never imports these).
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function existsSync(path: string): boolean;
}
declare module 'node:path' {
  export function resolve(...paths: string[]): string;
  export function dirname(path: string): string;
}
declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}
