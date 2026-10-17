// Runs the @visual tests inside the official Playwright image so baselines are rendered on
// Linux, the same as CI. Usage: node scripts/visual.mjs [check|update]
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const mode = process.argv[2] ?? 'check';
if (!['check', 'update'].includes(mode)) {
  console.error('Usage: node scripts/visual.mjs [check|update]');
  process.exit(2);
}

const { version } = JSON.parse(readFileSync('node_modules/@playwright/test/package.json', 'utf8'));
const image = `mcr.microsoft.com/playwright:v${version}-noble`;
const update = mode === 'update' ? ' --update-snapshots' : '';

// node_modules lives in a named volume so the container never touches the host's copy.
const args = [
  'run', '--rm', '--ipc=host',
  '-v', `${process.cwd()}:/work`,
  '-v', 'testover-visual-node-modules:/work/node_modules',
  '-w', '/work',
  image,
  'bash', '-c', `npm ci && npx playwright test --grep @visual${update}`,
];

const result = spawnSync('docker', args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
