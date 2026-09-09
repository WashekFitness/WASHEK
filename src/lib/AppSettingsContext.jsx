import {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';

const SETTINGS_KEY = 'washek_app_settings';

const defaultSettings = {
  country: 'US',
  language: 'English',
  unit: 'imperial',
  theme: 'dark',
};

function normalizeTheme(value) {
  return value === 'light' ? 'light' : 'dark';
}

function applyTheme(theme) {
  const normalizedTheme = normalizeTheme(theme);

  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;

  // Explicitly control the two classes.
  root.classList.remove('light', 'dark');
  root.classList.add(normalizedTheme);

  // Prevent the browser's own color preference from overriding the app.
  root.style.colorScheme = normalizedTheme;

  // Keep this available for any components that want to inspect it.
  root.dataset.theme = normalizedTheme;

  // Also update browser UI color where supported.
  const themeColor =
    normalizedTheme === 'light'
      ? '#f7f7f8'
      : '#05070b';

  let meta = document.querySelector(
    'meta[name="theme-color"]'
  );

  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }

  meta.setAttribute('content', themeColor);
}

function getInitialSettings() {
  const fallback = {
    ...defaultSettings,
  };

  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(
      SETTINGS_KEY
    );

    if (!raw) {
      applyTheme(fallback.theme);
      return fallback;
    }

    const parsed = JSON.parse(raw);

    const settings = {
      ...fallback,
      ...(parsed && typeof parsed === 'object'
        ? parsed
        : {}),
      theme: normalizeTheme(parsed?.theme),
    };

    applyTheme(settings.theme);

    return settings;
  } catch {
    applyTheme(fallback.theme);
    return fallback;
  }
}

function saveSettings(settings) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify(settings)
    );
  } catch {
    // Never allow local-storage problems to break settings.
  }
}

// Apply the saved theme before React renders.
if (
  typeof window !== 'undefined' &&
  typeof document !== 'undefined'
) {
  try {
    const raw = window.localStorage.getItem(
      SETTINGS_KEY
    );

    let theme = defaultSettings.theme;

    if (raw) {
      const parsed = JSON.parse(raw);

      if (parsed?.theme === 'light') {
        theme = 'light';
      } else if (parsed?.theme === 'dark') {
        theme = 'dark';
      }
    }

    applyTheme(theme);
  } catch {
    applyTheme(defaultSettings.theme);
  }
}

const AppSettingsContext = createContext(null);

export function AppSettingsProvider({ children }) {
  const [settings, setSettings] = useState(
    getInitialSettings
  );

  useEffect(() => {
    applyTheme(settings.theme);
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang =
        settings.language || 'en';
    }
  }, [settings.language]);

  // Keep settings synchronized if another tab/window
  // changes the saved preference.
  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleStorage = (event) => {
      if (event.key !== SETTINGS_KEY) {
        return;
      }

      try {
        if (!event.newValue) {
          setSettings({
            ...defaultSettings,
          });
          return;
        }

        const parsed = JSON.parse(event.newValue);

        setSettings({
          ...defaultSettings,
          ...(parsed && typeof parsed === 'object'
            ? parsed
            : {}),
          theme: normalizeTheme(parsed?.theme),
        });
      } catch {
        // Ignore malformed storage events.
      }
    };

    window.addEventListener(
      'storage',
      handleStorage
    );

    return () => {
      window.removeEventListener(
        'storage',
        handleStorage
      );
    };
  }, []);

  const updateSettings = (patch = {}) => {
    setSettings((previous) => {
      const next = {
        ...previous,
        ...patch,
      };

      if (
        patch.theme === 'light' ||
        patch.theme === 'dark'
      ) {
        next.theme = patch.theme;
      } else {
        next.theme = normalizeTheme(previous.theme);
      }

      // Apply immediately so the UI does not wait for
      // another render/effect cycle.
      if (patch.theme) {
        applyTheme(next.theme);
      }

      saveSettings(next);

      return next;
    });
  };

  return (
    <AppSettingsContext.Provider
      value={{
        settings,
        updateSettings,
      }}
    >
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  return useContext(AppSettingsContext);
}

// ── Unit display helpers ──────────────────────────────────

export function displayWeight(value, unit) {
  if (!value && value !== 0) {
    return '—';
  }

  if (unit === 'metric') {
    return `${(
      parseFloat(value) * 0.453592
    ).toFixed(1)} kg`;
  }

  return `${value} lbs`;
}

export function inputWeightToLbs(value, unit) {
  const numeric = parseFloat(value);

  if (!Number.isFinite(numeric)) {
    return null;
  }

  if (unit === 'metric') {
    return (numeric / 0.453592).toFixed(1);
  }

  return numeric;
}

export function lbsToInputWeight(lbs, unit) {
  const numeric = parseFloat(lbs);

  if (!Number.isFinite(numeric)) {
    return '';
  }

  if (unit === 'metric') {
    return (numeric * 0.453592).toFixed(1);
  }

  return numeric;
}

export function displayHeight(inches, unit) {
  if (!inches && inches !== 0) {
    return '—';
  }

  const numeric = parseFloat(inches);

  if (!Number.isFinite(numeric)) {
    return '—';
  }

  if (unit === 'metric') {
    return `${(numeric * 2.54).toFixed(0)} cm`;
  }

  const ft = Math.floor(numeric / 12);
  const inch = Math.round(numeric % 12);

  return `${ft}'${inch}"`;
}

export function weightUnit(unit) {
  return unit === 'metric' ? 'kg' : 'lbs';
}

export function heightUnit(unit) {
  return unit === 'metric' ? 'cm' : 'ft / in';
}
