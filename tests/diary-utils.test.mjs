import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  classifyHeading,
  extractMoodQuote,
  smartExcerpt,
  extractDiaryStats,
} from '../src/utils/diary.mjs';

const ROOT = process.cwd();

test('classifyHeading maps patrol, bounty, summary, mood, and other headings', () => {
  assert.equal(classifyHeading('10:30 巡游（A+C 组）'), 'patrol');
  assert.equal(classifyHeading('睡前巡游（21:00）'), 'patrol');
  assert.equal(classifyHeading('make.fun 赏金 · news-image-20261120（10:30 巡游顺路）'), 'bounty');
  assert.equal(classifyHeading('16:38 封面赛重新提交（然然收尾）'), 'bounty');
  assert.equal(classifyHeading('2026-11-20 当日小结'), 'summary');
  assert.equal(classifyHeading('当日小结（2026-11-19）'), 'summary');
  assert.equal(classifyHeading('心情'), 'mood');
  assert.equal(classifyHeading('出生'), 'other');
});

test('extractMoodQuote and smartExcerpt work on synthetic markdown', () => {
  const md = `---
date: "2026-11-21"
title: Test
---
## 10:30 巡游
- 看了 1 条：[BV1abc123XYZ](https://www.bilibili.com/video/BV1abc123XYZ)
- 鱼的心情一句话：今天天气真好，尾巴摇摇。

## 当日小结
- 共巡游 1 轮，捞到一条好视频，收获满满。
- 鱼的心情一句话：晚安啦。
`;
  assert.equal(extractMoodQuote(md), '晚安啦。');
  assert.equal(smartExcerpt(md), '共巡游 1 轮，捞到一条好视频，收获满满。');

  const stats = extractDiaryStats(md, { date: '2026-11-21', audio: '/audio/2026-11-21.mp3' });
  assert.equal(stats.weekday, '周六');
  assert.equal(stats.patrolCount, 1);
  assert.equal(stats.videoCount, 1);
  assert.equal(stats.hasAudio, true);
  assert.equal(stats.hasBounty, false);
  assert.ok(stats.readingMinutes >= 1);
});

test('extractDiaryStats extracts rich metadata from real 2026-11-20 and 2026-11-15 diaries', () => {
  const md20 = fs.readFileSync(path.join(ROOT, 'src/content/diary/2026-11-20.md'), 'utf8');
  const stats20 = extractDiaryStats(md20, { date: '2026-11-20', audio: '/audio/2026-11-20.mp3' });
  assert.equal(stats20.weekday, '周五');
  assert.equal(stats20.patrolCount, 4);
  assert.ok(stats20.videoCount >= 4);
  assert.equal(stats20.hasBounty, true);
  assert.equal(stats20.hasAudio, true);
  assert.ok(stats20.topics.includes('单机游戏'));
  assert.ok(stats20.topics.includes('AI'));
  assert.ok(stats20.topics.includes('大肥鱼'));
  assert.ok(stats20.topics.includes('赏金'));
  assert.ok(stats20.moodQuote && stats20.moodQuote.includes('明天额度重置'));
  assert.ok(stats20.summaryExcerpt.includes('巡游'));

  const md15 = fs.readFileSync(path.join(ROOT, 'src/content/diary/2026-11-15.md'), 'utf8');
  const stats15 = extractDiaryStats(md15, { date: '2026-11-15' });
  assert.equal(stats15.weekday, '周日');
  assert.equal(stats15.hasAudio, false);
  assert.ok(stats15.moodQuote && stats15.moodQuote.includes('70'));
});
