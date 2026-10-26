import {
  auth,
  googleProvider,
  db,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  getDocs,
  serverTimestamp,
} from './firebase';
import { ensureValidUuid } from './supabaseApi';
import { isLogo } from './avatarUtils';
import {
  getCachedLogs,
  setCachedLogs,
  setCachedLastWorkout,
} from './cacheStore';

/**
 * Normalizes a Firebase User + Firestore doc into a consistent athlete profile
 */
export function normalizeFirebaseUser(firebaseUser, firestoreData = {}) {
  if (!firebaseUser) return null;

  const displayName = firebaseUser.displayName || '';
  const nameParts = displayName.trim().split(' ');
  const firstName =
    firestoreData.first_name ||
    nameParts[0] ||
    firebaseUser.email?.split('@')[0] ||
    'Athlete';
  const lastName =
    firestoreData.last_name ||
    (nameParts.length > 1 ? nameParts.slice(1).join(' ') : '');
  const fullName =
    firestoreData.full_name ||
    displayName ||
    `${firstName} ${lastName}`.trim() ||
    'Athlete';

  const localAvatar = (() => {
    try {
      const stored = localStorage.getItem('washek_custom_avatar');
      if (stored && !isLogo(stored)) {
        return stored;
      }
      return null;
    } catch {
      return null;
    }
  })();

  const rawAvatar =
    firestoreData.avatar_url ||
    localAvatar ||
    firebaseUser.photoURL ||
    null;

  const avatarUrl = rawAvatar && !isLogo(rawAvatar) ? rawAvatar : null;

  let detectedTimezone = 'UTC';
  try {
    detectedTimezone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    detectedTimezone = 'UTC';
  }

  const validUuid = ensureValidUuid(firestoreData.id || firebaseUser.uid);

  return {
    ...firestoreData,
    email: firebaseUser.email || firestoreData.email || '',
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    avatar_url: avatarUrl,
    photo_url: avatarUrl,
    role: firestoreData.role || 'athlete',
    subscription_plan: firestoreData.subscription_plan || firestoreData.plan || firestoreData.tier || 'free',
    subscription_status: firestoreData.subscription_status || 'active',
    plan: firestoreData.subscription_plan || firestoreData.plan || 'free',
    tier: firestoreData.subscription_plan || firestoreData.tier || 'free',
    subscription_tier: firestoreData.subscription_plan || firestoreData.subscription_tier || 'free',
    target_calories: firestoreData.target_calories || 2600,
    target_protein: firestoreData.target_protein || 190,
    target_carbs: firestoreData.target_carbs || 260,
    target_fat: firestoreData.target_fat || 70,
    current_weight: firestoreData.current_weight || 185,
    goal_weight: firestoreData.goal_weight || 180,
    timezone: firestoreData.timezone || detectedTimezone,
    created_at: firestoreData.created_at || new Date().toISOString(),
    id: validUuid,
    uid: firebaseUser.uid,
    firebase_uid: firebaseUser.uid,
  };
}

/**
 * Ensures or retrieves the user profile in Firestore
 */
export async function getOrCreateUserProfile(firebaseUser) {
  if (!firebaseUser) return null;

  try {
    const userRef = doc(db, 'users', firebaseUser.uid);
    const snap = await getDoc(userRef);

    if (snap.exists()) {
      return normalizeFirebaseUser(firebaseUser, snap.data());
    }

    // Initialize document in Firestore
    const initialProfile = {
      id: firebaseUser.uid,
      email: firebaseUser.email || '',
      first_name: firebaseUser.displayName?.split(' ')[0] || '',
      last_name: firebaseUser.displayName?.split(' ').slice(1).join(' ') || '',
      full_name: firebaseUser.displayName || '',
      avatar_url: firebaseUser.photoURL || '',
      role: 'athlete',
      plan: 'pro',
      tier: 'pro',
      subscription_tier: 'pro',
      target_calories: 2600,
      target_protein: 190,
      target_carbs: 260,
      target_fat: 70,
      current_weight: 185,
      goal_weight: 180,
      created_at: new Date().toISOString(),
    };

    await setDoc(userRef, initialProfile, { merge: true });
    return normalizeFirebaseUser(firebaseUser, initialProfile);
  } catch (err) {
    console.warn('[Firebase] Profile fetch/create warning:', err);
    return normalizeFirebaseUser(firebaseUser);
  }
}

export const firebaseApi = {
  auth: {
    /**
     * Sign in with Google using Firebase Auth popup
     */
    signInWithGoogle: async () => {
      const result = await signInWithPopup(auth, googleProvider);
      const user = await getOrCreateUserProfile(result.user);
      return { user, credential: result };
    },

    /**
     * Sign in with Email and Password
     */
    signInWithEmail: async (email, password) => {
      const result = await signInWithEmailAndPassword(auth, email.trim(), password);
      const user = await getOrCreateUserProfile(result.user);
      return { user, credential: result };
    },

    /**
     * Register / Sign up with Email and Password
     */
    signUpWithEmail: async (email, password, { firstName = '', lastName = '' } = {}) => {
      const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
      
      if (fullName) {
        try {
          await updateProfile(result.user, { displayName: fullName });
        } catch {
          // non-critical
        }
      }

      const userRef = doc(db, 'users', result.user.uid);
      const initialProfile = {
        id: result.user.uid,
        email: result.user.email,
        first_name: firstName,
        last_name: lastName,
        full_name: fullName || 'Athlete',
        avatar_url: null,
        role: 'athlete',
        plan: 'pro',
        tier: 'pro',
        subscription_tier: 'pro',
        target_calories: 2600,
        target_protein: 190,
        target_carbs: 260,
        target_fat: 70,
        created_at: new Date().toISOString(),
      };

      await setDoc(userRef, initialProfile, { merge: true });
      const user = normalizeFirebaseUser(result.user, initialProfile);
      return { user, credential: result };
    },

    /**
     * Sign out current user
     */
    signOut: async () => {
      await firebaseSignOut(auth);
    },

    /**
     * Get current user
     */
    me: async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) return null;
      return await getOrCreateUserProfile(currentUser);
    },

    /**
     * Update athlete profile in Firestore
     */
    updateProfile: async (updates) => {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Not authenticated');

      const userRef = doc(db, 'users', currentUser.uid);
      await setDoc(userRef, { ...updates, updated_at: new Date().toISOString() }, { merge: true });
      return await getOrCreateUserProfile(currentUser);
    },
  },

  firestore: {
    /**
     * Save or sync custom avatar
     */
    saveAvatar: async (avatarUrl) => {
      const currentUser = auth.currentUser;
      if (currentUser) {
        const userRef = doc(db, 'users', currentUser.uid);
        await setDoc(
          userRef,
          { avatar_url: avatarUrl, photo_url: avatarUrl, updated_at: new Date().toISOString() },
          { merge: true }
        );
      }
      try {
        if (avatarUrl) {
          localStorage.setItem('washek_custom_avatar', avatarUrl);
          if (currentUser?.uid) {
            localStorage.setItem(`washek_custom_avatar_${currentUser.uid}`, avatarUrl);
          }
          if (currentUser?.email) {
            localStorage.setItem(`washek_custom_avatar_${currentUser.email}`, avatarUrl);
          }
        } else {
          localStorage.removeItem('washek_custom_avatar');
          if (currentUser?.uid) {
            localStorage.removeItem(`washek_custom_avatar_${currentUser.uid}`);
          }
          if (currentUser?.email) {
            localStorage.removeItem(`washek_custom_avatar_${currentUser.email}`);
          }
        }

        const stored = localStorage.getItem('washek_user');
        if (stored) {
          const parsed = JSON.parse(stored);
          parsed.avatar_url = avatarUrl;
          parsed.photo_url = avatarUrl;
          localStorage.setItem('washek_user', JSON.stringify(parsed));
        }
      } catch {
        // local storage fallback
      }
    },

    /**
     * Save workout log to Firestore and local storage caching layer immediately
     */
    saveWorkoutLog: async (workout) => {
      const currentUser = auth.currentUser;
      const userKey = currentUser?.uid || currentUser?.email || 'athlete';
      if (!currentUser) return workout;

      const workoutId = workout.id || `workout_${Date.now()}`;
      const workoutRef = doc(db, 'users', currentUser.uid, 'workouts', workoutId);
      const dataToSave = {
        ...workout,
        id: workoutId,
        userId: currentUser.uid,
        updated_at: new Date().toISOString(),
      };

      // Save to local storage caching layer immediately
      setCachedLastWorkout(dataToSave, userKey);
      const existingLogs = getCachedLogs(userKey);
      const updatedLogs = [dataToSave, ...existingLogs.filter((l) => l.id !== workoutId)];
      setCachedLogs(updatedLogs, userKey);

      await setDoc(workoutRef, dataToSave, { merge: true });
      return dataToSave;
    },

    /**
     * Get workout logs for current user (hydrates from local storage cache immediately while fetching from Firestore)
     */
    getWorkoutLogs: async () => {
      const currentUser = auth.currentUser;
      const userKey = currentUser?.uid || currentUser?.email || 'athlete';
      const cached = getCachedLogs(userKey);

      if (!currentUser) return cached;

      try {
        const colRef = collection(db, 'users', currentUser.uid, 'workouts');
        const snap = await getDocs(query(colRef));
        const logs = snap.docs.map((d) => d.data());
        if (logs.length > 0) {
          logs.sort((a, b) =>
            String(b.date || b.created_at || '').localeCompare(String(a.date || a.created_at || ''))
          );
          setCachedLogs(logs, userKey);
          if (logs[0]) {
            setCachedLastWorkout(logs[0], userKey);
          }
        }
        return logs.length > 0 ? logs : cached;
      } catch (err) {
        console.debug('[Firestore] getWorkoutLogs fetch note:', err);
        return cached;
      }
    },

    /**
     * Save daily nutrition log to Firestore
     */
    saveNutritionLog: async (date, nutritionData) => {
      const currentUser = auth.currentUser;
      if (!currentUser) return nutritionData;

      const logId = `nutrition_${date}`;
      const logRef = doc(db, 'users', currentUser.uid, 'nutrition_logs', logId);
      const payload = {
        ...nutritionData,
        date,
        userId: currentUser.uid,
        updated_at: new Date().toISOString(),
      };

      await setDoc(logRef, payload, { merge: true });
      return payload;
    },

    /**
     * Save weight log to Firestore
     */
    saveWeightEntry: async (date, weight, notes = '') => {
      const currentUser = auth.currentUser;
      if (!currentUser) return { date, weight };

      const entryId = `weight_${date}`;
      const entryRef = doc(db, 'users', currentUser.uid, 'weight_history', entryId);
      const payload = {
        id: entryId,
        userId: currentUser.uid,
        date,
        weight: Number(weight),
        notes,
        created_at: new Date().toISOString(),
      };

      await setDoc(entryRef, payload, { merge: true });
      return payload;
    },
  },
};
