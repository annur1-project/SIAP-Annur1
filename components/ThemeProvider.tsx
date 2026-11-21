'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  applyThemeToDocument,
  DEFAULT_TEMA_APLIKASI,
  mergeAturanOperasional,
  readExtendedLocal,
  readTemaLocal,
  readTemaModeOverride,
  writeTemaLocal,
} from '@/lib/pengaturan';

export default function ThemeProvider() {
  useEffect(() => {
    const modeOverride = readTemaModeOverride();
    const cached = readTemaLocal();
    const baseInitial = cached || readExtendedLocal()?.aturan_operasional?.tema || DEFAULT_TEMA_APLIKASI;
    const initialTema = modeOverride ? { ...baseInitial, mode: modeOverride } : baseInitial;
    applyThemeToDocument(initialTema);

    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('pengaturan_aplikasi')
        .select('logo_url, aturan_operasional')
        .eq('id', 1)
        .maybeSingle();

      if (cancelled || !data) return;
      const row = data as { logo_url?: string; aturan_operasional?: unknown };
      const localExt = readExtendedLocal();
      const merged = mergeAturanOperasional(row.aturan_operasional ?? localExt?.aturan_operasional);
      const activeOverride = readTemaModeOverride();
      const finalTema = activeOverride ? { ...merged.tema, mode: activeOverride } : merged.tema;
      writeTemaLocal(finalTema);
      applyThemeToDocument(finalTema, { logoUrl: row.logo_url || '' });
    })();

    // Dengarkan perubahan preferensi gelap/terang sistem OS jika mode === 'system'
    const mediaQuery =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;

    const handleSystemChange = () => {
      const latest = readTemaLocal() || DEFAULT_TEMA_APLIKASI;
      const activeOverride = readTemaModeOverride();
      const effectiveTema = activeOverride ? { ...latest, mode: activeOverride } : latest;
      if (effectiveTema.mode === 'system') {
        applyThemeToDocument(effectiveTema);
      }
    };

    if (mediaQuery && typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleSystemChange);
    }

    return () => {
      cancelled = true;
      if (mediaQuery && typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', handleSystemChange);
      }
    };
  }, []);

  return null;
}
