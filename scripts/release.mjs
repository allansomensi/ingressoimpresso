#!/usr/bin/env node
// Releases (ADR 0049): one Semantic Versioning number for the whole product, kept in every
// manifest (Cargo workspace, Cargo.lock, package.json files) and in CHANGELOG.md.
//
//   node scripts/release.mjs check                     versions agree, CHANGELOG.md is well formed
//   node scripts/release.mjs version                   prints the current version
//   node scripts/release.mjs prepare <major|minor|patch|X.Y.Z> [--date YYYY-MM-DD]
//                                                      cuts "Não lançado" into a new version
//   node scripts/release.mjs notes [X.Y.Z]             prints a version's notes (GitHub Release)
//   node scripts/release.mjs format                    rewrites CHANGELOG.md in its canonical form
//
// Plain Node, no dependencies: CI runs it before installing anything.

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPOSITORY = "https://github.com/allansomensi/ingressoimpresso";
export const UNRELEASED = "Não lançado";
/** Keep a Changelog sections, in Portuguese, in the order they appear in a version. */
export const SECTIONS = ["Adicionado", "Alterado", "Obsoleto", "Removido", "Corrigido", "Segurança"];

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `[major, minor, patch]`, or `null` when `text` is not a plain X.Y.Z version. */
export function parseVersion(text) {
  const match = SEMVER.exec(text);
  return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Negative, zero or positive, like a sort comparator. */
export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (left === null || right === null) {
    throw new Error(`not a version: ${left === null ? a : b}`);
  }
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }
  return 0;
}

/** The version after `current` for a bump (`major`, `minor`, `patch`) or an explicit X.Y.Z. */
export function nextVersion(current, bump) {
  const parts = parseVersion(current);
  if (parts === null) {
    throw new Error(`current version ${current} is not X.Y.Z`);
  }
  const [major, minor, patch] = parts;
  const next =
    bump === "major"
      ? `${major + 1}.0.0`
      : bump === "minor"
        ? `${major}.${minor + 1}.0`
        : bump === "patch"
          ? `${major}.${minor}.${patch + 1}`
          : bump;
  if (parseVersion(next) === null) {
    throw new Error(`use major, minor, patch or a version like 1.2.3 (got ${bump})`);
  }
  if (compareVersions(next, current) <= 0) {
    throw new Error(`${next} is not after the current version ${current}`);
  }
  return next;
}

// --- CHANGELOG.md -----------------------------------------------------------------------------

/**
 * Splits the changelog into its preamble, its `## [...]` versions (newest first) and the link
 * definitions at the end. Each version keeps its raw body.
 */
export function parseChangelog(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const preamble = [];
  const versions = [];
  const links = new Map();
  for (const line of lines) {
    const heading = /^## \[([^\]]+)\](?: - (\S+))?\s*$/.exec(line);
    const link = /^\[([^\]]+)\]: (\S+)\s*$/.exec(line);
    if (heading !== null) {
      versions.push({ name: heading[1], date: heading[2] ?? null, body: [] });
    } else if (link !== null) {
      links.set(link[1], link[2]);
    } else if (versions.length === 0) {
      preamble.push(line);
    } else {
      versions.at(-1).body.push(line);
    }
  }
  for (const version of versions) {
    version.body = version.body.join("\n").trim();
  }
  return { preamble: preamble.join("\n").trim(), versions, links };
}

function compareLink(from, to) {
  return `${REPOSITORY}/compare/v${from}...${to === "HEAD" ? "HEAD" : `v${to}`}`;
}

function releaseLink(version) {
  return `${REPOSITORY}/releases/tag/v${version}`;
}

/** The changelog back as text, with the link definitions rebuilt from the versions. */
export function formatChangelog({ preamble, versions }) {
  const released = versions.filter((version) => version.name !== UNRELEASED);
  const parts = [preamble];
  for (const version of versions) {
    const heading = version.date === null ? `## [${version.name}]` : `## [${version.name}] - ${version.date}`;
    parts.push(version.body === "" ? heading : `${heading}\n\n${version.body}`);
  }
  const links = [];
  const latest = released[0];
  if (latest !== undefined) {
    links.push(`[${UNRELEASED}]: ${compareLink(latest.name, "HEAD")}`);
  }
  released.forEach((version, index) => {
    const previous = released[index + 1];
    links.push(`[${version.name}]: ${previous === undefined ? releaseLink(version.name) : compareLink(previous.name, version.name)}`);
  });
  parts.push(links.join("\n"));
  return `${parts.join("\n\n")}\n`;
}

/** Problems with the changelog (empty when it is fine), given the version of the manifests. */
export function changelogProblems(text, version) {
  const problems = [];
  const changelog = parseChangelog(text);
  const [first, ...released] = changelog.versions;
  if (first?.name !== UNRELEASED) {
    problems.push(`the first section must be "## [${UNRELEASED}]"`);
  }
  if (released[0]?.name !== version) {
    problems.push(`the newest version in CHANGELOG.md must be ${version}, the version of the manifests`);
  }
  for (const entry of changelog.versions) {
    if (entry.name !== UNRELEASED) {
      if (parseVersion(entry.name) === null) {
        problems.push(`"${entry.name}" is not a version like 1.2.3`);
        continue;
      }
      if (entry.date === null || !DATE.test(entry.date)) {
        problems.push(`${entry.name} needs a date: "## [${entry.name}] - YYYY-MM-DD"`);
      }
      if (entry.body === "") {
        problems.push(`${entry.name} has no changes listed`);
      }
    }
    for (const line of entry.body.split("\n")) {
      const section = /^### (.+)$/.exec(line);
      if (section !== null && !SECTIONS.includes(section[1].trim())) {
        problems.push(`${entry.name}: unknown section "${section[1]}" (use ${SECTIONS.join(", ")})`);
      }
    }
  }
  for (let index = 1; index < released.length; index += 1) {
    const newer = released[index - 1];
    const older = released[index];
    if (parseVersion(newer.name) !== null && parseVersion(older.name) !== null && compareVersions(newer.name, older.name) <= 0) {
      problems.push(`versions must go from newest to oldest (${newer.name} before ${older.name})`);
    }
  }
  if (problems.length === 0 && formatChangelog(changelog) !== `${text.replace(/\r\n/g, "\n").trimEnd()}\n`) {
    problems.push("the layout or the link definitions at the end are out of date: run `node scripts/release.mjs format`");
  }
  return problems;
}

/** Moves everything under "Não lançado" into a new dated version. */
export function cutRelease(text, version, date) {
  const changelog = parseChangelog(text);
  const unreleased = changelog.versions[0];
  if (unreleased?.name !== UNRELEASED) {
    throw new Error(`CHANGELOG.md must start with "## [${UNRELEASED}]"`);
  }
  if (!/^\s*[-*] /m.test(unreleased.body)) {
    throw new Error(`nothing under "## [${UNRELEASED}]" in CHANGELOG.md: list the changes first`);
  }
  const versions = [
    { name: UNRELEASED, date: null, body: "" },
    { name: version, date, body: unreleased.body },
    ...changelog.versions.slice(1),
  ];
  return formatChangelog({ ...changelog, versions });
}

/** The notes of one version (its body), for the GitHub Release. */
export function releaseNotes(text, version) {
  const entry = parseChangelog(text).versions.find((candidate) => candidate.name === version);
  if (entry === undefined) {
    throw new Error(`CHANGELOG.md has no section for ${version}`);
  }
  return entry.body;
}

// --- Manifests --------------------------------------------------------------------------------

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function read(path) {
  return readFileSync(join(ROOT, path), "utf8");
}

function write(path, text) {
  writeFileSync(join(ROOT, path), text);
}

/** Every package.json of the workspace (pnpm-workspace.yaml: apps/*, packages/*). */
function packageJsonFiles() {
  const files = ["package.json"];
  for (const folder of ["apps", "packages"]) {
    for (const name of readdirSync(join(ROOT, folder))) {
      const path = `${folder}/${name}/package.json`;
      if (existsSync(join(ROOT, path))) {
        files.push(path);
      }
    }
  }
  return files;
}

/** Names of the workspace crates (crates/*), as Cargo.lock lists them. */
function crateNames() {
  return readdirSync(join(ROOT, "crates"))
    .filter((name) => existsSync(join(ROOT, "crates", name, "Cargo.toml")))
    .map((name) => {
      const match = /^name = "([^"]+)"/m.exec(read(`crates/${name}/Cargo.toml`));
      if (match === null) {
        throw new Error(`crates/${name}/Cargo.toml has no package name`);
      }
      return match[1];
    });
}

const WORKSPACE_VERSION = /(\[workspace\.package\][^[]*?\nversion = ")([^"]+)(")/;
const PACKAGE_VERSION = /^(\s*"version": ")([^"]+)(")/m;

/** `{ file: version }` for every place the product version lives. */
export function manifestVersions() {
  const versions = {};
  versions["Cargo.toml"] = WORKSPACE_VERSION.exec(read("Cargo.toml"))?.[2] ?? null;
  const lock = read("Cargo.lock");
  for (const name of crateNames()) {
    // Workspace crates have no `source` line.
    const match = new RegExp(`\\[\\[package\\]\\]\\nname = "${name}"\\nversion = "([^"]+)"\\n(?!source)`).exec(lock);
    versions[`Cargo.lock (${name})`] = match?.[1] ?? null;
  }
  for (const file of packageJsonFiles()) {
    versions[file] = PACKAGE_VERSION.exec(read(file))?.[2] ?? null;
  }
  return versions;
}

/** The single product version; throws when the manifests disagree. */
export function currentVersion() {
  const versions = manifestVersions();
  const distinct = new Set(Object.values(versions));
  if (distinct.size !== 1 || distinct.has(null)) {
    const list = Object.entries(versions)
      .map(([file, version]) => `  ${file}: ${version ?? "(none)"}`)
      .join("\n");
    throw new Error(`every manifest must carry the same version:\n${list}`);
  }
  const [version] = distinct;
  if (parseVersion(version) === null) {
    throw new Error(`the version ${version} is not X.Y.Z`);
  }
  return version;
}

function setVersion(version) {
  write("Cargo.toml", read("Cargo.toml").replace(WORKSPACE_VERSION, `$1${version}$3`));
  let lock = read("Cargo.lock");
  for (const name of crateNames()) {
    lock = lock.replace(
      new RegExp(`(\\[\\[package\\]\\]\\nname = "${name}"\\nversion = ")[^"]+("\\n(?!source))`),
      `$1${version}$2`,
    );
  }
  write("Cargo.lock", lock);
  for (const file of packageJsonFiles()) {
    write(file, read(file).replace(PACKAGE_VERSION, `$1${version}$3`));
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// --- Command line -----------------------------------------------------------------------------

function main(args) {
  const [command, ...rest] = args;
  switch (command) {
    case "version": {
      console.log(currentVersion());
      return 0;
    }
    case "check": {
      const version = currentVersion();
      const problems = changelogProblems(read("CHANGELOG.md"), version);
      if (problems.length > 0) {
        console.error(`CHANGELOG.md:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
        return 1;
      }
      console.log(`version ${version}: manifests and CHANGELOG.md agree`);
      return 0;
    }
    case "format": {
      write("CHANGELOG.md", formatChangelog(parseChangelog(read("CHANGELOG.md"))));
      return 0;
    }
    case "prepare": {
      const bump = rest[0];
      const dateFlag = rest.indexOf("--date");
      const date = dateFlag === -1 ? today() : rest[dateFlag + 1];
      if (bump === undefined || date === undefined || !DATE.test(date)) {
        console.error("usage: release.mjs prepare <major|minor|patch|X.Y.Z> [--date YYYY-MM-DD]");
        return 2;
      }
      const current = currentVersion();
      const version = nextVersion(current, bump);
      const changelog = cutRelease(read("CHANGELOG.md"), version, date);
      setVersion(version);
      write("CHANGELOG.md", changelog);
      console.log(`${current} -> ${version} (${date})`);
      console.log("Next: review the diff, run `just`, and commit as");
      console.log(`  chore(release): 🔖 v${version}`);
      console.log("then open the pull request from staging to main (docs/versionamento.md).");
      return 0;
    }
    case "notes": {
      const version = rest[0] ?? currentVersion();
      console.log(releaseNotes(read("CHANGELOG.md"), version));
      return 0;
    }
    default: {
      console.error("usage: release.mjs <check|version|prepare|notes|format>");
      return 2;
    }
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
