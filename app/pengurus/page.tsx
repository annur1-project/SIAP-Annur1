"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  supabase,
  isSupabaseConfigured,
  normalizeUsername,
  setMockAccountPassword,
} from "@/lib/supabase";
import {
  useAuth,
  TransparencyBanner,
  MODULE_PERMISSION_GROUPS,
  derivePermissionsFromJabatan,
  normalizeAllowedModulesList,
} from "@/lib/auth";
import {
  getDynamicMasaKhidmatOptions,
  getDynamicTahunAjaranAktif,
  getDynamicTahunSekarang,
} from "@/lib/pengaturan";
import {
  Users,
  Plus,
  Search,
  Edit3,
  Trash2,
  Printer,
  Award,
  Layers,
  Wallet,
  Eye,
  EyeOff,
  Phone,
  X,
  Upload,
  CheckCircle2,
  Building2,
  UserCheck,
  FileSignature,
  Crown,
  ShieldCheck,
  GraduationCap,
  DoorOpen,
  RotateCcw,
  KeyRound,
  UserCog,
} from "lucide-react";

// ============================================================
// TIPE DATA & KONSTANTA STRUKTUR PONDOK
// ============================================================

interface JabatanItem {
  id?: string;
  divisi: string;
  nama_jabatan: string;
  is_utama: boolean;
  urutan_struktur: number;
  isCustomRole?: boolean;
}

interface PengurusItem {
  id: string;
  nama_lengkap: string;
  no_wa: string | null;
  alamat: string | null;
  foto_url: string | null;
  ttd_url: string | null;
  nominal_bisyaroh: number;
  status: "aktif" | "nonaktif" | "boyong";
  masa_khidmat: string;
  catatan: string | null;
  username: string | null;
  role: string | null;
  allowed_modules: string[] | null;
  auth_user_id: string | null;
  must_change_password: boolean;
  jabatan_list: JabatanItem[];
}

interface PengaturanPondok {
  nama_pesantren: string;
  alamat_lengkap: string;
  logo_url: string | null;
  nama_pengasuh: string;
  nama_kepala_pondok: string;
  nama_sekretaris: string;
  nama_bendahara: string;
}

const DEWAN_HARIAN_POSITIONS = [
  "Kepala Pondok",
  "Wakil Kepala Pondok",
  "Sekretaris",
  "Wakil Sekretaris",
  "Bendahara",
  "Wakil Bendahara",
] as const;

// Pasangan kolom 1-2, 3-4, 5-6 untuk Bagan Dewan Harian
const DEWAN_HARIAN_COLUMN_PAIRS = [
  { top: "Kepala Pondok", bottom: "Wakil Kepala Pondok" },
  { top: "Sekretaris", bottom: "Wakil Sekretaris" },
  { top: "Bendahara", bottom: "Wakil Bendahara" },
] as const;

const SEPULUH_DIVISI = [
  "Sie Kegiatan",
  "Sie Keamanan",
  "Sie Kesehatan",
  "Sie Kebersihan",
  "Sie Sarpras",
  "Sie Dapur",
  "Operator Emis",
  "Sie Koprasi",
  "Sie Laundry",
  "Guru Bantu",
] as const;

const DIVISI_ROLE_PRESETS = [
  "Koordinator",
  "Wakil Koordinator",
  "Anggota",
] as const;

const DIVISI_OPTIONS = [
  "Pengasuh Pondok",
  "Dewan Pengasuh (Dzurriyah)",
  "Direktur Pendidikan",
  "Dewan Harian",
  ...SEPULUH_DIVISI,
  "Musyrif Kamar",
] as const;

const DEFAULT_KAMAR_SANTRI = [
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
  "A6",
  "A7",
  "A8",
  "A9",
  "A10",
  "C1",
  "C2",
  "C3",
  "C4",
  "C5",
  "C6",
  "Tahfidz",
  "Al-Fachriyah 1 (VIP)",
  "Al-Fachriyah 2 (VIP)",
  "Al-Fachriyah 3 (VIP)",
  "Al-Fachriyah 4 (VIP)",
];

// Normalisasi nama divisi lama ke format baku
function normalizeDivisi(divisi: string): string {
  if (divisi === "Pimpinan & Harian") return "Dewan Harian";
  if (divisi === "Pengasuh") return "Pengasuh Pondok";
  return divisi;
}

// Ekstrak nama kamar murni dari "Musyrif Kamar A1" -> "A1"
function extractKamarName(namaJabatan: string): string {
  return namaJabatan.replace(/^Musyrif\s+Kamar\s+/i, "").trim();
}

// Cek apakah divisi termasuk dalam 10 Divisi/Sie
function isTenDivisi(divisi: string): boolean {
  return (SEPULUH_DIVISI as readonly string[]).includes(divisi);
}

// Jabatan puncak di atas Kepala Pondok tidak dihitung sebagai "Pengurus Aktif" operasional
function isExcludedTopDivisi(divisi: string): boolean {
  const norm = normalizeDivisi(divisi || "").trim().toLowerCase();
  return (
    norm === "pengasuh pondok" ||
    norm === "pengasuh" ||
    norm.startsWith("dewan pengasuh") ||
    norm.includes("dzurriyah") ||
    norm === "direktur pendidikan"
  );
}

function getOperasionalJabatanList(person: PengurusItem): JabatanItem[] {
  return (person.jabatan_list || []).filter((j) => {
    if (isExcludedTopDivisi(j.divisi)) return false;
    if (isExcludedTopDivisi(j.nama_jabatan)) return false;
    return true;
  });
}

function isPengurusAktifOperasional(person: PengurusItem): boolean {
  if (person.status !== "aktif") return false;
  return getOperasionalJabatanList(person).length > 0;
}

// Bersihkan nama posisi di dalam divisi (mengatasi data lama yang isinya sama dengan nama divisi)
function resolveCleanDivisiRole(jab: {
  divisi: string;
  nama_jabatan: string;
  urutan_struktur: number;
}): string {
  const raw = (jab.nama_jabatan || "").trim();
  const div = (jab.divisi || "").trim();

  if (!raw || raw.toLowerCase() === div.toLowerCase()) {
    if (jab.urutan_struktur === 1) return "Koordinator";
    if (jab.urutan_struktur === 2) return "Wakil Koordinator";
    return "Anggota";
  }

  const escapedDiv = div.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stripped = raw.replace(new RegExp(`\\s*${escapedDiv}$`, "i"), "").trim();
  return stripped || raw;
}

// Warna badge untuk label jabatan di Tabel Daftar Pengurus
function getHierarchyBadgeStyle(divisi: string): {
  badgeClass: string;
  dotClass: string;
} {
  const norm = normalizeDivisi(divisi);

  if (norm === "Pengasuh Pondok") {
    return {
      badgeClass: "bg-white/90 text-amber-900 border-amber-300 shadow-2xs",
      dotClass: "bg-amber-500",
    };
  }

  if (norm === "Dewan Pengasuh (Dzurriyah)") {
    return {
      badgeClass: "bg-white/90 text-indigo-900 border-indigo-300 shadow-2xs",
      dotClass: "bg-indigo-600",
    };
  }

  if (norm === "Direktur Pendidikan") {
    return {
      badgeClass: "bg-white/90 text-sky-900 border-sky-300 shadow-2xs",
      dotClass: "bg-sky-600",
    };
  }

  if (norm === "Dewan Harian") {
    return {
      badgeClass: "bg-white/90 text-emerald-900 border-emerald-300 shadow-2xs",
      dotClass: "bg-emerald-600",
    };
  }

  if (isTenDivisi(norm)) {
    return {
      badgeClass: "bg-white/90 text-teal-900 border-teal-300 shadow-2xs",
      dotClass: "bg-teal-600",
    };
  }

  return {
    badgeClass: "bg-white/90 text-slate-700 border-slate-300 shadow-2xs",
    dotClass: "bg-slate-500",
  };
}

// Format label jabatan pada Tabel Daftar Pengurus agar tidak dobel
function formatTableJabatanLabel(jab: JabatanItem): {
  primary: string;
  secondary?: string;
} {
  const div = normalizeDivisi(jab.divisi);

  if (div === "Musyrif Kamar") {
    const kamar = extractKamarName(jab.nama_jabatan);
    return {
      primary: kamar ? `Musyrif Kamar ${kamar}` : jab.nama_jabatan,
    };
  }

  if (isTenDivisi(div)) {
    const role = resolveCleanDivisiRole({
      divisi: div,
      nama_jabatan: jab.nama_jabatan,
      urutan_struktur: jab.urutan_struktur,
    });
    return {
      primary: `${role} ${div}`,
    };
  }

  if (div === "Dewan Harian") {
    return {
      primary: jab.nama_jabatan,
      secondary: "Dewan Harian",
    };
  }

  return {
    primary: jab.nama_jabatan,
    secondary: div.toLowerCase() !== jab.nama_jabatan.toLowerCase() ? div : undefined,
  };
}

// Hitung skor hirarki [tier, subOrder, itemOrder] untuk pengurutan tabel & jabatan
function getJabatanHierarchyTuple(
  jab: JabatanItem,
  kamarOptions: string[]
): [number, number, number] {
  const div = normalizeDivisi(jab.divisi);
  const itemOrder = Number(jab.urutan_struktur) || 10;

  if (div === "Pengasuh Pondok") {
    return [1, 0, itemOrder];
  }

  if (div === "Dewan Pengasuh (Dzurriyah)") {
    return [2, 0, itemOrder];
  }

  if (div === "Direktur Pendidikan") {
    return [3, 0, itemOrder];
  }

  if (div === "Dewan Harian") {
    const harianIdx = DEWAN_HARIAN_POSITIONS.findIndex(
      (pos) => pos.toLowerCase() === (jab.nama_jabatan || "").trim().toLowerCase()
    );
    return [4, harianIdx === -1 ? 99 : harianIdx, itemOrder];
  }

  if (isTenDivisi(div)) {
    const divIdx = (SEPULUH_DIVISI as readonly string[]).indexOf(div);
    return [5, divIdx === -1 ? 99 : divIdx, itemOrder];
  }

  if (div === "Musyrif Kamar") {
    const room = extractKamarName(jab.nama_jabatan);
    const roomIdx = kamarOptions.findIndex(
      (k) => k.toLowerCase() === room.toLowerCase()
    );
    return [6, roomIdx === -1 ? 999 : roomIdx, itemOrder];
  }

  return [7, 999, itemOrder];
}

function compareTuples(
  a: [number, number, number],
  b: [number, number, number]
): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] - b[2];
}

function getHighestPengurusTuple(
  person: PengurusItem,
  kamarOptions: string[]
): [number, number, number] {
  if (!person.jabatan_list || person.jabatan_list.length === 0) {
    return [8, 999, 999];
  }
  let best: [number, number, number] = [99, 999, 999];
  for (const jab of person.jabatan_list) {
    const current = getJabatanHierarchyTuple(jab, kamarOptions);
    if (compareTuples(current, best) < 0) {
      best = current;
    }
  }
  return best;
}

// Warna latar baris tipis + aksen border kiri pada Tabel Daftar Pengurus berdasarkan tingkatan hirarki
function getRowHierarchyStyle(
  person: PengurusItem,
  kamarOptions: string[]
): { rowBg: string; leftAccent: string } {
  const tier = getHighestPengurusTuple(person, kamarOptions)[0];

  switch (tier) {
    case 1: // Pengasuh Pondok
      return {
        rowBg: "bg-amber-50/75 hover:bg-amber-100/65",
        leftAccent: "border-l-4 border-l-amber-500",
      };
    case 2: // Dewan Pengasuh (Dzurriyah)
      return {
        rowBg: "bg-indigo-50/65 hover:bg-indigo-100/55",
        leftAccent: "border-l-4 border-l-indigo-500",
      };
    case 3: // Direktur Pendidikan
      return {
        rowBg: "bg-sky-50/65 hover:bg-sky-100/55",
        leftAccent: "border-l-4 border-l-sky-500",
      };
    case 4: // Dewan Harian
      return {
        rowBg: "bg-emerald-50/55 hover:bg-emerald-100/50",
        leftAccent: "border-l-4 border-l-emerald-600",
      };
    case 5: // 10 Divisi / Sie
      return {
        rowBg: "bg-teal-50/45 hover:bg-teal-100/45",
        leftAccent: "border-l-4 border-l-teal-500",
      };
    case 6: // Musyrif Kamar
      return {
        rowBg: "bg-slate-100/65 hover:bg-slate-200/50",
        leftAccent: "border-l-4 border-l-slate-400",
      };
    default:
      return {
        rowBg: "bg-white hover:bg-slate-50/80",
        leftAccent: "border-l-4 border-l-transparent",
      };
  }
}

export default function DataPengurusPage() {
  const {
    canEditModule,
    canViewBisyaroh,
    canManageAccounts,
    isSuperAdmin,
    refreshAuth,
    pengurus: currentPengurus,
  } = useAuth();
  const canEditPengurus = canEditModule("pengurus");

  // State Data Utama
  const [pengurusList, setPengurusList] = useState<PengurusItem[]>([]);
  const [kamarOptions, setKamarOptions] = useState<string[]>(DEFAULT_KAMAR_SANTRI);
  const [pengaturan, setPengaturan] = useState<PengaturanPondok>({
    nama_pesantren: "PONDOK PESANTREN AN-NUR 1 BULULAWANG",
    alamat_lengkap: "Jl. Diponegoro IV / 2-6 Bululawang, Malang, Jawa Timur",
    logo_url: null,
    nama_pengasuh: "Dr. KH. A. Fahrur Rozi",
    nama_kepala_pondok: "Ust. M. Fajar Wahyudi",
    nama_sekretaris: "Ust. Moh. Sayid Ali",
    nama_bendahara: "Ust. Ali Nur Ikasan",
  });

  // State UI & Filter
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"daftar" | "bagan">("daftar");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDivisi, setFilterDivisi] = useState("semua");
  const [filterStatus, setFilterStatus] = useState("aktif");
  const [masaKhidmatOptions, setMasaKhidmatOptions] = useState<string[]>([]);
  const [masaKhidmat, setMasaKhidmat] = useState("");
  const [showBisyaroh, setShowBisyaroh] = useState(false);

  // State Modal Tambah / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // State Modal Manajemen Akun Login Pengurus (Terpusat)
  const [accountTarget, setAccountTarget] = useState<PengurusItem | null>(null);
  const [accountUsername, setAccountUsername] = useState("");
  const [accountTempPassword, setAccountTempPassword] = useState("");
  const [accountModules, setAccountModules] = useState<Set<string>>(new Set());
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountFeedback, setAccountFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [dynamicYearHint, setDynamicYearHint] = useState("annur1234");

  // State Form Pengurus
  const [namaLengkap, setNamaLengkap] = useState("");
  const [noWa, setNoWa] = useState("");
  const [nominalBisyaroh, setNominalBisyaroh] = useState<string>("0");
  const [statusPengurus, setStatusPengurus] = useState<"aktif" | "nonaktif" | "boyong">("aktif");
  const [formMasaKhidmat, setFormMasaKhidmat] = useState("");
  const [alamatAsal, setAlamatAsal] = useState("");
  const [catatan, setCatatan] = useState("");
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [ttdUrl, setTtdUrl] = useState<string | null>(null);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [uploadingTtd, setUploadingTtd] = useState(false);

  const [jabatanFormList, setJabatanFormList] = useState<JabatanItem[]>([
    {
      divisi: "Dewan Harian",
      nama_jabatan: "Kepala Pondok",
      is_utama: true,
      urutan_struktur: 1,
      isCustomRole: false,
    },
  ]);

  // ============================================================
  // FETCH DATA DARI SUPABASE (DENGAN PRIVASI BISYAROH KETAT)
  // ============================================================
  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: settingData } = await supabase
        .from("pengaturan_aplikasi")
        .select("*")
        .eq("id", 1)
        .maybeSingle();

      if (settingData) {
        setPengaturan({
          nama_pesantren: (settingData.nama_pesantren || "Pondok Pesantren An-Nur 1 Bululawang").toUpperCase(),
          alamat_lengkap: settingData.alamat_lengkap || "Jl. Diponegoro IV / 2-6 Bululawang, Malang, Jawa Timur",
          logo_url: settingData.logo_url || null,
          nama_pengasuh: settingData.nama_pengasuh || "Dr. KH. A. Fahrur Rozi",
          nama_kepala_pondok: settingData.nama_kepala_pondok || "Ust. M. Fajar Wahyudi",
          nama_sekretaris: settingData.nama_sekretaris || "Ust. Moh. Sayid Ali",
          nama_bendahara: settingData.nama_bendahara || "Ust. Ali Nur Ikasan",
        });
      }

      const { data: santriKamarData } = await supabase
        .from("santri")
        .select("kamar")
        .not("kamar", "is", null);

      if (santriKamarData && santriKamarData.length > 0) {
        const mergedRooms = [...DEFAULT_KAMAR_SANTRI];
        santriKamarData.forEach((row: { kamar: string }) => {
          const cleanRoom = (row.kamar || "").trim();
          if (cleanRoom && !mergedRooms.some((r) => r.toLowerCase() === cleanRoom.toLowerCase())) {
            mergedRooms.push(cleanRoom);
          }
        });
        setKamarOptions(mergedRooms);
      }

      interface RawJabatanRow {
        id: string;
        pengurus_id?: string;
        divisi?: string | null;
        nama_jabatan?: string | null;
        is_utama?: boolean | null;
        urutan_struktur?: number | null;
      }
      interface RawPengurusRow {
        id: string;
        nama_lengkap: string;
        no_wa?: string | null;
        alamat?: string | null;
        foto_url?: string | null;
        ttd_url?: string | null;
        nominal_bisyaroh?: number | null;
        status?: "aktif" | "nonaktif" | "boyong" | null;
        masa_khidmat?: string | null;
        catatan?: string | null;
        username?: string | null;
        role?: string | null;
        allowed_modules?: unknown;
        auth_user_id?: string | null;
        must_change_password?: boolean | null;
        jabatan_list?: RawJabatanRow[] | null;
      }

      // Gunakan view aman v_pengurus_aman + pengurus_jabatan (fallback ke v_pengurus_lengkap jika view belum dimigrasi)
      let baseRows: RawPengurusRow[] = [];
      const [amanRes, jabatanRes] = await Promise.all([
        supabase.from("v_pengurus_aman").select("*").order("created_at", { ascending: true }),
        supabase.from("pengurus_jabatan").select("*"),
      ]);

      if (!amanRes.error && Array.isArray(amanRes.data)) {
        const jabMap = new Map<string, RawJabatanRow[]>();
        ((jabatanRes.data || []) as RawJabatanRow[]).forEach((j) => {
          if (!j.pengurus_id) return;
          const list = jabMap.get(j.pengurus_id) || [];
          list.push(j);
          jabMap.set(j.pengurus_id, list);
        });
        baseRows = (amanRes.data as RawPengurusRow[]).map((p) => ({
          ...p,
          jabatan_list: jabMap.get(p.id) || [],
        }));
      } else {
        const { data: pengurusData, error } = await supabase
          .from("v_pengurus_lengkap")
          .select("*")
          .order("created_at", { ascending: true });
        if (error) throw error;
        baseRows = (pengurusData || []) as RawPengurusRow[];
      }

      // Ambil kolom role & allowed_modules langsung dari tabel pengurus jika view belum menyertakannya
      const extraMetaMap = new Map<string, { role: string | null; allowed_modules: string[] | null }>();
      const { data: metaRows, error: metaErr } = await supabase
        .from("pengurus")
        .select("id, role, allowed_modules");
      if (!metaErr && Array.isArray(metaRows)) {
        (metaRows as Array<{ id: string; role?: string | null; allowed_modules?: unknown }>).forEach((m) => {
          extraMetaMap.set(m.id, {
            role: m.role ?? null,
            allowed_modules: normalizeAllowedModulesList(m.allowed_modules),
          });
        });
      }

      // Ambil nominal bisyaroh HANYA jika user adalah Pimpinan Inti / Bendahara / Super Admin
      const bisyarohMap = new Map<string, number>();
      if (canViewBisyaroh) {
        const { data: rpcRows } = await supabase.rpc("get_pengurus_bisyaroh_map");
        if (Array.isArray(rpcRows)) {
          (rpcRows as Array<{ pengurus_id: string; nominal_bisyaroh: number }>).forEach((r) => {
            bisyarohMap.set(r.pengurus_id, Number(r.nominal_bisyaroh || 0));
          });
        }
      }

      const activeTaFallback = getDynamicTahunAjaranAktif();
      const normalized: PengurusItem[] = baseRows.map((item) => {
        const extra = extraMetaMap.get(item.id);
        return {
          id: item.id,
          nama_lengkap: item.nama_lengkap,
          no_wa: item.no_wa ?? null,
          alamat: item.alamat ?? null,
          foto_url: item.foto_url ?? null,
          ttd_url: item.ttd_url ?? null,
          nominal_bisyaroh: canViewBisyaroh
            ? bisyarohMap.has(item.id)
              ? (bisyarohMap.get(item.id) as number)
              : Number(item.nominal_bisyaroh || 0)
            : 0,
          status: item.status || "aktif",
          masa_khidmat: item.masa_khidmat || activeTaFallback,
          catatan: item.catatan ?? null,
          username: item.username || null,
          role: (item.role ?? extra?.role ?? null) as string | null,
          allowed_modules:
            item.allowed_modules !== undefined
              ? normalizeAllowedModulesList(item.allowed_modules)
              : extra?.allowed_modules ?? null,
          auth_user_id: item.auth_user_id || null,
          must_change_password: Boolean(item.must_change_password),
          jabatan_list: Array.isArray(item.jabatan_list)
            ? item.jabatan_list.map((j) => ({
                id: j.id,
                divisi: normalizeDivisi(j.divisi || ""),
                nama_jabatan: j.nama_jabatan || "",
                is_utama: Boolean(j.is_utama),
                urutan_struktur: Number(j.urutan_struktur || 10),
              }))
            : [],
        };
      });

      const dynOpts = getDynamicMasaKhidmatOptions();
      const dbTerms = Array.from(new Set(normalized.map((p) => p.masa_khidmat).filter(Boolean)));
      const mergedOpts = Array.from(new Set([...dynOpts, ...dbTerms])).sort();
      setMasaKhidmatOptions(mergedOpts);
      setPengurusList(normalized);
    } catch (err) {
      console.error("Gagal memuat data pengurus:", err);
    } finally {
      setLoading(false);
    }
  }, [canViewBisyaroh]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const dynTa = getDynamicTahunAjaranAktif();
      const dynOpts = getDynamicMasaKhidmatOptions();
      setMasaKhidmatOptions(dynOpts);
      setMasaKhidmat((prev) => prev || dynTa);
      setFormMasaKhidmat((prev) => prev || dynTa);
      setDynamicYearHint(`annur${getDynamicTahunSekarang()}`);
      void fetchAllData();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchAllData]);

  // ============================================================
  // KALKULASI STATISTIK & DATA TERFILTER (URUT SESUAI HIRARKI)
  // ============================================================
  const pengurusByMasaKhidmat = useMemo(() => {
    if (!masaKhidmat) return pengurusList;
    return pengurusList.filter((p) => p.masa_khidmat === masaKhidmat);
  }, [pengurusList, masaKhidmat]);

  const stats = useMemo(() => {
    const aktifList = pengurusByMasaKhidmat.filter(isPengurusAktifOperasional);
    const totalPersonel = aktifList.length;
    const totalPosisi = aktifList.reduce(
      (acc, p) => acc + getOperasionalJabatanList(p).length,
      0
    );
    const rangkapJabatan = aktifList.filter(
      (p) => getOperasionalJabatanList(p).length > 1
    ).length;
    const totalBisyaroh = aktifList.reduce((acc, p) => acc + (p.nominal_bisyaroh || 0), 0);
    return { totalPersonel, totalPosisi, rangkapJabatan, totalBisyaroh };
  }, [pengurusByMasaKhidmat]);

  const filteredPengurus = useMemo(() => {
    const filtered = pengurusByMasaKhidmat.filter((p) => {
      const matchStatus =
        filterStatus === "semua"
          ? true
          : filterStatus === "aktif"
          ? isExcludedTopDivisi(filterDivisi)
            ? p.status === "aktif"
            : isPengurusAktifOperasional(p)
          : p.status === filterStatus;
      const matchDivisi =
        filterDivisi === "semua"
          ? true
          : p.jabatan_list.some((j) => normalizeDivisi(j.divisi) === filterDivisi);
      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        p.nama_lengkap.toLowerCase().includes(q) ||
        p.jabatan_list.some((j) => {
          const formatted = formatTableJabatanLabel(j);
          return (
            formatted.primary.toLowerCase().includes(q) ||
            j.nama_jabatan.toLowerCase().includes(q) ||
            j.divisi.toLowerCase().includes(q)
          );
        });
      return matchStatus && matchDivisi && matchQuery;
    });

    return [...filtered].sort((a, b) => {
      const tupleA = getHighestPengurusTuple(a, kamarOptions);
      const tupleB = getHighestPengurusTuple(b, kamarOptions);
      const cmp = compareTuples(tupleA, tupleB);
      if (cmp !== 0) return cmp;
      return a.nama_lengkap.localeCompare(b.nama_lengkap, "id");
    });
  }, [pengurusByMasaKhidmat, filterStatus, filterDivisi, searchQuery, kamarOptions]);

  // ============================================================
  // DATA STRUKTUR BAGAN 5 TINGKAT
  // ============================================================
  const strukturBagan = useMemo(() => {
    const aktifList = pengurusByMasaKhidmat.filter((p) => p.status === "aktif");

    interface Assignment {
      pengurus: PengurusItem;
      divisi: string;
      nama_jabatan: string;
      urutan_struktur: number;
      is_utama: boolean;
    }

    const allAssignments: Assignment[] = [];
    aktifList.forEach((p) => {
      p.jabatan_list.forEach((j) => {
        allAssignments.push({
          pengurus: p,
          divisi: normalizeDivisi(j.divisi),
          nama_jabatan: j.nama_jabatan,
          urutan_struktur: j.urutan_struktur,
          is_utama: j.is_utama,
        });
      });
    });

    const pengasuhList = allAssignments
      .filter((a) => a.divisi === "Pengasuh Pondok")
      .sort((a, b) => a.urutan_struktur - b.urutan_struktur);

    const dewanPengasuhList = allAssignments
      .filter((a) => a.divisi === "Dewan Pengasuh (Dzurriyah)")
      .sort((a, b) => a.urutan_struktur - b.urutan_struktur);

    const direkturList = allAssignments
      .filter((a) => a.divisi === "Direktur Pendidikan")
      .sort((a, b) => a.urutan_struktur - b.urutan_struktur);

    const harianAssignments = allAssignments.filter((a) => a.divisi === "Dewan Harian");
    const findHarianSlot = (posisi: string) => {
      const idx = DEWAN_HARIAN_POSITIONS.findIndex(
        (p) => p.toLowerCase() === posisi.toLowerCase()
      );
      const found = harianAssignments.find(
        (a) => a.nama_jabatan.trim().toLowerCase() === posisi.toLowerCase()
      );
      return {
        nomor: idx + 1,
        jabatan: posisi,
        personel: found ? found.pengurus : null,
      };
    };

    const dewanHarianPairs = DEWAN_HARIAN_COLUMN_PAIRS.map((pair) => ({
      topSlot: findHarianSlot(pair.top),
      bottomSlot: findHarianSlot(pair.bottom),
    }));

    const divisiCards = SEPULUH_DIVISI.map((namaDivisi) => {
      const members = allAssignments
        .filter((a) => a.divisi === namaDivisi)
        .sort((a, b) => a.urutan_struktur - b.urutan_struktur)
        .map((a) => ({
          ...a,
          cleanRole: resolveCleanDivisiRole({
            divisi: namaDivisi,
            nama_jabatan: a.nama_jabatan,
            urutan_struktur: a.urutan_struktur,
          }),
        }));
      return {
        namaDivisi,
        members,
      };
    });

    const musyrifAssignments = allAssignments
      .filter((a) => a.divisi === "Musyrif Kamar")
      .sort((a, b) => {
        const roomA = extractKamarName(a.nama_jabatan);
        const roomB = extractKamarName(b.nama_jabatan);
        const idxA = kamarOptions.findIndex(
          (k) => k.toLowerCase() === roomA.toLowerCase()
        );
        const idxB = kamarOptions.findIndex(
          (k) => k.toLowerCase() === roomB.toLowerCase()
        );
        const orderA = idxA === -1 ? 999 : idxA;
        const orderB = idxB === -1 ? 999 : idxB;
        if (orderA !== orderB) return orderA - orderB;
        return a.urutan_struktur - b.urutan_struktur;
      });

    return {
      pengasuhList,
      dewanPengasuhList,
      direkturList,
      dewanHarianPairs,
      divisiCards,
      musyrifAssignments,
    };
  }, [pengurusByMasaKhidmat, kamarOptions]);

  // ============================================================
  // HANDLER MODAL TAMBAH / EDIT PENGURUS
  // ============================================================
  const openAddModal = () => {
    setEditingId(null);
    setNamaLengkap("");
    setNoWa("");
    setNominalBisyaroh("0");
    setStatusPengurus("aktif");
    setFormMasaKhidmat(masaKhidmat);
    setAlamatAsal("");
    setCatatan("");
    setFotoUrl(null);
    setTtdUrl(null);
    setJabatanFormList([
      {
        divisi: "Dewan Harian",
        nama_jabatan: "Kepala Pondok",
        is_utama: true,
        urutan_struktur: 1,
        isCustomRole: false,
      },
    ]);
    setIsModalOpen(true);
  };

  const openEditModal = (item: PengurusItem) => {
    setEditingId(item.id);
    setNamaLengkap(item.nama_lengkap);
    setNoWa(item.no_wa || "");
    setNominalBisyaroh(String(item.nominal_bisyaroh || 0));
    setStatusPengurus(item.status);
    setFormMasaKhidmat(item.masa_khidmat || masaKhidmat);
    setAlamatAsal(item.alamat || "");
    setCatatan(item.catatan || "");
    setFotoUrl(item.foto_url);
    setTtdUrl(item.ttd_url);

    if (item.jabatan_list && item.jabatan_list.length > 0) {
      setJabatanFormList(
        item.jabatan_list.map((j) => {
          const normDiv = normalizeDivisi(j.divisi);
          let normJabatan = j.nama_jabatan;
          let customFlag = false;

          if (normDiv === "Musyrif Kamar") {
            const room = extractKamarName(j.nama_jabatan);
            normJabatan = room
              ? `Musyrif Kamar ${room}`
              : `Musyrif Kamar ${kamarOptions[0] || "A1"}`;
          } else if (isTenDivisi(normDiv)) {
            const cleanRole = resolveCleanDivisiRole({
              divisi: normDiv,
              nama_jabatan: j.nama_jabatan,
              urutan_struktur: j.urutan_struktur,
            });
            normJabatan = cleanRole;
            customFlag = !(DIVISI_ROLE_PRESETS as readonly string[]).some(
              (p) => p.toLowerCase() === cleanRole.toLowerCase()
            );
          } else if (
            normDiv === "Pengasuh Pondok" ||
            normDiv === "Dewan Pengasuh (Dzurriyah)" ||
            normDiv === "Direktur Pendidikan"
          ) {
            normJabatan = normDiv;
          }

          return {
            id: j.id,
            divisi: normDiv,
            nama_jabatan: normJabatan,
            is_utama: j.is_utama,
            urutan_struktur: j.urutan_struktur || 1,
            isCustomRole: customFlag,
          };
        })
      );
    } else {
      setJabatanFormList([
        {
          divisi: "Sie Kegiatan",
          nama_jabatan: "Koordinator",
          is_utama: true,
          urutan_struktur: 1,
          isCustomRole: false,
        },
      ]);
    }
    setIsModalOpen(true);
  };

  const handleDivisiChange = (index: number, newDivisi: string) => {
    setJabatanFormList((prev) =>
      prev.map((row, idx) => {
        if (idx !== index) return row;

        if (newDivisi === "Musyrif Kamar") {
          const defaultRoom = kamarOptions[0] || "A1";
          return {
            ...row,
            divisi: newDivisi,
            nama_jabatan: `Musyrif Kamar ${defaultRoom}`,
            urutan_struktur: 1,
            isCustomRole: false,
          };
        }

        if (newDivisi === "Dewan Harian") {
          return {
            ...row,
            divisi: newDivisi,
            nama_jabatan: "Kepala Pondok",
            urutan_struktur: 1,
            isCustomRole: false,
          };
        }

        if (
          newDivisi === "Pengasuh Pondok" ||
          newDivisi === "Dewan Pengasuh (Dzurriyah)" ||
          newDivisi === "Direktur Pendidikan"
        ) {
          return {
            ...row,
            divisi: newDivisi,
            nama_jabatan: newDivisi,
            urutan_struktur: 1,
            isCustomRole: false,
          };
        }

        return {
          ...row,
          divisi: newDivisi,
          nama_jabatan: "Koordinator",
          urutan_struktur: 1,
          isCustomRole: false,
        };
      })
    );
  };

  const handleJabatanChange = (index: number, newValue: string) => {
    setJabatanFormList((prev) =>
      prev.map((row, idx) => {
        if (idx !== index) return row;

        if (row.divisi === "Musyrif Kamar") {
          const roomIdx = kamarOptions.findIndex(
            (k) => k.toLowerCase() === newValue.toLowerCase()
          );
          return {
            ...row,
            nama_jabatan: `Musyrif Kamar ${newValue}`,
            urutan_struktur: roomIdx >= 0 ? roomIdx + 1 : 1,
          };
        }

        if (row.divisi === "Dewan Harian") {
          const harianIdx = DEWAN_HARIAN_POSITIONS.findIndex(
            (pos) => pos.toLowerCase() === newValue.toLowerCase()
          );
          return {
            ...row,
            nama_jabatan: newValue,
            urutan_struktur: harianIdx >= 0 ? harianIdx + 1 : 1,
          };
        }

        if (isTenDivisi(row.divisi) && !row.isCustomRole) {
          if (newValue === "__CUSTOM__") {
            return {
              ...row,
              nama_jabatan: "",
              isCustomRole: true,
              urutan_struktur: 3,
            };
          }
          const autoOrder =
            newValue === "Koordinator"
              ? 1
              : newValue === "Wakil Koordinator"
              ? 2
              : 10;
          return {
            ...row,
            nama_jabatan: newValue,
            urutan_struktur: autoOrder,
          };
        }

        return {
          ...row,
          nama_jabatan: newValue,
        };
      })
    );
  };

  const resetCustomRoleToPreset = (index: number) => {
    setJabatanFormList((prev) =>
      prev.map((row, idx) =>
        idx === index
          ? {
              ...row,
              nama_jabatan: "Koordinator",
              urutan_struktur: 1,
              isCustomRole: false,
            }
          : row
      )
    );
  };

  const addJabatanRow = () => {
    const defaultRoom = kamarOptions[0] || "A1";
    setJabatanFormList((prev) => [
      ...prev,
      {
        divisi: "Musyrif Kamar",
        nama_jabatan: `Musyrif Kamar ${defaultRoom}`,
        is_utama: prev.length === 0,
        urutan_struktur: 1,
        isCustomRole: false,
      },
    ]);
  };

  const removeJabatanRow = (index: number) => {
    if (jabatanFormList.length <= 1) return;
    setJabatanFormList((prev) => {
      const updated = prev.filter((_, idx) => idx !== index);
      if (!updated.some((j) => j.is_utama) && updated.length > 0) {
        updated[0].is_utama = true;
      }
      return updated;
    });
  };

  const setUtamaJabatan = (index: number) => {
    setJabatanFormList((prev) =>
      prev.map((row, idx) => ({
        ...row,
        is_utama: idx === index,
      }))
    );
  };

  // ============================================================
  // UPLOAD FOTO PROFIL & TTD DIGITAL
  // ============================================================
  const handleUploadFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "foto" | "ttd"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (type === "foto") setUploadingFoto(true);
    else setUploadingTtd(true);

    try {
      const ext = file.name.split(".").pop();
      const fileName = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const bucket = "foto-pengurus";

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
      if (type === "foto") {
        setFotoUrl(urlData.publicUrl);
      } else {
        setTtdUrl(urlData.publicUrl);
      }
    } catch (err) {
      console.error("Gagal upload file:", err);
      alert("Gagal mengunggah file. Pastikan bucket 'foto-pengurus' aktif di Supabase.");
    } finally {
      if (type === "foto") setUploadingFoto(false);
      else setUploadingTtd(false);
    }
  };

  // ============================================================
  // SIMPAN & HAPUS PENGURUS
  // ============================================================
  const handleSavePengurus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!namaLengkap.trim()) {
      alert("Nama lengkap pengurus wajib diisi.");
      return;
    }

    const validJabatan = jabatanFormList.filter((j) => j.nama_jabatan.trim() !== "");
    if (validJabatan.length === 0) {
      alert("Minimal 1 jabatan / amanah harus diisi.");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        nama_lengkap: namaLengkap.trim(),
        no_wa: noWa.trim() || null,
        kamar_tugas: null,
        alamat: alamatAsal.trim() || null,
        foto_url: fotoUrl,
        ttd_url: ttdUrl,
        status: statusPengurus,
        masa_khidmat: formMasaKhidmat,
        catatan: catatan.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (canViewBisyaroh) {
        payload.nominal_bisyaroh = Number(nominalBisyaroh) || 0;
      }

      let targetPengurusId = editingId;

      if (editingId) {
        const { error: updateError } = await supabase
          .from("pengurus")
          .update(payload)
          .eq("id", editingId);
        if (updateError) throw updateError;

        const { error: delJabError } = await supabase
          .from("pengurus_jabatan")
          .delete()
          .eq("pengurus_id", editingId);
        if (delJabError) throw delJabError;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("pengurus")
          .insert([payload])
          .select("id")
          .single();
        if (insertError) throw insertError;
        targetPengurusId = inserted.id;
      }

      if (targetPengurusId) {
        const jabatanRows = validJabatan.map((j) => ({
          pengurus_id: targetPengurusId,
          divisi: j.divisi,
          nama_jabatan: j.nama_jabatan.trim(),
          is_utama: j.is_utama,
          urutan_struktur: Number(j.urutan_struktur) || 10,
        }));

        const { error: jabInsertError } = await supabase
          .from("pengurus_jabatan")
          .insert(jabatanRows);
        if (jabInsertError) throw jabInsertError;
      }

      // Sinkronkan status nonaktif/boyong ke Supabase Auth agar akun otomatis diblokir
      if (editingId && canManageAccounts && isSupabaseConfigured()) {
        const targetObj = pengurusList.find((p) => p.id === editingId);
        if (targetObj?.auth_user_id) {
          const { data: sessData } = await supabase.auth.getSession();
          const token = sessData?.session?.access_token;
          if (token) {
            await fetch("/api/admin/pengurus-akun", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                action: "sync_status",
                pengurus_id: editingId,
                status: statusPengurus,
              }),
            });
          }
        }
      }

      const isPengasuhUtama = validJabatan.some((j) => j.divisi === "Pengasuh Pondok");
      if (isPengasuhUtama && statusPengurus === "aktif") {
        await supabase
          .from("pengaturan_aplikasi")
          .update({
            nama_pengasuh: namaLengkap.trim(),
            ...(ttdUrl ? { ttd_pengasuh_url: ttdUrl } : {}),
          })
          .eq("id", 1);
      }

      setIsModalOpen(false);
      await fetchAllData();
      if (currentPengurus && editingId === currentPengurus.id) {
        await refreshAuth();
      }
    } catch (err: unknown) {
      console.error("Gagal menyimpan pengurus:", err);
      const message = err instanceof Error ? err.message : "Unknown error";
      alert("Terjadi kesalahan saat menyimpan data: " + message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePengurus = async (id: string, nama: string) => {
    if (!canEditPengurus) return;
    if (!confirm(`Hapus data pengurus "${nama}" beserta seluruh jabatannya?`)) return;
    try {
      const { error } = await supabase.from("pengurus").delete().eq("id", id);
      if (error) throw error;
      await fetchAllData();
    } catch (err) {
      console.error("Gagal menghapus pengurus:", err);
      alert("Gagal menghapus data pengurus.");
    }
  };

  // ============================================================
  // MANAJEMEN AKUN LOGIN TERPUSAT (CREATE / RESET PASSWORD / MODUL RBAC)
  // ============================================================
  const openAccountModal = (item: PengurusItem) => {
    if (!canManageAccounts) return;
    const suggested = normalizeUsername(
      item.username ||
        item.nama_lengkap
          .replace(/^(dr\.|kh\.|ust\.|h\.|hj\.|agus|nyai)\s+/gi, "")
          .split(" ")
          .slice(0, 2)
          .join(".")
    );

    const initialPerms = Array.isArray(item.allowed_modules)
      ? new Set<string>(item.allowed_modules)
      : new Set<string>(
          Array.from(
            derivePermissionsFromJabatan(item.jabatan_list || [], {
              role: item.role,
              username: item.username,
            }).editable
          )
        );

    setAccountTarget(item);
    setAccountUsername(item.username || suggested);
    setAccountTempPassword("");
    setAccountModules(initialPerms);
    setAccountFeedback(null);
  };

  const togglePermissionGroup = (modules: readonly string[]) => {
    setAccountModules((prev) => {
      const next = new Set(prev);
      const allChecked = modules.every((m) => next.has(m));
      if (allChecked) {
        modules.forEach((m) => next.delete(m));
      } else {
        modules.forEach((m) => next.add(m));
      }
      return next;
    });
  };

  const handleSaveModulePermissions = async () => {
    if (!accountTarget || !isSuperAdmin) return;
    setAccountSaving(true);
    setAccountFeedback(null);
    const modulesArray = Array.from(accountModules);
    try {
      if (!isSupabaseConfigured()) {
        await supabase
          .from("pengurus")
          .update({ allowed_modules: modulesArray })
          .eq("id", accountTarget.id);
        setAccountTarget((prev) => (prev ? { ...prev, allowed_modules: modulesArray } : prev));
        setAccountFeedback({
          type: "ok",
          msg: "Hak akses modul berhasil disimpan (Mode Pratinjau).",
        });
        await fetchAllData();
        if (currentPengurus && accountTarget.id === currentPengurus.id) {
          await refreshAuth();
        }
        return;
      }

      const { data: sessData } = await supabase.auth.getSession();
      const token = sessData?.session?.access_token;
      if (!token) {
        setAccountFeedback({
          type: "err",
          msg: "Sesi Supabase Anda tidak ditemukan. Silakan login ulang terlebih dahulu.",
        });
        return;
      }

      const res = await fetch("/api/admin/pengurus-akun", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "update_permissions",
          pengurus_id: accountTarget.id,
          allowed_modules: modulesArray,
        }),
      });

      const json = (await res.json()) as { error?: string; allowed_modules?: string[] | null };
      if (!res.ok) {
        setAccountFeedback({
          type: "err",
          msg: json.error || "Gagal menyimpan hak akses modul.",
        });
        return;
      }

      setAccountTarget((prev) =>
        prev ? { ...prev, allowed_modules: json.allowed_modules ?? modulesArray } : prev
      );
      setAccountFeedback({
        type: "ok",
        msg: "Hak akses modul berhasil diperbarui dan langsung aktif untuk akun ini.",
      });
      await fetchAllData();
      if (currentPengurus && accountTarget.id === currentPengurus.id) {
        await refreshAuth();
      }
    } catch (err) {
      setAccountFeedback({
        type: "err",
        msg: err instanceof Error ? err.message : "Terjadi kendala saat menghubungi server.",
      });
    } finally {
      setAccountSaving(false);
    }
  };

  const handleAccountAction = async (mode: "create_account" | "reset_password") => {
    if (!accountTarget || !canManageAccounts) return;
    const cleanUname = normalizeUsername(accountUsername);
    const tempPw = accountTempPassword.trim();

    if (mode === "create_account" && cleanUname.length < 3) {
      setAccountFeedback({ type: "err", msg: "Username minimal 3 karakter (huruf/angka/titik)." });
      return;
    }
    if (tempPw.length < 6) {
      setAccountFeedback({ type: "err", msg: "Password sementara minimal 6 karakter." });
      return;
    }

    setAccountSaving(true);
    setAccountFeedback(null);
    const modulesArray = isSuperAdmin ? Array.from(accountModules) : undefined;
    try {
      if (!isSupabaseConfigured()) {
        // Mode Preview / Mock lokal
        await supabase
          .from("pengurus")
          .update({
            username: mode === "create_account" ? cleanUname : accountTarget.username || cleanUname,
            auth_user_id: accountTarget.auth_user_id || `auth-${accountTarget.id}`,
            must_change_password: true,
            ...(modulesArray ? { allowed_modules: modulesArray } : {}),
          })
          .eq("id", accountTarget.id);
        setMockAccountPassword(
          mode === "create_account" ? cleanUname : accountTarget.username || cleanUname,
          tempPw
        );
        setAccountFeedback({
          type: "ok",
          msg:
            mode === "create_account"
              ? `Akun login "${cleanUname}" berhasil dibuat (Mode Pratinjau).`
              : "Password sementara berhasil direset. Pengurus wajib mengganti password saat login.",
        });
        await fetchAllData();
        return;
      }

      const { data: sessData } = await supabase.auth.getSession();
      const token = sessData?.session?.access_token;
      if (!token) {
        setAccountFeedback({
          type: "err",
          msg: "Sesi Supabase Anda tidak ditemukan. Silakan login ulang terlebih dahulu.",
        });
        return;
      }

      const res = await fetch("/api/admin/pengurus-akun", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: mode,
          pengurus_id: accountTarget.id,
          username: cleanUname,
          temporary_password: tempPw,
          ...(mode === "create_account" && modulesArray ? { allowed_modules: modulesArray } : {}),
        }),
      });

      const json = (await res.json()) as { error?: string; username?: string };
      if (!res.ok) {
        setAccountFeedback({
          type: "err",
          msg: json.error || "Gagal memproses akun pengurus.",
        });
        return;
      }

      setAccountFeedback({
        type: "ok",
        msg:
          mode === "create_account"
            ? `Akun "${json.username || cleanUname}" siap digunakan. Berikan username & password sementara ini kepada yang bersangkutan.`
            : "Password sementara berhasil direset. Pengurus wajib mengganti password saat login berikutnya.",
      });
      await fetchAllData();
    } catch (err) {
      setAccountFeedback({
        type: "err",
        msg: err instanceof Error ? err.message : "Terjadi kendala saat menghubungi server.",
      });
    } finally {
      setAccountSaving(false);
    }
  };

  // ============================================================
  // HELPER FORMATTER
  // ============================================================
  const formatRupiah = (angka: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(angka);

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  };

  const formatWaLink = (wa: string) => {
    const digits = wa.replace(/\D/g, "");
    if (digits.startsWith("0")) return `https://wa.me/62${digits.slice(1)}`;
    if (digits.startsWith("62")) return `https://wa.me/${digits}`;
    return `https://wa.me/62${digits}`;
  };

  // Helper render kartu slot Dewan Harian (Kompak untuk Layar & PDF)
  const renderDewanHarianCard = (slot: {
    nomor: number;
    jabatan: string;
    personel: PengurusItem | null;
  }) => (
    <div className="bg-white rounded-xl border border-emerald-200/90 p-3 print-card-pad flex items-center gap-2.5 shadow-2xs min-h-[70px] print:min-h-[42px]">
      {slot.personel ? (
        <>
          {slot.personel.foto_url ? (
            <img
              src={slot.personel.foto_url}
              alt={slot.personel.nama_lengkap}
              className="w-10 h-10 print:w-6 print:h-6 rounded-full object-cover border border-emerald-200 shrink-0"
            />
          ) : (
            <div className="w-10 h-10 print:w-6 print:h-6 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs print:text-[8.5px] flex items-center justify-center shrink-0">
              {getInitials(slot.personel.nama_lengkap)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <span className="inline-block text-[10px] print:text-[7.5px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded leading-tight">
              {slot.jabatan}
            </span>
            <p className="text-sm print:text-[10px] font-bold text-slate-800 truncate mt-0.5 leading-snug">
              {slot.personel.nama_lengkap}
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="w-10 h-10 print:w-6 print:h-6 rounded-full bg-slate-100 text-slate-400 font-bold text-xs print:text-[8.5px] flex items-center justify-center shrink-0">
            {slot.nomor}
          </div>
          <div className="min-w-0 flex-1">
            <span className="inline-block text-[10px] print:text-[7.5px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded leading-tight">
              {slot.jabatan}
            </span>
            <p className="text-xs print:text-[9px] italic text-slate-400 mt-0.5">
              Belum diisi
            </p>
          </div>
        </>
      )}
    </div>
  );

  // ============================================================
  // RENDER UI
  // ============================================================
  return (
    <div className="min-h-screen bg-slate-50/70 p-4 md:p-6 space-y-6 print:p-0 print:bg-white">
      {/* STYLE KHUSUS CETAK A4 HEMAT KERTAS & HALAMAN 2 KHUSUS MUSYRIF */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 7mm 8mm;
          }
          html,
          body {
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * {
            visibility: hidden;
          }
          #printable-bagan-area,
          #printable-bagan-area * {
            visibility: visible;
          }
          #printable-bagan-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            max-width: 100% !important;
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          .print-grid-2 {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 6px !important;
          }
          .print-grid-3 {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 5px !important;
          }
          .print-grid-4 {
            display: grid !important;
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
            gap: 6px !important;
          }
          .print-card-pad {
            padding: 3.5px 6px !important;
          }
          .print-header-pad {
            padding: 3.5px 8px !important;
          }
          .print-connector {
            height: 6px !important;
          }
          .print-avoid-break {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .print-page-2 {
            break-before: page !important;
            page-break-before: always !important;
            margin-top: 0 !important;
            padding-top: 1mm !important;
          }
        }
      `}</style>

      <div className="no-print">
        <TransparencyBanner
          moduleLabel="Data Pengurus & Struktur Divisi"
          isReadOnly={!canEditPengurus}
          extraNote={!canViewBisyaroh ? "Informasi nominal bisyaroh dikunci khusus Pimpinan Inti & Bendahara." : undefined}
        />
      </div>

      {/* HEADER HALAMAN */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2.5">
            <Users className="w-7 h-7 text-emerald-700" />
            Data Pengurus &amp; Struktur Divisi
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manajemen personel pengurus pondok, multi-jabatan, dan akun pribadi terpusat.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => {
              setActiveTab("bagan");
              setTimeout(() => window.print(), 250);
            }}
            className="min-h-[40px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs sm:text-sm font-medium hover:bg-slate-50 shadow-sm transition whitespace-nowrap"
          >
            <Printer className="w-4 h-4 text-slate-600 shrink-0" />
            Cetak Bagan (A4)
          </button>

          {canEditPengurus && (
            <button
              type="button"
              onClick={openAddModal}
              className="min-h-[40px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs sm:text-sm font-semibold hover:bg-emerald-800 shadow-sm transition whitespace-nowrap"
            >
              <Plus className="w-4 h-4 shrink-0" />
              Tambah Pengurus
            </button>
          )}
        </div>
      </div>

      {/* KARTU RINGKASAN STATISTIK (Kompak 2x2 di HP, 4 kolom di Desktop) */}
      <div
        className={`grid grid-cols-2 ${
          canViewBisyaroh ? "lg:grid-cols-4" : "lg:grid-cols-3"
        } gap-3 sm:gap-4 no-print`}
      >
        <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-4 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] sm:text-xs font-medium text-slate-500 truncate">Pengurus Aktif</p>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-xl sm:text-2xl font-bold text-slate-800 tabular-nums">{stats.totalPersonel}</span>
              <span className="text-[11px] text-slate-400">Orang</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-4 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center shrink-0">
            <Award className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] sm:text-xs font-medium text-slate-500 truncate">Posisi Terisi</p>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-xl sm:text-2xl font-bold text-slate-800 tabular-nums">{stats.totalPosisi}</span>
              <span className="text-[11px] text-slate-400">Jabatan</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-4 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] sm:text-xs font-medium text-slate-500 truncate">Rangkap Jabatan</p>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-xl sm:text-2xl font-bold text-slate-800 tabular-nums">{stats.rangkapJabatan}</span>
              <span className="text-[11px] text-slate-400">Personel</span>
            </div>
          </div>
        </div>

        {canViewBisyaroh && (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-4 shadow-sm flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
                <Wallet className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] sm:text-xs font-medium text-slate-500 truncate">Bisyaroh / Bln</p>
                <p className="text-sm sm:text-lg font-bold text-slate-800 truncate mt-0.5 tabular-nums">
                  {showBisyaroh ? formatRupiah(stats.totalBisyaroh) : "Rp ••••••"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowBisyaroh(!showBisyaroh)}
              className="p-1.5 sm:p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition shrink-0"
              title={showBisyaroh ? "Sembunyikan Nominal" : "Tampilkan Nominal"}
            >
              {showBisyaroh ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>

      {/* BAR NAVIGASI TAB & FILTER MASA KHIDMAT */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 lg:pb-0">
          <button
            type="button"
            onClick={() => setActiveTab("daftar")}
            className={`min-h-[40px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition whitespace-nowrap shrink-0 ${
              activeTab === "daftar"
                ? "bg-emerald-700 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
            }`}
          >
            1. Daftar Pengurus ({pengurusByMasaKhidmat.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("bagan")}
            className={`min-h-[40px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition whitespace-nowrap shrink-0 ${
              activeTab === "bagan"
                ? "bg-emerald-700 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
            }`}
          >
            2. Bagan Struktur Kepengurusan
          </button>
        </div>

        <div className="flex items-center justify-between sm:justify-start gap-2.5 shrink-0">
          <span className="text-xs font-medium text-slate-500 whitespace-nowrap">Masa Khidmat:</span>
          <select
            value={masaKhidmat}
            onChange={(e) => setMasaKhidmat(e.target.value)}
            className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            {masaKhidmatOptions.map((mk) => (
              <option key={mk} value={mk}>
                {mk}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ============================================================
          TAB 1: DAFTAR PENGURUS (WARNA LATAR TIPIS TIAP TINGKATAN BARIS)
      ============================================================ */}
      {activeTab === "daftar" && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          {/* Filter Bar */}
          <div className="p-3.5 sm:p-4 border-b border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5">
            <div className="relative sm:col-span-2 lg:col-span-6 min-w-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Cari nama pengurus, jabatan, atau divisi..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full min-h-[40px] pl-10 pr-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs sm:text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <select
              value={filterDivisi}
              onChange={(e) => setFilterDivisi(e.target.value)}
              className="lg:col-span-3 min-h-[40px] rounded-xl border border-slate-200 px-3 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="semua">Semua Divisi</option>
              {DIVISI_OPTIONS.map((div) => (
                <option key={div} value={div}>
                  {div}
                </option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="lg:col-span-3 min-h-[40px] rounded-xl border border-slate-200 px-3 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="aktif">Status: Aktif</option>
              <option value="nonaktif">Status: Nonaktif</option>
              <option value="boyong">Status: Boyong</option>
              <option value="semua">Semua Status</option>
            </select>
          </div>

          {/* Legenda Warna Tingkatan */}
          <div className="px-4 py-2 bg-slate-50/60 border-b border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
            <span className="font-semibold text-slate-600">Keterangan Warna Baris:</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-amber-300 border border-amber-500" />
              Pengasuh
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-indigo-300 border border-indigo-500" />
              Dewan Pengasuh
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-sky-300 border border-sky-500" />
              Direktur Pendidikan
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-300 border border-emerald-600" />
              Dewan Harian
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-teal-300 border border-teal-500" />
              10 Divisi / Sie
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-slate-300 border border-slate-400" />
              Musyrif Kamar
            </span>
          </div>

          {/* MOBILE CARD VIEW (PWA / HP) */}
          <div className="md:hidden divide-y divide-slate-200/70">
            {loading ? (
              <div className="py-10 text-center text-xs text-slate-400">
                Memuat data pengurus...
              </div>
            ) : filteredPengurus.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">
                Belum ada data pengurus yang sesuai dengan filter.
              </div>
            ) : (
              filteredPengurus.map((item) => {
                const sortedBadges = [...item.jabatan_list].sort((a, b) =>
                  compareTuples(
                    getJabatanHierarchyTuple(a, kamarOptions),
                    getJabatanHierarchyTuple(b, kamarOptions)
                  )
                );
                const rowStyle = getRowHierarchyStyle(item, kamarOptions);

                return (
                  <div key={item.id} className={`${rowStyle.rowBg} ${rowStyle.leftAccent} p-4 space-y-2.5 text-xs`}>
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {item.foto_url ? (
                          <img
                            src={item.foto_url}
                            alt={item.nama_lengkap}
                            className="w-10 h-10 rounded-full object-cover border border-white shadow-2xs shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-white text-emerald-800 border border-slate-200 font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                            {getInitials(item.nama_lengkap)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-slate-900 leading-snug">
                            {item.nama_lengkap}
                          </p>
                          {item.ttd_url && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium mt-0.5">
                              <FileSignature className="w-3 h-3" /> TTD Digital Tersedia
                            </span>
                          )}
                        </div>
                      </div>
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize whitespace-nowrap shrink-0 ${
                          item.status === "aktif"
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            : item.status === "boyong"
                            ? "bg-amber-100 text-amber-800 border border-amber-200"
                            : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {sortedBadges.map((jab, idx) => {
                        const label = formatTableJabatanLabel(jab);
                        const style = getHierarchyBadgeStyle(jab.divisi);
                        return (
                          <span
                            key={idx}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border ${style.badgeClass}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dotClass}`} />
                            <span className="font-semibold">{label.primary}</span>
                            {label.secondary && (
                              <span className="text-[10.5px] opacity-75">({label.secondary})</span>
                            )}
                          </span>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[11px] tabular-nums">
                      <div>
                        {item.no_wa ? (
                          <a
                            href={formatWaLink(item.no_wa)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            {item.no_wa}
                          </a>
                        ) : (
                          <span className="text-slate-400">WA: -</span>
                        )}
                      </div>
                      {canViewBisyaroh && (
                        <div className="font-bold text-slate-800">
                          Bisyaroh: {showBisyaroh ? formatRupiah(item.nominal_bisyaroh) : "Rp ••••••"}
                        </div>
                      )}
                    </div>

                    {(canEditPengurus || canManageAccounts) && (
                      <div className="flex items-center gap-2 pt-0.5">
                        {canManageAccounts && (
                          <button
                            type="button"
                            onClick={() => openAccountModal(item)}
                            className="min-h-[40px] px-3 py-2 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold inline-flex items-center justify-center gap-1.5"
                          >
                            <KeyRound className="w-3.5 h-3.5" /> {item.username ? `@${item.username}` : "Buat Akun"}
                          </button>
                        )}
                        {canEditPengurus && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditModal(item)}
                              className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-white text-slate-700 hover:text-emerald-700 border border-slate-200 font-bold inline-flex items-center justify-center gap-1.5"
                            >
                              <Edit3 className="w-3.5 h-3.5" /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeletePengurus(item.id, item.nama_lengkap)}
                              title="Hapus Pengurus"
                              aria-label={`Hapus ${item.nama_lengkap}`}
                              className="min-h-[40px] min-w-[40px] rounded-xl bg-white text-slate-500 hover:text-rose-600 border border-slate-200 inline-flex items-center justify-center"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Tabel Pengurus Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-3.5 min-w-[195px]">Profil Pengurus</th>
                  <th className="py-3 px-3.5 min-w-[230px]">Amanah &amp; Jabatan (Rangkap)</th>
                  <th className="py-3 px-3.5 w-36 whitespace-nowrap">Kontak WA</th>
                  {canViewBisyaroh && <th className="py-3 px-3.5 w-28 whitespace-nowrap">Bisyaroh</th>}
                  <th className="py-3 px-3.5 w-24 whitespace-nowrap">Status</th>
                  {(canEditPengurus || canManageAccounts) && (
                    <th className="py-3 px-3.5 w-32 text-right whitespace-nowrap">Aksi</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 text-xs sm:text-sm">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      Memuat data pengurus...
                    </td>
                  </tr>
                ) : filteredPengurus.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      Belum ada data pengurus yang sesuai dengan filter.
                    </td>
                  </tr>
                ) : (
                  filteredPengurus.map((item) => {
                    const sortedBadges = [...item.jabatan_list].sort((a, b) =>
                      compareTuples(
                        getJabatanHierarchyTuple(a, kamarOptions),
                        getJabatanHierarchyTuple(b, kamarOptions)
                      )
                    );
                    const rowStyle = getRowHierarchyStyle(item, kamarOptions);

                    return (
                      <tr
                        key={item.id}
                        className={`${rowStyle.rowBg} transition-colors`}
                      >
                        {/* Profil Pengurus */}
                        <td className={`py-3 px-3.5 ${rowStyle.leftAccent}`}>
                          <div className="flex items-center gap-3">
                            {item.foto_url ? (
                              <img
                                src={item.foto_url}
                                alt={item.nama_lengkap}
                                className="w-9 h-9 rounded-full object-cover border border-white shadow-2xs shrink-0"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-white text-emerald-800 border border-slate-200 font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                                {getInitials(item.nama_lengkap)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-800 leading-snug">{item.nama_lengkap}</p>
                              {item.ttd_url && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium mt-0.5 whitespace-nowrap">
                                  <FileSignature className="w-3 h-3" /> TTD Digital
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Amanah & Jabatan */}
                        <td className="py-3 px-3.5">
                          <div className="flex flex-wrap gap-1.5">
                            {sortedBadges.map((jab, idx) => {
                              const label = formatTableJabatanLabel(jab);
                              const style = getHierarchyBadgeStyle(jab.divisi);
                              return (
                                <span
                                  key={idx}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${style.badgeClass}`}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dotClass}`}
                                  />
                                  <span className="font-semibold">{label.primary}</span>
                                  {label.secondary && (
                                    <span className="text-[11px] opacity-75">
                                      ({label.secondary})
                                    </span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        </td>

                        {/* Kontak WA */}
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          {item.no_wa ? (
                            <a
                              href={formatWaLink(item.no_wa)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:underline whitespace-nowrap"
                            >
                              <Phone className="w-3.5 h-3.5 shrink-0" />
                              {item.no_wa}
                            </a>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>

                        {/* Bisyaroh (Khusus Pimpinan Inti & Bendahara) */}
                        {canViewBisyaroh && (
                          <td className="py-3 px-3.5 font-semibold text-slate-700 whitespace-nowrap tabular-nums text-xs sm:text-sm">
                            {showBisyaroh ? formatRupiah(item.nominal_bisyaroh) : "Rp ••••••"}
                          </td>
                        )}

                        {/* Status & Username Akun */}
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <span
                            className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize whitespace-nowrap ${
                              item.status === "aktif"
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                : item.status === "boyong"
                                ? "bg-amber-100 text-amber-800 border border-amber-200"
                                : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {item.status}
                          </span>
                          {item.username && (
                            <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                              @{item.username}
                            </p>
                          )}
                        </td>

                        {/* Aksi */}
                        {(canEditPengurus || canManageAccounts) && (
                          <td className="py-3 px-3.5 text-right whitespace-nowrap">
                            <div className="inline-flex flex-nowrap items-center justify-end gap-1.5">
                              {canManageAccounts && (
                                <button
                                  type="button"
                                  onClick={() => openAccountModal(item)}
                                  className={`p-2 rounded-lg border transition shrink-0 ${
                                    item.username
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                      : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                                  }`}
                                  title={item.username ? `Kelola Akun (@${item.username})` : "Buat Akun Login"}
                                  aria-label={`Akun ${item.nama_lengkap}`}
                                >
                                  <KeyRound className="w-4 h-4" />
                                </button>
                              )}
                              {canEditPengurus && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openEditModal(item)}
                                    className="p-2 rounded-lg bg-white/80 text-slate-600 hover:text-emerald-700 hover:bg-white border border-slate-200/70 transition shrink-0"
                                    title="Edit Profil & Jabatan"
                                    aria-label={`Edit ${item.nama_lengkap}`}
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeletePengurus(item.id, item.nama_lengkap)}
                                    className="p-2 rounded-lg bg-white/80 text-slate-500 hover:text-rose-600 hover:bg-white border border-slate-200/70 transition shrink-0"
                                    title="Hapus Pengurus"
                                    aria-label={`Hapus ${item.nama_lengkap}`}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================
          TAB 2: BAGAN STRUKTUR KEPENGURUSAN
          - KOP LEMBAGA DI PALING ATAS
          - JUDUL "STRUKTUR KEPENGURUSAN" DI BAWAH KOP & DI ATAS PENGASUH
          - HALAMAN 1 PDF: PIMPINAN + 10 DIVISI | HALAMAN 2 PDF: MUSYRIF KAMAR
      ============================================================ */}
      {activeTab === "bagan" && (
        <div
          id="printable-bagan-area"
          className="bg-white rounded-2xl border border-slate-200/80 p-6 md:p-8 shadow-sm space-y-5 print:space-y-2"
        >
          {/* 1. KOP LEMBAGA RESMI */}
          <div className="border-b-2 border-slate-800 pb-3.5 print:pb-1.5">
            <div className="flex items-center justify-center gap-4">
              {pengaturan.logo_url && (
                <img
                  src={pengaturan.logo_url}
                  alt="Logo Pondok"
                  className="w-14 h-14 print:w-9 print:h-9 object-contain shrink-0"
                />
              )}
              <div className="text-center">
                <h2 className="text-lg md:text-xl print:text-sm font-extrabold text-slate-900 tracking-wide uppercase">
                  {pengaturan.nama_pesantren}
                </h2>
                <p className="text-xs print:text-[9px] text-slate-600 mt-0.5">
                  {pengaturan.alamat_lengkap}
                </p>
              </div>
            </div>
          </div>

          {/* 2. JUDUL STRUKTUR KEPENGURUSAN (DI BAWAH KOP, DI ATAS PENGASUH PONDOK) */}
          <div className="text-center pt-1 print:pt-0">
            <h3 className="text-base md:text-lg print:text-xs font-extrabold text-slate-800 uppercase tracking-wider">
              STRUKTUR KEPENGURUSAN
            </h3>
            <div className="mt-1 print:mt-0.5 inline-flex items-center px-3 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs print:text-[8.5px] font-bold">
              Masa Khidmat {masaKhidmat}
            </div>
          </div>

          {/* TINGKAT 1, 2, 3: HIERARKI PIMPINAN TERTINGGI (VERTIKAL TERHUBUNG) */}
          <div className="flex flex-col items-center print-avoid-break">
            {/* TINGKAT 1: PENGASUH PONDOK (TANPA IKON PENSIL) */}
            {strukturBagan.pengasuhList.length > 0 ? (
              <div className="flex flex-wrap justify-center gap-3 w-full max-w-4xl">
                {strukturBagan.pengasuhList.map((item, idx) => (
                  <div
                    key={`${item.pengurus.id}-pengasuh-${idx}`}
                    className="w-full max-w-md print:max-w-xs rounded-2xl print:rounded-xl bg-amber-900 text-white p-3.5 print:py-1.5 print:px-3 shadow-md border-2 border-amber-500 flex items-center justify-center gap-3"
                  >
                    {item.pengurus.foto_url && (
                      <img
                        src={item.pengurus.foto_url}
                        alt={item.pengurus.nama_lengkap}
                        className="w-11 h-11 print:w-6 print:h-6 rounded-full object-cover border-2 border-amber-300 shrink-0"
                      />
                    )}
                    <div className="text-center">
                      <div className="inline-flex items-center gap-1.5 text-[10px] print:text-[7.5px] font-bold uppercase tracking-widest text-amber-200">
                        <Crown className="w-3.5 h-3.5 print:w-2.5 print:h-2.5" />
                        Pengasuh Pondok
                      </div>
                      <p className="text-base md:text-lg print:text-xs font-extrabold mt-0.5">
                        {item.pengurus.nama_lengkap}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="w-full max-w-md print:max-w-xs rounded-2xl print:rounded-xl bg-amber-900 text-white p-3.5 print:py-1.5 print:px-3 text-center shadow-md border-2 border-amber-500">
                <div className="inline-flex items-center gap-1.5 text-[10px] print:text-[7.5px] font-bold uppercase tracking-widest text-amber-200">
                  <Crown className="w-3.5 h-3.5 print:w-2.5 print:h-2.5" />
                  Pengasuh Pondok
                </div>
                <p className="text-base md:text-lg print:text-xs font-extrabold mt-0.5">
                  {pengaturan.nama_pengasuh || "Dr. KH. A. Fahrur Rozi"}
                </p>
              </div>
            )}

            {/* Garis Penghubung 1 -> 2 */}
            <div className="w-0.5 h-5 print-connector bg-slate-400" />

            {/* TINGKAT 2: DEWAN PENGASUH (DZURRIYAH) */}
            {strukturBagan.dewanPengasuhList.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 print-grid-2 gap-3 w-full max-w-3xl">
                {strukturBagan.dewanPengasuhList.map((item, idx) => (
                  <div
                    key={`${item.pengurus.id}-dzurriyah-${idx}`}
                    className="rounded-2xl print:rounded-xl bg-indigo-900 text-white p-3 print:py-1.5 print:px-3 shadow-sm border border-indigo-400 flex items-center justify-center gap-2.5"
                  >
                    {item.pengurus.foto_url && (
                      <img
                        src={item.pengurus.foto_url}
                        alt={item.pengurus.nama_lengkap}
                        className="w-10 h-10 print:w-6 print:h-6 rounded-full object-cover border border-indigo-300 shrink-0"
                      />
                    )}
                    <div className="text-center min-w-0">
                      <div className="inline-flex items-center gap-1 text-[10px] print:text-[7.5px] font-bold uppercase tracking-widest text-indigo-200">
                        <ShieldCheck className="w-3.5 h-3.5 print:w-2.5 print:h-2.5" />
                        Dewan Pengasuh (Dzurriyah)
                      </div>
                      <p className="text-sm md:text-base print:text-[10.5px] font-bold mt-0.5 truncate">
                        {item.pengurus.nama_lengkap}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="w-full max-w-md print:max-w-xs rounded-2xl print:rounded-xl bg-indigo-900 text-white p-3 print:py-1.5 print:px-3 text-center shadow-sm border border-indigo-400">
                <div className="inline-flex items-center gap-1.5 text-[10px] print:text-[7.5px] font-bold uppercase tracking-widest text-indigo-200">
                  <ShieldCheck className="w-3.5 h-3.5 print:w-2.5 print:h-2.5" />
                  Dewan Pengasuh (Dzurriyah)
                </div>
                <p className="text-sm md:text-base print:text-[10.5px] font-bold mt-0.5">
                  Agus Hasan Al-Wafa
                </p>
              </div>
            )}

            {/* Garis Penghubung 2 -> 3 */}
            <div className="w-0.5 h-5 print-connector bg-slate-400" />

            {/* TINGKAT 3: DIREKTUR PENDIDIKAN */}
            {strukturBagan.direkturList.length > 0 ? (
              <div className="flex flex-wrap justify-center gap-3 w-full max-w-3xl">
                {strukturBagan.direkturList.map((item, idx) => (
                  <div
                    key={`${item.pengurus.id}-direktur-${idx}`}
                    className="w-full max-w-md print:max-w-xs rounded-2xl print:rounded-xl bg-sky-900 text-white p-3 print:py-1.5 print:px-3 shadow-sm border border-sky-400 flex items-center justify-center gap-2.5"
                  >
                    {item.pengurus.foto_url && (
                      <img
                        src={item.pengurus.foto_url}
                        alt={item.pengurus.nama_lengkap}
                        className="w-10 h-10 print:w-6 print:h-6 rounded-full object-cover border border-sky-300 shrink-0"
                      />
                    )}
                    <div className="text-center min-w-0">
                      <div className="inline-flex items-center gap-1.5 text-[10px] print:text-[7.5px] font-bold uppercase tracking-widest text-sky-200">
                        <GraduationCap className="w-3.5 h-3.5 print:w-2.5 print:h-2.5" />
                        Direktur Pendidikan
                      </div>
                      <p className="text-sm md:text-base print:text-[10.5px] font-bold mt-0.5">
                        {item.pengurus.nama_lengkap}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="w-full max-w-md print:max-w-xs rounded-2xl print:rounded-xl bg-sky-900 text-white p-3 print:py-1.5 print:px-3 text-center shadow-sm border border-sky-400">
                <div className="inline-flex items-center gap-1.5 text-[10px] print:text-[7.5px] font-bold uppercase tracking-widest text-sky-200">
                  <GraduationCap className="w-3.5 h-3.5 print:w-2.5 print:h-2.5" />
                  Direktur Pendidikan
                </div>
                <p className="text-sm md:text-base print:text-[10.5px] font-bold mt-0.5">
                  Ust. Muhammad Nasta&apos;inul Khoiri
                </p>
              </div>
            )}

            {/* Garis Penghubung 3 -> 4 */}
            <div className="w-0.5 h-5 print-connector bg-slate-400" />
          </div>

          {/* TINGKAT 4: DEWAN HARIAN (SUSUNAN KOLOM 1-2, 3-4, 5-6) */}
          <div className="rounded-2xl print:rounded-xl border-2 border-emerald-700/40 bg-emerald-50/40 overflow-hidden print-avoid-break">
            <div className="bg-emerald-800 text-white px-4 py-2 print-header-pad flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs print:text-[9px] font-bold uppercase tracking-wider">
                <Building2 className="w-4 h-4 print:w-3 print:h-3 text-emerald-200" />
                Dewan Harian Pondok Pesantren
              </div>
              <span className="text-[11px] print:text-[8px] bg-emerald-700 px-2.5 py-0.5 rounded-full font-semibold">
                6 Posisi Inti
              </span>
            </div>

            <div className="p-3.5 print:p-1.5 grid grid-cols-1 md:grid-cols-3 print-grid-3 gap-3.5">
              {strukturBagan.dewanHarianPairs.map((pair, colIdx) => (
                <div key={colIdx} className="flex flex-col">
                  {/* Posisi Atas (1, 3, 5) */}
                  {renderDewanHarianCard(pair.topSlot)}

                  {/* Garis Penghubung Vertikal Pimpinan -> Wakil */}
                  <div className="flex justify-center">
                    <div className="w-0.5 h-2.5 print:h-1 bg-emerald-500/70" />
                  </div>

                  {/* Posisi Bawah (2, 4, 6) */}
                  {renderDewanHarianCard(pair.bottomSlot)}
                </div>
              ))}
            </div>
          </div>

          {/* Garis Penghubung 4 -> 5 */}
          <div className="flex flex-col items-center">
            <div className="w-0.5 h-4 print-connector bg-slate-400" />
            <div className="w-full h-0.5 bg-slate-300 rounded-full" />
          </div>

          {/* TINGKAT 5A: JAJARAN 10 DIVISI / SIE (TETAP DI HALAMAN 1 PDF) */}
          <div className="space-y-2.5 print:space-y-1">
            <div className="flex items-center gap-2 text-xs print:text-[9px] font-bold uppercase tracking-wider text-teal-900">
              <UserCheck className="w-4 h-4 print:w-3 print:h-3 text-teal-700" />
              Jajaran Divisi & Seksi Pelaksana (10 Divisi)
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 print-grid-3 gap-3.5 items-stretch">
              {strukturBagan.divisiCards.map((divCard) => (
                <div
                  key={divCard.namaDivisi}
                  className="rounded-xl border border-teal-200 bg-white overflow-hidden shadow-2xs flex flex-col h-full print-avoid-break"
                >
                  <div className="bg-teal-800 text-white px-3.5 py-2 print-header-pad flex items-center justify-between">
                    <h3 className="text-xs print:text-[9px] font-bold tracking-wide">
                      {divCard.namaDivisi}
                    </h3>
                    <span className="text-[11px] print:text-[7.5px] font-bold bg-teal-700 px-2 py-0.5 rounded-full">
                      {divCard.members.length}
                    </span>
                  </div>

                  <div className="p-3 print:p-1.5 flex-1 flex flex-col justify-start space-y-2 print:space-y-1">
                    {divCard.members.length === 0 ? (
                      <div className="flex-1 flex items-center justify-center py-3 print:py-1 text-xs print:text-[8px] italic text-slate-400">
                        Belum ada personel ditugaskan
                      </div>
                    ) : (
                      divCard.members.map((m, idx) => {
                        const isKoord = m.urutan_struktur === 1;
                        return (
                          <div
                            key={`${m.pengurus.id}-${idx}`}
                            className={`flex items-center gap-2 p-2 print:py-0.5 print:px-1.5 rounded-lg border ${
                              isKoord
                                ? "bg-teal-50/80 border-teal-200"
                                : "bg-slate-50/70 border-slate-100"
                            }`}
                          >
                            {m.pengurus.foto_url ? (
                              <img
                                src={m.pengurus.foto_url}
                                alt={m.pengurus.nama_lengkap}
                                className="w-8 h-8 print:w-5 print:h-5 rounded-full object-cover border border-slate-200 shrink-0"
                              />
                            ) : (
                              <div className="w-8 h-8 print:w-5 print:h-5 rounded-full bg-teal-100 text-teal-800 font-bold text-[10px] print:text-[7px] flex items-center justify-center shrink-0">
                                {getInitials(m.pengurus.nama_lengkap)}
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              <span
                                className={`inline-block text-[9.5px] print:text-[7px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded leading-none ${
                                  isKoord
                                    ? "bg-teal-700 text-white"
                                    : "bg-slate-200/90 text-slate-700"
                                }`}
                              >
                                {m.cleanRole}
                              </span>
                              <p className="text-xs print:text-[9px] font-bold text-slate-800 truncate mt-0.5 leading-tight">
                                {m.pengurus.nama_lengkap}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* TINGKAT 5B: BLOK KHUSUS MUSYRIF KAMAR (OTOMATIS KE HALAMAN 2 SAAT CETAK PDF) */}
          <div className="print-page-2 space-y-2.5">
            {/* Header Lampiran Khusus Muncul di Halaman 2 Saat Cetak PDF */}
            <div className="hidden print:flex items-center justify-between border-b-2 border-slate-800 pb-1.5 mb-2">
              <div>
                <p className="text-[10px] font-extrabold text-slate-900 uppercase tracking-wide">
                  LAMPIRAN STRUKTUR KEPENGURUSAN — {pengaturan.nama_pesantren}
                </p>
                <p className="text-[8px] text-slate-500">
                  Jajaran Musyrif Kamar Santri • Masa Khidmat {masaKhidmat}
                </p>
              </div>
              <span className="text-[8px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300">
                Halaman 2
              </span>
            </div>

            <div className="rounded-xl border border-slate-300 bg-white overflow-hidden shadow-2xs">
              <div className="bg-slate-800 text-white px-4 py-2 print:py-1.5 print:px-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs print:text-[9.5px] font-bold uppercase tracking-wider">
                  <DoorOpen className="w-4 h-4 print:w-3.5 print:h-3.5 text-slate-300" />
                  Jajaran Musyrif Kamar (Sesuai Data Kamar Santri)
                </div>
                <span className="text-[11px] print:text-[8.5px] font-bold bg-slate-700 px-2.5 py-0.5 rounded-full">
                  {strukturBagan.musyrifAssignments.length} Musyrif
                </span>
              </div>

              <div className="p-3.5 print:p-2.5">
                {strukturBagan.musyrifAssignments.length === 0 ? (
                  <p className="text-center py-3 text-xs print:text-[9px] italic text-slate-400">
                    Belum ada Musyrif Kamar yang ditugaskan.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 print-grid-4 gap-2.5">
                    {strukturBagan.musyrifAssignments.map((m, idx) => (
                      <div
                        key={`${m.pengurus.id}-musyrif-${idx}`}
                        className="flex items-center gap-2.5 p-2.5 print:py-1.5 print:px-2 rounded-lg border border-slate-200 bg-slate-50/70 print-avoid-break"
                      >
                        {m.pengurus.foto_url ? (
                          <img
                            src={m.pengurus.foto_url}
                            alt={m.pengurus.nama_lengkap}
                            className="w-8 h-8 print:w-6 print:h-6 rounded-full object-cover border border-slate-200 shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 print:w-6 print:h-6 rounded-full bg-slate-200 text-slate-800 font-bold text-[10px] print:text-[8px] flex items-center justify-center shrink-0">
                            {getInitials(m.pengurus.nama_lengkap)}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <span className="inline-block text-[9.5px] print:text-[8px] font-bold text-slate-700 bg-slate-200/80 px-1.5 py-0.5 rounded leading-none">
                            {m.nama_jabatan}
                          </span>
                          <p className="text-xs print:text-[10px] font-bold text-slate-800 truncate mt-0.5 leading-tight">
                            {m.pengurus.nama_lengkap}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          MODAL TAMBAH / EDIT PENGURUS
      ============================================================ */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header Modal */}
            <div className="bg-emerald-800 text-white px-6 py-4 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-bold">
                  {editingId ? "Edit Profil & Jabatan Pengurus" : "Tambah Pengurus Baru"}
                </h3>
                <p className="text-xs text-emerald-200 mt-0.5">
                  1 pengurus cukup diinput satu kali meski merangkap beberapa jabatan.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-emerald-200 hover:text-white hover:bg-emerald-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body Form Modal */}
            <form onSubmit={handleSavePengurus} className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Foto & Identitas Dasar */}
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <div className="flex flex-col items-center gap-2 shrink-0">
                  {fotoUrl ? (
                    <img
                      src={fotoUrl}
                      alt="Foto Profil"
                      className="w-20 h-20 rounded-2xl object-cover border-2 border-emerald-200"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-2xl bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-xs text-center p-2">
                      Foto Profil
                    </div>
                  )}
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition">
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingFoto ? "Mengunggah..." : "Upload Foto"}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleUploadFile(e, "foto")}
                      className="hidden"
                      disabled={uploadingFoto}
                    />
                  </label>
                </div>

                <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nama Lengkap & Gelar <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: Dr. KH. A. Fahrur Rozi"
                      value={namaLengkap}
                      onChange={(e) => setNamaLengkap(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      No. WhatsApp
                    </label>
                    <input
                      type="text"
                      placeholder="08xxxxxxxxxx"
                      value={noWa}
                      onChange={(e) => setNoWa(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>

                  {canViewBisyaroh && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Nominal Bisyaroh / Bulan (Rp)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={5000}
                        value={nominalBisyaroh}
                        onChange={(e) => setNominalBisyaroh(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Status Kepengurusan
                    </label>
                    <select
                      value={statusPengurus}
                      onChange={(e) => setStatusPengurus(e.target.value as "aktif" | "nonaktif" | "boyong")}
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    >
                      <option value="aktif">Aktif</option>
                      <option value="nonaktif">Nonaktif</option>
                      <option value="boyong">Boyong</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Masa Khidmat
                    </label>
                    <select
                      value={formMasaKhidmat}
                      onChange={(e) => setFormMasaKhidmat(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    >
                      {masaKhidmatOptions.map((mk) => (
                        <option key={mk} value={mk}>
                          {mk}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Daftar Jabatan / Rangkap Amanah */}
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Daftar Amanah / Jabatan
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Pilih jabatan utama, lalu klik tambah jika merangkap amanah lain.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addJabatanRow}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold hover:bg-emerald-100 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Tambah Jabatan
                  </button>
                </div>

                <div className="space-y-3">
                  {jabatanFormList.map((jab, index) => {
                    const isMusyrif = jab.divisi === "Musyrif Kamar";
                    const isDewanHarian = jab.divisi === "Dewan Harian";
                    const isDivisiSie = isTenDivisi(jab.divisi);
                    const isFixedTopRole =
                      jab.divisi === "Pengasuh Pondok" ||
                      jab.divisi === "Dewan Pengasuh (Dzurriyah)" ||
                      jab.divisi === "Direktur Pendidikan";

                    const selectedKamar = isMusyrif
                      ? extractKamarName(jab.nama_jabatan) || kamarOptions[0] || "A1"
                      : "";

                    return (
                      <div
                        key={index}
                        className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                          {/* Divisi / Bagian */}
                          <div className="sm:col-span-5">
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              Divisi / Bagian
                            </label>
                            <select
                              value={jab.divisi}
                              onChange={(e) => handleDivisiChange(index, e.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                            >
                              {DIVISI_OPTIONS.map((div) => (
                                <option key={div} value={div}>
                                  {div}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Nama Jabatan (Dinamis sesuai Divisi) */}
                          <div className="sm:col-span-5">
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              {isMusyrif
                                ? "Pilih Kamar Santri"
                                : isDivisiSie
                                ? "Posisi dalam Seksi"
                                : "Nama Jabatan"}
                            </label>

                            {isMusyrif ? (
                              <select
                                value={selectedKamar}
                                onChange={(e) => handleJabatanChange(index, e.target.value)}
                                className="w-full rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                              >
                                {kamarOptions.map((km) => (
                                  <option key={km} value={km}>
                                    Kamar {km}
                                  </option>
                                ))}
                              </select>
                            ) : isDewanHarian ? (
                              <select
                                value={jab.nama_jabatan}
                                onChange={(e) => handleJabatanChange(index, e.target.value)}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                              >
                                {DEWAN_HARIAN_POSITIONS.map((pos) => (
                                  <option key={pos} value={pos}>
                                    {pos}
                                  </option>
                                ))}
                              </select>
                            ) : isFixedTopRole ? (
                              <input
                                type="text"
                                readOnly
                                value={jab.divisi}
                                className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600"
                              />
                            ) : isDivisiSie && !jab.isCustomRole ? (
                              <select
                                value={jab.nama_jabatan}
                                onChange={(e) => handleJabatanChange(index, e.target.value)}
                                className="w-full rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                              >
                                {DIVISI_ROLE_PRESETS.map((role) => (
                                  <option key={role} value={role}>
                                    {role}
                                  </option>
                                ))}
                                <option value="__CUSTOM__">
                                  + Lainnya (Tulis Manual)...
                                </option>
                              </select>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  required
                                  placeholder="Contoh: PJ Administrasi"
                                  value={jab.nama_jabatan}
                                  onChange={(e) => handleJabatanChange(index, e.target.value)}
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                                />
                                {isDivisiSie && (
                                  <button
                                    type="button"
                                    onClick={() => resetCustomRoleToPreset(index)}
                                    className="p-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-emerald-700"
                                    title="Kembali ke pilihan standar"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Urutan Bagan */}
                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              Urutan
                            </label>
                            <select
                              value={jab.urutan_struktur}
                              onChange={(e) =>
                                setJabatanFormList((prev) =>
                                  prev.map((r, i) =>
                                    i === index
                                      ? { ...r, urutan_struktur: Number(e.target.value) }
                                      : r
                                  )
                                )
                              }
                              className="w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                            >
                              <option value={1}>1 (Utama/Koord)</option>
                              <option value={2}>2 (Wakil/Ke-2)</option>
                              <option value={3}>3</option>
                              <option value={4}>4</option>
                              <option value={5}>5</option>
                              <option value={6}>6</option>
                              <option value={7}>7</option>
                              <option value={8}>8</option>
                              <option value={9}>9</option>
                              <option value={10}>10 (Anggota)</option>
                            </select>
                          </div>
                        </div>

                        {/* Bar Bawah Row Jabatan: Utama & Hapus */}
                        <div className="flex items-center justify-between pt-1">
                          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                            <input
                              type="radio"
                              name="jabatan_utama"
                              checked={jab.is_utama}
                              onChange={() => setUtamaJabatan(index)}
                              className="text-emerald-700 focus:ring-emerald-600"
                            />
                            Jabatan Utama
                          </label>

                          {jabatanFormList.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeJabatanRow(index)}
                              className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 font-medium"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Hapus Baris
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Alamat Asal & TTD Digital */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Alamat Asal
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Alamat asal pengurus..."
                    value={alamatAsal}
                    onChange={(e) => setAlamatAsal(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                <div className="space-y-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      TTD Digital Pengurus (Opsional - PNG)
                    </label>
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 transition">
                        <Upload className="w-3.5 h-3.5" />
                        {uploadingTtd ? "Mengunggah..." : "Upload TTD (.png)"}
                        <input
                          type="file"
                          accept="image/png,image/*"
                          onChange={(e) => handleUploadFile(e, "ttd")}
                          className="hidden"
                          disabled={uploadingTtd}
                        />
                      </label>
                      {ttdUrl && (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium">
                          <CheckCircle2 className="w-4 h-4" /> Terpasang
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <input
                      type="text"
                      placeholder="Catatan tambahan (opsional)..."
                      value={catatan}
                      onChange={(e) => setCatatan(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                </div>
              </div>

              {/* Footer Tombol Simpan */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 disabled:opacity-60 shadow-sm transition"
                >
                  {saving ? "Menyimpan..." : "Simpan Data Pengurus"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================
          MODAL MANAJEMEN AKUN LOGIN TERPUSAT (TANPA LOGOUT ADMIN)
      ============================================================ */}
      {accountTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 no-print">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-emerald-800 text-white px-5 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <UserCog className="w-5 h-5 text-emerald-200 shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-sm font-bold">Kelola Akun Login Pengurus</h3>
                  <p className="text-[11px] text-emerald-200 truncate">
                    {accountTarget.nama_lengkap}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAccountTarget(null)}
                className="p-1.5 rounded-lg text-emerald-200 hover:text-white hover:bg-emerald-700 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Status Akun:</span>
                  <strong className={accountTarget.auth_user_id ? "text-emerald-700" : "text-amber-700"}>
                    {accountTarget.auth_user_id ? "Aktif / Terhubung" : "Belum Memiliki Akun"}
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Status Pengurus:</span>
                  <strong className="uppercase text-slate-800">{accountTarget.status}</strong>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Username Login
                  </label>
                  <input
                    type="text"
                    value={accountUsername}
                    onChange={(e) => setAccountUsername(normalizeUsername(e.target.value))}
                    placeholder="misal: ahmad.zaini"
                    className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Password Sementara (min 6)
                  </label>
                  <input
                    type="text"
                    value={accountTempPassword}
                    onChange={(e) => setAccountTempPassword(e.target.value)}
                    placeholder={`Contoh: ${dynamicYearHint}`}
                    className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-500 -mt-2">
                Saat login pertama kali, pengurus wajib mengganti password sementara di menu Profil Saya.
              </p>

              {/* HANYA ADMIN UTAMA (SUPER ADMIN): Pengaturan Hak Akses Modul (Full Access) */}
              {isSuperAdmin && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-700" />
                        Pengaturan Hak Akses Modul (Full Access)
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Modul tercentang terbuka penuh; sisanya otomatis View Only.
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const allKeys = new Set<string>();
                          MODULE_PERMISSION_GROUPS.forEach((g) => g.modules.forEach((m) => allKeys.add(m)));
                          setAccountModules(allKeys);
                        }}
                        className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Pilih Semua
                      </button>
                      <button
                        type="button"
                        onClick={() => setAccountModules(new Set())}
                        className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Kosongkan
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-60 overflow-y-auto pr-1">
                    {MODULE_PERMISSION_GROUPS.map((grp) => {
                      const checked = grp.modules.every((m) => accountModules.has(m));
                      return (
                        <label
                          key={grp.key}
                          className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 cursor-pointer transition text-[11px] ${
                            checked
                              ? "bg-white border-emerald-400 text-slate-900 font-semibold shadow-2xs"
                              : "bg-white/60 border-slate-200 text-slate-600"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePermissionGroup(grp.modules)}
                            className="w-4 h-4 accent-emerald-700 rounded shrink-0"
                          />
                          <span className="leading-tight">{grp.label}</span>
                        </label>
                      );
                    })}
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      disabled={accountSaving}
                      onClick={() => void handleSaveModulePermissions()}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs disabled:opacity-60 inline-flex items-center gap-1.5"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {accountSaving ? "Menyimpan..." : "Simpan Hak Akses Modul"}
                    </button>
                  </div>
                </div>
              )}

              {accountFeedback && (
                <div
                  className={`p-3 rounded-xl border text-xs ${
                    accountFeedback.type === "ok"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                      : "bg-rose-50 border-rose-200 text-rose-900"
                  }`}
                >
                  {accountFeedback.msg}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAccountTarget(null)}
                  className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Tutup
                </button>
                {accountTarget.auth_user_id && (
                  <button
                    type="button"
                    disabled={accountSaving}
                    onClick={() => handleAccountAction("reset_password")}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold disabled:opacity-60"
                  >
                    {accountSaving ? "Memproses..." : "Reset Password"}
                  </button>
                )}
                <button
                  type="button"
                  disabled={accountSaving}
                  onClick={() => handleAccountAction("create_account")}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold disabled:opacity-60"
                >
                  {accountSaving
                    ? "Menyimpan..."
                    : accountTarget.auth_user_id
                    ? "Simpan / Perbarui Akun"
                    : "Buat Akun Login"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}