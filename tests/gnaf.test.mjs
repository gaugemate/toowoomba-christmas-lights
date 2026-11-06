// Address search from the official address list (data/addresses, built by tools/build-addresses.py)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
globalThis.fetch = async url => ({ ok: true, json: async () => JSON.parse(readFileSync(root + url, 'utf8')) });
const { searchGnaf, parseAddress } = await import('../src/gnaf.js');

const near = (p, lat, lng) => Math.abs(p.lat - lat) < 0.0005 && Math.abs(p.lng - lng) < 0.0005;

test('reads house numbers, units and blocks', () => {
  assert.deepEqual(parseAddress('3/45a Bob St'), { unit: '3', num: '45A', rest: 'Bob St' });
  assert.deepEqual(parseAddress('12-14 Bob'), { unit: '', num: '12-14', rest: 'Bob' });
  assert.deepEqual(parseAddress('Bob Street'), { rest: 'Bob Street' });
});

test('a real address lands on the property', async () => {
  const [p] = await searchGnaf('259 Ruthven St');
  assert.equal(p.title, '259 Ruthven Street');
  assert.equal(p.suburb, 'Toowoomba City');
  assert.ok(p.exact && p.hasNumber);
  assert.ok(near(p, -27.5536, 151.95428));
});

test('finds the right suburb when a street runs through several', async () => {
  const [p] = await searchGnaf('5 Hume Street');
  assert.equal(p.title, '5 Hume Street');
  assert.equal(p.suburb, 'Pittsworth');
});

test('covers the region: Oakey, Highfields, Westbrook, Gowrie Junction', async () => {
  for (const [q, suburb] of [['1 Campbell St Oakey', 'Oakey'], ['Highfields', null]]) {
    const res = await searchGnaf(q);
    assert.ok(res.length, q);
    if (suburb) assert.equal(res[0].suburb, suburb);
  }
  for (const town of ['Highfields', 'Westbrook', 'Gowrie Junction', 'Oakey']) {
    const idx = JSON.parse(readFileSync(root + 'data/addresses/index.json', 'utf8'));
    assert.ok(idx.addresses > 100000);
    let found = false;
    for (const l of idx.letters) {
      const d = JSON.parse(readFileSync(root + `data/addresses/${l}.json`, 'utf8'));
      if (d.streets.some(s => s[1] === town)) { found = true; break; }
    }
    assert.ok(found, `${town} has addresses`);
  }
});

test('short forms, units and blocks', async () => {
  assert.equal((await searchGnaf('1/259 Ruthven'))[0].title, '1/259 Ruthven Street');
  assert.equal((await searchGnaf('10 Taylor St Toowoomba'))[0].title, '8-12 Taylor Street');
  assert.match((await searchGnaf('12 New England Hwy'))[0].title, /New England Highway/);
});

test('an unknown number gives the street, to place by hand', async () => {
  const res = await searchGnaf('99999 Ruthven St');
  assert.ok(res.length && res.every(p => !p.hasNumber && p.isStreet));
});
