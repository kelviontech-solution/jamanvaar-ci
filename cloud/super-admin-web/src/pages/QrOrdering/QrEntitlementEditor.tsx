import type { QrEntitlement } from '../../api/types';
import { Badge } from '../../components/ui';

/** The editable projection of {@link QrEntitlement} (everything except `source`). */
export type QrEntitlementDraft = Omit<QrEntitlement, 'source'>;

interface ToggleSpec {
  key: keyof QrEntitlementDraft;
  label: string;
  hint: string;
  /** Present on the list endpoint too, so it stays editable in degraded mode. */
  fromListEndpoint?: boolean;
}

const ACCESS_TOGGLES: ToggleSpec[] = [
  {
    key: 'qrEntitled',
    label: 'QR ordering entitlement',
    hint: 'Master grant. Turning this off removes the QR suite from the tenant regardless of plan.',
    fromListEndpoint: true
  },
  {
    key: 'qrOrderingEnabled',
    label: 'Live ordering service',
    hint: 'When off, guest scans are refused at the cloud edge and the table shows a maintenance notice.',
    fromListEndpoint: true
  }
];

const FEATURE_TOGGLES: ToggleSpec[] = [
  {
    key: 'digitalMenu',
    label: 'Digital menu',
    hint: 'Guests can browse the branch menu from the scanned table.'
  },
  {
    key: 'guestCustomization',
    label: 'Guest customization',
    hint: 'Guests may choose variants, add-ons and preparation notes on an item.'
  },
  {
    key: 'liveOrderTracking',
    label: 'Live order tracking',
    hint: 'Guests see preparation status updates pushed from the KOT/KDS pipeline.'
  },
  {
    key: 'qrAnalytics',
    label: 'QR analytics',
    hint: 'Table-level scan, conversion and basket reporting in Restaurant Admin.'
  },
  {
    key: 'onlinePayments',
    label: 'Online payments',
    hint: 'Guests can settle the bill from their own device instead of at the counter.'
  }
];

function ToggleRow({
  spec,
  checked,
  disabled,
  onChange
}: {
  spec: ToggleSpec;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '12px 14px',
        border: '1px solid var(--jv-border)',
        borderRadius: 'var(--jv-radius-md)',
        background: 'var(--jv-surface-subtle)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0, accentColor: 'var(--jv-accent)' }}
      />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--jv-text)' }}>{spec.label}</span>
        <span style={{ fontSize: 11.5, color: 'var(--jv-text-muted)', lineHeight: 1.45 }}>{spec.hint}</span>
      </span>
    </label>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="form-section-label">{children}</div>;
}

/**
 * Full QR entitlement editor. Covers every field of {@link QrEntitlement} except
 * `source`, which is server-derived and shown read-only.
 *
 * `limitedFields` renders the reduced form used when the per-restaurant detail
 * endpoint is not reachable: only the three fields the list endpoint actually
 * returns are offered, rather than inventing defaults for the rest.
 */
export function QrEntitlementEditor({
  draft,
  source,
  saving,
  limitedFields = false,
  onChange
}: {
  draft: QrEntitlementDraft;
  source?: QrEntitlement['source'];
  saving: boolean;
  limitedFields?: boolean;
  onChange: (patch: Partial<QrEntitlementDraft>) => void;
}) {
  const orderingDisabled = saving || !draft.qrEntitled;
  const unlimitedOrders = draft.maxOrdersPerDay === null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {source && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--jv-text-muted)' }}>Entitlement source</span>
          <Badge tone={source === 'PLATFORM_OVERRIDE' ? 'accent' : 'neutral'}>
            {source === 'PLATFORM_OVERRIDE' ? 'Platform override' : 'From plan'}
          </Badge>
          <span style={{ fontSize: 11.5, color: 'var(--jv-text-muted)' }}>
            {source === 'PLATFORM_OVERRIDE'
              ? 'A Super Admin has overridden the plan defaults for this restaurant.'
              : 'Values are inherited from the subscribed plan. Saving a change creates a platform override.'}
          </span>
        </div>
      )}

      <div>
        <SectionLabel>Access</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {ACCESS_TOGGLES.map((spec) => (
            <ToggleRow
              key={spec.key}
              spec={spec}
              checked={Boolean(draft[spec.key])}
              disabled={spec.key === 'qrOrderingEnabled' ? orderingDisabled : saving}
              onChange={(next) => {
                if (spec.key === 'qrEntitled' && !next) {
                  // Revoking the grant necessarily takes the live service down with it.
                  onChange({ qrEntitled: false, qrOrderingEnabled: false });
                  return;
                }
                onChange({ [spec.key]: next } as Partial<QrEntitlementDraft>);
              }}
            />
          ))}
        </div>
        {!draft.qrEntitled && (
          <p className="form-note" style={{ marginTop: 8 }}>
            Live ordering cannot be switched on while the entitlement is revoked.
          </p>
        )}
      </div>

      <div>
        <SectionLabel>Quotas</SectionLabel>
        <div className="form-row" style={{ marginTop: 8 }}>
          <div className="form-field" style={{ marginBottom: 0 }}>
            <label htmlFor="qr-max-tables">Max active tables</label>
            <input
              id="qr-max-tables"
              type="number"
              min={0}
              max={5000}
              value={draft.maxActiveTables ?? ''}
              placeholder="No limit"
              disabled={saving}
              onChange={(e) => {
                const parsed = parseInt(e.target.value, 10);
                onChange({ maxActiveTables: Number.isFinite(parsed) && parsed >= 0 ? parsed : null });
              }}
            />
            <span className="field-hint">Number of table QR codes that may be live at once. Leave empty for no limit.</span>
          </div>

          <div className="form-field" style={{ marginBottom: 0 }}>
            <label htmlFor="qr-max-orders">Max orders per day</label>
            <input
              id="qr-max-orders"
              type="number"
              min={0}
              max={1000000}
              value={unlimitedOrders ? '' : draft.maxOrdersPerDay ?? 0}
              placeholder="Unlimited"
              disabled={saving || unlimitedOrders}
              onChange={(e) => {
                const parsed = parseInt(e.target.value, 10);
                onChange({ maxOrdersPerDay: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0 });
              }}
            />
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 6,
                fontSize: 11.5,
                textTransform: 'none',
                letterSpacing: 0,
                fontWeight: 600,
                color: 'var(--jv-text-muted)',
                cursor: saving ? 'not-allowed' : 'pointer'
              }}
            >
              <input
                type="checkbox"
                checked={unlimitedOrders}
                disabled={saving}
                onChange={(e) => onChange({ maxOrdersPerDay: e.target.checked ? null : 0 })}
                style={{ width: 14, height: 14, accentColor: 'var(--jv-accent)' }}
              />
              <span>No daily order cap</span>
            </label>
          </div>
        </div>
      </div>

      {limitedFields ? (
        <div>
          <SectionLabel>Guest features</SectionLabel>
          <p className="form-note" style={{ marginTop: 8 }}>
            The per-restaurant entitlement detail endpoint is not reachable, so the guest feature flags
            (digital menu, customization, live tracking, analytics, online payments) cannot be read back.
            They are hidden rather than shown as off, because their real values are unknown here.
          </p>
        </div>
      ) : (
        <div>
          <SectionLabel>Guest features</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {FEATURE_TOGGLES.map((spec) => (
              <ToggleRow
                key={spec.key}
                spec={spec}
                checked={Boolean(draft[spec.key])}
                disabled={saving || !draft.qrEntitled}
                onChange={(next) => onChange({ [spec.key]: next } as Partial<QrEntitlementDraft>)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
