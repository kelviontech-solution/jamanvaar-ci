import { db } from '@jamanvaar/database';
const notices: Record<string, { scope: string; detail: string; preview?: string }> = {
  MENU: {
    scope: 'Shared restaurant menu',
    detail:
      'Dish names, prices, categories and photos are shared across licensed apps. Publication updates the guest menu. Use channel availability and branch overrides to limit where a dish is offered.'
  },
  MENU_OPTIONS: {
    scope: 'Shared menu options & tax',
    detail: 'Changes affect dishes using these options or tax groups across your restaurant. Review totals and publish the menu after editing.'
  },
  SETTINGS: {
    scope: 'Mixed scopes — review each section',
    detail:
      'Restaurant identity is shared. Branch operating defaults and kiosk configuration use the selected branch. Screen-size preferences affect this device.'
  },
  KIOSK_DESIGN: {
    scope: 'Kiosk channel · selected branch',
    detail: 'Content and appearance affect this branch’s kiosks. Welcome Screen lets you preview a branch default or a specific terminal override.',
    preview: 'KIOSK_WELCOME'
  },
  KIOSK_WELCOME: {
    scope: 'Kiosk welcome screen',
    detail:
      'The Apply to selector below chooses branch defaults or one terminal. Individual overrides remain intact. Preview portrait and landscape before applying.'
  },
  KIOSK_PAYMENTS: {
    scope: 'Restaurant merchant connection + branch kiosk defaults',
    detail:
      'Gateway connection and settlement details apply to the restaurant. Kiosk checkout defaults use the selected branch. Online payment confirmation comes from the provider; serving an order does not settle its bill.'
  },
  RECEIPTS: {
    scope: 'Receipt defaults · selected branch',
    detail: 'These defaults are delivered through branch kiosk configuration. Review restaurant legal details and the receipt preview before saving.'
  },
  PAYMENTS: {
    scope: 'Payments · selected branch',
    detail: 'Settlement changes affect financial records. A payment attempt is separate from confirmed collection; serving an order does not settle its bill.'
  }
};
export function SettingsScopeNotice({ page, onNavigate }: { page: string; onNavigate?: (page: string) => void }) {
  const notice = notices[page];
  if (!notice) return null;
  return (
    <section aria-label="Change scope" className="mb-4 rounded-xl border border-jaman-border border-l-4 border-l-brand/60 bg-white px-4 py-2.5 text-sm">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <strong className="text-jaman-navy">{notice.scope}</strong>
        <span className="text-xs text-slate-500">
          {db.restaurant.name} · {db.outlet.name}
        </span>
      </p>
      <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{notice.detail}</p>
      {notice.preview && onNavigate && (
        <button type="button" className="min-h-11 underline font-bold text-brand" onClick={() => onNavigate(notice.preview!)}>
          Preview customer screen
        </button>
      )}
    </section>
  );
}
