import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { DrawnPage } from '../../src/components/invite/drawn';
import { builtinDesign, type PageSpec } from '../../src/lib/design';
import { STORY_SLOTS, STORY_LABELS, STORY_HEAD, PHOTO_SLOTS, PHOTO_HEAD, slotStyle, labelStyle, captionStyle } from '../../src/lib/babyblue';
import { t } from '../../src/lib/copy';

const doc = builtinDesign('babyblue')!;
const page = (key: string) => doc.pages.find((p) => p.key === key) as PageSpec;

/** Six milestones, and four photographs with an empty row in front of them. */
const content = {
  story: {
    line: 'A little prayer, answered',
    timeline: STORY_SLOTS.map((_, i) => ({ title: `Moment ${i + 1}`, text: `What happened, number ${i + 1}.`, photo: `/story-${i + 1}.jpg` })),
  },
  gallery: {
    line: 'Little moments, big love',
    photos: [
      { url: '', caption: 'a row with no picture' },
      ...PHOTO_SLOTS.map((_, i) => ({ url: `/photo-${i + 1}.jpg`, caption: `Month ${i + 1}` })),
    ],
  },
};

const html = (key: string, c: Record<string, unknown> = content) =>
  renderToStaticMarkup(DrawnPage({ page: page(key), content: c, look: undefined, lang: 'en' }) as ReactElement);

/** Every style attribute in the markup, in order, parsed back into an object. */
function styles(markup: string): Record<string, string>[] {
  return [...markup.matchAll(/style="([^"]*)"/g)].map(([, s]) =>
    Object.fromEntries(s.split(';').filter(Boolean).map((d) => {
      const at = d.indexOf(':');
      return [d.slice(0, at).trim(), d.slice(at + 1).trim()];
    })),
  );
}
const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');

/**
 * The document draws Our Story exactly as StoryMilestones does: one header at
 * the designer's top, then frame, label, frame, label down the timeline, each
 * at the place slotStyle and labelStyle put it.
 */
test('the story page draws the header, then a frame and a label per milestone', () => {
  const markup = html('story');
  assert.match(markup, /^<section id="story" class="inv-section inv-bb-art inv-bb-story">/);
  const got = styles(markup);
  assert.equal(got.length, 1 + STORY_SLOTS.length * 2);
  assert.deepEqual(got[0], { top: `${STORY_HEAD.titleTop}%` });
  STORY_SLOTS.forEach((slot, i) => {
    assert.deepEqual(got[1 + i * 2], slotStyle(slot), `frame ${i + 1}`);
    assert.deepEqual(got[2 + i * 2], labelStyle(STORY_LABELS[i]), `label ${i + 1}`);
  });
  // the header: the app's heading, because no look is set, and the client's own line
  assert.match(markup, new RegExp(`<header class="inv-bb-head"[^>]*><h2 class="inv-title">${t('en', 'story.title')}</h2><p class="inv-bb-sub">A little prayer, answered</p></header>`));
  // a milestone: its name and its sentence, in one box
  assert.match(markup, /<div class="inv-bb-label"[^>]*><p class="t">Moment 3<\/p><p class="x">What happened, number 3\.<\/p><\/div>/);
  assert.match(markup, /<figure class="inv-bb-slot"[^>]*><img src="[^"]*story-2[^"]*" alt="" loading="lazy"\/><\/figure>/);
});

/**
 * The photographs page counts the rows that have a picture, so the empty row
 * in front of them is skipped and each caption belongs to its own frame.
 */
test('the photographs page skips the empty row and keeps each caption with its frame', () => {
  const markup = html('baby-photos');
  const got = styles(markup);
  assert.equal(got.length, 1 + PHOTO_SLOTS.length * 2);
  assert.deepEqual(got[0], { top: `${PHOTO_HEAD.eyebrowTop}%` });
  PHOTO_SLOTS.forEach((slot, i) => {
    assert.deepEqual(got[1 + i * 2], slotStyle(slot), `frame ${i + 1}`);
    // captionStyle works in cqw; the document holds y as a share of the page's
    // height. Same place: the transform is identical and left and width agree.
    const mine = got[2 + i * 2];
    const theirs = captionStyle(slot) as Record<string, string>;
    assert.equal(unescape(mine.transform), theirs.transform, `caption ${i + 1}`);
    assert.equal(Number(mine.left.replace('%', '')).toFixed(6), Number(theirs.left.replace('cqw', '')).toFixed(6));
  });
  assert.match(markup, new RegExp(`<p class="inv-bb-eyebrow">Share</p><h2 class="inv-bb-script">${t('en', 'gallery.title')}</h2>`));
  // the first frame holds the first row that has a picture, and reads its caption out
  assert.match(markup, /<img src="[^"]*photo-1[^"]*" alt="Month 1"/);
  assert.match(markup, /<p class="inv-bb-caption"[^>]*>Month 1<\/p>/);
  assert.doesNotMatch(markup, /a row with no picture/);
});

/** Nothing is drawn for a frame with no picture or a label with no words. */
test('an empty frame and an empty label draw nothing at all', () => {
  const markup = html('story', { story: { timeline: [{ title: '', text: '', photo: '' }, { title: 'Second', text: '', photo: '/two.jpg' }] } });
  // the header still stands (its heading falls back to the app's copy)
  assert.equal(styles(markup).length, 1 + 2);
  assert.match(markup, /<p class="t">Second<\/p>/);
  assert.doesNotMatch(markup, /class="x"/);
  assert.equal([...markup.matchAll(/inv-bb-slot/g)].length, 1);
});

/** Tagalog: the design's English-only eyebrow stays unwritten rather than printed in English. */
test('a fixed line written in one language only stays out of the other', () => {
  const markup = renderToStaticMarkup(DrawnPage({ page: page('baby-photos'), content, look: undefined, lang: 'tl' }) as ReactElement);
  assert.doesNotMatch(markup, /inv-bb-eyebrow/);
  assert.match(markup, /inv-bb-script/);
});
