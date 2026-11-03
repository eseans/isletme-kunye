// isletme-kunye — halka acik isletme kunyesi toplayici.
//
// KAYNAK: OpenStreetMap (Overpass API). OSM verisi acik lisanslidir (ODbL) ve
// kunye alanlari (ad, kategori, adres, telefon, web, calisma saati) katkicilar
// tarafindan ISTENILENREK yayinlanir. Google/Yandex linkleri HESAPLANIR
// (koordinat + ad ile resmi URL bicimi) — hicbir Maps servisi kazinmaz.
//
// KVKK SINIRI (bkz. ana repo docs/261103.isletme-verisi-hukuk-matrisi.md):
// alanni beyaz listesi DISINDA HICBIR etiket kayda girmez. Kisi adi
// (operator, contact:name), e-posta, kimlik benzeri alanlar toplanmaz.
// Bu, kodun degil URUN KARARININ parcasi: beyaz liste daraltilabilir,
// genisletilmemelidir.
//
// Kullanim: node topla.mjs <Sehir>            (ornek: node topla.mersin... no)
//           node topla.mjs Istanbul
// Cikti:    data/<sehir-slug>/<sektor>.json + data/<sehir-slug>/_ozet.json

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// ── Sehirler (slug + Overpass geocodeArea adi). Yeni sehir buraya eklenir. ──
export const SEHIRLER = {
  Istanbul: { slug: 'istanbul', alan: 'İstanbul' },
  Ankara: { slug: 'ankara', alan: 'Ankara' },
  Izmir: { slug: 'izmir', alan: 'İzmir' },
  Bursa: { slug: 'bursa', alan: 'Bursa' },
  Antalya: { slug: 'antalya', alan: 'Antalya' },
  Eskisehir: { slug: 'eskisehir', alan: 'Eskişehir' },
}

// ── Sektor eslemesi: OSM etiketi -> eSeans sektoru. ──
// Yalniz randevuyla calisan isletme turleri; okul/pazar gibi alanlar YOK.
export const SEKTORLER = [
  { ad: 'dis-klinigi', etiketler: [['amenity', 'dentist']] },
  { ad: 'klinik', etiketler: [['amenity', 'clinic'], ['amenity', 'doctors'], ['healthcare', 'clinic'], ['healthcare', 'doctor'], ['healthcare', 'centre'], ['healthcare', 'midwife']] },
  { ad: 'guzellik-salonu', etiketler: [['shop', 'beauty'], ['shop', 'cosmetics'], ['shop', 'perfumery']] },
  { ad: 'kuafor', etiketler: [['shop', 'hairdresser'], ['shop', 'barber']] },
  { ad: 'spor-salonu', etiketler: [['leisure', 'fitness_centre'], ['leisure', 'sports_centre']] },
  { ad: 'spa-masaj', etiketler: [['shop', 'massage'], ['leisure', 'spa']] },
  { ad: 'dovme', etiketler: [['shop', 'tattoo'], ['craft', 'tattoo']] },
  { ad: 'veteriner', etiketler: [['amenity', 'veterinary']] },
  { ad: 'psikoloji', etiketler: [['healthcare', 'psychologist'], ['office', 'psychologist'], ['office', 'therapist']] },
  { ad: 'diyetisyen', etiketler: [['healthcare', 'dietitian'], ['office', 'dietitian']] },
  { ad: 'fotografci', etiketler: [['shop', 'photo'], ['craft', 'photographer']] },
]

// ── KVKK: kunye alanni beyaz listesi. BUNUN DISINA CIKMA. ──
// Kisi adlari (operator, contact:name, owner), e-posta, TCKN benzeri her sey
// bu listeye HIc girmedi; eslemede de okunmaz.
const KAYIT_SABLONU = {
  ad: null, sektor: null, kategori: null,
  adres: null, il: null, ilce: null, mahalle: null,
  telefon: null, web: null, sosyal: [],
  calisma_saatleri: null,
  lat: null, lng: null,
  maps_url: null, yandex_url: null, osm_url: null,
  kaynak: 'osm', ilk_gorulme: null, son_gorulme: null,
}

const oz = (v) => (typeof v === 'string' ? v.trim() : null) || null
const cok = (etiket, ...anahtarlar) => {
  for (const a of anahtarlar) {
    const v = etiket[a]
    if (Array.isArray(v)) { const i = v.map(oz).filter(Boolean); if (i.length) return i }
    else if (v != null && String(v).trim()) return String(v).trim()
  }
  return null
}

// Tek bir OSM ogesini kunye kaydina cevirir. Kisisel alan okumaz.
export function kayitEsle(oge, sektor, sehir, bugun) {
  const e = oge.tags || {}
  const ad = oz(e.name)
  if (!ad) return null // isimsiz ogeler vitrin degil
  const lat = oge.lat ?? oge?.center?.lat ?? null
  const lng = oge.lon ?? oge?.center?.lon ?? null
  const adres = [oz(e['addr:housenumber']), oz(e['addr:street']), oz(e['addr:neighbourhood'])].filter(Boolean).join(' ') || null
  const sosyal = []
  for (const [anahtar, ad_] of [['contact:instagram', 'instagram'], ['contact:facebook', 'facebook'], ['contact:twitter', 'x']]) {
    const v = oz(e[anahtar])
    if (v) sosyal.push({ tur: ad_, deger: v.startsWith('http') ? v : `https://${ad_ === 'x' ? 'x' : ad_}.com/${v.replace(/^@/, '')}` })
  }
  const sorgu = lat != null ? `${lat},${lng}` : `${ad} ${sehir}`
  return {
    ...KAYIT_SABLONU,
    ad,
    sektor,
    kategori: oz(e['healthcare:speciality']) || sektor,
    adres,
    il: oz(e['addr:city']) || sehir,
    ilce: oz(e['addr:district']) || oz(e['addr:suburb']) || null,
    mahalle: oz(e['addr:neighbourhood']) || oz(e['addr:quarter']) || null,
    telefon: cok(e, 'phone', 'contact:phone', 'contact:mobile'),
    web: cok(e, 'website', 'contact:website'),
    sosyal,
    calisma_saatleri: cok(e, 'opening_hours'),
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

// Sehir adini Nominatim ile iliskiye cozup Overpass alan kimligine cevirir.
// geocodeArea kisayolu bazi aynalarda kapali oldugundan sayisal kimlik
// kullanilir. Iliski -> 3600000000+id (Overpass adresleme duzeni).
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

// Overpass ana sunucusu sik doluyor; resmi aynalar sirayla denenir (bkz.
// overpass-api.de/mirrors). 429/5xx ve ag hatalarinda ustel beklemeyle tekrar.
const UCLAR = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]
const bekle = (ms) => new Promise((c) => setTimeout(c, ms))

async function overpassCek(sorgu, deneme = 0) {
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
      // 200 ama bos govde DE yeniden denenebilir arizadir: bazi aynalar alan
      // sorgularini bos dondurebiliyor. Bu sorgularin hepsi buyuk sehrin sektor
      // setini ister; 0 kayit gercek olamaz.
      if (Array.isArray(yanit?.elements) && yanit.elements.length > 0) return yanit
    } else if (istek.status >= 400 && istek.status < 500 && istek.status !== 429) {
      throw new Error(`Overpass ${istek.status}: ${(await istek.text()).slice(0, 200)}`)
    }
  } catch (h) {
    if (deneme >= UCLAR.length * 3) throw h
  }
  if (deneme >= UCLAR.length * 3 - 1) throw new Error('Overpass uc noktalarinin hepsi bos/gedikli dondu')
  await bekle(15000 * tur)
  return overpassCek(sorgu, deneme + 1)
}

// Ogesi bu sektorun etiket kurallarindan en az birine uyuyor mu?
export const sektoreUyar = (oge, etiketler) =>
  etiketler.some(([anahtar, deger]) => oge?.tags?.[anahtar] === deger)

export async function sehirTopla(sehirAdi, kokDizin = '.') {
  const sehir = SEHIRLER[sehirAdi]
  if (!sehir) throw new Error(`Bilinmeyen sehir: ${sehirAdi} (SEHIRLER listesine ekle)`)
  const bugun = new Date().toISOString().slice(0, 10)
  const ham = await overpassCek(overpassSorgusu(await alanKimligiBul(sehir.alan)))
  // Bos sonuc ASLA yazilmaz: bu sehrin sektor setinde 0 kayit gercek olamaz;
  // bos yanit ayna/ariza kaynaklidir ve onceki iyi veriyu ezmesin.
  if (!Array.isArray(ham?.elements) || ham.elements.length === 0) {
    throw new Error(`${sehirAdi}: Overpass bos/gedikli yanit dondu — yazma iptal edildi`)
  }

  const sehirDizini = join(kokDizin, 'data', sehir.slug)
  mkdirSync(sehirDizini, { recursive: true })

  const ozet = { sehir: sehirAdi, tarih: bugun, kaynak: '© OpenStreetMap katkıcıları (ODbL)', ham_oge: ham.elements.length, sektorler: {}, toplam: 0 }
  for (const s of SEKTORLER) {
    const yeniler = ham.elements
      .filter((o) => sektoreUyar(o, s.etiketler))
      .map((o) => kayitEsle(o, s.ad, sehirAdi, bugun))
      .filter(Boolean)
    // Bir isletme birden fazla sektor etiketi tasiyabilir; kayit sektorune
    // ozel dosyalarda tutulur (dosya = sektor gorunumu).
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

// ── CLI ──
const cliMi = process.argv[1] && process.argv[1].endsWith('topla.mjs')
if (cliMi) {
  const sehir = process.argv[2]
  if (!sehir) {
    console.error('Kullanim: node topla.mjs <Sehir>  — ' + Object.keys(SEHIRLER).join(', '))
    process.exit(1)
  }
  sehirTopla(sehir)
    .then((o) => console.log(`${o.sehir}: ${o.toplam} kunye — ${o.tarih}`))
    .catch((h) => { console.error('Hata:', h.message); process.exit(1) })
}
