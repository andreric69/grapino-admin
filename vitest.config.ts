import { defineConfig } from 'vitest/config';

// Bewusst eine eigene Konfigurationsdatei statt vite.config.ts zu erweitern -
// so bleibt der Produktions-Build komplett unberuehrt von der
// Test-Einrichtung (gleiches Muster wie in der Weinapp).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
  },
});
