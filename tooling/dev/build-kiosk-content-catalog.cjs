// One-time migration of customer-visible JSX literals into the editable kiosk copy catalogue.
const fs = require('node:fs');
const ts = require('typescript');
const crypto = require('node:crypto');
const file = 'apps/kiosk-system/kiosk-user/src/App.tsx';
const source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const start = source.indexOf('  return (\n    <JAMANVAARStartup appName="Self-Order Kiosk"');
if (start < 0) throw Error('Customer render boundary not found');
const edits = [], catalog = {};
function decode(value) { return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'"); }
function visit(node) {
  if (ts.isJsxText(node) && node.pos >= start) {
    const text = decode(node.text.replace(/\s+/g, ' ').trim());
    if (text && /[a-zA-Z]/.test(text)) {
      const key = 'screen_' + text.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 55) + '_' + crypto.createHash('sha256').update(text).digest('hex').slice(0, 6);
      catalog[key] = text;
      edits.push({ start: node.pos, end: node.end, value: `{kioskCopy(${JSON.stringify(key)}, ${JSON.stringify(text)})}` });
    }
  }
  ts.forEachChild(node, visit);
}
visit(tree);
if (!edits.length) throw Error('Catalogue migration already applied; do not rerun');
let updated = source;
for (const edit of edits.sort((a, b) => b.start - a.start)) updated = updated.slice(0, edit.start) + edit.value + updated.slice(edit.end);
fs.writeFileSync(file, updated);
fs.writeFileSync('packages/i18n/src/kiosk_content_catalog.ts', `/** Customer kiosk copy that restaurants can override per language. */\nexport const KIOSK_CONTENT_CATALOG: Record<string, string> = ${JSON.stringify(catalog, null, 2)};\n`);
console.log(`Migrated ${edits.length} labels into ${Object.keys(catalog).length} editable entries.`);
