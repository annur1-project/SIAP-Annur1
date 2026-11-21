export const E_ANNURSATU_UPGRADE_SQL = `-- ============================================================================
-- e-annursatu (Pondok Pesantren An-Nur 1 Bululawang)
-- Skrip Migrasi Skema PostgreSQL, Fungsi Helper RBAC & Kebijakan RLS Ketat
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Penyesuaian Tabel Pengurus (1 Pengurus = 1 Akun Pribadi + Hak Akses Centang Modul)
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

UPDATE public.pengurus
SET role = 'super_admin'
WHERE lower(coalesce(username, '')) = 'admin.utama'
  AND lower(coalesce(role, '')) <> 'super_admin';

-- 2. Fungsi Helper Otorisasi Multi-Jabatan, Super Admin & Privasi
CREATE OR REPLACE FUNCTION public.current_pengurus_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id FROM public.pengurus p
  WHERE p.auth_user_id = auth.uid() AND lower(coalesce(p.status, 'aktif')) = 'aktif'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_active_pengurus()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_pengurus_id() IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pengurus p
    WHERE p.auth_user_id = auth.uid()
      AND lower(coalesce(p.status, 'aktif')) = 'aktif'
      AND (lower(coalesce(p.role, '')) = 'super_admin' OR lower(coalesce(p.username, '')) = 'admin.utama')
  );
$$;

CREATE OR REPLACE FUNCTION public.has_jabatan_keywords(keywords TEXT[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.pengurus_jabatan pj
    WHERE pj.pengurus_id = public.current_pengurus_id()
      AND EXISTS (
        SELECT 1 FROM unnest(keywords) kw
        WHERE lower(coalesce(pj.divisi, '')) LIKE '%' || lower(kw) || '%'
           OR lower(coalesce(pj.nama_jabatan, '')) LIKE '%' || lower(kw) || '%'
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.has_module_access(module_key TEXT, keywords TEXT[] DEFAULT ARRAY[]::TEXT[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.pengurus p
      WHERE p.id = public.current_pengurus_id()
        AND p.allowed_modules IS NOT NULL
        AND jsonb_typeof(p.allowed_modules) = 'array'
        AND p.allowed_modules ? module_key
    )
    OR (cardinality(keywords) > 0 AND public.has_jabatan_keywords(keywords));
$$;

CREATE OR REPLACE FUNCTION public.is_pimpinan_atau_bendahara()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin() OR public.has_module_access('bisyaroh', ARRAY['pengasuh','dzurriyah','direktur pendidikan','kepala pondok','bendahara']);
$$;

CREATE OR REPLACE FUNCTION public.is_admin_atau_sekretaris()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin() OR public.has_module_access('pengurus', ARRAY['pengasuh','dzurriyah','kepala pondok','sekretaris','operator emis']);
$$;

CREATE OR REPLACE FUNCTION public.is_sekretaris_emis_atau_pimpinan()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin() OR public.has_module_access('santri', ARRAY['pengasuh','dzurriyah','direktur pendidikan','kepala pondok','sekretaris','operator emis']);
$$;

CREATE OR REPLACE FUNCTION public.mask_identity_number(val TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE clean TEXT := trim(coalesce(val, ''));
BEGIN
  IF clean = '' THEN RETURN NULL; END IF;
  IF length(clean) <= 6 THEN RETURN repeat('•', length(clean)); END IF;
  RETURN left(clean, 4) || repeat('•', greatest(4, length(clean) - 8)) || right(clean, 4);
END;
$$;

-- 3. View & RPC Privasi Ketat (Bisyaroh & NIK/KK)
CREATE OR REPLACE VIEW public.v_pengurus_aman WITH (security_invoker = false) AS
SELECT p.id, p.nama_lengkap, p.no_wa, p.alamat, p.foto_url, p.ttd_url,
  CASE WHEN public.is_pimpinan_atau_bendahara() THEN p.nominal_bisyaroh ELSE NULL END AS nominal_bisyaroh,
  p.status, p.masa_khidmat, p.catatan, p.username, p.role, p.allowed_modules, p.auth_user_id, p.must_change_password, p.last_login_at, p.created_at
FROM public.pengurus p WHERE public.is_active_pengurus();

CREATE OR REPLACE FUNCTION public.get_pengurus_bisyaroh_map()
RETURNS TABLE (pengurus_id UUID, nominal_bisyaroh NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.nominal_bisyaroh FROM public.pengurus p WHERE public.is_pimpinan_atau_bendahara();
$$;

CREATE OR REPLACE VIEW public.v_santri_aman WITH (security_invoker = false) AS
SELECT s.id, s.nis, s.tgl_masuk, s.nama_lengkap, s.kamar, s.tarif_syahriyah, s.nisn,
  CASE WHEN public.is_sekretaris_emis_atau_pimpinan() THEN s.nik ELSE public.mask_identity_number(s.nik) END AS nik,
  CASE WHEN public.is_sekretaris_emis_atau_pimpinan() THEN s.no_kk ELSE public.mask_identity_number(s.no_kk) END AS no_kk,
  s.tempat_lahir, s.tgl_lahir, s.jk, s.hobi, s.cita_cita,
  s.status_ayah, s.nama_ayah,
  CASE WHEN public.is_sekretaris_emis_atau_pimpinan() THEN s.nik_ayah ELSE public.mask_identity_number(s.nik_ayah) END AS nik_ayah,
  s.pendidikan_ayah, s.pekerjaan_ayah, s.penghasilan_ayah, s.no_wa_ayah,
  s.status_ibu, s.nama_ibu,
  CASE WHEN public.is_sekretaris_emis_atau_pimpinan() THEN s.nik_ibu ELSE public.mask_identity_number(s.nik_ibu) END AS nik_ibu,
  s.pendidikan_ibu, s.pekerjaan_ibu, s.penghasilan_ibu, s.no_wa_ibu,
  s.nama_wali,
  CASE WHEN public.is_sekretaris_emis_atau_pimpinan() THEN s.nik_wali ELSE public.mask_identity_number(s.nik_wali) END AS nik_wali,
  s.pendidikan_wali, s.pekerjaan_wali, s.no_wa_wali,
  s.alamat_jalan, s.rt, s.rw, s.desa, s.kecamatan, s.kabupaten, s.provinsi, s.kode_pos,
  s.status, s.foto_url, s.unit_asrama, s.paket_pendaftaran, s.nominal_pendaftaran, s.catatan_keringanan, s.created_at
FROM public.santri s WHERE public.is_active_pengurus();

GRANT SELECT ON public.v_pengurus_aman TO authenticated;
GRANT SELECT ON public.v_santri_aman TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pengurus_bisyaroh_map() TO authenticated;

-- 4. Penyesuaian Perizinan, Keuangan & Kebersihan
ALTER TABLE IF EXISTS public.izin_pulang ADD COLUMN IF NOT EXISTS petugas_nama TEXT DEFAULT '';
ALTER TABLE IF EXISTS public.keuangan_transaksi ADD COLUMN IF NOT EXISTS lampiran_url TEXT DEFAULT '';
ALTER TABLE IF EXISTS public.pembayaran_santri_detail ADD COLUMN IF NOT EXISTS petugas_nama TEXT DEFAULT '';

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

-- 5. Modul Koperasi
CREATE TABLE IF NOT EXISTS public.koperasi_pengaturan (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  modal_receh_tetap BIGINT NOT NULL DEFAULT 200000,
  saldo_kas_koperasi BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

-- 6. Modul Dapur 2 Buku Kas
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
`;
