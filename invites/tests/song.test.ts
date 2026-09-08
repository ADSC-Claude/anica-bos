import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStart, formatStart, youtubeId, youtubeEmbed, START_MAX } from '../src/lib/song';

test('the start of a song reads minutes and seconds, or seconds, and nothing else', () => {
  assert.equal(parseStart('1:05'), 65);
  assert.equal(parseStart('0:30'), 30);
  assert.equal(parseStart('12:00'), 720);
  assert.equal(parseStart(65), 65);
  assert.equal(parseStart('65'), 65);
  assert.equal(parseStart(''), 0);
  assert.equal(parseStart(null), 0);
  assert.equal(parseStart(undefined), 0);
  assert.equal(parseStart('1:75'), 0);
  assert.equal(parseStart('soon'), 0);
  assert.equal(parseStart(-5), 0);
  assert.equal(parseStart(Number.NaN), 0);
  assert.equal(parseStart(99999), START_MAX);
  assert.equal(formatStart(65), '1:05');
  assert.equal(formatStart(0), '0:00');
  assert.equal(formatStart(600), '10:00');
});

test('a YouTube link in any of its forms names the video, and the player starts where asked', () => {
  const id = 'dQw4w9WgXcQ';
  for (const u of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}?si=x`,
    `https://www.youtube.com/shorts/${id}`,
    `https://music.youtube.com/watch?v=${id}&list=abc`,
    `https://www.youtube.com/watch?feature=share&v=${id}`,
    `  https://www.youtube.com/embed/${id}  `,
  ]) assert.equal(youtubeId(u), id, u);
  assert.equal(youtubeId('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'), null);
  assert.equal(youtubeId(''), null);
  assert.equal(youtubeEmbed(id, 65).src, `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0&start=65`);
  assert.equal(youtubeEmbed(id).src, `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0`);
  assert.ok(youtubeEmbed(id).poster.includes(id));
});
