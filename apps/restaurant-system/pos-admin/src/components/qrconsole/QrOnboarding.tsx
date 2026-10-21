import { activeAdminBranch } from '../../adminBranchScope';
import { PlanOnboarding } from '../dashboard/PlanOnboarding';
import { useEffect, useRef, useState } from 'react';
import { Modal, CachedImg } from '@jamanvaar/ui';
import { PREBUILT_MENU_TEMPLATES } from '@jamanvaar/database';
import { formatINR } from '@jamanvaar/utils';
import { qrApi } from '../../cloud/cloudClient';
import { records, writeMany } from './QrCatalog';
import { requestQrLeave, useQrUnsavedChanges } from './useQrUnsavedChanges';
import { QR_FIELD, QR_BUTTON_SECONDARY } from './qrUi';
const field = QR_FIELD,
  button = QR_BUTTON_SECONDARY,
  box = 'rounded-2xl border bg-white p-5 space-y-4';
const hash = (s: string) => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(36);
};
export function QrOnboarding({onNavigate}:{onNavigate?:(page:string)=>void} = {}) {
  const [step, setStep] = useState(0),
    [templateId, setTemplateId] = useState(''),
    [chosen, setChosen] = useState<number[]>([]),
    [prices, setPrices] = useState<Record<string, number>>({}),
    [tax, setTax] = useState('0'),
    [reviewed, setReviewed] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState<any>(null),
    [preview, setPreview] = useState<any>(null),
    [option, setOption] = useState<any>(null),
    [taxDraft, setTaxDraft] = useState<any>(null);
  const saved = useRef(false);
  useQrUnsavedChanges((!!templateId && !saved.current) || !!option || !!taxDraft);
  const template = PREBUILT_MENU_TEMPLATES.find((t) => t.id === templateId),
    selected = template?.categories.filter((_, i) => chosen.includes(i)) || [];
  const inspect = async () => {
    try {
      const [status, menu] = await Promise.all([qrApi('/api/v1/menu/draft-status'), qrApi('/api/v1/menu/preview')]);
      setReview(status);
      setPreview(menu);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void inspect();
  }, []);
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fn();
      await inspect();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function importDraft() {
    if (!template || !selected.length || !reviewed) throw Error('Select categories and confirm your prices first');
    const [existingCats, existingItems, existingTaxes] = await Promise.all([records('MENU_CATEGORY'), records('MENU_ITEM'), records('TAX_GROUP')]);
    const cats: any[] = [],
      items: any[] = [],
      groups: any[] = [],
      rate = Number(tax);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw Error('Enter a tax percentage between 0 and 100');
    let taxId = existingTaxes.find((t) => Number(t.cgstPercent) + Number(t.sgstPercent) === rate && t.isInclusive === false)?.id;
    if (rate > 0 && !taxId) {
      taxId = 'qr-template-tax-' + hash(String(rate));
      await writeMany('TAX_GROUP', [
        { id: taxId, name: rate + '% configured tax', cgstPercent: rate / 2, sgstPercent: rate / 2, igstPercent: rate, isInclusive: false, isActive: true }
      ]);
    }
    let skipped = 0;
    for (const cat of selected) {
      const id = existingCats.find((c) => c.name.toLowerCase() === cat.name.toLowerCase())?.id || 'qr-template-cat-' + hash(template.id + cat.slug + cat.name);
      if (!existingCats.some((c) => c.id === id))
        cats.push({
          id,
          name: cat.name,
          slug: cat.slug,
          imageUrl: cat.imageUrl,
          iconName: cat.iconName,
          description: cat.description,
          isActive: true,
          sortOrder: existingCats.length + cats.length
        });
      for (const item of cat.items) {
        if (existingItems.some((i) => i.sku === item.sku || (i.categoryId === id && i.name.toLowerCase() === item.name.toLowerCase()))) {
          skipped++;
          continue;
        }
        const key = template.id + cat.name + item.sku,
          itemId = 'qr-template-item-' + hash(key),
          price = prices[item.sku] ?? item.suggestedPrice,
          modifierGroupIds: string[] = [];
        for (const [kind, values] of [
          ['Size', item.variants],
          ['Add-ons', item.addons]
        ] as const) {
          if (!values?.length) continue;
          const groupId = 'qr-template-group-' + hash(key + kind);
          modifierGroupIds.push(groupId);
          groups.push({
            id: groupId,
            name: item.name + ' / ' + kind,
            minSelections: kind === 'Size' ? 1 : 0,
            maxSelections: kind === 'Size' ? 1 : values.length,
            isRequired: kind === 'Size',
            options: values.map((v, i) => ({
              id: groupId + '-' + i,
              name: v.name,
              priceDelta: kind === 'Size' ? Math.max(0, v.price - item.suggestedPrice) : v.price,
              isAvailable: true,
              isDefault: kind === 'Size' && i === 0
            }))
          });
        }
        for (const sourceId of item.modifierGroupIds || []) {
          const source = template.modifierGroups?.find((g) => g.id === sourceId);
          if (source) {
            const groupId = 'qr-template-group-' + hash(template.id + sourceId);
            modifierGroupIds.push(groupId);
            if (!groups.some((g) => g.id === groupId))
              groups.push({ ...source, id: groupId, options: source.options.map((o, i) => ({ ...o, id: groupId + '-' + i, groupId })) });
          }
        }
        items.push({
          ...item,
          id: itemId,
          categoryId: id,
          price,
          isAvailable: true,
          qrEnabled: true,
          modifierGroupIds,
          ...(taxId ? { taxGroupId: taxId } : {})
        });
      }
    }
    if (cats.length) await writeMany('MENU_CATEGORY', cats);
    if (groups.length) await writeMany('MODIFIER_GROUP', groups);
    if (items.length) await writeMany('MENU_ITEM', items);
    saved.current = true;
    setNotice(items.length + ' dishes saved to the shared draft; ' + skipped + ' existing dishes kept. Review before publishing.');
    setStep(2);
  }
  return (
    <div className="space-y-5">
      <section className={box}>
        <h2 className="text-xl font-bold">Set up your guest menu</h2>
        <p>
          Choose a cuisine, select whole categories, review your prices and options, then publish. Existing dishes stay intact. Menu changes are shared with
          your restaurant apps.
        </p>
        <ol className="flex flex-wrap gap-3">
          {['Choose template', 'Review dishes', 'Options & taxes', 'Publish review'].map((s, i) => (
            <li key={s}>
              <button
                className={button}
                aria-current={step === i ? 'step' : undefined}
                onClick={() => {
                  setStep(i);
                  void inspect();
                }}
              >
                {i + 1}. {s}
              </button>
            </li>
          ))}
        </ol>
      </section>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-4">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl bg-emerald-50 p-4">
          {notice}
        </p>
      )}
      {step === 0 && (
        <section className={box}>
          <label>
            Cuisine template
            <select
              className={field}
              aria-label="Cuisine template"
              value={templateId}
              onChange={async (e) => {
                const id = e.target.value;
                if (!(await requestQrLeave())) return;
                saved.current = false;
                setTemplateId(id);
                setChosen([]);
                setPrices({});
                setReviewed(false);
              }}
            >
              <option value="">Choose a restaurant niche</option>
              {PREBUILT_MENU_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} / {t.cuisine}
                </option>
              ))}
            </select>
          </label>
          {template && (
            <>
              <p>{template.description}</p>
              <button className={button} onClick={() => setChosen(template.categories.map((_, i) => i))}>
                Select complete template
              </button>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {template.categories.map((c, i) => (
                  <label key={i} className="rounded-xl border p-3 flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={chosen.includes(i)}
                      onChange={(e) => setChosen(e.target.checked ? [...chosen, i] : chosen.filter((n) => n !== i))}
                    />
                    {c.imageUrl && <CachedImg src={c.imageUrl} alt={c.name} className="w-16 h-16 rounded-lg object-cover" />}
                    <span>
                      {c.name}
                      <small className="block">{c.items.length} dishes</small>
                    </span>
                  </label>
                ))}
              </div>
              <button className={button} disabled={!chosen.length} onClick={() => setStep(1)}>
                Review selected dishes
              </button>
            </>
          )}
        </section>
      )}
      {step === 1 && (
        <section className={box}>
          <h3 className="font-bold">Suggested prices need your review</h3>
          <p>
            Review current pricing and local tax treatment. Variant surcharges retain the template's suggested price differences and can be edited before
            publication.
          </p>
          <div className="max-h-[55vh] overflow-auto grid gap-3 sm:grid-cols-2">
            {selected
              .flatMap((c) => c.items)
              .map((item) => (
                <article key={item.sku} className="rounded-xl border p-3">
                  <div className="flex gap-3">
                    {item.imageUrl && <CachedImg src={item.imageUrl} alt={item.name} className="h-20 w-20 rounded-lg object-cover" />}
                    <div>
                      <b>{item.name}</b>
                      <p className="text-xs">{item.description}</p>
                      <small>
                        {item.variants?.length || 0} variants / {item.addons?.length || 0} add-ons
                      </small>
                    </div>
                  </div>
                  <label>
                    Price for {item.name}
                    <input
                      className={field}
                      type="number"
                      min="0"
                      max="100000"
                      step=".01"
                      value={prices[item.sku] ?? item.suggestedPrice}
                      onChange={(e) => {
                        setReviewed(false);
                        setPrices({ ...prices, [item.sku]: Number(e.target.value) });
                      }}
                    />
                  </label>
                </article>
              ))}
          </div>
          <label>
            Exclusive tax percentage (confirm with your accountant)
            <input
              className={field}
              type="number"
              min="0"
              max="100"
              step=".01"
              value={tax}
              onChange={(e) => {
                setReviewed(false);
                setTax(e.target.value);
              }}
            />
          </label>
          <label className="block">
            <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} /> I reviewed these prices and tax settings
          </label>
          <button className={button} disabled={busy || !selected.length || !reviewed} onClick={() => void run(importDraft)}>
            Save selected template to draft
          </button>
          <p className="text-xs">A failed batch can leave draft records already saved. Retrying keeps duplicates; review all records before publishing.</p>
        </section>
      )}
      {step === 2 && (
        <section className={box}>
          <h3 className="font-bold">Author options and taxes</h3>
          <p>
            Save reusable option groups here, then attach them to dishes in Menu & Availability. Use the shared dish editor to correct prices, descriptions and
            photos before publishing.
          </p>
          <button className={button} onClick={() => setOption({ name: '', required: false, options: [{ name: '', priceDelta: 0 }] })}>
            Create variants / add-ons
          </button>{' '}
          <button className={button} onClick={() => setTaxDraft({ name: '', rate: 0, inclusive: false })}>
            Create tax group
          </button>
          <a className={button} href="?tab=MENU">
            Edit dishes and attach options
          </a>
          <button
            className={button}
            onClick={() => {
              setStep(3);
              void inspect();
            }}
          >
            Review publication
          </button>
        </section>
      )}
      {step === 3 && (
        <section className={box}>
          <h3 className="font-bold">Guest publication review</h3>
          <details><summary>Changes to the published menu: {review?.changes?.added?.length||0} added / {review?.changes?.updated?.length||0} updated / {review?.changes?.removed?.length||0} removed</summary>{(['added','updated','removed'] as const).map(kind=><div key={kind}><b>{kind}</b><ul>{review?.changes?.[kind]?.map((i:any)=><li key={i.id}>{i.name}</li>)}</ul></div>)}</details>
          <p>
            Published version {review?.publishedVersion || 0} / {review?.hasUnpublishedChanges ? 'Changes waiting' : 'Up to date'}. Publishing changes the
            shared restaurant menu.
          </p>
          <p>
            {preview?.items?.length || 0} visible dishes / {preview?.hidden?.length || 0} hidden dishes
          </p>
          {[...(review?.errors || []), ...(review?.warnings || [])].map((m, i) => (
            <p key={i}>{m}</p>
          ))}
          <details>
            <summary>Why dishes are hidden</summary>
            <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(preview?.hidden || [], null, 2)}</pre>
          </details>
          <div className="grid gap-3 sm:grid-cols-3">
            {preview?.items?.slice(0, 12).map((i: any) => (
              <article key={i.id} className="rounded-xl border p-3">
                {i.imageUrl && <CachedImg src={i.imageUrl} alt={i.name} className="w-full h-32 rounded-lg object-cover" />}
                <b>{i.name}</b>
                <p>{formatINR(i.price)}</p>
                <small>{i.options?.length || 0} option groups</small>
              </article>
            ))}
          </div>
          <button
            className={button}
            disabled={busy || !review?.hasUnpublishedChanges || !!review?.errors?.length}
            onClick={() =>
              void run(async () => {
                await qrApi('/api/v1/menu/publish', { method: 'POST', body: JSON.stringify({ note: 'QR guided onboarding publication' }) });
                saved.current = true;
                setNotice('Shared menu published. Check your table QR on a phone before opening service.');
              })
            }
          >
            Publish reviewed menu
          </button>
        </section>
      )}
      <Modal isOpen={!!option} title="Create option group" onClose={async () => {if(!busy && await requestQrLeave())setOption(null);}}>
        {option && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const id = crypto.randomUUID();
                await writeMany('MODIFIER_GROUP', [
                  {
                    id,
                    name: option.name,
                    isRequired: option.required,
                    minSelections: option.required ? 1 : 0,
                    maxSelections: option.required ? 1 : option.options.length,
                    options: option.options.map((o: any, i: number) => ({ id: id + '-' + i, ...o, isAvailable: true, isDefault: option.required && i === 0 }))
                  }
                ]);
                setOption(null);
                setNotice('Option group saved; attach it in the dish editor.');
              });
            }}
          >
            <label>
              Group name
              <input className={field} required maxLength={120} value={option.name} onChange={(e) => setOption({ ...option, name: e.target.value })} />
            </label>
            <label>
              <input type="checkbox" checked={option.required} onChange={(e) => setOption({ ...option, required: e.target.checked })} /> Required single choice
              (variant)
            </label>
            {option.options.map((o: any, i: number) => (
              <div className="grid grid-cols-2 gap-2" key={i}>
                <label>
                  Option {i + 1} name
                  <input
                    className={field}
                    required
                    value={o.name}
                    onChange={(e) =>
                      setOption({ ...option, options: option.options.map((v: any, n: number) => (n === i ? { ...v, name: e.target.value } : v)) })
                    }
                  />
                </label>
                <label>
                  Extra price (INR)
                  <input
                    className={field}
                    type="number"
                    min="0"
                    step=".01"
                    required
                    value={o.priceDelta}
                    onChange={(e) =>
                      setOption({ ...option, options: option.options.map((v: any, n: number) => (n === i ? { ...v, priceDelta: Number(e.target.value) } : v)) })
                    }
                  />
                </label>
              </div>
            ))}
            <button
              type="button"
              className={button}
              disabled={option.options.length >= 30}
              onClick={() => setOption({ ...option, options: [...option.options, { name: '', priceDelta: 0 }] })}
            >
              Add option
            </button>
            <button className={button} disabled={busy}>
              Save option group
            </button>{error&&<p role="alert">{error}</p>}
          </form>
        )}
      </Modal>
      <Modal isOpen={!!taxDraft} title="Create tax group" onClose={async () => {if(!busy && await requestQrLeave())setTaxDraft(null);}}>
        {taxDraft && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const id = crypto.randomUUID(),
                  rate = Number(taxDraft.rate);
                await writeMany('TAX_GROUP', [
                  { id, name: taxDraft.name, cgstPercent: rate / 2, sgstPercent: rate / 2, igstPercent: rate, isInclusive: taxDraft.inclusive, isActive: true }
                ]);
                setTaxDraft(null);
                setNotice('Tax group saved; assign it to dishes before publication.');
              });
            }}
          >
            <label>
              Tax group name
              <input className={field} required value={taxDraft.name} onChange={(e) => setTaxDraft({ ...taxDraft, name: e.target.value })} />
            </label>
            <label>
              Tax percentage
              <input
                className={field}
                type="number"
                min="0"
                max="100"
                step=".01"
                required
                value={taxDraft.rate}
                onChange={(e) => setTaxDraft({ ...taxDraft, rate: Number(e.target.value) })}
              />
            </label>
            <label>
              <input type="checkbox" checked={taxDraft.inclusive} onChange={(e) => setTaxDraft({ ...taxDraft, inclusive: e.target.checked })} /> Price includes
              this tax
            </label>
            <button className={button} disabled={busy}>
              Save tax group
            </button>{error&&<p role="alert">{error}</p>}
          </form>
        )}
      </Modal>
      {activeAdminBranch && activeAdminBranch !== 'all' && <PlanOnboarding apps={['QR_ORDERING']} branchId={activeAdminBranch} counts={{menu:preview?.items?.length ?? 0,tables:0,staff:0,printers:0,kiosks:0}} onNavigate={page=>onNavigate?.(page==='QR_ORDERING'?'TABLES':page)}/>}
    </div>
  );
}
