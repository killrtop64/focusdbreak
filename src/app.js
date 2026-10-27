import {
  createState, duration, localDate, pause, remaining, restoreState, start, STORAGE_KEY,
  switchMode, tick, todayStats, weekStats, normalizeTask, completeTask, filteredTasks, projectStats, exportCSV, trashTasks, restoreTasks,
} from './core.js';
import { translations } from './i18n.js';
import { extra } from './features-i18n.js';
import './features.css';
import { platform, loadNativeState, persistNativeState, replaceStoredState, recoverStoredState, flushStorage, syncNative, setupNative, requestNotifications, notifyBrowser, exportFile, setCompact, setPinned, openDataDirectory } from './platform.js';
import { decodeDocument, stringifyState, MAX_STATE_BYTES } from '../shared/state-codec.js';
Object.assign(translations.ru, extra.ru);
Object.assign(translations.en, extra.en);

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const paths = {
  focus:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3"/>',
  chart:'<path d="M4 4v16h17M8 15v-4m5 4V7m5 8v-7"/>',
  leaf:'<path d="M20 3C9 2 3 6 4 13c1 6 7 8 12 3 3-3 3-8 4-13ZM5 19 16 8"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
  settings:'<path d="m9 3-1 3-3 1-2 4 2 3v4l4 2 3-1 3 1 4-2v-4l2-3-2-4-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',
  volume:'<path d="M11 4 6 8H3v8h3l5 4V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted:'<path d="M11 4 6 8H3v8h3l5 4V4Zm5 5 5 6m0-6-5 6"/>',
  maximize:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  minimize:'<path d="M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5"/>',
  reset:'<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  play:'<path d="m8 4 12 8-12 8V4Z" fill="currentColor" stroke="none"/>',
  pause:'<path d="M7 5v14M17 5v14" stroke-width="4"/>',
  skip:'<path d="m5 5 10 7-10 7V5Zm13 0v14"/>',
  flag:'<path d="M5 21V3m0 0c5-4 9 4 15 0v11c-6 4-10-4-15 0"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  flame:'<path d="M13 2c1 6-4 6-2 10 2 2 4-1 4-4 8 7 4 14-3 14S2 14 7 8c-1 4 2 5 3 3-2-4 2-5 3-9Z"/>',
  check:'<path d="m5 12 4 4L20 5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  spark:'<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload:'<path d="M12 15V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.01"/>',
  heart:'<path d="M20 5c-3-3-7-1-8 2-1-3-5-5-8-2s-1 7 8 15C21 12 23 8 20 5Z"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  eye:'<path d="M2 12S6 5 12 5s10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  walk:'<circle cx="14" cy="4" r="2"/><path d="m7 21 4-8 5 3v5M7 12l2-5 4 2 3 4h4M10 18l-5 3"/>',
  posture:'<path d="M8 3v8a3 3 0 0 0 3 3h8v7M4 8v10h11M6 18v3"/>',
  cup:'<path d="M4 8h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Zm13 1h2a3 3 0 0 1 0 6h-2M7 3v2m4-2v2m4-2v2"/>',
  wifi:'<path d="M3 8a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0m-9 4a5 5 0 0 1 6 0m-3 4h.01"/>',
  code:'<path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 11h18m-13 4h2m4 0h2"/>',
  pencil:'<path d="m4 16-1 5 5-1L21 7l-4-4L4 16Zm10-10 4 4"/>',
  pin:'<path d="m16 3 5 5-3 1-4 5v4l-3-3-6 6m6-6-5-5h4l5-4 1-3Z"/>',
  filter:'<path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z"/>',
  trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
};
function icon(name) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || paths.focus) + '</svg>';
}
function renderIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(element => { element.innerHTML = icon(element.dataset.icon); });
}

let storageReport;
try {
  storageReport = await loadNativeState();
} catch { storageReport = { kind:'recovery',reason:'READ_ERROR',rawOriginal:null,backupAvailable:false }; }
let storageProblem = storageReport.kind === 'recovery' ? storageReport : null;
let state = restoreState(storageReport.state);
let pendingWrites = 0;
let view = 'focus';
let audio;
let toastTimeout;
let currentDay = localDate();
let previousSeconds;
let editingTask = null;
const viewTitle = next => t(next === 'focus' ? 'focus' : next === 'insights' ? 'insights' : next === 'plan' ? 'dayPlan' : 'breakGuide');
const t = (key, replacements = {}) => {
  let result = translations[state.settings.language][key] || translations.en[key] || key;
  for (const [name, value] of Object.entries(replacements)) result = result.replaceAll('{' + name + '}', value);
  return result;
};
const locale = () => state.settings.language === 'ru' ? 'ru-RU' : 'en-GB';
const formatDate = (time, options) => new Intl.DateTimeFormat(locale(), options).format(time);
const hasProgress = () => state.timer.started || state.timer.running || state.timer.remaining < state.timer.total;

function toast(message, action) {
  $('#toast').textContent = message;
  if (action) {
    const button = element('button','toast-action',action.label);
    button.type = 'button';
    button.addEventListener('click',action.run,{ once:true });
    $('#toast').append(button);
  }
  $('#toast').hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { $('#toast').hidden = true; }, 5500);
}

function save() {
  if (storageProblem) return;
  state.updatedAt = Date.now();
  let snapshot, startedWrite = false;
  try {
    snapshot = stringifyState(state);
    pendingWrites++;
    startedWrite = true;
    persistNativeState(snapshot)
      .catch(error => showStorageProblem({ kind:'saveError',reason:error.code || 'WRITE_ERROR',rawOriginal:JSON.stringify(state),backupAvailable:false }))
      .finally(()=>{ pendingWrites--; });
  } catch (error) {
    if (startedWrite) pendingWrites--;
    showStorageProblem({ kind:'saveError',reason:error.code || 'WRITE_ERROR',rawOriginal:JSON.stringify(state),backupAvailable:false });
  }
  syncNative(state, t(state.timer.mode === 'focus' ? 'focusComplete' : 'restComplete'), viewTitle('focus')).catch(() => {});
}

function showStorageProblem(problem) {
  storageProblem = problem;
  const reasonKey = 'storageReason' + problem.reason;
  $('#recovery-reason').textContent = t(reasonKey) === reasonKey ? t('storageReasonWRITE_ERROR') : t(reasonKey);
  $('#recover-backup').disabled = !problem.backupAvailable;
  $('#recover-backup').textContent = t(problem.reason === 'UNSAVED_CHANGES' ? 'recoverDraft' : 'recoverBackup');
  $('#export-recovery').disabled = typeof problem.rawOriginal !== 'string';
  if (!$('#recovery-dialog').open) $('#recovery-dialog').showModal();
}
function clearStorageProblem(next) {
  state = restoreState(next);
  storageProblem = null;
  $('#recovery-dialog').close();
  render();
  syncNative(state,t(state.timer.mode === 'focus' ? 'focusComplete' : 'restComplete'),viewTitle('focus')).catch(()=>{});
}

function unlockAudio() {
  if (!state.settings.sound) return;
  try {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    audio ||= new Context();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
  } catch { /* Audio is optional. */ }
}

function chime() {
  if (!state.settings.sound || !audio || audio.state !== 'running') return;
  const time = audio.currentTime;
  [523.25, 659.25, 783.99].forEach((frequency, index) => {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    gain.gain.setValueAtTime(0, time + index * 0.15);
    gain.gain.linearRampToValueAtTime(0.055, time + index * 0.15 + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, time + index * 0.15 + 0.8);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(time + index * 0.15);
    oscillator.stop(time + index * 0.15 + 0.85);
  });
}

function translate() {
  document.documentElement.lang = state.settings.language;
  $$('[data-i18n]').forEach(element => { element.innerHTML = t(element.dataset.i18n); });
  $$('[data-i18n-aria]').forEach(element => { element.setAttribute('aria-label', t(element.dataset.i18nAria)); });
  $$('[data-i18n-placeholder]').forEach(element => { element.placeholder = t(element.dataset.i18nPlaceholder); });
  $('#language-toggle').textContent = state.settings.language === 'ru' ? 'EN' : 'RU';
  $('#language-toggle').setAttribute('aria-label', state.settings.language === 'ru' ? 'Switch to English' : 'Переключить на русский');
  $('#date-label').textContent = formatDate(Date.now(), { weekday:'short', day:'numeric', month:'short' });
  $('#breadcrumb-current').textContent = viewTitle(view);
  $('#export-data').setAttribute('aria-label', t('export'));
}

function renderSound() {
  $('#sound-toggle').innerHTML = icon(state.settings.sound ? 'volume' : 'muted');
  $('#sound-toggle').setAttribute('aria-label', t(state.settings.sound ? 'mute' : 'unmute'));
  $('#sound-toggle').setAttribute('aria-pressed', String(state.settings.sound));
  $('#sound-toggle').title = t(state.settings.sound ? 'soundOn' : 'soundOff');
}

function renderTimer(force = false) {
  const seconds = remaining(state);
  const mode = state.timer.mode;
  if (seconds === previousSeconds && !force) return;
  if (seconds !== previousSeconds || force) {
    const minutesText = String(Math.floor(seconds / 60)).padStart(2, '0');
    const secondsText = String(seconds % 60).padStart(2, '0');
    $('#timer-value').innerHTML = minutesText + '<span>:</span>' + secondsText;
    $('#timer-value').setAttribute('aria-label', t('timeAria', { m:Math.floor(seconds / 60), s:seconds % 60 }));
    $('#ring-progress').style.strokeDashoffset = String(100 * (1 - seconds / state.timer.total));
    document.title = (hasProgress() ? minutesText + ':' + secondsText + ' · ' : '') + t(mode === 'focus' ? 'focus' : mode === 'short' ? 'shortBreak' : 'longBreak') + ' — Focus Break';
    previousSeconds = seconds;
  }
  $('#timer-state').textContent = t(state.timer.running ? 'running' : hasProgress() ? 'paused' : 'ready');
  $('#timer-kicker').textContent = t(mode + 'Kicker');
  $('#timer-caption').textContent = t(mode + 'Caption');
  const label = state.timer.running ? 'pause' : hasProgress() ? 'resume' : mode === 'focus' ? 'startFocus' : 'startRest';
  $('#start-label').textContent = t(label);
  $('#start-timer [data-icon]').innerHTML = icon(state.timer.running ? 'pause' : 'play');
  $$('.mode-tabs button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
  $('#cycle-dots').innerHTML = Array.from({ length:4 }, (_, index) =>
    '<i class="' + (index < state.cycle % 4 ? 'filled' : index === state.cycle % 4 ? 'current' : '') + '"></i>').join('');
  $('#cycle-label').textContent = t('cycle', { n:state.cycle % 4 + 1 });
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function taskRow(task, planner = false) {
    const item = element('li', 'task-item' + (task.completedAt ? ' done' : '') + (task.id === state.activeTask ? ' selected' : ''));
    const check = element('button', 'task-check');
    check.type = 'button';
    check.setAttribute('aria-label', t(task.completedAt ? 'reopenTask' : 'completeTask') + ': ' + task.text);
    check.setAttribute('aria-pressed', String(Boolean(task.completedAt)));
    if (task.completedAt) check.innerHTML = icon('check');
    check.addEventListener('click', () => {
      const next = completeTask(state, task.id);
      save(); renderTasks(); renderStats();
      if (next) toast(t('recurringCreated', { date:next.dueDate }));
    });
    const select = element('button', planner ? 'plan-task-select' : 'task-select', task.text);
    select.type = 'button';
    select.setAttribute('aria-label', t('selectTask') + task.text);
    select.setAttribute('aria-pressed', String(task.id === state.activeTask));
    select.disabled = Boolean(task.completedAt);
    select.addEventListener('click', () => {
      state.activeTask = state.activeTask === task.id ? null : task.id;
      if (state.timer.started && state.timer.mode === 'focus') {
        state.timer.taskSnapshot = state.activeTask ? { text:task.text, project:task.project, tags:task.tags } : null;
      }
      save(); renderTasks();
      if (planner) showView('focus');
    });
    const remove = element('button', 'task-delete');
    remove.type = 'button';
    remove.innerHTML = icon('close');
    remove.setAttribute('aria-label', t('deleteTask') + ': ' + task.text);
    remove.addEventListener('click', () => {
      moveToTrash([task.id]);
    });
    const content = element('div', 'task-content');
    const badges = element('div', 'task-badges');
    if (task.project) badges.append(element('span', 'task-project', task.project));
    if (task.priority === 'high') badges.append(element('span', 'priority-high', t('priorityHigh')));
    if (task.dueDate) badges.append(element('span', task.dueDate < localDate() && !task.completedAt ? 'overdue' : '', task.dueDate));
    if (task.repeat && task.repeat !== 'none') badges.append(element('span', '', '↻ ' + t('repeat' + task.repeat[0].toUpperCase() + task.repeat.slice(1))));
    if (task.estimate > 1) badges.append(element('span', '', '◷ × ' + task.estimate));
    for (const tag of task.tags || []) badges.append(element('span', 'task-tag', '#' + tag));
    content.append(select, badges);
    const edit = element('button', 'task-edit');
    edit.type = 'button'; edit.innerHTML = icon('pencil');
    edit.setAttribute('aria-label', t('editTask') + ': ' + task.text);
    edit.addEventListener('click', () => openTask(task.id));
    item.append(check, content, edit, remove);
    return item;
}

function renderTasks() {
  const list = $('#task-list');
  list.replaceChildren();
  const query = $('#task-search').value;
  const project = $('#project-filter').value;
  const sorted = filteredTasks(state, { query, project });
  for (const task of sorted) list.append(taskRow(task));
  $('#empty-tasks').hidden = state.tasks.length > 0;
  if (!sorted.length && state.tasks.length) list.append(element('li', 'filter-empty', t('noMatches')));
  $('#task-count').textContent = String(state.tasks.filter(task => !task.completedAt).length);
  $('#clear-completed').hidden = !state.tasks.some(task => task.completedAt);
  const active = state.tasks.find(task => task.id === state.activeTask);
  $('#current-task-label').textContent = state.timer.started && state.timer.taskSnapshot
    ? state.timer.taskSnapshot.text : active ? active.text : t('chooseTask');
  const projects = [...new Set(state.tasks.map(task => task.project).filter(Boolean))].sort();
  const selected = $('#project-filter').value;
  $('#project-filter').replaceChildren();
  const all = element('option', '', t('allProjects')); all.value = '';
  $('#project-filter').append(all);
  $('#project-options').replaceChildren();
  projects.forEach(name => {
    const option = element('option', '', name); option.value = name;
    $('#project-filter').append(option);
    const suggestion = element('option'); suggestion.value = name; $('#project-options').append(suggestion);
  });
  $('#project-filter').value = projects.includes(selected) ? selected : '';
  renderPlanner();
  renderTrash();
}

function renderTrash() {
  $('#trash-count').textContent = String(state.trash.length);
  if (!$('#trash-dialog').open) return;
  const query = $('#trash-search').value.toLocaleLowerCase().trim();
  const entries = [...state.trash].sort((a,b)=>b.deletedAt-a.deletedAt);
  const shown = entries.filter(({ task })=>[task.text,task.project,...(task.tags || [])].join(' ').toLocaleLowerCase().includes(query));
  $('#trash-summary').textContent = t('trashSummary',{ n:entries.length });
  $('#trash-empty').hidden = shown.length > 0;
  $('#trash-empty').textContent = t(entries.length ? 'trashNoMatches' : 'trashEmpty');
  $('#restore-all').disabled = !entries.length;
  $('#trash-list').replaceChildren();
  for (const { task,deletedAt } of shown) {
    const item = element('li','trash-item');
    const content = element('div','trash-content');
    content.append(element('h3','trash-title',task.text));
    content.append(element('p','trash-meta',t('deletedOn',{ date:formatDate(deletedAt,{ day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit' }) })));
    const badges = element('div','task-badges');
    if (task.project) badges.append(element('span','task-project',task.project));
    badges.append(element('span','',t(task.completedAt ? 'trashCompleted' : 'trashUnfinished')));
    if (task.dueDate) badges.append(element('span','',task.dueDate));
    for (const tag of task.tags || []) badges.append(element('span','task-tag','#' + tag));
    content.append(badges);
    const restore = element('button','quiet-button trash-restore',t('restoreTask'));
    restore.type = 'button';
    restore.setAttribute('aria-label',t('restoreTask') + ': ' + task.text);
    restore.addEventListener('click',()=>recoverTasks([task.id]));
    item.append(content,restore);
    $('#trash-list').append(item);
  }
}
function moveToTrash(ids) {
  if (storageProblem) return;
  const moved = trashTasks(state,ids);
  if (!moved.length) return;
  save(); renderTasks(); renderStats();
  if (!storageProblem) toast(t('movedToTrash',{ n:moved.length }),{
    label:t('undoDelete'),run:()=>recoverTasks(moved.map(task=>task.id)),
  });
}
function recoverTasks(ids) {
  if (storageProblem) return;
  try {
    const restored = restoreTasks(state,ids);
    if (!restored.length) return;
    save(); renderTasks(); renderStats();
    if (!storageProblem) toast(t('tasksRestored',{ n:restored.length }));
  } catch { toast(t('restoreConflict')); }
}

function renderStats() {
  const stats = todayStats(state);
  $('#today-minutes').replaceChildren(document.createTextNode(stats.minutes + ' '), element('small', '', t('minutes')));
  $('#today-sessions').textContent = String(stats.sessions);
  $('#today-tasks').textContent = String(stats.tasks);
  $('#goal-label').textContent = stats.sessions + ' / ' + state.settings.goal;
  $('#goal-progress').style.width = Math.min(100, stats.sessions / state.settings.goal * 100) + '%';
  $('#goal-message').textContent = t(stats.sessions >= state.settings.goal ? 'goalDone' : stats.sessions ? 'goalProgress' : 'goalBegin');
  renderInsights();
}

function renderInsights() {
  const week = weekStats(state);
  const minutes = week.reduce((sum, day) => sum + day.minutes, 0);
  const sessions = week.reduce((sum, day) => sum + day.sessions, 0);
  const days = week.filter(day => day.sessions).length;
  $('#insight-stats').replaceChildren();
  for (const [label, value, detail] of [
    ['weekFocus', minutes + ' ' + t('minutes'), 'lastSevenLabel'],
    ['weekSessions', sessions, 'lastSevenLabel'],
    ['weekDays', days, 'dayUnit'],
  ]) {
    const card = element('div', 'insight-stat');
    card.append(element('span', '', t(label)), element('strong', '', value), element('small', '', t(detail)));
    $('#insight-stats').append(card);
  }
  const maximum = Math.max(...week.map(day => day.minutes), state.settings.focus);
  const chart = $('#week-chart');
  chart.replaceChildren();
  const descriptions = [];
  week.forEach(day => {
    const column = element('div', 'chart-day' + (!day.minutes ? ' zero' : ''));
    const bar = element('div', 'chart-bar');
    bar.style.height = day.minutes ? (day.minutes / maximum * 83) + '%' : '4px';
    const description = t('chartDay', { day:day.date, minutes:day.minutes });
    column.title = description;
    descriptions.push(description);
    column.append(element('span', 'chart-value', day.minutes), bar, element('span', 'chart-label', formatDate(day.timestamp, { weekday:'short' })));
    chart.append(column);
  });
  chart.setAttribute('aria-label', t('chartAria') + descriptions.join('; '));
  const history = $('#session-history');
  history.replaceChildren();
  if (!state.history.length) history.append(element('p', 'history-empty', t('noHistory')));
  for (const session of state.history.slice(-10).reverse()) {
    const row = element('div', 'history-row');
    const badge = element('span', 'history-icon');
    badge.innerHTML = icon('check');
    const detail = element('div');
    detail.append(element('strong', '', session.task || t('untitledSession')), element('p', '', formatDate(session.endedAt, { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })));
    row.append(badge, detail, element('span', 'history-minutes', Math.floor(session.seconds / 60) + ' ' + t('minutes')));
    history.append(row);
  }
  const report = $('#project-report');
  report.replaceChildren();
  const projects = projectStats(state);
  if (!projects.length) report.append(element('p', 'history-empty', t('noProjectsYet')));
  const maximumProject = Math.max(1, ...projects.map(item => item.minutes));
  projects.forEach(item => {
    const row = element('div', 'project-report-row');
    const label = element('div', 'section-heading');
    label.append(element('span', '', item.project || t('noProject')), element('strong', '', item.minutes + ' ' + t('minutes')));
    const track = element('div', 'goal-track');
    const bar = element('div'); bar.style.width = (item.minutes / maximumProject * 100) + '%';
    track.append(bar); row.append(label, track); report.append(row);
  });
}

function renderPlanner() {
  const date = $('#plan-date').value || localDate();
  const tasks = filteredTasks(state, { date });
  $('#plan-list').replaceChildren(...tasks.map(task => taskRow(task, true)));
  $('#plan-empty').hidden = tasks.length > 0;
  $('#plan-summary').textContent = t('planSummary', { n:tasks.filter(task => !task.completedAt).length });
  if (document.activeElement !== $('#day-note')) $('#day-note').value = state.notes[date] || '';
  $('#note-count').textContent = $('#day-note').value.length + ' / 3000';
}
function openTask(id = null, dueDate = '') {
  editingTask = id;
  const task = state.tasks.find(item => item.id === id) || normalizeTask({ id:'new', text:$('#task-input').value, dueDate });
  const form = $('#task-details-form');
  for (const name of ['text','project','priority','dueDate','repeat','estimate']) form.elements[name].value = task[name];
  form.elements.tags.value = (task.tags || []).join(', ');
  $('#task-dialog').showModal();
  form.elements.text.focus();
}

function renderGuide() {
  const grid = $('#guide-grid');
  grid.replaceChildren();
  ['Eye', 'Move', 'Posture', 'Away'].forEach((name, index) => {
    const card = element('article', 'guide-card');
    const badge = element('span', 'guide-icon');
    badge.innerHTML = icon(['eye', 'walk', 'posture', 'cup'][index]);
    card.append(badge, element('span', 'guide-number', '0' + (index + 1)), element('h2', '', t('guide' + name + 'Title')),
      element('p', '', t('guide' + name + 'Description')), element('small', '', t('guide' + name + 'Time')));
    grid.append(card);
  });
}

function render() {
  translate(); renderSound(); renderTimer(true); renderTasks(); renderStats(); renderGuide();
  if (platform.desktop) {
    const storage = platform.storage;
    $('#storage-mode').textContent = t('storageMode' + (storage?.mode || 'unknown'));
    $('#data-directory').value = storage?.directory || '';
    $('#open-data-directory').disabled = !storage?.directory;
    $('#portable-storage-hint').hidden = storage?.mode !== 'portable';
    $('#settings-form').elements.startAtLogin.disabled = !storage?.canAutoStart;
    $('#startup-hint').textContent = t(storage?.canAutoStart ? 'startupHint' : 'startupUnavailable');
  }
}

function showView(next) {
  view = next;
  $$('.view').forEach(section => { section.hidden = section.id !== 'view-' + next; });
  $$('[data-view]').forEach(button => {
    button.classList.toggle('active', button.dataset.view === next);
    if (button.dataset.view === next) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  $('#breadcrumb-current').textContent = viewTitle(next);
  if (next !== 'focus') setZen(false);
}

function setZen(enabled) {
  if (!enabled && document.body.classList.contains('compact')) {
    document.body.classList.remove('compact');
    $('#compact-toggle').setAttribute('aria-pressed', 'false');
    Promise.resolve(setCompact(false)).catch(() => {});
  }
  if (enabled) showView('focus');
  document.body.classList.toggle('zen', enabled);
  $('#zen-exit').hidden = !enabled;
}

function complete(result) {
  if (!result) return;
  save(); render();
  if (!platform.native || !state.settings.notifications) chime();
  notifyBrowser(state.settings.notifications, t(result.mode === 'focus' ? 'focusComplete' : 'restComplete'));
  toast(t(result.mode === 'focus' ? 'focusComplete' : 'restComplete'));
}

function toggleTimer() {
  unlockAudio();
  const result = tick(state);
  if (result) { complete(result); return; }
  if (state.timer.running) pause(state); else start(state);
  save(); renderTimer(true);
}

$$('[data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
$$('[data-mode]').forEach(button => button.addEventListener('click', () => {
  if (state.timer.mode === button.dataset.mode) return;
  if (hasProgress() && !confirm(t('modeConfirm'))) return;
  switchMode(state, button.dataset.mode); save(); renderTimer(true);
}));
$('#start-timer').addEventListener('click', toggleTimer);
$('#reset-timer').addEventListener('click', () => {
  if (hasProgress() && !confirm(t('resetConfirm'))) return;
  switchMode(state, state.timer.mode); save(); renderTimer(true);
});
$('#skip-timer').addEventListener('click', () => {
  if (!confirm(t('skipConfirm'))) return;
  switchMode(state, state.timer.mode === 'focus' ? 'short' : 'focus');
  save(); renderTimer(true); toast(t('skipped'));
});
$('#task-form').addEventListener('submit', event => {
  event.preventDefault();
  const text = $('#task-input').value.trim();
  if (!text) return;
  const task = normalizeTask({ id:crypto.randomUUID(), text });
  state.tasks.push(task);
  if (!state.activeTask) state.activeTask = task.id;
  $('#task-input').value = '';
  save(); renderTasks();
  $('#task-input').focus();
});
$('#clear-completed').addEventListener('click', () => {
  moveToTrash(state.tasks.filter(task=>task.completedAt).map(task=>task.id));
});
$('#open-trash').addEventListener('click',()=>{
  $('#trash-search').value = ''; $('#trash-dialog').showModal(); renderTrash(); $('#trash-search').focus();
});
$('#trash-dialog').addEventListener('close',()=>$('#trash-list').replaceChildren());
$('#trash-search').addEventListener('input',renderTrash);
$('#restore-all').addEventListener('click',()=>recoverTasks(state.trash.map(entry=>entry.task.id)));
$('#add-detailed').addEventListener('click', () => openTask());
$('#plan-add').addEventListener('click', () => openTask(null, $('#plan-date').value));
$('#filter-toggle').addEventListener('click', () => {
  const panel = $('#task-filters');
  panel.hidden = !panel.hidden;
  $('#filter-toggle').setAttribute('aria-expanded', String(!panel.hidden));
  if (!panel.hidden) $('#task-search').focus();
  else { $('#task-search').value = ''; $('#project-filter').value = ''; renderTasks(); }
});
$('#task-search').addEventListener('input', renderTasks);
$('#project-filter').addEventListener('change', renderTasks);
$('#plan-date').addEventListener('change', renderPlanner);
$('#plan-today').addEventListener('click', () => { $('#plan-date').value = localDate(); renderPlanner(); });
$('#day-note').addEventListener('input', () => {
  const date = $('#plan-date').value || localDate();
  state.notes[date] = $('#day-note').value;
  $('#note-count').textContent = $('#day-note').value.length + ' / 3000';
  save();
});
$('#task-details-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  const text = form.elements.text.value.trim();
  if (!text) { form.elements.text.focus(); return; }
  const existing = state.tasks.find(task => task.id === editingTask);
  const task = normalizeTask({
    ...existing, id:existing?.id || crypto.randomUUID(), text,
    project:form.elements.project.value, priority:form.elements.priority.value,
    dueDate:form.elements.dueDate.value, repeat:form.elements.repeat.value,
    tags:form.elements.tags.value, estimate:Number(form.elements.estimate.value),
  });
  if (existing) state.tasks = state.tasks.map(item => item.id === existing.id ? task : item);
  else state.tasks.push(task);
  if (!state.activeTask && !task.completedAt) state.activeTask = task.id;
  $('#task-input').value = '';
  save(); renderTasks(); $('#task-dialog').close(); toast(t('taskSaved'));
});
$('#export-csv').addEventListener('click', () => {
  exportFile('focus-break-history-' + localDate() + '.csv', exportCSV(state), 'text/csv;charset=utf-8')
    .then(saved => { if (saved) toast(t('csvDone')); }).catch(() => toast(t('exportFailed')));
});
$('#compact-toggle').addEventListener('click', async () => {
  const enabled = $('#compact-toggle').getAttribute('aria-pressed') !== 'true';
  await setCompact(enabled);
  $('#compact-toggle').setAttribute('aria-pressed', String(enabled));
  document.body.classList.toggle('compact', enabled);
  setZen(enabled);
});
$('#pin-toggle').addEventListener('click', async () => {
  const enabled = $('#pin-toggle').getAttribute('aria-pressed') !== 'true';
  const actual = await setPinned(enabled);
  $('#pin-toggle').setAttribute('aria-pressed', String(Boolean(actual)));
});
$('#language-toggle').addEventListener('click', () => {
  state.settings.language = state.settings.language === 'ru' ? 'en' : 'ru';
  save(); render();
});
$('#sound-toggle').addEventListener('click', () => {
  state.settings.sound = !state.settings.sound;
  unlockAudio(); save(); renderSound();
  toast(t(state.settings.sound ? 'soundOn' : 'soundOff'));
});
$('#zen-toggle').addEventListener('click', () => setZen(true));
$('#zen-exit').addEventListener('click', () => setZen(false));
$('#open-guide').addEventListener('click', () => showView('guide'));
$('#start-break').addEventListener('click', () => {
  if (hasProgress() && !confirm(t('modeConfirm'))) return;
  unlockAudio(); switchMode(state, 'short'); start(state); save(); showView('focus'); renderTimer(true);
});

$('#open-settings').addEventListener('click', () => {
  const form = $('#settings-form');
  for (const name of ['focus', 'short', 'long', 'goal']) form.elements[name].value = state.settings[name];
  form.elements.sound.checked = state.settings.sound;
  for (const name of ['notifications','closeToTray','startAtLogin']) form.elements[name].checked = state.settings[name];
  if (!platform.storage?.canAutoStart) form.elements.startAtLogin.checked = false;
  $('#settings-dialog').showModal();
});
$('#settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const idle = !hasProgress();
  for (const name of ['focus', 'short', 'long', 'goal']) state.settings[name] = Number(form.elements[name].value);
  state.settings.sound = form.elements.sound.checked;
  if (form.elements.notifications.checked && !state.settings.notifications) {
    state.settings.notifications = await requestNotifications().catch(() => false);
    if (!state.settings.notifications) toast(t('notificationDenied'));
  } else state.settings.notifications = form.elements.notifications.checked;
  state.settings.closeToTray = form.elements.closeToTray.checked;
  state.settings.startAtLogin = Boolean(platform.storage?.canAutoStart && form.elements.startAtLogin.checked);
  if (idle) switchMode(state, state.timer.mode);
  unlockAudio(); save(); render(); $('#settings-dialog').close(); toast(t('settingsSaved'));
});
$('#open-data-directory').addEventListener('click',async () => {
  try { if (!await openDataDirectory()) toast(t('openDirectoryFailed')); }
  catch { toast(t('openDirectoryFailed')); }
});
$$('.dialog-close').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
$$('dialog').forEach(dialog => dialog.addEventListener('click', event => {
  if (event.target !== dialog || dialog.id === 'recovery-dialog') return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
}));
$('#about-button').addEventListener('click', () => $('#about-dialog').showModal());

$('#export-data').addEventListener('click', () => {
  exportFile('focus-break-' + localDate() + '.json', JSON.stringify(state), 'application/json')
    .then(saved => { if (saved) toast(t('exportDone')); }).catch(() => toast(t('exportFailed')));
});
$('#import-data').addEventListener('click', () => $('#import-file').click());
async function importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > MAX_STATE_BYTES) throw Object.assign(new Error('File too large'),{ code:'TOO_LARGE' });
    const data = decodeDocument(await file.text()).state;
    if (!confirm(t('importConfirm'))) return;
    const imported = restoreState(data);
    // A backup restores data, never a running timer.
    imported.timer.remaining = remaining(imported);
    imported.timer.running = false; imported.timer.endAt = null;
    if (imported.timer.remaining === 0) switchMode(imported, imported.timer.mode);
    await replaceStoredState(stringifyState(imported),'import');
    clearStorageProblem(imported);
    $('#settings-dialog').close();
    toast(t('importDone'));
  } catch (error) { toast(t(error.code === 'TOO_LARGE' ? 'backupTooLarge' : 'importFailed')); }
  finally { event.target.value = ''; }
}
$('#import-file').addEventListener('change',importBackup);
$('#recovery-file').addEventListener('change',importBackup);
$('#clear-data').addEventListener('click', async () => {
  if (!confirm(t('clearConfirm'))) return;
  const language = state.settings.language;
  const empty = createState();
  empty.settings.language = language;
  try {
    await replaceStoredState(stringifyState(empty),'reset');
    clearStorageProblem(empty);
    $('#settings-dialog').close(); toast(t('cleared'));
  } catch (error) { toast(t('nativeSaveError')); }
});
$('#recovery-dialog').addEventListener('cancel',event=>event.preventDefault());
$('#recover-backup').addEventListener('click',async () => {
  try { const result = await recoverStoredState(); clearStorageProblem(result.state); toast(t('importDone')); }
  catch { toast(t('recoveryFailed')); }
});
$('#export-recovery').addEventListener('click',() => {
  exportFile('focus-break-recovery-' + localDate() + '.json',storageProblem.rawOriginal,'application/json')
    .catch(()=>toast(t('exportFailed')));
});
$('#recovery-import').addEventListener('click',()=>$('#recovery-file').click());
$('#retry-storage').addEventListener('click',async () => {
  try {
    if (storageProblem.kind === 'saveError') {
      await persistNativeState(stringifyState(state));
      storageProblem = null; $('#recovery-dialog').close(); return;
    }
    const result = await loadNativeState();
    if (result.kind === 'recovery') showStorageProblem(result);
    else clearStorageProblem(result.state);
  } catch { toast(t('recoveryFailed')); }
});

document.addEventListener('keydown', event => {
  if ($('dialog[open]')) return;
  const editing = event.target.closest('input, textarea, select, [contenteditable="true"]');
  if (editing || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
  if (event.key === 'Escape') { setZen(false); return; }
  if (event.code === 'Space' && !event.target.closest('button, a, summary')) {
    event.preventDefault(); showView('focus'); toggleTimer();
  }
  if (['1','2','3','4'].includes(event.key)) showView(['focus','insights','guide','plan'][Number(event.key)-1]);
});

window.addEventListener('storage', async event => {
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  if (pendingWrites || storageProblem) return;
  try {
    const result = await loadNativeState({ ignorePending:true });
    if (pendingWrites) return;
    if (result.kind === 'recovery') showStorageProblem(result);
    else { state = restoreState(result.state); render(); }
  } catch { /* Ignore corrupt data from another tab. */ }
});

function heartbeat() {
  if (storageProblem) return;
  const result = tick(state);
  if (result) complete(result);
  else renderTimer();
  if (currentDay !== localDate()) {
    currentDay = localDate(); renderStats();
    $('#date-label').textContent = formatDate(Date.now(), { weekday:'short', day:'numeric', month:'short' });
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) heartbeat(); });
window.addEventListener('pageshow', heartbeat);

$('#plan-date').value = localDate();
renderIcons();
const recovered = storageProblem ? null : tick(state);
if (recovered) save();
render();
$$('.desktop-only').forEach(button => { button.hidden = !platform.desktop; });
$('#desktop-settings').hidden = !platform.desktop;
$('#android-notice').hidden = !platform.android;
setupNative(action => {
  if (storageProblem) return action === 'back' ? true : undefined;
  if (action === 'toggle') toggleTimer();
  if (action === 'resume') heartbeat();
  if (action === 'back') {
    const dialog = $('dialog[open]');
    if (dialog) { if (dialog.id !== 'recovery-dialog') dialog.close(); return true; }
    if (document.body.classList.contains('zen')) { setZen(false); return true; }
    if (view !== 'focus') { showView('focus'); return true; }
    return false;
  }
},async () => {
  if (storageProblem) throw new Error('Storage is not writable');
  await flushStorage();
}).catch(() => {});
if (!storageProblem) syncNative(state, t(state.timer.mode === 'focus' ? 'focusComplete' : 'restComplete'), t('focus')).catch(() => {});
if (recovered) toast(t('resumeRecovered'));
if (storageProblem) showStorageProblem(storageProblem);
setInterval(heartbeat, 250);
if (!platform.native && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  const registerOffline = () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* The online app still works. */ });
  };
  if (document.readyState === 'complete') registerOffline();
  else window.addEventListener('load',registerOffline,{ once:true });
}
