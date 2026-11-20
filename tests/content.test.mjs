import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIARY_DIR = path.join(ROOT, 'src', 'content', 'diary');
const PUBLIC_DIR = path.join(ROOT, 'public');

function parseFrontmatter(content) {
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?/);
  assert.ok(match, 'Missing valid YAML frontmatter block');
  const data = {};
  for (const rawLine of match[1].split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const colon = line.indexOf(':');
    assert.ok(colon > 0, `Invalid frontmatter line: ${line}`);
    const key = line.slice(0, colon).trim();
    let val = line.slice(colon + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    data[key] = val;
  }
  return data;
}

test('diary markdown files have valid filenames and frontmatter', () => {
  const entries = fs.readdirSync(DIARY_DIR).filter((f) => f.endsWith('.md')).sort();
  assert.ok(entries.length > 0, 'Expected at least one diary markdown file');

  for (const file of entries) {
    assert.match(file, /^\d{4}-\d{2}-\d{2}\.md$/, `Invalid diary filename: ${file}`);
    const slug = file.slice(0, -3);
    const fullPath = path.join(DIARY_DIR, file);
    const raw = fs.readFileSync(fullPath, 'utf8');
    const fm = parseFrontmatter(raw);

    assert.equal(fm.date, slug, `${file}: frontmatter date must match filename`);
    assert.ok(typeof fm.title === 'string' && fm.title.trim().length > 0, `${file}: title must be non-empty`);

    for (const metric of ['mood', 'hunger', 'energy']) {
      if (fm[metric] !== undefined) {
        const num = Number(fm[metric]);
        assert.ok(
          Number.isFinite(num) && num >= 0 && num <= 100,
          `${file}: ${metric} must be a finite number in [0, 100], got ${fm[metric]}`
        );
      }
    }

    if (fm.audio !== undefined) {
      assert.ok(
        fm.audio.startsWith('/audio/'),
        `${file}: audio path must start with /audio/, got ${fm.audio}`
      );
      const audioFile = path.join(PUBLIC_DIR, fm.audio.slice(1));
      assert.ok(fs.existsSync(audioFile), `${file}: missing audio asset ${fm.audio}`);
    }
  }
});

test('core public assets and CNAME exist and are valid', () => {
  const cnamePath = path.join(PUBLIC_DIR, 'CNAME');
  assert.ok(fs.existsSync(cnamePath), 'public/CNAME must exist');
  assert.equal(fs.readFileSync(cnamePath, 'utf8').trim(), 'ran-blog.alyse.store');

  for (const rel of ['xiaoran.png', 'xiaoran-full.png', 'favicon.png', 'robots.txt', 'global.css']) {
    const p = path.join(PUBLIC_DIR, rel);
    assert.ok(fs.existsSync(p), `Missing public/${rel}`);
    assert.ok(fs.statSync(p).size > 0, `Empty public/${rel}`);
  }
});
