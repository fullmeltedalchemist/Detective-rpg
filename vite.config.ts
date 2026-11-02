import { defineConfig, type Plugin } from 'vite';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

/** Resolve the commit being built: git, then Netlify's env, then a file written by the deploy script. */
function buildInfo() {
  const sh = (c: string) => { try { return execSync(c, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
  let commit = sh('git rev-parse HEAD') || process.env.COMMIT_REF || '';
  let branch = sh('git rev-parse --abbrev-ref HEAD') || process.env.BRANCH || process.env.HEAD || '';
  if (!commit && fs.existsSync('.build-commit')) {
    const [c, b] = fs.readFileSync('.build-commit', 'utf8').trim().split(/\s+/);
    commit = c; branch = branch || b || '';
  }
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  return { version: pkg.version as string, commit: commit || 'unknown', branch: branch || 'unknown', builtAt: new Date().toISOString() };
}

/** Emits /health.json and exposes the build info to the game as import.meta.env.VITE_BUILD_* */
function health(): Plugin {
  const info = buildInfo();
  process.env.VITE_BUILD_COMMIT = info.commit;
  process.env.VITE_BUILD_BRANCH = info.branch;
  process.env.VITE_BUILD_VERSION = info.version;
  return {
    name: 'case-files-health',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'health.json',
        source: JSON.stringify({
          status: 'ok',
          game: 'Case Files — Detective RPG',
          ...info,
          shortCommit: info.commit.slice(0, 7),
          githubCommitUrl: info.commit !== 'unknown' ? `https://github.com/fullmeltedalchemist/Detective-rpg/commit/${info.commit}` : null,
          preview: '/preview/',
          renderer: 'PlayCanvas (WebGL 2)',
        }, null, 2),
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [health()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2500,
    rollupOptions: { output: { manualChunks: (id: string) => (id.includes('node_modules/playcanvas') ? 'playcanvas' : undefined) } },
  },
  server: { host: true },
});
