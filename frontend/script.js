/* =====================================================================
   FocusFlow — script.js  (frontend <-> backend integration)
   Vanilla JavaScript only: native fetch(), async/await, no libraries.

   THE FLOW FOR EVERY ACTION
     user action -> JavaScript -> fetch() -> Express API -> PostgreSQL
       -> JSON response -> JavaScript checks response.ok -> DOM update

   The DATABASE is the source of truth. After every create / update /
   delete we ask the API for fresh data and redraw the page from it.

   CONTENTS
     1. Config, state and small helpers
     2. Toasts, loading buttons, state boxes
     3. Mobile navigation, smooth scroll, active link
     4. API layer:  apiRequest()  -> one place that talks to the backend
     5. Tasks:      loadTasks, renderTasks, createTask, updateTask, deleteTask
     6. Sessions:   loadStudySessions, renderStudySessions, create/update/delete
     7. Stats:      loadStats, updateDashboard, renderProgress
     8. Dialogs (edit forms)
     9. Focus timer (client-side) with optional "Save Study Session"
    10. FAQ, scroll reveal, start-up
   ===================================================================== */
'use strict';

document.documentElement.classList.add('js'); // tells the CSS that JavaScript is running


/* ---------------------------------------------------------------------
   1. CONFIG, STATE AND SMALL HELPERS
   --------------------------------------------------------------------- */

/* The ONLY place the backend address is written. Every request uses this variable.
   The frontend runs on http://localhost:5500 and the API on http://localhost:3000. */
const API_BASE_URL = "http://localhost:3000/api";

const REQUEST_TIMEOUT_MS = 10000; // give up if the server does not answer in 10 seconds
const WEEKLY_GOAL_HOURS = 10;

/* Everything the page shows comes from here (filled by the API) */
const state = {
  tasks: [],
  sessions: [],
  stats: null,
  filter: 'all'
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const SVG_NS = 'http://www.w3.org/2000/svg';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Create an element and (optionally) set a class and TEXT.
   textContent is used on purpose: text from the database can never be run as HTML. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* <svg><use href="#i-name"/></svg> built with DOM methods (no innerHTML) */
function createIcon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${name}`);
  svg.append(use);
  return svg;
}

/* Local date as YYYY-MM-DD (toISOString would use UTC and flip the day at the wrong hour) */
function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
const todayKey = () => dateKey(new Date());

/* "2026-10-04" -> "4 Oct 2026" (built from the parts, so no time zone shift) */
function formatDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!match) return String(value || '');
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatMinutes(minutes) {
  const total = Number(minutes) || 0;
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/* Defensive helpers: never trust the shape of data that came over the network */
const toNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const asArray = (value) => (Array.isArray(value) ? value : []);

function normalizeTask(raw) {
  if (!raw || typeof raw !== 'object' || !Number.isInteger(raw.id) || typeof raw.title !== 'string') return null;
  return {
    id: raw.id,
    title: raw.title,
    description: typeof raw.description === 'string' ? raw.description : '',
    completed: raw.completed === true
  };
}

function normalizeSession(raw) {
  if (!raw || typeof raw !== 'object' || !Number.isInteger(raw.id) || typeof raw.subject !== 'string') return null;
  return {
    id: raw.id,
    subject: raw.subject,
    duration: toNumber(raw.duration),
    study_date: typeof raw.study_date === 'string' ? raw.study_date.slice(0, 10) : ''
  };
}


/* ---------------------------------------------------------------------
   2. TOASTS, LOADING BUTTONS, STATE BOXES
   --------------------------------------------------------------------- */

/* Toast: showToast('Message', 'success' | 'info' | 'danger').  Disappears by itself. */
const TOAST_ICONS = { success: 'i-check', info: 'i-info', danger: 'i-alert' };

function showToast(message, type = 'success') {
  const region = $('#toast-region');
  if (!region) return;

  const toast = el('div', `toast toast--${type}`);
  const icon = el('span', 'toast__icon');
  icon.append(createIcon(TOAST_ICONS[type] || TOAST_ICONS.success));
  toast.append(icon, el('span', 'toast__message', message));
  region.append(toast);

  while (region.children.length > 3) region.firstElementChild.remove(); // at most 3 on screen

  setTimeout(() => {
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 300);
  }, type === 'danger' ? 5000 : 3200);
}

const showSuccess = (message) => showToast(message, 'success');
const showError = (message) => showToast(message, 'danger');

/* Submit buttons: "Saving..." + disabled while a request is running (prevents double submits). */
function setSaving(button, saving) {
  if (!button) return;
  const label = $('.btn__label', button) || button;
  if (saving) {
    label.dataset.original = label.textContent;
    label.textContent = 'Saving...';
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
  } else {
    if (label.dataset.original) label.textContent = label.dataset.original;
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}

/* The grey box above a list that shows: loading / error (with Try Again) / empty. */
function showState(container, { type, message, onRetry }) {
  container.replaceChildren();
  container.className = `state${type === 'error' ? ' state--error' : ''}`;

  if (type === 'loading') container.append(el('span', 'spinner'));
  container.append(el('p', '', message));

  if (type === 'error' && onRetry) {
    const retry = el('button', 'btn btn--ghost btn--sm', 'Try Again');
    retry.type = 'button';
    retry.addEventListener('click', onRetry);
    container.append(retry);
  }
  container.hidden = false;
}

function hideState(container) {
  container.hidden = true;
  container.replaceChildren();
}

/* Mark a list as busy for screen readers while it loads */
const setBusy = (node, busy) => node.setAttribute('aria-busy', String(busy));

/* Shows whether the last request reached the server (dashboard header pill) */
function setConnection(isOnline) {
  const pill = $('#connection-pill');
  const text = $('#connection-text');
  if (!pill || !text) return;
  pill.classList.toggle('is-offline', !isOnline);
  text.textContent = isOnline ? 'Connected to server' : 'Server unreachable';
}


/* ---------------------------------------------------------------------
   3. MOBILE NAVIGATION, SMOOTH SCROLL, ACTIVE LINK
   --------------------------------------------------------------------- */
const navbar = $('#navbar');
const navToggle = $('#nav-toggle');
const siteNav = $('#site-nav');

function setMenu(open) {
  siteNav.classList.toggle('is-open', open);
  navToggle.setAttribute('aria-expanded', String(open));
  navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
}

function initNavigation() {
  navToggle.addEventListener('click', () => {
    setMenu(navToggle.getAttribute('aria-expanded') !== 'true');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && siteNav.classList.contains('is-open')) {
      setMenu(false);
      navToggle.focus();
    }
  });

  document.addEventListener('click', (event) => {
    if (siteNav.classList.contains('is-open') && !navbar.contains(event.target)) setMenu(false);
  });

  window.matchMedia('(min-width: 768px)').addEventListener('change', (event) => {
    if (event.matches) setMenu(false);
  });

  const onScroll = () => navbar.classList.toggle('is-scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

function scrollToSection(id, { focus = true } = {}) {
  const target = document.getElementById(id);
  if (!target) return;

  target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });

  if (focus) {
    target.setAttribute('tabindex', '-1');
    target.style.outline = 'none';
    target.focus({ preventScroll: true });
  }
  try { history.replaceState(null, '', `#${id}`); } catch (error) { /* file:// quirks */ }
}

function initSmoothScroll() {
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const id = link.getAttribute('href').slice(1);
    if (!id || !document.getElementById(id)) return;

    event.preventDefault();
    setMenu(false);
    scrollToSection(id);
  });
}

function initActiveNav() {
  const links = $$('[data-nav-link]');
  const sections = $$('main section[id]');
  if (!('IntersectionObserver' in window)) return;

  const setActive = (name) => {
    links.forEach((link) => {
      const active = link.dataset.navLink === name;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const name = entry.target.dataset.nav || entry.target.id;
      if (links.some((link) => link.dataset.navLink === name)) setActive(name);
    });
  }, { rootMargin: '-45% 0px -50% 0px' });

  sections.forEach((section) => observer.observe(section));
  setActive('home');

  window.addEventListener('scroll', () => {
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) setActive('faq');
  }, { passive: true });
}


/* ---------------------------------------------------------------------
   4. API LAYER  —  the single function that calls fetch()
   --------------------------------------------------------------------- */

/* An Error that also remembers the HTTP status (0 = could not reach the server) */
function makeError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/* Turn an HTTP status into a message a normal person understands.
   For 400 the backend already sends a clear sentence ("Task title must be ..."), so we show it. */
function messageForStatus(status, payload) {
  const serverMessage = payload && typeof payload.message === 'string' ? payload.message : '';
  if (status === 400 || status === 422) return serverMessage || 'Please check what you entered and try again.';
  if (status === 401 || status === 403) return 'You are not allowed to do that.';
  if (status === 404) return serverMessage || 'That item was not found. It may already have been deleted.';
  if (status >= 500) return 'The server ran into a problem. Please try again in a moment.';
  return 'Something went wrong. Please try again.';
}

/* apiRequest('/tasks')                                   -> GET
   apiRequest('/tasks', { method: 'POST', body: {...} })  -> POST with a JSON body

   1. fetch() sends the request.  It only THROWS when the network fails (server down, offline).
   2. For HTTP errors (400, 404, 500 ...) fetch() still "succeeds", so we MUST check response.ok.
   3. response.json() turns the JSON text into a JavaScript object.
   Every problem becomes an Error with a friendly message; callers use try/catch. */
async function apiRequest(path, { method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), // JS object -> JSON text
      signal: controller.signal
    });
  } catch (error) {
    setConnection(false);
    throw makeError(
      error.name === 'AbortError'
        ? 'The server took too long to answer. Please try again.'
        : 'Unable to connect to the FocusFlow server. Please check that the backend is running.',
      0
    );
  } finally {
    clearTimeout(timer);
  }

  setConnection(true); // we got an answer, so the server is reachable

  let payload = null;
  try {
    payload = await response.json(); // JSON text -> JavaScript object
  } catch (error) {
    payload = null; // not JSON (for example an HTML error page)
  }

  if (!response.ok) throw makeError(messageForStatus(response.status, payload), response.status);
  if (!payload || typeof payload !== 'object') throw makeError('The server sent an unexpected response.', response.status);

  return payload;
}

/* Run a save-style action (create / update / delete) with the same safety every time:
   disable the button -> try -> toast -> catch -> toast -> finally restore the button. */
async function runAction({ button, action, success }) {
  setSaving(button, true);
  try {
    await action();
    if (success) showSuccess(success);
    return true;
  } catch (error) {
    showError(error.message);
    return false;
  } finally {
    setSaving(button, false);
  }
}


/* ---------------------------------------------------------------------
   5. TASKS
   --------------------------------------------------------------------- */
const taskListEl = $('#task-list');
const taskStateEl = $('#task-state');

/* READ: GET /api/tasks  ->  state.tasks  ->  renderTasks() */
async function loadTasks() {
  showState(taskStateEl, { type: 'loading', message: 'Loading your tasks...' });
  setBusy(taskListEl, true);
  taskListEl.replaceChildren();

  try {
    const payload = await apiRequest('/tasks');
    state.tasks = asArray(payload.data).map(normalizeTask).filter(Boolean);
    renderTasks();
  } catch (error) {
    state.tasks = [];
    renderTaskCounts();
    showState(taskStateEl, {
      type: 'error',
      message: error.status === 0 ? error.message : `Unable to load tasks. ${error.message}`,
      onRetry: loadTasks
    });
  } finally {
    setBusy(taskListEl, false);
  }
}

function renderTaskCounts() {
  const done = state.tasks.filter((task) => task.completed).length;
  $('#count-total').textContent = state.tasks.length;
  $('#count-done').textContent = done;
  $('#count-pending').textContent = state.tasks.length - done;
}

/* Build one <li> for a task. All text goes in with textContent. */
function createTaskItem(task) {
  const item = el('li', `task-item${task.completed ? ' is-done' : ''}`);
  item.dataset.id = String(task.id);

  const label = el('label', 'task-item__check');
  const checkbox = el('input', 'task-item__checkbox');
  checkbox.type = 'checkbox';
  checkbox.checked = task.completed;
  checkbox.setAttribute('aria-label', `Mark "${task.title}" as ${task.completed ? 'not done' : 'done'}`);
  const box = el('span', 'task-item__box');
  box.setAttribute('aria-hidden', 'true');
  const body = el('span', 'task-item__body');
  body.append(el('span', 'task-item__text', task.title));
  if (task.description) body.append(el('span', 'task-item__desc', task.description));
  label.append(checkbox, box, body);

  const edit = el('button', 'task-item__edit');
  edit.type = 'button';
  edit.dataset.action = 'edit';
  edit.setAttribute('aria-label', `Edit task: ${task.title}`);
  edit.append(createIcon('i-edit'));

  const remove = el('button', 'task-item__delete');
  remove.type = 'button';
  remove.dataset.action = 'delete';
  remove.setAttribute('aria-label', `Delete task: ${task.title}`);
  remove.append(createIcon('i-trash'));

  const actions = el('div', 'task-item__actions');
  actions.append(edit, remove);

  item.append(label, actions);
  return item;
}

/* DOM update: draw the tasks (for the current filter) from state.tasks */
function renderTasks() {
  const visible = state.tasks.filter((task) =>
    state.filter === 'all' || (state.filter === 'done' ? task.completed : !task.completed));

  taskListEl.replaceChildren(...visible.map(createTaskItem));
  renderTaskCounts();

  if (visible.length === 0) {
    const message =
      state.tasks.length === 0 ? 'No tasks yet. Add one to get started!'
        : state.filter === 'done' ? 'No completed tasks yet. You can do it!'
        : 'Nothing pending. You are all caught up!';
    showState(taskStateEl, { type: 'empty', message });
  } else {
    hideState(taskStateEl);
  }
}

/* After any change: ask the server again, so the page always shows what is in the database */
function refreshTasksAndStats() {
  return Promise.all([loadTasks(), loadStats()]);
}

/* Basic frontend check (the backend validates again: never trust the browser alone) */
function taskTitleProblem(title) {
  if (title.length < 3) return 'Please enter a task title (at least 3 characters).';
  if (title.length > 100) return 'The task title must be 100 characters or fewer.';
  return '';
}

function markInvalid(input, message) {
  input.classList.remove('is-invalid');
  void input.offsetWidth; // restart the shake animation
  input.classList.add('is-invalid');
  input.setAttribute('aria-invalid', 'true');
  showError(message);
  input.focus();
}

function clearInvalid(input) {
  input.classList.remove('is-invalid');
  input.removeAttribute('aria-invalid');
}

/* CREATE: POST /api/tasks */
async function createTask(taskData) {
  return apiRequest('/tasks', { method: 'POST', body: taskData });
}

/* UPDATE: PUT /api/tasks/:id   (any of title / description / completed) */
async function updateTask(id, changes) {
  return apiRequest(`/tasks/${id}`, { method: 'PUT', body: changes });
}

/* DELETE: DELETE /api/tasks/:id */
async function deleteTask(id) {
  return apiRequest(`/tasks/${id}`, { method: 'DELETE' });
}

async function handleTaskSubmit(event) {
  event.preventDefault();
  const titleInput = $('#task-title');
  const descriptionInput = $('#task-description');
  const title = titleInput.value.trim();
  const description = descriptionInput.value.trim();

  const problem = taskTitleProblem(title);
  if (problem) return markInvalid(titleInput, problem);

  const saved = await runAction({
    button: $('#task-submit'),
    success: 'Task added successfully!',
    action: () => createTask({ title, description: description || null })
  });

  if (saved) {
    event.target.reset(); // clear the form
    titleInput.focus();
    await refreshTasksAndStats(); // POST -> GET: the database is the source of truth
  }
}

/* Checkbox: PUT { completed: true | false } */
async function handleTaskToggle(checkbox) {
  const item = checkbox.closest('.task-item');
  const id = Number(item.dataset.id);
  checkbox.disabled = true;

  try {
    await updateTask(id, { completed: checkbox.checked });
    showSuccess('Task updated!');
  } catch (error) {
    showError(error.message);
  } finally {
    await refreshTasksAndStats(); // on success AND on failure: redraw from the database
  }
}

async function handleTaskDelete(button) {
  const id = Number(button.closest('.task-item').dataset.id);
  if (!window.confirm('Are you sure you want to delete this task?')) return;

  button.disabled = true;
  try {
    await deleteTask(id);
    showSuccess('Task deleted successfully!');
  } catch (error) {
    showError(error.message);
  } finally {
    await refreshTasksAndStats();
  }
}

async function handleClearCompleted(button) {
  const completed = state.tasks.filter((task) => task.completed);
  if (completed.length === 0) return showToast('No completed tasks to clear.', 'info');
  if (!window.confirm(`Delete ${completed.length} completed task${completed.length === 1 ? '' : 's'}?`)) return;

  setSaving(button, true);
  try {
    const results = await Promise.allSettled(completed.map((task) => deleteTask(task.id)));
    const failed = results.filter((result) => result.status === 'rejected').length;
    if (failed) showError(`${failed} task${failed === 1 ? '' : 's'} could not be deleted.`);
    else showSuccess('Completed tasks deleted successfully!');
  } finally {
    setSaving(button, false);
    await refreshTasksAndStats();
  }
}

function initTasks() {
  $('#task-form').addEventListener('submit', handleTaskSubmit);
  $('#task-title').addEventListener('input', (event) => clearInvalid(event.target));

  /* One listener for the whole list (event delegation): works for tasks added later too */
  taskListEl.addEventListener('change', (event) => {
    if (event.target.matches('.task-item__checkbox')) handleTaskToggle(event.target);
  });
  taskListEl.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    if (button.dataset.action === 'delete') handleTaskDelete(button);
    if (button.dataset.action === 'edit') openTaskDialog(Number(button.closest('.task-item').dataset.id));
  });

  $$('[data-filter]').forEach((chip) => chip.addEventListener('click', () => {
    state.filter = chip.dataset.filter;
    $$('[data-filter]').forEach((other) => other.setAttribute('aria-pressed', String(other === chip)));
    renderTasks(); // filtering only changes what is shown; no new request needed
  }));

  $('#clear-done').addEventListener('click', (event) => handleClearCompleted(event.currentTarget));
}


/* ---------------------------------------------------------------------
   6. STUDY SESSIONS  (the "Study Planner")
   --------------------------------------------------------------------- */
const sessionListEl = $('#session-list');
const sessionStateEl = $('#session-state');

/* READ: GET /api/study-sessions */
async function loadStudySessions() {
  showState(sessionStateEl, { type: 'loading', message: 'Loading your study sessions...' });
  setBusy(sessionListEl, true);
  sessionListEl.replaceChildren();

  try {
    const payload = await apiRequest('/study-sessions');
    state.sessions = asArray(payload.data).map(normalizeSession).filter(Boolean);
    renderStudySessions();
  } catch (error) {
    state.sessions = [];
    renderProgress();
    showState(sessionStateEl, {
      type: 'error',
      message: error.status === 0 ? error.message : `Unable to load study sessions. ${error.message}`,
      onRetry: loadStudySessions
    });
  } finally {
    setBusy(sessionListEl, false);
  }
}

function createSessionItem(session) {
  const item = el('li', 'session-card');
  item.dataset.id = String(session.id);

  const body = el('div', 'session-card__body');
  const meta = el('p', 'session-card__meta');
  const duration = el('span', '', formatMinutes(session.duration));
  duration.prepend(createIcon('i-clock'));
  const date = el('span', '', formatDate(session.study_date));
  date.prepend(createIcon('i-calendar'));
  meta.append(duration, date);
  body.append(el('p', 'session-card__subject', session.subject), meta);

  const edit = el('button', 'icon-btn');
  edit.type = 'button';
  edit.dataset.action = 'edit';
  edit.setAttribute('aria-label', `Edit session: ${session.subject}`);
  edit.append(createIcon('i-edit'));

  const remove = el('button', 'icon-btn icon-btn--danger');
  remove.type = 'button';
  remove.dataset.action = 'delete';
  remove.setAttribute('aria-label', `Delete session: ${session.subject}`);
  remove.append(createIcon('i-trash'));

  const actions = el('div', 'session-card__actions');
  actions.append(edit, remove);

  item.append(body, actions);
  return item;
}

function renderStudySessions() {
  sessionListEl.replaceChildren(...state.sessions.map(createSessionItem));

  if (state.sessions.length === 0) {
    showState(sessionStateEl, { type: 'empty', message: 'No study sessions yet. Log your first one above!' });
  } else {
    hideState(sessionStateEl);
  }
  renderProgress(); // the weekly chart and streak are calculated from the sessions
}

function refreshSessionsAndStats() {
  return Promise.all([loadStudySessions(), loadStats()]);
}

/* Basic frontend check for the session form fields. Returns { message, input } or null. */
function sessionProblem(subjectInput, durationInput, dateInput) {
  const subject = subjectInput.value.trim();
  const duration = Number(durationInput.value);
  if (subject.length < 2) return { message: 'Please enter a subject (at least 2 characters).', input: subjectInput };
  if (!Number.isInteger(duration) || duration < 1 || duration > 600) {
    return { message: 'Minutes must be a whole number from 1 to 600.', input: durationInput };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput.value)) return { message: 'Please choose a date.', input: dateInput };
  return null;
}

/* CREATE: POST /api/study-sessions */
async function createStudySession(sessionData) {
  return apiRequest('/study-sessions', { method: 'POST', body: sessionData });
}

/* UPDATE: PUT /api/study-sessions/:id */
async function updateStudySession(id, changes) {
  return apiRequest(`/study-sessions/${id}`, { method: 'PUT', body: changes });
}

/* DELETE: DELETE /api/study-sessions/:id */
async function deleteStudySession(id) {
  return apiRequest(`/study-sessions/${id}`, { method: 'DELETE' });
}

async function handleSessionSubmit(event) {
  event.preventDefault();
  const subjectInput = $('#session-subject');
  const durationInput = $('#session-duration');
  const dateInput = $('#session-date');

  const problem = sessionProblem(subjectInput, durationInput, dateInput);
  if (problem) return markInvalid(problem.input, problem.message);

  const saved = await runAction({
    button: $('#session-submit'),
    success: 'Study session added successfully!',
    action: () => createStudySession({
      subject: subjectInput.value.trim(),
      duration: Number(durationInput.value),
      study_date: dateInput.value
    })
  });

  if (saved) {
    event.target.reset();
    dateInput.value = todayKey();
    await refreshSessionsAndStats();
  }
}

async function handleSessionDelete(button) {
  const id = Number(button.closest('.session-card').dataset.id);
  if (!window.confirm('Are you sure you want to delete this study session?')) return;

  button.disabled = true;
  try {
    await deleteStudySession(id);
    showSuccess('Study session deleted successfully!');
  } catch (error) {
    showError(error.message);
  } finally {
    await refreshSessionsAndStats();
  }
}

function initSessions() {
  $('#session-date').value = todayKey();
  $('#session-form').addEventListener('submit', handleSessionSubmit);
  $$('#session-form input').forEach((input) => input.addEventListener('input', () => clearInvalid(input)));

  sessionListEl.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    if (button.dataset.action === 'delete') handleSessionDelete(button);
    if (button.dataset.action === 'edit') openSessionDialog(Number(button.closest('.session-card').dataset.id));
  });
}


/* ---------------------------------------------------------------------
   7. STATISTICS, DASHBOARD AND PROGRESS
   --------------------------------------------------------------------- */

/* A "meter" is any element with data-meter="<percent>": a bar, a ring or a chart column. */
function applyMeter(node) {
  const value = Number(node.dataset.meter) || 0;
  if (node.classList.contains('ring__bar')) node.style.strokeDashoffset = String(100 - value);
  else if (node.classList.contains('bars__fill')) node.style.height = `${value}%`;
  else node.style.width = `${value}%`;
}

function setMeter(node, percent) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  node.dataset.meter = String(value);
  const host = node.parentElement;
  if (host && host.getAttribute('role') === 'progressbar') host.setAttribute('aria-valuenow', String(value));
  applyMeter(node);
}

const setMeters = (key, percent) => $$(`[data-meter-key="${key}"]`).forEach((node) => setMeter(node, percent));
const setText = (selector, text) => $$(selector).forEach((node) => { node.textContent = text; });
const formatNumber = (n) => String(Math.round(n * 10) / 10);

/* READ: GET /api/stats  (COUNT / SUM calculated by PostgreSQL) */
async function loadStats() {
  const grid = $('#stats-grid');
  const errorBox = $('#stats-error');
  grid.setAttribute('aria-busy', 'true');

  try {
    const payload = await apiRequest('/stats');
    const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
    state.stats = {
      totalTasks: toNumber(data.totalTasks),
      completedTasks: toNumber(data.completedTasks),
      pendingTasks: toNumber(data.pendingTasks),
      totalStudySessions: toNumber(data.totalStudySessions),
      totalStudyMinutes: toNumber(data.totalStudyMinutes)
    };
    errorBox.hidden = true;
    updateDashboard();
  } catch (error) {
    state.stats = null;
    $('#stats-error-text').textContent =
      error.status === 0 ? error.message : `Unable to load your statistics. ${error.message}`;
    errorBox.hidden = false;
    updateDashboard();
  } finally {
    grid.setAttribute('aria-busy', 'false');
  }
}

/* DOM update: dashboard cards + progress bars. Nothing here is hard-coded. */
function updateDashboard() {
  const stats = state.stats;

  if (!stats) {
    ['progress', 'hours', 'sessions'].forEach((name) => setText(`[data-stat="${name}"]`, '--'));
    setText('[data-stat="tasks"]', '-- / --');
    setText('[data-stat="tasks-hint"]', 'Not available');
    setText('[data-stat="pending-hint"]', 'Not available');
    setText('[data-stat="tasks-pct"]', '--');
    setText('[data-stat="tasks-pct-text"]', '--');
    renderProgress();
    return;
  }

  const { totalTasks, completedTasks, pendingTasks, totalStudySessions, totalStudyMinutes } = stats;
  const percent = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100); // safe when there are 0 tasks

  setText('[data-stat="progress"]', String(percent));
  setText('[data-stat="tasks"]', `${completedTasks} / ${totalTasks}`);
  setText('[data-stat="tasks-hint"]',
    totalTasks === 0 ? 'Add a task to get started'
      : pendingTasks === 0 ? 'All tasks done. Great work!'
      : `${pendingTasks} task${pendingTasks === 1 ? '' : 's'} left`);
  setText('[data-stat="hours"]', formatNumber(totalStudyMinutes / 60));
  setText('[data-stat="sessions"]', String(totalStudySessions));
  setText('[data-stat="pending-hint"]', `${totalStudySessions === 1 ? 'session' : 'sessions'} logged`);
  setText('[data-stat="tasks-pct"]', String(percent));
  setText('[data-stat="tasks-pct-text"]', `${percent}%`);

  setMeters('today', percent);
  setMeters('tasks', percent);
  renderProgress();
}

/* The last n days (oldest first) as { key, label, letter, isToday } */
function lastDays(n) {
  const days = [];
  for (let offset = n - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    days.push({
      key: dateKey(date),
      label: date.toLocaleDateString(undefined, { weekday: 'short' }),
      letter: date.toLocaleDateString(undefined, { weekday: 'narrow' }),
      isToday: offset === 0
    });
  }
  return days;
}

/* Weekly goal ring, streak and 7-day chart: calculated from the study sessions the API returned */
function renderProgress() {
  const minutesByDay = {};
  state.sessions.forEach((session) => {
    minutesByDay[session.study_date] = (minutesByDay[session.study_date] || 0) + session.duration;
  });

  const week = lastDays(7);
  const weekHours = week.reduce((sum, day) => sum + (minutesByDay[day.key] || 0), 0) / 60;
  const weekPercent = Math.min(100, Math.round((weekHours / WEEKLY_GOAL_HOURS) * 100));
  setText('[data-stat="week-hours"]', formatNumber(weekHours));
  setText('[data-stat="week-pct"]', String(weekPercent));
  setMeters('week', weekPercent);

  /* Streak: consecutive days with a session, counting back from today
     (if there is none today yet, the streak that ended yesterday still counts) */
  let streak = 0;
  const cursor = new Date();
  if (!minutesByDay[dateKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
  while (minutesByDay[dateKey(cursor)] && streak < 3650) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  setText('[data-stat="streak"]', String(streak));
  setText('[data-stat="streak-text"]', `${streak} day${streak === 1 ? '' : 's'}`);

  const dots = $('#streak-days');
  dots.replaceChildren(...week.map((day) => {
    const dot = el('li', `${minutesByDay[day.key] ? 'is-done' : ''}${day.isToday ? ' is-today' : ''}`.trim());
    dot.append(el('span', '', day.letter));
    dot.title = `${day.label}: ${formatMinutes(minutesByDay[day.key] || 0)}`;
    return dot;
  }));

  const hoursPerDay = week.map((day) => (minutesByDay[day.key] || 0) / 60);
  const scale = Math.max(4, ...hoursPerDay); // chart height: at least a 4 hour scale
  const bars = $('#week-bars');
  bars.replaceChildren(...week.map((day, index) => {
    const item = el('li', 'bars__item');
    const fill = el('span', `bars__fill${hoursPerDay[index] === Math.max(...hoursPerDay) && hoursPerDay[index] > 0 ? ' bars__fill--peak' : ''}`);
    const track = el('span', 'bars__track');
    track.append(fill);
    const dayLabel = el('span', 'bars__day', day.label);
    item.append(el('span', 'bars__value', formatNumber(hoursPerDay[index])), track, dayLabel);
    item.title = `${day.label}: ${formatMinutes(minutesByDay[day.key] || 0)}`;
    fill.dataset.meter = String(Math.round((hoursPerDay[index] / scale) * 100));
    return item;
  }));
  $$('.bars__fill', bars).forEach(applyMeter);
}

function initDashboardHeader() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  setText('#dash-greeting', `${greeting}!`);
  setText('#dash-date', new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }));
  $('#stats-retry').addEventListener('click', loadStats);
}


/* ---------------------------------------------------------------------
   8. EDIT DIALOGS (native <dialog> element)
   --------------------------------------------------------------------- */
const taskDialog = $('#task-dialog');
const sessionDialog = $('#session-dialog');

function openDialog(dialog) {
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', ''); // very old browsers
}

function closeDialog(dialog) {
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

/* Fill the edit form with the existing task, then open it */
function openTaskDialog(id) {
  const task = state.tasks.find((entry) => entry.id === id);
  if (!task) return showError('Task not found.');

  taskDialog.dataset.id = String(id);
  $('#edit-task-title').value = task.title;
  $('#edit-task-description').value = task.description;
  clearInvalid($('#edit-task-title'));
  openDialog(taskDialog);
  $('#edit-task-title').focus();
}

async function handleTaskEditSubmit(event) {
  event.preventDefault();
  const id = Number(taskDialog.dataset.id);
  const task = state.tasks.find((entry) => entry.id === id);
  const titleInput = $('#edit-task-title');
  const title = titleInput.value.trim();
  const description = $('#edit-task-description').value.trim();

  const problem = taskTitleProblem(title);
  if (problem) return markInvalid(titleInput, problem);

  const saved = await runAction({
    button: $('#task-edit-submit'),
    success: 'Task updated!',
    // PUT sends the edited fields plus the task's current completed value
    action: () => updateTask(id, { title, description: description || null, completed: task ? task.completed : false })
  });

  if (saved) {
    closeDialog(taskDialog);
    await refreshTasksAndStats();
  }
}

function openSessionDialog(id) {
  const session = state.sessions.find((entry) => entry.id === id);
  if (!session) return showError('Study session not found.');

  sessionDialog.dataset.id = String(id);
  $('#edit-session-subject').value = session.subject;
  $('#edit-session-duration').value = session.duration;
  $('#edit-session-date').value = session.study_date;
  $$('input', sessionDialog).forEach(clearInvalid);
  openDialog(sessionDialog);
  $('#edit-session-subject').focus();
}

async function handleSessionEditSubmit(event) {
  event.preventDefault();
  const id = Number(sessionDialog.dataset.id);
  const subjectInput = $('#edit-session-subject');
  const durationInput = $('#edit-session-duration');
  const dateInput = $('#edit-session-date');

  const problem = sessionProblem(subjectInput, durationInput, dateInput);
  if (problem) return markInvalid(problem.input, problem.message);

  const saved = await runAction({
    button: $('#session-edit-submit'),
    success: 'Study session updated!',
    action: () => updateStudySession(id, {
      subject: subjectInput.value.trim(),
      duration: Number(durationInput.value),
      study_date: dateInput.value
    })
  });

  if (saved) {
    closeDialog(sessionDialog);
    await refreshSessionsAndStats();
  }
}

function initDialogs() {
  $('#task-edit-form').addEventListener('submit', handleTaskEditSubmit);
  $('#session-edit-form').addEventListener('submit', handleSessionEditSubmit);

  [taskDialog, sessionDialog].forEach((dialog) => {
    $$('[data-close-dialog]', dialog).forEach((button) => button.addEventListener('click', () => closeDialog(dialog)));
    // Clicking the dark area behind the dialog closes it
    dialog.addEventListener('click', (event) => { if (event.target === dialog) closeDialog(dialog); });
    $$('input', dialog).forEach((input) => input.addEventListener('input', () => clearInvalid(input)));
  });
}


/* ---------------------------------------------------------------------
   9. FOCUS TIMER (Pomodoro): runs in the browser; no API needed.
      When a focus session finishes, an optional "Save Study Session"
      button sends it to POST /api/study-sessions.
   --------------------------------------------------------------------- */
const FOCUS_KEY = 'focusflow.focus';
const BASE_TITLE = document.title;

/* "Sessions today" dots are a small local convenience (the timer itself is client-side) */
function loadFocusCount() {
  try {
    const saved = JSON.parse(localStorage.getItem(FOCUS_KEY));
    if (saved && saved.day === todayKey()) return saved.sessions || 0;
  } catch (error) { /* storage blocked: ignore */ }
  return 0;
}

function saveFocusCount(count) {
  try { localStorage.setItem(FOCUS_KEY, JSON.stringify({ day: todayKey(), sessions: count })); } catch (error) { /* ignore */ }
}

function initTimer() {
  const timerBox = $('.timer');
  const display = $('#timer-display');
  const ring = $('#timer-progress');
  const status = $('#timer-status');
  const modeLabel = $('#timer-mode-label');
  const startBtn = $('#timer-start');
  const pauseBtn = $('#timer-pause');
  const resetBtn = $('#timer-reset');
  const modeButtons = $$('[data-mode]');
  const dots = $$('.dot', $('#timer-dots'));
  const sessionCount = $('#timer-session-count');
  const saveBox = $('#timer-save-box');
  const saveBtn = $('#timer-save');

  const MODE_NAMES = { focus: 'Focus', short: 'Short break', long: 'Long break' };

  let mode = 'focus';
  let duration = 25 * 60;   // seconds in the current mode
  let remaining = duration; // seconds left
  let endTime = 0;          // timestamp (ms) when the countdown hits zero
  let intervalId = null;    // only ever one interval: prevents duplicate timers
  let focusCount = loadFocusCount();
  let unsavedMinutes = 0;   // minutes of the finished focus session waiting to be saved

  const isRunning = () => intervalId !== null;
  const pad = (n) => String(n).padStart(2, '0');
  const formatTime = (seconds) => `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;

  function setDisabled(button, disabled) {
    button.setAttribute('aria-disabled', String(disabled)); // aria-disabled keeps keyboard focus in place
  }

  function drawSessions() {
    sessionCount.textContent = focusCount;
    const filled = focusCount === 0 ? 0 : ((focusCount - 1) % 4) + 1;
    dots.forEach((dot, index) => dot.classList.toggle('is-filled', index < filled));
  }

  function draw() {
    display.textContent = formatTime(remaining);
    ring.style.strokeDashoffset = String(100 - (remaining / duration) * 100);
    document.title = isRunning() ? `${formatTime(remaining)} - FocusFlow` : BASE_TITLE;
  }

  function setStatus(message, done = false) {
    status.textContent = message;
    status.classList.toggle('is-done', done);
  }

  function stopInterval() {
    clearInterval(intervalId);
    intervalId = null;
    timerBox.classList.remove('is-running');
    setDisabled(startBtn, false);
    setDisabled(pauseBtn, true);
  }

  function chime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.75);
      osc.onended = () => ctx.close();
    } catch (error) { /* audio can be blocked by the browser: stay silent */ }
  }

  function complete() {
    stopInterval();
    remaining = 0;
    timerBox.classList.add('is-done');
    draw();
    document.title = BASE_TITLE;
    chime();

    if (mode === 'focus') {
      focusCount += 1;
      saveFocusCount(focusCount);
      drawSessions();
      unsavedMinutes = duration / 60;
      saveBox.hidden = false; // offer to record it in the database
      setStatus('Focus session complete! Take a short break.', true);
      showToast('Focus session complete! Take a short break.');
    } else {
      setStatus('Break is over. Ready for another focus session?', true);
      showToast('Break is over. Ready to focus again?', 'info');
    }
  }

  function tick() {
    remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
    draw();
    if (remaining === 0) complete();
  }

  function start() {
    if (isRunning()) return;
    const fresh = remaining === duration;
    if (remaining <= 0) reset();

    timerBox.classList.remove('is-done');
    endTime = Date.now() + remaining * 1000;
    intervalId = setInterval(tick, 250);
    timerBox.classList.add('is-running');
    setDisabled(startBtn, true);
    setDisabled(pauseBtn, false);
    draw();

    if (mode === 'focus') {
      setStatus('Stay with it. You are in the zone.');
      showToast(fresh ? 'Focus session started!' : 'Focus session resumed.');
    } else {
      setStatus('Relax and recharge.');
      showToast('Break started. Relax!', 'info');
    }
  }

  function pause() {
    if (!isRunning()) return;
    tick();
    if (!isRunning()) return;
    stopInterval();
    draw();
    setStatus('Paused. Press Start to continue.');
    showToast('Timer paused.', 'info');
  }

  function reset() {
    stopInterval();
    remaining = duration;
    timerBox.classList.remove('is-done');
    ring.classList.add('no-transition');
    draw();
    void ring.getBoundingClientRect();
    ring.classList.remove('no-transition');
    setStatus('Ready when you are.');
  }

  function setMode(next, minutes) {
    mode = next;
    duration = minutes * 60;
    modeLabel.textContent = MODE_NAMES[next];
    modeButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mode === next)));
    reset();
  }

  /* Optional: POST the finished focus session to the API */
  saveBtn.addEventListener('click', async () => {
    const saved = await runAction({
      button: saveBtn,
      success: 'Study session saved!',
      action: () => createStudySession({ subject: 'Focus session', duration: unsavedMinutes, study_date: todayKey() })
    });
    if (saved) {
      saveBox.hidden = true;
      unsavedMinutes = 0;
      await refreshSessionsAndStats();
    }
  });

  startBtn.addEventListener('click', () => { if (startBtn.getAttribute('aria-disabled') !== 'true') start(); });
  pauseBtn.addEventListener('click', () => { if (pauseBtn.getAttribute('aria-disabled') !== 'true') pause(); });
  resetBtn.addEventListener('click', () => {
    const wasRunning = isRunning();
    reset();
    if (wasRunning) showToast('Timer reset.', 'info');
  });
  modeButtons.forEach((button) => {
    button.addEventListener('click', () => setMode(button.dataset.mode, Number(button.dataset.minutes)));
  });

  drawSessions();
  draw();
}


/* ---------------------------------------------------------------------
   10. FAQ, SCROLL REVEAL, START-UP
   --------------------------------------------------------------------- */
function initFaq() {
  const items = $$('.faq__item');

  function setOpen(item, open) {
    item.classList.toggle('is-open', open);
    $('.faq__question', item).setAttribute('aria-expanded', String(open));
  }

  items.forEach((item) => {
    $('.faq__question', item).addEventListener('click', () => {
      const willOpen = !item.classList.contains('is-open');
      items.forEach((other) => setOpen(other, other === item && willOpen));
    });
  });

  setOpen(items[0], true);
}

function initReveal() {
  const targets = $$('.reveal');
  if (!('IntersectionObserver' in window)) {
    targets.forEach((node) => node.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  targets.forEach((node) => observer.observe(node));
}

function afterScrollEnds(callback) {
  let timer = setTimeout(finish, 400);
  function finish() {
    window.removeEventListener('scroll', onScroll);
    clearTimeout(timer);
    callback();
  }
  function onScroll() {
    clearTimeout(timer);
    timer = setTimeout(finish, 150);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
}

function initGetStarted() {
  $('#get-started').addEventListener('click', () => {
    setMenu(false);
    scrollToSection('tasks', { focus: false });
    showToast('Welcome to FocusFlow! Add your first task below.', 'info');
    afterScrollEnds(() => $('#task-title').focus({ preventScroll: true }));
  });
}

/* Start-up: set up the page, then load everything from the API (in parallel) */
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initSmoothScroll();
  initActiveNav();
  initDashboardHeader();
  initTasks();
  initSessions();
  initDialogs();
  initTimer();
  initFaq();
  initReveal();
  initGetStarted();

  loadTasks();
  loadStudySessions();
  loadStats();
});
