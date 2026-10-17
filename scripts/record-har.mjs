// Re-records tests/har/fixtures/demo-journey.har from the real server.
//
//   npm run har:record
//
// Same as `HAR_RECORD=1 npx playwright test tests/har --grep "signs.in"`, but works on Windows too.
// (Only the first test records: both tests share one HAR file, and two writers would clash.)
import { spawnSync } from 'node:child_process';

const isWindows = process.platform === 'win32';
const result = spawnSync(isWindows ? 'npx.cmd' : 'npx', ['playwright', 'test', 'tests/har', '--grep', 'signs.in'], {
  stdio: 'inherit',
  shell: isWindows,
  env: { ...process.env, HAR_RECORD: '1' },
});
process.exit(result.status ?? 1);
