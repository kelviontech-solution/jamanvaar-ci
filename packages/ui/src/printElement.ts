/**
 * Prints ONE element of the page instead of the whole app (BUG-037).
 *
 * Calling window.print() on these apps prints the app shell: fixed-height screens with scroll
 * containers, so only the first screenful (or a blank page) came out, with the sidebar and header
 * around it. Here the chosen element is isolated in place for the duration of the print:
 *  - every ancestor of the element is released from fixed heights, scrolling and positioning, and
 *  - every sibling along the way is hidden,
 * so the browser paginates just that document. Existing `print:` styles and the page's own
 * stylesheets keep applying, which is why this is done in place rather than in a copied frame.
 * Everything is undone when printing ends.
 */
export interface PrintNodeLike {
  parentElement: PrintNodeLike | null;
  children: ArrayLike<PrintNodeLike>;
  classList: { add(name: string): void; remove(name: string): void };
  tagName?: string;
}

export interface PrintEnvironment {
  querySelector(selector: string): PrintNodeLike | null;
  body: PrintNodeLike;
  head: { appendChild(node: unknown): unknown };
  createStyle(css: string): { remove(): void };
  getTitle(): string;
  setTitle(title: string): void;
  print(): void;
  onAfterPrint(handler: () => void): () => void;
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

export interface PrintOptions {
  /** Used as the document title, which browsers offer as the file name when saving as PDF. */
  title?: string;
  /** CSS `@page` size, for example "A4 portrait" (default), "A5", "80mm auto". */
  pageSize?: string;
  /** CSS `@page` margin (default 10mm). */
  margin?: string;
}

export const PRINT_CHAIN_CLASS = 'jv-print-chain';
export const PRINT_HIDE_CLASS = 'jv-print-hide';
export const PRINT_TARGET_CLASS = 'jv-print-target';

export function printStyles(options: PrintOptions = {}): string {
  const size = options.pageSize ?? 'A4 portrait';
  const margin = options.margin ?? '10mm';
  return `
@page { size: ${size}; margin: ${margin}; }
@media print {
  html, body, #root { height: auto !important; min-height: 0 !important; max-height: none !important; overflow: visible !important; background: #ffffff !important; }
  .${PRINT_HIDE_CLASS}, .no-print { display: none !important; }
  .${PRINT_CHAIN_CLASS} {
    position: static !important; inset: auto !important; transform: none !important;
    height: auto !important; min-height: 0 !important; max-height: none !important;
    width: auto !important; max-width: none !important;
    overflow: visible !important; margin: 0 !important; padding: 0 !important;
    border: 0 !important; box-shadow: none !important; background: #ffffff !important;
    backdrop-filter: none !important;
  }
  .${PRINT_TARGET_CLASS} { width: 100% !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;
}

function browserEnvironment(): PrintEnvironment | null {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;
  return {
    querySelector: (selector) => document.querySelector(selector) as unknown as PrintNodeLike | null,
    body: document.body as unknown as PrintNodeLike,
    head: document.head,
    createStyle: (css) => {
      const style = document.createElement('style');
      style.setAttribute('data-jv-print', 'true');
      style.textContent = css;
      document.head.appendChild(style);
      return { remove: () => style.remove() };
    },
    getTitle: () => document.title,
    setTitle: (title) => {
      document.title = title;
    },
    print: () => window.print(),
    onAfterPrint: (handler) => {
      window.addEventListener('afterprint', handler);
      return () => window.removeEventListener('afterprint', handler);
    },
    setTimeout: (handler, ms) => window.setTimeout(handler, ms),
    clearTimeout: (id) => window.clearTimeout(id as number)
  };
}

/** Marks the chain from `target` up to the body and hides its siblings. Returns the undo function. */
export function isolateForPrint(target: PrintNodeLike, body: PrintNodeLike): () => void {
  const marked: Array<{ node: PrintNodeLike; cls: string }> = [];
  const mark = (node: PrintNodeLike, cls: string) => {
    node.classList.add(cls);
    marked.push({ node, cls });
  };

  mark(target, PRINT_TARGET_CLASS);
  let node: PrintNodeLike | null = target;
  while (node && node !== body) {
    mark(node, PRINT_CHAIN_CLASS);
    const parent: PrintNodeLike | null = node.parentElement;
    if (!parent) break;
    for (let i = 0; i < parent.children.length; i += 1) {
      const sibling = parent.children[i];
      const tag = sibling.tagName?.toUpperCase();
      if (sibling !== node && tag !== 'STYLE' && tag !== 'SCRIPT' && tag !== 'LINK') mark(sibling, PRINT_HIDE_CLASS);
    }
    node = parent;
  }
  mark(body, PRINT_CHAIN_CLASS);

  return () => {
    for (const { node: n, cls } of marked) n.classList.remove(cls);
  };
}

/**
 * Prints the element matching `target` (a selector) and nothing else.
 * Resolves true once the print dialog has been shown, false when the element is not on the page.
 */
export function printElement(target: string, options: PrintOptions = {}, env: PrintEnvironment | null = browserEnvironment()): boolean {
  if (!env) return false;
  const element = env.querySelector(target);
  if (!element) return false;

  const undoIsolation = isolateForPrint(element, env.body);
  const style = env.createStyle(printStyles(options));
  const originalTitle = env.getTitle();
  if (options.title) env.setTitle(options.title);

  let cleaned = false;
  let stopListening: () => void = () => undefined;
  let timer: unknown;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    stopListening();
    env.clearTimeout(timer);
    undoIsolation();
    style.remove();
    env.setTitle(originalTitle);
  };

  stopListening = env.onAfterPrint(cleanup);
  // Some webviews never fire afterprint; never leave the page hidden.
  timer = env.setTimeout(cleanup, 5 * 60_000);
  try {
    env.print();
  } catch (err) {
    cleanup();
    throw err;
  }
  return true;
}
