// data/*.json -> site/*.json kompakt site ihracati (ana site bunu ceker).
// Kayit bicimi: [ad, ilce, telefon, web, lat, lng, kaynak, id]
// Kullanim: node scripts/site_disari.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

mkdirSync('site', { recursive: true })
let toplam = 0
for (const sehir of readdirSync('data')) {
  const d = join('data', sehir)
  if (!statSync(d).isDirectory()) continue
  mkdirSync(join('site', sehir), { recursive: true })
  for (const f of readdirSync(d)) {
    if (!f.endsWith('.json') || f === '_ozet.json') continue
    const sektor = f.replace('.json', '')
    const kayitlar = JSON.parse(readFileSync(join(d, f), 'utf8'))
      .map((k) => [
        k.ad, k.ilce || '', k.telefon || '', k.web || '',
        k.lat != null ? Number(k.lat.toFixed(4)) : null,
        k.lng != null ? Number(k.lng.toFixed(4)) : null,
        k.kaynak || 'osm', k.fsq_id || (k.osm_url || '').split('/').pop() || '',
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'tr'))
    writeFileSync(join('site', sehir, sektor + '.json'),
      JSON.stringify({ sehir, sektor, n: kayitlar.length, kayitlar }) + '\n')
    toplam += kayitlar.length
  }
}
console.log('site/ ihracati:', toplam, 'kayit')
