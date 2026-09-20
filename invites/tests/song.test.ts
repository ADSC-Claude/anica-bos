import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStart, formatStart, youtubeId, youtubeEmbed, looped, START_MAX } from '../src/lib/song';
import { fieldsFor } from '../src/lib/sections';

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

/**
 * "if you noticed that the guest is still in the invitation and the music
 * ends, it should repeat the song again."
 *
 * The repeat is the audio element's own `loop`, which returns the song to 0
 * and knows nothing about the point the invitation starts it at. This is how
 * the player notices that turn: the clock has gone backwards past the start
 * point, which nothing else can do — a guest is given a play button and no
 * scrubber.
 */
test('a song that has come round again is taken back to its start point', () => {
  // six seconds of intro, which is what her christening skips
  assert.equal(looped(0, 6), true, 'the loop put it back at the very beginning');
  assert.equal(looped(0.4, 6), true, 'or a moment past it, the wrap having been announced late');
  assert.equal(looped(5.6, 6), false, 'but not within the slack: that is the seek arriving, not a wrap');
  assert.equal(looped(6, 6), false, 'nor standing on the start point');
  assert.equal(looped(180, 6), false, 'nor playing on through the song');
  // a song with no intro to skip loops on its own and is never touched
  assert.equal(looped(0, 0), false);
  assert.equal(looped(120, 0), false);
});

/**
 * When the song starts: the family's choice, not ours.
 *
 * "The customer now wants the music to start once the cover has shown,
 * while others wants it to be touched in the play button when they
 * clicked."
 *
 * Both are right about their own invitation. The play button stays the
 * default — a song nobody asked for, in a quiet room or an office, is the
 * fault this setting used to be, and #160 took it out for that reason.
 *
 * The important thing this guards is that the default is still silence. A
 * blank answer, a missing section, an old invitation saved before the
 * question existed: all of them must read as "wait for the button", or
 * every invitation already sent out starts singing.
 */
test('the song waits for the button unless the family said otherwise', () => {
  const field = fieldsFor('music', 'CHRISTENING').find((f) => f.key === 'startOn');
  assert.ok(field, 'the music section asks when the song starts');
  assert.equal(field!.type, 'select');
  assert.deepEqual(field!.options?.map((o) => o.value), ['', 'cover'],
    'the blank — the play button — is first, so it is what an unanswered form means');

  // and the reading the renderer does, which is the only thing that matters
  const startsOnCover = (music: unknown) => (music as { startOn?: string } | undefined)?.startOn === 'cover';
  assert.equal(startsOnCover({ startOn: 'cover' }), true);
  assert.equal(startsOnCover({ startOn: '' }), false, 'the blank answer waits');
  assert.equal(startsOnCover({ song: 'Ikaw' }), false, 'a form saved before the question waits');
  assert.equal(startsOnCover(undefined), false, 'no music section at all waits');
  assert.equal(startsOnCover({ startOn: 'COVER' }), false, 'and nothing else counts as yes');
});
