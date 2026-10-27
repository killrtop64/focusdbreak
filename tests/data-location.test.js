import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import path from 'node:path';
import { createState, normalizeTask, trashTasks } from '../src/core.js';
const require = createRequire(import.meta.url);
const { resolveDataLocation,prepareDataDirectory,configureDataLocation,dataLocationErrorMessage } = require('../desktop/data-location.cjs');
const { createFileStateStore } = require('../desktop/state-store.cjs');
function select(env = {},extra = {}) {
  return resolveDataLocation({ env,platform:'win32',isPackaged:true,getDefaultDirectory:()=>String.raw`C:\Users\Example\AppData\Roaming\Focus Break`,...extra });
}
function fixture(t) {
  const parent = path.resolve('artifacts','location-tests'); fs.mkdirSync(parent,{ recursive:true });
  const root = fs.mkdtempSync(path.join(parent,'case-'));
  t.after(()=>{
    const actual = fs.realpathSync(root), boundary = fs.realpathSync(parent);
    assert.ok(actual.startsWith(boundary + path.sep)); fs.rmSync(actual,{ recursive:true });
  });
  return root;
}
test('installed apps keep the existing profile and may use Windows autostart', () => {
  const selected = select();
  assert.equal(selected.mode,'profile');
  assert.equal(selected.directory,String.raw`C:\Users\Example\AppData\Roaming\Focus Break`);
  assert.equal(selected.canAutoStart,true);
});
test('portable selection uses the wrapper EXE directory, never its temp extraction or profile', () => {
  const selected = select({ PORTABLE_EXECUTABLE_DIR:String.raw`D:\Мои программы\Focus Break`,TEMP:String.raw`C:\Temp` },{
    getDefaultDirectory:()=>{ throw new Error('The profile must not be queried'); },
  });
  assert.equal(selected.mode,'portable');
  assert.equal(selected.directory,String.raw`D:\Мои программы\Focus Break\Focus Break Data`);
  assert.equal(selected.canAutoStart,false);
  assert.equal(select({ PORTABLE_EXECUTABLE_DIR:'D:\\' }).directory,String.raw`D:\Focus Break Data`);
});
test('renaming or updating a portable launcher keeps the same data folder', () => {
  const before = select({ PORTABLE_EXECUTABLE_DIR:String.raw`D:\Apps`,PORTABLE_EXECUTABLE_FILE:String.raw`D:\Apps\Focus-Break-2.0.0.exe` });
  const after = select({ PORTABLE_EXECUTABLE_DIR:String.raw`D:\Apps`,PORTABLE_EXECUTABLE_FILE:String.raw`D:\Apps\Мой таймер 2.1.exe` });
  assert.deepEqual(before,after);
});
test('UNC portable paths are accepted without contacting the network during selection', () => {
  const selected = select({ PORTABLE_EXECUTABLE_DIR:String.raw`\\server\share\Приложения` });
  assert.equal(selected.directory,String.raw`\\server\share\Приложения\Focus Break Data`);
});
test('an explicit test/custom directory wins and cannot modify autostart', () => {
  const selected = select({ FOCUS_BREAK_DATA_DIR:String.raw`D:\Isolated data`,PORTABLE_EXECUTABLE_DIR:String.raw`E:\Apps` });
  assert.equal(selected.mode,'custom'); assert.equal(selected.directory,String.raw`D:\Isolated data`);
  assert.equal(selected.canAutoStart,false);
});
test('development and non-Windows runs ignore inherited portable-wrapper variables', () => {
  assert.equal(select({ PORTABLE_EXECUTABLE_DIR:String.raw`D:\Apps` },{ isPackaged:false }).mode,'profile');
  const selected = select({ PORTABLE_EXECUTABLE_DIR:String.raw`D:\Apps` },{ platform:'linux',getDefaultDirectory:()=>'/tmp/focus-test-profile' });
  assert.equal(selected.mode,'profile'); assert.equal(selected.directory,'/tmp/focus-test-profile');
  assert.equal(selected.canAutoStart,false);
});
test('invalid paths fail instead of silently switching storage', () => {
  assert.throws(()=>prepareDataDirectory('relative'),{ code:'INVALID_DATA_PATH' });
  for (const directory of ['relative','D:relative','\\root-relative','/root-relative','   ','D:\\bad\0name']) {
    let queried = false;
    assert.throws(()=>select({ PORTABLE_EXECUTABLE_DIR:directory },{ getDefaultDirectory:()=>{ queried = true; return 'C:\\profile'; } }),{ code:'INVALID_PORTABLE_PATH' });
    assert.equal(queried,false);
    assert.throws(()=>select({ FOCUS_BREAK_DATA_DIR:directory }),{ code:'INVALID_DATA_PATH' });
  }
});
test('directory preparation probes write/flush/rename, preserves existing data and removes probes', t => {
  const root = fixture(t), directory = path.join(root,'Папка с пробелами'); fs.mkdirSync(directory);
  const original = Buffer.from([0xff,0x7b,0x00]); fs.writeFileSync(path.join(directory,'focus-break.json'),original);
  prepareDataDirectory(directory);
  assert.deepEqual(fs.readFileSync(path.join(directory,'focus-break.json')),original);
  assert.deepEqual(fs.readdirSync(directory).sort(),['Chromium','Crashpad','focus-break.json','logs'].sort());
});
test('disk, permission and rename errors preserve existing state and clean only owned probes', t => {
  const root = fixture(t);
  for (const [method,code] of [['openSync','EACCES'],['writeFileSync','ENOSPC'],['fsyncSync','ENOSPC'],['renameSync','EPERM']]) {
    const directory = path.join(root,method); fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory,'focus-break.json'),'original bytes');
    const io = { ...fs,[method]:()=>{ throw Object.assign(new Error(code),{ code }); } };
    assert.throws(()=>prepareDataDirectory(directory,io),error=>error.code === 'DATA_DIRECTORY_UNAVAILABLE' && error.cause.code === code);
    assert.equal(fs.readFileSync(path.join(directory,'focus-break.json'),'utf8'),'original bytes');
    assert.deepEqual(fs.readdirSync(directory),['focus-break.json']);
  }
});
test('a file in place of the data folder is never replaced', t => {
  const root = fixture(t), directory = path.join(root,'Focus Break Data');
  fs.writeFileSync(directory,'keep this file');
  assert.throws(()=>prepareDataDirectory(directory),{ code:'DATA_DIRECTORY_UNAVAILABLE' });
  assert.equal(fs.readFileSync(directory,'utf8'),'keep this file');
});
test('configuration redirects custom runtime files before use, but leaves a normal profile untouched', t => {
  const root = fixture(t), directory = path.join(root,'Isolated data'), calls = [];
  const app = {
    isPackaged:true,getPath:()=>{ throw new Error('No profile lookup'); },
    setPath:(name,value)=>{ assert.equal(fs.statSync(value).isDirectory(),true); calls.push([name,value]); },
    setAppLogsPath:value=>{ assert.equal(fs.statSync(value).isDirectory(),true); calls.push(['logs',value]); },
  };
  const selected = configureDataLocation(app,{ env:{ FOCUS_BREAK_DATA_DIR:directory } });
  assert.equal(selected.mode,'custom');
  assert.deepEqual(Object.fromEntries(calls),{
    userData:directory,sessionData:path.join(directory,'Chromium'),logs:path.join(directory,'logs'),crashDumps:path.join(directory,'Crashpad'),
  });
  calls.length = 0; app.getPath = ()=>directory;
  const profile = configureDataLocation(app,{ env:{} });
  assert.equal(profile.mode,'profile'); assert.deepEqual(calls,[]);
});
test('configuration aborts before redirecting Electron when the chosen folder is unwritable', t => {
  const root = fixture(t), directory = path.join(root,'Unavailable'); let redirected = false;
  const app = { isPackaged:true,getPath:()=>{ throw new Error('No fallback'); },setPath:()=>{ redirected = true; } };
  assert.throws(()=>configureDataLocation(app,{
    env:{ FOCUS_BREAK_DATA_DIR:directory },io:{ ...fs,openSync:()=>{ throw Object.assign(new Error('Denied'),{ code:'EACCES' }); } },
  }),{ code:'DATA_DIRECTORY_UNAVAILABLE' });
  assert.equal(redirected,false);
  const message = dataLocationErrorMessage({ directory,code:'DATA_DIRECTORY_UNAVAILABLE',cause:{ code:'EACCES' } });
  assert.ok(message.includes(directory)); assert.ok(message.includes('EACCES')); assert.ok(message.includes('No alternate storage'));
});
test('moving a closed app directory preserves tasks, trash, notes and backups', async t => {
  const root = fixture(t), original = path.join(root,'Original portable folder'), moved = path.join(root,'Новая папка');
  const directory = path.join(original,'Focus Break Data'); prepareDataDirectory(directory);
  fs.writeFileSync(path.join(original,'Example launcher.exe'),'test fixture');
  const value = createState(); value.tasks.push(normalizeTask({ id:'keep',text:'Перенести 🌿',project:'Учёба' }));
  value.notes['2026-10-27'] = 'Сохранить заметку';
  let store = await createFileStateStore(directory); await store.load(); await store.save(JSON.stringify(value));
  trashTasks(value,['keep']); await store.save(JSON.stringify(value)); await store.flush();
  const resolvedOriginal = fs.realpathSync(original), boundary = fs.realpathSync(root);
  assert.ok(resolvedOriginal.startsWith(boundary + path.sep));
  assert.ok(path.resolve(moved).startsWith(boundary + path.sep));
  fs.renameSync(resolvedOriginal,moved);
  store = await createFileStateStore(path.join(moved,'Focus Break Data'));
  const report = await store.load();
  assert.equal(report.kind,'ready'); assert.equal(report.state.trash[0].task.text,'Перенести 🌿');
  assert.equal(report.state.notes['2026-10-27'],'Сохранить заметку');
  assert.equal(fs.existsSync(path.join(moved,'Focus Break Data','focus-break.last-good.json')),true);
  assert.equal(fs.existsSync(path.join(moved,'Example launcher.exe')),true);
  assert.equal(fs.existsSync(original),false);
});
