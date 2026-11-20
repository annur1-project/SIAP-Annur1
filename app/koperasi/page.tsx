'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  Banknote,
  Calculator,
  CheckCircle2,
  Coins,
  Landmark,
  Plus,
  RefreshCw,
  Save,
  ShoppingBag,
  Store,
  Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { TransparencyBanner, useAuth } from '@/lib/auth';
import { getTahunAjaranForDate } from '@/lib/pengaturan';
import { insertKeuanganTransaksiResilient } from '@/lib/keuangan';
import { getWibTodayDateStr } from '@/lib/kebersihan';
import {
  computeTutupKasMetrics,
  formatRupiahKoperasi,
  type KoperasiKulaan,
  type KoperasiPengaturan,
  type KoperasiSetoranPondok,
  type KoperasiTutupKas,
  type MetodeSetoranPondok,
  type SumberDanaKulaan,
} from '@/lib/koperasi';

export default function KoperasiPage() {
  const { canEditModule, pengurus } = useAuth();
  const canEdit = canEditModule('koperasi');
  const isReadOnly = !canEdit;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [pengaturan, setPengaturan] = useState<KoperasiPengaturan>({
    id: 1,
    modal_receh_tetap: 200000,
    saldo_kas_koperasi: 0,
  });
  const [kulaanList, setKulaanList] = useState<KoperasiKulaan[]>([]);
  const [tutupKasList, setTutupKasList] = useState<KoperasiTutupKas[]>([]);
  const [setoranList, setSetoranList] = useState<KoperasiSetoranPondok[]>([]);

  // Modal Receh Laci Edit
  const [modalRecehInput, setModalRecehInput] = useState('200000');

  // Form Kulaan
  const [kulaanTanggal, setKulaanTanggal] = useState('');
  const [kulaanToko, setKulaanToko] = useState('');
  const [kulaanRincian, setKulaanRincian] = useState('');
  const [kulaanNominal, setKulaanNominal] = useState('');
  const [kulaanSumber, setKulaanSumber] = useState<SumberDanaKulaan>('uang_laci');

  // Form Tutup Kas Malam (1x/hari)
  const [tutupTanggal, setTutupTanggal] = useState('');
  const [tutupTunaiBersih, setTutupTunaiBersih] = useState('');
  const [tutupNonTunai, setTutupNonTunai] = useState('0');
  const [tutupCatatan, setTutupCatatan] = useState('');

  // Form Setor ke Kas Pondok
  const [setoranTanggal, setSetoranTanggal] = useState('');
  const [setoranNominal, setSetoranNominal] = useState('2000000');
  const [setoranMetode, setSetoranMetode] = useState<MetodeSetoranPondok>('tunai');
  const [setoranKeterangan, setSetoranKeterangan] = useState('Setoran Bulanan Koperasi Pondok');

  const showToast = useCallback((type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgRes, kulaanRes, tutupRes, setoranRes] = await Promise.all([
        supabase.from('koperasi_pengaturan').select('*').eq('id', 1).maybeSingle(),
        supabase.from('koperasi_kulaan').select('*').order('tanggal', { ascending: false }).limit(200),
        supabase.from('koperasi_tutup_kas').select('*').order('tanggal', { ascending: false }).limit(200),
        supabase.from('koperasi_setoran_pondok').select('*').order('tanggal', { ascending: false }).limit(200),
      ]);

      if (cfgRes.data) {
        const cfg = cfgRes.data as KoperasiPengaturan;
        setPengaturan(cfg);
        setModalRecehInput(String(cfg.modal_receh_tetap ?? 200000));
      }
      setKulaanList((kulaanRes.data || []) as KoperasiKulaan[]);
      setTutupKasList((tutupRes.data || []) as KoperasiTutupKas[]);
      setSetoranList((setoranRes.data || []) as KoperasiSetoranPondok[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      const today = getWibTodayDateStr();
      setKulaanTanggal((prev) => prev || today);
      setTutupTanggal((prev) => prev || today);
      setSetoranTanggal((prev) => prev || today);
      void fetchAll();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchAll]);

  // Hitung total kulaan pakai uang laci pada tanggal Tutup Kas terpilih
  const kulaanLaciOnTutupDate = useMemo(() => {
    return kulaanList
      .filter((k) => k.tanggal === tutupTanggal && k.sumber_dana === 'uang_laci')
      .reduce((sum, k) => sum + Number(k.nominal || 0), 0);
  }, [kulaanList, tutupTanggal]);

  const alreadyClosedOnDate = useMemo(() => {
    return tutupKasList.some((t) => t.tanggal === tutupTanggal);
  }, [tutupKasList, tutupTanggal]);

  const tutupKasPreview = useMemo(() => {
    return computeTutupKasMetrics({
      uangTunaiBersihLaci: Number(tutupTunaiBersih || 0),
      omzetNonTunai: Number(tutupNonTunai || 0),
      totalKulaanLaciHariIni: kulaanLaciOnTutupDate,
    });
  }, [kulaanLaciOnTutupDate, tutupNonTunai, tutupTunaiBersih]);

  // Saldo terhitung dari histori apabila pengaturan belum sinkron
  const computedSaldoKas = useMemo(() => {
    return Number(pengaturan.saldo_kas_koperasi || 0);
  }, [pengaturan.saldo_kas_koperasi]);

  const handleSaveModalReceh = async () => {
    if (!canEdit) return;
    const nom = Math.max(0, parseInt(modalRecehInput, 10) || 0);
    setSaving(true);
    try {
      const { error } = await supabase
        .from('koperasi_pengaturan')
        .upsert(
          {
            id: 1,
            modal_receh_tetap: nom,
            saldo_kas_koperasi: computedSaldoKas,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );
      if (error) throw error;
      setPengaturan((p) => ({ ...p, modal_receh_tetap: nom }));
      showToast('success', `Modal receh laci tetap diperbarui menjadi ${formatRupiahKoperasi(nom)}.`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal menyimpan modal receh.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddKulaan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const nominal = parseInt(kulaanNominal, 10) || 0;
    if (nominal <= 0 || !kulaanToko.trim() || !kulaanRincian.trim()) {
      showToast('error', 'Lengkapi toko, rincian belanja, dan nominal valid.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('koperasi_kulaan').insert({
        tanggal: kulaanTanggal,
        nama_toko: kulaanToko.trim(),
        rincian: kulaanRincian.trim(),
        nominal,
        sumber_dana: kulaanSumber,
        dicatat_oleh: pengurus?.nama_lengkap || '',
      });
      if (error) throw error;

      if (kulaanSumber === 'kas_koperasi') {
        const nextSaldo = computedSaldoKas - nominal;
        await supabase
          .from('koperasi_pengaturan')
          .upsert(
            {
              id: 1,
              modal_receh_tetap: pengaturan.modal_receh_tetap,
              saldo_kas_koperasi: nextSaldo,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
          );
      }

      setKulaanToko('');
      setKulaanRincian('');
      setKulaanNominal('');
      showToast('success', 'Catatan kulaan / belanja stok berhasil disimpan.');
      await fetchAll();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal menyimpan kulaan.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteKulaan = async (item: KoperasiKulaan) => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('koperasi_kulaan').delete().eq('id', item.id);
      if (error) throw error;
      if (item.sumber_dana === 'kas_koperasi') {
        await supabase
          .from('koperasi_pengaturan')
          .upsert(
            {
              id: 1,
              modal_receh_tetap: pengaturan.modal_receh_tetap,
              saldo_kas_koperasi: computedSaldoKas + Number(item.nominal || 0),
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
          );
      }
      await fetchAll();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal menghapus kulaan.');
    } finally {
      setSaving(false);
    }
  };

  const handleTutupKasMalam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    if (alreadyClosedOnDate) {
      showToast('error', `Tutup kas tanggal ${tutupTanggal} sudah dicatat (cukup 1x per hari).`);
      return;
    }

    const tunaiBersih = Math.max(0, parseInt(tutupTunaiBersih, 10) || 0);
    const nonTunai = Math.max(0, parseInt(tutupNonTunai, 10) || 0);
    const { omzetHariIni, surplusMasukKas } = computeTutupKasMetrics({
      uangTunaiBersihLaci: tunaiBersih,
      omzetNonTunai: nonTunai,
      totalKulaanLaciHariIni: kulaanLaciOnTutupDate,
    });

    setSaving(true);
    try {
      const { error } = await supabase.from('koperasi_tutup_kas').insert({
        tanggal: tutupTanggal,
        uang_tunai_laci_bersih: tunaiBersih,
        omzet_non_tunai: nonTunai,
        total_kulaan_laci: kulaanLaciOnTutupDate,
        omzet_total: omzetHariIni,
        surplus_kas: surplusMasukKas,
        catatan: tutupCatatan.trim(),
        dicatat_oleh: pengurus?.nama_lengkap || '',
      });
      if (error) throw error;

      const nextSaldo = computedSaldoKas + surplusMasukKas;
      await supabase
        .from('koperasi_pengaturan')
        .upsert(
          {
            id: 1,
            modal_receh_tetap: pengaturan.modal_receh_tetap,
            saldo_kas_koperasi: nextSaldo,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );

      setTutupTunaiBersih('');
      setTutupNonTunai('0');
      setTutupCatatan('');
      showToast(
        'success',
        `Tutup kas disimpan! Omzet ${formatRupiahKoperasi(omzetHariIni)}, surplus masuk kas ${formatRupiahKoperasi(surplusMasukKas)}.`
      );
      await fetchAll();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal menyimpan tutup kas.');
    } finally {
      setSaving(false);
    }
  };

  const handleSetorKeKasPondok = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const nominal = parseInt(setoranNominal, 10) || 0;
    if (nominal <= 0) {
      showToast('error', 'Nominal setoran harus lebih dari Rp 0.');
      return;
    }

    setSaving(true);
    try {
      const tahunAjaran = getTahunAjaranForDate(setoranTanggal);

      // 1. Otomatis catat pemasukan ke Dompet Kas (Lain-lain) pada Modul Keuangan Bendahara
      const { insertedIds, error: txErr } = await insertKeuanganTransaksiResilient([
        {
          tgl_transaksi: setoranTanggal,
          tahun_ajaran: tahunAjaran,
          dompet: 'kas_pondok',
          tipe: 'masuk',
          kategori: 'Setoran Koperasi Pondok',
          nominal,
          metode_pembayaran: setoranMetode,
          keterangan: `${setoranKeterangan.trim() || 'Setoran Bulanan Koperasi Pondok'} (Otomatis dari Modul Koperasi)`,
          petugas_nama: pengurus?.nama_lengkap || 'Sie Koperasi',
        },
      ]);
      if (txErr) throw txErr;

      const txId = insertedIds[0] || null;

      // 2. Catat riwayat setoran koperasi
      const { error: setErr } = await supabase.from('koperasi_setoran_pondok').insert({
        tanggal: setoranTanggal,
        nominal,
        metode: setoranMetode,
        keterangan: setoranKeterangan.trim(),
        keuangan_transaksi_id: txId,
        dicatat_oleh: pengurus?.nama_lengkap || '',
      });
      if (setErr) throw setErr;

      // 3. Potong Saldo Kas Koperasi
      const nextSaldo = computedSaldoKas - nominal;
      await supabase
        .from('koperasi_pengaturan')
        .upsert(
          {
            id: 1,
            modal_receh_tetap: pengaturan.modal_receh_tetap,
            saldo_kas_koperasi: nextSaldo,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );

      showToast(
        'success',
        `Setoran ${formatRupiahKoperasi(nominal)} berhasil dicatat & masuk otomatis ke Dompet Kas (Lain-lain) Bendahara!`
      );
      await fetchAll();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal mencatat setoran.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <TransparencyBanner moduleLabel="Koperasi Pondok" isReadOnly={isReadOnly} />

      {toast && (
        <div
          className={`fixed bottom-20 md:bottom-6 right-4 z-50 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg border ${
            toast.type === 'success'
              ? 'bg-emerald-900 text-white border-emerald-700'
              : 'bg-rose-800 text-white border-rose-700'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Store className="w-6 h-6 text-[#065f46]" />
            Koperasi Pondok Pesantren
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Modal receh laci tetap, pencatatan kulaan stok, tutup kas malam otomatis 1x/hari, dan setoran terhubung ke Kas Pondok.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void fetchAll()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 min-h-[42px]"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Muat Ulang
        </button>
      </div>

      {/* Ringkasan Keuangan Koperasi */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-[#065f46] text-white p-5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-100">Saldo Kas Utama Koperasi</span>
            <Landmark className="w-5 h-5 text-emerald-200" />
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums">
            {formatRupiahKoperasi(computedSaldoKas)}
          </p>
          <p className="text-xs text-emerald-100/80">
            Bertambah dari surplus Tutup Kas Malam; berkurang oleh kulaan kas &amp; setoran pondok.
          </p>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Modal Receh Laci (Tetap)</span>
            <Coins className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              disabled={isReadOnly}
              value={modalRecehInput}
              onChange={(e) => setModalRecehInput(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono font-bold tabular-nums text-slate-900 disabled:bg-slate-50"
            />
            {canEdit && (
              <button
                type="button"
                onClick={() => void handleSaveModalReceh()}
                disabled={saving}
                className="inline-flex items-center gap-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-3 py-2 text-xs font-semibold shrink-0 min-h-[40px]"
              >
                <Save className="w-3.5 h-3.5" />
                Simpan
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Selalu mengendap di laci kasir sebagai kembalian (tidak masuk hitungan omzet).
          </p>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Kulaan Pakai Uang Laci ({tutupTanggal})
            </span>
            <ShoppingBag className="w-5 h-5 text-sky-700" />
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">
            {formatRupiahKoperasi(kulaanLaciOnTutupDate)}
          </p>
          <p className="text-xs text-slate-500">
            Otomatis ditambahkan ke perhitungan Omzet Hari Ini saat Tutup Kas Malam.
          </p>
        </div>
      </div>

      {/* Grid Aksi Utama: Kulaan, Tutup Kas Malam, Setor ke Kas Pondok */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* 1. Pencatatan Kulaan / Belanja Stok */}
        <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-[#065f46]" />
            Catat Kulaan / Belanja Stok
          </h2>

          <form onSubmit={handleAddKulaan} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal</label>
              <input
                type="date"
                required
                disabled={isReadOnly}
                value={kulaanTanggal}
                onChange={(e) => setKulaanTanggal(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm min-h-[42px]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Toko / Supplier
              </label>
              <input
                type="text"
                required
                disabled={isReadOnly}
                value={kulaanToko}
                onChange={(e) => setKulaanToko(e.target.value)}
                placeholder="Contoh: Toko Grosir Jaya"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm min-h-[42px]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Rincian Belanja
              </label>
              <input
                type="text"
                required
                disabled={isReadOnly}
                value={kulaanRincian}
                onChange={(e) => setKulaanRincian(e.target.value)}
                placeholder="Mie instan 2 dus, air mineral, buku tulis"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm min-h-[42px]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nominal (Rp)</label>
              <input
                type="number"
                required
                min={1}
                disabled={isReadOnly}
                value={kulaanNominal}
                onChange={(e) => setKulaanNominal(e.target.value)}
                placeholder="150000"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums min-h-[42px]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Sumber Dana</label>
              <div className="grid grid-cols-1 gap-2">
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-2.5 text-xs font-medium cursor-pointer">
                  <input
                    type="radio"
                    name="sumber_kulaan"
                    disabled={isReadOnly}
                    checked={kulaanSumber === 'uang_laci'}
                    onChange={() => setKulaanSumber('uang_laci')}
                  />
                  <span>
                    <strong>Uang Laci Harian</strong> (langsung dari hasil penjualan berjalan)
                  </span>
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-2.5 text-xs font-medium cursor-pointer">
                  <input
                    type="radio"
                    name="sumber_kulaan"
                    disabled={isReadOnly}
                    checked={kulaanSumber === 'kas_koperasi'}
                    onChange={() => setKulaanSumber('kas_koperasi')}
                  />
                  <span>
                    <strong>Saldo Kas Koperasi</strong> (potong tabungan/kas utama koperasi)
                  </span>
                </label>
              </div>
            </div>

            {canEdit && (
              <button
                type="submit"
                disabled={saving}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#065f46] hover:bg-emerald-900 text-white py-2.5 text-sm font-semibold min-h-[44px] disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                Simpan Kulaan Stok
              </button>
            )}
          </form>
        </section>

        {/* 2. Tutup Kas Malam (1x Input per Hari) */}
        <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-[#065f46]" />
            Tutup Kas Malam (1× / Hari)
          </h2>

          <form onSubmit={handleTutupKasMalam} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal Tutup Kas</label>
              <input
                type="date"
                required
                disabled={isReadOnly}
                value={tutupTanggal}
                onChange={(e) => setTutupTanggal(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm min-h-[42px]"
              />
            </div>

            {alreadyClosedOnDate && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>Tutup kas untuk tanggal {tutupTanggal} sudah selesai dicatat.</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Uang Tunai Bersih di Laci (di luar Modal Receh {formatRupiahKoperasi(pengaturan.modal_receh_tetap)})
              </label>
              <input
                type="number"
                required
                min={0}
                disabled={isReadOnly || alreadyClosedOnDate}
                value={tutupTunaiBersih}
                onChange={(e) => setTutupTunaiBersih(e.target.value)}
                placeholder="Contoh: 450000"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums min-h-[42px]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Omzet Non-Tunai / QRIS / Transfer (Rp)
              </label>
              <input
                type="number"
                min={0}
                disabled={isReadOnly || alreadyClosedOnDate}
                value={tutupNonTunai}
                onChange={(e) => setTutupNonTunai(e.target.value)}
                placeholder="0"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums min-h-[42px]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Catatan (Opsional)</label>
              <input
                type="text"
                disabled={isReadOnly || alreadyClosedOnDate}
                value={tutupCatatan}
                onChange={(e) => setTutupCatatan(e.target.value)}
                placeholder="Keterangan tutup kas malam"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm min-h-[42px]"
              />
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Kulaan Uang Laci Hari Ini</span>
                <span className="font-mono font-semibold tabular-nums">
                  {formatRupiahKoperasi(kulaanLaciOnTutupDate)}
                </span>
              </div>
              <div className="flex justify-between text-slate-900 font-bold border-t border-slate-200 pt-1.5">
                <span>Omzet Hari Ini (Otomatis)</span>
                <span className="font-mono tabular-nums text-[#065f46]">
                  {formatRupiahKoperasi(tutupKasPreview.omzetHariIni)}
                </span>
              </div>
              <div className="flex justify-between text-slate-900 font-bold">
                <span>Surplus Masuk Kas Koperasi</span>
                <span className="font-mono tabular-nums text-emerald-700">
                  +{formatRupiahKoperasi(tutupKasPreview.surplusMasukKas)}
                </span>
              </div>
            </div>

            {canEdit && (
              <button
                type="submit"
                disabled={saving || alreadyClosedOnDate}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white py-2.5 text-sm font-semibold min-h-[44px] disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                Simpan Tutup Kas Malam
              </button>
            )}
          </form>
        </section>

        {/* 3. Setoran Bulanan ke Kas Pondok */}
        <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-[#065f46]" />
            Setor ke Kas Pondok (Bendahara)
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Saat disimpan, nominal otomatis memotong Saldo Kas Koperasi dan langsung tercatat masuk ke <strong>Dompet Kas (Lain-lain)</strong> di Modul Keuangan Bendahara.
          </p>

          <form onSubmit={handleSetorKeKasPondok} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal Setor</label>
              <input
                type="date"
                required
                disabled={isReadOnly}
                value={setoranTanggal}
                onChange={(e) => setSetoranTanggal(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm min-h-[42px]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nominal Setoran (Fleksibel)
              </label>
              <input
                type="number"
                required
                min={1000}
                disabled={isReadOnly}
                value={setoranNominal}
                onChange={(e) => setSetoranNominal(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono font-bold tabular-nums min-h-[42px]"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {[1500000, 2000000, 2500000, 3000000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => setSetoranNominal(String(preset))}
                    className="rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 text-xs font-mono font-semibold text-slate-700 disabled:opacity-50"
                  >
                    {formatRupiahKoperasi(preset)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Metode Setor</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => setSetoranMetode('tunai')}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold min-h-[40px] ${
                    setoranMetode === 'tunai'
                      ? 'bg-[#065f46] text-white border-[#065f46]'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  Tunai
                </button>
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => setSetoranMetode('transfer')}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold min-h-[40px] ${
                    setoranMetode === 'transfer'
                      ? 'bg-[#065f46] text-white border-[#065f46]'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  Transfer
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Keterangan</label>
              <input
                type="text"
                disabled={isReadOnly}
                value={setoranKeterangan}
                onChange={(e) => setSetoranKeterangan(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm min-h-[42px]"
              />
            </div>

            {canEdit && (
              <button
                type="submit"
                disabled={saving}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white py-2.5 text-sm font-semibold min-h-[44px] disabled:opacity-50"
              >
                <Banknote className="w-4 h-4" />
                Setor ke Kas Pondok
              </button>
            )}
          </form>
        </section>
      </div>

      {/* Tabel Riwayat Kulaan, Tutup Kas & Setoran */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900">Riwayat Tutup Kas Malam</h3>
          {tutupKasList.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">Belum ada riwayat tutup kas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-2">Tanggal</th>
                    <th className="py-2 pr-2 text-right">Tunai Laci</th>
                    <th className="py-2 pr-2 text-right">Kulaan Laci</th>
                    <th className="py-2 pr-2 text-right">Non-Tunai</th>
                    <th className="py-2 text-right">Omzet Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tutupKasList.map((t) => (
                    <tr key={t.id}>
                      <td className="py-2 pr-2 whitespace-nowrap font-medium">{t.tanggal}</td>
                      <td className="py-2 pr-2 text-right font-mono tabular-nums">
                        {formatRupiahKoperasi(t.uang_tunai_laci_bersih)}
                      </td>
                      <td className="py-2 pr-2 text-right font-mono tabular-nums">
                        {formatRupiahKoperasi(t.total_kulaan_laci)}
                      </td>
                      <td className="py-2 pr-2 text-right font-mono tabular-nums">
                        {formatRupiahKoperasi(t.omzet_non_tunai)}
                      </td>
                      <td className="py-2 text-right font-mono font-bold tabular-nums text-emerald-700">
                        {formatRupiahKoperasi(t.omzet_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900">Riwayat Kulaan &amp; Setoran Kas Pondok</h3>
          <div className="space-y-4">
            {kulaanList.slice(0, 8).map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">
                    {k.nama_toko} · {k.rincian}
                  </p>
                  <p className="text-slate-500">
                    {k.tanggal} · Sumber:{' '}
                    {k.sumber_dana === 'uang_laci' ? 'Uang Laci Harian' : 'Saldo Kas Koperasi'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono font-bold tabular-nums text-rose-700">
                    -{formatRupiahKoperasi(k.nominal)}
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteKulaan(k)}
                      className="p-1 text-slate-400 hover:text-rose-700"
                      title="Hapus kulaan"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {setoranList.length > 0 && (
              <div className="pt-2 border-t border-slate-200">
                <p className="text-xs font-bold text-slate-700 mb-2">Setoran ke Bendahara Pondok:</p>
                {setoranList.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-2 py-1.5 text-xs border-b border-slate-100"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{s.keterangan || 'Setoran Koperasi'}</p>
                      <p className="text-slate-500">
                        {s.tanggal} · Metode {s.metode.toUpperCase()}
                      </p>
                    </div>
                    <span className="font-mono font-bold tabular-nums text-amber-700">
                      {formatRupiahKoperasi(s.nominal)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
