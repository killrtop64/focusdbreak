export const DEFAULT_SETTINGS = Object.freeze({
  focus: 25, short: 5, long: 15, goal: 4, sound: true, language: 'ru',
});
export const STORAGE_KEY = 'focus-break:v1';
export const MODES = ['focus', 'short', 'long'];

export function createState(now = Date.now()) {
  return {
    version: 1, settings: { ...DEFAULT_SETTINGS }, tasks: [], history: [], completedTasks: [],
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
    const task = state.tasks.find(item => item.id === state.activeTask);
    state.history.push({
      id: 'session-' + state.timer.endAt + '-' + state.cycle,
      endedAt: state.timer.endAt,
      seconds: state.timer.total,
      task: task?.text || '',
    });
    state.history = state.history.slice(-2000);
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
  const state = createState(now);
  if (!input || input.version !== 1) return state;
  const settings = input.settings || {};
  state.settings = {
    focus: int(settings.focus, 25, 1, 120),
    short: int(settings.short, 5, 1, 30),
    long: int(settings.long, 15, 1, 60),
    goal: int(settings.goal, 4, 1, 12),
    sound: typeof settings.sound === 'boolean' ? settings.sound : true,
    language: settings.language === 'en' ? 'en' : 'ru',
  };
  state.tasks = (Array.isArray(input.tasks) ? input.tasks : [])
    .filter(item => item && typeof item.id === 'string' && typeof item.text === 'string')
    .slice(0, 100).map(item => ({
      id: item.id.slice(0, 100),
      text: item.text.slice(0, 180),
      completedAt: timestamp(item.completedAt) ? item.completedAt : null,
    }));
  state.completedTasks = (Array.isArray(input.completedTasks) ? input.completedTasks : state.tasks)
    .filter(item => item && typeof item.id === 'string' && timestamp(item.completedAt))
    .slice(-2000).map(item => ({ id:item.id.slice(0, 100), completedAt:item.completedAt }));
  state.history = (Array.isArray(input.history) ? input.history : [])
    .filter(item => item && typeof item.id === 'string' && timestamp(item.endedAt) &&
      Number.isInteger(item.seconds) && item.seconds > 0 && item.seconds <= 7200)
    .slice(-2000).map(item => ({
      id: item.id.slice(0, 100), endedAt: item.endedAt, seconds: item.seconds,
      task: typeof item.task === 'string' ? item.task.slice(0, 180) : '',
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
    mode, total, remaining: left, running,
    started:timer.started === true || running || left < total,
    endAt: running ? timer.endAt : null,
  };
  state.updatedAt = Number.isFinite(input.updatedAt) ? input.updatedAt : now;
  return state;
}
