import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();

function walkFiles(dir, predicate) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full, predicate));
    } else if (!predicate || predicate(full)) {
      results.push(full);
    }
  }
  return results;
}

test('JS and MJS source files pass node --check syntax validation', () => {
  const targets = [
    path.join(ROOT, 'astro.config.mjs'),
    path.join(ROOT, 'src', 'pages', 'rss.xml.js'),
    ...walkFiles(path.join(ROOT, 'src', 'utils'), (f) => /\.(m?js)$/.test(f)),
  ];

  for (const file of targets) {
    assert.ok(fs.existsSync(file), `Missing JS target: ${path.relative(ROOT, file)}`);
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  }
});

test('src/ and public/ contain no leaked private keys or secret tokens', () => {
  const textExts = /\.(astro|js|mjs|ts|css|html|md|txt|json)$/;
  const files = [
    ...walkFiles(path.join(ROOT, 'src'), (f) => textExts.test(f)),
    ...walkFiles(path.join(ROOT, 'public'), (f) => textExts.test(f)),
  ];
  const forbidden = ['sb_secret_', 'service_role', 'ghp_', 'gho_'];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    for (const pattern of forbidden) {
      assert.ok(
        !content.includes(pattern),
        `Potential secret pattern "${pattern}" found in ${path.relative(ROOT, file)}`
      );
    }
  }
});
