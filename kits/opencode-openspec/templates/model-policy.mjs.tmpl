// Adapted from ThreadStep scripts/asf/opencode-model-policy.mjs.
// Loaded from the reviewed default branch, never from an agent branch.
import { appendFileSync } from 'node:fs';
const approved = Object.freeze([
  'openrouter/deepseek/deepseek-v4.1-flash',
  'openrouter/deepseek/deepseek-v4.1-flash-1017',
  'openrouter/z-ai/glm-5.3-flash',
]);
const model = process.env.OPENCODE_MODEL;
if (!approved.includes(model)) throw Error('Unapproved model');
if (!process.env.GITHUB_ENV) throw Error('GITHUB_ENV missing');
appendFileSync(process.env.GITHUB_ENV,
  'OPENCODE_CONFIG_CONTENT=' + JSON.stringify({
    model, small_model: model, agent: { title: { disable: true } },
  }) + '\n');
console.log('Trusted fixed model policy configured without secondary title model.');
