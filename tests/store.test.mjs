// Photos and the new-season year (src/store.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { cleanEntry, newSeasonYear, THUMB_MAX } = await import('../src/store.js');

test('"Start a new year" names the coming season', () => {
  assert.equal(newSeasonYear(new Date(2026, 11, 31)), 2027); // 31 Dec 2026
  assert.equal(newSeasonYear(new Date(2027, 0, 5)), 2027);   // 5 Jan 2027
  assert.equal(newSeasonYear(new Date(2027, 5, 30)), 2027);  // still the 2027 season until July
  assert.equal(newSeasonYear(new Date(2027, 6, 1)), 2028);
});

test('only a small JPEG photo preview is kept', () => {
  const base = { address: '1 A St', lat: -27.5, lng: 151.9, size: 2 };
  const ok = 'data:image/jpeg;base64,' + 'A'.repeat(5000);
  assert.equal(cleanEntry({ ...base, thumb: ok }).thumb, ok);
  assert.equal(cleanEntry({ ...base, thumb: 'javascript:alert(1)' }).thumb, '');
  assert.equal(cleanEntry({ ...base, thumb: 'data:image/png;base64,AAAA' }).thumb, '');
  assert.equal(cleanEntry({ ...base, thumb: 'data:image/jpeg;base64,' + 'A'.repeat(THUMB_MAX) }).thumb, '');
  assert.equal(cleanEntry(base).thumb, '');
});

test('a website link is tidied into a safe https address, or dropped', async () => {
  const { normLink, linkShort, cleanEntry } = await import('../src/store.js');
  assert.equal(normLink('facebook.com/tinselcourtlights'), 'https://facebook.com/tinselcourtlights');
  assert.equal(normLink('  www.Example.com.au '), 'https://www.example.com.au/');
  assert.equal(normLink('http://example.com/a?b=1'), 'http://example.com/a?b=1');
  for (const bad of ['javascript:alert(1)', 'mailto:a@b.com', 'data:text/html,hi', 'not a link', 'localhost', 'https://user:pw@x.com', 'x.com/' + 'a'.repeat(300)]) assert.equal(normLink(bad), '', bad);
  assert.equal(linkShort('https://www.facebook.com/tinselcourtlights/'), 'facebook.com/tinselcourtlights');
  const c = cleanEntry({ address: '1 A St', lat: -27.5, lng: 151.9, link: 'javascript:x', linkTitle: 'Hi' });
  assert.equal(c.link, ''); assert.equal(c.linkTitle, '');
  assert.equal(cleanEntry({ link: 'fb.com/x', linkTitle: 'y'.repeat(60) }).linkTitle.length, 40);
});
