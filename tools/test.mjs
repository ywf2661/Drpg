// npm test: vitest를 작업 폴더의 드라이브 글자를 대문자로 맞춰 띄운다.
// Windows에서 소문자 드라이브(c:\, VS Code 터미널)로 시작하면 vitest가 같은 모듈을 c:와 C: 두 경로로 불러
// "failed to find the current suite"로 모든 테스트가 실패한다(config의 root·--root로는 안 고쳐짐)
import { spawnSync } from 'node:child_process';

const cwd = process.cwd().replace(/^[a-z]:/, (d) => d.toUpperCase());
const r = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...process.argv.slice(2)], { cwd, stdio: 'inherit' });
process.exit(r.status ?? 1);
