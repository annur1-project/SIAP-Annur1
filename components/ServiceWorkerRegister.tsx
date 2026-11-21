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

    void syncServiceWorker();
  }, []);

  return null;
}
