const STORAGE_CACHE_PREFIX = 'washek_i18n_v1_';
const MAX_LOCAL_CACHE_ENTRIES = 2500;
const BATCH_CHUNK_SIZE = 45;
const BATCH_DEBOUNCE_MS = 35;

export const RTL_LANGUAGES = new Set([
  'arabic',
  'hebrew',
  'persian (farsi)',
  'urdu',
  'pashto',
  'sindhi',
  'yiddish',
  'uyghur',
  'dhivehi',
  'sorani kurdish',
  'kurdish (sorani)',
  'dari',
  'aramaic',
]);

export const LANGUAGE_TO_ISO = {
  afrikaans: 'af',
  albanian: 'sq',
  amharic: 'am',
  arabic: 'ar',
  armenian: 'hy',
  assamese: 'as',
  azerbaijani: 'az',
  basque: 'eu',
  belarusian: 'be',
  bengali: 'bn',
  bosnian: 'bs',
  bulgarian: 'bg',
  burmese: 'my',
  'cantonese chinese': 'zh-HK',
  catalan: 'ca',
  cebuano: 'ceb',
  'chewa (chichewa)': 'ny',
  chichewa: 'ny',
  corsican: 'co',
  croatian: 'hr',
  czech: 'cs',
  danish: 'da',
  dari: 'prs',
  dhivehi: 'dv',
  dutch: 'nl',
  english: 'en',
  esperanto: 'eo',
  estonian: 'et',
  faroese: 'fo',
  fijian: 'fj',
  filipino: 'fil',
  finnish: 'fi',
  flemish: 'nl-BE',
  french: 'fr',
  galician: 'gl',
  georgian: 'ka',
  german: 'de',
  greek: 'el',
  gujarati: 'gu',
  'haitian creole': 'ht',
  hausa: 'ha',
  hawaiian: 'haw',
  hebrew: 'he',
  hindi: 'hi',
  hmong: 'hmn',
  hungarian: 'hu',
  icelandic: 'is',
  igbo: 'ig',
  ilocano: 'ilo',
  indonesian: 'id',
  'irish (gaelic)': 'ga',
  italian: 'it',
  japanese: 'ja',
  javanese: 'jv',
  kannada: 'kn',
  kazakh: 'kk',
  khmer: 'km',
  kinyarwanda: 'rw',
  korean: 'ko',
  'kurdish (kurmanji)': 'ku',
  'kurdish (sorani)': 'ckb',
  kyrgyz: 'ky',
  lao: 'lo',
  latin: 'la',
  latvian: 'lv',
  lingala: 'ln',
  lithuanian: 'lt',
  luxembourgish: 'lb',
  macedonian: 'mk',
  malagasy: 'mg',
  malay: 'ms',
  malayalam: 'ml',
  maltese: 'mt',
  'mandarin chinese': 'zh-CN',
  maori: 'mi',
  marathi: 'mr',
  mongolian: 'mn',
  montenegrin: 'cnr',
  nepali: 'ne',
  norwegian: 'no',
  'oriya (odia)': 'or',
  oromo: 'om',
  pashto: 'ps',
  'persian (farsi)': 'fa',
  polish: 'pl',
  portuguese: 'pt',
  punjabi: 'pa',
  quechua: 'qu',
  romanian: 'ro',
  romansh: 'rm',
  russian: 'ru',
  samoan: 'sm',
  sanskrit: 'sa',
  'scottish gaelic': 'gd',
  serbian: 'sr',
  sesotho: 'st',
  shona: 'sn',
  sindhi: 'sd',
  sinhala: 'si',
  slovak: 'sk',
  slovenian: 'sl',
  somali: 'so',
  'sorani kurdish': 'ckb',
  spanish: 'es',
  sundanese: 'su',
  swahili: 'sw',
  swedish: 'sv',
  tagalog: 'tl',
  tajik: 'tg',
  tamil: 'ta',
  tatar: 'tt',
  telugu: 'te',
  thai: 'th',
  tibetan: 'bo',
  tigrinya: 'ti',
  tongan: 'to',
  tswana: 'tn',
  turkish: 'tr',
  turkmen: 'tk',
  ukrainian: 'uk',
  urdu: 'ur',
  uyghur: 'ug',
  uzbek: 'uz',
  vietnamese: 'vi',
  welsh: 'cy',
  wolof: 'wo',
  'wu chinese': 'wuu',
  xhosa: 'xh',
  yiddish: 'yi',
  yoruba: 'yo',
  zulu: 'zu',
};

export function normalizeAppLanguage(language) {
  const clean = String(language || '').trim();
  return clean || 'English';
}

export function isEnglishLanguage(language) {
  const norm = normalizeAppLanguage(language).toLowerCase();
  return norm === 'english' || norm === 'en';
}

export function getLanguageIsoCode(language) {
  const norm = normalizeAppLanguage(language).toLowerCase();
  return LANGUAGE_TO_ISO[norm] || 'en';
}

export function isRtlLanguage(language) {
  const norm = normalizeAppLanguage(language).toLowerCase();
  return RTL_LANGUAGES.has(norm);
}

// Instant 0ms translations for primary chrome, navigation, and settings actions
const CORE_UI_DICTIONARY = {
  Spanish: {
    Home: 'Inicio',
    Program: 'Programa',
    Kael: 'Kael',
    Nutrition: 'Nutrición',
    Me: 'Perfil',
    'App Settings': 'Ajustes de la app',
    Appearance: 'Apariencia',
    Dark: 'Oscuro',
    Light: 'Claro',
    Country: 'País',
    Language: 'Idioma',
    'Measurement System': 'Sistema de medidas',
    'Metric (kg, cm)': 'Métrico (kg, cm)',
    'Imperial (lbs, ft)': 'Imperial (lbs, ft)',
    'Training Program': 'Programa de entrenamiento',
    'Save Settings': 'Guardar ajustes',
    Cancel: 'Cancelar',
    'Log Out': 'Cerrar sesión',
    'Delete Account': 'Eliminar cuenta',
    'Quick Start Guide': 'Guía de inicio rápido',
    'View App Walkthrough': 'Ver recorrido de la app',
    Next: 'Siguiente',
    Back: 'Atrás',
    Skip: 'Omitir',
    Continue: 'Continuar',
    Finish: 'Finalizar',
    Done: 'Listo',
    Save: 'Guardar',
    'Search...': 'Buscar...',
    'Search country...': 'Buscar país...',
  },
  French: {
    Home: 'Accueil',
    Program: 'Programme',
    Kael: 'Kael',
    Nutrition: 'Nutrition',
    Me: 'Profil',
    'App Settings': "Paramètres de l'app",
    Appearance: 'Apparence',
    Dark: 'Sombre',
    Light: 'Clair',
    Country: 'Pays',
    Language: 'Langue',
    'Measurement System': 'Système de mesure',
    'Metric (kg, cm)': 'Métrique (kg, cm)',
    'Imperial (lbs, ft)': 'Impérial (lbs, ft)',
    'Training Program': "Programme d'entraînement",
    'Save Settings': 'Enregistrer',
    Cancel: 'Annuler',
    'Log Out': 'Déconnexion',
    'Delete Account': 'Supprimer le compte',
    'Quick Start Guide': 'Guide de démarrage rapide',
    'View App Walkthrough': "Voir la visite de l'app",
    Next: 'Suivant',
    Back: 'Retour',
    Skip: 'Ignorer',
    Continue: 'Continuer',
    Finish: 'Terminer',
    Done: 'Terminé',
    Save: 'Enregistrer',
    'Search...': 'Rechercher...',
    'Search country...': 'Rechercher un pays...',
  },
  German: {
    Home: 'Start',
    Program: 'Programm',
    Kael: 'Kael',
    Nutrition: 'Ernährung',
    Me: 'Profil',
    'App Settings': 'App-Einstellungen',
    Appearance: 'Erscheinungsbild',
    Dark: 'Dunkel',
    Light: 'Hell',
    Country: 'Land',
    Language: 'Sprache',
    'Measurement System': 'Maßsystem',
    'Metric (kg, cm)': 'Metrisch (kg, cm)',
    'Imperial (lbs, ft)': 'Imperial (lbs, ft)',
    'Training Program': 'Trainingsprogramm',
    'Save Settings': 'Einstellungen speichern',
    Cancel: 'Abbrechen',
    'Log Out': 'Abmelden',
    'Delete Account': 'Konto löschen',
    'Quick Start Guide': 'Schnellstart-Anleitung',
    'View App Walkthrough': 'App-Rundgang ansehen',
    Next: 'Weiter',
    Back: 'Zurück',
    Skip: 'Überspringen',
    Continue: 'Weiter',
    Finish: 'Fertig',
    Done: 'Fertig',
    Save: 'Speichern',
    'Search...': 'Suchen...',
    'Search country...': 'Land suchen...',
  },
  Portuguese: {
    Home: 'Início',
    Program: 'Programa',
    Kael: 'Kael',
    Nutrition: 'Nutrição',
    Me: 'Perfil',
    'App Settings': 'Configurações do app',
    Appearance: 'Aparência',
    Dark: 'Escuro',
    Light: 'Claro',
    Country: 'País',
    Language: 'Idioma',
    'Measurement System': 'Sistema de medidas',
    'Metric (kg, cm)': 'Métrico (kg, cm)',
    'Imperial (lbs, ft)': 'Imperial (lbs, ft)',
    'Training Program': 'Programa de treino',
    'Save Settings': 'Salvar configurações',
    Cancel: 'Cancelar',
    'Log Out': 'Sair',
    'Delete Account': 'Excluir conta',
    'Quick Start Guide': 'Guia rápido',
    'View App Walkthrough': 'Ver tour do app',
    Next: 'Próximo',
    Back: 'Voltar',
    Skip: 'Pular',
    Continue: 'Continuar',
    Finish: 'Concluir',
    Done: 'Concluído',
    Save: 'Salvar',
    'Search...': 'Pesquisar...',
    'Search country...': 'Pesquisar país...',
  },
  Italian: {
    Home: 'Home',
    Program: 'Programma',
    Kael: 'Kael',
    Nutrition: 'Nutrizione',
    Me: 'Profilo',
    'App Settings': "Impostazioni dell'app",
    Appearance: 'Aspetto',
    Dark: 'Scuro',
    Light: 'Chiaro',
    Country: 'Paese',
    Language: 'Lingua',
    'Measurement System': 'Sistema di misura',
    'Save Settings': 'Salva impostazioni',
    Cancel: 'Annulla',
    'Log Out': 'Esci',
    'Delete Account': 'Elimina account',
    'Quick Start Guide': 'Guida rapida',
    'View App Walkthrough': "Vedi guida dell'app",
    Next: 'Avanti',
    Back: 'Indietro',
    Skip: 'Salta',
    Continue: 'Continua',
    Finish: 'Fine',
    Done: 'Fatto',
    Save: 'Salva',
    'Search...': 'Cerca...',
    'Search country...': 'Cerca paese...',
  },
  Arabic: {
    Home: 'الرئيسية',
    Program: 'البرنامج',
    Kael: 'كايل',
    Nutrition: 'التغذية',
    Me: 'حسابي',
    'App Settings': 'إعدادات التطبيق',
    Appearance: 'المظهر',
    Dark: 'داكن',
    Light: 'فاتح',
    Country: 'الدولة',
    Language: 'اللغة',
    'Measurement System': 'نظام القياس',
    'Save Settings': 'حفظ الإعدادات',
    Cancel: 'إلغاء',
    'Log Out': 'تسجيل الخروج',
    'Delete Account': 'حذف الحساب',
    'Quick Start Guide': 'دليل البدء السريع',
    'View App Walkthrough': 'عرض جولة التطبيق',
    Next: 'التالي',
    Back: 'رجوع',
    Skip: 'تخطي',
    Continue: 'متابعة',
    Finish: 'إنهاء',
    Done: 'تم',
    Save: 'حفظ',
    'Search...': 'بحث...',
    'Search country...': 'ابحث عن دولة...',
  },
  Japanese: {
    Home: 'ホーム',
    Program: 'プログラム',
    Kael: 'Kael',
    Nutrition: '栄養',
    Me: 'マイページ',
    'App Settings': 'アプリ設定',
    Appearance: '外観',
    Dark: 'ダーク',
    Light: 'ライト',
    Country: '国',
    Language: '言語',
    'Measurement System': '単位系',
    'Save Settings': '設定を保存',
    Cancel: 'キャンセル',
    'Log Out': 'ログアウト',
    'Delete Account': 'アカウント削除',
    'Quick Start Guide': 'クイックスタートガイド',
    'View App Walkthrough': 'アプリ案内を見る',
    Next: '次へ',
    Back: '戻る',
    Skip: 'スキップ',
    Continue: '続ける',
    Finish: '完了',
    Done: '完了',
    Save: '保存',
    'Search...': '検索...',
    'Search country...': '国を検索...',
  },
  Korean: {
    Home: '홈',
    Program: '프로그램',
    Kael: 'Kael',
    Nutrition: '영양',
    Me: '내 정보',
    'App Settings': '앱 설정',
    Appearance: '화면 테마',
    Dark: '다크',
    Light: '라이트',
    Country: '국가',
    Language: '언어',
    'Measurement System': '측정 단위',
    'Save Settings': '설정 저장',
    Cancel: '취소',
    'Log Out': '로그아웃',
    'Delete Account': '계정 삭제',
    'Quick Start Guide': '빠른 시작 가이드',
    'View App Walkthrough': '앱 둘러보기',
    Next: '다음',
    Back: '뒤로',
    Skip: '건너뛰기',
    Continue: '계속',
    Finish: '완료',
    Done: '완료',
    Save: '저장',
    'Search...': '검색...',
    'Search country...': '국가 검색...',
  },
  'Mandarin Chinese': {
    Home: '首页',
    Program: '训练计划',
    Kael: 'Kael',
    Nutrition: '营养',
    Me: '我的',
    'App Settings': '应用设置',
    Appearance: '外观',
    Dark: '深色',
    Light: '浅色',
    Country: '国家',
    Language: '语言',
    'Measurement System': '计量单位',
    'Save Settings': '保存设置',
    Cancel: '取消',
    'Log Out': '退出登录',
    'Delete Account': '删除账户',
    'Quick Start Guide': '快速入门指南',
    'View App Walkthrough': '查看应用导览',
    Next: '下一步',
    Back: '返回',
    Skip: '跳过',
    Continue: '继续',
    Finish: '完成',
    Done: '完成',
    Save: '保存',
    'Search...': '搜索...',
    'Search country...': '搜索国家...',
  },
  Hindi: {
    Home: 'होम',
    Program: 'प्रोग्राम',
    Kael: 'Kael',
    Nutrition: 'पोषण',
    Me: 'मैं',
    'App Settings': 'ऐप सेटिंग्स',
    Appearance: 'थीम',
    Dark: 'डार्क',
    Light: 'लाइट',
    Country: 'देश',
    Language: 'भाषा',
    'Measurement System': 'माप प्रणाली',
    'Save Settings': 'सेटिंग्स सहेजें',
    Cancel: 'रद्द करें',
    'Log Out': 'लॉग आउट',
    'Delete Account': 'खाता हटाएं',
    'Quick Start Guide': 'त्वरित प्रारंभ गाइड',
    'View App Walkthrough': 'ऐप वॉकथ्रू देखें',
    Next: 'अगला',
    Back: 'पीछे',
    Skip: 'छोड़ें',
    Continue: 'जारी रखें',
    Finish: 'समाप्त',
    Done: 'हो गया',
    Save: 'सहेजें',
    'Search...': 'खोजें...',
    'Search country...': 'देश खोजें...',
  },
  Russian: {
    Home: 'Главная',
    Program: 'Программа',
    Kael: 'Kael',
    Nutrition: 'Питание',
    Me: 'Профиль',
    'App Settings': 'Настройки приложения',
    Appearance: 'Оформление',
    Dark: 'Тёмная',
    Light: 'Светлая',
    Country: 'Страна',
    Language: 'Язык',
    'Measurement System': 'Система измерений',
    'Save Settings': 'Сохранить настройки',
    Cancel: 'Отмена',
    'Log Out': 'Выйти',
    'Delete Account': 'Удалить аккаунт',
    'Quick Start Guide': 'Быстрый старт',
    'View App Walkthrough': 'Обзор приложения',
    Next: 'Далее',
    Back: 'Назад',
    Skip: 'Пропустить',
    Continue: 'Продолжить',
    Finish: 'Готово',
    Done: 'Готово',
    Save: 'Сохранить',
    'Search...': 'Поиск...',
    'Search country...': 'Поиск страны...',
  },
};

const memoryCacheByLanguage = new Map();
const pendingStringsByLanguage = new Map();
const inFlightStringsByLanguage = new Map();
const failedCooldownByLanguage = new Map();
const flushTimersByLanguage = new Map();
const listenersByLanguage = new Map();
const FAILURE_COOLDOWN_MS = 20000;

function getStorageCacheKey(language) {
  return `${STORAGE_CACHE_PREFIX}${normalizeAppLanguage(language).toLowerCase()}`;
}

function getLanguageMap(language) {
  const norm = normalizeAppLanguage(language);
  if (memoryCacheByLanguage.has(norm)) {
    return memoryCacheByLanguage.get(norm);
  }

  const map = new Map();
  const coreDict = CORE_UI_DICTIONARY[norm];
  if (coreDict && typeof coreDict === 'object') {
    for (const [k, v] of Object.entries(coreDict)) {
      if (k && v) map.set(k, v);
    }
  }

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(getStorageCacheKey(norm));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === 'string' && v.trim()) {
              map.set(k, v);
            }
          }
        }
      }
    } catch {
      // ignore storage read error
    }
  }

  memoryCacheByLanguage.set(norm, map);
  return map;
}

function persistLanguageMap(language, map) {
  if (typeof window === 'undefined') return;
  try {
    const obj = {};
    let count = 0;
    const coreDict = CORE_UI_DICTIONARY[normalizeAppLanguage(language)] || {};
    for (const [k, v] of map.entries()) {
      if (coreDict[k] === v) continue;
      obj[k] = v;
      count++;
      if (count >= MAX_LOCAL_CACHE_ENTRIES) break;
    }
    window.localStorage.setItem(getStorageCacheKey(language), JSON.stringify(obj));
  } catch {
    // ignore storage quota errors
  }
}

export function getCachedTranslation(language, text) {
  if (!text || isEnglishLanguage(language)) return text;
  const map = getLanguageMap(language);
  return map.get(text) ?? null;
}

export function shouldSkipTranslationText(text) {
  if (!text || typeof text !== 'string') return true;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 1800) return true;

  // Brand / proper nouns that must stay invariant
  const exactInvariants = new Set([
    'WASHEK',
    'WASHEK Fitness',
    'Kael',
    'Coach Kael',
    'Stripe',
    'Google',
    'Pro',
    'Elite',
    'Free',
    'PDF',
    'CSV',
    'JSON',
    'AI',
    'FAQ',
    'BMR',
    'TDEE',
    'RPE',
    'RIR',
    'ROM',
    '1RM',
    'PR',
    'PRs',
  ]);
  if (exactInvariants.has(trimmed)) return true;

  // Must contain at least one letter (automatically skips pure digits, punctuation, and emojis)
  if (!/\p{L}/u.test(trimmed)) return true;

  // Short numeric + unit tokens (e.g. "45kg", "185 lbs", "2,400 kcal", "12 reps", "4x8", "3:15")
  if (/^[-+]?\d[\d.,\s/:×x]*\s*(kg|g|mg|lbs?|cm|mm|m|km|ft|in|oz|ml|l|kcal|cal|s|sec|min|hr|hrs|d|w|wk|wks|%)?$/i.test(trimmed)) {
    return true;
  }

  // URLs, handles, or emails
  if (/^(https?:\/\/|mailto:|www\.)/i.test(trimmed)) return true;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return true;

  return false;
}

async function flushTranslationQueue(language) {
  const norm = normalizeAppLanguage(language);
  if (isEnglishLanguage(norm)) return;

  const pendingSet = pendingStringsByLanguage.get(norm);
  if (!pendingSet || pendingSet.size === 0) return;

  const batch = Array.from(pendingSet);
  pendingSet.clear();

  let inFlight = inFlightStringsByLanguage.get(norm);
  if (!inFlight) {
    inFlight = new Set();
    inFlightStringsByLanguage.set(norm, inFlight);
  }
  const uniqueToFetch = batch.filter((str) => !inFlight.has(str));
  if (uniqueToFetch.length === 0) return;
  for (const s of uniqueToFetch) inFlight.add(s);

  const map = getLanguageMap(norm);
  let cooldownMap = failedCooldownByLanguage.get(norm);
  if (!cooldownMap) {
    cooldownMap = new Map();
    failedCooldownByLanguage.set(norm, cooldownMap);
  }

  try {
    for (let i = 0; i < uniqueToFetch.length; i += BATCH_CHUNK_SIZE) {
      const chunk = uniqueToFetch.slice(i, i + BATCH_CHUNK_SIZE);
      try {
        const res = await fetch('/api/i18n/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetLanguage: norm,
            strings: chunk,
          }),
        });
        if (!res.ok) {
          const retryAt = Date.now() + FAILURE_COOLDOWN_MS;
          for (const s of chunk) cooldownMap.set(s, retryAt);
          continue;
        }
        const data = await res.json().catch(() => null);
        if (data?.success && data?.translations && typeof data.translations === 'object') {
          let updated = false;
          for (const sourceStr of chunk) {
            const translatedVal = data.translations[sourceStr];
            if (typeof translatedVal === 'string' && translatedVal.trim()) {
              map.set(sourceStr, translatedVal);
              updated = true;
            } else {
              map.set(sourceStr, sourceStr);
            }
          }
          if (updated) {
            persistLanguageMap(norm, map);
            const callbacks = listenersByLanguage.get(norm);
            if (callbacks) {
              for (const cb of callbacks) {
                try {
                  cb();
                } catch {
                  // ignore callback error
                }
              }
            }
          }
        } else {
          const retryAt = Date.now() + FAILURE_COOLDOWN_MS;
          for (const s of chunk) cooldownMap.set(s, retryAt);
        }
      } catch {
        const retryAt = Date.now() + FAILURE_COOLDOWN_MS;
        for (const s of chunk) cooldownMap.set(s, retryAt);
      }
    }
  } finally {
    for (const s of uniqueToFetch) inFlight.delete(s);
  }
}

export function queueTranslations(language, strings, onResolved) {
  const norm = normalizeAppLanguage(language);
  if (isEnglishLanguage(norm) || !Array.isArray(strings) || strings.length === 0) {
    return;
  }

  if (typeof onResolved === 'function') {
    let listeners = listenersByLanguage.get(norm);
    if (!listeners) {
      listeners = new Set();
      listenersByLanguage.set(norm, listeners);
    }
    listeners.add(onResolved);
  }

  const map = getLanguageMap(norm);
  const inFlight = inFlightStringsByLanguage.get(norm);
  const cooldownMap = failedCooldownByLanguage.get(norm);
  const now = Date.now();
  let pending = pendingStringsByLanguage.get(norm);
  if (!pending) {
    pending = new Set();
    pendingStringsByLanguage.set(norm, pending);
  }

  let added = false;
  for (const s of strings) {
    if (!s || map.has(s) || inFlight?.has(s) || pending.has(s)) continue;
    const retryAt = cooldownMap?.get(s);
    if (retryAt && now < retryAt) continue;
    pending.add(s);
    added = true;
  }

  if (!added) return;

  if (flushTimersByLanguage.has(norm)) {
    clearTimeout(flushTimersByLanguage.get(norm));
  }
  const timer = setTimeout(() => {
    flushTimersByLanguage.delete(norm);
    flushTranslationQueue(norm);
  }, BATCH_DEBOUNCE_MS);
  flushTimersByLanguage.set(norm, timer);
}

export function unregisterTranslationListener(language, onResolved) {
  const norm = normalizeAppLanguage(language);
  listenersByLanguage.get(norm)?.delete(onResolved);
}
