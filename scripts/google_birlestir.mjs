// Google Maps taramasini (NikinGames/maps-dataset scan-kunye-google; ozel arsiv)
// kunyeye birlestirir. Yalniz temel alan: calisma saati, kapi numarali adres,
// sabit telefon, web, kapali isareti. Eslesmeyen ACIK isletme yeni kunye olur.
// Yorum/puan/foto yoktur (tarama hic almaz). Kimlik (fsq/osm/overture) degismez.
// Kullanim: node scripts/google_birlestir.mjs <places.jsonl[.gz]> <il-slug>
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

// Sorgu -> [sektor, alt]
const SORGU = {
  'kuaför': ['kuafor', null], 'berber': ['kuafor', 'berber'], 'güzellik salonu': ['guzellik-salonu', null],
  'tırnak salonu': ['guzellik-salonu', 'tirnak'], 'spor salonu': ['spor-salonu', 'fitness'],
  'pilates': ['spor-salonu', 'pilates'], 'yoga': ['spor-salonu', 'yoga'], 'diş kliniği': ['dis-klinigi', null],
  'veteriner': ['veteriner', null], 'psikolog': ['psikoloji', null], 'diyetisyen': ['diyetisyen', null],
  'fizyoterapist': ['fizyoterapi', null], 'dövme': ['dovme', null], 'masaj': ['spa-masaj', 'masaj'],
}
const GUN = { pazartesi: 'Mo', salı: 'Tu', çarşamba: 'We', perşembe: 'Th', cuma: 'Fr', cumartesi: 'Sa', pazar: 'Su' }
const SIRA = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

// Google "09:00–12:00, 13:00–18:00" / "Kapalı" / "24 saat açık" -> "Mo 09:00-18:00; ..."
// (site lib/isletmelerPages.js saatCoz bicimi: gun basina tek aralik, kapali gun yok).
export function saatCevir(liste) {
  const parca = {}
  for (const { day, hours } of liste || []) {
    const g = GUN[String(day || '').toLocaleLowerCase('tr').trim()]
    if (!g) continue
    const h = String(hours || '').toLocaleLowerCase('tr')
    if (/24 saat/.test(h)) { parca[g] = '00:00-24:00'; continue }
    const saatler = [...h.matchAll(/(\d{1,2})[:.](\d{2})/g)].map((m) => m[1].padStart(2, '0') + ':' + m[2])
    if (saatler.length < 2) continue
    const bit = saatler[saatler.length - 1] === '00:00' ? '24:00' : saatler[saatler.length - 1]
    parca[g] = `${saatler[0]}-${bit}`
  }
  const s = SIRA.filter((g) => parca[g]).map((g) => `${g} ${parca[g]}`).join('; ')
  return s || null
}
const telBicim = (h) => (h && h.length === 10 ? `(0${h.slice(0, 3)}) ${h.slice(3, 6)} ${h.slice(6, 8)} ${h.slice(8, 10)}` : null)
const norm = (ad) => String(ad || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40)

// Dogrudan calistirildiginda (test import'unda degil) birlestir.
if (process.argv[1]?.endsWith('google_birlestir.mjs')) birlestir()

function birlestir() {
const [dosya, il] = process.argv.slice(2)
if (!dosya || !il) throw new Error('kullanim: google_birlestir.mjs <places.jsonl[.gz]> <il-slug>')
const ham = readFileSync(dosya)
const yerler = (dosya.endsWith('.gz') ? gunzipSync(ham) : ham).toString('utf8').trim().split('\n').map(JSON.parse)

// Ildeki tum kayitlar, ~550 m izgara.
const veri = {}, izgara = new Map()
const hucre = (la, lo) => `${Math.round(la * 200)},${Math.round(lo * 200)}`
for (const f of readdirSync(`data/${il}`)) {
  if (!f.endsWith('.json') || f.startsWith('_')) continue
  const ks = JSON.parse(readFileSync(`data/${il}/${f}`, 'utf8')); veri[f.slice(0, -5)] = ks
  for (const k of ks) if (k.lat != null) { const h = hucre(k.lat, k.lng); izgara.has(h) || izgara.set(h, []); izgara.get(h).push([norm(k.ad), k]) }
}
function eslesen(ad, lat, lng) {
  const na = norm(ad); if (!na) return null
  const gy = Math.round(lat * 200), gx = Math.round(lng * 200)
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    for (const [nad, k] of izgara.get(`${gy + dy},${gx + dx}`) || []) {
      if (nad && (nad.slice(0, 12) === na.slice(0, 12) || nad.startsWith(na) || na.startsWith(nad))
        && Math.abs(k.lat - lat) < 0.0015 && Math.abs(k.lng - lng) < 0.002) return k
    }
  }
  return null
}

const bugun = new Date().toISOString().slice(0, 10)
const say = { eslesen: 0, yeni: 0, saat: 0, adres: 0, tel: 0, web: 0, kapali: 0, atlanan: 0 }
for (const p of yerler) {
  if (p.lat == null || !p.ad) { say.atlanan++; continue }
  const saat = saatCevir(p.saat), tel = telBicim(p.tel)
  const k = eslesen(p.ad, p.lat, p.lng)
  if (k) {
    say.eslesen++; k.google_id = p.placeId; k.son_gorulme = bugun
    if (p.kapali) { k.kapali = true; say.kapali++; continue }
    if (saat && !k.calisma_saatleri) { k.calisma_saatleri = saat; k.saat_kaynak = 'google'; say.saat++ }
    if (p.adres && /\d/.test(p.adres) && !/\d/.test(k.adres || '')) { k.adres = p.adres; say.adres++ }
    if (tel && !k.telefon) { k.telefon = tel; say.tel++ }
    if (p.web && !k.web) { k.web = p.web; say.web++ }
    continue
  }
  if (p.kapali) { say.kapali++; continue }
  const [sek, alt] = SORGU[String(p.sorgu || '').toLocaleLowerCase('tr')] || [null, null]
  if (!sek) { say.atlanan++; continue }
  const yeni = {
    ad: p.ad, sektor: sek, kategori: sek, alt, hizmet_ipuclari: [p.kategori].filter(Boolean),
    adres: p.adres || null, il: null, ilce: null, mahalle: null, telefon: tel, web: p.web || null, sosyal: [],
    calisma_saatleri: saat, saat_kaynak: saat ? 'google' : undefined, randevu: null, engelli_erisimi: null,
    lat: p.lat, lng: p.lng, maps_url: `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`,
    yandex_url: null, osm_url: null, fsq_id: null, google_id: p.placeId,
    kaynak: 'google', ilk_gorulme: bugun, son_gorulme: bugun,
  }
  ;(veri[sek] ||= []).push(yeni); const h = hucre(p.lat, p.lng); izgara.has(h) || izgara.set(h, []); izgara.get(h).push([norm(p.ad), yeni])
  say.yeni++
}
for (const [sek, ks] of Object.entries(veri)) {
  ks.sort((a, b) => String(a.ad || '').localeCompare(String(b.ad || ''), 'tr'))
  writeFileSync(`data/${il}/${sek}.json`, JSON.stringify(ks, null, 1) + '\n')
}
console.log(il, yerler.length, 'yer', JSON.stringify(say))
}
