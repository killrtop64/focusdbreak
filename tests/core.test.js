import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createState, start, pause, remaining, tick, switchMode, restoreState, todayStats, weekStats, localDate,
} from '../src/core.js';

const NOW = new Date(2026, 9, 27, 12).getTime();

test('pause and resume count active time, including a throttled background tab', () => {
  const state = createState(NOW);
  start(state, NOW);
  assert.equal(remaining(state, NOW + 30_000), 1470);
  pause(state, NOW + 30_000);
  assert.equal(remaining(state, NOW + 600_000), 1470);
  start(state, NOW + 600_000);
  assert.equal(tick(state, NOW + 600_000 + 1469_000), null);
  assert.equal(tick(state, NOW + 600_000 + 1470_000).mode, 'focus');
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].seconds, 1500);
  assert.equal(state.timer.running, false);
  assert.equal(state.timer.mode, 'short');
});

test('sleeping overnight records one session at its actual finish time', () => {
  const state = createState(NOW);
  start(state, NOW);
  const restored = restoreState(JSON.parse(JSON.stringify(state)), NOW + 86_400_000);
  tick(restored, NOW + 86_400_000);
  assert.equal(restored.history.length, 1);
  assert.equal(restored.history[0].endedAt, NOW + 1500_000);
  assert.equal(restored.timer.running, false);
  assert.equal(todayStats(restored, NOW + 86_400_000).sessions, 0);
  assert.equal(todayStats(restored, NOW).sessions, 1);
});

test('repeated heartbeat and reloading a completed session cannot count it twice', () => {
  const state = createState(NOW);
  start(state, NOW);
  tick(state, NOW + 1500_000);
  assert.equal(tick(state, NOW + 1501_000), null);
  const restored = restoreState(state, NOW + 1502_000);
  assert.equal(tick(restored, NOW + 1503_000), null);
  assert.equal(restored.history.length, 1);
});

test('the fourth completed focus session offers a long break; breaks do not count as work', () => {
  const state = createState(NOW);
  let now = NOW;
  for (let index = 0; index < 4; index += 1) {
    start(state, now);
    now += 1500_000;
    tick(state, now);
    assert.equal(state.timer.mode, index === 3 ? 'long' : 'short');
    start(state, now);
    now += state.timer.total * 1000;
    tick(state, now);
    assert.equal(state.timer.mode, 'focus');
  }
  assert.equal(state.history.length, 4);
  assert.equal(state.cycle, 4);
});

test('changing modes discards unfinished sessions without awarding time', () => {
  const state = createState(NOW);
  start(state, NOW);
  pause(state, NOW + 120_000);
  switchMode(state, 'short', NOW + 120_000);
  assert.equal(state.history.length, 0);
  assert.equal(state.cycle, 0);
  assert.equal(state.timer.remaining, 300);
  switchMode(state, 'invalid', NOW);
  assert.equal(state.timer.mode, 'short');
});

test('pausing at the deadline completes the session instead of leaving a zero timer', () => {
  const state = createState(NOW);
  start(state, NOW);
  assert.equal(pause(state, NOW + 1500_000).mode, 'focus');
  assert.equal(state.timer.remaining, 300);
  assert.equal(state.history.length, 1);
});

test('starting a running timer does not extend the deadline', () => {
  const state = createState(NOW);
  start(state, NOW);
  start(state, NOW + 60_000);
  assert.equal(state.timer.endAt, NOW + 1500_000);
});

test('custom settings do not change the duration awarded to a session already running', () => {
  const state = createState(NOW);
  start(state, NOW);
  state.settings.focus = 50;
  tick(state, NOW + 1500_000);
  assert.equal(state.history[0].seconds, 1500);
  switchMode(state, 'focus');
  assert.equal(state.timer.total, 3000);
});

test('data restoration rejects malformed settings, dates, and excessive durations', () => {
  const state = restoreState({
    version:1,
    settings:{ focus:-2, short:Infinity, long:1000, goal:'lots', language:'xx' },
    tasks:[null, { id:'ok', text:'<script>do not run</script>', completedAt:-100 }],
    history:[
      { id:'bad-date', endedAt:1e100, seconds:1500 },
      { id:'too-long', endedAt:NOW, seconds:9000 },
      { id:'valid', endedAt:NOW, seconds:1500, task:'hello' },
    ],
    timer:{ running:true, endAt:NOW + 1e10, mode:'banana', total:Infinity, remaining:-1 },
  }, NOW);
  assert.equal(state.settings.focus, 25);
  assert.equal(state.settings.short, 5);
  assert.equal(state.settings.long, 15);
  assert.equal(state.settings.goal, 4);
  assert.equal(state.settings.language, 'ru');
  assert.equal(state.history.length, 1);
  assert.equal(state.tasks[0].completedAt, null);
  assert.equal(state.timer.running, false);
  assert.equal(state.timer.remaining, 1500);
  assert.equal(state.timer.mode, 'focus');
});

test('task completion totals survive removing finished tasks from the visible list', () => {
  const state = createState(NOW);
  state.tasks = [{ id:'one', text:'A useful thing', completedAt:NOW }];
  state.completedTasks = [{ id:'one', completedAt:NOW }];
  state.tasks = [];
  assert.equal(todayStats(state, NOW).tasks, 1);
  assert.equal(todayStats(restoreState(state, NOW), NOW).tasks, 1);
});

test('older backups recover task completion totals from their completed tasks', () => {
  const state = createState(NOW);
  delete state.completedTasks;
  state.tasks = [{ id:'one', text:'Done', completedAt:NOW }];
  assert.equal(todayStats(restoreState(state, NOW), NOW).tasks, 1);
});

test('weekly statistics use local calendar dates, including month boundaries', () => {
  const now = new Date(2026, 10, 2, 0, 15).getTime();
  const state = createState(now);
  const yesterday = new Date(2026, 10, 1, 23, 59).getTime();
  state.history = [
    { id:'a', endedAt:yesterday, seconds:1500, task:'' },
    { id:'b', endedAt:now, seconds:3000, task:'' },
  ];
  const week = weekStats(state, now);
  assert.equal(week.length, 7);
  assert.equal(week[0].date, '2026-10-27');
  assert.equal(week[5].minutes, 25);
  assert.equal(week[6].minutes, 50);
  assert.equal(todayStats(state, now).sessions, 1);
  assert.equal(localDate(now), '2026-11-02');
});

test('restoration keeps all tasks, long text and session history', () => {
  const state = createState(NOW);
  state.tasks = Array.from({ length:150 }, (_, i) => ({ id:String(i), text:'x'.repeat(300) }));
  state.history = Array.from({ length:2500 }, (_, i) => ({ id:String(i), endedAt:NOW, seconds:1500 }));
  const restored = restoreState(state, NOW);
  assert.equal(restored.tasks.length, 150);
  assert.equal(restored.tasks[0].text.length, 300);
  assert.equal(restored.history.length, 2500);
});
