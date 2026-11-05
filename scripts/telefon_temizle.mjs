// Cep numarasi temizligi (KVKK): 05xx / +90 5xx / 5xx numaralari KISISEL
// kabul edilir ve kunyeden silinir; yalniz kurumsal sabit hat kalir.
// Kullanim: node scripts/telefon_temizle.mjs   (data/ + site/ yeniden yazar)
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Numara cep mi? (+90/90/0 on ekleri soyulur; 5 ile baslayan 10 hane = cep)
export function cepMi(telefon) {
  if (!telefon) return false
  let h = String(telefon).replace(/[^\d+]/g, '').replace(/^\+/, '')
  if (h.startsWith('90') && h.length === 12) h = h.slice(2)
  if (h.startsWith('0')) h = h.replace(/^0+/, '')
  return /^5\d{9}$/.test(h)
}

let silinen = 0, toplam = 0
for (const sehir of readdirSync('data')) {
  const d = join('data', sehir)
  if (!statSync(d).isDirectory()) continue
  for (const f of readdirSync(d)) {
    if (!f.endsWith('.json') || f === '_ozet.json') continue
    const yol = join(d, f)
    const ks = JSON.parse(readFileSync(yol, 'utf8'))
    for (const k of ks) { toplam++; if (k.telefon && cepMi(k.telefon)) { k.telefon = null; silinen++ } }
    writeFileSync(yol, JSON.stringify(ks, null, 1) + '\n')
  }
}
console.log(`${silinen}/${toplam} kayittan cep numarasi silindi`)
