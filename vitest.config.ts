import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
    // Several agents share this machine: threads with a small cap avoid worker crashes (exit 134 / 0xC0000409) under memory pressure.
    pool: 'threads',
    maxWorkers: 2,
  },
});
