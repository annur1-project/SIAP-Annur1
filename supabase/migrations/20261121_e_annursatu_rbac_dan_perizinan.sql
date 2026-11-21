-- ============================================================================
-- e-annursatu (Pondok Pesantren An-Nur 1 Bululawang)
-- Skrip Migrasi Lanjutan: Super Admin Immunity, Hak Akses Centang Modul
-- (allowed_modules), Perbaikan Perizinan Pulang, Keuangan, & PSB Online
-- Jalankan seluruh skrip ini di SQL Editor Supabase Anda (100% idempoten).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. KOLOM ROLE & HAK AKSES MODUL (allowed_modules) DI TABEL PENGURUS
-- ----------------------------------------------------------------------------
ALTER TABLE public.pengurus
  ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE,
  ADD COLUMN IF NOT EXISTS username TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'pengurus',
  ADD COLUMN IF NOT EXISTS allowed_modules JSONB;

CREATE INDEX IF NOT EXISTS idx_pengurus_auth_user_id ON public.pengurus (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_pengurus_username ON public.pengurus (lower(username));
CREATE INDEX IF NOT EXISTS idx_pengurus_role ON public.pengurus (lower(role));

-- Pastikan akun admin.utama selalu memiliki role = 'super_admin'
UPDATE public.pengurus
SET role = 'super_admin'
WHERE lower(coalesce(username, '')) = 'admin.utama'
  AND lower(coalesce(role, '')) <> 'super_admin';

-- ----------------------------------------------------------------------------
-- 2. FUNGSI HELPER RBAC (DENGAN KEKEBALAN PENUH SUPER ADMIN)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_pengurus_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
  FROM public.pengurus p
  WHERE p.auth_user_id = auth.uid()
    AND lower(coalesce(p.status, 'aktif')) = 'aktif'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_active_pengurus()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_pengurus_id() IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pengurus p
    WHERE p.auth_user_id = auth.uid()
      AND lower(coalesce(p.status, 'aktif')) = 'aktif'
      AND (
        lower(coalesce(p.role, '')) = 'super_admin'
        OR lower(coalesce(p.username, '')) = 'admin.utama'
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.has_jabatan_keywords(keywords TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1
    FROM public.pengurus_jabatan pj
    WHERE pj.pengurus_id = public.current_pengurus_id()
      AND EXISTS (
        SELECT 1
        FROM unnest(keywords) kw
        WHERE lower(coalesce(pj.divisi, '')) LIKE '%' || lower(kw) || '%'
           OR lower(coalesce(pj.nama_jabatan, '')) LIKE '%' || lower(kw) || '%'
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.has_module_access(module_key TEXT, keywords TEXT[] DEFAULT ARRAY[]::TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.pengurus p
      WHERE p.id = public.current_pengurus_id()
        AND p.allowed_modules IS NOT NULL
        AND jsonb_typeof(p.allowed_modules) = 'array'
        AND p.allowed_modules ? module_key
    )
    OR (
      cardinality(keywords) > 0
      AND public.has_jabatan_keywords(keywords)
    );
$$;

CREATE OR REPLACE FUNCTION public.is_pimpinan_atau_bendahara()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
    OR public.has_module_access('bisyaroh', ARRAY[
      'pengasuh',
      'dzurriyah',
      'direktur pendidikan',
      'kepala pondok',
      'bendahara'
    ]);
$$;

CREATE OR REPLACE FUNCTION public.is_admin_atau_sekretaris()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
    OR public.has_module_access('pengurus', ARRAY[
      'pengasuh',
      'dzurriyah',
      'kepala pondok',
      'sekretaris',
      'operator emis'
    ]);
$$;

CREATE OR REPLACE FUNCTION public.is_sekretaris_emis_atau_pimpinan()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
    OR public.has_module_access('santri', ARRAY[
      'pengasuh',
      'dzurriyah',
      'direktur pendidikan',
      'kepala pondok',
      'sekretaris',
      'operator emis'
    ]);
$$;

-- ----------------------------------------------------------------------------
-- 3. VIEW v_pengurus_aman (Mengekspos role & allowed_modules) & TRIGGER GUARD
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_pengurus_aman
WITH (security_invoker = false)
AS
SELECT
  p.id,
  p.nama_lengkap,
  p.no_wa,
  p.alamat,
  p.foto_url,
  p.ttd_url,
  CASE
    WHEN public.is_pimpinan_atau_bendahara() THEN p.nominal_bisyaroh
    ELSE NULL
  END AS nominal_bisyaroh,
  p.status,
  p.masa_khidmat,
  p.catatan,
  p.username,
  p.role,
  p.allowed_modules,
  p.auth_user_id,
  p.must_change_password,
  p.last_login_at,
  p.created_at
FROM public.pengurus p
WHERE public.is_active_pengurus();

GRANT SELECT ON public.v_pengurus_aman TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_pengurus_sensitive_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin() THEN
    IF NOT public.is_pimpinan_atau_bendahara() THEN
      IF TG_OP = 'UPDATE' AND NEW.nominal_bisyaroh IS DISTINCT FROM OLD.nominal_bisyaroh THEN
        RAISE EXCEPTION 'Akses ditolak: hanya Admin Utama, Pimpinan Inti, atau Bendahara yang berhak mengubah nominal bisyaroh.';
      END IF;
      IF TG_OP = 'INSERT' THEN
        NEW.nominal_bisyaroh := 0;
      END IF;
    END IF;

    IF TG_OP = 'UPDATE' AND (
      NEW.role IS DISTINCT FROM OLD.role
      OR NEW.allowed_modules IS DISTINCT FROM OLD.allowed_modules
    ) THEN
      RAISE EXCEPTION 'Akses ditolak: hanya Admin Utama (Super Admin) yang berhak mengubah role dan hak akses modul pengurus.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_pengurus_bisyaroh ON public.pengurus;
CREATE TRIGGER trg_guard_pengurus_bisyaroh
BEFORE INSERT OR UPDATE ON public.pengurus
FOR EACH ROW
EXECUTE FUNCTION public.guard_pengurus_sensitive_columns();

-- ----------------------------------------------------------------------------
-- 4. PERBAIKAN TABEL izin_pulang (petugas_nama & petugas_id nullable/SET NULL)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  fk_rec RECORD;
BEGIN
  IF to_regclass('public.izin_pulang') IS NOT NULL THEN
    ALTER TABLE public.izin_pulang
      ADD COLUMN IF NOT EXISTS petugas_nama TEXT DEFAULT '';

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'izin_pulang'
        AND column_name = 'petugas_id'
        AND is_nullable = 'NO'
    ) THEN
      ALTER TABLE public.izin_pulang ALTER COLUMN petugas_id DROP NOT NULL;
    END IF;

    FOR fk_rec IN
      SELECT tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.table_name = 'izin_pulang'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'petugas_id'
    LOOP
      EXECUTE format('ALTER TABLE public.izin_pulang DROP CONSTRAINT IF EXISTS %I', fk_rec.constraint_name);
    END LOOP;

    ALTER TABLE public.izin_pulang
      ADD CONSTRAINT izin_pulang_petugas_id_fkey
      FOREIGN KEY (petugas_id) REFERENCES public.pengurus(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 5. PERBAIKAN KOLOM KEUANGAN & PENGATURAN APLIKASI
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.keuangan_transaksi') IS NOT NULL THEN
    ALTER TABLE public.keuangan_transaksi
      ADD COLUMN IF NOT EXISTS lampiran_url TEXT DEFAULT '';
  END IF;

  IF to_regclass('public.pembayaran_santri_detail') IS NOT NULL THEN
    ALTER TABLE public.pembayaran_santri_detail
      ADD COLUMN IF NOT EXISTS petugas_nama TEXT DEFAULT '';
  END IF;

  IF to_regclass('public.pengaturan_aplikasi') IS NOT NULL THEN
    ALTER TABLE public.pengaturan_aplikasi
      ADD COLUMN IF NOT EXISTS kota_surat TEXT DEFAULT 'Bululawang, Malang',
      ADD COLUMN IF NOT EXISTS rekening_bank TEXT DEFAULT 'BSI (Bank Syariah Indonesia)',
      ADD COLUMN IF NOT EXISTS rekening_nomor TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS rekening_atas_nama TEXT DEFAULT 'Pondok Pesantren An-Nur 1',
      ADD COLUMN IF NOT EXISTS kop_surat_url TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS aturan_operasional JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 6. TABEL PSB ONLINE (psb_pendaftaran) & KEBIJAKAN RLS PUBLIK/INTERNAL
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.psb_pendaftaran (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  no_registrasi TEXT NOT NULL UNIQUE,
  tahun_psb INTEGER NOT NULL DEFAULT 2027,
  status TEXT NOT NULL DEFAULT 'menunggu_verifikasi',
  paket TEXT NOT NULL DEFAULT 'reguler',
  kamar_rencana TEXT DEFAULT '',
  rencana_tgl_masuk DATE,
  nama_lengkap TEXT NOT NULL,
  jk TEXT NOT NULL DEFAULT 'L',
  tempat_lahir TEXT DEFAULT '',
  tgl_lahir DATE,
  jenjang_pendidikan TEXT DEFAULT 'MTs / SMP',
  nama_ayah TEXT DEFAULT '',
  nama_ibu TEXT DEFAULT '',
  nama_wali TEXT NOT NULL,
  no_wa_wali TEXT NOT NULL,
  alamat_jalan TEXT DEFAULT '',
  desa TEXT DEFAULT '',
  kecamatan TEXT DEFAULT '',
  kabupaten TEXT DEFAULT '',
  provinsi TEXT DEFAULT '',
  kode_pos TEXT DEFAULT '',
  dapat_promo_pangkal BOOLEAN NOT NULL DEFAULT true,
  total_biaya_awal INTEGER NOT NULL DEFAULT 850000,
  nominal_keringanan INTEGER NOT NULL DEFAULT 0,
  catatan_keringanan TEXT DEFAULT '',
  total_biaya_akhir INTEGER NOT NULL DEFAULT 850000,
  dp_nominal INTEGER NOT NULL DEFAULT 500000,
  dp_terbayar INTEGER NOT NULL DEFAULT 0,
  pelunasan_terbayar INTEGER NOT NULL DEFAULT 0,
  bukti_dp_url TEXT DEFAULT '',
  metode_dp TEXT DEFAULT 'transfer',
  tgl_verifikasi_dp TIMESTAMPTZ,
  verifikator_dp TEXT DEFAULT '',
  tgl_lunas TIMESTAMPTZ,
  santri_id UUID REFERENCES public.santri(id) ON DELETE SET NULL,
  nis_terbit TEXT DEFAULT '',
  no_kuitansi_dp TEXT DEFAULT '',
  no_kuitansi_lunas TEXT DEFAULT '',
  catatan_wali TEXT DEFAULT '',
  catatan_pengurus TEXT DEFAULT '',
  setuju_ketentuan BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_psb_pendaftaran_wa ON public.psb_pendaftaran (no_wa_wali);
CREATE INDEX IF NOT EXISTS idx_psb_pendaftaran_status ON public.psb_pendaftaran (status);

ALTER TABLE public.psb_pendaftaran ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS psb_pendaftaran_public_select ON public.psb_pendaftaran;
CREATE POLICY psb_pendaftaran_public_select ON public.psb_pendaftaran
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS psb_pendaftaran_public_insert ON public.psb_pendaftaran;
CREATE POLICY psb_pendaftaran_public_insert ON public.psb_pendaftaran
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS psb_pendaftaran_internal_update ON public.psb_pendaftaran;
CREATE POLICY psb_pendaftaran_internal_update ON public.psb_pendaftaran
  FOR UPDATE TO authenticated
  USING (public.has_module_access('pendaftaran', ARRAY['pendaftaran','psb','sekretaris','bendahara','pengasuh','kepala pondok']))
  WITH CHECK (public.has_module_access('pendaftaran', ARRAY['pendaftaran','psb','sekretaris','bendahara','pengasuh','kepala pondok']));

DROP POLICY IF EXISTS psb_pendaftaran_internal_delete ON public.psb_pendaftaran;
CREATE POLICY psb_pendaftaran_internal_delete ON public.psb_pendaftaran
  FOR DELETE TO authenticated
  USING (public.has_module_access('pendaftaran', ARRAY['pendaftaran','psb','sekretaris','bendahara','pengasuh','kepala pondok']));

-- ----------------------------------------------------------------------------
-- 7. PEMBARUAN KEBIJAKAN RLS LINTAS MODUL (MENDUKUNG allowed_modules & SUPER ADMIN)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  -- Pengaturan Aplikasi: baca publik untuk info PSB, ubah khusus Super Admin / modul pengaturan
  IF to_regclass('public.pengaturan_aplikasi') IS NOT NULL THEN
    ALTER TABLE public.pengaturan_aplikasi ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS pengaturan_aplikasi_public_select ON public.pengaturan_aplikasi;
    CREATE POLICY pengaturan_aplikasi_public_select ON public.pengaturan_aplikasi
      FOR SELECT TO anon, authenticated USING (true);
    DROP POLICY IF EXISTS pengaturan_aplikasi_admin_write ON public.pengaturan_aplikasi;
    CREATE POLICY pengaturan_aplikasi_admin_write ON public.pengaturan_aplikasi
      FOR ALL TO authenticated
      USING (public.has_module_access('pengaturan', ARRAY['pengasuh','kepala pondok']))
      WITH CHECK (public.has_module_access('pengaturan', ARRAY['pengasuh','kepala pondok']));
  END IF;

  -- Izin Pulang
  IF to_regclass('public.izin_pulang') IS NOT NULL THEN
    ALTER TABLE public.izin_pulang ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS izin_pulang_select_active ON public.izin_pulang;
    CREATE POLICY izin_pulang_select_active ON public.izin_pulang
      FOR SELECT TO authenticated USING (public.is_active_pengurus());
    DROP POLICY IF EXISTS izin_pulang_write_authorized ON public.izin_pulang;
    CREATE POLICY izin_pulang_write_authorized ON public.izin_pulang
      FOR ALL TO authenticated
      USING (public.has_module_access('perizinan', ARRAY['perizinan','keamanan','sekretaris','pengasuh','kepala pondok']))
      WITH CHECK (public.has_module_access('perizinan', ARRAY['perizinan','keamanan','sekretaris','pengasuh','kepala pondok']));
  END IF;

  -- Keuangan Transaksi & Pembayaran Detail
  IF to_regclass('public.keuangan_transaksi') IS NOT NULL THEN
    ALTER TABLE public.keuangan_transaksi ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS keuangan_transaksi_select_privacy ON public.keuangan_transaksi;
    CREATE POLICY keuangan_transaksi_select_privacy ON public.keuangan_transaksi
      FOR SELECT TO authenticated
      USING (
        public.is_active_pengurus()
        AND (
          public.is_pimpinan_atau_bendahara()
          OR NOT (
            lower(coalesce(kategori, '')) LIKE '%bisyaroh%'
            OR lower(coalesce(keterangan, '')) LIKE '%bisyaroh%'
          )
        )
      );
    DROP POLICY IF EXISTS keuangan_transaksi_write_bendahara_dan_integrasi ON public.keuangan_transaksi;
    CREATE POLICY keuangan_transaksi_write_bendahara_dan_integrasi ON public.keuangan_transaksi
      FOR ALL TO authenticated
      USING (
        public.is_pimpinan_atau_bendahara()
        OR public.has_module_access('keuangan', ARRAY['bendahara','pengasuh','kepala pondok'])
        OR (
          (
            public.has_module_access('koperasi', ARRAY['koprasi','koperasi'])
            OR public.has_module_access('perizinan', ARRAY['keamanan','perizinan'])
            OR public.has_module_access('pendaftaran', ARRAY['sekretaris','operator emis','psb','pendaftaran'])
            OR public.has_module_access('santri', ARRAY['sekretaris','operator emis'])
          )
          AND NOT (lower(coalesce(kategori, '')) LIKE '%bisyaroh%')
        )
      )
      WITH CHECK (
        public.is_pimpinan_atau_bendahara()
        OR public.has_module_access('keuangan', ARRAY['bendahara','pengasuh','kepala pondok'])
        OR (
          (
            public.has_module_access('koperasi', ARRAY['koprasi','koperasi'])
            OR public.has_module_access('perizinan', ARRAY['keamanan','perizinan'])
            OR public.has_module_access('pendaftaran', ARRAY['sekretaris','operator emis','psb','pendaftaran'])
            OR public.has_module_access('santri', ARRAY['sekretaris','operator emis'])
          )
          AND NOT (lower(coalesce(kategori, '')) LIKE '%bisyaroh%')
        )
      );
  END IF;

  IF to_regclass('public.pembayaran_santri_detail') IS NOT NULL THEN
    ALTER TABLE public.pembayaran_santri_detail ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS pembayaran_santri_detail_select ON public.pembayaran_santri_detail;
    CREATE POLICY pembayaran_santri_detail_select ON public.pembayaran_santri_detail
      FOR SELECT TO authenticated USING (public.is_active_pengurus());
    DROP POLICY IF EXISTS pembayaran_santri_detail_write ON public.pembayaran_santri_detail;
    CREATE POLICY pembayaran_santri_detail_write ON public.pembayaran_santri_detail
      FOR ALL TO authenticated
      USING (public.has_module_access('keuangan', ARRAY['bendahara','sekretaris','pengasuh','kepala pondok']) OR public.has_module_access('pendaftaran', ARRAY['psb','pendaftaran']))
      WITH CHECK (public.has_module_access('keuangan', ARRAY['bendahara','sekretaris','pengasuh','kepala pondok']) OR public.has_module_access('pendaftaran', ARRAY['psb','pendaftaran']));
  END IF;

  -- Kebersihan
  IF to_regclass('public.kebersihan_area') IS NOT NULL THEN
    DROP POLICY IF EXISTS kebersihan_area_write ON public.kebersihan_area;
    CREATE POLICY kebersihan_area_write ON public.kebersihan_area
      FOR ALL TO authenticated
      USING (public.has_module_access('kebersihan', ARRAY['kebersihan','pengasuh','kepala pondok','sekretaris']))
      WITH CHECK (public.has_module_access('kebersihan', ARRAY['kebersihan','pengasuh','kepala pondok','sekretaris']));
  END IF;

  IF to_regclass('public.kebersihan_jadwal') IS NOT NULL THEN
    DROP POLICY IF EXISTS kebersihan_jadwal_write ON public.kebersihan_jadwal;
    CREATE POLICY kebersihan_jadwal_write ON public.kebersihan_jadwal
      FOR ALL TO authenticated
      USING (public.has_module_access('kebersihan', ARRAY['kebersihan','pengasuh','kepala pondok','sekretaris']))
      WITH CHECK (public.has_module_access('kebersihan', ARRAY['kebersihan','pengasuh','kepala pondok','sekretaris']));
  END IF;

  -- Koperasi
  IF to_regclass('public.koperasi_pengaturan') IS NOT NULL THEN
    DROP POLICY IF EXISTS koperasi_pengaturan_write ON public.koperasi_pengaturan;
    CREATE POLICY koperasi_pengaturan_write ON public.koperasi_pengaturan
      FOR ALL TO authenticated
      USING (public.has_module_access('koperasi', ARRAY['koprasi','koperasi','bendahara','pengasuh','kepala pondok']))
      WITH CHECK (public.has_module_access('koperasi', ARRAY['koprasi','koperasi','bendahara','pengasuh','kepala pondok']));
  END IF;

  IF to_regclass('public.koperasi_kulaan') IS NOT NULL THEN
    DROP POLICY IF EXISTS koperasi_kulaan_write ON public.koperasi_kulaan;
    CREATE POLICY koperasi_kulaan_write ON public.koperasi_kulaan
      FOR ALL TO authenticated
      USING (public.has_module_access('koperasi', ARRAY['koprasi','koperasi','bendahara','pengasuh','kepala pondok']))
      WITH CHECK (public.has_module_access('koperasi', ARRAY['koprasi','koperasi','bendahara','pengasuh','kepala pondok']));
  END IF;

  IF to_regclass('public.koperasi_tutup_kas') IS NOT NULL THEN
    DROP POLICY IF EXISTS koperasi_tutup_kas_write ON public.koperasi_tutup_kas;
    CREATE POLICY koperasi_tutup_kas_write ON public.koperasi_tutup_kas
      FOR ALL TO authenticated
      USING (public.has_module_access('koperasi', ARRAY['koprasi','koperasi','bendahara','pengasuh','kepala pondok']))
      WITH CHECK (public.has_module_access('koperasi', ARRAY['koprasi','koperasi','bendahara','pengasuh','kepala pondok']));
  END IF;

  IF to_regclass('public.koperasi_setoran_pondok') IS NOT NULL THEN
    DROP POLICY IF EXISTS koperasi_setoran_write ON public.koperasi_setoran_pondok;
    CREATE POLICY koperasi_setoran_write ON public.koperasi_setoran_pondok
      FOR ALL TO authenticated
      USING (public.has_module_access('koperasi', ARRAY['koprasi','koperasi','bendahara','pengasuh','kepala pondok']))
      WITH CHECK (public.has_module_access('koperasi', ARRAY['koprasi','koperasi','bendahara','pengasuh','kepala pondok']));
  END IF;

  -- Dapur
  IF to_regclass('public.dapur_buku_masak') IS NOT NULL THEN
    DROP POLICY IF EXISTS dapur_buku_masak_write ON public.dapur_buku_masak;
    CREATE POLICY dapur_buku_masak_write ON public.dapur_buku_masak
      FOR ALL TO authenticated
      USING (public.has_module_access('dapur', ARRAY['dapur','bendahara','pengasuh','kepala pondok']))
      WITH CHECK (public.has_module_access('dapur', ARRAY['dapur','bendahara','pengasuh','kepala pondok']));
  END IF;

  IF to_regclass('public.dapur_jualan_malam') IS NOT NULL THEN
    DROP POLICY IF EXISTS dapur_jualan_malam_write ON public.dapur_jualan_malam;
    CREATE POLICY dapur_jualan_malam_write ON public.dapur_jualan_malam
      FOR ALL TO authenticated
      USING (public.has_module_access('dapur', ARRAY['dapur','bendahara','pengasuh','kepala pondok']))
      WITH CHECK (public.has_module_access('dapur', ARRAY['dapur','bendahara','pengasuh','kepala pondok']));
  END IF;

  -- Sarpras Laporan
  IF to_regclass('public.sarpras_laporan') IS NOT NULL THEN
    DROP POLICY IF EXISTS sarpras_laporan_update_sarpras ON public.sarpras_laporan;
    CREATE POLICY sarpras_laporan_update_sarpras ON public.sarpras_laporan
      FOR UPDATE TO authenticated
      USING (public.has_module_access('sarpras', ARRAY['sarpras','pengasuh','kepala pondok']));
    DROP POLICY IF EXISTS sarpras_laporan_delete_sarpras ON public.sarpras_laporan;
    CREATE POLICY sarpras_laporan_delete_sarpras ON public.sarpras_laporan
      FOR DELETE TO authenticated
      USING (public.has_module_access('sarpras', ARRAY['sarpras','pengasuh','kepala pondok']));
  END IF;
END $$;
