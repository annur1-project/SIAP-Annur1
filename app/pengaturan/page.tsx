'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Settings, Save, Plus, Edit3, Lock, Calendar, Wallet,
  CheckCircle2, AlertCircle, X, History, Building2, ShieldCheck
} from 'lucide-react';

const NAMA_DOMPET: Record<string, string> = {
  pendaftaran: '1. Dompet Pendaftaran',
  operasional: '2. Syahriyah & Iuran Tahunan (Operasional)',
  kas_pondok: '3. Dompet Kas (Lain-lain)',
  mda: '4. Dompet MDA (Madin)'
};

export default function PengaturanPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [todayStr, setTodayStr] = useState('');
  const [userRole, setUserRole] = useState<string>('super_admin');
  const [canManageFinance, setCanManageFinance] = useState<boolean>(true);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const [formData, setFormData] = useState<any>({
    nama_pesantren: 'Pondok Pesantren An-Nur 1 Bululawang',
    alamat_lengkap: 'Jl. Diponegoro IV / 2-6 Bululawang, Kab. Malang, Jawa Timur',
    no_telepon: '085604551562',
    email_resmi: 'annur1bululawang@gmail.com',
    slogan: "Mencetak Generasi Qur'ani, Berakhlakul Karimah, dan Berwawasan Luas",
    logo_url: '',
    logo_watermark_url: '',
    stempel_url: '',
    nama_pengasuh: 'Dr. KH. A. Fahrur Rozi',
    ttd_pengasuh_url: '',
    nama_kepala_pondok: 'Ust. M. Fajar Wahyudi',
    ttd_kepala_pondok_url: '',
    nama_sekretaris: 'Ust. Moh. Sayid Ali',
    ttd_sekretaris_url: '',
    nama_bendahara: 'Ust. Ali Nur Ikasan',
    ttd_bendahara_url: '',
    jatuh_tempo_tanggal: 10,
    saldo_awal_pendaftaran: 0,
    saldo_awal_operasional: 0,
    saldo_awal_kas_pondok: 0,
    saldo_awal_mda: 0
  });

  // Master Pembayaran & Riwayat Tarif
  const [masterItems, setMasterItems] = useState<any[]>([]);
  const [riwayatMap, setRiwayatMap] = useState<Record<string, any[]>>({});

  // Modal Edit Nominal + Tanggal Berlaku
  const [editTarifItem, setEditTarifItem] = useState<any | null>(null);
  const [newNominal, setNewNominal] = useState<number>(0);
  const [berlakuMulai, setBerlakuMulai] = useState<string>('');
  const [catatanPerubahan, setCatatanPerubahan] = useState<string>('');

  // Modal Tambah Kategori Pembayaran Baru
  const [showModalBaru, setShowModalBaru] = useState(false);
  const [newItemForm, setNewItemForm] = useState({
    nama_item: '',
    tipe_periode: 'tahunan',
    dompet_tujuan: 'operasional',
    nominal_awal: 0,
    berlaku_mulai: '',
    wajib_ndalem: false
  });

  const checkRoleAccess = async () => {
    const { data: authData } = await supabase.auth.getUser();
    if (authData?.user) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .single();
      if (prof?.role) {
        setUserRole(prof.role);
        setCanManageFinance(['super_admin', 'admin', 'keuangan'].includes(prof.role));
      }
    }
  };

  const fetchAll = async () => {
    setLoading(true);
    const { data: setRow } = await supabase.from('pengaturan_aplikasi').select('*').eq('id', 1).single();
    if (setRow) setFormData((prev: any) => ({ ...prev, ...setRow }));

    const { data: items } = await supabase
      .from('master_pembayaran')
      .select('*')
      .order('urutan', { ascending: true });

    const { data: riwayat } = await supabase
      .from('master_pembayaran_riwayat')
      .select('*')
      .order('berlaku_mulai', { ascending: false });

    if (items) setMasterItems(items);
    if (riwayat) {
      const grouped: Record<string, any[]> = {};
      riwayat.forEach((r) => {
        if (!grouped[r.item_id]) grouped[r.item_id] = [];
        grouped[r.item_id].push(r);
      });
      setRiwayatMap(grouped);
    }
    setLoading(false);
  };

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setTodayStr(today);
    setBerlakuMulai(today);
    setNewItemForm((prev) => ({ ...prev, berlaku_mulai: today }));
    checkRoleAccess();
    fetchAll();
  }, []);

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>, fieldName: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop();
    const fileName = `${fieldName}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('ttd-stempel').upload(fileName, file, { upsert: true });
    if (error) {
      showToast('error', 'Gagal upload gambar: ' + error.message);
      return;
    }
    const { data } = supabase.storage.from('ttd-stempel').getPublicUrl(fileName);
    setFormData((prev: any) => ({ ...prev, [fieldName]: data.publicUrl }));
    showToast('success', 'Gambar berhasil diunggah. Klik Simpan Pengaturan untuk menerapkan.');
  };

  const handleSavePengaturan = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from('pengaturan_aplikasi').upsert({
      id: 1,
      ...formData,
      updated_at: new Date().toISOString()
    });
    setSaving(false);
    if (error) {
      showToast('error', 'Gagal menyimpan: ' + error.message);
    } else {
      showToast('success', 'Pengaturan Lembaga, Saldo Awal & TTD Digital tersimpan!');
    }
  };

  // Simpan Perubahan Nominal + Tanggal Mulai Berlaku
  const handleSaveEditTarif = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarifItem || !canManageFinance) return;

    setSaving(true);
    const { error } = await supabase.from('master_pembayaran_riwayat').insert([{
      item_id: editTarifItem.id,
      nominal: Number(newNominal),
      berlaku_mulai: berlakuMulai || todayStr,
      catatan: catatanPerubahan || `Penyesuaian tarif per ${berlakuMulai || todayStr}`
    }]);

    // Jika item adalah Syahriyah Reguler / VIP / Ndalem, sinkronkan juga kolom default di tabel santri
    if (!error && editTarifItem.kode.startsWith('syahriyah_')) {
      const targetKategori = editTarifItem.kategori_santri;
      if (targetKategori === 'vip') {
        await supabase.from('santri').update({ tarif_syahriyah: Number(newNominal) }).ilike('kamar', '%VIP%');
      } else if (targetKategori === 'ndalem') {
        await supabase.from('santri').update({ tarif_syahriyah: Number(newNominal) }).eq('kamar', 'NDALEM');
      } else if (targetKategori === 'reguler') {
        await supabase
          .from('santri')
          .update({ tarif_syahriyah: Number(newNominal) })
          .not('kamar', 'ilike', '%VIP%')
          .neq('kamar', 'NDALEM');
      }
    }

    setSaving(false);
    if (error) {
      showToast('error', 'Gagal menyimpan penyesuaian tarif: ' + error.message);
    } else {
      setEditTarifItem(null);
      setCatatanPerubahan('');
      showToast('success', `Tarif ${editTarifItem.nama_item} diperbarui mulai ${berlakuMulai}!`);
      fetchAll();
    }
  };

  // Tambah Kategori Pembayaran Baru
  const handleCreateItemBaru = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageFinance || !newItemForm.nama_item.trim()) return;

    setSaving(true);
    const slugKode = `custom_${newItemForm.nama_item
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')}_${Date.now().toString().slice(-4)}`;

    const { data: created, error } = await supabase
      .from('master_pembayaran')
      .insert([{
        kode: slugKode,
        nama_item: newItemForm.nama_item.trim(),
        tipe_periode: newItemForm.tipe_periode,
        kategori_santri: 'semua',
        dompet_tujuan: newItemForm.dompet_tujuan,
        wajib_ndalem: newItemForm.wajib_ndalem,
        aktif: true,
        urutan: masterItems.length + 1
      }])
      .select()
      .single();

    if (error || !created) {
      setSaving(false);
      showToast('error', 'Gagal menambah kategori: ' + (error?.message || 'Unknown error'));
      return;
    }

    await supabase.from('master_pembayaran_riwayat').insert([{
      item_id: created.id,
      nominal: Number(newItemForm.nominal_awal),
      berlaku_mulai: newItemForm.berlaku_mulai || todayStr,
      catatan: 'Kategori pembayaran baru'
    }]);

    setSaving(false);
    setShowModalBaru(false);
    setNewItemForm({
      nama_item: '',
      tipe_periode: 'tahunan',
      dompet_tujuan: 'operasional',
      nominal_awal: 0,
      berlaku_mulai: todayStr,
      wajib_ndalem: false
    });
    showToast('success', `Kategori "${created.nama_item}" berhasil ditambahkan ke matriks Keuangan!`);
    fetchAll();
  };

  const getTarifAktif = (itemId: string) => {
    const list = riwayatMap[itemId] || [];
    if (list.length === 0) return { nominal: 0, berlaku_mulai: '-' };
    const aktif = list.find((r) => r.berlaku_mulai <= todayStr) || list[0];
    return aktif;
  };

  if (loading) return <div className="p-8 text-center text-slate-500 text-xs">Memuat Pengaturan Aplikasi...</div>;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg text-xs font-bold flex items-center gap-2 border ${
          toast.type === 'success' ? 'bg-emerald-900 text-white border-emerald-700' : 'bg-rose-600 text-white border-rose-700'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}

      {/* HEADER */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Settings className="w-6 h-6 text-emerald-700" />
            Pengaturan Aplikasi &amp; Master Tarif Dinamis
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Atur komponen pembayaran santri, tanggal berlaku penyesuaian nominal, saldo awal dompet, dan legalitas TTD digital.
          </p>
        </div>
        <span className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full text-[11px] font-bold flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          Akses: {userRole.toUpperCase()}
        </span>
      </div>

      {/* ================================================================= */}
      {/* BAGIAN 1: MASTER TARIF & KATEGORI PEMBAYARAN (ADMIN & BENDAHARA)  */}
      {/* ================================================================= */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-700" />
              1. Master Tarif &amp; Komponen Pembayaran Santri
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Perubahan nominal berlaku mulai tanggal yang dikonfirmasi; bulan/tagihan sebelumnya tetap memakai tarif lama.
            </p>
          </div>

          {canManageFinance ? (
            <button
              type="button"
              onClick={() => setShowModalBaru(true)}
              className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              Tambah Pembayaran Baru
            </button>
          ) : (
            <span className="px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-[11px] font-bold flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              Hanya Admin Utama &amp; Bendahara
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase text-[10px]">
              <tr>
                <th className="p-3.5">Nama Pembayaran</th>
                <th className="p-3.5">Jenis</th>
                <th className="p-3.5">Dompet Tujuan</th>
                <th className="p-3.5">Santri Ndalem</th>
                <th className="p-3.5">Tarif Aktif &amp; Riwayat</th>
                <th className="p-3.5 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {masterItems.map((item) => {
                const tarifAktif = getTarifAktif(item.id);
                const riwayatList = riwayatMap[item.id] || [];
                return (
                  <tr key={item.id} className="hover:bg-slate-50/70">
                    <td className="p-3.5 font-bold text-slate-800">{item.nama_item}</td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                        item.tipe_periode === 'bulanan' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                      }`}>
                        {item.tipe_periode}
                      </span>
                    </td>
                    <td className="p-3.5 text-[11px] text-slate-600">{NAMA_DOMPET[item.dompet_tujuan] || item.dompet_tujuan}</td>
                    <td className="p-3.5">
                      {item.wajib_ndalem ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">Wajib</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">Opsional (Tidak Wajib)</span>
                      )}
                    </td>
                    <td className="p-3.5">
                      <div className="font-mono font-extrabold text-emerald-800 text-xs">
                        Rp {Number(tarifAktif.nominal).toLocaleString('id-ID')}
                      </div>
                      {riwayatList.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {riwayatList.slice(0, 2).map((r: any) => (
                            <div key={r.id} className="text-[10px] text-slate-400 flex items-center gap-1">
                              <History className="w-2.5 h-2.5" />
                              Rp {Number(r.nominal).toLocaleString('id-ID')} (mulai {r.berlaku_mulai})
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="p-3.5 text-center">
                      {canManageFinance ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEditTarifItem(item);
                            setNewNominal(Number(tarifAktif.nominal));
                            setBerlakuMulai(todayStr);
                            setCatatanPerubahan('');
                          }}
                          className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg font-bold text-[11px] inline-flex items-center gap-1 transition-colors"
                        >
                          <Edit3 className="w-3 h-3" /> Ubah Tarif
                        </button>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Terkunci</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ================================================================= */}
      {/* BAGIAN 2: SALDO AWAL TRANSISI 4 DOMPET & ATURAN JATUH TEMPO       */}
      {/* ================================================================= */}
      <form onSubmit={handleSavePengaturan} className="space-y-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-700" />
              2. Saldo Awal Transisi (4 Dompet) &amp; Jatuh Tempo Syahriyah
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Isi sisa saldo kas tunai/rekening riil saat mulai memakai aplikasi agar neraca 4 dompet langsung akurat.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Saldo Awal Dompet Pendaftaran</label>
              <input
                type="number"
                disabled={!canManageFinance}
                value={formData.saldo_awal_pendaftaran ?? 0}
                onChange={(e) => setFormData({ ...formData, saldo_awal_pendaftaran: Number(e.target.value) })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Saldo Awal Syahriyah &amp; Tahunan</label>
              <input
                type="number"
                disabled={!canManageFinance}
                value={formData.saldo_awal_operasional ?? 0}
                onChange={(e) => setFormData({ ...formData, saldo_awal_operasional: Number(e.target.value) })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Saldo Awal Dompet Kas (Lain-lain)</label>
              <input
                type="number"
                disabled={!canManageFinance}
                value={formData.saldo_awal_kas_pondok ?? 0}
                onChange={(e) => setFormData({ ...formData, saldo_awal_kas_pondok: Number(e.target.value) })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Saldo Awal Dompet MDA</label>
              <input
                type="number"
                disabled={!canManageFinance}
                value={formData.saldo_awal_mda ?? 0}
                onChange={(e) => setFormData({ ...formData, saldo_awal_mda: Number(e.target.value) })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
              />
            </div>
          </div>

          <div className="max-w-xs text-xs pt-1">
            <label className="font-semibold text-slate-700 block mb-1">Tanggal Jatuh Tempo Syahriyah Bulanan</label>
            <input
              type="number"
              min={1}
              max={28}
              disabled={!canManageFinance}
              value={formData.jatuh_tempo_tanggal ?? 10}
              onChange={(e) => setFormData({ ...formData, jatuh_tempo_tanggal: Number(e.target.value) })}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">Lewat tanggal ini, bulan berjalan otomatis dihitung menunggak.</span>
          </div>
        </div>

        {/* ================================================================= */}
        {/* BAGIAN 3: PROFIL LEMBAGA, LOGO, STEMPEL & TTD DIGITAL PEJABAT     */}
        {/* ================================================================= */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="font-bold text-sm text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-700" />
            3. Profil Pesantren, Logo &amp; Legalitas TTD Digital (Untuk Cetak Surat/Kuitansi)
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Nama Pesantren</label>
              <input
                type="text"
                value={formData.nama_pesantren || ''}
                onChange={(e) => setFormData({ ...formData, nama_pesantren: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">No. Telepon / WA Resmi</label>
              <input
                type="text"
                value={formData.no_telepon || ''}
                onChange={(e) => setFormData({ ...formData, no_telepon: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
              />
            </div>
            <div className="md:col-span-2">
              <label className="font-semibold text-slate-700 block mb-1">Alamat Lengkap</label>
              <input
                type="text"
                value={formData.alamat_lengkap || ''}
                onChange={(e) => setFormData({ ...formData, alamat_lengkap: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
            <div className="md:col-span-2">
              <label className="font-semibold text-slate-700 block mb-1">Slogan Pesantren</label>
              <input
                type="text"
                value={formData.slogan || ''}
                onChange={(e) => setFormData({ ...formData, slogan: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pt-2">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span className="font-bold text-slate-800 block">Logo 1: Kop Surat &amp; Dokumen (PNG)</span>
              {formData.logo_url && <img src={formData.logo_url} alt="Logo" referrerPolicy="no-referrer" className="h-14 object-contain" />}
              <input type="file" accept="image/*" onChange={(e) => handleUploadImage(e, 'logo_url')} className="w-full text-[11px]" />
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span className="font-bold text-slate-800 block">Logo 2: Outline / Watermark Kuitansi (PNG)</span>
              {formData.logo_watermark_url && <img src={formData.logo_watermark_url} alt="Logo Watermark" referrerPolicy="no-referrer" className="h-14 object-contain" />}
              <input type="file" accept="image/*" onChange={(e) => handleUploadImage(e, 'logo_watermark_url')} className="w-full text-[11px]" />
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span className="font-bold text-slate-800 block">Stempel Resmi Pondok (PNG Transparan)</span>
              {formData.stempel_url && <img src={formData.stempel_url} alt="Stempel" referrerPolicy="no-referrer" className="h-14 object-contain" />}
              <input type="file" accept="image/png" onChange={(e) => handleUploadImage(e, 'stempel_url')} className="w-full text-[11px]" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-1">

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <label className="font-bold text-slate-800 block">Pengasuh Pondok Pesantren</label>
              <input type="text" value={formData.nama_pengasuh || ''} onChange={(e) => setFormData({ ...formData, nama_pengasuh: e.target.value })} className="w-full p-2 bg-white border rounded-lg" />
              {formData.ttd_pengasuh_url && <img src={formData.ttd_pengasuh_url} alt="TTD Pengasuh" className="h-12 object-contain" />}
              <input type="file" accept="image/png" onChange={(e) => handleUploadImage(e, 'ttd_pengasuh_url')} className="w-full text-[11px]" />
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <label className="font-bold text-slate-800 block">Kepala Pondok</label>
              <input type="text" value={formData.nama_kepala_pondok || ''} onChange={(e) => setFormData({ ...formData, nama_kepala_pondok: e.target.value })} className="w-full p-2 bg-white border rounded-lg" />
              {formData.ttd_kepala_pondok_url && <img src={formData.ttd_kepala_pondok_url} alt="TTD Kepala" className="h-12 object-contain" />}
              <input type="file" accept="image/png" onChange={(e) => handleUploadImage(e, 'ttd_kepala_pondok_url')} className="w-full text-[11px]" />
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <label className="font-bold text-slate-800 block">Sekretaris Pondok</label>
              <input type="text" value={formData.nama_sekretaris || ''} onChange={(e) => setFormData({ ...formData, nama_sekretaris: e.target.value })} className="w-full p-2 bg-white border rounded-lg" />
              {formData.ttd_sekretaris_url && <img src={formData.ttd_sekretaris_url} alt="TTD Sekretaris" className="h-12 object-contain" />}
              <input type="file" accept="image/png" onChange={(e) => handleUploadImage(e, 'ttd_sekretaris_url')} className="w-full text-[11px]" />
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <label className="font-bold text-slate-800 block">Bendahara Pondok</label>
              <input type="text" value={formData.nama_bendahara || ''} onChange={(e) => setFormData({ ...formData, nama_bendahara: e.target.value })} className="w-full p-2 bg-white border rounded-lg" />
              {formData.ttd_bendahara_url && <img src={formData.ttd_bendahara_url} alt="TTD Bendahara" className="h-12 object-contain" />}
              <input type="file" accept="image/png" onChange={(e) => handleUploadImage(e, 'ttd_bendahara_url')} className="w-full text-[11px]" />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-sm text-xs transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Menyimpan...' : 'Simpan Seluruh Pengaturan Aplikasi'}
        </button>
      </form>

      {/* ================================================================= */}
      {/* MODAL EDIT NOMINAL + KONFIRMASI TANGGAL MULAI BERLAKU             */}
      {/* ================================================================= */}
      {editTarifItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-emerald-900 text-white px-6 py-4 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-sm">Penyesuaian Nominal Tarif</h3>
                <span className="text-[11px] text-emerald-200">{editTarifItem.nama_item}</span>
              </div>
              <button onClick={() => setEditTarifItem(null)} className="text-emerald-200 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditTarif} className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 leading-relaxed">
                <strong>Aturan Berlaku Surut Aman:</strong> Bulan/tagihan sebelum tanggal mulai berlaku akan tetap ditagih menggunakan tarif lama, sedangkan tagihan mulai tanggal tersebut ke depan otomatis memakai nominal baru.
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Nominal Baru (Rp) *</label>
                <input
                  type="number"
                  required
                  min={0}
                  value={newNominal}
                  onChange={(e) => setNewNominal(Number(e.target.value))}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold text-sm"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Berlaku Mulai Tanggal *</label>
                <input
                  type="date"
                  required
                  value={berlakuMulai}
                  onChange={(e) => setBerlakuMulai(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Catatan Penyesuaian (Opsional)</label>
                <input
                  type="text"
                  placeholder="Contoh: Penyesuaian hasil rapat pengurus bulan November"
                  value={catatanPerubahan}
                  onChange={(e) => setCatatanPerubahan(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditTarifItem(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl"
                >
                  {saving ? 'Menyimpan...' : 'Konfirmasi Perubahan Tarif'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL TAMBAH KATEGORI PEMBAYARAN BARU                             */}
      {/* ================================================================= */}
      {showModalBaru && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-emerald-900 text-white px-6 py-4 flex justify-between items-center">
              <h3 className="font-bold text-sm">Tambah Kategori Pembayaran Baru</h3>
              <button onClick={() => setShowModalBaru(false)} className="text-emerald-200 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateItemBaru} className="p-6 space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Nama Pembayaran *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Seragam Pondok / Kitab Madin"
                  value={newItemForm.nama_item}
                  onChange={(e) => setNewItemForm({ ...newItemForm, nama_item: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Jenis Periode *</label>
                  <select
                    value={newItemForm.tipe_periode}
                    onChange={(e) => setNewItemForm({ ...newItemForm, tipe_periode: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
                  >
                    <option value="tahunan">Tahunan (Per Tahun Ajaran)</option>
                    <option value="bulanan">Bulanan (12 Bulan)</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Masuk ke Dompet *</label>
                  <select
                    value={newItemForm.dompet_tujuan}
                    onChange={(e) => setNewItemForm({ ...newItemForm, dompet_tujuan: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
                  >
                    <option value="operasional">2. Syahriyah &amp; Tahunan</option>
                    <option value="mda">4. Dompet MDA</option>
                    <option value="kas_pondok">3. Dompet Kas</option>
                    <option value="pendaftaran">1. Dompet Pendaftaran</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Nominal (Rp) *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={newItemForm.nominal_awal}
                    onChange={(e) => setNewItemForm({ ...newItemForm, nominal_awal: Number(e.target.value) })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Berlaku Mulai *</label>
                  <input
                    type="date"
                    required
                    value={newItemForm.berlaku_mulai}
                    onChange={(e) => setNewItemForm({ ...newItemForm, berlaku_mulai: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={newItemForm.wajib_ndalem}
                  onChange={(e) => setNewItemForm({ ...newItemForm, wajib_ndalem: e.target.checked })}
                />
                <span className="font-semibold text-slate-700">Wajib dibayar juga oleh Santri Ndalem</span>
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModalBaru(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Kategori Baru'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}