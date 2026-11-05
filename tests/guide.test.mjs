import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Guide, instruction, arrowFor, fmtDist, metres, bearingWords } from '../src/guide.js';

test('turn wording', () => {
  assert.equal(instruction({ type: 'turn', modifier: 'left', name: 'Bob Street' }), 'Turn left onto Bob Street');
  assert.equal(instruction({ type: 'roundabout', exit: 2, name: 'James St' }), 'At the roundabout, take the second exit onto James St');
  assert.equal(instruction({ type: 'arrive' }), 'You have arrived');
  assert.equal(instruction({ type: 'depart', name: 'Ruthven St' }), 'Head off along Ruthven St');
  assert.equal(arrowFor({ type: 'turn', modifier: 'slight right' }), 'slight-right');
  assert.equal(arrowFor({ type: 'roundabout' }), 'roundabout');
});

test('distance wording', () => {
  assert.deepEqual(fmtDist(1500), { n: '1.5', u: 'km' });
  assert.deepEqual(fmtDist(430), { n: '450', u: 'm' });
  assert.deepEqual(fmtDist(42), { n: '40', u: 'm' });
  assert.equal(bearingWords([-27.56, 151.95], [-27.46, 151.95]), 'north');
});

// A straight road north, a left turn, then the display
const A = [-27.5700, 151.9500], TURN = [-27.5650, 151.9500], DEST = [-27.5650, 151.9440];
const steps = [
  { type: 'depart', name: 'North St', location: A },
  { type: 'turn', modifier: 'left', name: 'Bob Street', location: TURN },
  { type: 'arrive', location: DEST }
];
const along = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];

test('speaks early, then at the turn, then arrives', () => {
  const g = new Guide({ steps, line: [A, TURN, DEST], dest: DEST });
  const first = g.update(along(A, TURN, 0.1));
  assert.match(first.speak, /^In \d+ metres, turn left onto Bob Street$/);
  assert.equal(g.update(along(A, TURN, 0.2)).speak, null, 'should not repeat');
  assert.equal(g.update(along(A, TURN, 0.9)).speak, 'Turn left onto Bob Street');
  g.update(TURN); // location updates every second or so, so the car passes through the corner
  const past = g.update(along(TURN, DEST, 0.5));
  assert.equal(past.step.type, 'arrive');
  const end = g.update(DEST);
  assert.ok(end.arrivedNow);
  assert.ok(metres(DEST, DEST) === 0);
});

test('off route needs two bad readings in a row', () => {
  const g = new Guide({ steps, line: [A, TURN, DEST], dest: DEST });
  const away = [-27.5680, 151.9560]; // a few hundred metres east of the road
  assert.equal(g.update(away).offRoute, false);
  assert.equal(g.update(away).offRoute, true);
  assert.equal(g.update(along(A, TURN, 0.5)).offRoute, false);
});

test('a vague location fix never counts as off route', () => {
  const g = new Guide({ steps, line: [A, TURN, DEST], dest: DEST });
  const away = [-27.5680, 151.9560];
  g.update(away, 200); assert.equal(g.update(away, 200).offRoute, false);
});
