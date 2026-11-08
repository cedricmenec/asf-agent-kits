// Trusted, deterministic OpenSpec checklist gate. Keep diagnostics free of
// model-authored task content: a rejected checkbox may contain sensitive data.
import { readFileSync } from 'node:fs';

function refuse(code, line, reason, fix) {
  const location = line ? `line ${line}` : 'tasks.md';
  const annotation = line ? `file=tasks.md,line=${line},` : '';
  console.error(`::error ${annotation}title=ASF-OPSX-${code}::${location}: ${reason}. ${fix}`);
  process.exit(1);
}

const file = process.argv[2];
if (!file || process.argv.length !== 3) {
  refuse('INPUT', null, 'Expected exactly one tasks.md path', 'Check the workflow invocation');
}

let lines;
try {
  lines = readFileSync(file, 'utf8').split(/\r?\n/);
} catch {
  refuse('INPUT', null, 'Cannot read tasks.md', 'Ensure plan generated a readable tasks.md');
}

const headings = [];
let fence = null;
let count = 0;

for (const [index, line] of lines.entries()) {
  const number = index + 1;
  const delimiter = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
  if (delimiter) {
    const marker = delimiter[1];
    if (!fence) fence = { char: marker[0], length: marker.length };
    else if (marker[0] === fence.char && marker.length >= fence.length) fence = null;
    continue;
  }
  if (fence) continue;

  const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
  if (heading) {
    const depth = heading[1].length;
    while (headings.length && headings.at(-1).depth >= depth) headings.pop();
    headings.push({ depth, title: heading[2].toLowerCase() });
    continue;
  }

  const checkbox = /^\s*-\s+\[([ xX])\](?:\s+(.*))?$/.exec(line);
  if (!checkbox) continue;
  const task = checkbox[2]?.trim() ?? '';
  if (!task) {
    refuse('EMPTY', number, 'Checkbox has no executable task', 'Write an implementation or deterministic test action');
  }

  if (headings.some(({ title }) =>
    /\bmanual acceptance\b|\bpost.sync review\b|\brecette manuelle\b|\bvalidation humaine\b/i.test(title))) {
    refuse('SECTION', number, 'Checkbox inside a human or post-sync review section',
      'Remove the checkbox; these sections contain prose only');
  }

  // These activities happen after apply or require an independent authority.
  if (/(?:after|post|après).{0,50}\b(?:sync|archive|PR|CI|merge|publication)\b/i.test(task) ||
      /\b(?:review|approve|merge)\s+(?:the\s+)?(?:PR|pull request)\b/i.test(task) ||
      /^(?:run|trigger|wait for|verify|check|monitor|approve|review|merge|publish|archive|sync)\s+(?:the\s+)?(?:PR|CI|pull request|openspec (?:change|archive)|spec(?:ification)? sync|archive|change archive)\b/i.test(task) ||
      /^(?:archive|sync|merge|publish)\s+(?:the\s+)?(?:change|specs?|branch|PR|pull request)\b/i.test(task)) {
    refuse('DEFERRED', number, 'Post-sync, PR, CI or merge approval in an apply checkbox',
      'Move this item to Post-sync review without a checkbox');
  }

  // Check for actions requiring a person or actual device, not for ordinary
  // feature names such as "manual mode" or "visually hidden label".
  const humanAction = /\b(?:manually|manual(?:ly)?\s+(?:accept|check|confirm|inspect|review|test|validat\w*|verif\w*)|human\s+(?:acceptance|check|inspection|review|test|validation|verification)|manual acceptance|recette manuelle|validation humaine|vérifier manuellement)\b/i;
  const realWorldAction = /\b(?:on|in|with|using|sur|dans|avec)\s+(?:a\s+|un\s+|une\s+|the\s+)?(?:real|physical|réel|réelle)\s+(?:browser|device|phone|tablet|navigateur|téléphone|appareil)\b|\b(?:real browser|real device|téléphone réel|navigateur réel)\b/i;
  const automatedBrowserTest = /\b(?:automated|playwright|cypress|selenium|headless)\b/i.test(task) &&
    /\b(?:tests?|testing|assertions?|snapshots?|comparisons?|checks?)\b/i.test(task);
  if (humanAction.test(task) || (realWorldAction.test(task) && !automatedBrowserTest)) {
    refuse('MANUAL', number, 'Manual or real-device acceptance is not executable during apply',
      'Move human acceptance to Manual acceptance without a checkbox');
  }

  // A mixed checkbox may start with real implementation work and append a
  // subjective GIVEN/WHEN/THEN acceptance clause. Avoid scanning "visually"
  // in isolation: an automated test of a visually hidden label is executable.
  const verifyClause = /\b(?:verify|check|confirm|inspect|review|validate)\s*:/i.exec(task);
  const scenarioStart = /\bGIVEN\b/i.exec(task);
  const acceptance = verifyClause ? task.slice(verifyClause.index) :
    scenarioStart ? task.slice(scenarioStart.index) : task;
  const scenario = Boolean(scenarioStart);
  const subjective = /\b(?:visually|by eye|visuellement|visuel(?:le)?|observes?|sees?|regarde|observe)\b/i.test(acceptance);
  const humanObserver = /\b(?:user|person|human|utilisateur|personne)\s+(?:observes?|sees?|inspects?|checks?|reviews?|regarde|observe)\b/i.test(acceptance);
  if ((verifyClause || scenario) && (subjective || humanObserver)) {
    refuse('MIXED', number, 'Subjective visual acceptance is mixed with an implementation checkbox',
      'Keep only code and deterministic tests in the checkbox; move visual GIVEN/WHEN/THEN acceptance to Manual acceptance without a checkbox');
  }
  count++;
}

if (!count) {
  refuse('EMPTY', null, 'No executable implementation checkbox found',
    'Add at least one implementation or deterministic-test checkbox to tasks.md');
}
console.log(`Implementation checklist: ${count} statically admissible entries`);
