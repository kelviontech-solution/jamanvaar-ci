import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  isolateForPrint,
  printElement,
  printStyles,
  PRINT_CHAIN_CLASS,
  PRINT_HIDE_CLASS,
  PRINT_TARGET_CLASS,
  type PrintEnvironment,
  type PrintNodeLike
} from '../packages/ui/src/printElement';

/**
 * BUG-037: "Print" buttons called window.print() on the whole app page, so the printout was the app
 * shell (sidebar, header, one clipped screenful) rather than the invoice / report / QR card. A print now
 * isolates the intended element, and no app calls window.print() directly any more.
 */
class FakeNode implements PrintNodeLike {
  parentElement: FakeNode | null = null;
  children: FakeNode[] = [];
  classes = new Set<string>();
  constructor(public tagName: string, public id = '') {}
  classList = {
    add: (n: string) => void this.classes.add(n),
    remove: (n: string) => void this.classes.delete(n)
  };
  add(child: FakeNode) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
}

/** body > #root > [ sidebar, main > [ header, scroller > [ modal > [ doc > [ table ], toolbar ] ] ] ] */
function buildPage() {
  const body = new FakeNode('BODY');
  const root = body.add(new FakeNode('DIV', 'root'));
  const sidebar = root.add(new FakeNode('DIV', 'sidebar'));
  const main = root.add(new FakeNode('DIV', 'main'));
  const header = main.add(new FakeNode('DIV', 'header'));
  const scroller = main.add(new FakeNode('DIV', 'scroller'));
  const modal = scroller.add(new FakeNode('DIV', 'modal'));
  const doc = modal.add(new FakeNode('DIV', 'doc'));
  const table = doc.add(new FakeNode('TABLE', 'table'));
  const toolbar = modal.add(new FakeNode('DIV', 'toolbar'));
  const style = body.add(new FakeNode('STYLE', 'style'));
  return { body, root, sidebar, main, header, scroller, modal, doc, table, toolbar, style };
}

function fakeEnv(page: ReturnType<typeof buildPage>) {
  const log: string[] = [];
  const handlers: Array<() => void> = [];
  const styles: Array<{ css: string; removed: boolean }> = [];
  let title = 'App';
  const env: PrintEnvironment = {
    querySelector: (selector) => (selector === '[data-print-doc="doc"]' ? page.doc : null),
    body: page.body,
    head: { appendChild: () => undefined },
    createStyle: (css) => {
      const entry = { css, removed: false };
      styles.push(entry);
      return { remove: () => void (entry.removed = true) };
    },
    getTitle: () => title,
    setTitle: (t) => void (title = t),
    print: () => void log.push(`print:${title}`),
    onAfterPrint: (h) => {
      handlers.push(h);
      return () => void handlers.splice(handlers.indexOf(h), 1);
    },
    setTimeout: () => 0,
    clearTimeout: () => undefined
  };
  return { env, log, handlers, styles, getTitle: () => title };
}

describe('print isolation (BUG-037)', () => {
  it('marks the target, releases every ancestor and hides every other branch', () => {
    const p = buildPage();
    const undo = isolateForPrint(p.doc, p.body);

    expect(p.doc.classes.has(PRINT_TARGET_CLASS)).toBe(true);
    for (const ancestor of [p.doc, p.modal, p.scroller, p.main, p.root, p.body]) {
      expect(ancestor.classes.has(PRINT_CHAIN_CLASS), ancestor.id || 'body').toBe(true);
    }
    for (const other of [p.sidebar, p.header, p.toolbar]) {
      expect(other.classes.has(PRINT_HIDE_CLASS), other.id).toBe(true);
    }
    // the document's own content is left alone, and stylesheets are never hidden
    expect(p.table.classes.size).toBe(0);
    expect(p.style.classes.has(PRINT_HIDE_CLASS)).toBe(false);

    undo();
    for (const node of Object.values(p)) expect(node.classes.size, node.id || 'body').toBe(0);
  });

  it('printElement prints once with the document title, then restores everything after printing', () => {
    const p = buildPage();
    const { env, log, handlers, styles, getTitle } = fakeEnv(p);

    expect(printElement('[data-print-doc="doc"]', { title: 'Z-Report 2026-09-20' }, env)).toBe(true);
    expect(log).toEqual(['print:Z-Report 2026-09-20']);
    expect(p.sidebar.classes.has(PRINT_HIDE_CLASS)).toBe(true);
    expect(styles).toHaveLength(1);
    expect(styles[0].css).toContain('@media print');

    handlers.forEach((h) => h());
    expect(p.sidebar.classes.size).toBe(0);
    expect(p.doc.classes.size).toBe(0);
    expect(styles[0].removed).toBe(true);
    expect(getTitle()).toBe('App');
  });

  it('returns false and prints nothing when the element is not on the page', () => {
    const p = buildPage();
    const { env, log } = fakeEnv(p);
    expect(printElement('[data-print-doc="missing"]', {}, env)).toBe(false);
    expect(log).toEqual([]);
    expect(p.sidebar.classes.size).toBe(0);
  });

  it('restores the page even if the browser refuses to print', () => {
    const p = buildPage();
    const { env } = fakeEnv(p);
    env.print = () => {
      throw new Error('print blocked');
    };
    expect(() => printElement('[data-print-doc="doc"]', {}, env)).toThrow('print blocked');
    expect(p.sidebar.classes.size).toBe(0);
  });

  it('page size and margin are configurable', () => {
    expect(printStyles()).toContain('size: A4 portrait');
    expect(printStyles({ pageSize: '80mm auto', margin: '2mm' })).toMatch(/size: 80mm auto; margin: 2mm/);
  });
});

/** The buttons themselves: no app may call window.print() directly. */
const APP_DIRS = ['../apps/restaurant-system/pos-admin/src', '../apps/kiosk-system/kiosk-admin/src', '../cloud/super-admin-web/src'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe('no direct window.print() in the admin apps (BUG-037)', () => {
  const offenders: string[] = [];
  for (const dir of APP_DIRS) {
    for (const file of walk(join(__dirname, dir))) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (/window\.print\s*\(/.test(line) && !/^\s*\/\//.test(line)) offenders.push(`${file.replace(join(__dirname, '..'), '')}:${i + 1}`);
      });
    }
  }

  it('every print goes through printElement, which prints only the intended document', () => {
    expect(offenders).toEqual([]);
  });
});
