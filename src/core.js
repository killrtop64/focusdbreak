export const DEFAULT_SETTINGS = Object.freeze({
  focus:25, short:5, long:15, goal:4, sound:true, language:'ru',
  notifications:false, closeToTray:true, startAtLogin:false,
});
export const STORAGE_KEY = 'focus-break:v1';
export const MODES = ['focus', 'short', 'long'];

export function createState(now = Date.now()) {
  return {
    version:2, settings:{ ...DEFAULT_SETTINGS }, tasks:[], history:[], completedTasks:[], notes:{}, trash:[],
    activeTask: null, cycle: 0,
    timer: { mode: 'focus', running: false, started: false, remaining: 1500, total: 1500, endAt: null },
    updatedAt: now,
  };
}

export function duration(state, mode = state.timer.mode) {
  return state.settings[mode] * 60;
}

export function remaining(state, now = Date.now()) {
  return state.timer.running
    ? Math.max(0, Math.ceil((state.timer.endAt - now) / 1000))
    : state.timer.remaining;
}

export function switchMode(state, mode, now = Date.now()) {
  if (!MODES.includes(mode)) return;
  const seconds = duration(state, mode);
  state.timer = { mode, running: false, started: false, remaining: seconds, total: seconds, endAt: null };
  state.updatedAt = now;
}

export function start(state, now = Date.now()) {
  if (state.timer.running) return;
  if (!state.timer.started && state.timer.mode === 'focus') {
    const task = state.tasks.find(item => item.id === state.activeTask);
    state.timer.taskSnapshot = task ? { text:task.text, project:task.project || '', tags:task.tags || [] } : null;
  }
  state.timer.running = true;
  state.timer.started = true;
  state.timer.endAt = now + state.timer.remaining * 1000;
  state.updatedAt = now;
}

export function pause(state, now = Date.now()) {
  if (!state.timer.running) return null;
  const completed = tick(state, now);
  if (completed) return completed;
  state.timer.remaining = remaining(state, now);
  state.timer.running = false;
  state.timer.endAt = null;
  state.updatedAt = now;
  return null;
}

export function tick(state, now = Date.now()) {
  if (!state.timer.running || state.timer.endAt > now) return null;
  const completed = { mode: state.timer.mode, endedAt: state.timer.endAt };
  if (state.timer.mode === 'focus') {
    const task = state.timer.taskSnapshot || state.tasks.find(item => item.id === state.activeTask);
    state.history.push({
      id: 'session-' + state.timer.endAt + '-' + state.cycle,
      endedAt: state.timer.endAt,
      seconds: state.timer.total,
      task: task?.text || '',
      project:task?.project || '', tags:task?.tags || [],
    });
    state.cycle += 1;
    switchMode(state, state.cycle % 4 === 0 ? 'long' : 'short', now);
  } else {
    switchMode(state, 'focus', now);
  }
  state.updatedAt = now;
  return completed;
}

export function localDate(timestamp = Date.now()) {
  const date = new Date(timestamp);
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') +
    '-' + String(date.getDate()).padStart(2, '0');
}

export function todayStats(state, now = Date.now()) {
  const day = localDate(now);
  const sessions = state.history.filter(item => localDate(item.endedAt) === day);
  return {
    sessions: sessions.length,
    minutes: Math.floor(sessions.reduce((sum, item) => sum + item.seconds, 0) / 60),
    tasks: state.completedTasks.filter(item => localDate(item.completedAt) === day).length,
  };
}

export function weekStats(state, now = Date.now()) {
  const days = [];
  for (let index = 6; index >= 0; index -= 1) {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - index);
    const key = localDate(date);
    const sessions = state.history.filter(item => localDate(item.endedAt) === key);
    days.push({
      date: key,
      timestamp: date.getTime(),
      minutes: Math.floor(sessions.reduce((sum, item) => sum + item.seconds, 0) / 60),
      sessions: sessions.length,
    });
  }
  return days;
}

function int(value, fallback, min, max) {
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

function timestamp(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 8.64e15;
}

export function restoreState(input, now = Date.now()) {
  if (!input || ![1,2].includes(input.version)) return createState(now);
  const state = { ...input, ...createState(now) };
  const settings = input.settings || {};
  state.settings = {
    ...settings,
    focus: int(settings.focus, 25, 1, 120),
    short: int(settings.short, 5, 1, 30),
    long: int(settings.long, 15, 1, 60),
    goal: int(settings.goal, 4, 1, 12),
    sound: typeof settings.sound === 'boolean' ? settings.sound : true,
    language: settings.language === 'en' ? 'en' : 'ru',
    notifications:settings.notifications === true,
    closeToTray:settings.closeToTray !== false,
    startAtLogin:settings.startAtLogin === true,
  };
  state.tasks = (Array.isArray(input.tasks) ? input.tasks : [])
    .filter(item => item && typeof item.id === 'string' && typeof item.text === 'string')
    .map(item => normalizeTask(item,{ preserve:true }));
  state.trash = (Array.isArray(input.trash) ? input.trash : []).map(entry => ({
    ...entry, task:normalizeTask(entry.task,{ preserve:true }), deletedAt:entry.deletedAt,
  }));
  state.completedTasks = (Array.isArray(input.completedTasks) ? input.completedTasks : state.tasks)
    .filter(item => item && typeof item.id === 'string' && timestamp(item.completedAt))
    .map(item => ({ ...item, id:item.id, completedAt:item.completedAt }));
  state.history = (Array.isArray(input.history) ? input.history : [])
    .filter(item => item && typeof item.id === 'string' && timestamp(item.endedAt) &&
      Number.isInteger(item.seconds) && item.seconds > 0 && item.seconds <= 7200)
    .map(item => ({
      ...item, id:item.id, endedAt: item.endedAt, seconds: item.seconds,
      task: typeof item.task === 'string' ? item.task : '',
      project:typeof item.project === 'string' ? item.project : '',
      tags:normalizeTags(item.tags,true),
    }));
  state.activeTask = state.tasks.some(item => item.id === input.activeTask && !item.completedAt)
    ? input.activeTask : null;
  state.cycle = int(input.cycle, 0, 0, 1000000);
  const timer = input.timer || {};
  const mode = MODES.includes(timer.mode) ? timer.mode : 'focus';
  const total = int(timer.total, duration(state, mode), 60, 7200);
  const left = int(timer.remaining, total, 0, total);
  const running = timer.running === true && Number.isFinite(timer.endAt) &&
    timer.endAt > 0 && timer.endAt <= now + total * 1000;
  state.timer = {
    ...timer,
    mode, total, remaining: left, running,
    started:timer.started === true || running || left < total,
    endAt: running ? timer.endAt : null,
    taskSnapshot:timer.taskSnapshot && typeof timer.taskSnapshot.text === 'string' ? {
      ...timer.taskSnapshot,
      text:timer.taskSnapshot.text,
      project:typeof timer.taskSnapshot.project === 'string' ? timer.taskSnapshot.project : '',
      tags:normalizeTags(timer.taskSnapshot.tags,true),
    } : null,
  };
  if (input.notes && typeof input.notes === 'object' && !Array.isArray(input.notes)) {
    Object.entries(input.notes).filter(([date, note]) => validDate(date) && typeof note === 'string')
      .forEach(([date, note]) => { state.notes[date] = note; });
  }
  state.updatedAt = Number.isFinite(input.updatedAt) ? input.updatedAt : now;
  return state;
}

export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00');
  return Number.isFinite(date.getTime()) && localDate(date) === value;
}
export function normalizeTags(value, preserve = false) {
  const tags = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  if (preserve) return [...tags];
  return [...new Set(tags.filter(tag => typeof tag === 'string').map(tag => tag.trim().slice(0,24)).filter(Boolean))].slice(0,5);
}
export function normalizeTask(input, { preserve = false } = {}) {
  return {
    ...input,
    id:String(input.id),
    text:preserve ? String(input.text || '') : String(input.text || '').trim().slice(0,180),
    completedAt:timestamp(input.completedAt) ? input.completedAt : null,
    project:typeof input.project === 'string' ? preserve ? input.project : input.project.trim().slice(0,40) : '',
    tags:normalizeTags(input.tags,preserve),
    priority:['low','normal','high'].includes(input.priority) ? input.priority : 'normal',
    dueDate:validDate(input.dueDate) ? input.dueDate : '',
    repeat:['daily','weekdays','weekly'].includes(input.repeat) ? input.repeat : 'none',
    estimate:int(input.estimate,1,1,20),
    seriesId:typeof input.seriesId === 'string' ? input.seriesId : String(input.id),
  };
}
export function completeTask(state, id, now = Date.now()) {
  const task = state.tasks.find(item => item.id === id);
  if (!task) return null;
  task.completedAt = task.completedAt ? null : now;
  state.completedTasks = state.completedTasks.filter(item => item.id !== id);
  if (task.completedAt) state.completedTasks.push({ id, completedAt:now });
  if (task.completedAt && state.activeTask === id) state.activeTask = null;
  if (!task.completedAt || !task.repeat || task.repeat === 'none') return null;
  const date = new Date((task.dueDate && task.dueDate > localDate(now) ? task.dueDate : localDate(now)) + 'T12:00:00');
  date.setDate(date.getDate() + (task.repeat === 'weekly' ? 7 : 1));
  while (task.repeat === 'weekdays' && [0,6].includes(date.getDay())) date.setDate(date.getDate() + 1);
  const dueDate = localDate(date);
  const seriesId = task.seriesId || task.id;
  const occurrenceExists = item => (item.seriesId || item.id) === seriesId && item.dueDate === dueDate;
  if (state.tasks.some(occurrenceExists) || (state.trash || []).some(entry => occurrenceExists(entry.task))) return null;
  const next = normalizeTask({ ...task, id:seriesId + ':' + dueDate, dueDate, completedAt:null, seriesId },{ preserve:true });
  state.tasks.push(next);
  return next;
}
export function trashTasks(state, ids, now = Date.now()) {
  const selected = new Set(ids);
  const moved = state.tasks.filter(task => selected.has(task.id));
  if (!moved.length) return [];
  const existing = new Set((state.trash || []).map(entry => entry.task.id));
  if (moved.some(task => existing.has(task.id))) throw new Error('TASK_ID_CONFLICT');
  const entries = moved.map(task => ({ task:structuredClone(task),deletedAt:now }));
  state.trash ||= [];
  state.trash.push(...entries);
  state.tasks = state.tasks.filter(task => !selected.has(task.id));
  if (selected.has(state.activeTask)) state.activeTask = null;
  state.updatedAt = now;
  return moved;
}
export function restoreTasks(state, ids, now = Date.now()) {
  const selected = new Set(ids);
  const entries = (state.trash || []).filter(entry => selected.has(entry.task.id));
  if (!entries.length) return [];
  const existing = new Set(state.tasks.map(task => task.id));
  if (entries.some(entry => existing.has(entry.task.id))) throw new Error('TASK_ID_CONFLICT');
  const restored = entries.map(entry => structuredClone(entry.task));
  state.tasks.push(...restored);
  state.trash = state.trash.filter(entry => !selected.has(entry.task.id));
  state.updatedAt = now;
  return restored;
}
export function filteredTasks(state, { query='', project='', date='' } = {}) {
  const ranks = { high:0, normal:1, low:2 };
  return state.tasks.filter(task => {
    if (project && task.project !== project) return false;
    if (date && (!task.dueDate || task.dueDate > date)) return false;
    const text = [task.text, task.project, ...(task.tags || [])].join(' ').toLocaleLowerCase();
    return text.includes(query.toLocaleLowerCase().trim());
  }).sort((a,b) => Number(Boolean(a.completedAt)) - Number(Boolean(b.completedAt)) ||
    (ranks[a.priority] ?? 1) - (ranks[b.priority] ?? 1) ||
    (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
}
export function projectStats(state, now = Date.now()) {
  const since = new Date(now);
  since.setHours(0,0,0,0); since.setDate(since.getDate() - 6);
  const values = new Map();
  state.history.filter(session => session.endedAt >= since.getTime() && session.endedAt <= now)
    .forEach(session => values.set(session.project || '', (values.get(session.project || '') || 0) + session.seconds));
  return [...values].map(([project, seconds]) => ({ project, minutes:Math.floor(seconds / 60) })).sort((a,b) => b.minutes - a.minutes);
}
export function exportCSV(state) {
  const cell = value => {
    let text = String(value ?? '');
    if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"','""') + '"';
  };
  return '\uFEFF' + [['date','minutes','project','task','tags'], ...state.history.map(item => [
    new Date(item.endedAt).toISOString(), item.seconds / 60, item.project || '', item.task, (item.tags || []).join(', '),
  ])].map(row => row.map(cell).join(',')).join('\r\n');
}
