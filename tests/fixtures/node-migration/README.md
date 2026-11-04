# Migration regression corpus

These gzip-compressed UTF-8 JSON documents contain fixture inputs and reference outcomes recorded from the pre-migration implementation. The test harness uses only Node's standard `zlib` module to read them.

- `reference.json.gz`: 627 pure-function cases.
- `filesystem-reference.json.gz`: 233 disposable directory-tree cases.
- `network-reference.json.gz`: 33 mock GitHub request/response sequences.

Each case retains its original test identifier. Expected rejection compares rejection, rather than exception implementation classes. Schema-validator diagnostic wording may differ; acceptance and rejection must agree. Other observable outputs are compared structurally, including hashes, operations and all non-authority flags. Filesystem conflict reasons are checked as diagnostics while action and outcome remain exact.

The corpus is test data, never executed code. Paths naming historical release artifacts are intentional. `fake-provider.cjs` supplies local Node replacements for OpenSpec and OpenCode; the fresh-runner test uses real npm/esbuild.

Inspect a corpus without any extra runtime:

```sh
node --input-type=module -e "import fs from 'node:fs'; import {gunzipSync} from 'node:zlib'; console.log(gunzipSync(fs.readFileSync(process.argv[1])).toString())" tests/fixtures/node-migration/reference.json.gz
```
