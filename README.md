# Dokumentasi Teknis Proyek: SIAP An-Nur 1

| Atribut | Keterangan | 
| ----- | ----- | 
| **Nama Aplikasi** | **SIAP An-Nur 1** (Sistem Informasi Administrasi & Keuangan Pondok Pesantren) | 
| **Lembaga** | Pondok Pesantren An-Nur 1 Bululawang, Malang, Jawa Timur | 
| **Repositori GitHub** | `annur1-project/SIAP-Annur1` | 
| **Target Pengguna** | Internal Pengurus Pesantren (Berbasis Akun Divisi / *Shared Division Accounts*) | 
| **Model Biaya** | **100% Gratis (Rp 0)** — Memanfaatkan *Free Tier* Vercel & Supabase | 

## 1. Tujuan & Fitur Utama Aplikasi

### A. Tujuan Pengembangan

**SIAP An-Nur 1** dirancang untuk mendigitalisasi dan mengintegrasikan seluruh pencatatan administrasi, kepengasuhan, operasional harian, serta sistem keuangan Pondok Pesantren An-Nur 1 Bululawang dalam satu platform terpusat. Aplikasi ini bertujuan mempermudah koordinasi antar-divisi pengurus, menjaga keakuratan riwayat data santri secara permanen, serta menghasilkan laporan resmi berbentuk **PDF** dan **Excel (`.xlsx`)** yang rapi dan siap cetak.

### B. Prinsip Arsitektur & Pengalaman Pengguna

1. **Sistem Login Berbasis Akun Divisi (*Shared Division Accounts*):**
   Menggunakan 6 akun umum per divisi (`super.admin`, `divisi.keuangan`, `divisi.pengasuhan`, `divisi.kesehatan`, `divisi.dapur`, dan `divisi.sarpras`) sehingga pergantian kepengurusan setiap tahun ajaran tidak memerlukan pembuatan ulang akun perorangan.

2. **Adaptive Hybrid UI/UX (Desktop & Mobile PWA):**

   * **Mode Laptop / PC:** Antarmuka manajemen lengkap dengan *Left Sidebar Navigation*, kartu metrik ringkasan, dan tabel data luas (terinspirasi dari tata letak *e-Pesantren*).

   * **Mode HP / Tablet:** Antarmuka ringkas berbasis *grid* ikon dan *Bottom Navigation Bar* agar nyaman dioperasikan dengan satu tangan oleh pengurus di lapangan, serta dapat di-install layaknya aplikasi bawaan (*Progressive Web App*).

### C. Fitur Utama Lintas Modul

* **Beranda (Executive Dashboard):** Ringkasan statistik *real-time* (santri aktif, santri pulang, santri sakit, pelanggaran mingguan) dan notifikasi peringatan dini.

* **Master Data Santri (Standar EMIS Kemenag):** Manajemen 39 kolom biodata EMIS, *auto-generate* NIS permanen (`YY0001`), pencatatan status santri (`aktif`, `ndalem`, `beasiswa_lazis`, `boyong`, `pindah_al_burhany`, `alumni`), pas foto 3x4, pencarian wilayah Indonesia otomatis hingga kode pos, cetak **Buku Induk Santri A4**, serta impor/ekspor massal Excel.

* **Master Data Pengurus & Struktur:** Pendataan pengurus dengan dukungan **jabatan rangkap** (*1 orang = 1 profil master*), pengurutan hirarki otomatis, kontrol privasi nominal bisyaroh, serta cetak bagan struktur organisasi A4 hemat kertas.

* **Keuangan Multi-Dompet & Penagihan:** Pengelolaan 4 pos kas terpisah (**Dompet Pendaftaran**, **Dompet Syahriyah & Iuran Tahunan/Operasional**, **Dompet Kas Lain-lain**, dan **Dompet MDA**), matriks pembayaran 12 bulan (Juli–Juni) + 6 item tahunan, cetak kuitansi ukuran **21 × 10 cm** (3 slot dalam 1 lembar A4), penagihan tunggakan otomatis 2 jalur (Chat WA untuk 1–2 bulan, Surat Fisik A4 untuk $\ge 3$ bulan), Buku Kas Umum, pencairan bisyaroh, serta mode migrasi saldo awal.

* **Pengaturan Aplikasi & Legalitas Digital:** Konfigurasi profil pesantren, unggah logo kop & watermark, stempel transparan (`.png`), tanda tangan digital 4 pimpinan inti (Pengasuh, Kepala Pondok, Sekretaris, Bendahara), dan pengaturan tarif pembayaran.

* **Kepengasuhan & Operasional Harian:** Rekap kegiatan Malam Jumat (rotasi 5 mingguan) & Hari Besar, absensi sholat jamaah (Subuh, Dzuhur, Ashar) metode *default hadir*, pencatatan 20 jenis pelanggaran & poin sanksi bertingkat, perizinan pulang (infaq Rp 5.000 non-menginap / Rp 10.000 menginap), kesehatan Poskestren (peringatan sakit $\ge 3$ hari), dapur (*real-time timer* masak & absensi shift), sarpras (menu lapor kerusakan universal dengan foto), kalender Masehi–Hijriyah dengan *countdown*, serta pusat ekspor laporan PDF/Excel terpisah.

## 2. Tech Stack & Library yang Digunakan

| Kategori | Teknologi / Library | Fungsi & Peran dalam Aplikasi | 
| ----- | ----- | ----- | 
| **Framework Utama** | **Next.js (App Router)** + **React** | Kerangka kerja *full-stack* web modern untuk *routing*, *rendering*, dan manajemen antarmuka. | 
| **Bahasa Pemrograman** | **TypeScript (`.ts` / `.tsx`)** | Menjamin keamanan tipe data (*type-safety*) pada struktur 39 kolom EMIS dan transaksi keuangan. | 
| **Styling & Responsivitas** | **Tailwind CSS** | Mengatur desain minimalis serta perubahan tata letak otomatis antara tampilan Desktop dan HP/Tablet. | 
| **Ikon Antarmuka** | **Lucide React (`lucide-react`)** | Menyediakan ikon vektor ringan untuk navigasi sidebar, tombol aksi, indikator status, dan menu mobile. | 
| **Database & Storage** | **Supabase (`@supabase/supabase-js`)** | Database PostgreSQL Cloud, autentikasi berbasis peran (*Auth & RLS*), serta *Storage Buckets* untuk foto santri 3x4, logo, TTD, dan stempel. | 
| **Dukungan PWA** | **`@ducanh2912/next-pwa`** | Mengubah aplikasi web menjadi *Progressive Web App* yang mendukung akses *offline* dan instalasi di perangkat pengurus. | 
| **Olah Data Excel** | **SheetJS (`xlsx`)** | Membaca file unggahan Excel (`.xlsx`) untuk impor massal santri & migrasi keuangan, serta menghasilkan unduhan laporan Excel. | 
| **Cetak Dokumen & PDF** | **Native CSS `@media print`** | Mengisolasi elemen cetak untuk menghasilkan dokumen presisi (Buku Induk A4, Bagan Pengurus A4, Surat Tagihan A4, dan Kuitansi 21×10 cm). | 
| **Hosting & CI/CD** | **Vercel** + **GitHub** | Penyimpanan kode sumber dan *deployment* otomatis berbasis HTTPS. | 

## 3. Struktur Folder & Fungsi Tiap File

Berikut adalah struktur direktori proyek `siap-annur1` beserta fungsi masing-masing file yang sudah dibangun maupun yang disiapkan untuk tahap lanjutan:

```
siap-annur1/
├── .env.local                      # Menyimpan kredensial rahasia NEXT_PUBLIC_SUPABASE_URL & ANON_KEY
├── public/
│   ├── manifest.json               # Konfigurasi identitas PWA (nama aplikasi, tema warna, mode standalone)
│   ├── icon-192.png                # Ikon aplikasi PWA ukuran 192x192 piksel
│   └── icon-512.png                # Ikon aplikasi PWA ukuran 512x512 piksel
├── lib/
│   └── supabase.ts                 # Inisialisasi koneksi klien Supabase ke database PostgreSQL & Storage
├── components/
│   └── Navbar.tsx                  # Komponen navigasi adaptif (Left Sidebar di Desktop, Bottom Bar di HP/Tab)
└── app/
    ├── globals.css                 # Konfigurasi dasar Tailwind CSS dan aturan gaya global
    ├── layout.tsx                  # Root layout aplikasi, metadata HTML, link manifest PWA, dan pembungkus <Navbar>
    ├── page.tsx                    # Halaman Beranda (Dashboard eksekutif & ringkasan metrik harian)
    ├── santri/
    │   └── page.tsx                # Modul Master Data Santri (EMIS 39 kolom, Auto-NIS, Foto 3x4, Buku Induk A4, Excel)
    ├── pengurus/
    │   └── page.tsx                # Modul Data Pengurus (Jabatan rangkap, hirarki otomatis, bagan A4 hemat kertas)
    ├── pengaturan/
    │   └── page.tsx                # Modul Pengaturan Aplikasi (Profil pondok, logo, stempel & TTD digital pimpinan)
    ├── keuangan/
    │   └── page.tsx                # Modul Keuangan (4 Dompet, Loket SPP & Tahunan, Kuitansi 21x10cm, Tagihan WA/A4, Kas)
    │
    │   # --- Direktori Modul Tahap Selanjutnya (Roadmap) ---
    ├── kegiatan/page.tsx           # (Rencana) Modul Kegiatan Malam Jumat (rotasi 5 mingguan) & Hari Besar
    ├── absen-jamaah/page.tsx       # (Rencana) Modul Rekap Absen Sholat Jamaah (Subuh, Dzuhur, Ashar)
    ├── keamanan/page.tsx           # (Rencana) Modul Keamanan, 20 Jenis Pelanggaran & Poin Sanksi Bertingkat
    ├── perizinan/page.tsx          # (Rencana) Modul Perizinan Pulang (Infaq 5k/10k) & Tracker Keterlambatan
    ├── kesehatan/page.tsx          # (Rencana) Modul Poskestren / Kesehatan Santri & Alert Sakit >= 3 Hari
    ├── dapur/page.tsx              # (Rencana) Modul Dapur (Absensi Shift Pagi/Sore & Real-time Timer Masak)
    ├── sarpras/page.tsx            # (Rencana) Modul Sarpras (Inventaris & Menu Lapor Kerusakan Universal)
    ├── laporan/page.tsx            # (Rencana) Modul Pusat Laporan (Ekspor PDF & Excel Keuangan vs Non-Keuangan)
    ├── kalender/page.tsx           # (Rencana) Modul Kalender Ganda Masehi-Hijriyah & Countdown Agenda
    └── login/page.tsx              # (Rencana) Halaman Autentikasi Akun Divisi Pengurus

```

## 4. Fitur yang Sudah Selesai Dibuat

Hingga tahap pengembangan saat ini, fondasi utama dan 4 modul inti telah berhasil dibangun dan diuji:

### 1. Fondasi Sistem, Database & Tata Letak Adaptif

* **Inisialisasi Proyek & Koneksi Cloud:** Proyek Next.js (App Router + TypeScript + Tailwind CSS) telah terhubung ke repositori `annur1-project/SIAP-Annur1` dan terintegrasi penuh dengan database PostgreSQL Supabase (`lib/supabase.ts`).

* **Skema Database & Storage:** Tipe data khusus (`ENUM`), tabel master (`santri`, `pengurus`, `pengaturan_aplikasi`, `wilayah_indonesia`, `keuangan_transaksi`, `syahriyah_rekap`, `master_pembayaran_riwayat`), serta *Storage Buckets* (`foto-santri` dan `ttd-stempel`) beserta kebijakan aksesnya (*Storage Policy*) telah aktif.

* **Database Wilayah Indonesia:** Sebanyak **82.575 data desa/kelurahan beserta kode pos** seluruh Indonesia telah diimpor ke tabel `wilayah_indonesia` dengan indeks pencarian cepat.

* **Navigasi Hybrid (`components/Navbar.tsx`):** Transisi otomatis antara *Sidebar* vertikal (mode layar laptop/desktop) dan *Bottom Navigation Bar* (mode layar HP/tablet).

### 2. Modul Data Santri (`app/santri/page.tsx`) — *Selesai*

* **Pendaftaran Satuan Cepat & Otomatisasi Keuangan:** Form pendaftaran ringkas dengan alokasi **Auto-NIS permanen** (`YY0001`), pemilihan kamar (termasuk `Al-Fachriyah 1 (VIP)` s/d `Al-Fachriyah 4 (VIP)`), serta skema biaya otomatis (100 pendaftar pertama diskon Rp 3.000.000, pendaftar ke-101 dst tarif normal, atau *Nominal Custom* keringanan) yang langsung membukukan transaksi ke **Dompet Pendaftaran**.

* **Manajemen 39 Kolom EMIS Kemenag:** Modal edit terstruktur dalam 4 tab dengan logika formulir dinamis (jika status Ayah/Ibu dipilih *Meninggal*, kolom isiannya otomatis dinonaktifkan). Dilengkapi **Progress Bar Kelengkapan Berkas EMIS** dan filter cepat santri yang datanya belum lengkap.

* **Auto-Complete Alamat Indonesia:** Pencarian kelurahan/kecamatan otomatis mengisi kabupaten, provinsi, dan kode pos.

* **Kontak Wali Ringkas & Aksi Massal:** Tampilan ganda nomor WA Ayah dan Ibu dengan ikon *Copy* dan *Chat WA* langsung, serta fitur seleksi massal (*bulk checkbox*) untuk mutasi status santri (`boyong`, `pindah_al_burhany`, `alumni`) tanpa menghapus riwayat piutang.

* **Pas Foto 3x4 & Cetak Buku Induk A4:** Unggah foto profil santri dan cetak dokumen resmi **Buku Induk Santri A4** lengkap dengan kop surat, bingkai foto 3x4, biodata 39 kolom, tanda tangan, dan stempel digital.

* **Impor & Ekspor Excel (`.xlsx`):** Unduh template kosong, impor santri massal dengan pembuatan NIS berurutan otomatis, serta ekspor seluruh database santri.

### 3. Modul Data Pengurus (`app/pengurus/page.tsx`) — *Selesai*

* **Sistem Jabatan Rangkap (*1 Orang = 1 Profil Master*):** Satu pengurus dapat memegang 1 jabatan utama dan beberapa jabatan rangkap sekaligus tanpa menggandakan jumlah personel di tabel utama.

* **Pengurutan Hirarki Otomatis & Pembeda Warna:** Susunan otomatis mulai dari **Pengasuh Pondok** (Emas), **Dewan Pengasuh / Dzurriyah** multi-personel (Indigo), **Direktur Pendidikan** (Biru), **Dewan Harian 1–6** (Emerald), **10 Divisi/Sie** (Teal), hingga **Musyrif Kamar** (Slate).

* **Privasi Bisyaroh & Bagan Struktur A4:** Tombol sembunyi/tampil nominal bisyaroh serta tab **Bagan Struktur Kepengurusan** visual yang dioptimalkan agar muat padat di kertas A4 saat dicetak PDF.

### 4. Modul Pengaturan Aplikasi (`app/pengaturan/page.tsx`) & Modul Keuangan (`app/keuangan/page.tsx`) — *Fungsionalitas Inti Terpasang*

* **Pengaturan Legalitas:** Pengelolaan profil pesantren, unggah logo kop, unggah stempel transparan (`.png`), serta unggah TTD digital Pengasuh, Kepala Pondok, Sekretaris, dan Bendahara.

* **Keuangan 4 Dompet & Loket Pembayaran:** Kartu saldo 4 pos kas, antarmuka *split-panel* terkunci 1 layar penuh dengan pengurutan kamar alami (*natural sorting*), matriks pembayaran Syahriyah 12 bulan (Juli–Juni) + 6 item tahunan (Ujian MDA Sm 1 & 2, Raport, Kalender, Haul, Kesehatan; bertanda opsional untuk Santri Ndalem) berbasis tarif historis.

* **Penagihan 2 Jalur, Kuitansi & Migrasi:** Deteksi tunggakan otomatis lewat tanggal 10 (tombol WA untuk tunggakan 1–2 bulan, cetak surat fisik A4 satuan/massal untuk $\ge 3$ bulan), pencetakan kuitansi ukuran **21 × 10 cm** (3 slot per lembar A4), Buku Kas Umum, pencairan kolektif Bisyaroh Pengurus, Mode Migrasi/Saldo Awal & KTL (satuan maupun Excel), serta fitur pembatalan transaksi (*void* dengan alasan audit).

## 5. Daftar Fitur Selanjutnya (Roadmap) yang Belum Dikerjakan

Pengembangan selanjutnya dibagi ke dalam 4 tahap berurutan:

### Tahap 1: Finalisasi Modul Keuangan & Pengaturan Aplikasi

1. **Penyempurnaan Akhir `app/keuangan/page.tsx` (6 Poin Revisi):**

   * Mengembalikan warna gradasi tegas pada 4 kartu dompet atas (Biru, Hijau Emerald, Kuning Amber, Ungu).

   * Mengganti ikon mata uang `$` menjadi ikon dokumen/printer (`Printer` dan `FileCheck2`).

   * Menyempurnakan isolasi CSS `@media print` agar cetak kuitansi 21×10 cm terkunci pas **1 halaman** tanpa halaman kosong tambahan.

   * Menghubungkan watermark tengah kuitansi agar otomatis membaca logo outline (`watermark_url || logo_url`).

   * Menyesuaikan ketebalan *footer bar* hijau pembayaran pada layar desktop (`py-3 md:py-5`).

   * Mengatur *dropdown* Tahun Ajaran agar selalu dimulai dari `2024/2025` dan bertambah otomatis setiap bulan Juli.

2. **Penyempurnaan `app/pengaturan/page.tsx`:**

   * Menambahkan kolom unggah **Logo 2 (Outline)** khusus untuk watermark kuitansi/surat serta pengisian slogan pesantren.

### Tahap 2: Modul Kepengasuhan, Ibadah & Kedisiplinan

1. **Modul Kegiatan & Acara (`/kegiatan`):**

   * Formulir dinamis untuk pencatatan kegiatan **Malam Jumat** (rotasi 5 mingguan: *Maulid Diba'i/Simtudduror*, *Manaqib Al-Burhany & Sholat Tasbih*, *Maulid Burdah*, dan *Muhadloroh* dengan rincian petugas MC, Qori', Khotib, Pidato, dll.).

   * Pencatatan agenda Hari Besar Islam dan rekap nilai kuantitatif **Dakwah Harian** (skala 0–100) untuk evaluasi akhir tahun.

2. **Modul Absen Sholat Jamaah (`/absen-jamaah`):**

   * Rekap presensi **Subuh, Dzuhur, dan Ashar** dengan metode *Default Hadir* (seluruh santri otomatis tercentang hadir; sekretaris cukup mengubah status santri yang Sakit, Izin, atau Alpha berdasarkan kertas rekap manual dari Imam).

3. **Modul Keamanan & Kedisiplinan (`/keamanan`):**

   * Integrasi **20 jenis pelanggaran resmi** sesuai *Pedoman Pengurus 2026–2027* lengkap dengan akumulasi poin otomatis, penerapan sanksi bertingkat, serta pencatatan kejadian tidak terduga di lingkungan pondok.

4. **Modul Perizinan Pulang (`/perizinan`):**

   * Pencatatan izin pulang dengan 2 kategori tarif otomatis ke kas: **Pulang Tidak Menginap** (infaq Rp 5.000) dan **Pulang Menginap** (infaq Rp 10.000).

   * Cetak surat izin pulang resmi dan notifikasi peringatan merah otomatis jika santri melewati batas tanggal kembali.

### Tahap 3: Modul Layanan Internal, Kalender & Pusat Laporan

1. **Modul Kesehatan / Poskestren (`/kesehatan`):**

   * Pencatatan keluhan sakit, diagnosa, tindakan medis, status perawatan (UKS / Rujuk / Pulang), peringatan otomatis jika santri sakit $\ge 3$ **hari** (rekomendasi penjemputan orang tua), serta tombol kirim WA ke wali santri.

2. **Modul Dapur & Rumah Tangga (`/dapur`):**

   * Absensi petugas dapur per shift (**Pagi** dan **Sore**) lengkap dengan analisis persentase keaktifan tiap anggota.

   * Fitur *Real-Time Cooking Timer* (tombol **Mulai Memasak** dan **Makanan Matang**) dengan indikator otomatis ketepatan waktu terhadap batas maksimal (**05:45 WIB** untuk Pagi dan **16:45 WIB** untuk Sore).

3. **Modul Sarpras & Inventaris (`/sarpras`):**

   * Pendataan inventaris aset pondok dan menu **Lapor Kerusakan** universal (dapat diakses semua akun pengurus dengan unggah foto kerusakan).

   * Notifikasi masuk ke divisi Sarpras, pembaruan status (*Dilaporkan* $\rightarrow$ *Proses* $\rightarrow$ *Selesai*), serta unggah foto bukti selesai perbaikan.

4. **Modul Kalender & Agenda (`/kalender`):**

   * Tampilan kalender ganda **Masehi dan Hijriyah** (standar NU/Kemenag), manajemen agenda pesantren, serta sistem *countdown* otomatis menjelang hari-H (`H-30`, `H-14`, `H-7`, `H-1`).

5. **Modul Pusat Laporan (`/laporan`):**

   * Ekspor laporan resmi terpisah dalam format **PDF** dan **Excel (`.xlsx`)**:

     * **File 1 (Laporan Keuangan):** Rekapitulasi 4 dompet, arus kas masuk/keluar, status Syahriyah & tunggakan per kamar, serta pengeluaran operasional.

     * **File 2 (Laporan Administrasi Non-Keuangan):** Grafik statistik santri, rekap absen jamaah, pelanggaran, perizinan, kesehatan, kinerja dapur, dan laporan kegiatan.

### Tahap 4: Pengamanan Produksi (*Security Hardening*) & Deployment

1. **Autentikasi & Pembatasan Hak Akses (RBAC):** Mengaktifkan **Supabase Auth** untuk 6 akun divisi dan membatasi akses halaman/tombol sensitif sesuai wewenang masing-masing divisi.

2. **Aktivasi Row-Level Security (RLS) & Private Storage:** Mengaktifkan kebijakan RLS pada seluruh tabel database PostgreSQL dan mengubah *bucket* penyimpanan (`foto-santri`, `ttd-stempel`) menjadi *Private* agar hanya dapat diakses oleh pengguna yang telah login.

3. **Proteksi Anti-Hapus & Anti-Indeks Mesin Pencari:** Menghilangkan aksi hapus permanen pada data induk santri (diganti pengarsipan status) serta menambahkan file `robots.txt` (`Disallow: /`) dan meta tag `noindex` agar URL aplikasi internal tidak muncul di Google.

4. **Deployment Produksi ke Vercel:** Publikasi aplikasi ke domain HTTPS Vercel (`https://siap-annur1.vercel.app`) dan pengaktifan Verifikasi 2 Langkah (2FA) pada seluruh akun infrastruktur (Email lembaga, GitHub, Supabase, dan Vercel).
