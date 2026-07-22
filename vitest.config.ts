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
    // As the suite grew past ~17 pglite-backed files, even one-process-per-file
    // isolation started hitting occasional "Worker exited unexpectedly" crashes
    // under partial parallelism (maxForks: 4, then 2 — both still flaked as the
    // suite kept growing, 2 files crashed even at maxForks: 2 with 23 files).
    // Forcing fully serial execution (maxForks: 1) trades wall-clock time for
    // determinism — reliability matters more than speed for a suite this size.
    poolOptions: {
      forks: {
        minForks: 1,
        maxForks: 1,
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
})
