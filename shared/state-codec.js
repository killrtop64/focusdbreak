export const MAX_STATE_BYTES = 5_000_000;
export const STORAGE_FORMAT = 'focus-break-journal';
const encoder = new TextEncoder();
const table = Uint32Array.from({ length:256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
export class StateError extends Error {
  constructor(code, details = []) {
    super(code);
    this.name = 'StateError'; this.code = code; this.details = details;
  }
}
export function checksum(text) {
  let value = 0xffffffff;
  for (const byte of encoder.encode(text)) value = table[(value ^ byte) & 255] ^ (value >>> 8);
  return ((value ^ 0xffffffff) >>> 0).toString(16).padStart(8,'0');
}
export function stringifyState(state) {
  const raw = JSON.stringify(state);
  checkSize(raw);
  return raw;
}
function checkSize(raw) {
  if (typeof raw !== 'string') throw new StateError('INVALID_DATA');
  if (encoder.encode(raw).byteLength > MAX_STATE_BYTES) throw new StateError('TOO_LARGE');
}
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const time = value => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 8.64e15;
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T12:00:00');
  return Number.isFinite(parsed.getTime()) &&
    parsed.getFullYear() === Number(value.slice(0,4)) &&
    parsed.getMonth() + 1 === Number(value.slice(5,7)) &&
    parsed.getDate() === Number(value.slice(8,10));
}
function checkTask(item, location, issues) {
  if (!object(item) || typeof item.id !== 'string' || !item.id.length || typeof item.text !== 'string' || !item.text.trim()) {
    issues.push(location); return;
  }
  if (item.completedAt !== undefined && item.completedAt !== null && !time(item.completedAt)) issues.push(location + '.completedAt');
  if (item.project !== undefined && typeof item.project !== 'string') issues.push(location + '.project');
  if (item.tags !== undefined && (!Array.isArray(item.tags) || item.tags.some(tag=>typeof tag !== 'string'))) issues.push(location + '.tags');
  if (item.priority !== undefined && !['high','normal','low'].includes(item.priority)) issues.push(location + '.priority');
  if (item.repeat !== undefined && !['none','daily','weekdays','weekly'].includes(item.repeat)) issues.push(location + '.repeat');
  if (item.dueDate !== undefined && item.dueDate !== '' && !date(item.dueDate)) issues.push(location + '.dueDate');
  if (item.estimate !== undefined && (!Number.isInteger(item.estimate) || item.estimate < 1 || item.estimate > 20)) issues.push(location + '.estimate');
}
export function validateState(value) {
  if (!object(value)) throw new StateError('INVALID_DATA',['root']);
  if (![1,2].includes(value.version)) throw new StateError('UNSUPPORTED_VERSION');
  const issues = [];
  if (!object(value.settings)) issues.push('settings');
  if (!Array.isArray(value.tasks)) issues.push('tasks');
  if (!Array.isArray(value.history)) issues.push('history');
  const settings = value.settings || {};
  for (const [key,max] of [['focus',120],['short',30],['long',60],['goal',12]]) {
    if (settings[key] !== undefined && (!Number.isInteger(settings[key]) || settings[key] < 1 || settings[key] > max)) issues.push('settings.' + key);
  }
  if (settings.language !== undefined && !['ru','en'].includes(settings.language)) issues.push('settings.language');
  for (const key of ['sound','notifications','closeToTray','startAtLogin']) {
    if (settings[key] !== undefined && typeof settings[key] !== 'boolean') issues.push('settings.' + key);
  }
  for (const collection of ['tasks','history','completedTasks']) {
    if (value[collection] === undefined && collection === 'completedTasks') continue;
    if (!Array.isArray(value[collection])) { if (collection === 'completedTasks') issues.push(collection); continue; }
    const ids = new Set();
    value[collection].forEach((item,index) => {
      const location = collection + '[' + index + ']';
      if (!object(item) || typeof item.id !== 'string' || !item.id.length) { issues.push(location); return; }
      if (ids.has(item.id)) issues.push(location + '.duplicateId');
      ids.add(item.id);
      if (collection === 'tasks') {
        checkTask(item,location,issues);
      } else if (collection === 'history') {
        if (!time(item.endedAt) || !Number.isInteger(item.seconds) || item.seconds < 1 || item.seconds > 7200) issues.push(location);
        for (const key of ['task','project']) if (item[key] !== undefined && typeof item[key] !== 'string') issues.push(location + '.' + key);
        if (item.tags !== undefined && (!Array.isArray(item.tags) || item.tags.some(tag=>typeof tag !== 'string'))) issues.push(location + '.tags');
      } else if (!time(item.completedAt)) issues.push(location + '.completedAt');
    });
  }
  if (value.trash !== undefined) {
    if (!Array.isArray(value.trash)) issues.push('trash');
    else {
      const ids = new Set((Array.isArray(value.tasks) ? value.tasks : []).map(task=>task?.id));
      value.trash.forEach((entry,index)=>{
        const location = 'trash[' + index + ']';
        if (!object(entry)) { issues.push(location); return; }
        if (!time(entry.deletedAt)) issues.push(location + '.deletedAt');
        checkTask(entry.task,location + '.task',issues);
        if (entry.task?.id) {
          if (ids.has(entry.task.id)) issues.push(location + '.duplicateId');
          ids.add(entry.task.id);
        }
      });
    }
  }
  if (value.notes !== undefined) {
    if (!object(value.notes)) issues.push('notes');
    else for (const [key,note] of Object.entries(value.notes)) if (!date(key) || typeof note !== 'string') issues.push('notes.' + key);
  }
  if (value.timer !== undefined) {
    const timer = value.timer;
    if (!object(timer)) issues.push('timer');
    else {
      if (timer.mode !== undefined && !['focus','short','long'].includes(timer.mode)) issues.push('timer.mode');
      for (const key of ['running','started']) if (timer[key] !== undefined && typeof timer[key] !== 'boolean') issues.push('timer.' + key);
      if (timer.total !== undefined && (!Number.isInteger(timer.total) || timer.total < 60 || timer.total > 7200)) issues.push('timer.total');
      if (timer.remaining !== undefined && (!Number.isInteger(timer.remaining) || timer.remaining < 0 || timer.remaining > (timer.total || 7200))) issues.push('timer.remaining');
      if (timer.running && !time(timer.endAt)) issues.push('timer.endAt');
      if (timer.taskSnapshot !== undefined && timer.taskSnapshot !== null) {
        if (!object(timer.taskSnapshot) || typeof timer.taskSnapshot.text !== 'string') issues.push('timer.taskSnapshot');
        else {
          if (timer.taskSnapshot.project !== undefined && typeof timer.taskSnapshot.project !== 'string') issues.push('timer.taskSnapshot.project');
          if (timer.taskSnapshot.tags !== undefined && (!Array.isArray(timer.taskSnapshot.tags) || timer.taskSnapshot.tags.some(tag=>typeof tag !== 'string'))) issues.push('timer.taskSnapshot.tags');
        }
      }
    }
  }
  if (issues.length) throw new StateError('INVALID_DATA',issues);
  return value;
}
export function decodeDocument(raw) {
  checkSize(raw);
  let data;
  try { data = JSON.parse(raw); } catch { throw new StateError('CORRUPT_JSON'); }
  if (data?.format === STORAGE_FORMAT) {
    if (data.storageVersion !== 1) throw new StateError('UNSUPPORTED_VERSION');
    if (!Number.isSafeInteger(data.sequence) || data.sequence < 1) throw new StateError('INVALID_DATA');
    if (checksum(JSON.stringify(data.payload)) !== data.checksum) throw new StateError('CHECKSUM_MISMATCH');
    return { state:validateState(data.payload), sequence:data.sequence, legacy:false };
  }
  return { state:validateState(data), sequence:0, legacy:true };
}
export function encodeDocument(state, sequence) {
  validateState(state);
  const payload = JSON.stringify(state);
  return stringifyState({
    format:STORAGE_FORMAT, storageVersion:1, sequence, checksum:checksum(payload), payload:state,
  });
}
