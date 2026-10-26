import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';

import App from '@/App.jsx';
import '@/index.css';

// Intercept and swallow third-party browser extension errors (e.g. MetaMask, Phantom, wallet inpage scripts)
if (typeof window !== 'undefined') {
  const isExtensionError = (msg, src, err) => {
    let str = '';
    try {
      str = `${msg || ''} ${src || ''} ${err?.stack || err?.message || ''}`;
    } catch {
      str = '';
    }
    return (
      str.includes('WebSocket closed without opened') ||
      (str.includes('[vite]') && str.includes('WebSocket')) ||
      (str.includes('@vite/client') && str.includes('WebSocket')) ||
      (str.includes('WebSocket') && str.includes('ais-dev-')) ||
      str.includes('chrome-extension://') ||
      str.includes('moz-extension://') ||
      str.includes('safari-extension://') ||
      str.includes('MetaMask') ||
      str.includes('metamask') ||
      str.includes('inpage.js') ||
      str.includes('nkbihfbeogaeaoehlefnkodbefgpgknn') ||
      str.includes('Failed to connect to MetaMask') ||
      str.includes('Could not establish connection') ||
      str.includes('Receiving end does not exist')
    );
  };

  const originalConsoleError = console.error;
  console.error = (...args) => {
    for (const arg of args) {
      const text = (arg && (arg.stack || arg.message)) ? (arg.stack || arg.message) : String(arg || '');
      if (isExtensionError(text, '', arg)) {
        return;
      }
    }
    return originalConsoleError.apply(console, args);
  };

  const originalConsoleWarn = console.warn;
  console.warn = (...args) => {
    for (const arg of args) {
      const text = (arg && (arg.stack || arg.message)) ? (arg.stack || arg.message) : String(arg || '');
      if (isExtensionError(text, '', arg)) {
        return;
      }
    }
    return originalConsoleWarn.apply(console, args);
  };

  window.addEventListener('error', (event) => {
    if (isExtensionError(event.message, event.filename, event.error)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      return true;
    }
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = reason?.message || reason?.stack || String(reason || '');
    if (isExtensionError(msg, '', reason)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    }
  }, true);
}

// Register service worker for offline fitness data and asset caching
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onNeedRefresh() {
      console.debug('[PWA] New workout updates available.');
    },
    onOfflineReady() {
      console.debug('[PWA] Workout programs and assets cached for offline use.');
    },
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
