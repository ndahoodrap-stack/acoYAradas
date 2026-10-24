import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/api/test/**/*.test.ts'],
    environment: 'node',
    // PGlite (Postgres embebido) usa WASM y un único cliente por instancia:
    // se ejecutan los archivos de prueba de a uno para evitar picos de memoria.
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    reporters: ['default'],
  },
});
