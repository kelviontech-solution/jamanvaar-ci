/**
 * One definition of the QR console's primary button, secondary button and form controls.
 * Each QR module used to declare its own near-identical copy (navy buttons, py-2 vs py-2.5, borders with no colour),
 * which is why equivalent actions and fields looked different from page to page.
 */
export const QR_BUTTON =
  'inline-flex items-center justify-center gap-2 rounded-xl min-h-11 px-4 py-2.5 text-sm font-bold text-white bg-brand hover:bg-brand-hover active:bg-brand-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed';
export const QR_BUTTON_SECONDARY =
  'inline-flex items-center justify-center gap-2 rounded-xl min-h-11 px-4 py-2.5 text-sm font-bold text-jaman-navy bg-white border border-jaman-border hover:bg-[#F5F3EE] hover:border-[#D8D1C3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed';
export const QR_FIELD =
  'mt-1 block w-full min-w-0 max-w-full min-h-11 rounded-xl border border-jaman-border bg-white px-3 py-2.5 text-sm text-jaman-navy placeholder:text-slate-400 hover:border-[#D8D1C3] focus:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30';
