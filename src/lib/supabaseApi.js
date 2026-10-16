import { supabase } from '@/lib/supabase';
import { getUserTimeZone } from '@/lib/dateUtils';
import {
  auth as firebaseAuth,
  db as firebaseDb,
  doc as firestoreDoc,
  setDoc as firestoreSetDoc,
  deleteDoc as firestoreDeleteDoc,
  collection as firestoreCollection,
  getDocs as firestoreGetDocs,
} from '@/lib/firebase';
import { getOrCreateUserProfile } from '@/lib/firebaseApi';
import { isLogo } from '@/lib/avatarUtils';

const MEDIA_BUCKET =
  import.meta.env.VITE_SUPABASE_MEDIA_BUCKET ||
  'user-media';

const AI_FUNCTION =
  import.meta.env.VITE_SUPABASE_AI_FUNCTION ||
  'ai-generate';

const EMAIL_FUNCTION =
  import.meta.env.VITE_SUPABASE_EMAIL_FUNCTION ||
  'send-contact-email';


function errorFrom(
  error,
  fallback = 'Supabase request failed.'
) {
  if (!error) {
    return new Error(fallback);
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(
    error.message ||
    error.details ||
    error.hint ||
    fallback
  );
}


export function ensureValidUuid(str) {
  if (!str || typeof str !== 'string') return null;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(str)) return str;

  // Convert non-UUID (e.g. Firebase alphanumeric UID) deterministically to standard UUID format
  let hash = 0;
  let hash2 = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    hash2 = ((hash2 << 7) - hash2 + str.charCodeAt(i)) | 0;
  }
  const hex1 = Math.abs(hash).toString(16).padStart(8, '0');
  const hex2 = Math.abs(hash2).toString(16).padStart(8, '0');
  const combined = (hex1 + hex2 + hex1 + hex2).slice(0, 32);
  return `${combined.slice(0, 8)}-${combined.slice(8, 12)}-4${combined.slice(13, 16)}-a${combined.slice(17, 20)}-${combined.slice(20, 32)}`;
}

/*
 * ------------------------------------------------------------
 * AUTH
 * ------------------------------------------------------------
 */

async function requireUser() {
  // 1. Check active Supabase local session
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session?.user) {
      return sessionData.session.user;
    }
  } catch (err) {
    console.warn('[supabaseApi] getSession check warning:', err);
  }

  // 2. Query Supabase server
  try {
    const {
      data,
      error
    } = await supabase.auth.getUser();

    if (!error && data?.user) {
      return data.user;
    }
  } catch (err) {
    console.warn('[supabaseApi] getUser network error:', err);
  }

  // 3. Check Firebase active auth user
  try {
    if (!firebaseAuth?.currentUser && typeof firebaseAuth?.authStateReady === 'function') {
      await Promise.race([
        firebaseAuth.authStateReady(),
        new Promise((r) => setTimeout(r, 250)),
      ]);
    }
    if (firebaseAuth?.currentUser) {
      const fb = firebaseAuth.currentUser;
      const validId = ensureValidUuid(fb.uid);
      return {
        id: validId,
        uid: fb.uid,
        email: fb.email || '',
        user_metadata: {
          first_name: fb.displayName ? fb.displayName.split(' ')[0] : '',
          last_name: fb.displayName ? fb.displayName.split(' ').slice(1).join(' ') : '',
          full_name: fb.displayName || fb.email?.split('@')[0] || 'Athlete',
          email: fb.email || '',
          role: 'athlete',
        },
      };
    }
  } catch (err) {
    console.debug('[supabaseApi] firebase currentUser check note:', err);
  }

  // 4. Check cached user in localStorage (washek_user)
  try {
    const stored = localStorage.getItem('washek_user');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed?.id || parsed?.uid || parsed?.email) {
        const validId = ensureValidUuid(parsed.id || parsed.uid || parsed.email);
        return {
          id: validId,
          uid: parsed.uid || parsed.id || validId,
          email: parsed.email || '',
          user_metadata: {
            first_name: parsed.first_name || '',
            last_name: parsed.last_name || '',
            full_name: parsed.full_name || parsed.email || 'Athlete',
            email: parsed.email || '',
            role: parsed.role || 'athlete',
          },
        };
      }
    }
  } catch (err) {
    console.debug('[supabaseApi] localStorage check note:', err);
  }

  throw new Error(
    'Your login session is missing. Please sign in again.'
  );
}


/*
 * ------------------------------------------------------------
 * PROFILE
 * ------------------------------------------------------------
 */

async function getProfile(userId) {
  try {
    const {
      data,
      error
    } =
      await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

    if (!error && data) {
      return data;
    }
  } catch (err) {
    console.warn('[supabaseApi] getProfile network or query warning:', err);
  }

  return null;
}


function normalizeUser(authUser, profile = {}) {
  const safeProfile = profile || {};
  const firstName =
    safeProfile.first_name ||
    authUser.user_metadata?.first_name ||
    '';

  const lastName =
    safeProfile.last_name ||
    authUser.user_metadata?.last_name ||
    '';

  const fullName =
    safeProfile.full_name ||
    [firstName, lastName]
      .filter(Boolean)
      .join(' ') ||
    authUser.user_metadata?.full_name ||
    authUser.email ||
    'Athlete';

  const detectedTz = getUserTimeZone();
  const effectiveTz = safeProfile.timezone || detectedTz;

  // Auto-sync detected timezone to profile in background if missing
  if ((!safeProfile.timezone || safeProfile.timezone === 'UTC') && authUser?.id && detectedTz && detectedTz !== 'UTC') {
    supabase
      .from('profiles')
      .update({ timezone: detectedTz })
      .eq('id', authUser.id)
      .then(() => {})
      .catch(() => {});
  }

  const cleansedAvatar = safeProfile.avatar_url && !isLogo(safeProfile.avatar_url) ? safeProfile.avatar_url : null;

  return {
    id: authUser.id,
    email: authUser.email,
    role: safeProfile.role || authUser.user_metadata?.role || 'user',
    ...safeProfile,
    avatar_url: cleansedAvatar,
    photo_url: cleansedAvatar,
    timezone: effectiveTz,
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
  };
}


/*
 * ------------------------------------------------------------
 * CURRENT USER
 * ------------------------------------------------------------
 */

async function currentUser() {
  // 1. If Firebase auth currentUser exists, resolve or create Firestore profile
  try {
    if (firebaseAuth?.currentUser) {
      const fbProfile = await getOrCreateUserProfile(firebaseAuth.currentUser);
      if (fbProfile) {
        return fbProfile;
      }
    }
  } catch (err) {
    console.debug('[supabaseApi] Firebase profile error note:', err);
  }

  // 2. If stored in localStorage, return cached washek_user
  try {
    const stored = localStorage.getItem('washek_user');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed?.email) {
        if (isLogo(parsed.avatar_url) || isLogo(parsed.photo_url)) {
          parsed.avatar_url = null;
          parsed.photo_url = null;
          try {
            localStorage.setItem('washek_user', JSON.stringify(parsed));
          } catch (_err) {
            // Ignore local storage error
          }
        }
        return parsed;
      }
    }
  } catch (err) {
    console.debug('[supabaseApi] localStorage parse note:', err);
  }

  // 3. Fallback to Supabase auth user and profile
  try {
    const user = await requireUser();
    let profile = await getProfile(user.id);

    if (!profile) {
      // Generate graceful fallback profile from auth user metadata
      profile = {
        id: user.id,
        email: user.email,
        first_name: user.user_metadata?.first_name || '',
        last_name: user.user_metadata?.last_name || '',
        full_name:
          user.user_metadata?.full_name ||
          user.user_metadata?.first_name ||
          user.email ||
          'Athlete',
        role: user.user_metadata?.role || 'athlete',
        training_type: user.user_metadata?.training_type || 'calisthenics',
        fitness_level: user.user_metadata?.fitness_level || 'intermediate',
      };

      // Auto-create missing profile row asynchronously if possible
      supabase
        .from('profiles')
        .upsert(profile, { onConflict: 'id' })
        .then(() => {})
        .catch(() => {});
    }

    return normalizeUser(user, profile);
  } catch {
    return null;
  }
}


/*
 * ------------------------------------------------------------
 * FILTERING
 * ------------------------------------------------------------
 */

const ORDER_ALIASES = {
  created_date: 'created_at',
  updated_date: 'updated_at',
};


function applyFilters(query, filters = {}, userId) {
  let q = query;

  for (const [key, value] of Object.entries(filters || {})) {
    if (key === 'created_by') continue;
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      q = q.in(key, value);
    } else {
      q = q.eq(key, value);
    }
  }

  if (userId) {
    const validUuid = ensureValidUuid(userId);
    if (validUuid) {
      q = q.eq('user_id', validUuid);
    }
  }

  return q;
}


/*
 * ------------------------------------------------------------
 * ENTITY LOCAL STORAGE & PERSISTENCE HELPERS
 * ------------------------------------------------------------
 */

function getEntityStorageKey(table, userId) {
  return `washek_entity_${table}_${userId || 'guest'}`;
}

function getLocalEntityRecords(table, userId) {
  if (typeof localStorage === 'undefined') return [];
  const results = [];
  const seen = new Set();
  const keys = [
    getEntityStorageKey(table, userId),
    getEntityStorageKey(table, 'guest'),
    `washek_entity_${table}_all`,
  ];

  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && item.id && !seen.has(item.id)) {
              seen.add(item.id);
              results.push(item);
            }
          }
        }
      }
    } catch (_err) {
      // Ignore parse errors
    }
  }
  return results;
}

function saveLocalEntityRecord(table, userId, record) {
  if (typeof localStorage === 'undefined' || !record?.id) return;
  const keys = new Set([
    getEntityStorageKey(table, userId),
    getEntityStorageKey(table, 'guest'),
    getEntityStorageKey(table, 'athlete'),
    `washek_entity_${table}_all`,
  ]);

  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const existing = JSON.parse(raw);
        if (Array.isArray(existing)) {
          const idx = existing.findIndex((item) => item?.id === record.id);
          if (idx >= 0) {
            existing[idx] = { ...existing[idx], ...record };
            localStorage.setItem(key, JSON.stringify(existing.slice(0, 1000)));
          }
        }
      }
    } catch (_err) {
      // Ignore quota errors
    }
  }

  // Also ensure primaryKey has the record unshifted if not already in it
  const primaryKey = getEntityStorageKey(table, userId);
  try {
    const existing = JSON.parse(localStorage.getItem(primaryKey) || '[]');
    const idx = existing.findIndex((item) => item?.id === record.id);
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], ...record };
    } else {
      existing.unshift(record);
    }
    localStorage.setItem(primaryKey, JSON.stringify(existing.slice(0, 1000)));
  } catch (_err) {
    // Ignore quota errors
  }
}

function removeLocalEntityRecord(table, userId, recordId) {
  if (typeof localStorage === 'undefined' || !recordId) return;
  const keys = [
    getEntityStorageKey(table, userId),
    getEntityStorageKey(table, 'guest'),
    getEntityStorageKey(table, 'athlete'),
    `washek_entity_${table}_all`,
  ];
  for (const key of keys) {
    try {
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      const filtered = existing.filter((item) => item?.id !== recordId);
      localStorage.setItem(key, JSON.stringify(filtered));
    } catch (_err) {
      // Ignore
    }
  }
}

async function syncToFirestore(table, record, action = 'set') {
  try {
    const fbUser = firebaseAuth?.currentUser;
    if (!fbUser || !firebaseDb) return;
    const subCol = table === 'nutrition_entries'
      ? 'nutrition_entries'
      : (table === 'workout_logs'
        ? 'workouts'
        : (table === 'progress_photos'
          ? 'progress_photos'
          : (table === 'weight_history' ? 'weight_history' : null)));
    if (!subCol) return;
    const ref = firestoreDoc(firebaseDb, 'users', fbUser.uid, subCol, record.id);
    if (action === 'delete') {
      await firestoreDeleteDoc(ref);
    } else {
      await firestoreSetDoc(ref, record, { merge: true });
    }
  } catch (err) {
    console.debug(`[Firestore] ${table} ${action} note:`, err?.message || err);
  }
}

async function fetchFromFirestore(table) {
  try {
    const fbUser = firebaseAuth?.currentUser;
    if (!fbUser || !firebaseDb) return [];
    const subCol = table === 'nutrition_entries'
      ? 'nutrition_entries'
      : (table === 'workout_logs'
        ? 'workouts'
        : (table === 'progress_photos' ? 'progress_photos' : null));
    if (!subCol) return [];
    const colRef = firestoreCollection(firebaseDb, 'users', fbUser.uid, subCol);
    const snap = await firestoreGetDocs(colRef);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.debug(`[Firestore] fetch ${table} note:`, err?.message || err);
    return [];
  }
}

/*
 * ------------------------------------------------------------
 * GENERIC ENTITIES & SUPABASE SCHEMA SANITIZATION
 * ------------------------------------------------------------
 */

const KNOWN_TABLE_COLUMNS = {
  progress_photos: new Set([
    'id',
    'user_id',
    'created_by',
    'photo_url',
    'date',
    'weight_lbs',
    'body_fat_estimate',
    'body_fat_numeric',
    'ai_insights',
    'created_at',
    'updated_at',
  ]),
  workout_programs: new Set([
    'id',
    'user_id',
    'created_by',
    'program_name',
    'duration_weeks',
    'macrocycle',
    'mesocycles',
    'microcycles',
    'training_type',
    'fitness_level',
    'goal',
    'current_week',
    'status',
    'created_at',
    'updated_at',
  ]),
  workout_logs: new Set([
    'id',
    'user_id',
    'created_by',
    'program_id',
    'date',
    'week_number',
    'day_name',
    'exercises_completed',
    'duration_minutes',
    'post_workout_checkin',
    'ai_adjustment_notes',
    'created_at',
  ]),
  nutrition_entries: new Set([
    'id',
    'user_id',
    'created_by',
    'date',
    'meal_type',
    'food_name',
    'serving_size',
    'calories',
    'protein_g',
    'carbs_g',
    'fat_g',
    'created_at',
  ]),
  movement_baselines: new Set([
    'id',
    'user_id',
    'created_by',
    'recorded_date',
    'custom_entries',
    'created_at',
    'updated_at',
  ]),
  form_analyses: new Set([
    'id',
    'user_id',
    'created_by',
    'video_url',
    'exercise_name',
    'exercise_category',
    'score',
    'rep_count',
    'hold_time_seconds',
    'analysis',
    'issues',
    'priority_focus',
    'date',
    'created_at',
  ]),
  kael_messages: new Set([
    'id',
    'user_id',
    'created_by',
    'role',
    'content',
    'is_edit',
    'created_at',
  ]),
};

function sanitizeForSupabase(table, payload) {
  const allowed = KNOWN_TABLE_COLUMNS[table];
  if (!allowed) {
    const copy = { ...payload };
    delete copy.resolved_photo_url;
    return copy;
  }
  const clean = {};
  for (const [key, val] of Object.entries(payload)) {
    if (allowed.has(key) && val !== undefined) {
      clean[key] = val;
    }
  }
  return clean;
}

function entity(table) {
  return {
    async list(sort = '-created_at', limit = 100) {
      let validUserId = null;
      let user = null;
      try {
        user = await requireUser();
        validUserId = ensureValidUuid(user.id);
      } catch (_authErr) {
        // Guest or unauthenticated session
      }

      const localRecords = getLocalEntityRecords(table, validUserId);
      let remoteRecords = [];

      try {
        const rawColumn = sort.replace(/^-/, '');
        const column = ORDER_ALIASES[rawColumn] || rawColumn;
        const ascending = !sort.startsWith('-');

        let q = supabase.from(table).select('*');
        if (validUserId) {
          q = q.eq('user_id', validUserId);
        }
        q = q.order(column, { ascending });
        if (Number.isFinite(limit)) q = q.limit(limit);

        const { data, error } = await q;
        if (!error && Array.isArray(data)) {
          remoteRecords = data;
          remoteRecords.forEach((item) => saveLocalEntityRecord(table, validUserId, item));
        }
      } catch (_dbErr) {
        // Fallback to local and Firestore
      }

      let firestoreRecords = [];
      if (remoteRecords.length === 0) {
        firestoreRecords = await fetchFromFirestore(table);
        firestoreRecords.forEach((item) => saveLocalEntityRecord(table, validUserId, item));
      }

      const map = new Map();
      remoteRecords.forEach((item) => {
        if (item?.id) map.set(item.id, item);
      });
      firestoreRecords.forEach((item) => {
        if (item?.id) map.set(item.id, { ...(map.get(item.id) || {}), ...item });
      });
      localRecords.forEach((item) => {
        if (item?.id) {
          const prev = map.get(item.id) || {};
          map.set(item.id, {
            ...prev,
            ...item,
            weight_lbs: item.weight_lbs !== undefined && item.weight_lbs !== null ? item.weight_lbs : prev.weight_lbs,
            label: item.label !== undefined ? item.label : prev.label,
            custom_label: item.custom_label !== undefined ? item.custom_label : prev.custom_label,
            tags: Array.isArray(item.tags) && item.tags.length > 0 ? item.tags : prev.tags,
          });
        }
      });

      const merged = Array.from(map.values());
      const rawColumn = sort.replace(/^-/, '');
      const column = ORDER_ALIASES[rawColumn] || rawColumn;
      const ascending = !sort.startsWith('-');
      merged.sort((a, b) => {
        const vA = a[column] || a.created_at || a.created_date || a.date || '';
        const vB = b[column] || b.created_at || b.created_date || b.date || '';
        if (vA < vB) return ascending ? -1 : 1;
        if (vA > vB) return ascending ? 1 : -1;
        return 0;
      });

      return merged.slice(0, limit);
    },

    async filter(filters = {}, sort = '-created_at', limit = 100) {
      let validUserId = null;
      let user = null;
      try {
        user = await requireUser();
        validUserId = ensureValidUuid(user.id);
      } catch (_authErr) {
        // Guest or unauthenticated session
      }

      const allLocal = getLocalEntityRecords(table, validUserId);
      const localFiltered = allLocal.filter((item) => {
        for (const [key, value] of Object.entries(filters || {})) {
          if (value === undefined || value === null) continue;
          if (key === 'created_by') {
            if (item.created_by && item.created_by !== value && item.user_id !== validUserId) {
              return false;
            }
            continue;
          }
          if (key === 'date') {
            const itemDate = item.date || item.created_date || (typeof item.created_at === 'string' ? item.created_at.slice(0, 10) : null);
            if (itemDate !== value) return false;
            continue;
          }
          if (Array.isArray(value)) {
            if (!value.includes(item[key])) return false;
          } else if (item[key] !== value) {
            return false;
          }
        }
        return true;
      });

      let remoteRecords = [];
      try {
        const rawColumn = sort.replace(/^-/, '');
        const column = ORDER_ALIASES[rawColumn] || rawColumn;
        const ascending = !sort.startsWith('-');

        let q = applyFilters(supabase.from(table).select('*'), filters, validUserId).order(column, { ascending });
        if (Number.isFinite(limit)) q = q.limit(limit);

        const { data, error } = await q;
        if (!error && Array.isArray(data)) {
          remoteRecords = data;
          remoteRecords.forEach((item) => saveLocalEntityRecord(table, validUserId, item));
        }
      } catch (_dbErr) {
        // Supabase error fallback
      }

      let firestoreRecords = [];
      if (remoteRecords.length === 0) {
        firestoreRecords = await fetchFromFirestore(table);
        if (filters && Object.keys(filters).length > 0) {
          firestoreRecords = firestoreRecords.filter((item) => {
            for (const [key, value] of Object.entries(filters)) {
              if (value === undefined || value === null) continue;
              if (key === 'created_by') continue;
              if (key === 'date') {
                const itemDate = item.date || item.created_date || (typeof item.created_at === 'string' ? item.created_at.slice(0, 10) : null);
                if (itemDate !== value) return false;
                continue;
              }
              if (Array.isArray(value)) {
                if (!value.includes(item[key])) return false;
              } else if (item[key] !== value) {
                return false;
              }
            }
            return true;
          });
        }
        firestoreRecords.forEach((item) => saveLocalEntityRecord(table, validUserId, item));
      }

      const map = new Map();
      remoteRecords.forEach((item) => {
        if (item?.id) map.set(item.id, item);
      });
      firestoreRecords.forEach((item) => {
        if (item?.id) map.set(item.id, { ...(map.get(item.id) || {}), ...item });
      });
      localFiltered.forEach((item) => {
        if (item?.id) {
          const prev = map.get(item.id) || {};
          map.set(item.id, {
            ...prev,
            ...item,
            weight_lbs: item.weight_lbs !== undefined && item.weight_lbs !== null ? item.weight_lbs : prev.weight_lbs,
            label: item.label !== undefined ? item.label : prev.label,
            custom_label: item.custom_label !== undefined ? item.custom_label : prev.custom_label,
            tags: Array.isArray(item.tags) && item.tags.length > 0 ? item.tags : prev.tags,
          });
        }
      });

      const merged = Array.from(map.values());
      const rawColumn = sort.replace(/^-/, '');
      const column = ORDER_ALIASES[rawColumn] || rawColumn;
      const ascending = !sort.startsWith('-');
      merged.sort((a, b) => {
        const vA = a[column] || a.created_at || a.created_date || a.date || '';
        const vB = b[column] || b.created_at || b.created_date || b.date || '';
        if (vA < vB) return ascending ? -1 : 1;
        if (vA > vB) return ascending ? 1 : -1;
        return 0;
      });

      return merged.slice(0, limit);
    },

    async create(payload = {}) {
      let validUserId = null;
      let user = null;
      try {
        user = await requireUser();
        validUserId = ensureValidUuid(user?.id);
      } catch (_authErr) {
        // Fallback
      }

      const generatedId = payload.id || `${table.slice(0, 4)}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const nowIso = new Date().toISOString();
      const todayDate = nowIso.slice(0, 10);

      const row = {
        ...payload,
        id: generatedId,
        user_id: validUserId || payload.user_id || '00000000-0000-4000-a000-000000000000',
        created_at: payload.created_at || nowIso,
        created_date: payload.created_date || payload.date || todayDate,
        date: payload.date || todayDate,
      };

      if (payload.created_by && typeof payload.created_by === 'string' && payload.created_by.trim()) {
        row.created_by = payload.created_by.trim();
      } else if (user?.email) {
        row.created_by = user.email;
      } else if (user?.id) {
        row.created_by = user.id;
      } else {
        row.created_by = 'athlete';
      }

      if (table === 'nutrition_entries') {
        row.calories = Number(payload.calories) || 0;
        row.protein_g = Number(payload.protein_g) || 0;
        row.carbs_g = Number(payload.carbs_g) || 0;
        row.fat_g = Number(payload.fat_g) || 0;
        row.meal_type = payload.meal_type || 'snack';
        row.food_name = payload.food_name || 'Food item';
      }

      // 1. Immediately persist in local storage cache
      saveLocalEntityRecord(table, validUserId, row);

      // 2. Persist to Firestore
      syncToFirestore(table, row, 'set');

      // 3. Attempt Supabase insert with schema-safe columns
      try {
        const cleanPayload = sanitizeForSupabase(table, row);
        const { data, error } = await supabase.from(table).insert(cleanPayload).select().single();
        if (!error && data) {
          const merged = { ...row, ...data };
          saveLocalEntityRecord(table, validUserId, merged);
          return merged;
        }
        if (error) {
          console.warn(`[supabaseApi] Supabase insert note on ${table}:`, error.message);
        }
      } catch (err) {
        console.warn(`[supabaseApi] Supabase insert network note on ${table}:`, err?.message || err);
      }

      return row;
    },

    async update(id, payload = {}) {
      let validUserId = null;
      let user = null;
      try {
        user = await requireUser();
        validUserId = ensureValidUuid(user?.id);
      } catch (_authErr) {
        // Fallback
      }

      // Merge with existing record first so we keep all original fields (photo_url, created_at, created_by, etc.)
      const localRecords = getLocalEntityRecords(table, validUserId);
      const existing = localRecords.find((item) => item?.id === id);

      const row = {
        ...(existing || {}),
        ...payload,
        id,
        updated_at: new Date().toISOString(),
      };
      if (validUserId && !row.user_id) {
        row.user_id = validUserId;
      }
      if (!row.created_by) {
        row.created_by = user?.email || user?.id || 'athlete';
      }

      if (table === 'nutrition_entries') {
        if (payload.calories !== undefined) row.calories = Number(payload.calories) || 0;
        if (payload.protein_g !== undefined) row.protein_g = Number(payload.protein_g) || 0;
        if (payload.carbs_g !== undefined) row.carbs_g = Number(payload.carbs_g) || 0;
        if (payload.fat_g !== undefined) row.fat_g = Number(payload.fat_g) || 0;
      }

      // 1. Immediately update in local storage across all keys
      saveLocalEntityRecord(table, validUserId, row);

      // 2. Update in Firestore with merge
      syncToFirestore(table, row, 'set');

      // 3. Attempt Supabase update with schema-safe columns
      try {
        const cleanPayload = sanitizeForSupabase(table, row);
        delete cleanPayload.id;

        let q = supabase.from(table).update(cleanPayload).eq('id', id);
        const { data, error } = await q.select().maybeSingle();
        if (!error && data) {
          const merged = { ...row, ...data };
          saveLocalEntityRecord(table, validUserId, merged);
          return merged;
        }
        if (error) {
          console.warn(`[supabaseApi] Supabase update note on ${table}:`, error.message);
        }
      } catch (err) {
        console.warn(`[supabaseApi] Supabase update note on ${table}:`, err?.message || err);
      }

      return row;
    },

    async delete(id) {
      let validUserId = null;
      try {
        const user = await requireUser();
        validUserId = ensureValidUuid(user?.id);
      } catch (_authErr) {
        // Fallback
      }

      // 1. Remove from local storage
      removeLocalEntityRecord(table, validUserId, id);

      // 2. Remove from Firestore
      syncToFirestore(table, { id }, 'delete');

      // 3. Attempt Supabase delete
      try {
        let q = supabase.from(table).delete().eq('id', id);
        if (validUserId) {
          q = q.eq('user_id', validUserId);
        }
        await q;
      } catch (err) {
        console.warn(`[supabaseApi] Supabase delete note on ${table}:`, err?.message || err);
      }

      return true;
    },
  };
}


/*
 * ------------------------------------------------------------
 * STORAGE helpers
 * ------------------------------------------------------------
 */

function getStoragePath(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (!raw.startsWith('http://') && !raw.startsWith('https://')) return raw;

  try {
    const url = new URL(raw);
    const marker = '/storage/v1/object/';
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex === -1) return null;
    const afterMarker = url.pathname.slice(markerIndex + marker.length);
    const parts = afterMarker.split('/').filter(Boolean);
    if (parts.length < 3) return null;
    const accessType = parts.shift();
    if (accessType !== 'public' && accessType !== 'sign' && accessType !== 'authenticated') return null;
    const bucket = parts.shift();
    if (bucket !== MEDIA_BUCKET) return null;
    return decodeURIComponent(parts.join('/'));
  } catch {
    return null;
  }
}

async function validateOwnStoragePath(value) {
  const path = getStoragePath(value);
  if (!path) throw new Error('A valid media storage path is required.');

  const user = await requireUser();
  const expectedPrefix = `${user.id}/`;
  if (!path.startsWith(expectedPrefix)) throw new Error('You do not have permission to access this file.');

  return { path, user };
}

async function createSignedUrl(value, expiresIn = 3600) {
  const { path } = await validateOwnStoragePath(value);
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, expiresIn);
  if (error) throw errorFrom(error, 'Unable to create a secure media URL.');
  if (!data?.signedUrl) throw new Error('The media file exists, but a secure URL could not be created.');
  return data.signedUrl;
}

async function createSignedUrls(values = [], expiresIn = 3600) {
  if (!Array.isArray(values) || values.length === 0) return [];
  const paths = values.map(getStoragePath).filter(Boolean);
  if (paths.length === 0) return [];

  const user = await requireUser();
  const expectedPrefix = `${user.id}/`;
  for (const path of paths) {
    if (!path.startsWith(expectedPrefix)) throw new Error('You do not have permission to access one of these files.');
  }

  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(paths, expiresIn);
  if (error) throw errorFrom(error, 'Unable to create secure media URLs.');
  return (data || []).map((item) => item?.signedUrl || null);
}

async function resolveMediaUrl(value, expiresIn = 3600) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
  const path = getStoragePath(raw);
  if (!path) {
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    return null;
  }
  try {
    return await createSignedUrl(path, expiresIn);
  } catch (err) {
    console.warn('[Storage] Could not resolve signed URL for media path:', path, err?.message || err);
    try {
      const pub = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
      if (pub?.data?.publicUrl) return pub.data.publicUrl;
    } catch {
      // ignore
    }
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    return `https://edvvwnaxmjuvwnxineph.supabase.co/storage/v1/object/public/media/${path.replace(/^\/+/, '')}`;
  }
}

async function uploadFile(input, folder = 'uploads') {
  const file = input?.file || input;
  const actualFolder = input?.folder || folder;
  if (!file) throw new Error('No file was provided.');

  const user = await requireUser();
  const safeName = String(file.name || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${user.id}/${actualFolder}/${crypto.randomUUID()}-${safeName}`;

  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || 'application/octet-stream',
  });

  if (error) throw errorFrom(error, 'File upload failed.');

  let fileUrl = null;
  try {
    fileUrl = await createSignedUrl(path, 3600);
  } catch {
    // ignore signing failures
  }

  return { file_url: fileUrl, path };
}

/*
 * ------------------------------------------------------------
 * AI
 *
 * invokeAI returns structured result on success OR object { __ai_error: true, ... } on failure.
 * This avoids throwing on transient Edge/502/504 errors so callers can reliably fallback.
 * ------------------------------------------------------------
 */

async function invokeAI({
  prompt,
  file_urls = [],
  model = null,
  response_json_schema = null,
  schema = null,
  type = 'general',
  plan = 'free',
} = {}) {
  try {
    await requireUser();
  } catch (_authErr) {
    // Non-blocking in development / preview modes
  }

  const normalizedFileUrls = Array.isArray(file_urls)
    ? file_urls.map((value) => {
        const path = getStoragePath(value);
        return path || value;
      })
    : [];

  // Get active session token for backend authorization & quota claiming
  let authToken = null;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    authToken = sessionData?.session?.access_token || null;
    if (!authToken) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      authToken = refreshed?.session?.access_token || null;
    }
  } catch (tokenErr) {
    console.warn('[invokeAI] Failed to get session token:', tokenErr);
  }

  if (!authToken && typeof localStorage !== 'undefined') {
    try {
      authToken = localStorage.getItem('washek_auth_token') || null;
    } catch (_err) {
      // Ignore localStorage read errors
    }
  }

  // Primary: Google Gemini Server Backend
  try {
    let currentUserId = null;
    let currentUsed = 0;
    try {
      const rawUser = typeof localStorage !== 'undefined' ? localStorage.getItem('washek_user') : null;
      if (rawUser) {
        const parsedUser = JSON.parse(rawUser);
        currentUserId = parsedUser?.id || null;
        currentUsed = Number(parsedUser?.kael_msg_count || 0);
      }
    } catch (_userErr) {
      // LocalStorage read fallback
    }

    const userTz = getUserTimeZone();
    const headers = {
      'Content-Type': 'application/json',
      'x-timezone': userTz,
    };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    let res = await fetch('/api/ai-generate', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type,
        prompt,
        file_urls: normalizedFileUrls,
        model: model || 'gemini-3.5-flash-lite',
        schema: schema || response_json_schema || null,
        response_json_schema: response_json_schema || schema || null,
        plan: plan || 'free',
        timezone: userTz,
        user_id: currentUserId,
        current_used: currentUsed,
      }),
    });

    // If a stale or invalid token returned 401, retry once without Authorization header
    if (res.status === 401 && headers['Authorization']) {
      delete headers['Authorization'];
      res = await fetch('/api/ai-generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type,
          prompt,
          file_urls: normalizedFileUrls,
          model: model || 'gemini-3.5-flash-lite',
          schema: schema || response_json_schema || null,
          response_json_schema: response_json_schema || schema || null,
          plan: 'free',
          timezone: userTz,
          user_id: currentUserId,
          current_used: currentUsed,
        }),
      });
    }

    // Authoritative backend quota enforcement
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      if (
        res.status === 429 ||
        errData?.error_code === 'KAEL_LIMIT_REACHED'
      ) {
        if (errData?.quota && typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('kael-quota-updated', { detail: errData.quota })
          );
        }
        return {
          __ai_error: true,
          message: errData?.error || 'You have reached your monthly message limit for Coach Kael.',
          code: 'KAEL_LIMIT_REACHED',
          details: errData,
        };
      }
    }

    if (res.ok) {
      const data = await res.json();
      if (data?.success) {
        if (data.quota) {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('kael-quota-updated', { detail: data.quota })
            );
          }
          return {
            content:
              typeof data.result === 'string'
                ? data.result
                : data.result?.content || data.result?.response || data.result?.text || data.result,
            quota: data.quota,
            result: data.result,
          };
        }
        return data.result ?? data;
      }
      if (data?.error) {
        return {
          __ai_error: true,
          message: data.error,
          code: data.error_code || 'GEMINI_ERROR',
          details: data,
        };
      }
    }
  } catch (geminiError) {
    console.warn('[invokeAI] Local Google Gemini endpoint error, falling back to Supabase function:', geminiError);
  }

  const maxAttempts = 2;
  const baseBackoffMs = 800;

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data, error } = await supabase.functions.invoke(AI_FUNCTION, {
        body: {
          type,
          prompt,
          file_urls: normalizedFileUrls,
          model,
          schema: schema || response_json_schema || null,
          plan: plan || 'free',
        },
      });

      if (error) {
        lastError = error;
        const isTransient =
          String(error?.message || '').toLowerCase().includes('edge_function') ||
          String(error?.message || '').toLowerCase().includes('timeout') ||
          String(error?.message || '').includes('504') ||
          String(error?.message || '').includes('502');

        if (isTransient && attempt < maxAttempts) {
          await new Promise((res) => setTimeout(res, baseBackoffMs * Math.pow(2, attempt - 1)));
          continue;
        }

        return {
          __ai_error: true,
          message: error?.message || 'AI generation failed.',
          code: error?.code || null,
          details: error,
        };
      }

      if (data?.success === false) {
        return {
          __ai_error: true,
          message: data.error || 'AI generation failed.',
          code: data.error_code || null,
          status: data.status || null,
          details: data,
        };
      }

      const result = data?.result ?? data;
      if (result == null) {
        return {
          __ai_error: true,
          message: 'AI generation returned no result.',
          details: data,
        };
      }

      return result;
    } catch (err) {
      lastError = err;
      const msg = String(err?.message || '').toLowerCase();
      const isTransient = msg.includes('openrouter') || msg.includes('edge_function') || msg.includes('timeout') || msg.includes('502') || msg.includes('504');

      if (isTransient && attempt < maxAttempts) {
        await new Promise((res) => setTimeout(res, baseBackoffMs * Math.pow(2, attempt - 1)));
        continue;
      }

      return {
        __ai_error: true,
        message: err?.message || 'AI generation failed unexpectedly.',
        details: err,
      };
    }
  }

  return {
    __ai_error: true,
    message: lastError?.message || 'AI generation failed after retries.',
    details: lastError,
  };
}

/*
 * ------------------------------------------------------------
 * EMAIL
 * ------------------------------------------------------------
 */

async function sendEmail({ name, email, message } = {}) {
  const cleanName = typeof name === 'string' ? name.trim() : '';
  const cleanEmail = typeof email === 'string' ? email.trim() : '';
  const cleanMessage = typeof message === 'string' ? message.trim() : '';

  if (!cleanName) throw new Error('Your name is required.');
  if (!cleanEmail) throw new Error('Your email address is required.');
  if (!cleanMessage) throw new Error('Your message is required.');

  // Validate or identify authenticated user
  let user = null;
  try {
    user = await requireUser();
  } catch (authErr) {
    console.warn('[supabaseApi.email.send] Session lookup note:', authErr?.message || authErr);
  }

  // Persist to contact_messages in Supabase if authenticated
  if (user?.id) {
    try {
      await supabase.from('contact_messages').insert({
        user_id: user.id,
        name: cleanName,
        email: cleanEmail,
        message: cleanMessage,
      });
    } catch (dbErr) {
      console.warn('[supabaseApi.email.send] contact_messages table insert note:', dbErr?.message || dbErr);
    }
  }

  const subject = `WASHEK Contact Message from ${cleanName}`;
  const bodyText = `Name: ${cleanName}\nEmail: ${cleanEmail}\n\nMessage:\n${cleanMessage}`;

  const payload = {
    name: cleanName,
    email: cleanEmail,
    message: cleanMessage,
    subject,
    body: bodyText,
    to: 'washekfitness@gmail.com',
    reply_to: cleanEmail,
  };

  let responseData = null;
  let lastError = null;

  // 1. Invoke Supabase Edge Function
  try {
    const { data, error } = await supabase.functions.invoke(EMAIL_FUNCTION, {
      body: payload,
    });

    if (error) {
      throw error;
    }

    if (data?.success === false) {
      throw new Error(data.error || 'Contact email could not be sent.');
    }

    responseData = data;
  } catch (edgeErr) {
    lastError = edgeErr;
    console.warn('[supabaseApi.email.send] Edge function error, attempting server fallback:', edgeErr?.message || edgeErr);

    // 2. Resilient fallback to backend server /api/send-contact-email
    try {
      const serverRes = await fetch('/api/send-contact-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (serverRes.ok) {
        const serverData = await serverRes.json();
        if (serverData?.success) {
          responseData = serverData;
          lastError = null;
        }
      }
    } catch (fallbackErr) {
      console.warn('[supabaseApi.email.send] Server fallback error:', fallbackErr?.message || fallbackErr);
    }
  }

  if (!responseData) {
    throw errorFrom(lastError, 'Unable to send message at this time. Please try again.');
  }

  return responseData;
}

/*
 * ------------------------------------------------------------
 * EXPORTED API
 * ------------------------------------------------------------
 */

export const supabaseApi = {
  auth: {
    me: currentUser,
    updateMe: async (patch) => {
      const user = await requireUser();
      const safePatch = { ...patch };
      delete safePatch.id;
      delete safePatch.user_id;
      delete safePatch.subscription_plan;
      delete safePatch.subscription_status;
      delete safePatch.stripe_customer_id;
      delete safePatch.stripe_subscription_id;
      delete safePatch.stripe_price_id;
      delete safePatch.subscription_cancelled_at;
      delete safePatch.subscription_updated_at;

      const { data, error } = await supabase.from('profiles').update(safePatch).eq('id', user.id).select().single();
      if (error) throw errorFrom(error, 'Unable to update your profile.');
      if (!data) throw new Error('Your profile could not be found.');
      return normalizeUser(user, data);
    },
    logout: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw errorFrom(error, 'Unable to sign out.');
    },
    redirectToLogin: () => {
      window.location.assign('/login');
    },
  },

  entities: {
    WorkoutProgram: entity('workout_programs'),
    WorkoutLog: entity('workout_logs'),
    NutritionEntry: entity('nutrition_entries'),
    ProgressPhoto: entity('progress_photos'),
    MovementBaseline: entity('movement_baselines'),
    FormAnalysis: entity('form_analyses'),
    WeightHistory: entity('weight_history'),
    KaelMessage: {
      ...entity('kael_messages'),

      async create(payload = {}) {
        let validUserId = null;
        try {
          const user = await requireUser();
          validUserId = ensureValidUuid(user.id);
        } catch (_userErr) {
          // Guest or non-logged-in session
        }

        const row = {
          id: payload.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          ...payload,
          user_id: validUserId,
          created_at: payload.created_at || new Date().toISOString(),
        };

        // Cache message locally so history is never lost even if unauthenticated
        try {
          const storageKey = `washek_kael_messages_${validUserId || 'guest'}`;
          const existing = JSON.parse(localStorage.getItem(storageKey) || '[]');
          existing.push(row);
          localStorage.setItem(storageKey, JSON.stringify(existing.slice(-1000)));
        } catch (_storageErr) {
          // Ignore localStorage cache errors
        }

        // Attempt Supabase insert if a valid Supabase auth session exists
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData?.session?.user && validUserId) {
            const { data, error } = await supabase
              .from('kael_messages')
              .insert(row)
              .select()
              .maybeSingle();

            if (!error && data) {
              return data;
            }
          }
        } catch (_dbErr) {
          // If RLS policy or network blocks insert, locally cached row is returned
        }

        return row;
      },

      async filter(filters = {}, sort = 'created_at', limit = 1000) {
        let dbMessages = [];
        let validUserId = null;

        try {
          const user = await requireUser();
          validUserId = ensureValidUuid(user.id);
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData?.session?.user && validUserId) {
            const rawColumn = sort.replace(/^-/, '');
            const column = ORDER_ALIASES[rawColumn] || rawColumn;
            const ascending = !sort.startsWith('-');

            let q = applyFilters(supabase.from('kael_messages').select('*'), filters, validUserId).order(column, { ascending });
            if (Number.isFinite(limit)) q = q.limit(limit);

            const { data, error } = await q;
            if (!error && Array.isArray(data)) {
              dbMessages = data;
            }
          }
        } catch (_err) {
          // Ignore remote query errors and fallback to local cache
        }

        let localMessages = [];
        try {
          const storageKey = `washek_kael_messages_${validUserId || 'guest'}`;
          const raw = localStorage.getItem(storageKey);
          if (raw) {
            localMessages = JSON.parse(raw);
          }
        } catch (_storageErr) {
          // Ignore localStorage read errors
        }

        const map = new Map();
        localMessages.forEach((m) => {
          if (m?.id) map.set(m.id, m);
        });
        dbMessages.forEach((m) => {
          if (m?.id) map.set(m.id, m);
        });

        const merged = Array.from(map.values());
        merged.sort((a, b) => {
          const tA = new Date(a.created_at || a.created_date || 0).getTime();
          const tB = new Date(b.created_at || b.created_date || 0).getTime();
          return tA - tB;
        });

        return merged;
      },

      async deleteChat(chatId) {
        if (!chatId || typeof chatId !== 'string') return true;
        let validUserId = null;
        try {
          const user = await requireUser();
          validUserId = ensureValidUuid(user.id);
        } catch (_userErr) {
          // Guest session
        }

        try {
          const storageKey = `washek_kael_messages_${validUserId || 'guest'}`;
          const existing = JSON.parse(localStorage.getItem(storageKey) || '[]');
          const filtered = existing.filter((m) => {
            const mChat = m.created_by || 'chat_initial';
            return chatId === 'chat_initial' ? (mChat !== 'chat_initial' && mChat !== null) : mChat !== chatId;
          });
          localStorage.setItem(storageKey, JSON.stringify(filtered));
        } catch (_err) {
          // Ignore localStorage delete errors
        }

        try {
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData?.session?.user && validUserId) {
            if (chatId === 'chat_initial') {
              await supabase
                .from('kael_messages')
                .delete()
                .eq('user_id', validUserId)
                .or('created_by.eq.chat_initial,created_by.is.null');
            } else {
              await supabase
                .from('kael_messages')
                .delete()
                .eq('user_id', validUserId)
                .eq('created_by', chatId);
            }
          }
        } catch (_dbErr) {
          // Ignore remote delete errors
        }

        return true;
      },
    },
  },

  storage: {
    uploadFile,
    createSignedUrl,
    createSignedUrls,
    resolveMediaUrl,
    getStoragePath,
  },

  ai: {
    invoke: invokeAI,
  },

  email: {
    send: sendEmail,
  },
};

export {
  requireUser,
  currentUser,
};
