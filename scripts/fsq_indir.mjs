// FSQ OS Places parquet'larini HF'den indirir (FSQ_HF_TOKEN gerekir).
// Kullanim: FSQ_HF_TOKEN=hf_... node scripts/fsq_indir.mjs
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'

const TOK = process.env.FSQ_HF_TOKEN
if (!TOK) { console.error('FSQ_HF_TOKEN yok'); process.exit(1) }
const H = { authorization: `Bearer ${TOK}` }
const api = async (p) => (await fetch('https://huggingface.co/api/datasets/foursquare/fsq-os-places/tree/main/' + p, { headers: H })).json()

const surumler = (await api('release')).filter((x) => x.type === 'directory' && /dt=\d{4}/.test(x.path)).map((x) => x.path)
const son = surumler.sort().pop()

// Parquet'ler ic ice dizinlerde olabilir (dt=.../<boluk>/...): agaci yuruyerek topla.
const parquetler = []
async function yuru(yol, derinlik = 0) {
  if (derinlik > 4) return
  for (const d of await api(yol)) {
    if (d.type === 'file' && d.path.endsWith('.parquet')) parquetler.push(d)
    else if (d.type === 'directory') await yuru(d.path, derinlik + 1)
  }
}
await yuru(son)
const dosyalar = parquetler
console.log(`${son}: ${dosyalar.length} parquet`)
mkdirSync('fsq', { recursive: true })
let i = 0
for (const d of dosyalar) {
  const ad = d.path.split('/').pop()
  const hedef = `fsq/${ad}`
  if (existsSync(hedef)) continue
  const r = await fetch(`https://huggingface.co/datasets/foursquare/fsq-os-places/resolve/main/${d.path}`, { headers: H })
  if (!r.ok) { console.error(`${ad}: ${r.status}`); process.exit(1) }
  writeFileSync(hedef, Buffer.from(await r.arrayBuffer()))
  console.log(`${++i}/${dosyalar.length} ${ad} (${(d.size / 1e6).toFixed(0)}MB)`)
}
console.log('indirim bitti')
