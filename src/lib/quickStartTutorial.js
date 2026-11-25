const PENDING_KEY = 'washek_quick_start_pending';
const READY_KEY = 'washek_quick_start_ready';
const COMPLETED_KEY = 'washek_quick_start_completed';
export const OPEN_QUICK_START_EVENT = 'washek:open-quick-start';

function readJsonArray(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJsonArray(key, list) {
  try {
    const unique = Array.from(new Set(list.filter(Boolean)));
    localStorage.setItem(key, JSON.stringify(unique.slice(-50)));
  } catch {
    // ignore storage quota errors
  }
}

export function getQuickStartUserKeys(user) {
  if (!user || typeof user !== 'object') return [];
  const keys = [];
  const email = user.email ? String(user.email).trim().toLowerCase() : '';
  const id = user.id || user.uid ? String(user.id || user.uid).trim() : '';
  if (email) keys.push(`email:${email}`);
  if (id) keys.push(`id:${id}`);
  return keys;
}

export function markNewAccountForQuickStart(user) {
  const keys = getQuickStartUserKeys(user);
  if (!keys.length) return;
  const completed = readJsonArray(COMPLETED_KEY);
  const filteredCompleted = completed.filter((k) => !keys.includes(k));
  writeJsonArray(COMPLETED_KEY, filteredCompleted);

  const pending = readJsonArray(PENDING_KEY);
  writeJsonArray(PENDING_KEY, [...pending, ...keys]);
}

export function isNewAccountPendingQuickStart(user) {
  const keys = getQuickStartUserKeys(user);
  if (!keys.length) return false;
  const pending = readJsonArray(PENDING_KEY);
  return keys.some((k) => pending.includes(k));
}

export function hasCompletedQuickStart(user) {
  const keys = getQuickStartUserKeys(user);
  if (!keys.length) return false;
  const completed = readJsonArray(COMPLETED_KEY);
  return keys.some((k) => completed.includes(k));
}

export function markQuickStartCompleted(user) {
  const keys = getQuickStartUserKeys(user);
  if (!keys.length) return;

  const pending = readJsonArray(PENDING_KEY).filter((k) => !keys.includes(k));
  writeJsonArray(PENDING_KEY, pending);

  const ready = readJsonArray(READY_KEY).filter((k) => !keys.includes(k));
  writeJsonArray(READY_KEY, ready);

  const completed = readJsonArray(COMPLETED_KEY);
  writeJsonArray(COMPLETED_KEY, [...completed, ...keys]);
}

export function queueQuickStartAfterOnboarding(user) {
  const keys = getQuickStartUserKeys(user);
  if (!keys.length) return false;
  if (hasCompletedQuickStart(user)) return false;
  if (!isNewAccountPendingQuickStart(user)) return false;

  const pending = readJsonArray(PENDING_KEY).filter((k) => !keys.includes(k));
  writeJsonArray(PENDING_KEY, pending);

  const ready = readJsonArray(READY_KEY);
  writeJsonArray(READY_KEY, [...ready, ...keys]);
  return true;
}

export function consumeQuickStartReady(user) {
  const keys = getQuickStartUserKeys(user);
  if (!keys.length) return false;
  if (hasCompletedQuickStart(user)) {
    const ready = readJsonArray(READY_KEY).filter((k) => !keys.includes(k));
    writeJsonArray(READY_KEY, ready);
    return false;
  }

  const ready = readJsonArray(READY_KEY);
  const isReady = keys.some((k) => ready.includes(k));
  if (!isReady) return false;

  markQuickStartCompleted(user);
  return true;
}

export function openQuickStartTutorial() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_QUICK_START_EVENT, { detail: { manual: true } }));
}
