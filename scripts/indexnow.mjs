// IndexNow: sitemap'teki URL'leri Bing/Seznam'a toplu bildirir (10k/istek).
// Anahtar https://esesion.com/<key>.txt adresinde yatar (ana repo public/).
// Kullanim: node scripts/indexnow.mjs
import { readFileSync } from 'node:fs'

const KEY = process.env.INDEXNOW_KEY
if (!KEY) { console.log('INDEXNOW_KEY yok, atlandi'); process.exit(0) }
const urls = [...readFileSync('site/_sitemap-isletmeler.xml', 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
console.log('IndexNow:', urls.length, 'URL')
for (let i = 0; i < urls.length; i += 10000) {
  const dilim = urls.slice(i, i + 10000)
  const r = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: 'esesion.com', key: KEY, keyLocation: `https://esesion.com/${KEY}.txt`, urlList: dilim }),
  })
  console.log(`  dilim ${i / 10000 + 1}: HTTP ${r.status}`)
}
