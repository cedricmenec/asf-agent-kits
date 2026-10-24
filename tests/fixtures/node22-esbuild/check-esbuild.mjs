import assert from 'node:assert/strict';
import { transform } from 'esbuild';

const result = await transform('const answer: number = 42', {
  loader: 'ts',
  target: 'es2022',
});
assert.match(result.code, /answer = 42/);
console.log('AgentKit Node 22 project check: esbuild available');
