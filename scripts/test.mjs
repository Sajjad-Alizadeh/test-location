import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
const options = { stdio: 'inherit' };
try {
  const compile = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.test.json'], options);
  if (compile.status !== 0) process.exitCode = compile.status ?? 1;
  else {
    for (const file of ['location', 'security']) {
      const status = spawnSync(process.execPath, [`.test-build/tests/${file}.test.js`], options).status ?? 1;
      if (status !== 0) process.exitCode = status;
    }
  }
} finally { rmSync('.test-build', { recursive: true, force: true }); }
