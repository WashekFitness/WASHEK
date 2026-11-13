import { useSyncExternalStore } from 'react';
import { supabaseApi, ensureValidUuid } from '@/lib/supabaseApi';

export const STORAGE_MESSAGES_PREFIX = 'washek_kael_messages_';
export const STORAGE_CHATS_PREFIX = 'washek_kael_chats_';
export const STORAGE_ACTIVE_PREFIX = 'washek_kael_active_chat_';
export const STORAGE_DELETED_CHATS_PREFIX = 'washek_kael_deleted_chats_';
const IDB_NAME = 'washek_kael_db';
const IDB_STORE = 'kael_state';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function deterministicUuidFromSeed(seed) {
  const str = String(seed || 'kael_msg');
  if (UUID_REGEX.test(str.trim())) return str.trim().toLowerCase();
  const hashes = [0x811c9dc5, 0x9e3779b1, 0x85ebca77, 0xc2b2ae3d];
  for (let h = 0; h < 4; h++) {
    let hash = hashes[h];
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i) + h * 31;
      hash = Math.imul(hash, 0x01000193);
    }
    hashes[h] = hash >>> 0;
  }
  const hex = hashes.map((n) => n.toString(16).padStart(8, '0')).join('');
  const variantNibble = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variantNibble}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function normalizeMessageId(id, fallbackSeed = '') {
  if (typeof id === 'string' && UUID_REGEX.test(id.trim())) {
    return id.trim().toLowerCase();
  }
  return deterministicUuidFromSeed(id || fallbackSeed || generateUUID());
}

function deduplicateMessages(messagesList) {
  const sorted = [...(messagesList || [])]
    .filter((m) => m && m.id)
    .sort(
      (a, b) =>
        new Date(a.created_date || a.created_at || 0).getTime() -
        new Date(b.created_date || b.created_at || 0).getTime()
    );

  const uniqueMessages = [];
  const lastByChat = new Map();
  const seenKeyTimes = new Map();
  const redundantSyncedIds = [];

  for (const rawMsg of sorted) {
    const chatId = getMessageChatId(rawMsg);
    const normalizedId = normalizeMessageId(
      rawMsg.id,
      `${chatId}:${rawMsg.role}:${rawMsg.created_at || rawMsg.created_date || ''}:${(rawMsg.content || '').slice(0, 48)}`
    );
    const msg = {
      ...rawMsg,
      id: normalizedId,
      created_by: chatId,
    };

    const contentTrimmed = typeof msg.content === 'string' ? msg.content.trim() : '';
    const canDedupe = !msg.isStreaming && contentTrimmed.length > 0;
    const msgTime = new Date(msg.created_date || msg.created_at || 0).getTime();

    if (canDedupe) {
      const prevInChat = lastByChat.get(chatId);
      const isConsecutiveDuplicate =
        prevInChat &&
        prevInChat.msg.role === msg.role &&
        typeof prevInChat.msg.content === 'string' &&
        prevInChat.msg.content.trim() === contentTrimmed;

      const contentKey = `${chatId}|${msg.role}|${contentTrimmed}`;
      const recentMatch = seenKeyTimes.get(contentKey);
      const isSimultaneousDuplicate =
        recentMatch && Math.abs(msgTime - recentMatch.time) < 3000;

      if (isConsecutiveDuplicate || isSimultaneousDuplicate) {
        const matchEntry = isConsecutiveDuplicate ? prevInChat : recentMatch;
        const targetIdx = matchEntry.index;
        const existing = uniqueMessages[targetIdx];
        if (existing) {
          if (msg._synced && !existing._synced) {
            uniqueMessages[targetIdx] = msg;
            matchEntry.msg = msg;
          } else if (msg._synced && existing.id !== msg.id) {
            redundantSyncedIds.push(msg.id);
          }
          continue;
        }
      }

      const entry = { msg, index: uniqueMessages.length, time: msgTime };
      lastByChat.set(chatId, entry);
      seenKeyTimes.set(contentKey, entry);
    } else if (contentTrimmed.length > 0) {
      lastByChat.set(chatId, { msg, index: uniqueMessages.length, time: msgTime });
    }

    uniqueMessages.push(msg);
  }

  return { uniqueMessages, redundantSyncedIds };
}

export function getMessageChatId(message) {
  if (!message) return 'chat_initial';
  const val = message.created_by;
  if (typeof val === 'string' && val.startsWith('chat_')) {
    return val;
  }
  return 'chat_initial';
}

export function generateChatTitle(content) {
  if (!content) return 'New Chat';
  const clean = String(content).replace(/[#*`_~]/g, '').trim().split('\n')[0].trim();
  if (!clean) return 'New Chat';
  if (clean.length > 34) {
    return clean.slice(0, 33) + '…';
  }
  return clean;
}

function getInitialUserKey() {
  if (typeof localStorage === 'undefined') return 'guest';
  try {
    const raw = localStorage.getItem('washek_user');
    if (raw) {
      const u = JSON.parse(raw);
      const rawId = u?.id || u?.uid || u?.email;
      if (rawId) {
        return ensureValidUuid(String(rawId)) || String(rawId);
      }
    }
  } catch {
    // ignore storage read error
  }
  return 'guest';
}

function normalizeUserKey(userId) {
  if (!userId || userId === 'guest') return 'guest';
  return ensureValidUuid(String(userId)) || String(userId);
}

function readDeletedChatIds(userKey) {
  const deleted = new Set();
  if (typeof localStorage === 'undefined') return deleted;
  const keys = [STORAGE_DELETED_CHATS_PREFIX + 'all'];
  if (userKey) keys.push(STORAGE_DELETED_CHATS_PREFIX + userKey);

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_DELETED_CHATS_PREFIX)) {
        keys.push(k);
      }
    }
  } catch {
    // ignore
  }

  for (const key of new Set(keys)) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          arr.forEach((id) => {
            if (typeof id === 'string' && id) deleted.add(id);
          });
        }
      }
    } catch {
      // ignore
    }
  }
  return deleted;
}

function writeDeletedChatId(userKey, chatId) {
  if (!chatId || typeof localStorage === 'undefined') return;
  const keys = [STORAGE_DELETED_CHATS_PREFIX + 'all'];
  if (userKey) keys.push(STORAGE_DELETED_CHATS_PREFIX + userKey);
  for (const key of new Set(keys)) {
    try {
      const raw = localStorage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      const set = new Set(Array.isArray(arr) ? arr : []);
      set.add(chatId);
      localStorage.setItem(key, JSON.stringify(Array.from(set)));
    } catch {
      // ignore
    }
  }
}

function readCachedChats(userKey, deletedIds) {
  const chatMap = new Map();
  if (typeof localStorage === 'undefined') return [];
  const keysToScan = new Set([
    STORAGE_CHATS_PREFIX + (userKey || 'guest'),
    STORAGE_CHATS_PREFIX + 'all',
    STORAGE_CHATS_PREFIX + 'guest',
    STORAGE_CHATS_PREFIX + 'athlete',
  ]);
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(STORAGE_CHATS_PREFIX)) {
      keysToScan.add(k);
    }
  }

  keysToScan.forEach((key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      parsed.forEach((c) => {
        if (c && c.id && !deletedIds.has(c.id)) {
          const existing = chatMap.get(c.id);
          if (!existing) {
            chatMap.set(c.id, { ...c });
          } else {
            const cTime = new Date(c.updated_at || c.created_at || 0).getTime();
            const exTime = new Date(existing.updated_at || existing.created_at || 0).getTime();
            if (cTime > exTime) {
              chatMap.set(c.id, { ...existing, ...c });
            }
          }
        }
      });
    } catch {
      // ignore parse errors
    }
  });

  return Array.from(chatMap.values());
}

function readCachedMessages(userKey, deletedIds) {
  const msgMap = new Map();
  if (typeof localStorage === 'undefined') return [];
  const keysToScan = new Set([
    STORAGE_MESSAGES_PREFIX + (userKey || 'guest'),
    STORAGE_MESSAGES_PREFIX + 'all',
    STORAGE_MESSAGES_PREFIX + 'guest',
    STORAGE_MESSAGES_PREFIX + 'athlete',
  ]);
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(STORAGE_MESSAGES_PREFIX)) {
      keysToScan.add(k);
    }
  }

  keysToScan.forEach((key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      parsed.forEach((m) => {
        if (!m || !m.id) return;
        const chatId = getMessageChatId(m);
        if (deletedIds.has(chatId)) return;
        const rawId = String(m.id);
        const canonicalId = normalizeMessageId(
          rawId,
          `${chatId}:${m.role}:${m.created_at || m.created_date || ''}:${(m.content || '').slice(0, 48)}`
        );
        const normalized = {
          ...m,
          id: canonicalId,
          created_date: m.created_date || m.created_at || m.createdAt || new Date(0).toISOString(),
          created_at: m.created_at || m.created_date || m.createdAt || new Date(0).toISOString(),
          created_by: chatId,
          // Never leave an old interrupted stream stuck in streaming state after hard reload
          isStreaming: false,
          _synced: Boolean(m._synced),
        };
        const existing = msgMap.get(normalized.id);
        if (!existing) {
          msgMap.set(normalized.id, normalized);
        } else {
          msgMap.set(normalized.id, {
            ...existing,
            ...normalized,
            content:
              normalized.content && normalized.content.length >= (existing.content?.length || 0)
                ? normalized.content
                : existing.content,
            _synced: Boolean(existing._synced || normalized._synced),
          });
        }
      });
    } catch {
      // ignore parse errors
    }
  });

  return deduplicateMessages(Array.from(msgMap.values())).uniqueMessages;
}

function readSavedActiveChatId(userKey) {
  if (typeof localStorage === 'undefined') return null;
  return (
    localStorage.getItem(STORAGE_ACTIVE_PREFIX + userKey) ||
    localStorage.getItem(STORAGE_ACTIVE_PREFIX + 'all') ||
    localStorage.getItem(STORAGE_ACTIVE_PREFIX + 'guest') ||
    null
  );
}

function persistSnapshotToStorage(userKey, conversations, messages, activeChatId) {
  if (typeof localStorage === 'undefined') return;
  try {
    const { uniqueMessages } = deduplicateMessages(messages);
    const cleanMessages = uniqueMessages
      .filter((m) => m && !m.isError)
      .map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        created_at: m.created_at || m.created_date,
        created_date: m.created_date || m.created_at,
        created_by: m.created_by || 'chat_initial',
        user_id: m.user_id || null,
        isStreaming: Boolean(m.isStreaming),
        _synced: Boolean(m._synced),
      }))
      .slice(-1000);

    const msgKeys = new Set([
      STORAGE_MESSAGES_PREFIX + (userKey || 'guest'),
      STORAGE_MESSAGES_PREFIX + 'all',
      STORAGE_MESSAGES_PREFIX + 'guest',
    ]);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_MESSAGES_PREFIX)) {
        msgKeys.add(k);
      }
    }
    const serializedMsgs = JSON.stringify(cleanMessages);
    msgKeys.forEach((k) => {
      try {
        localStorage.setItem(k, serializedMsgs);
      } catch {
        // ignore quota exceeded
      }
    });

    const chatKeys = new Set([
      STORAGE_CHATS_PREFIX + (userKey || 'guest'),
      STORAGE_CHATS_PREFIX + 'all',
      STORAGE_CHATS_PREFIX + 'guest',
    ]);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_CHATS_PREFIX)) {
        chatKeys.add(k);
      }
    }
    const serializedChats = JSON.stringify(conversations);
    chatKeys.forEach((k) => {
      try {
        localStorage.setItem(k, serializedChats);
      } catch {
        // ignore quota exceeded
      }
    });

    if (activeChatId) {
      const activeKeys = new Set([
        STORAGE_ACTIVE_PREFIX + (userKey || 'guest'),
        STORAGE_ACTIVE_PREFIX + 'all',
        STORAGE_ACTIVE_PREFIX + 'guest',
      ]);
      activeKeys.forEach((k) => {
        try {
          localStorage.setItem(k, activeChatId);
        } catch {
          // ignore
        }
      });
    }
  } catch {
    // ignore storage errors
  }

  // Mirror asynchronously to IndexedDB for durable cross-session persistence
  writeIndexedDBSnapshot(userKey, {
    conversations,
    messages: messages.filter((m) => m && !m.isError).slice(-1000),
    activeChatId,
    updatedAt: Date.now(),
  }).catch(() => {});
}

function openKaelIDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB unavailable'));
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function writeIndexedDBSnapshot(key, value) {
  const db = await openKaelIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, `snapshot_${key || 'guest'}`);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function readIndexedDBSnapshot(key) {
  try {
    const db = await openKaelIDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(`snapshot_${key || 'guest'}`);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

function buildMergedThreads(baseChats, messagesList, deletedIds) {
  const chatMap = new Map();

  baseChats.forEach((c) => {
    if (c && c.id && !deletedIds.has(c.id)) {
      chatMap.set(c.id, { ...c });
    }
  });

  const byChat = new Map();
  messagesList.forEach((m) => {
    const chatId = getMessageChatId(m);
    if (deletedIds.has(chatId)) return;
    if (!byChat.has(chatId)) byChat.set(chatId, []);
    byChat.get(chatId).push(m);
  });

  byChat.forEach((chatMsgs, chatId) => {
    const existing = chatMap.get(chatId);
    const firstUserMsg = chatMsgs.find((m) => m.role === 'user');
    const lastMsg = chatMsgs[chatMsgs.length - 1];
    const inferredTitle =
      chatId === 'chat_initial'
        ? 'General Coaching'
        : firstUserMsg
          ? generateChatTitle(firstUserMsg.content)
          : 'Chat';

    if (!existing) {
      chatMap.set(chatId, {
        id: chatId,
        title: inferredTitle,
        created_at: chatMsgs[0]?.created_date || chatMsgs[0]?.created_at || new Date().toISOString(),
        updated_at: lastMsg?.created_date || lastMsg?.created_at || new Date().toISOString(),
        last_message: (lastMsg?.content || '').slice(0, 100),
      });
    } else {
      const lastMsgTime = new Date(lastMsg?.created_date || lastMsg?.created_at || 0).getTime();
      const existingTime = new Date(existing.updated_at || existing.created_at || 0).getTime();
      const nextLastPreview = (lastMsg?.content || '').slice(0, 100);
      chatMap.set(chatId, {
        ...existing,
        title: (!existing.title || existing.title === 'New Chat') && firstUserMsg
          ? generateChatTitle(firstUserMsg.content)
          : existing.title,
        last_message: nextLastPreview || existing.last_message || '',
        updated_at: lastMsgTime > existingTime
          ? (lastMsg?.created_date || lastMsg?.created_at)
          : (existing.updated_at || existing.created_at),
      });
    }
  });

  let mergedChats = Array.from(chatMap.values());
  if (mergedChats.length === 0) {
    mergedChats = [
      {
        id: `chat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        title: 'New Chat',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_message: '',
      },
    ];
  }

  mergedChats.sort(
    (a, b) =>
      new Date(b.updated_at || b.created_at || 0).getTime() -
      new Date(a.updated_at || a.created_at || 0).getTime()
  );

  return mergedChats;
}

function messagesEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].id !== b[i].id ||
      a[i].content !== b[i].content ||
      a[i].isStreaming !== b[i].isStreaming ||
      a[i].created_by !== b[i].created_by ||
      a[i].role !== b[i].role
    ) {
      return false;
    }
  }
  return true;
}

function chatsEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].id !== b[i].id ||
      a[i].title !== b[i].title ||
      a[i].last_message !== b[i].last_message ||
      a[i].updated_at !== b[i].updated_at
    ) {
      return false;
    }
  }
  return true;
}

function hydrateInitialState() {
  const userKey = getInitialUserKey();
  const deletedIds = readDeletedChatIds(userKey);
  const cachedMessages = readCachedMessages(userKey, deletedIds);
  const cachedChats = readCachedChats(userKey, deletedIds);
  const conversations = buildMergedThreads(cachedChats, cachedMessages, deletedIds);
  const savedActiveId = readSavedActiveChatId(userKey);
  const activeChatId =
    savedActiveId && conversations.some((c) => c.id === savedActiveId)
      ? savedActiveId
      : conversations[0].id;

  return {
    userKey,
    conversations,
    messages: cachedMessages,
    activeChatId,
    isSending: false,
    hydrated: true,
    syncing: false,
  };
}

let state = hydrateInitialState();
const listeners = new Set();
let activeRemoteSyncPromise = null;
let lastStreamPersistAt = 0;

function emitChange() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // ignore listener errors
    }
  });
}

function setState(updater, { persist = false } = {}) {
  const next = typeof updater === 'function' ? updater(state) : { ...state, ...updater };
  if (next === state) return;
  state = next;
  if (persist) {
    persistSnapshotToStorage(state.userKey, state.conversations, state.messages, state.activeChatId);
  }
  emitChange();
}

export const kaelStore = {
  getSnapshot() {
    return state;
  },

  subscribe(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  ensureUser(userId) {
    const nextKey = normalizeUserKey(userId);
    if (nextKey === state.userKey) return;

    // Non-destructive migration when userId changes from guest -> real UUID:
    // Keep any messages & active conversation already in memory and merge cached data
    const deletedIds = readDeletedChatIds(nextKey);
    const cachedMsgs = readCachedMessages(nextKey, deletedIds);
    const cachedChats = readCachedChats(nextKey, deletedIds);

    const msgMap = new Map();
    cachedMsgs.forEach((m) => msgMap.set(m.id, m));
    state.messages.forEach((m) => {
      if (m && m.id && !deletedIds.has(getMessageChatId(m))) {
        msgMap.set(m.id, { ...(msgMap.get(m.id) || {}), ...m });
      }
    });

    const mergedMsgs = Array.from(msgMap.values()).sort(
      (a, b) => new Date(a.created_date || a.created_at || 0).getTime() - new Date(b.created_date || b.created_at || 0).getTime()
    );
    const mergedChats = buildMergedThreads([...cachedChats, ...state.conversations], mergedMsgs, deletedIds);

    const savedActive = readSavedActiveChatId(nextKey);
    const nextActiveId =
      state.activeChatId && mergedChats.some((c) => c.id === state.activeChatId)
        ? state.activeChatId
        : savedActive && mergedChats.some((c) => c.id === savedActive)
          ? savedActive
          : mergedChats[0].id;

    setState(
      {
        ...state,
        userKey: nextKey,
        conversations: mergedChats,
        messages: mergedMsgs,
        activeChatId: nextActiveId,
      },
      { persist: true }
    );
  },

  async syncWithRemote(userId) {
    const targetKey = normalizeUserKey(userId);
    this.ensureUser(targetKey);

    if (activeRemoteSyncPromise) {
      return activeRemoteSyncPromise;
    }

    activeRemoteSyncPromise = (async () => {
      try {
        // Also check IndexedDB snapshot in case localStorage was evicted
        const idbSnap = await readIndexedDBSnapshot(targetKey);
        const deletedIds = readDeletedChatIds(targetKey);

        const remoteMsgs = await supabaseApi.entities.KaelMessage.filter({}, 'created_at', 1000).catch(() => []);
        const normalizedRemote = Array.isArray(remoteMsgs)
          ? remoteMsgs
              .filter((m) => m && m.id && !deletedIds.has(getMessageChatId(m)))
              .map((m) => {
                const chatId = getMessageChatId(m);
                const canonicalId = normalizeMessageId(
                  m.id,
                  `${chatId}:${m.role}:${m.created_at || m.created_date || ''}:${(m.content || '').slice(0, 48)}`
                );
                return {
                  ...m,
                  id: canonicalId,
                  created_date: m.created_date || m.created_at || m.createdAt || new Date(0).toISOString(),
                  created_at: m.created_at || m.created_date || m.createdAt || new Date(0).toISOString(),
                  created_by: chatId,
                  isStreaming: false,
                  _synced: Boolean(m._synced),
                };
              })
          : [];

        const msgMap = new Map();

        // Layer 1: IndexedDB backup
        if (idbSnap?.messages && Array.isArray(idbSnap.messages)) {
          idbSnap.messages.forEach((m) => {
            if (m?.id && !deletedIds.has(getMessageChatId(m))) {
              const chatId = getMessageChatId(m);
              const canonicalId = normalizeMessageId(
                m.id,
                `${chatId}:${m.role}:${m.created_at || m.created_date || ''}:${(m.content || '').slice(0, 48)}`
              );
              const prev = msgMap.get(canonicalId);
              msgMap.set(canonicalId, {
                ...(prev || {}),
                ...m,
                id: canonicalId,
                created_by: chatId,
                isStreaming: false,
                _synced: Boolean(prev?._synced || m._synced),
              });
            }
          });
        }

        // Layer 2: Remote (Supabase) authoritative records
        normalizedRemote.forEach((m) => {
          const existing = msgMap.get(m.id);
          msgMap.set(m.id, {
            ...(existing || {}),
            ...m,
            _synced: Boolean(existing?._synced || m._synced),
          });
        });

        // Layer 3: Current in-memory state ALWAYS wins for active/unsynced/in-flight messages!
        state.messages.forEach((m) => {
          if (!m || !m.id || deletedIds.has(getMessageChatId(m))) return;
          const existing = msgMap.get(m.id);
          if (!existing || m.isStreaming || m._localOnly || (m.content && m.content.length >= (existing.content?.length || 0))) {
            msgMap.set(m.id, {
              ...(existing || {}),
              ...m,
              _synced: Boolean(existing?._synced || m._synced),
            });
          }
        });

        const { uniqueMessages: mergedMessages, redundantSyncedIds } = deduplicateMessages(
          Array.from(msgMap.values())
        );

        const cachedChats = readCachedChats(targetKey, deletedIds);
        const idbChats = Array.isArray(idbSnap?.conversations) ? idbSnap.conversations : [];
        const mergedChats = buildMergedThreads(
          [...idbChats, ...cachedChats, ...state.conversations],
          mergedMessages,
          deletedIds
        );

        // Preserve user's current activeChatId whenever valid so we never visually switch threads
        const nextActiveId =
          state.activeChatId && mergedChats.some((c) => c.id === state.activeChatId)
            ? state.activeChatId
            : mergedChats[0].id;

        const hasChanges =
          !messagesEqual(state.messages, mergedMessages) ||
          !chatsEqual(state.conversations, mergedChats) ||
          state.activeChatId !== nextActiveId;

        if (hasChanges) {
          setState(
            {
              ...state,
              conversations: mergedChats,
              messages: mergedMessages,
              activeChatId: nextActiveId,
            },
            { persist: true }
          );
        }

        // Clean up any duplicate rows that accumulated in Supabase kael_messages
        if (targetKey && targetKey !== 'guest' && redundantSyncedIds.length > 0) {
          const validDupIds = redundantSyncedIds.filter((id) => UUID_REGEX.test(id));
          if (validDupIds.length > 0 && typeof supabaseApi?.entities?.KaelMessage?.deleteDuplicateIds === 'function') {
            supabaseApi.entities.KaelMessage.deleteDuplicateIds(validDupIds).catch(() => {});
          }
        }

        // Backfill any unsynced local messages (that are not yet confirmed in Supabase)
        if (targetKey && targetKey !== 'guest') {
          const syncedRemoteIds = new Set(
            normalizedRemote.filter((m) => m._synced).map((m) => m.id)
          );
          const unsynced = mergedMessages.filter(
            (m) =>
              m &&
              m.id &&
              !m.isStreaming &&
              !m.isError &&
              !m._synced &&
              !syncedRemoteIds.has(m.id) &&
              typeof m.content === 'string' &&
              m.content.trim().length > 0
          );

          const newlySyncedIds = new Set();
          for (const msg of unsynced.slice(-40)) {
            try {
              const saved = await supabaseApi.entities.KaelMessage.create({
                id: msg.id,
                role: msg.role,
                content: msg.content,
                created_at: msg.created_at || msg.created_date,
                created_by: msg.created_by || 'chat_initial',
              });
              if (saved?._synced) {
                newlySyncedIds.add(msg.id);
              }
            } catch {
              // ignore individual backfill failure
            }
          }

          if (newlySyncedIds.size > 0) {
            setState(
              (prev) => ({
                ...prev,
                messages: prev.messages.map((m) =>
                  newlySyncedIds.has(m.id) ? { ...m, _synced: true, _localOnly: false } : m
                ),
              }),
              { persist: true }
            );
          }
        }
      } finally {
        activeRemoteSyncPromise = null;
      }
    })();

    return activeRemoteSyncPromise;
  },

  setSending(isSending) {
    if (state.isSending === isSending) return;
    setState({ ...state, isSending });
  },

  selectChat(chatId) {
    if (!chatId || chatId === state.activeChatId) return;
    setState(
      {
        ...state,
        activeChatId: chatId,
        isSending: false,
      },
      { persist: true }
    );
  },

  createNewChat() {
    const newChat = {
      id: `chat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: 'New Chat',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_message: '',
    };
    const nextConversations = [newChat, ...state.conversations];
    setState(
      {
        ...state,
        conversations: nextConversations,
        activeChatId: newChat.id,
        isSending: false,
      },
      { persist: true }
    );
    return newChat;
  },

  renameChat(chatId, newTitle) {
    const cleanTitle = (newTitle || '').trim() || 'Chat';
    const nextConversations = state.conversations.map((c) =>
      c.id === chatId ? { ...c, title: cleanTitle } : c
    );
    setState(
      {
        ...state,
        conversations: nextConversations,
      },
      { persist: true }
    );
  },

  async deleteChat(chatId) {
    if (!chatId) return;
    writeDeletedChatId(state.userKey, chatId);

    const remainingMessages = state.messages.filter((m) => getMessageChatId(m) !== chatId);
    const remainingChats = state.conversations.filter((c) => c.id !== chatId);

    let nextConversations = remainingChats;
    let nextActiveId = state.activeChatId;

    if (nextConversations.length > 0) {
      if (state.activeChatId === chatId) {
        nextActiveId = nextConversations[0].id;
      }
    } else {
      const freshChat = {
        id: `chat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        title: 'New Chat',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_message: '',
      };
      nextConversations = [freshChat];
      nextActiveId = freshChat.id;
    }

    setState(
      {
        ...state,
        conversations: nextConversations,
        messages: remainingMessages,
        activeChatId: nextActiveId,
      },
      { persist: true }
    );

    try {
      await supabaseApi.entities.KaelMessage.deleteChat(chatId);
    } catch (err) {
      console.warn('[kaelStore] Remote chat deletion note:', err);
    }
  },

  startMessageExchange(trimmedText) {
    let targetChatId = state.activeChatId;
    let nextConversations = [...state.conversations];

    if (!targetChatId || !nextConversations.some((c) => c.id === targetChatId)) {
      targetChatId = `chat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      nextConversations.unshift({
        id: targetChatId,
        title: generateChatTitle(trimmedText),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_message: trimmedText.slice(0, 100),
      });
    } else {
      nextConversations = nextConversations.map((c) => {
        if (c.id !== targetChatId) return c;
        const needsTitle = !c.title || c.title === 'New Chat';
        return {
          ...c,
          title: needsTitle ? generateChatTitle(trimmedText) : c.title,
          updated_at: new Date().toISOString(),
          last_message: trimmedText.slice(0, 100),
        };
      });
    }

    const nowIso = new Date().toISOString();
    const assistantIso = new Date(Date.now() + 1).toISOString();

    const userMessage = {
      id: generateUUID(),
      role: 'user',
      content: trimmedText,
      created_date: nowIso,
      created_at: nowIso,
      created_by: targetChatId,
      _localOnly: true,
    };

    const assistantMessage = {
      id: generateUUID(),
      role: 'assistant',
      content: '',
      created_date: assistantIso,
      created_at: assistantIso,
      created_by: targetChatId,
      isStreaming: true,
      _localOnly: true,
    };

    const nextMessages = [...state.messages, userMessage, assistantMessage];

    setState(
      {
        ...state,
        conversations: nextConversations,
        activeChatId: targetChatId,
        messages: nextMessages,
        isSending: true,
      },
      { persist: true }
    );

    // Immediately persist user message in remote DB so it is safe even before Kael finishes
    supabaseApi.entities.KaelMessage.create({
      id: userMessage.id,
      role: 'user',
      content: userMessage.content,
      created_at: userMessage.created_at,
      created_by: targetChatId,
    })
      .then((saved) => {
        if (saved?._synced) {
          setState(
            (prev) => ({
              ...prev,
              messages: prev.messages.map((m) =>
                m.id === userMessage.id ? { ...m, _synced: true, _localOnly: false } : m
              ),
            }),
            { persist: true }
          );
        }
      })
      .catch(() => {});

    return {
      chatId: targetChatId,
      userMessage,
      assistantId: assistantMessage.id,
      assistantMessage,
    };
  },

  updateStreamingMessage(assistantId, content) {
    if (!assistantId) return;
    let changed = false;
    const nextMessages = state.messages.map((m) => {
      if (m.id === assistantId) {
        if (m.content === content) return m;
        changed = true;
        return { ...m, content, isStreaming: true };
      }
      return m;
    });
    if (!changed) return;

    const now = Date.now();
    const shouldPersistNow = now - lastStreamPersistAt > 800;
    if (shouldPersistNow) {
      lastStreamPersistAt = now;
    }

    setState(
      {
        ...state,
        messages: nextMessages,
      },
      { persist: shouldPersistNow }
    );
  },

  async finalizeAssistantMessage(chatId, assistantId, responseText, userPromptText) {
    const finalizedAt = new Date().toISOString();
    let finalAssistantRecord = null;

    const nextMessages = state.messages.map((m) => {
      if (m.id === assistantId) {
        finalAssistantRecord = {
          ...m,
          content: responseText,
          isStreaming: false,
          isError: false,
          created_at: m.created_at || finalizedAt,
          created_date: m.created_date || finalizedAt,
          _localOnly: false,
          _synced: false,
        };
        return finalAssistantRecord;
      }
      return m;
    });

    const nextConversations = state.conversations
      .map((c) => {
        if (c.id === chatId) {
          const needsTitle = !c.title || c.title === 'New Chat';
          return {
            ...c,
            title: needsTitle ? generateChatTitle(userPromptText) : c.title,
            updated_at: finalizedAt,
            last_message: responseText.slice(0, 100),
          };
        }
        return c;
      })
      .sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at || 0).getTime() -
          new Date(a.updated_at || a.created_at || 0).getTime()
      );

    setState(
      {
        ...state,
        conversations: nextConversations,
        messages: nextMessages,
        isSending: false,
      },
      { persist: true }
    );

    try {
      const saved = await supabaseApi.entities.KaelMessage.create({
        id: assistantId,
        role: 'assistant',
        content: responseText,
        created_at: finalAssistantRecord?.created_at || finalizedAt,
        created_by: chatId,
      });
      if (saved?._synced) {
        setState(
          (prev) => ({
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === assistantId ? { ...m, _synced: true } : m
            ),
          }),
          { persist: true }
        );
      }
    } catch (saveErr) {
      console.warn('[kaelStore] Remote assistant save note:', saveErr);
    }
  },

  failAssistantMessage(assistantId, errorMessageText) {
    const nextMessages = state.messages.map((m) => {
      if (m.id === assistantId) {
        return {
          ...m,
          content: errorMessageText,
          isStreaming: false,
          isError: true,
          _localOnly: true,
        };
      }
      return m;
    });

    setState(
      {
        ...state,
        messages: nextMessages,
        isSending: false,
      },
      { persist: true }
    );
  },
};

export function useKaelStore() {
  return useSyncExternalStore(kaelStore.subscribe, kaelStore.getSnapshot, kaelStore.getSnapshot);
}
