// Minimal WOFF2 reader: enough to read the fvar axes and the cmap (both are stored untransformed) of a variable font.
import fs from 'node:fs';
import zlib from 'node:zlib';

const TAGS = ['cmap','head','hhea','hmtx','maxp','name','OS/2','post','cvt ','fpgm','glyf','loca','prep','CFF ','VORG','EBDT','EBLC','gasp','hdmx','kern','LTSH','PCLT','VDMX','vhea','vmtx','BASE','GDEF','GPOS','GSUB','EBSC','JSTF','MATH','CBDT','CBLC','COLR','CPAL','SVG ','sbix','acnt','avar','bdat','bloc','bsln','cvar','fdsc','feat','fmtx','fvar','gvar','hsty','just','lcar','mort','morx','opbd','prop','trak','Zapf','Silf','Glat','Gloc','Feat','Sill'];

export function readWoff2(file) {
  const b = fs.readFileSync(file);
  if (b.toString('latin1', 0, 4) !== 'wOF2') throw new Error('not a woff2 file');
  const numTables = b.readUInt16BE(12), compSize = b.readUInt32BE(20);
  let p = 48;
  const b128 = () => { let v = 0; for (let i = 0; i < 5; i++) { const c = b[p++]; v = (v << 7) | (c & 127); if (!(c & 128)) return v >>> 0; } throw new Error('bad UIntBase128'); };
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const flags = b[p++]; const idx = flags & 63, xf = flags >> 6;
    const tag = idx === 63 ? (p += 4, b.toString('latin1', p - 4, p)) : TAGS[idx];
    const orig = b128();
    const transformed = (tag === 'glyf' || tag === 'loca') ? xf === 0 : xf !== 0;
    const len = transformed ? b128() : orig;
    tables.push({ tag, orig, len });
  }
  const data = zlib.brotliDecompressSync(b.subarray(p, p + compSize));
  let off = 0;
  const out = {};
  for (const t of tables) { out[t.tag] = data.subarray(off, off + t.len); off += t.len; }
  return out;
}

export function fvarAxes(file) {
  const t = readWoff2(file).fvar; if (!t) return [];
  const axesOff = t.readUInt16BE(4), count = t.readUInt16BE(8), size = t.readUInt16BE(10);
  const axes = [];
  for (let i = 0; i < count; i++) {
    const o = axesOff + i * size;
    axes.push({ tag: t.toString('latin1', o, o + 4), min: t.readInt32BE(o + 4) / 65536, def: t.readInt32BE(o + 8) / 65536, max: t.readInt32BE(o + 12) / 65536 });
  }
  return axes;
}

export function cmapCodepoints(file) {
  const t = readWoff2(file).cmap; const set = new Set();
  const n = t.readUInt16BE(2);
  for (let i = 0; i < n; i++) {
    const o = t.readUInt32BE(4 + i * 8 + 4), fmt = t.readUInt16BE(o);
    if (fmt === 4) {
      const segX2 = t.readUInt16BE(o + 6), endO = o + 14, startO = endO + segX2 + 2, deltaO = startO + segX2, rangeO = deltaO + segX2;
      for (let s = 0; s < segX2 / 2; s++) {
        const end = t.readUInt16BE(endO + s * 2), start = t.readUInt16BE(startO + s * 2), ro = t.readUInt16BE(rangeO + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let g = ro === 0 ? (c + t.readInt16BE(deltaO + s * 2)) & 0xffff : t.readUInt16BE(rangeO + s * 2 + ro + (c - start) * 2);
          if (g) set.add(c);
        }
      }
    } else if (fmt === 12) {
      const ng = t.readUInt32BE(o + 12);
      for (let g = 0; g < ng; g++) { const s = t.readUInt32BE(o + 16 + g * 12), e = t.readUInt32BE(o + 20 + g * 12); for (let c = s; c <= e; c++) set.add(c); }
    }
  }
  return set;
}
