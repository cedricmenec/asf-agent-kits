import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
export { fs, path };
export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const MAX_FILE = 1048576;
export const SHA = /^[a-f0-9]{40}$/;
export const HEX = /^[a-f0-9]{64}$/;
export const VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
export const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
export const hash = (data) => createHash("sha256").update(data).digest("hex");
export const requireThat = (ok, message = "Invalid or inconsistent input") => {
  if (!ok) throw new Error(message);
};
export const object = (x) =>
  x !== null && typeof x === "object" && !Array.isArray(x);
export const exact = (x, keys) =>
  object(x) && Object.keys(x).sort().join("\0") === [...keys].sort().join("\0");
export const equal = (a, b) => canonical(a).equals(canonical(b));
export function canonical(value) {
  const keyCompare = (a, b) => {
    const x = Array.from(a),
      y = Array.from(b);
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
      const d = x[i].codePointAt(0) - y[i].codePointAt(0);
      if (d) return d;
    }
    return x.length - y.length;
  };
  const serialize = (x) => {
    if (Array.isArray(x)) return "[" + x.map(serialize).join(",") + "]";
    if (object(x))
      return (
        "{" +
        Object.keys(x)
          .sort(keyCompare)
          .map((k) => JSON.stringify(k) + ":" + serialize(x[k]))
          .join(",") +
        "}"
      );
    requireThat(
      x === null || ["string", "boolean", "number"].includes(typeof x),
      "Unsupported canonical value",
    );
    if (typeof x === "number")
      requireThat(Number.isFinite(x), "Non-finite canonical number");
    return JSON.stringify(x);
  };
  return Buffer.from(
    serialize(value).replace(
      /[\u007f-\uffff]/g,
      (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
    ) + "\n",
  );
}
// JSON.parse alone silently accepts duplicate keys. Parse each object before
// constructing it, including escaped-equivalent keys and nested documents.
export function strictParse(raw) {
  const text = Buffer.isBuffer(raw)
    ? new TextDecoder("utf-8", { fatal: true }).decode(raw)
    : raw;
  requireThat(typeof text === "string", "Expected UTF-8 JSON");
  let at = 0,
    depth = 0;
  const ws = () => {
    while (/[\t\r\n ]/.test(text[at] ?? "!")) at++;
  };
  const str = () => {
    const start = at++;
    while (at < text.length) {
      const c = text[at++];
      if (c === "\\") at++;
      else if (c === '"') return JSON.parse(text.slice(start, at));
    }
    throw new Error("Unterminated JSON string");
  };
  const value = () => {
    ws();
    requireThat(++depth < 100, "JSON nesting limit");
    let result;
    if (text[at] === "{") {
      at++;
      result = {};
      const seen = new Set();
      ws();
      if (text[at] !== "}")
        while (true) {
          ws();
          requireThat(text[at] === '"', "JSON object key expected");
          const key = str();
          requireThat(!seen.has(key), "duplicate JSON key");
          seen.add(key);
          ws();
          requireThat(text[at++] === ":", "JSON colon expected");
          Object.defineProperty(result, key, {
            value: value(),
            enumerable: true,
            writable: true,
            configurable: true,
          });
          ws();
          if (text[at] !== ",") break;
          at++;
        }
      requireThat(text[at++] === "}", "JSON object terminator expected");
    } else if (text[at] === "[") {
      at++;
      result = [];
      ws();
      if (text[at] !== "]")
        while (true) {
          result.push(value());
          ws();
          if (text[at] !== ",") break;
          at++;
        }
      requireThat(text[at++] === "]", "JSON array terminator expected");
    } else if (text[at] === '"') result = str();
    else {
      const m =
        /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(
          text.slice(at),
        );
      requireThat(m, "Invalid JSON value");
      at += m[0].length;
      result = JSON.parse(m[0]);
      if (typeof result === "number")
        requireThat(Number.isFinite(result), "Non-finite number");
    }
    depth--;
    return result;
  };
  const result = value();
  ws();
  requireThat(at === text.length, "Trailing JSON content");
  return result;
}
export function safePath(p) {
  requireThat(
    typeof p === "string" &&
      p.length > 0 &&
      p === p.normalize("NFC") &&
      !/^[~/]|^[A-Za-z]:|[\\\x00-\x1f\x7f]/.test(p) &&
      p
        .split("/")
        .every(
          (v) => v && v !== "." && v !== ".." && v.toLowerCase() !== ".git",
        ),
    "Unsafe relative path",
  );
  return p;
}
export function safeRoot(root) {
  root = path.resolve(root);
  requireThat(
    fs.lstatSync(root).isDirectory(),
    "Root must be an ordinary directory",
  );
  return root;
}
export function member(root, relative) {
  safePath(relative);
  let current = safeRoot(root);
  for (const part of relative.split("/")) {
    let info;
    try {
      info = fs.lstatSync(current);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if (info) {
      requireThat(info.isDirectory(), "Non-directory parent");
      requireThat(
        !fs
          .readdirSync(current)
          .some((n) => n.toLowerCase() === part.toLowerCase() && n !== part),
        "Case-colliding path",
      );
    }
    current = path.join(current, part);
    try {
      requireThat(!fs.lstatSync(current).isSymbolicLink(), "Symlink path");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  return current;
}
export const stamp = (s) =>
  [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs, s.nlink].join(":");
export const identity = (s) => `${s.dev}:${s.ino}`;
export function readFile(file, maximum = MAX_FILE) {
  const fd = fs.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
  );
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    requireThat(
      before.isFile() && before.nlink === 1n && before.size <= BigInt(maximum),
      "Non-regular, linked or oversized file",
    );
    const data = Buffer.alloc(maximum + 1);
    let count = 0,
      n;
    do {
      n = fs.readSync(fd, data, count, data.length - count, null);
      count += n;
    } while (n && count < data.length);
    requireThat(
      count <= maximum &&
        BigInt(count) === before.size &&
        stamp(before) === stamp(fs.fstatSync(fd, { bigint: true })),
      "File changed during read",
    );
    return data.subarray(0, count);
  } finally {
    fs.closeSync(fd);
  }
}
export const strictFile = (p, max = 65536) => strictParse(readFile(p, max));
export function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], {
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 20000,
    maxBuffer: 12 * MAX_FILE,
  });
}
export function cliArgs(argv = process.argv.slice(2)) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x.startsWith("--")) {
      const name = x.slice(2).replaceAll("-", "_");
      requireThat(!Object.hasOwn(args, name), "Duplicate argument");
      args[name] =
        argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    } else args._.push(x);
  }
  return args;
}
export const isMain = (url) =>
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(url);
export function runMain(fn) {
  Promise.resolve()
    .then(() => fn(cliArgs()))
    .then((code) => {
      if (Number.isInteger(code)) process.exitCode = code;
    })
    .catch((e) => {
      console.error("ASF-AgentKit REFUSED: " + e.message);
      process.exitCode = 3;
    });
}
export const output = (x) => process.stdout.write(canonical(x));
export const nonce = () => randomBytes(12).toString("hex");
