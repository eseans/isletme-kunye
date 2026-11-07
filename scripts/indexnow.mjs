// IndexNow: yalniz SON KOMITTE YENI eklenen URL'leri bildirir.
// Protokol boyle: toplu sitemap spam'i degil degisiklik bildirimi; yeni
// anahtarla 30k URL birden gondermek kotaya takilir (403, 2026-11-08).
// Kullanim: node scripts/indexnow.mjs
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const KEY = process.env.INDEXNOW_KEY
if (!KEY) { console.log('INDEXNOW_KEY yok, atlandi'); process.exit(0) }

const simdiki = [...readFileSync('site/_sitemap-isletmeler.xml', 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
const simdiKume = new Set(simdiki)
let oncekiKume = new Set()
try {
  const eskiXml = execSync('git show HEAD~1:site/_sitemap-isletmeler.xml', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  oncekiKume = new Set([...eskiXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]))
} catch { /* ilk kez: eskisi yok */ }

const yeni = simdiki.filter((u) => !oncekiKume.has(u))
if (!yeni.length) { console.log('IndexNow: yeni URL yok, atlandi'); process.exit(0) }
console.log('IndexNow:', yeni.length, 'yeni URL')
for (let i = 0; i < yeni.length; i += 2000) {
  const r = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: 'esesion.com', key: KEY, keyLocation: `https://esesion.com/${KEY}.txt`, urlList: yeni.slice(i, i + 2000) }),
  })
  console.log(`  dilim ${i / 2000 + 1}: HTTP ${r.status}${r.status === 403 ? ' (kota - sonraki tur tekrar dener)' : ''}`)
}
