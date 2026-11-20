-- ============================================================================
-- e-annursatu (Pondok Pesantren An-Nur 1 Bululawang)
-- Skrip Migrasi Skema PostgreSQL, Fungsi Helper RBAC & Kebijakan RLS Ketat
-- Jalankan seluruh skrip ini di SQL Editor Supabase Anda.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. PENYESUAIAN TABEL PENGURUS (1 Pengurus = 1 Akun Pribadi)
-- ----------------------------------------------------------------------------
ALTER TABLE public.pengurus
  ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE,
  ADD COLUMN IF NOT EXISTS username TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pengurus_auth_user_id ON public.pengurus (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_pengurus_username ON public.pengurus (lower(username));

-- ----------------------------------------------------------------------------
-- 2. FUNGSI HELPER OTORISASI MULTI-JABATAN & PRIVASI (SECURITY DEFINER)
-- ----------------------------------------------------------------------------

-- Mengembalikan pengurus.id milik user yang login ONLY jika status = 'aktif'
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

-- Cek apakah pengurus aktif memiliki salah satu jabatan / divisi yang cocok
CREATE OR REPLACE FUNCTION public.has_jabatan_keywords(keywords TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
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

-- Pimpinan Inti (Pengasuh, Dewan Pengasuh, Direktur Pendidikan, Kepala Pondok) & Bendahara
CREATE OR REPLACE FUNCTION public.is_pimpinan_atau_bendahara()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_jabatan_keywords(ARRAY[
    'pengasuh',
    'dzurriyah',
    'direktur pendidikan',
    'kepala pondok',
    'bendahara'
  ]);
$$;

-- Admin Utama / Sekretaris / Operator EMIS / Pimpinan Inti
CREATE OR REPLACE FUNCTION public.is_admin_atau_sekretaris()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_jabatan_keywords(ARRAY[
    'pengasuh',
    'dzurriyah',
    'kepala pondok',
    'sekretaris',
    'operator emis'
  ]);
$$;

-- Hak akses lihat utuh NIK & No KK santri
CREATE OR REPLACE FUNCTION public.is_sekretaris_emis_atau_pimpinan()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_jabatan_keywords(ARRAY[
    'pengasuh',
    'dzurriyah',
    'direktur pendidikan',
    'kepala pondok',
    'sekretaris',
    'operator emis'
  ]);
$$;

-- Helper penyamaran NIK/KK (misal: 3507••••••••0001)
CREATE OR REPLACE FUNCTION public.mask_identity_number(val TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  clean TEXT := trim(coalesce(val, ''));
BEGIN
  IF clean = '' THEN
    RETURN NULL;
  END IF;
  IF length(clean) <= 6 THEN
    RETURN repeat('•', length(clean));
  END IF;
  RETURN left(clean, 4) || repeat('•', greatest(4, length(clean) - 8)) || right(clean, 4);
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. VIEW AMAN PRIVASI KETAT (BISYAROH & NIK/KK SANTRI)
-- ----------------------------------------------------------------------------

-- View pengurus aman: nominal_bisyaroh bernilai NULL jika bukan Pimpinan Inti / Bendahara
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
  p.auth_user_id,
  p.must_change_password,
  p.last_login_at,
  p.created_at
FROM public.pengurus p
WHERE public.is_active_pengurus();

-- RPC khusus nominal bisyaroh (mengembalikan kosong bila bukan Pimpinan Inti / Bendahara)
CREATE OR REPLACE FUNCTION public.get_pengurus_bisyaroh_map()
RETURNS TABLE (pengurus_id UUID, nominal_bisyaroh NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.nominal_bisyaroh
  FROM public.pengurus p
  WHERE public.is_pimpinan_atau_bendahara();
$$;

-- View santri aman: NIK & No KK (termasuk NIK ayah/ibu/wali) disamarkan pada mode transparansi
CREATE OR REPLACE VIEW public.v_santri_aman
WITH (security_invoker = false)
AS
SELECT
  s.id,
  s.nis,
  s.tgl_masuk,
  s.nama_lengkap,
  s.kamar,
  s.tarif_syahriyah,
  s.nisn,
  CASE WHEN public.is_sekretaris_emis_atau_pimpinan() THEN s.nik ELSE public.mask_identity_number(s.nik) END AS nik,
  CASE WHEN public.is_sekretaris_emis_atau_pimpinan() THEN s.no_kk ELSE public.mask_identity_number(s.no_kk) END AS no_kk,
  s.tempat_lahir,
  s.tgl_lahir,
  s.jk,
  s.hobi,
  s.cita_cita,
  s.status_ayah,
  s.nama_ayah,
  CASE WHEN public.is_sekretaris_emis_atau_pimpinan() THEN s.nik_ayah ELSE public.mask_identity_number(s.nik_ayah) END AS nik_ayah,
  s.pendidikan_ayah,
  s.pekerjaan_ayah,
  s.penghasilan_ayah,
  s.no_wa_ayah,
  s.status_ibu,
  s.nama_ibu,
  CASE WHEN public.is_sekretaris_emis_atau_pimpinan() THEN s.nik_ibu ELSE public.mask_identity_number(s.nik_ibu) END AS nik_ibu,
  s.pendidikan_ibu,
  s.pekerjaan_ibu,
  s.penghasilan_ibu,
  s.no_wa_ibu,
  s.nama_wali,
  CASE WHEN public.is_sekretaris_emis_atau_pimpinan() THEN s.nik_wali ELSE public.mask_identity_number(s.nik_wali) END AS nik_wali,
  s.pendidikan_wali,
  s.pekerjaan_wali,
  s.no_wa_wali,
  s.alamat_jalan,
  s.rt,
  s.rw,
  s.desa,
  s.kecamatan,
  s.kabupaten,
  s.provinsi,
  s.kode_pos,
  s.status,
  s.foto_url,
  s.unit_asrama,
  s.paket_pendaftaran,
  s.nominal_pendaftaran,
  s.catatan_keringanan,
  s.created_at
FROM public.santri s
WHERE public.is_active_pengurus();

GRANT SELECT ON public.v_pengurus_aman TO authenticated;
GRANT SELECT ON public.v_santri_aman TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pengurus_bisyaroh_map() TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. MODUL BARU: KEBERSIHAN & JADWAL PIKET (/kebersihan)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kebersihan_area (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama_area TEXT NOT NULL UNIQUE,
  deskripsi TEXT DEFAULT '',
  urutan INTEGER NOT NULL DEFAULT 10,
  aktif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.kebersihan_jadwal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tanggal DATE NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('harian', 'roan_jumat')),
  sesi TEXT NOT NULL CHECK (sesi IN ('pagi', 'sore', 'jumat_pagi')),
  area_id UUID REFERENCES public.kebersihan_area(id) ON DELETE CASCADE,
  area_nama TEXT NOT NULL,
  santri_id UUID REFERENCES public.santri(id) ON DELETE SET NULL,
  santri_nama TEXT,
  kamar TEXT,
  status TEXT NOT NULL DEFAULT 'tidak_terlaksana' CHECK (status IN ('terlaksana', 'tidak_terlaksana')),
  catatan TEXT DEFAULT '',
  dicatat_oleh TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kebersihan_jadwal_tgl ON public.kebersihan_jadwal (tanggal, mode, sesi);
CREATE INDEX IF NOT EXISTS idx_kebersihan_jadwal_status ON public.kebersihan_jadwal (status);

INSERT INTO public.kebersihan_area (nama_area, deskripsi, urutan, aktif)
VALUES
  ('Musala & Tempat Wudhu', 'Lantai dalam musala, serambi, karpet, dan area wudhu', 1, true),
  ('Halaman Utama Pondok', 'Pelataran tengah, taman depan, dan jalur masuk utama', 2, true),
  ('Kamar Mandi & WC', 'Bak mandi, lantai kamar mandi, dan saluran air', 3, true),
  ('Selasar Asrama', 'Teras kamar lantai 1 & 2 serta tempat sandal', 4, true),
  ('Area Dapur & Ruang Makan', 'Meja makan santri, wastafel, dan tempat sampah', 5, true)
ON CONFLICT (nama_area) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. MODUL BARU: KOPERASI PONDOK (/koperasi)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.koperasi_pengaturan (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  modal_receh_tetap BIGINT NOT NULL DEFAULT 200000,
  saldo_kas_koperasi BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.koperasi_pengaturan (id, modal_receh_tetap, saldo_kas_koperasi)
VALUES (1, 200000, 0)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.koperasi_kulaan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
  nama_toko TEXT NOT NULL,
  rincian TEXT NOT NULL,
  nominal BIGINT NOT NULL CHECK (nominal >= 0),
  sumber_dana TEXT NOT NULL CHECK (sumber_dana IN ('uang_laci', 'kas_koperasi')),
  dicatat_oleh TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_koperasi_kulaan_tgl ON public.koperasi_kulaan (tanggal);

CREATE TABLE IF NOT EXISTS public.koperasi_tutup_kas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tanggal DATE NOT NULL UNIQUE,
  uang_tunai_laci_bersih BIGINT NOT NULL DEFAULT 0 CHECK (uang_tunai_laci_bersih >= 0),
  omzet_non_tunai BIGINT NOT NULL DEFAULT 0 CHECK (omzet_non_tunai >= 0),
  total_kulaan_laci BIGINT NOT NULL DEFAULT 0 CHECK (total_kulaan_laci >= 0),
  omzet_total BIGINT NOT NULL DEFAULT 0 CHECK (omzet_total >= 0),
  surplus_kas BIGINT NOT NULL DEFAULT 0 CHECK (surplus_kas >= 0),
  catatan TEXT DEFAULT '',
  dicatat_oleh TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.koperasi_setoran_pondok (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
  nominal BIGINT NOT NULL CHECK (nominal > 0),
  metode TEXT NOT NULL CHECK (metode IN ('tunai', 'transfer')),
  keterangan TEXT DEFAULT '',
  keuangan_transaksi_id UUID,
  dicatat_oleh TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 6. PEMBARUAN MODUL DAPUR: KEUANGAN 2 PEMBUKUAN TERHUBUNG (/dapur)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dapur_buku_masak (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
  tipe TEXT NOT NULL CHECK (tipe IN ('jatah_harian', 'belanja_pagi', 'belanja_sore', 'subsidi_jualan_malam')),
  arah TEXT NOT NULL CHECK (arah IN ('masuk', 'keluar')),
  nominal BIGINT NOT NULL CHECK (nominal >= 0),
  uraian TEXT NOT NULL,
  penanggung_jawab TEXT DEFAULT '',
  catatan TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dapur_buku_masak_tgl ON public.dapur_buku_masak (tanggal);

CREATE TABLE IF NOT EXISTS public.dapur_jualan_malam (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
  tipe TEXT NOT NULL CHECK (tipe IN ('omzet_jualan', 'modal_belanja', 'subsidi_ke_masak')),
  arah TEXT NOT NULL CHECK (arah IN ('masuk', 'keluar')),
  nominal BIGINT NOT NULL CHECK (nominal >= 0),
  uraian TEXT NOT NULL,
  penanggung_jawab TEXT DEFAULT '',
  catatan TEXT DEFAULT '',
  linked_masak_id UUID REFERENCES public.dapur_buku_masak(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dapur_jualan_malam_tgl ON public.dapur_jualan_malam (tanggal);

-- ----------------------------------------------------------------------------
-- 7. TRIGGER KEAMANAN KOLOM SENSITIF & STATUS NON-AKTIF
-- ----------------------------------------------------------------------------

-- Pastikan pengurus non-pimpinan tidak dapat mengubah nominal_bisyaroh secara langsung
CREATE OR REPLACE FUNCTION public.guard_pengurus_sensitive_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_pimpinan_atau_bendahara() THEN
    IF TG_OP = 'UPDATE' AND NEW.nominal_bisyaroh IS DISTINCT FROM OLD.nominal_bisyaroh THEN
      RAISE EXCEPTION 'Akses ditolak: hanya Pimpinan Inti atau Bendahara yang berhak mengubah nominal bisyaroh.';
    END IF;
    IF TG_OP = 'INSERT' THEN
      NEW.nominal_bisyaroh := 0;
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
-- 8. KEBIJAKAN ROW-LEVEL SECURITY (RLS) UNTUK TRANSPARANSI & PRIVASI KETAT
-- ----------------------------------------------------------------------------

-- A. Kebersihan
ALTER TABLE public.kebersihan_area ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kebersihan_jadwal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kebersihan_area_select ON public.kebersihan_area;
CREATE POLICY kebersihan_area_select ON public.kebersihan_area
  FOR SELECT TO authenticated
  USING (public.is_active_pengurus());

DROP POLICY IF EXISTS kebersihan_area_write ON public.kebersihan_area;
CREATE POLICY kebersihan_area_write ON public.kebersihan_area
  FOR ALL TO authenticated
  USING (public.has_jabatan_keywords(ARRAY['kebersihan', 'pengasuh', 'kepala pondok', 'sekretaris']))
  WITH CHECK (public.has_jabatan_keywords(ARRAY['kebersihan', 'pengasuh', 'kepala pondok', 'sekretaris']));

DROP POLICY IF EXISTS kebersihan_jadwal_select ON public.kebersihan_jadwal;
CREATE POLICY kebersihan_jadwal_select ON public.kebersihan_jadwal
  FOR SELECT TO authenticated
  USING (public.is_active_pengurus());

DROP POLICY IF EXISTS kebersihan_jadwal_write ON public.kebersihan_jadwal;
CREATE POLICY kebersihan_jadwal_write ON public.kebersihan_jadwal
  FOR ALL TO authenticated
  USING (public.has_jabatan_keywords(ARRAY['kebersihan', 'pengasuh', 'kepala pondok', 'sekretaris']))
  WITH CHECK (public.has_jabatan_keywords(ARRAY['kebersihan', 'pengasuh', 'kepala pondok', 'sekretaris']));

-- B. Koperasi
ALTER TABLE public.koperasi_pengaturan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.koperasi_kulaan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.koperasi_tutup_kas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.koperasi_setoran_pondok ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS koperasi_pengaturan_select ON public.koperasi_pengaturan;
CREATE POLICY koperasi_pengaturan_select ON public.koperasi_pengaturan
  FOR SELECT TO authenticated
  USING (public.is_active_pengurus());

DROP POLICY IF EXISTS koperasi_pengaturan_write ON public.koperasi_pengaturan;
CREATE POLICY koperasi_pengaturan_write ON public.koperasi_pengaturan
  FOR ALL TO authenticated
  USING (public.has_jabatan_keywords(ARRAY['koprasi', 'koperasi', 'bendahara', 'pengasuh', 'kepala pondok']))
  WITH CHECK (public.has_jabatan_keywords(ARRAY['koprasi', 'koperasi', 'bendahara', 'pengasuh', 'kepala pondok']));

DROP POLICY IF EXISTS koperasi_kulaan_select ON public.koperasi_kulaan;
CREATE POLICY koperasi_kulaan_select ON public.koperasi_kulaan
  FOR SELECT TO authenticated
  USING (public.is_active_pengurus());

DROP POLICY IF EXISTS koperasi_kulaan_write ON public.koperasi_kulaan;
CREATE POLICY koperasi_kulaan_write ON public.koperasi_kulaan
  FOR ALL TO authenticated
  USING (public.has_jabatan_keywords(ARRAY['koprasi', 'koperasi', 'bendahara', 'pengasuh', 'kepala pondok']))
  WITH CHECK (public.has_jabatan_keywords(ARRAY['koprasi', 'koperasi', 'bendahara', 'pengasuh', 'kepala pondok']));

DROP POLICY IF EXISTS koperasi_tutup_kas_select ON public.koperasi_tutup_kas;
CREATE POLICY koperasi_tutup_kas_select ON public.koperasi_tutup_kas
  FOR SELECT TO authenticated
  USING (public.is_active_pengurus());

DROP POLICY IF EXISTS koperasi_tutup_kas_write ON public.koperasi_tutup_kas;
CREATE POLICY koperasi_tutup_kas_write ON public.koperasi_tutup_kas
  FOR ALL TO authenticated
  USING (public.has_jabatan_keywords(ARRAY['koprasi', 'koperasi', 'bendahara', 'pengasuh', 'kepala pondok']))
  WITH CHECK (public.has_jabatan_keywords(ARRAY['koprasi', 'koperasi', 'bendahara', 'pengasuh', 'kepala pondok']));

DROP POLICY IF EXISTS koperasi_setoran_select ON public.koperasi_setoran_pondok;
CREATE POLICY koperasi_setoran_select ON public.koperasi_setoran_pondok
  FOR SELECT TO authenticated
  USING (public.is_active_pengurus());

DROP POLICY IF EXISTS koperasi_setoran_write ON public.koperasi_setoran_pondok;
CREATE POLICY koperasi_setoran_write ON public.koperasi_setoran_pondok
  FOR ALL TO authenticated
  USING (public.has_jabatan_keywords(ARRAY['koprasi', 'koperasi', 'bendahara', 'pengasuh', 'kepala pondok']))
  WITH CHECK (public.has_jabatan_keywords(ARRAY['koprasi', 'koperasi', 'bendahara', 'pengasuh', 'kepala pondok']));

-- C. Dapur (Buku Masak & Kas Jualan Malam)
ALTER TABLE public.dapur_buku_masak ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dapur_jualan_malam ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dapur_buku_masak_select ON public.dapur_buku_masak;
CREATE POLICY dapur_buku_masak_select ON public.dapur_buku_masak
  FOR SELECT TO authenticated
  USING (public.is_active_pengurus());

DROP POLICY IF EXISTS dapur_buku_masak_write ON public.dapur_buku_masak;
CREATE POLICY dapur_buku_masak_write ON public.dapur_buku_masak
  FOR ALL TO authenticated
  USING (public.has_jabatan_keywords(ARRAY['dapur', 'bendahara', 'pengasuh', 'kepala pondok']))
  WITH CHECK (public.has_jabatan_keywords(ARRAY['dapur', 'bendahara', 'pengasuh', 'kepala pondok']));

DROP POLICY IF EXISTS dapur_jualan_malam_select ON public.dapur_jualan_malam;
CREATE POLICY dapur_jualan_malam_select ON public.dapur_jualan_malam
  FOR SELECT TO authenticated
  USING (public.is_active_pengurus());

DROP POLICY IF EXISTS dapur_jualan_malam_write ON public.dapur_jualan_malam;
CREATE POLICY dapur_jualan_malam_write ON public.dapur_jualan_malam
  FOR ALL TO authenticated
  USING (public.has_jabatan_keywords(ARRAY['dapur', 'bendahara', 'pengasuh', 'kepala pondok']))
  WITH CHECK (public.has_jabatan_keywords(ARRAY['dapur', 'bendahara', 'pengasuh', 'kepala pondok']));

-- D. Pengurus & Jabatan
ALTER TABLE public.pengurus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pengurus_jabatan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pengurus_select_active ON public.pengurus;
CREATE POLICY pengurus_select_active ON public.pengurus
  FOR SELECT TO authenticated
  USING (public.is_active_pengurus() OR auth_user_id = auth.uid());

DROP POLICY IF EXISTS pengurus_update_self_password_flag ON public.pengurus;
CREATE POLICY pengurus_update_self_password_flag ON public.pengurus
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid() AND lower(coalesce(status, 'aktif')) = 'aktif')
  WITH CHECK (auth_user_id = auth.uid());

DROP POLICY IF EXISTS pengurus_write_admin ON public.pengurus;
CREATE POLICY pengurus_write_admin ON public.pengurus
  FOR ALL TO authenticated
  USING (public.is_admin_atau_sekretaris())
  WITH CHECK (public.is_admin_atau_sekretaris());

DROP POLICY IF EXISTS pengurus_jabatan_select ON public.pengurus_jabatan;
CREATE POLICY pengurus_jabatan_select ON public.pengurus_jabatan
  FOR SELECT TO authenticated
  USING (public.is_active_pengurus());

DROP POLICY IF EXISTS pengurus_jabatan_write ON public.pengurus_jabatan;
CREATE POLICY pengurus_jabatan_write ON public.pengurus_jabatan
  FOR ALL TO authenticated
  USING (public.is_admin_atau_sekretaris())
  WITH CHECK (public.is_admin_atau_sekretaris());

-- E. Penguncian Ketat Transaksi Bisyaroh pada keuangan_transaksi
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
    OR (
      -- Koperasi & Perizinan diizinkan mencatat pemasukan otomatis ke Kas Pondok / Operasional
      public.has_jabatan_keywords(ARRAY['koprasi', 'koperasi', 'keamanan', 'perizinan', 'sekretaris', 'operator emis'])
      AND NOT (lower(coalesce(kategori, '')) LIKE '%bisyaroh%')
    )
  )
  WITH CHECK (
    public.is_pimpinan_atau_bendahara()
    OR (
      public.has_jabatan_keywords(ARRAY['koprasi', 'koperasi', 'keamanan', 'perizinan', 'sekretaris', 'operator emis'])
      AND NOT (lower(coalesce(kategori, '')) LIKE '%bisyaroh%')
    )
  );

-- F. Sarpras Laporan: Semua pengurus aktif dapat membuat laporan kerusakan cepat!
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sarpras_laporan') THEN
    EXECUTE 'ALTER TABLE public.sarpras_laporan ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS sarpras_laporan_select_all ON public.sarpras_laporan';
    EXECUTE 'CREATE POLICY sarpras_laporan_select_all ON public.sarpras_laporan FOR SELECT TO authenticated USING (public.is_active_pengurus())';
    EXECUTE 'DROP POLICY IF EXISTS sarpras_laporan_insert_all ON public.sarpras_laporan';
    EXECUTE 'CREATE POLICY sarpras_laporan_insert_all ON public.sarpras_laporan FOR INSERT TO authenticated WITH CHECK (public.is_active_pengurus())';
    EXECUTE 'DROP POLICY IF EXISTS sarpras_laporan_update_sarpras ON public.sarpras_laporan';
    EXECUTE 'CREATE POLICY sarpras_laporan_update_sarpras ON public.sarpras_laporan FOR UPDATE TO authenticated USING (public.has_jabatan_keywords(ARRAY[''sarpras'', ''pengasuh'', ''kepala pondok'']))';
    EXECUTE 'DROP POLICY IF EXISTS sarpras_laporan_delete_sarpras ON public.sarpras_laporan';
    EXECUTE 'CREATE POLICY sarpras_laporan_delete_sarpras ON public.sarpras_laporan FOR DELETE TO authenticated USING (public.has_jabatan_keywords(ARRAY[''sarpras'', ''pengasuh'', ''kepala pondok'']))';
  END IF;
END $$;
