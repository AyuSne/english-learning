import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = 'D:\\AAAA英语\\真题PDF';

const folders = (await readdir(ROOT, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
const rows = [];
for (const folder of folders) {
  for (const name of await readdir(path.join(ROOT, folder))) {
    if (!name.toLowerCase().endsWith('.pdf')) continue;
    const file = path.join(ROOT, folder, name);
    const buf = await readFile(file);
    const head = buf.subarray(0, 8).toString('latin1');
    const tail = buf.subarray(Math.max(0, buf.length - 2048)).toString('latin1');
    rows.push({
      folder, name, file, size: buf.length,
      head: head.startsWith('%PDF-'),
      eof: tail.includes('%%EOF'),
      hash: createHash('sha256').update(buf).digest('hex'),
    });
  }
}

const badHead = rows.filter((r) => !r.head);
const badEof = rows.filter((r) => !r.eof);
console.log(`files=${rows.length} badHeader=${badHead.length} missingEOF=${badEof.length}`);

const byHash = new Map();
for (const r of rows) {
  if (!byHash.has(r.hash)) byHash.set(r.hash, []);
  byHash.get(r.hash).push(`${r.folder}/${r.name}`);
}
const dups = [...byHash.values()].filter((v) => v.length > 1);
console.log(`distinct content=${byHash.size} duplicateGroups=${dups.length}`);
for (const d of dups.slice(0, 10)) console.log('DUP', d.join(' | '));

const small = rows.filter((r) => r.size < 120000);
console.log(`files<120KB: ${small.length}`);
for (const s of small) console.log('  small', s.folder, s.name, s.size);

// compare with the manually saved paper in the working dir
try {
  const manual = 'D:\\AAAA英语\\2025年12月英语六级真题(第1套).pdf';
  const m = await readFile(manual);
  const mh = createHash('sha256').update(m).digest('hex');
  const match = rows.find((r) => r.hash === mh);
  console.log(`manual file sha=${mh.slice(0, 16)} size=${m.length}`);
  console.log('manual matches downloaded:', match ? `${match.folder}/${match.name}` : 'NONE');
} catch (e) {
  console.log('manual compare skipped:', e.message);
}
