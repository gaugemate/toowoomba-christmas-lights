// Run with: npm test   (needs Node 20 or newer; nothing to install)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRoutes, estimateMatrix, shortlist, viewMinutes, haversineKm } from '../src/planner.js';
import { SAMPLE_DISPLAYS } from '../src/sample-displays.js';

const START = { lat: -27.5606, lng: 151.9539 }; // Toowoomba city centre

function plan(budgetMin, displays = SAMPLE_DISPLAYS, returnToStart = true) {
  const list = shortlist(START, displays, budgetMin);
  const matrix = estimateMatrix([START, ...list]);
  return { list, matrix, routes: planRoutes({ displays: list, matrix, budgetMin, returnToStart }) };
}

// Total time worked out from scratch, to check the planner's own sums
function recount(route, matrix, returnToStart) {
  const D = matrix.durations.map(r => r.map(s => (s * route.slow) / 60));
  let t = 0, prev = 0;
  for (const s of route.stops) { t += D[prev][s.index + 1] + viewMinutes(s.display); prev = s.index + 1; }
  if (returnToStart) t += D[prev][0];
  return t;
}

test('distances are sensible', () => {
  assert.equal(haversineKm(START, START), 0);
  const highfields = { lat: -27.46, lng: 151.952 };
  const km = haversineKm(START, highfields);
  assert.ok(km > 10 && km < 12, `city to Highfields was ${km} km`);
});

test('every drive fits in the time given', () => {
  for (const budget of [20, 45, 60, 90, 120]) {
    const { routes, matrix } = plan(budget);
    assert.ok(routes.length >= 1, `no drives for ${budget} min`);
    for (const r of routes) {
      assert.ok(r.totalMin <= budget + 1e-6, `${r.title} took ${r.totalMin} of ${budget} min`);
      assert.ok(Math.abs(recount(r, matrix, true) - r.totalMin) < 1e-6, `${r.title} sums don't add up`);
    }
  }
});

test('no display is visited twice in one drive', () => {
  for (const r of plan(90).routes) {
    const ids = r.stops.map(s => s.display.id);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test('more time means at least as many displays', () => {
  const most = b => plan(b).routes.find(r => r.key === 'most')?.count ?? 0;
  assert.ok(most(90) >= most(45));
  assert.ok(most(45) >= most(20));
});

test('"Biggest and best" favours big displays', () => {
  const { routes } = plan(60);
  const most = routes.find(r => r.key === 'most');
  const best = routes.find(r => r.key === 'best');
  if (!most || !best) return; // too alike to show both: nothing to compare
  const avg = r => r.stops.reduce((a, s) => a + s.display.size, 0) / r.count;
  assert.ok(avg(best) >= avg(most), `best avg ${avg(best)} < most avg ${avg(most)}`);
});

test('drives offered are genuinely different from each other', () => {
  const { routes } = plan(90);
  for (let i = 0; i < routes.length; i++) for (let j = i + 1; j < routes.length; j++) {
    const a = new Set(routes[i].order), b = routes[j].order;
    const common = b.filter(x => a.has(x)).length;
    assert.ok(common / Math.min(a.size, b.length) < 0.75, `${routes[i].title} and ${routes[j].title} overlap too much`);
  }
});

test('one-way drives skip the trip home', () => {
  const { routes } = plan(60, SAMPLE_DISPLAYS, false);
  for (const r of routes) assert.equal(r.backMin, 0);
});

test('the same request always gives the same drives', () => {
  const a = plan(60).routes.map(r => r.order.join());
  const b = plan(60).routes.map(r => r.order.join());
  assert.deepEqual(a, b);
});

test('handles no displays, and too little time', () => {
  assert.deepEqual(planRoutes({ displays: [], matrix: { durations: [[0]], distances: [[0]] }, budgetMin: 60 }), []);
  assert.deepEqual(plan(1).routes, []);
});

test('walk-through displays get extra time', () => {
  assert.equal(viewMinutes({ size: 2, viewing: 'walk' }), viewMinutes({ size: 2, viewing: 'drive' }) + 5);
});

test('shortlist leaves out displays too far to reach', () => {
  const list = shortlist(START, SAMPLE_DISPLAYS, 15);
  assert.ok(!list.some(d => d.suburb === 'Highfields' || d.suburb === 'Westbrook'));
  assert.ok(list.length > 0);
});
