'use client';

import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  CalendarDays,
  Check,
  CheckSquare,
  FileSpreadsheet,
  FileText,
  HeartPulse,
  Home,
  LayoutGrid,
  Menu,
  Package,
  RotateCcw,
  Settings,
  ShieldAlert,
  Shirt,
  Smartphone,
  UserCheck,
  UserPlus,
  Users,
  Utensils,
  Wallet,
  X,
} from 'lucide-react';
import {
  DEFAULT_MENU_CEPAT_IDS,
  DEFAULT_MOBILE_NAV_HREFS,
  QUICK_MENU_CATALOG,
  type QuickMenuCatalogItem,
} from '@/lib/pengaturan';

export function renderQuickMenuIcon(
  iconKey: QuickMenuCatalogItem['iconKey'],
  className = 'w-5 h-5'
): React.ReactNode {
  switch (iconKey) {
    case 'home':
      return <Home className={className} />;
    case 'users':
      return <Users className={className} />;
    case 'user-plus':
      return <UserPlus className={className} />;
    case 'user-check':
      return <UserCheck className={className} />;
    case 'wallet':
      return <Wallet className={className} />;
    case 'check-square':
      return <CheckSquare className={className} />;
    case 'file-text':
      return <FileText className={className} />;
    case 'shield-alert':
      return <ShieldAlert className={className} />;
    case 'heart-pulse':
      return <HeartPulse className={className} />;
    case 'utensils':
      return <Utensils className={className} />;
    case 'package':
      return <Package className={className} />;
    case 'calendar-days':
      return <CalendarDays className={className} />;
    case 'calendar':
      return <Calendar className={className} />;
    case 'shirt':
      return <Shirt className={className} />;
    case 'file-spreadsheet':
      return <FileSpreadsheet className={className} />;
    case 'settings':
      return <Settings className={className} />;
    default:
      return <LayoutGrid className={className} />;
  }
}

interface QuickMenuConfigModalProps {
  open: boolean;
  initialMenuIds: string[];
  initialMobileHrefs: string[];
  initialTab?: 'beranda' | 'mobile';
  saving?: boolean;
  onClose: () => void;
  onSave: (menuIds: string[], mobileHrefs: string[]) => Promise<void> | void;
}

export default function QuickMenuConfigModal({
  open,
  initialMenuIds,
  initialMobileHrefs,
  initialTab = 'beranda',
  saving = false,
  onClose,
  onSave,
}: QuickMenuConfigModalProps) {
  const [activeTab, setActiveTab] = useState<'beranda' | 'mobile'>(initialTab);
  const [selectedMenuIds, setSelectedMenuIds] = useState<string[]>(
    initialMenuIds.length > 0 ? initialMenuIds : DEFAULT_MENU_CEPAT_IDS
  );
  const [mobileSlots, setMobileSlots] = useState<string[]>(
    initialMobileHrefs.length === 4 ? initialMobileHrefs : DEFAULT_MOBILE_NAV_HREFS
  );

  if (!open) return null;

  const toggleMenuId = (id: string) => {
    setSelectedMenuIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 2) return prev;
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= 12) return prev;
      return [...prev, id];
    });
  };

  const moveMenuId = (idx: number, dir: 'up' | 'down') => {
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= selectedMenuIds.length) return;
    setSelectedMenuIds((prev) => {
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const updateMobileSlot = (slotIdx: number, nextHref: string) => {
    setMobileSlots((prev) => {
      const next = [...prev];
      const existingIdx = next.indexOf(nextHref);
      if (existingIdx >= 0 && existingIdx !== slotIdx) {
        // Tukar posisi agar semua 4 slot tetap unik
        next[existingIdx] = next[slotIdx];
      }
      next[slotIdx] = nextHref;
      return next;
    });
  };

  const handleReset = () => {
    setSelectedMenuIds([...DEFAULT_MENU_CEPAT_IDS]);
    setMobileSlots([...DEFAULT_MOBILE_NAV_HREFS]);
  };

  const handleSave = async () => {
    await onSave(selectedMenuIds, mobileSlots);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              Atur Menu Cepat & Navigasi HP
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Sesuaikan pintasan Beranda dan 4 tombol Bottom Bar di HP Anda.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pengaturan menu"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 sm:px-6 pt-3 border-b border-slate-200 flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('beranda')}
            className={`px-3 py-2 text-xs sm:text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'beranda'
                ? 'border-emerald-700 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            Menu Cepat Beranda ({selectedMenuIds.length}/12)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('mobile')}
            className={`px-3 py-2 text-xs sm:text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'mobile'
                ? 'border-emerald-700 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            Bottom Nav HP (4 Slot)
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'beranda' ? (
            <>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="text-xs font-bold text-slate-700 mb-2">
                  Urutan Pintasan Terpilih (ditampilkan di Beranda):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedMenuIds.map((id, idx) => {
                    const item = QUICK_MENU_CATALOG.find((c) => c.id === id);
                    if (!item) return null;
                    return (
                      <div
                        key={id}
                        className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-medium text-slate-700 shadow-xs"
                      >
                        <span className="text-slate-400 tabular-nums">{idx + 1}.</span>
                        <span>{item.shortLabel}</span>
                        <button
                          type="button"
                          onClick={() => moveMenuId(idx, 'up')}
                          disabled={idx === 0}
                          className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                          title="Geser kiri"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveMenuId(idx, 'down')}
                          disabled={idx === selectedMenuIds.length - 1}
                          className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                          title="Geser kanan"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {QUICK_MENU_CATALOG.filter((item) => item.id !== 'beranda').map((item) => {
                  const checked = selectedMenuIds.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleMenuId(item.id)}
                      className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border text-left transition-colors ${
                        checked
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-900'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={checked ? 'text-emerald-700' : 'text-slate-500'}>
                          {renderQuickMenuIcon(item.iconKey, 'w-4 h-4 shrink-0')}
                        </span>
                        <span className="text-xs font-semibold truncate">{item.label}</span>
                      </div>
                      {checked && <Check className="w-4 h-4 text-emerald-700 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-900">
                Pengaturan Bottom Navigation disimpan khusus di perangkat/browser ini agar tiap pengurus bisa memprioritaskan divisi yang paling sering dibuka. Slot ke-5 selalu tombol <strong>Menu</strong> lengkap.
              </div>

              {/* Preview Bottom Nav HP */}
              <div>
                <p className="text-xs font-bold text-slate-700 mb-2">Pratinjau Bottom Bar HP:</p>
                <div className="grid grid-cols-5 border border-slate-200 rounded-xl bg-white py-2 px-1 shadow-xs">
                  {mobileSlots.map((href, idx) => {
                    const found =
                      QUICK_MENU_CATALOG.find((c) => c.href === href) || QUICK_MENU_CATALOG[0];
                    return (
                      <div
                        key={`${href}-${idx}`}
                        className={`flex flex-col items-center justify-center py-1 ${
                          idx === 0 ? 'text-emerald-700 font-bold' : 'text-slate-500 font-medium'
                        }`}
                      >
                        {renderQuickMenuIcon(found.iconKey, 'w-4 h-4')}
                        <span className="text-[10px] mt-1 truncate max-w-[60px]">
                          {found.shortLabel}
                        </span>
                      </div>
                    );
                  })}
                  <div className="flex flex-col items-center justify-center py-1 text-slate-500 font-medium border-l border-slate-100">
                    <Menu className="w-4 h-4" />
                    <span className="text-[10px] mt-1">Menu</span>
                  </div>
                </div>
              </div>

              {/* 4 Slot Dropdown */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[0, 1, 2, 3].map((slotIdx) => (
                  <div key={slotIdx} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Slot {slotIdx + 1} {slotIdx === 0 ? '(Utama)' : ''}
                    </label>
                    <select
                      value={mobileSlots[slotIdx]}
                      onChange={(e) => updateMobileSlot(slotIdx, e.target.value)}
                      className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg font-medium text-slate-800 outline-none focus:ring-2 focus:ring-emerald-600"
                    >
                      {QUICK_MENU_CATALOG.map((opt) => (
                        <option key={opt.href} value={opt.href}>
                          {opt.label} ({opt.shortLabel})
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-4 sm:px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Default
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold text-slate-600 border border-slate-300 bg-white hover:bg-slate-100"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-xs sm:text-sm font-bold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60"
            >
              {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
