#!/usr/bin/env python3
"""Non-paying parse/byte qualification of the rendered MVP kit in a temp fixture."""
import argparse
import base64
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from render_mvp_kit import CATALOGUE, render_mvp


def qualify(config, actionlint=None):
    preview = render_mvp(CATALOGUE, config)
    with tempfile.TemporaryDirectory(prefix='agentkit-mvp-') as tmp:
        root = Path(tmp)
        for item in preview['files']:
            path = root / item['path']
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(base64.b64decode(item['contentBase64'], validate=True))

        runtime = root / '.asf/agentkit/runtime'
        for js in sorted(runtime.glob('*.mjs')):
            subprocess.run(['node', '--check', str(js)], check=True)
        subprocess.run(['bash', '-n', str(runtime / 'phase.sh')], check=True)
        if actionlint:
            subprocess.run([actionlint, '-color', str(root / '.github/workflows/asf-agentkit-openspec.yml')],
                           check=True)
        request = runtime / 'request.mjs'
        scope = runtime / 'scope.mjs'
        smoke = (
            "import { normalizeTask } from " + json.dumps(request.as_uri()) + ";\n"
            "import { allowed } from " + json.dumps(scope.as_uri()) + ";\n"
            "import assert from 'node:assert/strict';\n"
            "assert.equal(normalizeTask('9'), '" + config['taskPrefix'] + "-009');\n"
            "assert.equal(normalizeTask('" + config['taskPrefix'] + "-009'), '" + config['taskPrefix'] + "-009');\n"
            "assert.throws(() => normalizeTask('../1'));\n"
            "const c = '" + config['taskPrefix'].lower() + "-009';\n"
            "assert.equal(allowed('plan', c, 'openspec/changes/' + c + '/tasks.md'), true);\n"
            "assert.equal(allowed('plan', c, '.github/workflows/evil.yml'), false);\n"
            "assert.equal(allowed('apply', c, 'openspec/changes/' + c + '/design.md'), false);\n"
            "assert.equal(allowed('apply', c, 'openspec/changes/' + c + '/tasks.md'), true);\n"
            "assert.equal(allowed('apply', c, '.asf/agentkit/runtime/scope.mjs'), false);\n"
            "assert.equal(allowed('apply', c, 'backlog/tasks/evil.md'), false);\n"
            "assert.equal(allowed('apply', c, '.env'), false);\n"
            "assert.equal(allowed('finalize', c, 'openspec/specs/new/spec.md'), true);\n"
            "assert.equal(allowed('finalize', c, '.github/workflows/evil.yml'), false);\n"
        )
        subprocess.run(['node', '--input-type=module', '-e', smoke], check=True)
        return len(preview['files'])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    parser.add_argument('--actionlint', help='Optional pinned actionlint executable')
    args = parser.parse_args()
    config = json.loads(Path(args.config).read_text('utf-8'))
    try:
        count = qualify(config, args.actionlint)
    except (OSError, ValueError, subprocess.CalledProcessError) as exc:
        print('AK-MVP-01 smoke refused: ' + str(exc), file=sys.stderr)
        return 1
    print(f'AK-MVP-01: {count} rendered files parsed and read-only runtime smoke passed')
    return 0


if __name__ == '__main__':
    sys.exit(main())
