import { readFile, mkdir, writeFile, rename, stat, open } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = 'D:\\AAAA英语\\真题PDF';
const MANIFEST = 'D:\\AAAA英语\\tools\\papers.json';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const FOLDER = { cet4: '四级', cet6: '六级', kaoyan: '考研英语', tem4: '专四', tem8: '专八' };

const { ok } = JSON.parse(await readFile(MANIFEST, 'utf8'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function looksValidPdf(file) {
  try {
    const s = await stat(file);
    if (s.size < 20000) return false;
    const fh = await open(file, 'r');
    const buf = Buffer.alloc(5);
    await fh.read(buf, 0, 5, 0);
    await fh.close();
    return buf.toString('latin1') === '%PDF-';
  } catch {
    return false;
  }
}

async function download(entry, attempt = 1) {
  const dir = path.join(ROOT, FOLDER[entry.section]);
  await mkdir(dir, { recursive: true });
  const dest = path.join(dir, `${entry.title}.pdf`);
  if (existsSync(dest) && (await looksValidPdf(dest))) {
    const s = await stat(dest);
    return { ...entry, dest, bytes: s.size, status: 'skip' };
  }
  const tmp = dest + '.part';
  try {
    const res = await fetch(entry.pdf, {
      headers: { 'User-Agent': UA, Referer: entry.pageUrl, 'Accept': 'application/pdf,*/*' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 20000 || buf.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new Error(`not a pdf (${buf.length} bytes)`);
    }
    await writeFile(tmp, buf);
    await rename(tmp, dest);
    return { ...entry, dest, bytes: buf.length, status: 'ok' };
  } catch (e) {
    if (attempt < 3) {
      await sleep(1200 * attempt);
      return download(entry, attempt + 1);
    }
    return { ...entry, dest, bytes: 0, status: 'fail', error: String(e.message || e) };
  }
}

const results = [];
let idx = 0, done = 0;
const CONCURRENCY = 5;
const started = Date.now();

await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (true) {
      const my = idx++;
      if (my >= ok.length) return;
      const e = ok[my];
      const r = await download(e);
      results[my] = r;
      done++;
      const mb = (r.bytes / 1048576).toFixed(1);
      console.log(`${String(done).padStart(3)}/${ok.length} [${r.status}] ${FOLDER[e.section]} ${e.title} ${mb}MB${r.error ? ' :: ' + r.error : ''}`);
      await sleep(80 + Math.floor(Math.random() * 120));
    }
  })
);

const good = results.filter((r) => r.status !== 'fail');
const bad = results.filter((r) => r.status === 'fail');
const totalBytes = good.reduce((a, r) => a + r.bytes, 0);

const csv = ['section,title,pages,filesize_bytes,status,local_path,source_pdf']
  .concat(results.map((r) => [r.section, r.title, r.pageUrl, r.bytes, r.status, r.dest, r.pdf]
    .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')))
  .join('\r\n');
await writeFile(path.join(ROOT, '下载清单.csv'), '\uFEFF' + csv, 'utf8');

const summary = { finishedAt: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 1000), ok: good.length, failed: bad.length, totalBytes };
await writeFile(path.join(ROOT, '下载清单.json'), JSON.stringify({ summary, results }, null, 2), 'utf8');

console.log('----');
console.log(`downloaded=${good.length} failed=${bad.length} totalMB=${(totalBytes / 1048576).toFixed(1)} seconds=${summary.seconds}`);
for (const b of bad) console.log('FAIL', b.section, b.title, b.error, b.pdf);
