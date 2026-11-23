'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const isDevRuntime =
      process.env.NODE_ENV !== 'production' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.startsWith('ais-dev-');

    const syncServiceWorker = async () => {
      try {
        if (isDevRuntime) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((reg) => reg.unregister()));
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(
              keys
                .filter((k) => k.startsWith('e-annursatu-'))
                .map((k) => caches.delete(k))
            );
          }
          return;
        }

        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        void registration.update();
      } catch {
        // Silent fail when service worker registration is blocked by preview sandbox
      }
    };

    const handleChunkOrSyntaxError = (event: Event) => {
      const target = event.target;
      const isNextScriptFailure =
        target instanceof HTMLScriptElement &&
        typeof target.src === 'string' &&
        target.src.includes('/_next/static/');

      const errMsg = event instanceof ErrorEvent ? String(event.message || '') : '';
      const isHtmlAsScriptSyntaxError =
        errMsg.includes("Unexpected token '<'") || errMsg.includes('ChunkLoadError');

      if (!isNextScriptFailure && !isHtmlAsScriptSyntaxError) return;

      try {
        const lastReloadRaw = sessionStorage.getItem('siap_chunk_reload_at');
        const lastReload = lastReloadRaw ? Number(lastReloadRaw) : 0;
        const now = Date.now();
        if (!Number.isFinite(lastReload) || now - lastReload > 15000) {
          sessionStorage.setItem('siap_chunk_reload_at', String(now));
          window.location.reload();
        }
      } catch {
        // Ignore storage errors in restricted contexts
      }
    };

    window.addEventListener('error', handleChunkOrSyntaxError, true);
    void syncServiceWorker();

    return () => {
      window.removeEventListener('error', handleChunkOrSyntaxError, true);
    };
  }, []);

  return null;
}
