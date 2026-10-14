/** Stored ZIP entries: browser-native, UTF-8 names, CRC-32. No third-party download service. */
export function createQrZip(files: Array<{ name: string; content: string | Uint8Array }>): Blob {
  const encoder = new TextEncoder(),
    parts: Uint8Array[] = [],
    central: Uint8Array[] = [];
  let offset = 0;
  const crc = (data: Uint8Array) => {
    let c = 0xffffffff;
    for (const byte of data) {
      c ^= byte;
      for (let n = 0; n < 8; n++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  for (const file of files) {
    if (/(^|\/)\.\.(\/|$)|^[/\\]/.test(file.name)) throw Error('Unsafe archive name');
    const name = encoder.encode(file.name),
      data = typeof file.content === 'string' ? encoder.encode(file.content) : file.content,
      checksum = crc(data),
      local = new Uint8Array(30 + name.length),
      v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x800, true);
    v.setUint16(12, 33, true);
    v.setUint32(14, checksum, true);
    v.setUint32(18, data.length, true);
    v.setUint32(22, data.length, true);
    v.setUint16(26, name.length, true);
    local.set(name, 30);
    parts.push(local, data);
    const entry = new Uint8Array(46 + name.length),
      e = new DataView(entry.buffer);
    e.setUint32(0, 0x02014b50, true);
    e.setUint16(4, 20, true);
    e.setUint16(6, 20, true);
    e.setUint16(8, 0x800, true);
    e.setUint16(14, 33, true);
    e.setUint32(16, checksum, true);
    e.setUint32(20, data.length, true);
    e.setUint32(24, data.length, true);
    e.setUint16(28, name.length, true);
    e.setUint32(42, offset, true);
    entry.set(name, 46);
    central.push(entry);
    offset += local.length + data.length;
  }
  const size = central.reduce((n, e) => n + e.length, 0),
    end = new Uint8Array(22),
    v = new DataView(end.buffer);
  v.setUint32(0, 0x06054b50, true);
  v.setUint16(8, files.length, true);
  v.setUint16(10, files.length, true);
  v.setUint32(12, size, true);
  v.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end] as BlobPart[], { type: 'application/zip' });
}
