// data/*.json -> site/*.json kompakt site ihracati (ana site bunu ceker).
// Isim temizligi: kaynaklardaki susleme artiklari (---Ad---, "Ad", *Ad*) kesilir.
const adTemiz = (ad) => {
  const t = String(ad || '').replace(/^[\s\-\*"'.,:;|]+|[\s\-\*"'.,:;|]+$/g, '').replace(/\s{2,}/g, ' ')
  return t || String(ad || '')
}
// Kayit bicimi: [ad, ilce, telefon, web, lat, lng, kaynak, id]
// Ayrica site/_sitemap-isletmeler.xml uretir: dizin 90 + DOLGUN vitrin URL'leri
// (sabit telefon veya web). Ince kunyeler bilincli disarida (olceklenmis icerik
// riski); slug/kimlik mantigi ana repo lib/isletmeler.js ile BIREBIR ayni.
// Kullanim: node scripts/site_disari.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { slugla, cepMi } from '../topla.mjs'

const SEHIR_SLUG = ['istanbul', 'ankara', 'izmir', 'bursa', 'antalya', 'eskisehir']
const SEHIR_AD = { istanbul: 'İstanbul', ankara: 'Ankara', izmir: 'İzmir', bursa: 'Bursa', antalya: 'Antalya', eskisehir: 'Eskişehir' }
const SEKTOR_SLUG = ['kuafor', 'guzellik-salonu', 'klinik', 'dis-klinigi', 'spor-salonu',
  'egitim-kurs', 'dovme', 'veteriner', 'spa-masaj', 'diyetisyen', 'optik',
  'fotografci', 'psikoloji', 'fizyoterapi', 'tamamlayici-tip']

const vitrinYolu = (s, k, ad, kimlik) =>
  `/isletmeler/${s}/${k}/${slugla(ad).slice(0, 60) || 'isletme'}-${kimlik}`
const dolgun = (k) => Boolean((k.telefon && !cepMi(k.telefon)) || k.web)

mkdirSync('site', { recursive: true })
let toplam = 0
const sitemapUrller = []
const ozet = []
const bugun = new Date().toISOString().slice(0, 10)
for (const s of SEHIR_SLUG) sitemapUrller.push(`  <url><loc>https://esesion.com/isletmeler/${s}</loc></url>`)
for (const sehir of readdirSync('data')) {
  const d = join('data', sehir)
  if (!statSync(d).isDirectory()) continue
  mkdirSync(join('site', sehir), { recursive: true })
  for (const f of readdirSync(d)) {
    if (!f.endsWith('.json') || f === '_ozet.json') continue
    const sektor = f.replace('.json', '')
    sitemapUrller.push(`  <url><loc>https://esesion.com/isletmeler/${sehir}/${sektor}</loc><lastmod>${bugun}</lastmod></url>`)
    const kayitlar = JSON.parse(readFileSync(join(d, f), 'utf8'))
      .map((k) => {
        const ig = (k.sosyal || []).find((x) => x.tur === 'instagram')
        const igAd = ig ? String(ig.deger).split('/').pop().replace(/^@+/, '') : ''
        return [
          // FSQ 'locality' alani bazen sehir adi tasiyor; sahte 'Istanbul ilcesi' olmasin.
          adTemiz(k.ad), (k.ilce && slugla(k.ilce) !== sehir ? k.ilce : ''), k.telefon || '', k.web || '',
          k.lat != null ? Number(k.lat.toFixed(4)) : null,
          k.lng != null ? Number(k.lng.toFixed(4)) : null,
          k.kaynak || 'osm', k.fsq_id || (k.osm_url || '').split('/').pop() || '',
          /^[A-Za-z][A-Za-z0-9._]{1,29}$/.test(igAd) ? igAd : '',
        ]
      })
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'tr'))
    for (const k of kayitlar) {
      if (!dolgun({ telefon: k[2], web: k[3] })) continue
      sitemapUrller.push(`  <url><loc>https://esesion.com${vitrinYolu(sehir, sektor, k[0], String(k[7]).slice(-10))}</loc></url>`)
    }
    writeFileSync(join('site', sehir, sektor + '.json'),
      JSON.stringify({ sehir, sektor, n: kayitlar.length, kayitlar }) + '\n')
    const ilceSay = {}
    for (const k of kayitlar) if (k[1]) ilceSay[k[1]] = (ilceSay[k[1]] || 0) + 1
    for (const [ad, n2] of Object.entries(ilceSay)) {
      if (n2 < 5) continue
      sitemapUrller.push(`  <url><loc>https://esesion.com/isletmeler/${sehir}/${sektor}/${slugla(ad)}</loc></url>`)
    }
    ozet.push({ sehir, sektor, n: kayitlar.length, ilceler: ilceSay })
    toplam += kayitlar.length
  }
}
writeFileSync('site/_sitemap-isletmeler.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrller.join('\n')}\n</urlset>\n`)
console.log('site/ ihracati:', toplam, 'kayit | sitemap:', sitemapUrller.length, 'URL')
