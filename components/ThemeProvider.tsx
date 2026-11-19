'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  applyThemeToDocument,
  DEFAULT_TEMA_APLIKASI,
  mergeAturanOperasional,
  readExtendedLocal,
  readTemaLocal,
  writeTemaLocal,
} from '@/lib/pengaturan';

export default function ThemeProvider() {
  useEffect(() => {
    const cached = readTemaLocal();
    if (cached) {
      applyThemeToDocument(cached);
    } else {
      const localExt = readExtendedLocal();
      applyThemeToDocument(localExt?.aturan_operasional?.tema || DEFAULT_TEMA_APLIKASI);
    }

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
      writeTemaLocal(merged.tema);
      applyThemeToDocument(merged.tema, { logoUrl: row.logo_url || '' });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
