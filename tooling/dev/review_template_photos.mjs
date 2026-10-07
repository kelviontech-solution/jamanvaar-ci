import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const source = 'packages/assets/menu/template-photos-v1';
const existing = process.argv.includes('--existing');
const allPhotos = (existing ? [...new Map(JSON.parse(fs.readFileSync('logs/template-image-inventory.json', 'utf8')).unique.filter(item => item.imageUrl?.endsWith('.jpg')).map(item => [item.imageUrl, { name: item.name, file: item.imageUrl.replace('/assets/menu/', ''), existing: true }])).values()] : fs.readdirSync(`${source}/metadata`).filter(name => name.endsWith('.json')).map(name => JSON.parse(fs.readFileSync(`${source}/metadata/${name}`, 'utf8')))).sort((a, b) => a.name.localeCompare(b.name));
const unreviewed = process.argv.includes('--unreviewed');
const reviewed = new Set(unreviewed ? JSON.parse(fs.readFileSync('logs/template-photos-reviewed.json', 'utf8')) : []);
const photos = allPhotos.filter(photo => !reviewed.has(photo.id));
const target = existing ? 'logs/template-photo-review-existing' : unreviewed ? 'logs/template-photo-review-remaining' : 'logs/template-photo-review';
fs.mkdirSync(target, { recursive: true });
fs.writeFileSync(`${target}/index.json`, JSON.stringify(photos.map(photo => ({ id: photo.id, name: photo.name, file: photo.file })), null, 2));
const escape = text => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));
for (let start = 0; start < photos.length; start += 24) {
  const page = photos.slice(start, start + 24), tiles = [];
  for (const [index, photo] of page.entries()) {
    const left = (index % 4) * 256, top = Math.floor(index / 4) * 220;
    tiles.push({ input: await sharp(path.join(existing ? 'packages/assets/menu' : source, photo.file)).resize(248, 165, { fit: 'inside' }).toBuffer(), left: left + 4, top: top + 4 });
    const words = photo.name.split(' '), lines = [''];
    for (const word of words) { if ((lines[lines.length - 1] + word).length > 32) lines.push(''); lines[lines.length - 1] += word + ' '; }
    const svg = `<svg width="256" height="52" xmlns="http://www.w3.org/2000/svg"><rect width="256" height="52" fill="white"/><g font-family="Arial" font-size="12" fill="#142d3f">${lines.slice(0, 3).map((line, i) => `<text x="6" y="${14 + i * 14}">${escape(line)}</text>`).join('')}</g></svg>`;
    tiles.push({ input: Buffer.from(svg), left, top: top + 169 });
  }
  await sharp({ create: { width: 1024, height: Math.ceil(page.length / 4) * 220, channels: 3, background: '#ffffff' } }).composite(tiles).jpeg({ quality: 88 }).toFile(`${target}/page-${String(start / 24 + 1).padStart(2, '0')}.jpg`);
}
console.log(JSON.stringify({ photos: photos.length, pages: Math.ceil(photos.length / 24), directory: target }));
