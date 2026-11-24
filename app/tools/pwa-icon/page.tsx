'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, Image as ImageIcon, Palette, RefreshCw, ShieldCheck, Sliders, Upload } from 'lucide-react';
import { TransparencyBanner, useAuth } from '@/lib/auth';

interface GeneratedVariant {
  filename: string;
  label: string;
  purpose: string;
  size: number;
  dataUrl: string;
}

const MATERIAL_YOU_SAMPLES = [
  { name: 'Emerald Asli', fg: '#065f46', bg: '#d1fae5' },
  { name: 'Biru Langit', fg: '#1d4ed8', bg: '#dbeafe' },
  { name: 'Amber Hangat', fg: '#b45309', bg: '#fef3c7' },
  { name: 'Ungu Pastel', fg: '#6d28d9', bg: '#ede9fe' },
];

export default function PwaIconGeneratorPage() {
  const { isSuperAdmin } = useAuth();
  const isReadOnly = !isSuperAdmin;

  const [mainSrc, setMainSrc] = useState<string>('/icons/logo-e1.png');
  const [monoSrc, setMonoSrc] = useState<string>('/icons/icon-monochrome-512.png');
  const [mainLoaded, setMainLoaded] = useState<boolean>(false);
  const [monoLoaded, setMonoLoaded] = useState<boolean>(false);
  const [mainFileName, setMainFileName] = useState<string>('');
  const [monoFileName, setMonoFileName] = useState<string>('');
  const [bgColor, setBgColor] = useState<string>('#065f46');
  const [safeScale, setSafeScale] = useState<number>(76);
  const [whiteThreshold, setWhiteThreshold] = useState<number>(220);
  const [showSafeGuide, setShowSafeGuide] = useState<boolean>(true);
  const [variants, setVariants] = useState<GeneratedVariant[]>([]);
  const [processing, setProcessing] = useState<boolean>(false);
  const [tintSampleIdx, setTintSampleIdx] = useState<number>(0);

  const mainInputRef = useRef<HTMLInputElement>(null);
  const monoInputRef = useRef<HTMLInputElement>(null);

  const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new window.Image();
      if (!src.startsWith('data:') && !src.startsWith('blob:')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });

  const renderCanvasVariants = useCallback(async () => {
    setProcessing(true);
    try {
      const mainImg = await loadImage(mainSrc);
      setMainLoaded(true);
      let monoImg = mainImg;
      if (monoSrc && monoSrc !== mainSrc) {
        try {
          monoImg = await loadImage(monoSrc);
          setMonoLoaded(true);
        } catch {
          monoImg = mainImg;
        }
      }

      const renderStandard = (size: number, scalePct: number, withSolidBg: boolean): string => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';

        if (withSolidBg) {
          ctx.fillStyle = bgColor;
          ctx.fillRect(0, 0, size, size);
        }

        const innerSize = Math.round((size * scalePct) / 100);
        const offset = Math.round((size - innerSize) / 2);
        ctx.drawImage(mainImg, offset, offset, innerSize, innerSize);
        return canvas.toDataURL('image/png');
      };

      const renderMonochrome = (size: number): string => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';

        ctx.clearRect(0, 0, size, size);
        const innerSize = Math.round((size * safeScale) / 100);
        const offset = Math.round((size - innerSize) / 2);
        ctx.drawImage(monoImg, offset, offset, innerSize, innerSize);

        const imgData = ctx.getImageData(0, 0, size, size);
        const d = imgData.data;
        const softLow = Math.max(80, whiteThreshold - 55);

        for (let i = 0; i < d.length; i += 4) {
          const origAlpha = d[i + 3];
          if (origAlpha === 0) continue;
          const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          let alpha = 0;
          if (lum <= softLow) {
            alpha = origAlpha;
          } else if (lum < whiteThreshold) {
            alpha = Math.round(((whiteThreshold - lum) / (whiteThreshold - softLow)) * origAlpha);
          }
          d[i] = 0;
          d[i + 1] = 0;
          d[i + 2] = 0;
          d[i + 3] = alpha;
        }
        ctx.putImageData(imgData, 0, 0);
        return canvas.toDataURL('image/png');
      };

      const next: GeneratedVariant[] = [
        {
          filename: 'icon-192.png',
          label: 'PWA Standard 192×192',
          purpose: 'any',
          size: 192,
          dataUrl: renderStandard(192, 100, true),
        },
        {
          filename: 'icon-512.png',
          label: 'PWA Standard 512×512',
          purpose: 'any',
          size: 512,
          dataUrl: renderStandard(512, 100, true),
        },
        {
          filename: 'icon-maskable-192.png',
          label: 'Maskable Safe-Zone 192×192',
          purpose: 'maskable',
          size: 192,
          dataUrl: renderStandard(192, safeScale, true),
        },
        {
          filename: 'icon-maskable-512.png',
          label: 'Maskable Safe-Zone 512×512',
          purpose: 'maskable',
          size: 512,
          dataUrl: renderStandard(512, safeScale, true),
        },
        {
          filename: 'apple-touch-icon.png',
          label: 'Apple Touch Icon 180×180',
          purpose: 'iOS Safari',
          size: 180,
          dataUrl: renderStandard(180, 96, true),
        },
        {
          filename: 'icon-monochrome-512.png',
          label: 'Monochrome Transparan 512×512',
          purpose: 'monochrome',
          size: 512,
          dataUrl: renderMonochrome(512),
        },
      ];
      setVariants(next);
    } catch {
      if (!mainSrc.startsWith('data:')) {
        setMainLoaded(false);
      }
      setVariants([]);
    } finally {
      setProcessing(false);
    }
  }, [bgColor, mainSrc, monoSrc, safeScale, whiteThreshold]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void renderCanvasVariants();
    }, 0);
    return () => clearTimeout(timer);
  }, [renderCanvasVariants]);

  const handleFileRead = (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'main' | 'mono'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        if (target === 'main') {
          setMainSrc(reader.result);
          setMainFileName(file.name);
          setMainLoaded(true);
        } else {
          setMonoSrc(reader.result);
          setMonoFileName(file.name);
          setMonoLoaded(true);
        }
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const downloadDataUrl = (filename: string, dataUrl: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadAll = () => {
    variants.forEach((v, idx) => {
      setTimeout(() => {
        downloadDataUrl(v.filename, v.dataUrl);
      }, idx * 180);
    });
  };

  const sampleTint = MATERIAL_YOU_SAMPLES[tintSampleIdx];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <TransparencyBanner moduleLabel="Generator Ikon PWA" isReadOnly={isReadOnly} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Generator Paket Ikon PWA Adaptif</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Proses logo utama dan siluet monokrom menjadi paket ikon PWA lengkap (192, 512, maskable safe-zone, Apple Touch, dan monochrome transparan).
          </p>
        </div>
        <button
          type="button"
          onClick={handleDownloadAll}
          disabled={(!mainLoaded && variants.length === 0) || variants.length === 0 || processing}
          className="inline-flex items-center gap-2 rounded-xl siap-btn-primary px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60 min-h-[44px] whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          Unduh Semua Paket ({variants.length || 6} File)
        </button>
      </div>

      {/* Panel Upload & Parameter Kanvas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Upload className="w-4 h-4 siap-text-accent" />
            1. Sumber Gambar Logo
          </h2>

          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-1.5">Logo Utama (Berwarna)</p>
              <input
                ref={mainInputRef}
                type="file"
                accept="image/*,.png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={(e) => handleFileRead(e, 'main')}
              />
              <button
                type="button"
                onClick={() => mainInputRef.current?.click()}
                disabled={isReadOnly}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 px-3 py-2.5 text-xs font-semibold text-slate-700 disabled:opacity-50 min-h-[44px] flex items-center gap-3 text-left transition-colors"
              >
                {mainLoaded && mainSrc ? (
                  <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 p-1 flex items-center justify-center shrink-0 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={mainSrc}
                      alt="Pratinjau Logo Utama"
                      className="w-full h-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                    <ImageIcon className="w-4 h-4 text-slate-500" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <span className="block truncate">
                    {mainFileName ? mainFileName : 'Unggah Logo Utama Baru'}
                  </span>
                  {mainLoaded && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold siap-text-accent mt-0.5">
                      <CheckCircle2 className="w-3 h-3 shrink-0" />
                      Logo berhasil dimuat
                    </span>
                  )}
                </div>
              </button>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-700 mb-1.5">Logo Siluet Monokrom (Hitam-Putih)</p>
              <input
                ref={monoInputRef}
                type="file"
                accept="image/*,.png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={(e) => handleFileRead(e, 'mono')}
              />
              <button
                type="button"
                onClick={() => monoInputRef.current?.click()}
                disabled={isReadOnly}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 px-3 py-2.5 text-xs font-semibold text-slate-700 disabled:opacity-50 min-h-[44px] flex items-center gap-3 text-left transition-colors"
              >
                {monoLoaded && monoSrc ? (
                  <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 p-1 flex items-center justify-center shrink-0 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={monoSrc}
                      alt="Pratinjau Siluet Monokrom"
                      className="w-full h-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                    <ImageIcon className="w-4 h-4 text-slate-500" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <span className="block truncate">
                    {monoFileName ? monoFileName : 'Unggah Siluet Monokrom'}
                  </span>
                  {monoLoaded && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold siap-text-accent mt-0.5">
                      <CheckCircle2 className="w-3 h-3 shrink-0" />
                      Logo berhasil dimuat
                    </span>
                  )}
                </div>
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Sliders className="w-4 h-4 siap-text-accent" />
            2. Pengaturan Safe Zone &amp; Alpha
          </h2>

          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
              <span>Warna Latar Maskable</span>
              <span className="font-mono">{bgColor}</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="w-10 h-10 rounded-lg border border-slate-300 cursor-pointer"
              />
              <input
                type="text"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
              <span>Skala Logo Dalam Safe Zone</span>
              <span className="font-mono tabular-nums">{safeScale}%</span>
            </div>
            <input
              type="range"
              min={60}
              max={92}
              value={safeScale}
              onChange={(e) => setSafeScale(Number(e.target.value))}
              className="w-full siap-accent-control"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
              <span>Ambang Hapus Putih (Monochrome Alpha)</span>
              <span className="font-mono tabular-nums">{whiteThreshold}</span>
            </div>
            <input
              type="range"
              min={150}
              max={250}
              value={whiteThreshold}
              onChange={(e) => setWhiteThreshold(Number(e.target.value))}
              className="w-full siap-accent-control"
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={showSafeGuide}
              onChange={(e) => setShowSafeGuide(e.target.checked)}
              className="rounded border-slate-300 siap-accent-control"
            />
            Tampilkan lingkaran panduan Safe Zone (80%)
          </label>
        </div>

        {/* Simulasi Material You / iOS Tinted */}
        <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Palette className="w-4 h-4 siap-text-accent" />
            3. Simulasi Themed Icon (Material You)
          </h2>
          <p className="text-xs text-slate-500">
            Pratinjau bagaimana <span className="font-mono">icon-monochrome-512.png</span> diwarnai otomatis mengikuti wallpaper HP.
          </p>
          <div className="flex items-center gap-4">
            <div
              style={{ backgroundColor: sampleTint.bg }}
              className="w-20 h-20 rounded-2xl flex items-center justify-center p-2 border border-slate-200 shrink-0"
            >
              {variants.find((v) => v.filename === 'icon-monochrome-512.png') && (
                <div
                  style={{
                    backgroundColor: sampleTint.fg,
                    WebkitMaskImage: `url(${variants.find((v) => v.filename === 'icon-monochrome-512.png')?.dataUrl})`,
                    maskImage: `url(${variants.find((v) => v.filename === 'icon-monochrome-512.png')?.dataUrl})`,
                    WebkitMaskSize: 'contain',
                    maskSize: 'contain',
                    WebkitMaskRepeat: 'no-repeat',
                    maskRepeat: 'no-repeat',
                    WebkitMaskPosition: 'center',
                    maskPosition: 'center',
                  }}
                  className="w-full h-full"
                />
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {MATERIAL_YOU_SAMPLES.map((s, idx) => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => setTintSampleIdx(idx)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                    tintSampleIdx === idx
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void renderCanvasVariants()}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 py-2 text-xs font-semibold text-slate-700"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Render Ulang Kanvas
          </button>
        </div>
      </div>

      {/* Grid Hasil Generate */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {variants.map((item) => (
          <div
            key={item.filename}
            className="rounded-2xl bg-white border border-slate-200 p-4 flex flex-col justify-between gap-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{item.label}</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  {item.filename} · purpose: {item.purpose}
                </p>
              </div>
              <ShieldCheck className="w-4 h-4 siap-text-accent shrink-0" />
            </div>

            <div className="flex items-center justify-center py-3 rounded-xl bg-[repeating-conic-gradient(#e2e8f0_0%_25%,#f8fafc_0%_50%)] bg-[length:16px_16px] border border-slate-200">
              <div className="relative w-32 h-32">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.dataUrl}
                  alt={item.label}
                  className="w-full h-full object-contain rounded-2xl shadow-sm"
                />
                {showSafeGuide && item.purpose === 'maskable' && (
                  <div className="absolute inset-[10%] rounded-full border-2 border-dashed border-amber-300/90 pointer-events-none" />
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => downloadDataUrl(item.filename, item.dataUrl)}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl siap-btn-outline py-2 text-xs font-semibold transition min-h-[40px]"
            >
              <Download className="w-3.5 h-3.5" />
              Unduh {item.filename}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
