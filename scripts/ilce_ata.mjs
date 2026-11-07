// Ilce atama: her kayda koordinatindan GERCEK ilce (Nominatim ilce poligonlari
// + isin-atma PIP). Kayttaki ilce etiketi bozuk/bos olabilir (FSQ'da cogu bos);
// poligon atamasi hepsini kapsar. Ilce listesi Overpass'ten (admin_level=6).
//
// Kullanim: node scripts/ilce_ata.mjs [Sehir ...]   (bos = tum sehirler)
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { slugla } from '../topla.mjs'

const SEHIRLER = {
  istanbul: 'İstanbul', ankara: 'Ankara', izmir: 'İzmir', bursa: 'Bursa', antalya: 'Antalya', eskisehir: 'Eskişehir',
}
const UA = { 'user-agent': 'isletme-kunye/1.0 (+https://github.com/eseans/isletme-kunye)' }
const bekle = (ms) => new Promise((c) => setTimeout(c, ms))

// ── PIP: isin atma. geojson Polygon/MultiPolygon, [lng,lat]. ──
function icindeMi(nokta, halka) {
  const [x, y] = nokta
  let ic = false
  for (let i = 0, j = halka.length - 1; i < halka.length; j = i++) {
    const [xi, yi] = halka[i], [xj, yj] = halka[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ic = !ic
  }
  return ic
}
function poligonIcinde(nokta, geo) {
  if (!geo) return false
  if (geo.type === 'Polygon') return geo.coordinates.some((h, i) => i === 0 && icindeMi(nokta, h))
  if (geo.type === 'MultiPolygon') return geo.coordinates.some((p) => icindeMi(nokta, p[0]))
  return false
}

async function ilcePoligonlari(sehirSlug, sehirAdi) {
  const onbellek = `ilce-geo/${sehirSlug}.json`
  if (existsSync(onbellek)) return JSON.parse(readFileSync(onbellek, 'utf8'))
  // 1) Ilcelerin adlari: Overpass admin_level=6.
  const alanKimligi = await (async () => {
    const r = await fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(sehirAdi) + '&format=json&limit=5&accept-language=tr', { headers: UA })
    const j = await r.json()
    const sec = j.find((x) => x.osm_type === 'relation' && x.type === 'administrative') || j[0]
    return 3600000000 + Number(sec.osm_id)
  })()
  const q = `[out:json][timeout:120];area(${alanKimligi})->.il;relation["boundary"="administrative"]["admin_level"="6"](area.il);out ids tags;`
  // Ayna merdiveni (topla.mjs ile ayni gerekce): tek ayna mesgulken HTML hata
  // dondurebiliyor.
  const UCLAR = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
  let op = null
  for (let d = 0; d < 8 && !op; d++) {
    try {
      const r = await fetch(UCLAR[d % UCLAR.length], {
        method: 'POST', body: 'data=' + encodeURIComponent(q),
        headers: { 'content-type': 'application/x-www-form-urlencoded', ...UA },
      })
      if (r.ok) op = await r.json()
    } catch { /* siradaki ayna */ }
    if (!op) await bekle(12000)
  }
  const adlar = (op?.elements || []).map((r) => r.tags?.name).filter(Boolean)
  // 2) Her ilce icin poligon (Nominatim, 1 ist/s nezaket).
  const liste = []
  for (const ad of adlar) {
    await bekle(1100)
    const r = await fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(`${ad}, ${sehirAdi}`) + '&format=json&limit=5&polygon_geojson=1&accept-language=tr', { headers: UA })
    if (!r.ok) { console.log(`  ilce: ${ad} HTTP ${r.status}`); continue }
    const j = await r.json()
    // Ilk sonuc POI/node olabilir; ilce SINIRI ancak relation'da olur.
    const sec = (j || []).find((x) => x.osm_type === 'relation' && x.polygon_geojson)
    if (sec) liste.push({ ad, slug: slugla(ad), geo: sec.polygon_geojson })
    console.log(`  ilce: ${ad} ${sec ? '✓' : '—'}`)
  }
  mkdirSync('ilce-geo', { recursive: true })
  writeFileSync(onbellek, JSON.stringify(liste))
  return liste
}

async function sehirAta(sehirSlug, sehirAdi) {
  const poligonlar = await ilcePoligonlari(sehirSlug, sehirAdi)
  if (!poligonlar.length) return console.log(`${sehirSlug}: ilce poligonu yok, atlandi`)
  console.log(`${sehirSlug}: ${poligonlar.length} ilce poligonu`)
  const d = join('data', sehirSlug)
  let toplam = 0, atanan = 0
  for (const f of readdirSync(d)) {
    if (!f.endsWith('.json') || f === '_ozet.json') continue
    const yol = join(d, f)
    const ks = JSON.parse(readFileSync(yol, 'utf8'))
    for (const k of ks) {
      toplam++
      if (k.lat == null) continue
      const p = poligonlar.find((x) => poligonIcinde([k.lng, k.lat], x.geo))
      if (p) { k.ilce = p.ad; atanan++ }
    }
    writeFileSync(yol, JSON.stringify(ks, null, 1) + '\n')
  }
  console.log(`${sehirSlug}: ${atanan}/${toplam} kayda ilce atandi`)
}

const hedefler = process.argv.slice(2)
for (const [slug, ad] of Object.entries(SEHIRLER)) {
  if (hedefler.length && !hedefler.includes(slug)) continue
  await sehirAta(slug, ad)
}
