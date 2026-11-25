/**
 * Compares the signed manifests to the fenced files on disk.
 *
 *     gold/MANIFEST.sha256  (signed by the human, see --print below)
 *             |
 *             v
 *     checkManifest() <--- sha256 of every file, at any depth, under
 *             |            criteria/ fixtures/ gold/cases/ verify/ loop/
 *             v
 *     [] when intact, else ["verify/run.ts (changed)", ...]
 *
 * Cases read from another folder (GOLD_DIR, the held-out set) need a second
 * manifest, MANIFEST.sha256 inside that folder. Unsigned cases never run.
 *
 * The builder cannot regenerate a manifest, so any edit inside the fence
 * shows up here. A missing manifest counts as broken.
 *
 * Usage: node verify/manifest.ts            check; exit 0 intact, 3 broken
 *        node verify/manifest.ts --print    print the manifest lines. Human only:
 *                                           redirect into gold/MANIFEST.sha256, or
 *                                           with GOLD_DIR set, into its MANIFEST.sha256
 */

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { goldDir } from "./coverage.ts";
import { ExitCode } from "./exit-codes.ts";
import { ROOT } from "./lint-criteria.ts";

export const MANIFEST_PATH = "gold/MANIFEST.sha256";

const GOLD_CASES_DIR = "gold/cases";

// The one list of fenced folders. The human's manifest comes from --print,
// which reads this list, so the two cannot drift apart.
export const FENCED_DIRS: readonly string[] = ["criteria", "fixtures", GOLD_CASES_DIR, "verify", "loop"];

// A cases folder outside the repository signs itself with this file.
const HELD_OUT_MANIFEST = "MANIFEST.sha256";
const WHOLE_FOLDER = ".";

const PRINT_FLAG = "--print";
const HASH_ALGORITHM = "sha256";
const HIDDEN_PREFIX = ".";
const DIGEST_SEPARATOR = " ";

// shasum marks binary mode with '*' before the path.
const BINARY_MARK = /^\*+/;

// Relative path to hex digest. Example: "verify/run.ts" -> "ab12...ef".
type Digests = Map<string, string>;

/** One signed tree: a base folder, its manifest and the folders it covers. */
interface Fence {
  readonly base: string;
  readonly manifest: string;
  readonly dirs: readonly string[];

  // Put before each reported path. Example: "../mittens_holdout/".
  readonly label: string;
}

/** What is on disk inside a fence. A symlink is never hashed, only reported. */
interface Scan {
  readonly digests: Digests;
  readonly symlinks: string[];
}

/**
 * Returns one entry per file that breaks the fence. Empty means intact.
 * casesDir is the folder the cases will be read from.
 */
export function checkManifest(root: string, casesDir: string = path.join(root, GOLD_CASES_DIR)): string[] {
  return fencesFor(root, casesDir).flatMap(checkFence);
}

/** Returns the manifest lines a human signs. Example: 'ab12...ef  verify/run.ts'. */
export function manifestLines(root: string, casesDir: string = path.join(root, GOLD_CASES_DIR)): string[] {
  // The last fence is the held-out one when the cases are outside gold/cases.
  const fence = fencesFor(root, casesDir).at(-1);

  if (!fence) {
    return [];
  }

  const { digests } = scanFence(fence);

  return [...digests.keys()].sort().map((filePath) => `${digests.get(filePath)}  ${filePath}`);
}

/** The repository fence, plus the fence of a cases folder outside gold/cases. */
function fencesFor(root: string, casesDir: string): Fence[] {
  const repoFence: Fence = { base: root, manifest: MANIFEST_PATH, dirs: FENCED_DIRS, label: "" };

  if (path.resolve(casesDir) === path.resolve(root, GOLD_CASES_DIR)) {
    return [repoFence];
  }

  const label = `${path.relative(root, casesDir).split(path.sep).join("/")}/`;

  return [repoFence, { base: casesDir, manifest: HELD_OUT_MANIFEST, dirs: [WHOLE_FOLDER], label }];
}

function checkFence(fence: Fence): string[] {
  const manifestFile = path.join(fence.base, fence.manifest);

  if (!existsSync(manifestFile)) {
    return [`${fence.label}${fence.manifest} (missing)`];
  }

  const signed = readManifest(manifestFile);
  const { digests: actual, symlinks } = scanFence(fence);
  const everyPath = [...new Set([...signed.keys(), ...actual.keys(), ...symlinks])].sort();
  const broken: string[] = [];

  for (const filePath of everyPath) {
    const shown = `${fence.label}${filePath}`;

    if (symlinks.includes(filePath)) {
      broken.push(`${shown} (symlink)`);
      continue;
    }

    if (!signed.has(filePath)) {
      broken.push(`${shown} (not in manifest)`);
      continue;
    }

    if (!actual.has(filePath)) {
      broken.push(`${shown} (deleted)`);
      continue;
    }

    if (signed.get(filePath) !== actual.get(filePath)) {
      broken.push(`${shown} (changed)`);
    }
  }

  return broken;
}

/** Parses shasum lines. Example: 'ab12...ef  verify/run.ts'. */
function readManifest(manifestFile: string): Digests {
  const signed: Digests = new Map();

  for (const line of readFileSync(manifestFile, "utf8").split(/\r?\n/)) {
    const separatorAt = line.indexOf(DIGEST_SEPARATOR);

    if (separatorAt < 0) {
      continue;
    }

    const digest = line.slice(0, separatorAt);
    const filePath = line.slice(separatorAt).trim().replace(BINARY_MARK, "");

    if (filePath === "") {
      continue;
    }

    signed.set(filePath, digest);
  }

  return signed;
}

function scanFence(fence: Fence): Scan {
  const scan: Scan = { digests: new Map(), symlinks: [] };

  for (const fencedDir of fence.dirs) {
    scanEntry(fence, fencedDir, scan);
  }

  return scan;
}

/**
 * Hashes one path inside a fence, and everything below it when it is a folder.
 * Hidden names are skipped, so an editor's .DS_Store does not break the fence.
 * The manifest itself is skipped: it cannot hold its own digest.
 */
function scanEntry(fence: Fence, relative: string, scan: Scan): void {
  const absolute = path.join(fence.base, relative);

  if (!existsSync(absolute) && !isSymlink(absolute)) {
    return;
  }

  const stats = lstatSync(absolute);

  // A symlink could point the verifier at an unsigned file. It is never followed.
  if (stats.isSymbolicLink()) {
    scan.symlinks.push(relative);
    return;
  }

  if (stats.isFile() && relative !== fence.manifest) {
    const digest = createHash(HASH_ALGORITHM).update(readFileSync(absolute)).digest("hex");
    scan.digests.set(relative, digest);
    return;
  }

  if (!stats.isDirectory()) {
    return;
  }

  for (const name of readdirSync(absolute).sort()) {
    if (name.startsWith(HIDDEN_PREFIX)) {
      continue;
    }

    scanEntry(fence, relative === WHOLE_FOLDER ? name : `${relative}/${name}`, scan);
  }
}

/** True for a symlink, also for a broken one, which existsSync reports as absent. */
function isSymlink(absolute: string): boolean {
  return lstatSync(absolute, { throwIfNoEntry: false })?.isSymbolicLink() ?? false;
}

function main(args: string[]): ExitCode {
  const casesDir = goldDir(ROOT);

  if (args.includes(PRINT_FLAG)) {
    console.log(manifestLines(ROOT, casesDir).join("\n"));
    return ExitCode.GREEN;
  }

  const broken = checkManifest(ROOT, casesDir);

  for (const entry of broken) {
    console.log(`fence broken: ${entry}`);
  }

  if (broken.length > 0) {
    return ExitCode.FENCE_BROKEN;
  }

  console.log("fence intact");
  return ExitCode.GREEN;
}

if (import.meta.main) {
  process.exitCode = main(process.argv.slice(2));
}
