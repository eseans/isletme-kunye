// Isletmenin KENDI web sitesinden kunye tamamlama (hukuk matrisi yol haritasi #3).
//
// Ne alir (yalniz beyaz liste alanlari, yalniz BOS olani doldurur):
//   telefon           — sitede ilan edilen kurumsal hat (cep 5xx ASLA: KVKK)
//   calisma_saatleri  — schema.org openingHours / openingHoursSpecification
//   adres             — schema.org PostalAddress.streetAddress
//   sosyal            — sitedeki instagram.com/<isletme> linki
// Ne ALMAZ: e-posta, kisi adi, puan/yorum, fiyat, hizmet listesi (matris #6,#10,#11,#14,#16).
//
// Nezaket: yalniz ana sayfa, alan adi basina tek istek, robots.txt'ye uyar,
// 8 sn zaman asimi, 30 gun icinde bakilan alan adina tekrar gitmez
// (data/_web_kontrol.json). Kullanim: node scripts/web_kunye.mjs [eszamanli=24]

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { telefonTemizle } from '../topla.mjs'

const UA = 'eseans-kunye/1.0 (+https://esesion.com/isletmeler; halka acik kunye)'
const ESZ = Number(process.argv[2] || 24)
const KONTROL = 'data/_web_kontrol.json'
const bugun = new Date().toISOString().slice(0, 10)
const kontrol = existsSync(KONTROL) ? JSON.parse(readFileSync(KONTROL, 'utf8')) : {}
const tazeMi = (t) => t && (Date.now() - Date.parse(t)) / 864e5 < 30

async function getir(url, ms = 8000) {
  const ac = new AbortController()
  const z = setTimeout(() => ac.abort(), ms)
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,*/*' }, redirect: 'follow', signal: ac.signal })
    if (!r.ok) return null
    const tur = r.headers.get('content-type') || ''
    if (!/text|html|plain/.test(tur)) return null
    return (await r.text()).slice(0, 600_000)
  } catch { return null } finally { clearTimeout(z) }
}

// robots.txt: "*" veya bizim UA grubunda "Disallow: /" varsa girmeyiz.
async function izinli(koken) {
  const t = await getir(koken + '/robots.txt', 5000)
  if (!t) return true
  let grup = false, yasak = false
  for (const satir of t.split(/\r?\n/)) {
    const [k, ...v] = satir.split(':'); const d = v.join(':').trim()
    if (/^user-agent$/i.test(k.trim())) grup = d === '*' || /eseans/i.test(d)
    else if (grup && /^disallow$/i.test(k.trim()) && d === '/') yasak = true
  }
  return !yasak
}

const GUN = { monday: 'Mo', tuesday: 'Tu', wednesday: 'We', thursday: 'Th', friday: 'Fr', saturday: 'Sa', sunday: 'Su',
  mo: 'Mo', tu: 'Tu', we: 'We', th: 'Th', fr: 'Fr', sa: 'Sa', su: 'Su' }
const gunKod = (g) => GUN[String(g).split('/').pop().toLowerCase()] || null
const saat = (x) => (String(x || '').match(/^(\d{1,2}):(\d{2})/) || []).slice(1).map((p, i) => (i ? p : p.padStart(2, '0'))).join(':')

// openingHours (OSM benzeri metin) veya openingHoursSpecification → "Mo-Fr 09:00-18:00; Sa 10:00-16:00"
export function saatleriCoz(ld) {
  if (typeof ld.openingHours === 'string' && /^[A-Za-z]{2}/.test(ld.openingHours)) return ld.openingHours.trim()
  if (Array.isArray(ld.openingHours) && ld.openingHours.every((x) => typeof x === 'string')) return ld.openingHours.join('; ')
  const spec = [].concat(ld.openingHoursSpecification || [])
  const parca = []
  for (const s of spec) {
    const a = saat(s.opens), b = saat(s.closes)
    if (!a || !b) continue
    for (const g of [].concat(s.dayOfWeek || [])) { const k = gunKod(g); if (k) parca.push(`${k} ${a}-${b}`) }
  }
  return parca.length ? parca.join('; ') : null
}

const ISLETME_TIPI = /LocalBusiness|Salon|Spa|Dentist|Clinic|Medical|Physician|Health|Beauty|Barber|Hair|Gym|Fitness|Sports|Veterinar|Optician|Photograph|School|Store|Organization|Place/i

export function sayfadanKunye(html, koken = '') {
  const out = {}
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let veri
    try { veri = JSON.parse(m[1].trim()) } catch { continue }
    const dugumler = [].concat(veri).flatMap((v) => (v && v['@graph'] ? v['@graph'] : [v]))
    for (const d of dugumler) {
      if (!d || !ISLETME_TIPI.test([].concat(d['@type'] || '').join(' '))) continue
      if (!out.telefon && d.telephone) out.telefon = String(d.telephone).trim()
      const adr = [].concat(d.address || [])[0]
      if (!out.adres && adr && typeof adr === 'object' && adr.streetAddress) out.adres = String(adr.streetAddress).trim().slice(0, 160)
      if (!out.calisma_saatleri) out.calisma_saatleri = saatleriCoz(d)
      // Isletmenin KENDI ilan ettigi logo (schema.org logo) once gelir.
      const lg = [].concat(d.logo || [])[0]
      if (!out.logo && lg) out.logo = typeof lg === 'string' ? lg : lg.url || lg.contentUrl || ''
      for (const s of [].concat(d.sameAs || [])) {
        const ig = String(s).match(/instagram\.com\/([A-Za-z0-9._]{2,30})\/?$/)
        if (ig && !out.instagram) out.instagram = ig[1]
      }
    }
  }
  if (!out.telefon) {
    const t = html.match(/href=["']tel:([+\d\s().-]{7,20})["']/i)
    if (t) out.telefon = t[1].trim()
  }
  if (!out.instagram) {
    const ig = html.match(/instagram\.com\/(?!p\/|reel\/|explore\/|stories\/|accounts\/)([A-Za-z0-9._]{2,30})\/?["'?]/i)
    if (ig) out.instagram = ig[1]
  }
  // Logo yedegi: apple-touch-icon (180px, kare) ya da sizes>=96 ikon. og:image ALINMAZ
  // (genelde fotograf; telif). Goreli yol site kokune gore cozulur.
  if (!out.logo) {
    const linkler = [...html.matchAll(/<link\s[^>]*>/gi)].map((m) => m[0])
    const ALAN = { rel: /\brel\s*=\s*["']([^"']+)["']/i, href: /\bhref\s*=\s*["']([^"']+)["']/i, sizes: /\bsizes\s*=\s*["']([^"']+)["']/i }
    const al = (t, ad) => (t.match(ALAN[ad]) || [])[1] || ''
    const dokunma = linkler.find((t) => /apple-touch-icon/i.test(al(t, 'rel')))
    const buyuk = linkler.find((t) => /(^|\s)icon(\s|$)/i.test(al(t, 'rel')) && (Number((al(t, 'sizes').match(/\d+/) || [0])[0]) >= 96 || /\.svg(\?|$)/i.test(al(t, 'href'))))
    out.logo = al(dokunma || buyuk || '', 'href')
  }
  if (out.logo) {
    try { const u = new URL(out.logo, (koken || 'https://x.invalid') + '/'); out.logo = /^https?:$/.test(u.protocol) && !u.hostname.endsWith('.invalid') ? u.href : '' } catch { out.logo = '' }
    if (/^data:/i.test(out.logo) || out.logo.length > 400) out.logo = ''
  }
  if (!out.logo) delete out.logo
  out.telefon = telefonTemizle(out.telefon) // KVKK: cep/supheli parca atilir
  if (!out.telefon) delete out.telefon
  if (out.instagram && /^(instagram|explore|p|reel|share)$/i.test(out.instagram)) delete out.instagram
  if (!out.calisma_saatleri) delete out.calisma_saatleri
  return out
}

// ── Calistir ──
// Testten import edilince calismaz; yalniz dogrudan calistirilinca.
if (process.argv[1]?.endsWith('web_kunye.mjs')) {
  const dosyalar = []
  for (const s of readdirSync('data')) {
    const d = join('data', s)
    if (!statSync(d).isDirectory()) continue
    for (const f of readdirSync(d)) if (f.endsWith('.json') && f !== '_ozet.json') dosyalar.push(join(d, f))
  }
  // Alan adi → o alan adini kullanan kayitlar (zincir subeleri tek istekle).
  const isler = new Map(), veriler = new Map()
  for (const yol of dosyalar) {
    const kayitlar = JSON.parse(readFileSync(yol, 'utf8'))
    veriler.set(yol, kayitlar)
    for (const k of kayitlar) {
      if (!k.web || (k.telefon && k.calisma_saatleri && k.adres && k.logo && (k.sosyal || []).length)) continue
      let koken
      try { const u = new URL(/^https?:/.test(k.web) ? k.web : 'https://' + k.web); if (!/^https?:$/.test(u.protocol)) continue; koken = u.origin } catch { continue }
      if (/facebook\.com|instagram\.com|google\.|linktr\.ee|wa\.me|whatsapp/i.test(koken)) continue
      // surum 2: logo eklendi — eski surumle bakilan siteler bir kez yeniden gezilir.
      if (tazeMi(kontrol[koken]?.tarih) && kontrol[koken]?.surum === 2) continue
      if (!isler.has(koken)) isler.set(koken, [])
      isler.get(koken).push(k)
    }
  }
  const kuyruk = [...isler.keys()]
  console.log(`web kunye: ${kuyruk.length} alan adi, ${ESZ} eszamanli`)
  let bitti = 0, dolan = { telefon: 0, calisma_saatleri: 0, adres: 0, logo: 0, sosyal: 0 }
  async function isci() {
    while (kuyruk.length) {
      const koken = kuyruk.shift()
      const kayit = { tarih: bugun, surum: 2, alanlar: [] }
      if (await izinli(koken)) {
        const html = await getir(koken + '/')
        const bulgu = html ? sayfadanKunye(html, koken) : {}
        for (const k of isler.get(koken)) {
          for (const alan of ['telefon', 'calisma_saatleri', 'adres', 'logo']) {
            if (!k[alan] && bulgu[alan]) { k[alan] = bulgu[alan]; dolan[alan]++; kayit.alanlar.includes(alan) || kayit.alanlar.push(alan) }
          }
          if (bulgu.instagram && !(k.sosyal || []).length) {
            k.sosyal = [{ tur: 'instagram', deger: 'https://instagram.com/' + bulgu.instagram }]
            dolan.sosyal++; kayit.alanlar.includes('sosyal') || kayit.alanlar.push('sosyal')
          }
        }
        kayit.durum = html ? 'ok' : 'erisilemedi'
      } else kayit.durum = 'robots'
      kontrol[koken] = kayit
      if (++bitti % 250 === 0) console.log(`${bitti} alan adi`, JSON.stringify(dolan))
    }
  }
  await Promise.all(Array.from({ length: ESZ }, isci))
  for (const [yol, kayitlar] of veriler) writeFileSync(yol, JSON.stringify(kayitlar, null, 1))
  writeFileSync(KONTROL, JSON.stringify(kontrol) + '\n')
  console.log('bitti:', bitti, 'alan adi · doldurulan:', JSON.stringify(dolan))
}
