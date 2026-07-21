import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Each test file spins up its own in-memory Postgres via pglite (WASM).
    // The default 'threads' pool shares one process's memory across worker
    // threads, and WASM linear memory apparently doesn't get fully released
    // between files in that mode — the suite started crashing with "Worker
    // exited unexpectedly" once enough pglite-backed files accumulated, even
    // with fileParallelism disabled. 'forks' isolates each file in its own
    // process, so memory is fully reclaimed by the OS when a file finishes.
    pool: 'forks',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
})
