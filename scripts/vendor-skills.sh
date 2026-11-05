#!/bin/sh
set -eu
if [ "$#" -ne 0 ]; then
  echo "Usage: scripts/vendor-skills.sh" >&2
  exit 1
fi
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export ROOT
node --input-type=module <<'NODE'
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.env.ROOT;
const manifest = JSON.parse(readFileSync(process.env.SKILLS_MANIFEST || join(root, 'vendor/skills.json'), 'utf8'));
const temp = mkdtempSync(join(tmpdir(), 'toddler-skills-'));
const output = join(root, 'vendor/skills');
const safeName = (name) => typeof name === 'string' && name !== '.' && name !== '..' && /^[a-zA-Z0-9._-]+$/.test(name);
try {
  for (const [upstream, entry] of Object.entries(manifest)) {
    if (!safeName(upstream) || !entry || typeof entry.repo !== 'string' || typeof entry.ref !== 'string' ||
        !Array.isArray(entry.skills) || entry.skills.some((name) => !safeName(name)) || new Set(entry.skills).size !== entry.skills.length) {
      throw new Error(`Invalid manifest entry: ${upstream}`);
    }
    const clone = join(temp, upstream, 'clone');
    execFileSync('git', ['clone', '--quiet', '--depth', '1', '--branch', entry.ref, '--', entry.repo, clone], { stdio: 'inherit' });
    const commit = execFileSync('git', ['-C', clone, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const version = JSON.parse(readFileSync(join(clone, 'package.json'), 'utf8')).version;
    if (typeof version !== 'string') throw new Error(`Missing version for ${upstream}`);
    const matches = new Map(entry.skills.map((name) => [name, []]));
    function visit(dir) {
      for (const item of readdirSync(dir, { withFileTypes: true })) {
        if (!item.isDirectory()) continue;
        const path = join(dir, item.name);
        if (matches.has(item.name) && existsSync(join(path, 'SKILL.md'))) matches.get(item.name).push(path);
        visit(path);
      }
    }
    visit(join(clone, 'skills'));
    const staged = join(temp, upstream, 'result');
    mkdirSync(staged);
    for (const [name, paths] of matches) {
      if (paths.length !== 1) throw new Error(`Expected one skill named ${name} in ${upstream}; found ${paths.length}`);
      cpSync(paths[0], join(staged, name), { recursive: true, verbatimSymlinks: true });
    }
    cpSync(join(clone, 'LICENSE'), join(staged, 'LICENSE'));
    writeFileSync(join(staged, 'UPSTREAM.json'), JSON.stringify({ repo: entry.repo, ref: entry.ref, version, commit }, null, 2) + '\n');
  }
  mkdirSync(output, { recursive: true });
  for (const upstream of Object.keys(manifest)) {
    const destination = join(output, upstream);
    rmSync(destination, { recursive: true, force: true });
    cpSync(join(temp, upstream, 'result'), destination, { recursive: true, verbatimSymlinks: true });
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
NODE
