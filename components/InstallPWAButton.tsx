'use client';

import React, { useEffect, useState } from 'react';
import { Download, Share, PlusSquare, Smartphone, X, CheckCircle2 } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface InstallPWAButtonProps {
  variant?: 'sidebar' | 'login' | 'compact';
  className?: string;
}

export default function InstallPWAButton({
  variant = 'login',
  className = '',
}: InstallPWAButtonProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showManualGuide, setShowManualGuide] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const checkStandalone = () => {
      const standaloneMatch = window.matchMedia('(display-mode: standalone)').matches;
      const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      return standaloneMatch || iosStandalone;
    };

    const ua = window.navigator.userAgent.toLowerCase();
    const iosDetected = /iphone|ipad|ipod/.test(ua);

    const timer = setTimeout(() => {
      setMounted(true);
      setIsInstalled(checkStandalone());
      setIsIOS(iosDetected);
    }, 0);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  if (!mounted || isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
      }
      return;
    }

    if (isIOS) {
      setShowIOSGuide(true);
      return;
    }

    setShowManualGuide(true);
  };

  const buttonClasses =
    variant === 'sidebar'
      ? `w-full flex items-center justify-center gap-2 rounded-lg bg-white/15 hover:bg-white/25 text-white border border-white/25 px-3 py-2 text-xs font-semibold transition min-h-[40px] ${className}`
      : variant === 'compact'
        ? `inline-flex items-center gap-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white border border-white/25 px-2.5 py-1.5 text-xs font-semibold transition min-h-[36px] whitespace-nowrap shrink-0 ${className}`
        : `w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 px-4 py-2.5 text-sm font-semibold transition min-h-[44px] ${className}`;

  return (
    <>
      <button type="button" onClick={handleInstallClick} className={buttonClasses}>
        <Download className="w-4 h-4 shrink-0" />
        <span className="whitespace-nowrap">Instal Aplikasi</span>
      </button>

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-xl text-slate-900 dark:text-slate-100">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-900/10 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-700 dark:text-emerald-300 shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold leading-snug">Instal e-annursatu di iPhone / iPad</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Khusus browser Safari iOS</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                aria-label="Tutup panduan"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <ol className="mt-4 space-y-3 text-sm text-slate-700 dark:text-slate-300">
              <li className="flex items-start gap-2.5">
                <span className="w-6 h-6 rounded-full bg-emerald-700 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  1
                </span>
                <span>
                  Ketuk ikon <strong className="inline-flex items-center gap-1 text-slate-900 dark:text-white"><Share className="w-4 h-4 text-emerald-700" /> Bagikan (Share)</strong> pada bilah Safari.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-6 h-6 rounded-full bg-emerald-700 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  2
                </span>
                <span>
                  Gulir ke bawah lalu pilih <strong className="inline-flex items-center gap-1 text-slate-900 dark:text-white"><PlusSquare className="w-4 h-4 text-emerald-700" /> Add to Home Screen / Tambah ke Layar Utama</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-6 h-6 rounded-full bg-emerald-700 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  3
                </span>
                <span>
                  Ketuk <strong className="text-slate-900 dark:text-white">Tambah (Add)</strong> di pojok kanan atas.
                </span>
              </li>
            </ol>

            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="mt-5 w-full rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white py-2.5 text-sm font-semibold min-h-[44px]"
            >
              Saya Mengerti
            </button>
          </div>
        </div>
      )}

      {showManualGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-xl text-slate-900 dark:text-slate-100">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-6 h-6 text-emerald-700 shrink-0" />
                <h3 className="text-base font-bold">Instalasi Aplikasi e-annursatu</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowManualGuide(false)}
                aria-label="Tutup panduan"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Buka menu browser Anda (ikon titik tiga di pojok kanan atas Chrome/Edge), lalu pilih{' '}
              <strong>Instal aplikasi / Install e-annursatu</strong> atau <strong>Tambahkan ke layar utama</strong>.
            </p>
            <button
              type="button"
              onClick={() => setShowManualGuide(false)}
              className="mt-4 w-full rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white py-2.5 text-sm font-semibold min-h-[44px]"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </>
  );
}
