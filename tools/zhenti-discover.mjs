import { writeFile } from 'node:fs/promises';

const ORIGIN = 'https://zhenti.burningvocabulary.cn';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const SECTIONS = [
  { key: 'cet4', label: '四级', list: '/cet4', re: /\/cet4\/(\d{4}-\d{2})\/(\d{2})/g },
  { key: 'cet6', label: '六级', list: '/cet6', re: /\/cet6\/(\d{4}-\d{2})\/(\d{2})/g },
  { key: 'kaoyan', label: '考研', list: '/kaoyan', re: /\/kaoyan\/(\d{4})\/(\d{2})/g },
  { key: 'tem4', label: '专四', list: '/tem4', re: /\/tem4\/(\d{4})(?![\d/-])/g },
  { key: 'tem8', label: '专八', list: '/tem8', re: /\/tem8\/(\d{4})(?![\d/-])/g },
];

async function get(url, referer = ORIGIN + '/') {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: referer, 'Accept-Language': 'zh-CN,zh;q=0.9' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function extractConfig(html) {
  const marker = 'var globalConfig = ';
  const start = html.indexOf(marker);
  if (start < 0) return null;
  const i = start + marker.length;
  if (html[i] !== '{') return null;
  let depth = 0, inStr = false, esc = false;
  for (let j = i; j < html.length; j++) {
    const c = html[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(html.slice(i, j + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

function pdfUrl(cfg) {
  const shuffled = (cfg.fn.f1.join('') + cfg.fn.f2.join(''));
  const name = [...shuffled].reverse().join('');
  const host = cfg.pdfHost || 'https://res-zhenti.burningvocabulary.cn';
  return `${host}/images/read/${cfg.filePath}/${name}.pdf${cfg.fnameVersion ? `?v=${cfg.fnameVersion}` : ''}`;
}

function safeName(s) {
  return s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let idx = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const my = idx++;
      if (my >= items.length) return;
      out[my] = await fn(items[my], my);
    }
  }));
  return out;
}

const manifest = [];

for (const sec of SECTIONS) {
  const html = await get(ORIGIN + sec.list);
  const found = new Map();
  for (const m of html.matchAll(sec.re)) {
    const path = `/${sec.key}/` + (sec.key === 'kaoyan' ? `${m[1]}/${m[2]}` : sec.key.startsWith('tem') ? m[1] : `${m[1]}/${m[2]}`);
    found.set(path, true);
  }
  const paths = [...found.keys()];
  console.log(`[${sec.key}] list -> ${paths.length} papers`);

  const entries = await mapLimit(paths, 6, async (path) => {
    const url = ORIGIN + path;
    try {
      const page = await get(url, ORIGIN + sec.list);
      const cfg = extractConfig(page);
      if (!cfg || !cfg.fn) return { section: sec.key, path, url, error: cfg ? 'no fn field' : 'no globalConfig' };
      return {
        section: sec.key,
        sectionLabel: sec.label,
        path,
        pageUrl: url,
        title: safeName(cfg.title || path),
        pdf: pdfUrl(cfg),
        fnameVersion: cfg.fnameVersion ?? null,
      };
    } catch (e) {
      return { section: sec.key, path, url, error: String(e.message || e) };
    }
  });

  for (const e of entries) manifest.push(e);
  const ok = entries.filter((e) => !e.error).length;
  console.log(`[${sec.key}] parsed ${ok}/${entries.length}`);
}

const ok = manifest.filter((m) => !m.error);
const bad = manifest.filter((m) => m.error);
await writeFile(new URL('./papers.json', import.meta.url), JSON.stringify({ generatedAt: new Date().toISOString(), ok, bad }, null, 2), 'utf8');
console.log(`TOTAL ok=${ok.length} bad=${bad.length}`);
for (const b of bad) console.log('  BAD', b.path, b.error);
