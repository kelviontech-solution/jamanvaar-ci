#!/usr/bin/env node
// Mechanically replaces raw Tailwind arbitrary-hex brand-color utilities
// (e.g. bg-[#0B253A]) with the equivalent named jaman-* token utility
// (bg-jaman-navy), for the 10 known brand hex values. Same computed
// color, different source — a refactor, not a redesign. Case-insensitive
// on the hex digits; preserves any /NN opacity suffix.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const TOKEN_MAP = {
  '0B253A': 'navy',
  '0B2B39': 'deepNavy',
  E66817: 'saffron',
  F97316: 'orange',
  FBF9F5: 'ivory',
  FAF7F2: 'cream',
  '00A99D': 'teal',
  '0D9488': 'darkTeal',
  EBE6DD: 'border',
  '1E3A4C': 'darkBorder'
};

const EXTENSIONS = new Set(['.ts', '.tsx', '.css']);

function buildPattern() {
  const hexAlternation = Object.keys(TOKEN_MAP).join('|');
  // group 1: utility prefix (e.g. "bg", "border-l", "text")
  // group 2: the hex digits (case-insensitive)
  // group 3: optional "/NN" opacity suffix
  return new RegExp(`([a-zA-Z][a-zA-Z-]*)-\\[#(${hexAlternation})\\](\\/\\d+)?`, 'gi');
}

function replaceInContent(content) {
  const pattern = buildPattern();
  let count = 0;
  const result = content.replace(pattern, (match, prefix, hex, opacity = '') => {
    const canonicalHex = Object.keys(TOKEN_MAP).find((h) => h.toLowerCase() === hex.toLowerCase());
    if (!canonicalHex) return match; // defensive: unknown hex, leave untouched
    count += 1;
    return `${prefix}-jaman-${TOKEN_MAP[canonicalHex]}${opacity}`;
  });
  return { result, count };
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
      walk(full, files);
    } else if (EXTENSIONS.has(extname(full))) {
      files.push(full);
    }
  }
  return files;
}

function main() {
  const root = process.argv[2];
  if (!root) {
    console.error('Usage: node scripts/replace-brand-color-tokens.mjs <root-dir>');
    process.exit(1);
  }
  const files = walk(root);
  let totalCount = 0;
  let filesChanged = 0;
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const { result, count } = replaceInContent(content);
    if (count > 0) {
      writeFileSync(file, result, 'utf8');
      totalCount += count;
      filesChanged += 1;
    }
  }
  console.log(`Replaced ${totalCount} occurrences across ${filesChanged} files.`);
}

main();
