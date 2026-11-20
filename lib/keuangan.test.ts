import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeWalletAndTransferSummary,
  getMigrasiColNameForItem,
  NEW_MASTER_PEMBAYARAN_SEEDS,
  readMigrasiAnnualFlag,
  resolveCanonicalDompetForItem,
  type WalletTxLike,
} from './keuangan';

describe('Keuangan canonical wallet routing & Pemasukan Transfer separation', () => {
  it('routes every fee item to its exact designated wallet', () => {
    // Dompet Syahriyah (operasional)
    assert.equal(resolveCanonicalDompetForItem('syahriyah'), 'operasional');
    assert.equal(resolveCanonicalDompetForItem('syahriyah_reguler'), 'operasional');
    assert.equal(resolveCanonicalDompetForItem('kalender'), 'operasional');
    assert.equal(resolveCanonicalDompetForItem('kalender_pondok'), 'operasional');
    assert.equal(resolveCanonicalDompetForItem('haul'), 'operasional');
    assert.equal(resolveCanonicalDompetForItem('kesehatan'), 'operasional');
    assert.equal(resolveCanonicalDompetForItem('al_adzkar'), 'operasional');
    assert.equal(resolveCanonicalDompetForItem('almamater'), 'operasional');
    assert.equal(resolveCanonicalDompetForItem('kitab_madin'), 'operasional');

    // Dompet MDA: hanya Ujian MDA dan Raport saja
    assert.equal(resolveCanonicalDompetForItem('ujian_mda_1'), 'mda');
    assert.equal(resolveCanonicalDompetForItem('ujian_mda_2'), 'mda');
    assert.equal(resolveCanonicalDompetForItem('raport'), 'mda');
    assert.equal(resolveCanonicalDompetForItem('raport_mda'), 'mda');

    // Dompet Pendaftaran: Infaq Madin & rincian pendaftaran
    assert.equal(resolveCanonicalDompetForItem('infaq_madin'), 'pendaftaran');
    assert.equal(resolveCanonicalDompetForItem('psb_pendaftaran'), 'pendaftaran');
  });

  it('excludes transfer transactions from the 4 cash Dompet cards and aggregates them into Pemasukan Transfer', () => {
    const txs: WalletTxLike[] = [
      {
        id: '1',
        dompet: 'operasional',
        tipe: 'masuk',
        nominal: 450000,
        metode_pembayaran: 'tunai',
        tgl_transaksi: '2026-11-10',
      },
      {
        id: '2',
        dompet: 'operasional',
        tipe: 'masuk',
        nominal: 500000,
        metode_pembayaran: 'transfer',
        tgl_transaksi: '2026-11-11',
      },
      {
        id: '3',
        dompet: 'pendaftaran',
        tipe: 'masuk',
        nominal: 500000,
        metode_pembayaran: 'transfer',
        tgl_transaksi: '2026-11-12',
      },
      {
        id: '4',
        dompet: 'mda',
        tipe: 'masuk',
        nominal: 75000,
        metode_pembayaran: 'tunai',
        tgl_transaksi: '2026-11-12',
      },
      {
        id: '5',
        dompet: 'operasional',
        tipe: 'keluar',
        nominal: 150000,
        metode_pembayaran: 'tunai',
        tgl_transaksi: '2026-11-13',
      },
    ];

    const summary = computeWalletAndTransferSummary(
      txs,
      { pendaftaran: 100000, operasional: 200000, kas_pondok: 50000, mda: 25000 },
      '2026-11'
    );

    // 4 Dompet Tunai strictly reflect cash flows only
    assert.equal(summary.totals.operasional, 200000 + 450000 - 150000);
    assert.equal(summary.totals.pendaftaran, 100000); // transfer 500k did NOT enter cash Pendaftaran card
    assert.equal(summary.totals.kas_pondok, 50000);
    assert.equal(summary.totals.mda, 25000 + 75000);
    assert.equal(summary.grandTotalTunai, 500000 + 100000 + 50000 + 100000);

    // Monthly cash metrics
    assert.equal(summary.tunaiMasukBulanIni, 450000 + 75000);
    assert.equal(summary.tunaiKeluarBulanIni, 150000);

    // Pemasukan Transfer summary captures all incoming transfers separately
    assert.equal(summary.syahriyahTransfer.totalMasukAllTime, 1000000);
    assert.equal(summary.syahriyahTransfer.bulanIniMasuk, 1000000);
    assert.equal(summary.syahriyahTransfer.byDompetMasuk.operasional, 500000);
    assert.equal(summary.syahriyahTransfer.byDompetMasuk.pendaftaran, 500000);
  });

  it('includes the 4 new Master Pembayaran items and supports dynamic Excel migration flags', () => {
    const codes = NEW_MASTER_PEMBAYARAN_SEEDS.map((s) => s.kode);
    assert.deepEqual(codes, ['al_adzkar', 'almamater', 'kitab_madin', 'infaq_madin']);

    assert.equal(getMigrasiColNameForItem('al_adzkar', 'Al-Adzkar'), 'Al_Adzkar_YA_TIDAK');
    assert.equal(getMigrasiColNameForItem('infaq_madin', 'Infaq Madin'), 'Infaq_Madin_YA_TIDAK');

    assert.equal(
      readMigrasiAnnualFlag({ Al_Adzkar_YA_TIDAK: 'YA', Infaq_Madin_YA_TIDAK: 'TIDAK' }, 'al_adzkar', 'Al-Adzkar'),
      true
    );
    assert.equal(
      readMigrasiAnnualFlag({ Al_Adzkar_YA_TIDAK: 'YA', Infaq_Madin_YA_TIDAK: 'TIDAK' }, 'infaq_madin', 'Infaq Madin'),
      false
    );
  });
});
