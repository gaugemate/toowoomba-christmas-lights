// Opening hours: drives only send you to displays that will be on when you get there
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRoutes, estimateMatrix, parseHours, clockText, clockMinutes, LAST_CALL } from '../src/planner.js';

const START = { lat: -27.5606, lng: 151.9539 };
const at = (i, extra) => ({ id: 'd' + i, lat: -27.5606 + 0.004 * Math.cos(i), lng: 151.9539 + 0.004 * Math.sin(i), size: 3, viewing: 'drive', hours: '7pm – 11pm', ...extra });

test('reads the hours people choose (and the old Dusk and Late)', () => {
  assert.deepEqual(parseHours('7pm – 10pm'), { on: 1140, off: 1320 });
  assert.deepEqual(parseHours('7:30pm – 1am'), { on: 1170, off: 1500 });
  assert.deepEqual(parseHours('Dusk – Late'), { on: 1170, off: 1440 });
  assert.deepEqual(parseHours('6pm – Midnight'), { on: 1080, off: 1440 });
  assert.equal(parseHours(''), null);
  assert.equal(parseHours('whenever'), null);
  assert.equal(clockMinutes('12:30am'), 30);
  assert.equal(clockText(1290), '9:30pm'); assert.equal(clockText(1440), 'midnight'); assert.equal(clockText(1500), '1am');
});

// Each stop must be reached before it switches off (with a few minutes to look), and never earlier than it comes on
function checkStops(routes, leaveClock) {
  for (const r of routes) for (const s of r.stops) {
    const h = parseHours(s.display.hours); if (!h) continue;
    const reach = leaveClock + s.arriveMin + s.waitMin;
    assert.ok(reach <= h.off - LAST_CALL + 1e-6, `${s.display.id} reached at ${clockText(reach)} but off at ${clockText(h.off)}`);
    assert.ok(reach >= h.on - 1e-6, `${s.display.id} viewed before it came on`);
  }
}

test('leaves out a display that will be off by the time you get there', () => {
  const displays = [at(1), at(2), at(3, { hours: '6pm – 8:30pm' }), at(4)];
  const matrix = estimateMatrix([START, ...displays]);
  const leave = 20 * 60 + 30; // 8:30pm: display 3 has just switched off
  const routes = planRoutes({ displays, matrix, budgetMin: 120, leaveClock: leave });
  assert.ok(routes.length);
  for (const r of routes) assert.ok(!r.stops.some(s => s.display.id === 'd3'), 'd3 should be left out');
  checkStops(routes, leave);
});

test('visits the early-closing display first', () => {
  // 8 big displays; one switches off at 8:20pm. Leaving at 8pm, it has to come first.
  const displays = Array.from({ length: 8 }, (_, i) => at(i, i === 5 ? { hours: '7pm – 8:20pm' } : {}));
  const matrix = estimateMatrix([START, ...displays]);
  const leave = 20 * 60;
  const routes = planRoutes({ displays, matrix, budgetMin: 150, leaveClock: leave });
  const best = routes[0];
  assert.ok(best.stops.some(s => s.display.id === 'd5'), 'the early one should still fit');
  assert.ok(best.stops.findIndex(s => s.display.id === 'd5') <= 1, 'and come early in the drive');
  checkStops(routes, leave);
});

test('leaving before the lights come on allows for the wait', () => {
  const displays = [at(1), at(2)];
  const matrix = estimateMatrix([START, ...displays]);
  const leave = 18 * 60 + 30; // 6:30pm, lights on at 7pm
  const [r] = planRoutes({ displays, matrix, budgetMin: 90, leaveClock: leave });
  assert.ok(r.waitMin > 0 && r.stops[0].waitMin > 0);
  checkStops([r], leave);
});

test('late at night, drives still work after midnight', () => {
  const displays = [at(1, { hours: '7pm – 1am' }), at(2, { hours: '7pm – 10pm' })];
  const matrix = estimateMatrix([START, ...displays]);
  const routes = planRoutes({ displays, matrix, budgetMin: 60, leaveClock: 23 * 60 + 30 });
  assert.deepEqual(routes[0].stops.map(s => s.display.id), ['d1']);
});

test('without a leaving time, hours are ignored (as before)', () => {
  const displays = [at(1, { hours: '6pm – 7pm' })];
  const routes = planRoutes({ displays, matrix: estimateMatrix([START, ...displays]), budgetMin: 60 });
  assert.equal(routes[0].stops.length, 1);
});

test('plenty of displays with hours still plans quickly', () => {
  const displays = Array.from({ length: 70 }, (_, i) => ({ ...at(i), lat: -27.5606 + 0.03 * Math.cos(i * 1.7) * (i % 7) / 7, lng: 151.9539 + 0.03 * Math.sin(i * 1.3) * (i % 5) / 5,
    hours: ['7pm – 10pm', '7:30pm – 9pm', '6pm – 11pm', '8pm – midnight'][i % 4] }));
  const t0 = Date.now();
  const routes = planRoutes({ displays, matrix: estimateMatrix([START, ...displays]), budgetMin: 180, leaveClock: 19 * 60 + 45 });
  const ms = Date.now() - t0;
  assert.ok(routes.length && routes[0].stops.length > 5);
  assert.ok(ms < 4000, `took ${ms} ms`);
  checkStops(routes, 19 * 60 + 45);
  console.log(`   70 displays with hours: ${ms} ms, ${routes[0].stops.length} stops`);
});
