// Extracted minimum static pre-paid-apply gate from ThreadStep
// scripts/check-openspec-task-phases.mjs (ASF-OPSX-01/02).
import { readFileSync } from 'node:fs';
const file = process.argv[2];
if (!file || process.argv.length !== 3) throw Error('Expected tasks.md path');
const lines = readFileSync(file, 'utf8').split(/\r?\n/);
let section = '';
let count = 0;
for (const [index, line] of lines.entries()) {
  const heading = /^#{1,6}\s+(.*)/.exec(line);
  if (heading) section = heading[1].toLowerCase();
  const box = /^\s*-\s+\[([ xX])\]\s+(.+)/.exec(line);
  if (!box) continue;
  count++;
  const text = box[2];
  if (/manual acceptance|post.sync review|recette manuelle|validation humaine/.test(section) ||
      /(?:after|post|après).{0,40}(?:sync|archive|PR|CI|merge|publication)/i.test(text) ||
      /(?:manual|human|visually|real browser|téléphone réel|navigateur réel)/i.test(text)) {
    throw Error(`Non-executable checkbox line ${index + 1}: ${text}`);
  }
}
if (!count) throw Error('No implementation checklist entries found');
console.log(`Implementation checklist: ${count} statically admissible entries`);
