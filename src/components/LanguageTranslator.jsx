import { useCallback, useEffect, useRef } from 'react';
import { useAppSettings } from '@/lib/AppSettingsContext';
import {
  getCachedTranslation,
  isEnglishLanguage,
  normalizeAppLanguage,
  queueTranslations,
  shouldSkipTranslationText,
  unregisterTranslationListener,
} from '@/lib/i18n';

const TEXT_SKIP_SELECTOR =
  'script, style, noscript, svg, code, pre, textarea, input, [data-no-translate="true"], [translate="no"], .notranslate';

const ATTR_SKIP_SELECTOR =
  'script, style, noscript, svg, code, pre, [data-no-translate="true"], [translate="no"], .notranslate';

const TRANSLATABLE_ATTRS = ['placeholder', 'aria-label', 'title'];

const OBSERVER_OPTIONS = {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: true,
  attributeFilter: TRANSLATABLE_ATTRS,
};

function splitWhitespace(raw) {
  if (!raw || typeof raw !== 'string') {
    return { leading: '', core: '', trailing: '' };
  }
  const match = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!match) return { leading: '', core: raw, trailing: '' };
  return {
    leading: match[1] || '',
    core: match[2] || '',
    trailing: match[3] || '',
  };
}

function walkTranslatableTextNodes(rootNode, callback) {
  const walker = document.createTreeWalker(
    rootNode,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.matches?.(TEXT_SKIP_SELECTOR)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_SKIP;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );
  let current = walker.nextNode();
  while (current) {
    callback(current);
    current = walker.nextNode();
  }
}

export default function LanguageTranslator() {
  const { settings } = useAppSettings();
  const activeLanguage = normalizeAppLanguage(settings?.language || 'English');

  const originalTextMapRef = useRef(new WeakMap());
  const writtenTextMapRef = useRef(new WeakMap());
  const originalAttrMapRef = useRef(new WeakMap());
  const writtenAttrMapRef = useRef(new WeakMap());
  const observerRef = useRef(null);
  const scanTimerRef = useRef(null);
  const scheduleScanRef = useRef(null);
  const activeLanguageRef = useRef(activeLanguage);
  activeLanguageRef.current = activeLanguage;

  const restoreEnglishDom = useCallback(() => {
    if (typeof document === 'undefined' || !document.body) return;

    walkTranslatableTextNodes(document.body, (node) => {
      const orig = originalTextMapRef.current.get(node);
      const written = writtenTextMapRef.current.get(node);
      if (typeof orig === 'string' && written !== undefined) {
        if (node.nodeValue === written) {
          node.nodeValue = orig;
        } else {
          originalTextMapRef.current.set(node, node.nodeValue || '');
        }
        writtenTextMapRef.current.delete(node);
      }
    });

    const elements = document.body.querySelectorAll('[placeholder], [aria-label], [title]');
    for (const el of elements) {
      const origAttrs = originalAttrMapRef.current.get(el);
      const writtenAttrs = writtenAttrMapRef.current.get(el);
      if (!origAttrs || !writtenAttrs) continue;
      for (const attr of TRANSLATABLE_ATTRS) {
        if (writtenAttrs[attr] !== undefined && origAttrs[attr] !== undefined) {
          if (el.getAttribute(attr) === writtenAttrs[attr]) {
            el.setAttribute(attr, origAttrs[attr]);
          }
          delete writtenAttrs[attr];
        }
      }
    }
  }, []);

  const applyTranslationsToDom = useCallback(() => {
    if (typeof document === 'undefined' || !document.body) return;
    const targetLanguage = activeLanguageRef.current;

    // Disconnect observer while mutating DOM so our own edits never feedback into MutationObserver
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    const missingSet = new Set();

    try {
      if (isEnglishLanguage(targetLanguage)) {
        restoreEnglishDom();
        return;
      }

      walkTranslatableTextNodes(document.body, (node) => {
        const currentVal = node.nodeValue ?? '';
        const lastWritten = writtenTextMapRef.current.get(node);

        let sourceText;
        if (lastWritten !== undefined && currentVal === lastWritten) {
          sourceText = originalTextMapRef.current.get(node) ?? currentVal;
        } else {
          sourceText = currentVal;
          originalTextMapRef.current.set(node, currentVal);
          if (lastWritten !== undefined) {
            writtenTextMapRef.current.delete(node);
          }
        }

        const { leading, core, trailing } = splitWhitespace(sourceText);
        if (!shouldSkipTranslationText(core)) {
          const cached = getCachedTranslation(targetLanguage, core);
          if (typeof cached === 'string' && cached.trim()) {
            const targetVal = `${leading}${cached}${trailing}`;
            if (node.nodeValue !== targetVal) {
              node.nodeValue = targetVal;
            }
            writtenTextMapRef.current.set(node, targetVal);
          } else {
            missingSet.add(core);
            if (node.nodeValue !== sourceText) {
              node.nodeValue = sourceText;
              writtenTextMapRef.current.delete(node);
            }
          }
        }
      });

      const elements = document.body.querySelectorAll('[placeholder], [aria-label], [title]');
      for (const el of elements) {
        if (el.closest?.(ATTR_SKIP_SELECTOR)) {
          continue;
        }
        let origAttrs = originalAttrMapRef.current.get(el);
        if (!origAttrs) {
          origAttrs = {};
          originalAttrMapRef.current.set(el, origAttrs);
        }
        let writtenAttrs = writtenAttrMapRef.current.get(el);
        if (!writtenAttrs) {
          writtenAttrs = {};
          writtenAttrMapRef.current.set(el, writtenAttrs);
        }

        for (const attr of TRANSLATABLE_ATTRS) {
          if (!el.hasAttribute(attr)) continue;
          const currentAttrVal = el.getAttribute(attr) ?? '';
          const lastWrittenAttr = writtenAttrs[attr];

          let sourceAttr;
          if (lastWrittenAttr !== undefined && currentAttrVal === lastWrittenAttr) {
            sourceAttr = origAttrs[attr] ?? currentAttrVal;
          } else {
            sourceAttr = currentAttrVal;
            origAttrs[attr] = currentAttrVal;
            if (lastWrittenAttr !== undefined) {
              delete writtenAttrs[attr];
            }
          }

          const { leading, core, trailing } = splitWhitespace(sourceAttr);
          if (!shouldSkipTranslationText(core)) {
            const cached = getCachedTranslation(targetLanguage, core);
            if (typeof cached === 'string' && cached.trim()) {
              const targetAttrVal = `${leading}${cached}${trailing}`;
              if (el.getAttribute(attr) !== targetAttrVal) {
                el.setAttribute(attr, targetAttrVal);
              }
              writtenAttrs[attr] = targetAttrVal;
            } else {
              missingSet.add(core);
              if (el.getAttribute(attr) !== sourceAttr) {
                el.setAttribute(attr, sourceAttr);
                delete writtenAttrs[attr];
              }
            }
          }
        }
      }
    } finally {
      if (
        observerRef.current &&
        !isEnglishLanguage(activeLanguageRef.current) &&
        typeof document !== 'undefined' &&
        document.body
      ) {
        observerRef.current.observe(document.body, OBSERVER_OPTIONS);
      }
    }

    if (missingSet.size > 0 && scheduleScanRef.current) {
      queueTranslations(targetLanguage, Array.from(missingSet), scheduleScanRef.current);
    }
  }, [restoreEnglishDom]);

  const scheduleScan = useCallback(() => {
    if (scanTimerRef.current) {
      return;
    }
    scanTimerRef.current = setTimeout(() => {
      scanTimerRef.current = null;
      applyTranslationsToDom();
    }, 60);
  }, [applyTranslationsToDom]);

  scheduleScanRef.current = scheduleScan;

  useEffect(() => {
    if (typeof document === 'undefined' || !document.body) {
      return undefined;
    }

    if (isEnglishLanguage(activeLanguage)) {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (scanTimerRef.current) {
        clearTimeout(scanTimerRef.current);
        scanTimerRef.current = null;
      }
      applyTranslationsToDom();
      return undefined;
    }

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        const target = m.target;
        const targetEl = target?.nodeType === 1 ? target : target?.parentElement;
        if (targetEl?.closest?.(ATTR_SKIP_SELECTOR)) {
          continue;
        }
        if (m.type === 'characterData' && writtenTextMapRef.current.get(target) === target?.nodeValue) {
          continue;
        }
        scheduleScan();
        break;
      }
    });

    observerRef.current = observer;
    applyTranslationsToDom();

    return () => {
      observer.disconnect();
      if (observerRef.current === observer) {
        observerRef.current = null;
      }
      if (scanTimerRef.current) {
        clearTimeout(scanTimerRef.current);
        scanTimerRef.current = null;
      }
      unregisterTranslationListener(activeLanguage, scheduleScan);
    };
  }, [activeLanguage, applyTranslationsToDom, scheduleScan]);

  return null;
}
