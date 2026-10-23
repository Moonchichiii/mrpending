// @vitest-environment node
import { readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { expect, test } from 'vitest';

const css = readFileSync(new URL('global.css', import.meta.url), 'utf8');
const publicDir = new URL('../../public/', import.meta.url);

// WOFF2 known-table tags by flag index, up to fvar (47); index 63 means an explicit tag follows.
const knownTags = (
  'cmap,head,hhea,hmtx,maxp,name,OS/2,post,cvt ,fpgm,glyf,loca,prep,CFF ,VORG,EBDT,EBLC,gasp,hdmx,kern,LTSH,PCLT,VDMX,vhea,' +
  'vmtx,BASE,GDEF,GPOS,GSUB,EBSC,JSTF,MATH,CBDT,CBLC,COLR,CPAL,SVG ,sbix,acnt,avar,bdat,bloc,bsln,cvar,fdsc,feat,fmtx,fvar'
).split(',');

// The wght axis of a variable WOFF2 file as [min, max]; undefined for a static file.
const weightAxis = (file: Buffer): [number, number] | undefined => {
  const tableCount = file.readUInt16BE(12);
  const compressedLength = file.readUInt32BE(20);
  let at = 48;
  const uintBase128 = () => {
    let value = 0;
    for (;;) {
      const byte = file[at++] ?? 0;
      value = value * 128 + (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }
  };
  const tables: { tag: string; length: number }[] = [];
  for (let i = 0; i < tableCount; i++) {
    const flags = file[at++] ?? 0;
    let tag = knownTags[flags & 0x3f] ?? '';
    if ((flags & 0x3f) === 0x3f) {
      tag = file.toString('latin1', at, at + 4);
      at += 4;
    }
    const version = flags >> 6;
    const length = uintBase128();
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
    tables.push({ tag, length: transformed ? uintBase128() : length });
  }
  const data = brotliDecompressSync(file.subarray(at, at + compressedLength));
  let offset = 0;
  for (const { tag, length } of tables) {
    if (tag === 'fvar') {
      const fvar = data.subarray(offset, offset + length);
      const axesOffset = fvar.readUInt16BE(4);
      const axisSize = fvar.readUInt16BE(10);
      for (let axis = 0; axis < fvar.readUInt16BE(8); axis++) {
        const record = axesOffset + axis * axisSize;
        if (fvar.toString('latin1', record, record + 4) !== 'wght') continue;
        return [fvar.readInt32BE(record + 4) / 65536, fvar.readInt32BE(record + 12) / 65536];
      }
    }
    offset += length;
  }
  return undefined;
};

const faces = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map(([, body = '']) => ({
  family: /font-family:\s*'?([^';]+)'?;/.exec(body)?.[1],
  src: /url\('([^']+)'\)/.exec(body)?.[1] ?? '',
  weights: (/font-weight:\s*([\d ]+);/.exec(body)?.[1] ?? '').trim().split(/\s+/).map(Number),
}));

test('global.css declares the three self-hosted families', () => {
  expect(faces.map(({ family }) => family)).toEqual(['Fredoka', 'Nunito', 'Patrick Hand']);
});

test.each(faces)('$family declares only weights its file contains', ({ src, weights }) => {
  // A static file holds exactly one weight, so its face may declare only that one.
  const [min = 0, max = 0] = weightAxis(readFileSync(new URL(`.${src}`, publicDir))) ?? [
    weights[0],
    weights[0],
  ];
  for (const weight of weights) {
    expect(weight).toBeGreaterThanOrEqual(min);
    expect(weight).toBeLessThanOrEqual(max);
  }
});

test('Fredoka offers the 700 weight the display controls and stamps request', () => {
  const fredoka = faces.find(({ family }) => family === 'Fredoka');
  expect(fredoka?.weights.at(-1)).toBeGreaterThanOrEqual(700);
});
