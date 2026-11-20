import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIST_DIR = path.join(ROOT, 'dist');
const DIARY_DIR = path.join(ROOT, 'src', 'content', 'diary');

function walkFiles(dir, extFilter) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full, extFilter));
    } else if (!extFilter || extFilter(full)) {
      results.push(full);
    }
  }
  return results;
}

function readDist(relPath) {
  return fs.readFileSync(path.join(DIST_DIR, relPath), 'utf8');
}

function getDiaryDates() {
  return fs
    .readdirSync(DIARY_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .map((f) => f.slice(0, -3))
    .sort();
}

test('dist contains all expected static routes and assets', () => {
  assert.ok(fs.existsSync(DIST_DIR), 'dist/ directory must exist (run npm run build first)');

  const requiredFiles = [
    'index.html',
    'about/index.html',
    'archive/index.html',
    'rss.xml',
    'CNAME',
    'global.css',
  ];

  for (const date of getDiaryDates()) {
    requiredFiles.push(`diary/${date}/index.html`);
  }

  for (const rel of requiredFiles) {
    const p = path.join(DIST_DIR, rel);
    assert.ok(fs.existsSync(p), `Missing built artifact: dist/${rel}`);
  }
});

test('homepage retains core branding, navigation, widgets, and diary links', () => {
  const html = readDist('index.html');
  const dates = getDiaryDates();

  for (const token of [
    '小然的日记',
    'id="theme-toggle"',
    'id="subscribe"',
    'jkcnrgqdiwiggiznbwfu.supabase.co/rest/v1/rpc',
    'mood-chart',
    'nav-bar',
    'wave-back',
    'footer-whale',
    '/archive',
    '/about',
    '/rss.xml',
  ]) {
    assert.ok(html.includes(token), `dist/index.html missing required content: ${token}`);
  }

  for (const date of dates) {
    assert.ok(html.includes(`/diary/${date}/`), `dist/index.html missing link to /diary/${date}/`);
  }
});

test('diary post page retains audio, comments, subscribe, and prev/next nav', () => {
  const html = readDist('diary/2026-11-20/index.html');
  for (const token of [
    '<article',
    '/audio/2026-11-20.mp3',
    'id="comments"',
    'jkcnrgqdiwiggiznbwfu.supabase.co/rest/v1/comments',
    'id="subscribe"',
    'prevnext',
    'reading-progress',
    'audio-player',
    'toc-card',
    'prose',
  ]) {
    assert.ok(html.includes(token), `dist/diary/2026-11-20/index.html missing: ${token}`);
  }
});

test('about, archive, and rss output contain expected content', () => {
  const aboutHtml = readDist('about/index.html');
  assert.ok(aboutHtml.includes('/xiaoran-full.png'), 'about page must reference /xiaoran-full.png');
  assert.ok(aboutHtml.includes('about-sheet'), 'about page must use Character Sheet layout');
  assert.ok(aboutHtml.includes('schedule-strip'), 'about page must include patrol schedule strip');

  const archiveHtml = readDist('archive/index.html');
  const rssXml = readDist('rss.xml');
  for (const token of ['<rss', '<channel>', 'https://ran-blog.alyse.store/rss.xml', '<content:encoded>']) {
    assert.ok(rssXml.includes(token), `dist/rss.xml missing: ${token}`);
  }

  for (const date of getDiaryDates()) {
    assert.ok(archiveHtml.includes(`/diary/${date}/`), `archive missing /diary/${date}/`);
    assert.ok(rssXml.includes(`/diary/${date}/`), `rss.xml missing /diary/${date}/`);
  }
});

test('all root-relative href and src links in built HTML resolve inside dist/', () => {
  const htmlFiles = walkFiles(DIST_DIR, (p) => p.endsWith('.html'));
  assert.ok(htmlFiles.length > 0, 'Expected built HTML files under dist/');

  const attrRe = /<(?:a|link|script|img|audio|source|video|iframe)\b[^>]*?\b(?:href|src)=["']([^"']+)["']/gi;

  for (const file of htmlFiles) {
    const raw = fs.readFileSync(file, 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    let match;
    while ((match = attrRe.exec(raw)) !== null) {
      const target = match[1];
      if (
        !target.startsWith('/') ||
        target.startsWith('//') ||
        target.startsWith('/#')
      ) {
        continue;
      }

      const clean = target.split('#')[0].split('?')[0];
      let resolved = false;
      if (clean === '/') {
        resolved = fs.existsSync(path.join(DIST_DIR, 'index.html'));
      } else {
        const rel = clean.replace(/^\/+/, '').replace(/\/+$/, '');
        const direct = path.join(DIST_DIR, rel);
        const indexHtml = path.join(DIST_DIR, rel, 'index.html');
        const dotHtml = path.join(DIST_DIR, `${rel}.html`);
        resolved =
          (fs.existsSync(direct) && fs.statSync(direct).isFile()) ||
          (fs.existsSync(indexHtml) && fs.statSync(indexHtml).isFile()) ||
          (fs.existsSync(dotHtml) && fs.statSync(dotHtml).isFile());
      }

      assert.ok(
        resolved,
        `Broken internal reference "${target}" in ${path.relative(ROOT, file)}`
      );
    }
  }
});

test('built global.css has balanced braces and dual-theme selectors', () => {
  const css = readDist('global.css');
  assert.ok(css.includes(':root'), 'global.css must define :root variables');
  assert.ok(css.includes('html[data-theme="dark"]'), 'global.css must define dark theme rules');

  const stripped = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");

  let depth = 0;
  for (const ch of stripped) {
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    assert.ok(depth >= 0, 'global.css has unexpected closing brace "}"');
  }
  assert.equal(depth, 0, 'global.css has unbalanced braces');
});
