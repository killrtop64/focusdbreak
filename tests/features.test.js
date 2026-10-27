import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, restoreState, normalizeTask, completeTask, filteredTasks, projectStats, exportCSV, start, tick, todayStats, trashTasks, restoreTasks } from '../src/core.js';
import { decodeDocument, encodeDocument } from '../shared/state-codec.js';
const FRIDAY = new Date(2026,9,30,12).getTime();
const task = (extra = {}) => normalizeTask({ id:'task-1', text:'Read', ...extra });

test('v1 backups migrate with task IDs, history, settings, and completed totals intact', () => {
  const state = restoreState({
    version:1, settings:{ focus:40, language:'en' },
    tasks:[{ id:'a', text:'Keep me', completedAt:FRIDAY }],
    history:[{ id:'h', seconds:2400, endedAt:FRIDAY, task:'Keep me' }],
  },FRIDAY);
  assert.equal(state.version,2);
  assert.equal(state.settings.focus,40);
  assert.equal(state.tasks[0].id,'a');
  assert.equal(state.tasks[0].priority,'normal');
  assert.equal(state.history[0].seconds,2400);
  assert.equal(todayStats(state,FRIDAY).tasks,1);
});

test('weekday recurrence skips a weekend and redo never creates a duplicate occurrence', () => {
  const state = createState(FRIDAY);
  state.tasks.push(task({ repeat:'weekdays', dueDate:'2026-10-30', project:'Study' }));
  const next = completeTask(state,'task-1',FRIDAY);
  assert.equal(next.dueDate,'2026-11-02');
  assert.equal(next.project,'Study');
  completeTask(state,'task-1',FRIDAY);
  completeTask(state,'task-1',FRIDAY);
  assert.equal(state.tasks.length,2);
  assert.equal(state.completedTasks.length,1);
});

test('completing an overdue daily task schedules tomorrow without creating a backlog', () => {
  const state = createState(FRIDAY);
  state.tasks.push(task({ repeat:'daily', dueDate:'2026-10-01' }));
  assert.equal(completeTask(state,'task-1',FRIDAY).dueDate,'2026-10-31');
});

test('recurrence crosses year boundaries and is not silently skipped at 100 tasks', () => {
  const now = new Date(2026,11,30,12).getTime();
  const state = createState(now);
  state.tasks.push(task({ repeat:'weekly', dueDate:'2026-12-30' }));
  assert.equal(completeTask(state,'task-1',now).dueDate,'2027-01-06');
  const full = createState(now);
  full.tasks = Array.from({ length:100 }, (_,i) => task({ id:String(i), repeat:'daily' }));
  assert.equal(completeTask(full,'0',now).dueDate,'2026-12-31');
  assert.equal(full.tasks.length,101);
});

test('invalid calendar dates and unbounded metadata are sanitized', () => {
  const value = task({ dueDate:'2026-02-30', project:'x'.repeat(80), tags:'a,a, b, c, d,e,f', estimate:999 });
  assert.equal(value.dueDate,'');
  assert.equal(value.project.length,40);
  assert.equal(value.tags.length,5);
  assert.equal(value.estimate,1);
});

test('planning and search combine project, tag, due-date and priority filters', () => {
  const state = createState(FRIDAY);
  state.tasks = [
    task({ id:'a', project:'Work', tags:['writing'], dueDate:'2026-10-30', priority:'low' }),
    task({ id:'b', project:'Work', tags:['writing'], dueDate:'2026-10-28', priority:'high' }),
    task({ id:'c', project:'Home', dueDate:'2026-10-30' }),
    task({ id:'d', project:'Work', tags:['writing'], dueDate:'2026-11-01' }),
  ];
  assert.deepEqual(filteredTasks(state,{ project:'Work', query:'WRITING', date:'2026-10-30' }).map(t=>t.id),['b','a']);
});

test('a running session preserves its task and project after the task is removed', () => {
  const state = createState(FRIDAY);
  state.tasks.push(task({ project:'Study', tags:['book'] }));
  state.activeTask = 'task-1';
  start(state,FRIDAY);
  state.tasks = [];
  const restored = restoreState(state,FRIDAY + 1000);
  tick(restored,FRIDAY + 1500_000);
  assert.equal(restored.history[0].task,'Read');
  assert.equal(restored.history[0].project,'Study');
  assert.deepEqual(restored.history[0].tags,['book']);
  assert.equal(projectStats(restored,FRIDAY + 1500_000)[0].minutes,25);
});

test('CSV preserves Unicode and quoting and neutralizes spreadsheet formulas', () => {
  const state = createState(FRIDAY);
  state.history.push({ id:'a', endedAt:FRIDAY, seconds:1500, task:'=HYPERLINK("bad")', project:'Учёба', tags:['a,b'] });
  const csv = exportCSV(state);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"Учёба"'));
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));
  assert.ok(csv.includes('"a,b"'));
});

test('daily notes preserve their full text during migration', () => {
  const original = createState(FRIDAY);
  original.notes = { '2026-10-30':'hello', '2026-02-30':'invalid', '2026-10-29':'x'.repeat(5000) };
  const restored = restoreState(original,FRIDAY);
  assert.equal(restored.notes['2026-10-30'],'hello');
  assert.equal(restored.notes['2026-02-30'],undefined);
  assert.equal(restored.notes['2026-10-29'].length,5000);
});

test('trash keeps a full independent snapshot and preserves a running session', () => {
  const state = createState(FRIDAY);
  const original = task({ text:'Не потерять 🌿',project:'Учёба',tags:['важное'],priority:'high',dueDate:'2026-10-30',repeat:'daily',estimate:3,description:'Подробности',extra:{ nested:'keep' } });
  state.tasks.push(original); state.activeTask = original.id; start(state,FRIDAY);
  assert.equal(trashTasks(state,[original.id],FRIDAY+1000).length,1);
  assert.equal(state.tasks.length,0); assert.equal(state.activeTask,null);
  assert.equal(state.trash[0].deletedAt,FRIDAY+1000);
  assert.deepEqual(state.trash[0].task,original);
  original.extra.nested = 'changed'; original.tags.push('changed');
  assert.equal(state.trash[0].task.extra.nested,'keep');
  assert.deepEqual(state.trash[0].task.tags,['важное']);
  tick(state,FRIDAY+1500_000);
  assert.equal(state.history[0].task,'Не потерять 🌿');
  assert.equal(state.history[0].project,'Учёба');
});
test('deleted tasks survive an encoded backup round-trip and restore every field', () => {
  const state = createState(FRIDAY);
  const original = task({ project:'Work',tags:['a','b'],dueDate:'2026-10-30',repeat:'weekly',priority:'high',estimate:4,description:'Keep this too' });
  state.tasks.push(original); trashTasks(state,[original.id],FRIDAY);
  const restored = restoreState(decodeDocument(encodeDocument(state,1)).state,FRIDAY);
  assert.equal(restored.trash.length,1);
  assert.deepEqual(restoreTasks(restored,[original.id],FRIDAY+1000),[original]);
  assert.deepEqual(restored.tasks,[original]); assert.equal(restored.trash.length,0);
  assert.equal(restored.activeTask,null);
});
test('bulk cleanup and restore do not change completed totals or history', () => {
  const state = createState(FRIDAY);
  state.tasks = [task({ id:'a' }),task({ id:'b' }),task({ id:'open' })];
  completeTask(state,'a',FRIDAY); completeTask(state,'b',FRIDAY);
  const before = structuredClone(state.completedTasks);
  assert.equal(trashTasks(state,['a','b','a','missing'],FRIDAY).length,2);
  assert.deepEqual(state.tasks.map(item=>item.id),['open']);
  assert.equal(todayStats(state,FRIDAY).tasks,2);
  assert.deepEqual(state.completedTasks,before);
  assert.equal(restoreTasks(state,['b','a','missing'],FRIDAY).length,2);
  assert.equal(todayStats(state,FRIDAY).tasks,2);
  assert.equal(restoreTasks(state,['a'],FRIDAY).length,0);
  assert.equal(state.tasks.length,3);
  assert.deepEqual(state.completedTasks,before);
});
test('undoing completion cannot recreate a recurring occurrence that is in the trash', () => {
  const state = createState(FRIDAY);
  state.tasks.push(task({ repeat:'daily',dueDate:'2026-10-30' }));
  const next = completeTask(state,'task-1',FRIDAY);
  trashTasks(state,[next.id],FRIDAY);
  completeTask(state,'task-1',FRIDAY);
  assert.equal(completeTask(state,'task-1',FRIDAY),null);
  assert.equal(state.tasks.length,1); assert.equal(state.trash.length,1);
  restoreTasks(state,[next.id],FRIDAY);
  assert.equal(state.tasks.length,2); assert.equal(state.trash.length,0);
});
test('restore conflicts fail before any task is moved or overwritten', () => {
  const state = createState(FRIDAY);
  state.tasks = [task({ id:'a' }),task({ id:'b' })];
  trashTasks(state,['a','b'],FRIDAY);
  state.tasks.push(task({ id:'b',text:'Existing task' }));
  const before = structuredClone(state);
  assert.throws(()=>restoreTasks(state,['a','b'],FRIDAY),/TASK_ID_CONFLICT/);
  assert.deepEqual(state,before);
});
test('older backups without trash still restore normally', () => {
  const state = createState(FRIDAY); delete state.trash; state.version = 1;
  state.tasks.push(task());
  const restored = restoreState(decodeDocument(JSON.stringify(state)).state,FRIDAY);
  assert.deepEqual(restored.trash,[]); assert.equal(restored.tasks.length,1);
});
