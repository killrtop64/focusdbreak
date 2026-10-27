import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, writeFile, readdir, rm, realpath, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createState, restoreState, normalizeTask, trashTasks } from '../src/core.js';
import { checksum, decodeDocument, encodeDocument, MAX_STATE_BYTES } from '../shared/state-codec.js';
import { createStateJournal } from '../shared/state-journal.js';
const { createFileStateStore } = createRequire(import.meta.url)('../desktop/state-store.cjs');
const NOW = new Date(2026,9,27,12).getTime();
function state(text = 'Сохранить 🌿') {
  const value = createState(NOW);
  value.tasks.push(normalizeTask({ id:'task-1',text }));
  return value;
}
function memory(initial = {}) {
  const data = new Map(Object.entries(initial)), archives = [], writes = [];
  const adapter = {
    fail:null,
    async read(key) { if (adapter.fail === 'read') throw new Error('EACCES'); return data.get(key) ?? null; },
    async write(key,raw) {
      if (adapter.fail === key) throw Object.assign(new Error('disk full'),{ code:'ENOSPC' });
      writes.push(key); data.set(key,raw);
    },
    async remove(key) { data.delete(key); },
    async archive(key,raw,reason) {
      if (adapter.fail === 'archive') throw new Error('backup failed');
      archives.push({ key,raw,reason });
    },
  };
  return { data,archives,writes,adapter, journal:createStateJournal(adapter) };
}
test('checksummed Unicode documents round-trip; a changed payload is rejected', () => {
  assert.equal(checksum('123456789'),'cbf43926');
  const value = state();
  const raw = encodeDocument(value,1);
  assert.deepEqual(decodeDocument(raw).state,value);
  assert.equal(decodeDocument(JSON.stringify(value)).legacy,true);
  assert.throws(()=>decodeDocument(raw.replace('Сохранить','Удалить')),{ code:'CHECKSUM_MISMATCH' });
});
test('invalid JSON, future versions, duplicate IDs, invalid dates and timer values fail before restore', () => {
  assert.throws(()=>decodeDocument('{broken'),{ code:'CORRUPT_JSON' });
  for (const change of [
    value=>{ value.tasks.push(value.tasks[0]); },
    value=>{ value.tasks[0].dueDate = '2026-02-30'; },
    value=>{ value.tasks[0].dueDate = 0; },
    value=>{ value.history.push({ id:'h',endedAt:NOW,seconds:9999 }); },
    value=>{ value.timer.total = -1; },
    value=>{ value.notes.invalid = 'keep the original'; },
    value=>{ value.trash = [{ task:value.tasks[0],deletedAt:NOW }]; },
    value=>{ value.trash = [{ task:{ id:'deleted',text:'Keep' },deletedAt:-1 }]; },
    value=>{ value.trash = [{ task:null,deletedAt:NOW }]; },
    value=>{ value.trash = [{ task:{ id:'deleted',text:'Keep' },deletedAt:NOW },{ task:{ id:'deleted',text:'Duplicate' },deletedAt:NOW }]; },
  ]) {
    const value = state(); change(value);
    assert.throws(()=>decodeDocument(JSON.stringify(value)),{ code:'INVALID_DATA' });
  }
  assert.throws(()=>decodeDocument(JSON.stringify({ ...state(),version:99 })),{ code:'UNSUPPORTED_VERSION' });
  assert.throws(()=>decodeDocument('x'.repeat(MAX_STATE_BYTES + 1)),{ code:'TOO_LARGE' });
});
test('validated migration preserves large collections, Unicode text and unknown record fields', () => {
  const value = state(); value.version = 1; value.futureField = { nested:'keep' };
  value.tasks = Array.from({ length:150 },(_,i)=>({ id:'t'+i,text:'🌿'.repeat(200),description:'Описание',tags:['long'.repeat(20)] }));
  value.history = Array.from({ length:2501 },(_,i)=>({ id:'h'+i,endedAt:NOW,seconds:1500,extra:'keep' }));
  value.notes = Object.fromEntries(Array.from({ length:100 },(_,i)=>{
    const day = new Date(2026,0,i+1,12);
    return [day.getFullYear()+'-'+String(day.getMonth()+1).padStart(2,'0')+'-'+String(day.getDate()).padStart(2,'0'),'x'.repeat(4000)];
  }));
  const restored = restoreState(decodeDocument(JSON.stringify(value)).state,NOW);
  assert.equal(restored.version,2);
  assert.equal(restored.tasks.length,150); assert.deepEqual(restored.tasks[0].tags,value.tasks[0].tags);
  assert.equal(restored.tasks[0].text,value.tasks[0].text); assert.equal(restored.tasks[0].description,'Описание');
  assert.equal(restored.history.length,2501); assert.equal(restored.history[0].extra,'keep');
  assert.deepEqual(restored.notes,value.notes); assert.deepEqual(restored.futureField,value.futureField);
});
test('normal commits keep a previous good snapshot and serialize overlapping writes', async () => {
  const m = memory(); assert.equal((await m.journal.load()).kind,'empty');
  await Promise.all(['first','second','third'].map(text=>m.journal.save(JSON.stringify(state(text)))));
  await m.journal.flush();
  assert.equal(decodeDocument(m.data.get('primary')).state.tasks[0].text,'third');
  assert.equal(decodeDocument(m.data.get('backup')).state.tasks[0].text,'second');
  assert.equal(decodeDocument(m.data.get('primary')).sequence,3);
  assert.equal(m.data.has('pending'),false);
  assert.equal((await createStateJournal(m.adapter).load()).kind,'ready');
});
test('legacy migration archives the exact original before its first new write', async () => {
  const original = JSON.stringify({ ...state(),version:1 },null,2);
  const m = memory({ primary:original }); await m.journal.load();
  await m.journal.save(JSON.stringify(restoreState(decodeDocument(original).state,NOW)));
  assert.deepEqual(m.archives,[{ key:'primary',raw:original,reason:'migration' }]);
  assert.equal(m.data.get('backup'),original);
  assert.equal(decodeDocument(m.data.get('primary')).legacy,false);
});
test('corrupt and future files stay untouched and read-only until explicit recovery', async () => {
  for (const original of ['{truncated',JSON.stringify({ ...state(),version:99 })]) {
    const good = encodeDocument(state('backup'),1);
    const m = memory({ primary:original,backup:good });
    const report = await m.journal.load();
    assert.equal(report.kind,'recovery'); assert.equal(report.backupAvailable,true);
    await assert.rejects(m.journal.save(JSON.stringify(state())),{ code:'READ_ONLY' });
    assert.equal(m.data.get('primary'),original); assert.deepEqual(m.writes,[]);
    assert.equal((await m.journal.recover()).state.tasks[0].text,'backup');
    assert.equal(m.archives[0].raw,original);
    assert.equal(m.data.get('primary'),good);
  }
});
test('missing primary can recover its backup; unreadable storage never creates empty data', async () => {
  const m = memory({ backup:encodeDocument(state(),1) });
  assert.equal((await m.journal.load()).reason,'MISSING_PRIMARY');
  assert.equal((await m.journal.recover()).state.tasks.length,1);
  m.adapter.fail = 'read';
  assert.equal((await m.journal.load()).reason,'READ_ERROR');
  await assert.rejects(m.journal.save(JSON.stringify(state())),{ code:'READ_ONLY' });
});
test('write failure at each commit phase leaves the original primary intact', async () => {
  for (const key of ['pending','backup','primary']) {
    const original = encodeDocument(state('old'),1);
    const m = memory({ primary:original }); await m.journal.load(); m.adapter.fail = key;
    await assert.rejects(m.journal.save(JSON.stringify(state('new'))),{ code:'ENOSPC' });
    await assert.rejects(m.journal.flush(),{ code:'ENOSPC' });
    assert.equal(m.data.get('primary'),original);
    m.adapter.fail = null;
    const restarted = createStateJournal(m.adapter), report = await restarted.load();
    if (key === 'pending') assert.equal(report.state.tasks[0].text,'old');
    else {
      assert.equal(report.reason,'UNSAVED_CHANGES');
      assert.equal((await restarted.recover()).state.tasks[0].text,'new');
    }
  }
});
test('interrupted browser draft is offered; a leftover committed pending file is harmless', async () => {
  const original = encodeDocument(state('old'),1);
  const m = memory({ primary:original,draft:JSON.stringify(state('latest')) });
  assert.equal((await m.journal.load()).candidate,'draft');
  assert.equal((await m.journal.recover()).state.tasks[0].text,'latest');
  assert.equal(m.data.has('draft'),false);
  m.data.set('pending',m.data.get('primary'));
  assert.equal((await m.journal.load()).kind,'ready');
});
test('import and reset archive old data and never replay an archived stale draft', async () => {
  for (const reason of ['import','reset']) {
    const original = encodeDocument(state('old'),1), draft = JSON.stringify(state('unsaved'));
    const m = memory({ primary:original,draft }); await m.journal.load();
    await m.journal.replace(JSON.stringify(state('replacement')),reason);
    assert.ok(m.archives.some(item=>item.raw === original && item.reason === reason));
    assert.ok(m.archives.some(item=>item.raw === draft));
    assert.equal(m.data.has('draft'),false);
    const result = await createStateJournal(m.adapter).load();
    assert.equal(result.kind,'ready'); assert.equal(result.state.tasks[0].text,'replacement');
  }
});
test('failed checkpoint, bad import and oversized import never overwrite the current data', async () => {
  const original = encodeDocument(state(),1), m = memory({ primary:original }); await m.journal.load();
  m.adapter.fail = 'archive';
  await assert.rejects(m.journal.replace(JSON.stringify(state('new'))));
  assert.equal(m.data.get('primary'),original); assert.deepEqual(m.writes,[]);
  m.adapter.fail = null;
  await assert.rejects(m.journal.replace('{broken'),{ code:'CORRUPT_JSON' });
  const huge = state(); huge.extra = 'x'.repeat(MAX_STATE_BYTES);
  await assert.rejects(m.journal.replace(JSON.stringify(huge)),{ code:'TOO_LARGE' });
  assert.equal(m.data.get('primary'),original); assert.deepEqual(m.writes,[]);
});
test('external changes cause a conflict instead of being overwritten', async () => {
  const m = memory({ primary:encodeDocument(state('original'),1) }); await m.journal.load();
  const external = encodeDocument(state('another window'),2); m.data.set('primary',external);
  await assert.rejects(m.journal.save(JSON.stringify(state('my change'))),{ code:'CONFLICT' });
  assert.equal(m.data.get('primary'),external); assert.equal(m.journal.locked,true);
});
test('the journal persists trash and rejects a malformed replacement without changing it', async () => {
  const value = state('Deleted task'); trashTasks(value,['task-1'],NOW);
  const m = memory(); await m.journal.load(); await m.journal.save(JSON.stringify(value));
  const original = m.data.get('primary');
  assert.deepEqual((await createStateJournal(m.adapter).load()).state.trash,value.trash);
  value.trash[0].task.text = '';
  await assert.rejects(m.journal.replace(JSON.stringify(value)),{ code:'INVALID_DATA' });
  assert.equal(m.data.get('primary'),original);
});
test('Windows file adapter persists across instances and archives exact damaged bytes', async t => {
  const fixtures = path.resolve('artifacts','storage-tests'); await mkdir(fixtures,{ recursive:true });
  const directory = await mkdtemp(path.join(fixtures,'case-'));
  t.after(async()=>{
    const resolved = await realpath(directory), base = await realpath(fixtures);
    assert.ok(resolved.startsWith(base + path.sep));
    await rm(resolved,{ recursive:true });
  });
  let store = await createFileStateStore(directory); await store.load();
  const first = state('first'); trashTasks(first,['task-1'],NOW);
  await store.save(JSON.stringify(first)); await store.save(JSON.stringify(state('second')));
  store = await createFileStateStore(directory);
  assert.equal((await store.load()).state.tasks[0].text,'second');
  assert.equal(decodeDocument(await readFile(path.join(directory,'focus-break.last-good.json'),'utf8')).state.trash[0].task.text,'first');
  const corrupt = Buffer.from([0xff,0x00,0x7b]);
  await writeFile(path.join(directory,'focus-break.json'),corrupt);
  store = await createFileStateStore(directory);
  assert.equal((await store.load()).kind,'recovery'); await store.recover();
  const copies = await readdir(path.join(directory,'backups'));
  assert.equal(copies.length,1);
  assert.deepEqual(await readFile(path.join(directory,'backups',copies[0])),corrupt);
  assert.equal((await createFileStateStore(directory).then(s=>s.load())).state.trash[0].task.text,'first');
  assert.equal((await readdir(directory)).some(name=>name.endsWith('.tmp')),false);
});
