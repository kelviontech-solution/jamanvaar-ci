import { useEffect, useState } from 'react';
import { db, WelcomeScreenSettingsRepository } from '@jamanvaar/database';
import { KioskWelcomeScreen, KioskLanguageScreen, VirtualKeyboard } from '@jamanvaar/ui';
import { welcomePresentation, welcomeBackgroundUrl, languageScreenPresentation, resolveMenuImage } from '@jamanvaar/utils';
import { LANGUAGE_OPTIONS } from '@jamanvaar/i18n';
import { KioskWelcomeScreenPanel } from '../settings/KioskWelcomeScreenPanel';
import { KioskContentPanel } from '../settings/KioskContentPanel';
import { KioskPaymentSettingsPanel } from '../payments/KioskPaymentSettingsPanel';
import { ReceiptEBillPanel } from '../receipts/ReceiptEBillPanel';
import { requestQrLeave } from '../qrconsole/useQrUnsavedChanges';
import { ops } from '../operations/operationsClient';
import type { CloudKiosk } from '../../cloud/cloudClient';

type Menu = {
  channel: string;
  version: number;
  enabled: boolean;
  reason: string;
  source: string;
  note?: string;
  items: { id: string; name: string; description?: string; price: number; imageUrl?: string }[];
  hidden: { id: string; name: string; reason: string }[];
};
const tabs = ['Welcome & language', 'Menu & checkout', 'Payments', 'Receipt', 'What customers can order', 'Private journey preview'] as const;
export function CustomerExperience({
  branchId,
  kiosks,
  showToast,
  onGoToSettings
}: {
  branchId: string;
  kiosks: CloudKiosk[];
  showToast: (s: string) => void;
  onGoToSettings: () => void;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]>('Welcome & language');
  return (
    <section className="space-y-5 min-w-0">
      <header>
        <h1 className="text-2xl font-bold">Customer experience</h1>
        <p className="text-sm text-slate-600">
          Design, review and test the guest journey for {db.outlet.name}. Welcome screens can also be customized for individual kiosks.
        </p>
      </header>
      <nav aria-label="Customer experience sections" className="flex flex-wrap gap-2 rounded-2xl border bg-white p-3">
        {tabs.map((t) => (
          <button
            key={t}
            aria-current={tab === t ? 'page' : undefined}
            className={`min-h-11 rounded-xl px-4 text-sm font-bold ${tab === t ? 'bg-jaman-navy text-white' : 'border'}`}
            onClick={async () => {
              if (t !== tab && (await requestQrLeave())) setTab(t);
            }}
          >
            {t}
          </button>
        ))}
      </nav>
      {tab === 'Welcome & language' && <KioskWelcomeScreenPanel kiosks={kiosks} showToast={showToast} />}
      {tab === 'Menu & checkout' && <KioskContentPanel showToast={showToast} />}
      {tab === 'Payments' && (
        <>
          <p className="rounded-xl border bg-blue-50 p-4 text-sm">
            Merchant payment connection affects this restaurant's payment account. Branch ordering methods remain controlled in the channel's settings. Review
            the payee before accepting online payments.
          </p>
          <KioskPaymentSettingsPanel />
        </>
      )}
      {tab === 'Receipt' && <ReceiptEBillPanel showToast={showToast} onGoToSettings={onGoToSettings} />}
      {(tab === 'What customers can order' || tab === 'Private journey preview') && (
        <ChannelMenuPreview key={tab} branchId={branchId} kiosks={kiosks} journey={tab === 'Private journey preview'} />
      )}
    </section>
  );
}
export function ChannelMenuPreview({ branchId, kiosks, journey,initialChannel='KIOSK' }: { branchId: string; kiosks: CloudKiosk[]; journey: boolean;initialChannel?:string }) {
  const [channel, setChannel] = useState(initialChannel),
    [menu, setMenu] = useState<Menu>(),
    [error, setError] = useState(''),
    [step, setStep] = useState(0),
    [cart, setCart] = useState<Record<string, number>>({}),
    [contact, setContact] = useState(''),
    [keyboard, setKeyboard] = useState(false),
    [notice, setNotice] = useState('');
  const [terminal, setTerminal] = useState('branch');
  useEffect(() => {
    let active = true;
    setMenu(undefined);
    setError('');
    ops<Menu>(branchId, 'launch/menu?channel=' + channel)
      .then((v) => {
        if (active) setMenu(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [branchId, channel]);
  const settings = WelcomeScreenSettingsRepository.getSettings(),
    presentation = welcomePresentation(settings, terminal === 'branch' ? undefined : terminal),
    language = languageScreenPresentation(presentation);
  const background = welcomeBackgroundUrl(presentation, settings.customBackgrounds || []),
    langBackground = welcomeBackgroundUrl(language, settings.customBackgrounds || []);
  const total = (menu?.items || []).reduce((n, i) => n + i.price * (cart[i.id] || 0), 0);
  const button = 'min-h-11 rounded-xl border px-4 py-3 font-bold text-sm';
  const reset = () => {
    setStep(0);
    setCart({});
    setContact('');
    setNotice('');
    setKeyboard(false);
  };
  return (
    <section className="rounded-2xl border bg-white p-4 sm:p-6 space-y-4" aria-label={journey ? 'Private kiosk rehearsal' : 'Effective channel menu'}>
      <h2 className="font-bold text-xl">{journey ? 'Private kiosk rehearsal' : 'What customers can order'}</h2>
      <p className="text-sm text-slate-600">
        {journey
          ? 'Simulation only. No orders, payment attempts or receipt messages are created. Payment and receipt steps are simulated; verify real integrations in channel acceptance.'
          : 'Review the published branch menu by channel, including live stock and availability exclusions. Unpublished edits are not shown.'}
      </p>
      {!journey && (
        <label className="block text-sm font-bold">
          Ordering channel
          <select aria-label="Preview channel" className="block rounded-xl border p-3 mt-1" value={channel} onChange={(e) => setChannel(e.target.value)}>
            {['POS', 'KIOSK', 'QR'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      )}
      {journey && (
        <>
          <label className="block text-sm font-bold">
            Kiosk design
            <select
              className="block rounded-xl border p-3 mt-1"
              value={terminal}
              onChange={(e) => {
                setTerminal(e.target.value);
                reset();
              }}
            >
              <option value="branch">Branch default</option>
              {kiosks
                .filter((k) => k.branchId === branchId)
                .map((kiosk) => (
                  <option key={kiosk.id} value={kiosk.id}>
                    {kiosk.name}
                  </option>
                ))}
            </select>
          </label>
          <p className="text-xs text-slate-500">Welcome → Language → Menu → Checkout → Payment → Receipt</p>
        </>
      )}
      {error && <p role="alert">Preview unavailable: {error}</p>}
      {!menu && !error && <p role="status">Checking branch menu…</p>}
      {menu && (!menu.enabled || !menu.items.length) && (
        <p role="status" className="bg-amber-50 p-4 rounded-xl">
          {!menu.enabled
            ? 'This channel is unavailable: ' + menu.reason.replaceAll('_', ' ').toLowerCase() + '. Review branch licensing and Products & plan.'
            : 'No orderable published dishes. Publish your menu and review channel visibility, branch availability and stock.'}
        </p>
      )}
      {menu && menu.enabled && (
        <>
          <p className="text-xs text-slate-500">
            Published version {menu.version} · {menu.items.length} dishes · {menu.note}
          </p>
          <div
            className={journey ? 'mx-auto max-w-[430px] overflow-hidden rounded-3xl border bg-[#fffaf2] shadow-sm' : 'space-y-3'}
            style={journey ? { height: 690, maxHeight: '80dvh', overflowY: 'auto' } : undefined}
          >
            {journey && step === 0 && (
              <KioskWelcomeScreen preview settings={presentation} backgroundUrl={background} restaurantName={db.restaurant.name} onStart={() => setStep(1)} />
            )}
            {journey && step === 1 && (
              <KioskLanguageScreen
                preview
                settings={language}
                backgroundUrl={langBackground}
                languages={LANGUAGE_OPTIONS.filter((l) => db.kioskDisplaySettings.enabledLanguages.includes(l.code)).map((l) => ({
                  code: l.code,
                  native: l.native,
                  label: l.label
                }))}
                onBack={() => setStep(0)}
                onChoose={() => setStep(2)}
              />
            )}
            {(!journey || step === 2) && (
              <div className="p-3 space-y-3">
                {menu.items.map((i) => (
                  <article key={i.id} className="rounded-xl border bg-white p-3 flex items-center gap-3">
                    {i.imageUrl && (
                      <img
                        alt=""
                        src={resolveMenuImage(i.imageUrl, { apiBase: import.meta.env.VITE_CLOUD_API_BASE_URL || 'http://localhost:4000' })}
                        className="h-16 w-16 rounded-xl object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold">{i.name}</h3>
                      <p className="text-sm">₹{i.price.toFixed(2)}</p>
                    </div>
                    {journey && (
                      <button className={button} aria-label={'Add ' + i.name} onClick={() => setCart((c) => ({ ...c, [i.id]: (c[i.id] || 0) + 1 }))}>
                        + {cart[i.id] || ''}
                      </button>
                    )}
                  </article>
                ))}
                {journey && (
                  <button disabled={!total} className={button + ' w-full bg-orange-600 text-white disabled:opacity-50'} onClick={() => setStep(3)}>
                    Review cart · ₹{total.toFixed(2)}
                  </button>
                )}
              </div>
            )}
            {journey && step === 3 && (
              <div className="p-5 space-y-4">
                <h3 className="text-xl font-bold">Review your practice order</h3>
                {menu.items
                  .filter((i) => cart[i.id])
                  .map((i) => (
                    <p key={i.id}>
                      {cart[i.id]} × {i.name}
                      <button className="underline float-right" onClick={() => setCart((c) => ({ ...c, [i.id]: Math.max(0, c[i.id] - 1) }))}>
                        Remove one
                      </button>
                    </p>
                  ))}
                <p>Items ₹{total.toFixed(2)}. This rehearsal does not calculate or charge a tax invoice.</p>
                <button className={button} onClick={() => setStep(2)}>
                  Keep ordering
                </button>
                <button className={button} disabled={!total} onClick={() => setStep(4)}>
                  Continue to simulated payment
                </button>
              </div>
            )}
            {journey && step === 4 && (
              <div className="p-5 space-y-4">
                <h3 className="text-xl font-bold">Practice payment</h3>
                <p>No payment app will open and no money is collected.</p>
                <button
                  className={button + ' w-full'}
                  onClick={() => {
                    setNotice('Practice payment cancelled. Cart preserved. Choose a method again.');
                  }}
                >
                  Simulate online payment cancellation
                </button>
                <button
                  className={button + ' w-full'}
                  onClick={() => {
                    setNotice('Simulated payment verified.');
                    setStep(5);
                  }}
                >
                  Simulate successful online payment
                </button>
                <button
                  className={button + ' w-full'}
                  onClick={() => {
                    setNotice('Practice order awaits counter payment.');
                    setStep(5);
                  }}
                >
                  Simulate pay at counter
                </button>
                <button className={button} onClick={() => setStep(3)}>
                  Back to cart
                </button>
                <p role="status">{notice}</p>
              </div>
            )}
            {journey && step === 5 && (
              <div className="p-5 space-y-4">
                <h3 className="text-xl font-bold">Practice receipt delivery</h3>
                <p>{notice}</p>
                <label className="block text-sm font-bold">
                  Example email or phone
                  <input
                    aria-label="Practice receipt contact"
                    className="mt-2 w-full rounded-xl border p-3"
                    value={contact}
                    onFocus={() => setKeyboard(true)}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="guest@example.com"
                  />
                </label>
                <button
                  className={button}
                  disabled={!contact.trim()}
                  onClick={() => {
                    setKeyboard(false);
                    setNotice('Simulation complete. No receipt was sent.');
                    setStep(6);
                  }}
                >
                  Simulate send receipt
                </button>
                <button
                  className={button}
                  onClick={() => {
                    setContact('');
                    setStep(6);
                  }}
                >
                  Skip receipt
                </button>
                {keyboard && (
                  <VirtualKeyboard language="en" value={contact} onChange={setContact} onClose={() => setKeyboard(false)} title="Practice receipt keyboard" />
                )}
              </div>
            )}
            {journey && step === 6 && (
              <div className="p-6 space-y-4">
                <h3 className="text-xl font-bold">Practice complete</h3>
                <p>No sale or payment was created. Now record a real channel acceptance test before opening service.</p>
                <button className={button} onClick={reset}>
                  Restart private journey
                </button>
              </div>
            )}
          </div>
          {!journey && (
            <details>
              <summary className="py-3 font-bold cursor-pointer">Hidden dishes ({menu.hidden.length})</summary>
              {menu.hidden.map((i) => (
                <p className="border-t py-3 text-sm" key={i.id}>
                  <strong>{i.name}</strong> · {i.reason}
                </p>
              ))}
            </details>
          )}
          {journey && (
            <button className={button} onClick={reset}>
              Reset rehearsal
            </button>
          )}
        </>
      )}
    </section>
  );
}
