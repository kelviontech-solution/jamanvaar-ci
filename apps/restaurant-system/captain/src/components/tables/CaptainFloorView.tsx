import React, { useState, useMemo } from 'react';
import { useCaptainStore, selectMyTables } from '../../store/captainStore';
import { captainDb } from '@jamanvaar/database';
import { CaptainTableCard } from './CaptainTableCard';
import { DiningTable } from '@jamanvaar/types';
import { EmptyState } from '@jamanvaar/ui';
import { isBillWaiting } from '@jamanvaar/database';
import { Search, RotateCcw, UtensilsCrossed } from 'lucide-react';

interface CaptainFloorViewProps {
  onOpenGuestModal: (table: DiningTable) => void;
  onOpenWorkspace: (table: DiningTable) => void;
  onDeliverFood: (table: DiningTable) => void;
}

export const CaptainFloorView: React.FC<CaptainFloorViewProps> = ({
  onOpenGuestModal,
  onOpenWorkspace,
  onDeliverFood
}) => {
  const {
    tables,
    currentCaptain,
    tableFilter,
    selectedZone,
    foodReadyItems,
    setTableFilter,
    setSelectedZone,
    requestBill
  } = useCaptainStore();

  const [localSearch, setLocalSearch] = useState('');

  const activeFoodReady = foodReadyItems.filter((fr) => !fr.isServed);

  // Dynamic Table Summary Counts
  const myTableIds = useMemo(() => new Set(selectMyTables(tables, currentCaptain).map((t) => t.id)), [tables, currentCaptain]);
  const myAssignedTablesCount = myTableIds.size;

  // Zone buttons come from the zones the restaurant's tables actually use (BUG-108).
  const zones = useMemo(() => ['ALL', ...Array.from(new Set(tables.map((t) => t.zone).filter(Boolean)))], [tables]);

  const occupiedCount = useMemo(() => {
    return tables.filter((t) => t.status === 'OCCUPIED' || t.status === 'BILLING' || !!t.currentOrderId).length;
  }, [tables]);

  const foodReadyTablesCount = useMemo(() => {
    return tables.filter((t) => activeFoodReady.some((fr) => fr.tableNumber === t.tableNumber)).length;
  }, [tables, activeFoodReady]);

  const billRequestedCount = useMemo(() => {
    return tables.filter((t) => t.status === 'BILL_REQUESTED').length;
  }, [tables]);

  const availableCount = useMemo(() => {
    return tables.filter((t) => t.status === 'AVAILABLE' && !t.currentOrderId).length;
  }, [tables]);

  // Filtered Tables Matrix
  const filteredTables = useMemo(() => {
    return tables.filter((t) => {
      // 1. Zone filter
      const tableZone = (t as any).section || t.zone || 'Main Dining';
      if (selectedZone !== 'ALL' && tableZone !== selectedZone) return false;

      // 2. Status filter
      if (tableFilter === 'MY_TABLES') {
        if (!myTableIds.has(t.id)) return false;
      } else if (tableFilter === 'OCCUPIED') {
        if (t.status !== 'OCCUPIED' && t.status !== 'BILLING' && !t.currentOrderId) return false;
      } else if (tableFilter === 'FOOD_READY') {
        if (!activeFoodReady.some((fr) => fr.tableNumber === t.tableNumber)) return false;
      } else if (tableFilter === 'BILL_REQUESTED') {
        if (t.status !== 'BILL_REQUESTED') return false;
      }

      // 3. Search query
      if (localSearch.trim()) {
        const q = localSearch.toLowerCase().trim();
        const matchesTbl = t.tableNumber.toLowerCase().includes(q);
        const matchesSection = ((t as any).section || t.zone || '').toLowerCase().includes(q);
        const matchesOrder = t.currentOrderId?.toLowerCase().includes(q);
        if (!matchesTbl && !matchesSection && !matchesOrder) return false;
      }

      return true;
    });
  }, [tables, selectedZone, tableFilter, localSearch, myTableIds, activeFoodReady]);

  return (
    <div className="space-y-3 sm:space-y-5">
      {useCaptainStore.getState().customerRequests.some(request => !request.isResolved) && <button type="button" onClick={() => useCaptainStore.getState().setActiveTab('REQUESTS')} className="w-full sm:w-auto min-h-12 rounded-xl border border-amber-200 bg-amber-50 px-4 text-left text-amber-900 font-bold text-sm active:bg-amber-100">Guest requests · {useCaptainStore.getState().customerRequests.filter(request => !request.isResolved).length}</button>}
      {selectMyTables(tables,currentCaptain).some(table => activeFoodReady.some(food => food.tableNumber === table.tableNumber) || isBillWaiting(captainDb.orders.find(order => order.id === table.currentOrderId))) && <section className="rounded-xl sm:rounded-2xl border border-jaman-border bg-white p-3 sm:p-4 space-y-2 sm:space-y-3">
        <h2 className="text-sm sm:text-base font-bold text-jaman-navy">My floor · next actions</h2>
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">{selectMyTables(tables,currentCaptain).flatMap(table => {
          const ready=activeFoodReady.filter(food => food.tableNumber === table.tableNumber).length;
          const bill=isBillWaiting(captainDb.orders.find(order => order.id === table.currentOrderId));
          return [ready > 0 ? <button type="button" key={`${table.id}:ready`} onClick={() => onDeliverFood(table)} className="w-full sm:w-auto min-h-12 px-3 sm:px-4 py-2 rounded-xl border border-emerald-200 bg-emerald-50 active:bg-emerald-100 text-emerald-900 font-bold text-sm text-left">Table {table.tableNumber} · Deliver {ready} ready dish{ready === 1 ? '' : 'es'}</button> : null,bill ? <button type="button" key={`${table.id}:bill`} onClick={() => {onOpenWorkspace(table);useCaptainStore.getState().setTableWorkspaceTab('BILL');}} className="w-full sm:w-auto min-h-12 px-3 sm:px-4 py-2 rounded-xl border border-amber-200 bg-amber-50 active:bg-amber-100 text-amber-900 font-bold text-sm text-left">Table {table.tableNumber} · Follow up bill</button> : null];
        })}</div>
      </section>}
      {/* ── 1. Dynamic Table Summary Counter Strip ── */}
      <div className="grid grid-cols-2 min-[600px]:grid-cols-5 gap-2 sm:gap-2.5">
        <button
          type="button"
          onClick={() => setTableFilter('MY_TABLES')}
          className={`min-w-0 px-3 py-1.5 sm:p-3 rounded-xl sm:rounded-2xl border text-left transition-all shadow-2xs cursor-pointer active:scale-[0.98] ${
            tableFilter === 'MY_TABLES'
              ? 'bg-jaman-navy text-white border-jaman-navy'
              : 'bg-white hover:bg-slate-50 border-jaman-border text-jaman-navy'
          }`}
        >
          <span className={`text-[11px] font-bold uppercase tracking-wider block ${tableFilter === 'MY_TABLES' ? 'text-slate-300' : 'text-slate-400'}`}>
            My Tables
          </span>
          <div className="flex items-baseline justify-between mt-1 sm:mt-0.5">
            <span className="text-lg sm:text-2xl leading-none sm:leading-normal font-bold font-mono">{myAssignedTablesCount}</span>
            <span className={`text-[11px] font-bold ${tableFilter === 'MY_TABLES' ? 'text-jaman-saffron' : 'text-slate-500'}`}>Tables</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setTableFilter('OCCUPIED')}
          className={`min-w-0 px-3 py-1.5 sm:p-3 rounded-xl sm:rounded-2xl border text-left transition-all shadow-2xs cursor-pointer active:scale-[0.98] ${
            tableFilter === 'OCCUPIED'
              ? 'bg-jaman-saffron text-white border-jaman-saffron'
              : 'bg-white hover:bg-amber-50/50 border-jaman-border text-jaman-navy'
          }`}
        >
          <span className={`text-[11px] font-bold uppercase tracking-wider block ${tableFilter === 'OCCUPIED' ? 'text-amber-100' : 'text-slate-400'}`}>
            Seated / Dining
          </span>
          <div className="flex items-baseline justify-between mt-1 sm:mt-0.5">
            <span className="text-lg sm:text-2xl leading-none sm:leading-normal font-bold font-mono">{occupiedCount}</span>
            <span className={`text-[11px] font-bold ${tableFilter === 'OCCUPIED' ? 'text-white' : 'text-jaman-saffron'}`}>Active</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setTableFilter('FOOD_READY')}
          className={`min-w-0 px-3 py-1.5 sm:p-3 rounded-xl sm:rounded-2xl border text-left transition-all shadow-2xs cursor-pointer active:scale-[0.98] ${
            tableFilter === 'FOOD_READY'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-emerald-600/20'
              : 'bg-white hover:bg-emerald-50/50 border-jaman-border text-jaman-navy'
          }`}
        >
          <span className={`text-[11px] font-bold uppercase tracking-wider block ${tableFilter === 'FOOD_READY' ? 'text-emerald-100' : 'text-slate-400'}`}>
            Food Ready
          </span>
          <div className="flex items-baseline justify-between mt-1 sm:mt-0.5">
            <span className="text-lg sm:text-2xl leading-none sm:leading-normal font-bold font-mono">{foodReadyTablesCount}</span>
            <span className={`text-[11px] font-bold ${tableFilter === 'FOOD_READY' ? 'text-white' : 'text-emerald-600'}`}>Deliver</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setTableFilter('BILL_REQUESTED')}
          className={`min-w-0 px-3 py-1.5 sm:p-3 rounded-xl sm:rounded-2xl border text-left transition-all shadow-2xs cursor-pointer active:scale-[0.98] ${
            tableFilter === 'BILL_REQUESTED'
              ? 'bg-purple-700 text-white border-purple-700'
              : 'bg-white hover:bg-purple-50/50 border-jaman-border text-jaman-navy'
          }`}
        >
          <span className={`text-[11px] font-bold uppercase tracking-wider block ${tableFilter === 'BILL_REQUESTED' ? 'text-purple-100' : 'text-slate-400'}`}>
            Bill Requested
          </span>
          <div className="flex items-baseline justify-between mt-1 sm:mt-0.5">
            <span className="text-lg sm:text-2xl leading-none sm:leading-normal font-bold font-mono">{billRequestedCount}</span>
            <span className={`text-[11px] font-bold ${tableFilter === 'BILL_REQUESTED' ? 'text-white' : 'text-purple-700'}`}>Billing</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setTableFilter('ALL_TABLES')}
          className={`col-span-2 min-[600px]:col-span-1 min-w-0 px-3 py-1.5 sm:p-3 rounded-xl sm:rounded-2xl border text-left transition-all shadow-2xs cursor-pointer active:scale-[0.98] ${
            tableFilter === 'ALL_TABLES'
              ? 'bg-slate-800 text-white border-slate-800'
              : 'bg-white hover:bg-slate-50 border-jaman-border text-jaman-navy'
          }`}
        >
          <span className={`text-[11px] font-bold uppercase tracking-wider block ${tableFilter === 'ALL_TABLES' ? 'text-slate-300' : 'text-slate-400'}`}>
            Available Tables
          </span>
          <div className="flex items-baseline justify-between mt-1 sm:mt-0.5">
            <span className="text-lg sm:text-2xl leading-none sm:leading-normal font-bold font-mono">{availableCount}</span>
            <span className={`text-[11px] font-bold ${tableFilter === 'ALL_TABLES' ? 'text-white' : 'text-slate-500'}`}>
              of {tables.length}
            </span>
          </div>
        </button>
      </div>

      {/* ── 2. Filter Bar: Zones + Status Pills + Search ── */}
      <div className="bg-white p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border border-jaman-border space-y-2 sm:space-y-2.5 shadow-2xs">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2 sm:gap-2.5">
          {/* Section / Zone Selector (second row on a phone: the search box comes first) */}
          <div className="order-2 lg:order-1 min-w-0 flex items-center gap-1.5 cap-chip-row scrollbar-none pb-0.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0">
              Zone:
            </span>
            {zones.map((zone) => (
              <button
                key={zone}
                type="button"
                onClick={() => setSelectedZone(zone)}
                className={`px-3 min-h-10 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 whitespace-nowrap active:scale-95 ${
                  selectedZone === zone
                    ? 'bg-jaman-navy text-white shadow-2xs'
                    : 'bg-jaman-cream text-slate-600 hover:bg-[#FFF4ED] hover:text-jaman-saffron'
                }`}
              >
                {zone === 'ALL' ? 'All Sections' : zone}
              </button>
            ))}
          </div>

          {/* Quick Search */}
          <div className="order-1 lg:order-2 relative w-full lg:w-auto lg:min-w-[200px] lg:max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Search table, order, dish..."
              aria-label="Search tables, orders or dishes"
              className="w-full h-11 lg:h-9 pl-9 pr-10 bg-jaman-cream border border-jaman-border rounded-xl text-sm lg:text-xs font-medium text-jaman-navy focus:bg-white focus:border-jaman-saffron outline-none transition-all"
            />
            {localSearch && (
              <button
                type="button"
                onClick={() => setLocalSearch('')}
                aria-label="Clear search"
                className="absolute right-0.5 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Status Pills */}
        <div className="flex items-center gap-1.5 cap-chip-row scrollbar-none pt-2 sm:pt-1 border-t border-slate-100">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0">
            Filter:
          </span>
          {[
            { id: 'ALL_TABLES', label: 'All Floor Tables' },
            { id: 'MY_TABLES', label: 'My Tables' },
            { id: 'OCCUPIED', label: 'Seated & Dining' },
            { id: 'FOOD_READY', label: 'Food Ready' },
            { id: 'BILL_REQUESTED', label: 'Bill Requested' }
          ].map((flt) => (
            <button
              key={flt.id}
              type="button"
              onClick={() => setTableFilter(flt.id as any)}
              className={`px-3 min-h-10 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 whitespace-nowrap active:scale-95 ${
                tableFilter === flt.id
                  ? 'bg-jaman-saffron text-white shadow-xs'
                  : 'bg-jaman-cream text-slate-600 hover:bg-slate-200'
              }`}
            >
              {flt.label}
            </button>
          ))}

          {(tableFilter !== 'ALL_TABLES' || selectedZone !== 'ALL' || localSearch) && (
            <button
              type="button"
              onClick={() => {
                setTableFilter('ALL_TABLES');
                setSelectedZone('ALL');
                setLocalSearch('');
              }}
              className="px-3 min-h-10 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 active:bg-rose-50 flex items-center gap-1 shrink-0 whitespace-nowrap transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* ── 3. Table Cards Grid or Actionable Empty State ── */}
      {filteredTables.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5 sm:gap-4">
          {filteredTables.map((table) => {
            const activeOrder = table.currentOrderId
              ? captainDb.orders.find((o) => o.id === table.currentOrderId) || null
              : null;

            const readyCount = activeFoodReady.filter((fr) => fr.tableNumber === table.tableNumber).length;

            return (
              <CaptainTableCard
                key={table.id}
                table={table}
                activeOrder={activeOrder}
                foodReadyCount={readyCount}
                captainName={table.openedByName || activeOrder?.captainName || ''}
                onOpenTableModal={onOpenGuestModal}
                onOpenWorkspace={onOpenWorkspace}
                onDeliverFood={onDeliverFood}
                onRequestBill={requestBill}
              />
            );
          })}
        </div>
      ) : (
        /* ── Actionable Empty State (No Blank Voids!) ── */
        <EmptyState
          icon={<UtensilsCrossed className="w-8 h-8" />}
          title={tables.length === 0 ? 'No tables set up yet' : 'No tables match your current filter'}
          description={
            tables.length === 0
              ? 'Add the restaurant’s tables in Restaurant Admin → Floor / Tables. They appear here within a few seconds.'
              : tableFilter === 'BILL_REQUESTED'
              ? 'No tables currently have pending bill requests on this floor.'
              : tableFilter === 'FOOD_READY'
              ? 'No tables currently have ready dishes waiting in the kitchen.'
              : 'Try adjusting your zone or search criteria to view more floor tables.'
          }
          actionText={tables.length === 0 ? undefined : `Show All ${tables.length} Floor Tables`}
          onAction={tables.length === 0 ? undefined : () => {
            setTableFilter('ALL_TABLES');
            setSelectedZone('ALL');
            setLocalSearch('');
          }}
        />
      )}
    </div>
  );
};
