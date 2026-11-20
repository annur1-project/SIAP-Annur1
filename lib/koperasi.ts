export type SumberDanaKulaan = 'uang_laci' | 'kas_koperasi';
export type MetodeSetoranPondok = 'tunai' | 'transfer';

export interface KoperasiPengaturan {
  id: number;
  modal_receh_tetap: number;
  saldo_kas_koperasi: number;
  updated_at?: string;
}

export interface KoperasiKulaan {
  id: string;
  tanggal: string;
  nama_toko: string;
  rincian: string;
  nominal: number;
  sumber_dana: SumberDanaKulaan;
  dicatat_oleh?: string;
  created_at?: string;
}

export interface KoperasiTutupKas {
  id: string;
  tanggal: string;
  uang_tunai_laci_bersih: number;
  omzet_non_tunai: number;
  total_kulaan_laci: number;
  omzet_total: number;
  surplus_kas: number;
  catatan?: string;
  dicatat_oleh?: string;
  created_at?: string;
}

export interface KoperasiSetoranPondok {
  id: string;
  tanggal: string;
  nominal: number;
  metode: MetodeSetoranPondok;
  keterangan?: string;
  keuangan_transaksi_id?: string | null;
  dicatat_oleh?: string;
  created_at?: string;
}

export function formatRupiahKoperasi(val: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(val || 0));
}

export function computeTutupKasMetrics(params: {
  uangTunaiBersihLaci: number;
  omzetNonTunai: number;
  totalKulaanLaciHariIni: number;
}) {
  const tunai = Math.max(0, Number(params.uangTunaiBersihLaci || 0));
  const nonTunai = Math.max(0, Number(params.omzetNonTunai || 0));
  const kulaanLaci = Math.max(0, Number(params.totalKulaanLaciHariIni || 0));

  const omzetHariIni = tunai + kulaanLaci + nonTunai;
  const surplusMasukKas = tunai + nonTunai;

  return {
    omzetHariIni,
    surplusMasukKas,
  };
}
