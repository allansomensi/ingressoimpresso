// Tests of scripts/release.mjs (ADR 0049): `node --test scripts/release.test.mjs` (part of `just release-check`).

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  REPOSITORY,
  changelogProblems,
  compareVersions,
  cutRelease,
  formatChangelog,
  nextVersion,
  parseChangelog,
  releaseNotes,
} from "./release.mjs";

const SAMPLE = `# Histórico de versões

Intro.

## [Não lançado]

### Adicionado

- Relatório por vendedor.

### Corrigido

- Lanterna da portaria.

## [1.0.0] - 2026-10-10

### Adicionado

- Primeira versão.

[Não lançado]: ${REPOSITORY}/compare/v1.0.0...HEAD
[1.0.0]: ${REPOSITORY}/releases/tag/v1.0.0
`;

test("versions compare numerically, not as text", () => {
  assert.ok(compareVersions("1.10.0", "1.9.0") > 0);
  assert.ok(compareVersions("2.0.0", "10.0.0") < 0);
  assert.equal(compareVersions("1.2.3", "1.2.3"), 0);
  assert.throws(() => compareVersions("1.2", "1.2.3"));
});

test("bumps reset the lower parts and never go back", () => {
  assert.equal(nextVersion("1.4.2", "major"), "2.0.0");
  assert.equal(nextVersion("1.4.2", "minor"), "1.5.0");
  assert.equal(nextVersion("1.4.2", "patch"), "1.4.3");
  assert.equal(nextVersion("1.4.2", "1.6.0"), "1.6.0");
  assert.throws(() => nextVersion("1.4.2", "1.4.2"), /not after/);
  assert.throws(() => nextVersion("1.4.2", "1.3.9"), /not after/);
  assert.throws(() => nextVersion("1.4.2", "v1.5.0"), /major, minor, patch/);
  assert.throws(() => nextVersion("1.4.2", "1.05.0"), /major, minor, patch/);
});

test("the sample changelog is canonical and matches its version", () => {
  assert.equal(formatChangelog(parseChangelog(SAMPLE)), SAMPLE);
  assert.deepEqual(changelogProblems(SAMPLE, "1.0.0"), []);
  assert.match(changelogProblems(SAMPLE, "1.1.0").join("\n"), /must be 1\.1\.0/);
});

test("cutting a release moves the unreleased changes under the new version", () => {
  const cut = cutRelease(SAMPLE, "1.1.0", "2026-11-02");
  assert.deepEqual(changelogProblems(cut, "1.1.0"), []);
  const versions = parseChangelog(cut).versions;
  assert.deepEqual(
    versions.map((version) => [version.name, version.date]),
    [
      ["Não lançado", null],
      ["1.1.0", "2026-11-02"],
      ["1.0.0", "2026-10-10"],
    ],
  );
  assert.equal(versions[0]?.body, "");
  assert.match(cut, /\[Não lançado\]: .*\/compare\/v1\.1\.0\.\.\.HEAD/);
  assert.match(cut, /\[1\.1\.0\]: .*\/compare\/v1\.0\.0\.\.\.v1\.1\.0/);
  assert.match(cut, /\[1\.0\.0\]: .*\/releases\/tag\/v1\.0\.0/);
  assert.equal(releaseNotes(cut, "1.1.0"), "### Adicionado\n\n- Relatório por vendedor.\n\n### Corrigido\n\n- Lanterna da portaria.");
});

test("a release needs listed changes", () => {
  const empty = cutRelease(SAMPLE, "1.1.0", "2026-11-02");
  assert.throws(() => cutRelease(empty, "1.2.0", "2026-11-03"), /nothing under/);
});

test("problems are named", () => {
  const undated = SAMPLE.replace("## [1.0.0] - 2026-10-10", "## [1.0.0]");
  assert.match(changelogProblems(undated, "1.0.0").join("\n"), /needs a date/);
  const unknown = SAMPLE.replace("### Corrigido", "### Consertado");
  assert.match(changelogProblems(unknown, "1.0.0").join("\n"), /unknown section "Consertado"/);
  const noUnreleased = SAMPLE.replace("## [Não lançado]", "## [1.1.0] - 2026-11-02");
  assert.match(changelogProblems(noUnreleased, "1.1.0").join("\n"), /first section/);
  const staleLinks = SAMPLE.replace("compare/v1.0.0...HEAD", "compare/v0.9.0...HEAD");
  assert.match(changelogProblems(staleLinks, "1.0.0").join("\n"), /out of date/);
  assert.throws(() => releaseNotes(SAMPLE, "9.9.9"), /no section/);
});
