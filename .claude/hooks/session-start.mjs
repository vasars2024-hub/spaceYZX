// Claude Code SessionStart hook: in cloud (web) sessions, install dependencies so
// tests and lint work immediately. Does nothing on local machines.
import { spawnSync } from 'node:child_process';

if (process.env.CLAUDE_CODE_REMOTE === 'true') {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const r = spawnSync(npm, ['install', '--no-audit', '--no-fund'], { stdio: 'inherit' });
  process.exit(r.status ?? 0);
}
