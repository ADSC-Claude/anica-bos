import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spotifyRef, spotifyEmbed } from '../src/lib/spotify';

test('a Spotify share link, with or without a locale, and a URI all name the same song', () => {
  const id = '4uLU6hMCjMI75M1A2tKUQC';
  assert.deepEqual(spotifyRef(`https://open.spotify.com/track/${id}?si=abc123`), { kind: 'track', id });
  assert.deepEqual(spotifyRef(`https://open.spotify.com/intl-pt/track/${id}`), { kind: 'track', id });
  assert.deepEqual(spotifyRef(`spotify:track:${id}`), { kind: 'track', id });
  assert.deepEqual(spotifyRef(`https://open.spotify.com/playlist/${id}`), { kind: 'playlist', id });
  assert.equal(spotifyRef('https://www.youtube.com/watch?v=abc'), null);
  assert.equal(spotifyRef(''), null);
  const e = spotifyEmbed({ kind: 'track', id });
  assert.equal(e.src, `https://open.spotify.com/embed/track/${id}?utm_source=generator&theme=0`);
  assert.equal(e.height, 152);
  assert.equal(spotifyEmbed({ kind: 'album', id }).height, 352);
});
