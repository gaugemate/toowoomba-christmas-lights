// The app's own version number must match the service worker's, or phones can't tell they're out of date
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APP_VERSION } from '../src/version.js';
test('src/version.js and sw.js have the same version', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.equal(sw.match(/const VERSION = '([^']+)'/)[1], APP_VERSION);
  assert.ok(sw.includes("'src/version.js'"), 'version.js is saved for offline use');
});
