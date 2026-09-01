import React, { useState, useMemo, useEffect, useCallback } from "react";
import { usePosStore } from "../../store/posStore";
import { db, OrderRepository } from "@jamanvaar/database";
import { DiningTable } from "@jamanvaar/types";
import { sound } from "@jamanvaar/ui";
import { PosTableDrawer } from "./PosTableDrawer";
import {
  LayoutGrid,
  Users,
  CheckCircle2,
  CreditCard,
  Calendar,
  ChevronRight,
  Settings,
  AlertTriangle,
  QrCode
} from "lucide-react";

const STATUS_STYLES: Record<string, { border: string; badge: string }> = {
  AVAILABLE: {
    border: "border-emerald-300 hover:border-emerald-500",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-300"
  },
  OCCUPIED: {
    border: "border-[#0B253A]/40 hover:border-[#0B253A]",
    badge: "bg-[#0B253A] text-white border-[#0B253A]"
  },
  BILL_REQUESTED: {
    border: "border-teal-400 hover:border-teal-600",
    badge: "bg-teal-600 text-white border-teal-600"
  },
  BILLING: {
    border: "border-violet-400 hover:border-violet-600",
    badge: "bg-violet-600 text-white border-violet-600"
  },
  RESERVED: {
    border: "border-purple-300 hover:border-purple-500",
    badge: "bg-purple-100 text-purple-800 border-purple-300"
  },
  CLEANING: {
    border: "border-amber-300 hover:border-amber-500",
    badge: "bg-amber-100 text-amber-700 border-amber-300"
  },
  BLOCKED: {
    border: "border-red-300 hover:border-red-500",
    badge: "bg-red-100 text-red-800 border-red-300"
  }
};

const defaultStyle = {
  border: "border-slate-200 hover:border-slate-400",
  badge: "bg-slate-200 text-slate-700 border-slate-300"
};

function getStyles(status: string) {
  return STATUS_STYLES[status] ?? defaultStyle;
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    AVAILABLE: "Available",
    OCCUPIED: "Occupied",
    BILL_REQUESTED: "Bill Requested",
    BILLING: "Billing",
    RESERVED: "Reserved",
    CLEANING: "Cleaning",
    BLOCKED: "Blocked"
  };
  return map[status] ?? status;
}

function computeStats(tables: DiningTable[]) {
  return {
    total: tables.length,
    available: tables.filter((t) => t.status === "AVAILABLE").length,
    occupied: tables.filter((t) => t.status === "OCCUPIED").length,
    billing: tables.filter((t) => t.status === "BILL_REQUESTED" || t.status === "BILLING").length,
    reserved: tables.filter((t) => t.status === "RESERVED").length,
    other: tables.filter((t) => t.status === "CLEANING" || t.status === "BLOCKED").length
  };
}

interface TableCardProps {
  table: DiningTable;
  onClick: (t: DiningTable) => void;
  onOpenTable: (e: React.MouseEvent, t: DiningTable) => void;
  onViewOrder: (e: React.MouseEvent, t: DiningTable) => void;
}

const TableCard: React.FC<TableCardProps> = React.memo(({ table, onClick, onOpenTable, onViewOrder }) => {
  const styles = getStyles(table.status);
  const activeOrder = table.currentOrderId ? OrderRepository.getOrderById(table.currentOrderId) : null;
  const isAvailable = table.status === "AVAILABLE";
  const isBillRequested = table.status === "BILL_REQUESTED";
  const isBilling = table.status === "BILLING" || table.status === "BILL_REQUESTED";
  const isReserved = table.status === "RESERVED";

  return (
    <div
      onClick={() => onClick(table)}
      className={`bg-white border-2 rounded-2xl p-4 flex flex-col justify-between transition-all duration-150 cursor-pointer shadow-xs hover:shadow-md active:scale-[0.98] min-h-[160px] ${styles.border}`}
    >
      <div className="flex items-start justify-between gap-1">
        <div>
          <span className="text-[10px] font-bold uppercase text-slate-400 block leading-tight">
            {table.zone || "Hall"}
          </span>
          <div className="flex items-center gap-2">
            <h3 className="text-xl sm:text-2xl font-black text-[#0B253A] leading-none mt-0.5">
              T-{table.tableNumber}
            </h3>
            {table.qrStatus === 'ACTIVE' && (
              <span className="text-[9px] font-black bg-amber-50 text-[#E66817] border border-[#FED7AA] px-1.5 py-0.2 rounded flex items-center gap-0.5" title="QR ordering active for this table">
                <QrCode className="w-2.5 h-2.5" />
                <span>QR</span>
              </span>
            )}
          </div>
        </div>
        <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border whitespace-nowrap ${styles.badge}`}>
          {statusLabel(table.status)}
        </span>
      </div>

      <div className="my-2 space-y-1">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>{table.capacity} Seater</span>
          {table.currentGuests != null && table.currentGuests > 0 && (
            <span className="text-[#0B253A] font-bold ml-1">· {table.currentGuests} guests</span>
          )}
        </div>

        {isAvailable && (
          <div className="flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
            <CheckCircle2 className="w-3 h-3" />
            <span>Vacant &amp; Ready</span>
          </div>
        )}
        {isReserved && (
          <div className="flex items-center gap-1 text-[11px] text-purple-600 font-semibold">
            <Calendar className="w-3 h-3" />
            <span>Reserved</span>
          </div>
        )}
        {isBillRequested && (
          <div className="flex items-center gap-1 text-[11px] text-teal-600 font-bold">
            <CreditCard className="w-3 h-3" />
            <span>Bill Requested</span>
          </div>
        )}
        {activeOrder && (
          <div className="pt-1.5 border-t border-slate-100 flex items-baseline justify-between">
            <span className="text-[10px] text-slate-400">Order:</span>
            <span className="font-mono font-extrabold text-sm text-[#0B253A]">
              Rs.{activeOrder.totalAmount ?? 0}
            </span>
          </div>
        )}
      </div>

      <div className="pt-1">
        {isAvailable ? (
          <button
            onClick={(e) => onOpenTable(e, table)}
            className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors active:scale-95"
          >
            + Open Table
          </button>
        ) : isBilling ? (
          <button
            onClick={(e) => onViewOrder(e, table)}
            className="w-full py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs transition-colors active:scale-95 flex items-center justify-center gap-1"
          >
            <CreditCard className="w-3 h-3" /> Open Bill
          </button>
        ) : (
          <button
            onClick={(e) => onViewOrder(e, table)}
            className="w-full py-2 rounded-xl bg-[#0B253A] hover:bg-[#1E3A4C] text-white font-bold text-xs shadow-xs transition-colors active:scale-95 flex items-center justify-center gap-1"
          >
            View Order <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
});

TableCard.displayName = "TableCard";

export const PosFloorPlan: React.FC = () => {
  const { setSelectedTable, setActiveTab } = usePosStore();

  // CRITICAL FIX: subscribe to db so component re-renders when tables/orders change
  const [, setTick] = useState(0);
  useEffect(() => {
    setTick((n) => n + 1); // force initial render after mount
    const unsub = db.subscribe(() => setTick((n) => n + 1));
    return unsub;
  }, []);

  const [selectedZone, setSelectedZone] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [activeDrawerTable, setActiveDrawerTable] = useState<DiningTable | null>(null);

  // Read directly from db on every render cycle (safe because subscription ticks cause re-render)
  const tables = db.tables.filter((t) => t.isActive !== false);

  const zones = useMemo(() => {
    const set = new Set<string>();
    tables.forEach((t) => { if (t.zone) set.add(t.zone); });
    return Array.from(set).sort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.length]);

  const filteredTables = useMemo(() => {
    return tables.filter((table) => {
      if (selectedZone !== "ALL" && table.zone !== selectedZone) return false;
      if (statusFilter !== "ALL") {
        if (statusFilter === "BILLING" && table.status !== "BILL_REQUESTED" && table.status !== "BILLING") return false;
        if (statusFilter !== "BILLING" && table.status !== statusFilter) return false;
      }
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables, selectedZone, statusFilter]);

  const stats = useMemo(() => computeStats(tables), [tables]);

  const handleTableClick = useCallback((table: DiningTable) => {
    sound.play('click');
    setActiveDrawerTable(table);
  }, []);

  const handleOpenTable = useCallback((e: React.MouseEvent, table: DiningTable) => {
    e.stopPropagation();
    sound.play('click');
    setSelectedTable(table);
    setActiveTab("MENU");
  }, [setSelectedTable, setActiveTab]);

  const handleViewOrder = useCallback((e: React.MouseEvent, table: DiningTable) => {
    e.stopPropagation();
    sound.play('click');
    setActiveDrawerTable(table);
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#FAF7F2] p-4 sm:p-6 overflow-hidden select-none">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4 shrink-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#0B253A] flex items-center gap-2">
            <LayoutGrid className="w-6 h-6 text-[#E66817]" />
            <span>Floor Plan &amp; Dining Tables</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitor real-time table occupancy, orders and billing.
          </p>
        </div>
        <button
          onClick={() => setActiveTab("SETTINGS")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#EBE6DD] text-xs font-bold text-slate-600 hover:bg-[#F5F0E8] transition-colors shadow-2xs"
        >
          <Settings className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Manage Tables</span>
        </button>
      </div>

      {/* Live Stat Counters (clickable as filters) */}
      <div className="flex items-center gap-2 flex-wrap mb-4 shrink-0">
        <button
          onClick={() => setStatusFilter("ALL")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs border ${statusFilter === "ALL" ? "bg-slate-800 text-white border-slate-800" : "bg-white border-[#EBE6DD] text-slate-600 hover:bg-slate-50"}`}
        >
          <span className="w-2 h-2 rounded-full bg-slate-400" /> All {stats.total}
        </button>
        <button
          onClick={() => setStatusFilter("AVAILABLE")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs border ${statusFilter === "AVAILABLE" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-[#EBE6DD] text-slate-600 hover:bg-emerald-50"}`}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500" /> Available {stats.available}
        </button>
        <button
          onClick={() => setStatusFilter("OCCUPIED")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs border ${statusFilter === "OCCUPIED" ? "bg-[#0B253A] text-white border-[#0B253A]" : "bg-white border-[#EBE6DD] text-slate-600 hover:bg-slate-50"}`}
        >
          <span className="w-2 h-2 rounded-full bg-[#0B253A]" /> Occupied {stats.occupied}
        </button>
        <button
          onClick={() => setStatusFilter("BILLING")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs border ${statusFilter === "BILLING" ? "bg-teal-600 text-white border-teal-600" : "bg-white border-[#EBE6DD] text-slate-600 hover:bg-teal-50"}`}
        >
          <CreditCard className="w-3.5 h-3.5 text-teal-500" /> Billing {stats.billing}
        </button>
        <button
          onClick={() => setStatusFilter("RESERVED")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs border ${statusFilter === "RESERVED" ? "bg-purple-600 text-white border-purple-600" : "bg-white border-[#EBE6DD] text-slate-600 hover:bg-purple-50"}`}
        >
          <Calendar className="w-3.5 h-3.5 text-purple-500" /> Reserved {stats.reserved}
        </button>
      </div>

      {/* Zone Filter */}
      {zones.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mb-4 shrink-0">
          <span className="text-[10px] font-bold uppercase text-slate-400 mr-1">Zone:</span>
          <button
            onClick={() => setSelectedZone("ALL")}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-colors ${selectedZone === "ALL" ? "bg-[#0B253A] text-white shadow-xs" : "bg-white border border-[#EBE6DD] text-slate-600 hover:bg-slate-50"}`}
          >
            All Zones
          </button>
          {zones.map((z) => (
            <button
              key={z}
              onClick={() => setSelectedZone(z)}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${selectedZone === z ? "bg-[#0B253A] text-white shadow-xs" : "bg-white border border-[#EBE6DD] text-slate-600 hover:bg-slate-50"}`}
            >
              {z}
            </button>
          ))}
        </div>
      )}

      {/* Table Grid or Empty State */}
      <div className="flex-1 overflow-y-auto pr-1">
        {tables.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-amber-500" />
            </div>
            <div>
              <p className="text-lg font-extrabold text-[#0B253A]">No Tables Configured</p>
              <p className="text-sm text-slate-500 mt-1 max-w-xs">
                No dining tables found. Please configure your floor layout in Settings.
              </p>
            </div>
            <button
              onClick={() => setActiveTab("SETTINGS")}
              className="px-4 py-2 rounded-xl bg-[#E66817] text-white font-bold text-sm hover:bg-[#EA580C] transition-colors shadow-sm"
            >
              Configure Tables
            </button>
          </div>
        ) : filteredTables.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
            <LayoutGrid className="w-10 h-10 text-slate-300" />
            <p className="text-sm font-semibold text-slate-400">No tables match this filter</p>
            <button
              onClick={() => { setSelectedZone("ALL"); setStatusFilter("ALL"); }}
              className="px-3 py-1.5 text-xs font-bold rounded-xl bg-white border border-[#EBE6DD] text-slate-600 hover:bg-slate-50"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5">
            {filteredTables.map((table) => (
              <TableCard
                key={table.id}
                table={table}
                onClick={handleTableClick}
                onOpenTable={handleOpenTable}
                onViewOrder={handleViewOrder}
              />
            ))}
          </div>
        )}
      </div>

      {/* Selected Table Drawer */}
      {activeDrawerTable && (
        <PosTableDrawer
          table={activeDrawerTable}
          onClose={() => setActiveDrawerTable(null)}
        />
      )}
    </div>
  );
};
