// isletme-kunye — halka acik isletme kunyesi toplayici (v2).
//
// KAYNAK: OpenStreetMap (Overpass API), ODbL. Buyuk sehirler ILCE ILCE
// taranir (tek dev alan sorgusu zaman asimina/dogruluga gomulur); kucuk
// sehirler tek sorguda. Google/Yandex linkleri HESAPLANIR — hicbir Maps
// servisi kazinmaz. PUAN/PUAN KAZIMA YOK: harita puanlari servis sartlarina
// ve KVKK'ya takilir; sinyal olarak OSM etiket zenginligi toplanir.
//
// KVKK SINIRI: kayit sablonundaki beyaz liste DISINA HICBIR alan cikmaz
// (kisi adi, e-posta, kisisel iletisim OKUNMAZ). test/kunye.test.mjs kilitler.
//
// Kullanim: node topla.mjs <Sehir>     Cikti: data/<slug>/<sektor>.json

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export const SEHIRLER = {
  Istanbul: { slug: 'istanbul', alan: 'İstanbul', parcala: true },
  Ankara: { slug: 'ankara', alan: 'Ankara', parcala: true },
  Izmir: { slug: 'izmir', alan: 'İzmir', parcala: true },
  Bursa: { slug: 'bursa', alan: 'Bursa', parcala: true },
  Antalya: { slug: 'antalya', alan: 'Antalya', parcala: true },
  Eskisehir: { slug: 'eskisehir', alan: 'Eskişehir' },
}

// Sektor eslemesi: OSM etiketi -> sektor. Etiket DEGERI noktali virgulle
// coklu olabilir (shop=hairdresser;beauty) — esleyici buna gore calisir.
export const SEKTORLER = [
  { ad: 'dis-klinigi', etiketler: [['amenity', 'dentist'], ['healthcare', 'dentist']] },
  { ad: 'klinik', etiketler: [['amenity', 'clinic'], ['amenity', 'doctors'], ['healthcare', 'clinic'], ['healthcare', 'doctor'], ['healthcare', 'centre'], ['healthcare', 'midwife']] },
  { ad: 'guzellik-salonu', etiketler: [['shop', 'beauty'], ['shop', 'cosmetics'], ['shop', 'perfumery']] },
  { ad: 'kuafor', etiketler: [['shop', 'hairdresser'], ['shop', 'barber']] },
  { ad: 'spor-salonu', etiketler: [['leisure', 'fitness_centre'], ['leisure', 'sports_centre']] },
  { ad: 'spa-masaj', etiketler: [['shop', 'massage'], ['leisure', 'spa']] },
  { ad: 'dovme', etiketler: [['shop', 'tattoo'], ['craft', 'tattoo'], ['shop', 'piercing']] },
  { ad: 'veteriner', etiketler: [['amenity', 'veterinary']] },
  { ad: 'psikoloji', etiketler: [['healthcare', 'psychologist'], ['healthcare', 'psychotherapist'], ['office', 'psychologist'], ['office', 'therapist']] },
  { ad: 'diyetisyen', etiketler: [['healthcare', 'dietitian'], ['office', 'dietitian']] },
  { ad: 'fizyoterapi', etiketler: [['healthcare', 'physiotherapist'], ['healthcare', 'chiropractor']] },
  { ad: 'tamamlayici-tip', etiketler: [['healthcare', 'alternative'], ['healthcare', 'homed'] ] },
  { ad: 'egitim-kurs', etiketler: [['amenity', 'language_school'], ['amenity', 'music_school'], ['amenity', 'dancing_school'], ['amenity', 'driving_school'], ['amenity', 'prep_school'], ['office', 'educational_institution']] },
  { ad: 'optik', etiketler: [['shop', 'optician']] },
  { ad: 'fotografci', etiketler: [['shop', 'photo'], ['craft', 'photographer']] },
]

// KVKK beyaz listesi — DISINA CIKMA.
const KAYIT_SABLONU = {
  ad: null, sektor: null, kategori: null, hizmet_ipuclari: [],
  adres: null, il: null, ilce: null, mahalle: null,
  telefon: null, web: null, sosyal: [],
  calisma_saatleri: null, randevu: null, engelli_erisimi: null,
  lat: null, lng: null,
  maps_url: null, yandex_url: null, osm_url: null,
  kaynak: 'osm', ilk_gorulme: null, son_gorulme: null,
}

const oz = (v) => (typeof v === 'string' ? v.trim() : null) || null
// Cep numarasi (5xx) KISISEL sayilir: kunyeye hic girmez (KVKK, kullanici karari).
export function cepMi(telefon) {
  if (!telefon) return false
  let h = String(telefon).replace(/[^\d+]/g, '').replace(/^\+/, '')
  if (h.startsWith('90') && h.length === 12) h = h.slice(2)
  if (h.startsWith('0')) h = h.replace(/^0+/, '')
  return /^5\d{9}$/.test(h)
}

const cok = (etiket, ...anahtarlar) => {
  for (const a of anahtarlar) {
    const v = etiket[a]
    if (Array.isArray(v)) { const i = v.map(oz).filter(Boolean); if (i.length) return i }
    else if (v != null && String(v).trim()) return String(v).trim()
  }
  return null
}
const coklu = (v) => String(v || '').split(';').map((x) => x.trim()).filter(Boolean)

export const sektoreUyar = (oge, etiketler) => {
  const t = oge?.tags || {}
  return etiketler.some(([anahtar, deger]) => coklu(t[anahtar]).includes(deger))
}

// OSM'de hizmet/nitelik tasiyan yan-etiket ad uzaylari (künye tamamlayıcısı).
const IPUCU_ANAHTARLARI = ['healthcare:speciality', 'beauty', 'sport', 'cuisine', 'tutor']

export function kayitEsle(oge, sektor, sehir, ilceAdi, bugun) {
  const e = oge.tags || {}
  const ad = oz(e.name)
  if (!ad) return null
  const lat = oge.lat ?? oge?.center?.lat ?? null
  const lng = oge.lon ?? oge?.center?.lon ?? null
  const adres = [oz(e['addr:housenumber']), oz(e['addr:street']), oz(e['addr:neighbourhood'])].filter(Boolean).join(' ') || null
  const sosyal = []
  for (const [anahtar, tur] of [['contact:instagram', 'instagram'], ['contact:facebook', 'facebook'], ['contact:twitter', 'x']]) {
    const v = oz(e[anahtar])
    if (v) sosyal.push({ tur, deger: v.startsWith('http') ? v : `https://${tur === 'x' ? 'x' : tur}.com/${v.replace(/^@/, '')}` })
  }
  const ipuclari = [...new Set(IPUCU_ANAHTARLARI.flatMap((a) => coklu(e[a])))].slice(0, 8)
  const sorgu = lat != null ? `${lat},${lng}` : `${ad} ${sehir}`
  return {
    ...KAYIT_SABLONU,
    ad, sektor,
    kategori: oz(e['healthcare:speciality']) || sektor,
    hizmet_ipuclari: ipuclari,
    adres,
    il: oz(e['addr:city']) || sehir,
    ilce: oz(e['addr:district']) || oz(e['addr:suburb']) || ilceAdi,
    mahalle: oz(e['addr:neighbourhood']) || oz(e['addr:quarter']) || null,
    telefon: (function () { const t = cok(e, 'phone', 'contact:phone', 'contact:mobile'); return cepMi(t) ? null : t })(),
    web: cok(e, 'website', 'contact:website'),
    sosyal,
    calisma_saatleri: cok(e, 'opening_hours'),
    randevu: oz(e.appointment),
    engelli_erisimi: oz(e.wheelchair),
    lat, lng,
    maps_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(sorgu)}`,
    yandex_url: `https://yandex.com/maps/?text=${encodeURIComponent(ad + ' ' + sehir)}${lng != null ? `&ll=${lng}%2C${lat}&z=17` : ''}`,
    osm_url: `https://www.openstreetmap.org/${oge.type}/${oge.id}`,
    ilk_gorulme: bugun,
    son_gorulme: bugun,
  }
}

// Var olan kayitlarla birlestirir: ilk_gorulme korunur, alanlar tazelenir.
export function birlestir(eskiler, yeniler) {
  const mapa = new Map((eskiler || []).map((k) => [k.osm_url, k]))
  for (const y of yeniler) {
    const e = mapa.get(y.osm_url)
    mapa.set(y.osm_url, e ? { ...y, ilk_gorulme: e.ilk_gorulme } : y)
  }
  return [...mapa.values()].sort((a, b) => a.ad.localeCompare(b.ad, 'tr'))
}

export function overpassSorgusu(alanKimligi) {
  const parcalar = []
  for (const s of SEKTORLER) {
    for (const [anahtar, deger] of s.etiketler) {
      for (const tip of ['node', 'way', 'relation']) {
        parcalar.push(`${tip}["${anahtar}"="${deger}"](area.a);`)
      }
    }
  }
  return `[out:json][timeout:300];area(${alanKimligi})->.a;(\n${parcalar.join('\n')}\n);out center tags;`
}

export async function alanKimligiBul(alanAdi) {
  const istek = await fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(alanAdi) + '&format=json&limit=5&accept-language=tr', {
    headers: { 'user-agent': 'isletme-kunye/1.0 (+https://github.com/eseans/isletme-kunye)' },
  })
  if (!istek.ok) throw new Error(`Nominatim ${istek.status}`)
  const sonuclar = await istek.json()
  const uygun = sonuclar.find((x) => x.osm_type === 'relation' && x.type === 'administrative'
    && x.display_name.toLowerCase().startsWith(alanAdi.slice(0, 4).toLowerCase()))
  const secilen = uygun || sonuclar.find((x) => x.osm_type === 'relation')
  if (!secilen) throw new Error(`Alan bulunamadi: ${alanAdi}`)
  return 3600000000 + Number(secilen.osm_id)
}

// Ilceleri (admin_level=6, Turkiye duzeni) cozer; bulunamazsa ilin kendisi
// tek parca olarak doner. Buyuk sehri tek sorguda taramak zaman asimina
// takilir — parcali tarama hem tamamlar hem guvenilir olur.
export async function parcalarBul(sehir, ilAlani) {
  if (!sehir.parcala) return [{ ad: sehir.alan, kimlik: ilAlani }]
  const q = `[out:json][timeout:120];area(${ilAlani})->.il;relation["boundary"="administrative"]["admin_level"="6"](area.il);out ids tags;`
  const yanit = await overpassCek(q, 0, true)
  const ilceler = (yanit?.elements || [])
    .filter((r) => r.tags?.name)
    .map((r) => ({ ad: r.tags.name, kimlik: 3600000000 + r.id }))
  return ilceler.length ? ilceler : [{ ad: sehir.alan, kimlik: ilAlani }]
}

const UCLAR = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]
const bekle = (ms) => new Promise((c) => setTimeout(c, ms))

// bosKabul: ilce listesi gibi gercekten bos olabilecek ara sorgular icin.
async function overpassCek(sorgu, deneme = 0, bosKabul = false) {
  const uc = UCLAR[deneme % UCLAR.length]
  const tur = Math.floor(deneme / UCLAR.length) + 1
  try {
    const istek = await fetch(uc, {
      method: 'POST',
      body: 'data=' + encodeURIComponent(sorgu),
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': 'isletme-kunye/1.0 (+https://github.com/eseans/isletme-kunye)',
      },
    })
    if (istek.ok) {
      const yanit = await istek.json()
      if (Array.isArray(yanit?.elements) && (bosKabul || yanit.elements.length > 0)) return yanit
    } else if (istek.status >= 400 && istek.status < 500 && istek.status !== 429) {
      throw new Error(`Overpass ${istek.status}: ${(await istek.text()).slice(0, 200)}`)
    }
  } catch (h) {
    if (deneme >= UCLAR.length * 3) throw h
  }
  if (deneme >= UCLAR.length * 3 - 1) throw new Error('Overpass uc noktalarinin hepsi bos/gedikli dondu')
  await bekle(15000 * tur)
  return overpassCek(sorgu, deneme + 1, bosKabul)
}

export async function sehirTopla(sehirAdi, kokDizin = '.') {
  const sehir = SEHIRLER[sehirAdi]
  if (!sehir) throw new Error(`Bilinmeyen sehir: ${sehirAdi} (SEHIRLER listesine ekle)`)
  const bugun = new Date().toISOString().slice(0, 10)
  const ilAlani = await alanKimligiBul(sehir.alan)
  const parcalar = await parcalarBul(sehir, ilAlani)

  const kayitlar = new Map() // osm_url -> { sektorler:Set, oge, ilce }
  const hataliParcalar = []
  for (const parca of parcalar) {
    // Tek ilce hatasi sehir kaybetmesin: hata loglanir, kalan parcalar devam
    // eder. Hicbiri gelmezse sehir yazilmaz (aşağıdaki kontrol).
    try {
      const yanit = await overpassCek(overpassSorgusu(parca.kimlik))
      for (const oge of yanit.elements) {
        const anahtar = `${oge.type}/${oge.id}`
        const mevcut = kayitlar.get(anahtar) || { oge, ilce: parca.ad, sektorler: new Set() }
        for (const s of SEKTORLER) if (sektoreUyar(oge, s.etiketler)) mevcut.sektorler.add(s.ad)
        if (!mevcut.oge.tags?.['addr:district'] && !mevcut.oge.tags?.['addr:suburb']) mevcut.oge = { ...mevcut.oge, ilceParca: parca.ad }
        kayitlar.set(anahtar, mevcut)
      }
    } catch (h) {
      hataliParcalar.push(`${parca.ad}: ${h.message}`)
    }
  }
  if (!kayitlar.size) throw new Error(`${sehirAdi}: hicbir parcadan kayit gelmedi — yazma iptal`)

  const sehirDizini = join(kokDizin, 'data', sehir.slug)
  mkdirSync(sehirDizini, { recursive: true })
  const ozet = { sehir: sehirAdi, tarih: bugun, kaynak: '© OpenStreetMap katkıcıları (ODbL)', parca_sayisi: parcalar.length, hatali_parca: hataliParcalar, sektorler: {}, toplam: 0 }

  for (const s of SEKTORLER) {
    const yeniler = [...kayitlar.values()]
      .filter((k) => k.sektorler.has(s.ad))
      .map((k) => kayitEsle(k.oge, s.ad, sehirAdi, k.oge.ilceParca || k.ilce, bugun))
      .filter(Boolean)
    const dosya = join(sehirDizini, `${s.ad}.json`)
    const eskiler = existsSync(dosya) ? JSON.parse(readFileSync(dosya, 'utf8')) : []
    const birlesik = birlestir(eskiler, yeniler)
    writeFileSync(dosya, JSON.stringify(birlesik, null, 1) + '\n', 'utf8')
    ozet.sektorler[s.ad] = birlesik.length
    ozet.toplam += birlesik.length
  }
  writeFileSync(join(sehirDizini, '_ozet.json'), JSON.stringify(ozet, null, 2) + '\n', 'utf8')
  return ozet
}

const cliMi = process.argv[1] && process.argv[1].endsWith('topla.mjs')
if (cliMi) {
  const sehir = process.argv[2]
  if (!sehir) {
    console.error('Kullanim: node topla.mjs <Sehir>  — ' + Object.keys(SEHIRLER).join(', '))
    process.exit(1)
  }
  sehirTopla(sehir)
    .then((o) => console.log(`${o.sehir}: ${o.toplam} kunye (${o.parca_sayisi} parca) — ${o.tarih}`))
    .catch((h) => { console.error('Hata:', h.message); process.exit(1) })
}
