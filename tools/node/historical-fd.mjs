/**
 * HISTORICAL LINUX-ONLY FIXTURE INVENTORY, not used by the AgentKit CLI.
 * The R3g read-only security qualification retains its original descriptor
 * semantics independently of the new portable, local-checkout CLI.
 */
import { fs, safeRoot, requireThat, identity } from "./common.mjs";

const C = fs.constants;
const directoryFlags = C.O_RDONLY | C.O_DIRECTORY | C.O_NOFOLLOW;

export function anchored(fd, name) {
  requireThat(
    Number.isInteger(fd) && fd >= 0 && typeof name === "string" &&
      name.length > 0 && !name.includes("/") &&
      name !== "." && name !== "..",
    "Invalid descriptor-relative name",
  );
  return "/proc/self/fd/" + fd + "/" + name;
}

export function openRoot(root) {
  requireThat(process.platform === "linux" && C.O_NOFOLLOW && C.O_DIRECTORY,
    "Historical descriptor inventory requires Linux procfs");
  const actualRoot = safeRoot(root);
  const expected = fs.lstatSync(actualRoot, { bigint: true });
  const fd = fs.openSync(actualRoot, directoryFlags);
  try {
    requireThat(
      identity(expected) === identity(fs.fstatSync(fd, { bigint: true })) &&
      identity(fs.statSync("/proc/self/fd/" + fd, { bigint: true })) ===
        identity(fs.fstatSync(fd, { bigint: true })),
      "Historical descriptor root unavailable",
    );
    return fd;
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}
