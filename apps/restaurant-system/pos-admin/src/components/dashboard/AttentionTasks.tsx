import type { TenantDashboard } from '../../cloud/cloudClient';

export interface AttentionTask {
  page: 'ORDERS' | 'MENU' | 'SYNC' | 'BILLING_SALES';
  branchId: string | null;
  id: string;
  label: string;
  createdAt?: string;
}
export function AttentionTasks({ data, onOpen }: { data: TenantDashboard; onOpen?: (task: AttentionTask) => void }) {
  const attention = data.attention;
  if (!attention) return null;
  const sections = [
    { label: 'Unpaid bills', page: 'BILLING_SALES' as const, rows: attention.unpaidBills.map((b) => ({ ...b, label: `${b.label} · ₹${b.outstanding}` })) },
    {
      label: `Delayed orders · over ${attention.delayedMinutes} min`,
      page: 'ORDERS' as const,
      rows: attention.delayedOrders.map((o) => ({ id: o.externalOrderId, label: `${o.label} · ${o.ageMinutes} min`, branchId: o.branchId }))
    },
    { label: 'Unavailable dishes', page: 'MENU' as const, rows: attention.unavailableDishes.map((d) => ({ ...d, label: d.name })) },
    { label: 'Device issues', page: 'SYNC' as const, rows: attention.devices.map((d) => ({ ...d, label: `${d.name} · ${d.health.replaceAll('_', ' ')}` })) }
  ];
  return (
    <section aria-label="Live attention tasks">
      <p className="mt-3 text-xs text-slate-500">
        Live tasks for this branch scope, independent of the sales date and source filters. Up to 20 tasks shown per group.
      </p>
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3 mt-3">
        {sections.map((section) => (
          <div key={section.page} className="rounded-xl border bg-jaman-cream p-3 min-w-0">
            <h3 className="text-sm font-bold">{section.label}</h3>
            <p className="text-xs text-slate-500 mt-1">{section.rows.length === 20 ? 'First 20 shown' : `${section.rows.length} need review`}</p>
            {!section.rows.length ? (
              <p className="text-sm text-emerald-800 mt-3">Nothing needs attention.</p>
            ) : (
              <ul className="mt-2 max-h-52 overflow-y-auto space-y-1">
                {section.rows.map((row) => (
                  <li key={`${row.id}:${row.branchId}`}>
                    <button
                      type="button"
                      disabled={!onOpen || (section.page !== 'MENU' && !row.branchId)}
                      onClick={() => onOpen?.({ ...row, page: section.page })}
                      className="w-full min-h-11 rounded-lg bg-white px-3 py-2 text-left text-sm font-semibold hover:bg-orange-50 disabled:opacity-50"
                    >
                      <span className="block break-words">{row.label} →</span>
                      {data.scope.branchId === null && (
                        <span className="block text-xs font-normal text-slate-500">
                          {data.byBranch.find((b) => b.id === row.branchId)?.name ??
                            (section.page === 'MENU' ? 'Shared restaurant menu' : 'Branch not assigned')}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
