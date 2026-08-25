import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clockToMinutes, isWithinDispatchWindow, pacificClock } from './schedule-window';

test('clockToMinutes maps 12-hour clock', () => {
  assert.equal(clockToMinutes('12:00', 'AM'), 0);
  assert.equal(clockToMinutes('12:00', 'PM'), 12 * 60);
  assert.equal(clockToMinutes('10:30', 'AM'), 10 * 60 + 30);
  assert.equal(clockToMinutes('10:30', 'PM'), 22 * 60 + 30);
  assert.equal(clockToMinutes('bad', 'AM'), null);
});

test('isWithinDispatchWindow is plus/minus 10 Pacific minutes', () => {
  const now = new Date('2026-08-24T17:32:00.000Z'); // 10:32 AM PDT
  assert.equal(isWithinDispatchWindow({ now, time: '10:30', period: 'AM' }), true);
  assert.equal(isWithinDispatchWindow({ now, time: '11:00', period: 'AM' }), false);
});

test('pacificClock dateKey is calendar date in Pacific', () => {
  const now = new Date('2026-08-25T06:30:00.000Z'); // 11:30 PM PDT Aug 24
  assert.equal(pacificClock(now).dateKey, '2026-08-24');
});
