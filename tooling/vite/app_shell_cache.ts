import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

/** Include the emitted app/SQLite chunks in the first service-worker installation. */
export function appShellCache(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'jamanvaar-app-shell-cache',
    apply: 'build',
    configResolved(resolved) { config = resolved; },
    closeBundle() {
      const output = path.resolve(config.root, config.build.outDir);
      const assets = readdirSync(path.join(output, 'assets'), { withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.(js|css|wasm|woff2?|png|jpe?g|svg|webp)$/.test(entry.name))
        .map((entry) => `./assets/${entry.name}`).sort();
      const buildId = createHash('sha256').update(assets.join('\n'))
        .update(readFileSync(path.join(output, 'index.html'))).digest('hex').slice(0, 12);
      const workerPath = path.join(output, 'sw.js');
      const source = readFileSync(workerPath, 'utf8')
        .replace("/*__APP_SHELL_BUILD__*/ 'dev'", JSON.stringify(buildId))
        .replace('/*__APP_SHELL_ASSETS__*/ []', JSON.stringify(assets));
      writeFileSync(workerPath, source);
    }
  };
}
