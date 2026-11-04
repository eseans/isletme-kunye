// Kunye eslemesinin KVKK siniri + v2 yetenekleri.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { kayitEsle, birlestir, overpassSorgusu, sektoreUyar, SEKTORLER } from '../topla.mjs'

const oge = (tags, extra = {}) => ({ type: 'node', id: 42, lat: 41.01, lon: 28.97, tags, ...extra })

test('kunye alannlari eslenir; maps/yandex linkleri hesaplanir', () => {
  const k = kayitEsle(oge({
    name: 'Ada Diş Kliniği', amenity: 'dentist',
    'addr:street': 'Bağdat Caddesi', 'addr:housenumber': '120',
    'addr:city': 'İstanbul', 'addr:district': 'Kadıköy', 'addr:neighbourhood': 'Fenerbahçe',
    phone: '+90 216 000 00 00', website: 'https://adadis.com',
    'contact:instagram': '@adadis', opening_hours: 'Mo-Fr 09:00-18:00',
    appointment: 'only', wheelchair: 'yes', 'healthcare:speciality': 'orthodontics;implant',
  }), 'dis-klinigi', 'İstanbul', 'Kadıköy', '2026-11-04')

  assert.equal(k.ilce, 'Kadıköy')
  assert.equal(k.randevu, 'only')
  assert.equal(k.engelli_erisimi, 'yes')
  assert.deepEqual(k.hizmet_ipuclari, ['orthodontics', 'implant'])
  assert.ok(k.maps_url.startsWith('https://www.google.com/maps/search/?api=1&query='))
  assert.ok(k.yandex_url.includes('yandex.com/maps'))
})

test('KISISEL alanlar HIC okunmaz (operator, e-posta, kisi adi)', () => {
  const k = kayitEsle(oge({
    name: 'X Klinik', amenity: 'clinic',
    operator: 'Ayşe Yılmaz', 'contact:name': 'Ayşe Yılmaz',
    'contact:email': 'ayse@x.com', email: 'info@x.com', owner: 'Mehmet Demir',
  }), 'klinik', 'Ankara', 'Çankaya', '2026-11-04')
  const metin = JSON.stringify(k)
  assert.ok(!metin.includes('Ayşe') && !metin.includes('Mehmet'), 'kisi adi sizdi')
  assert.ok(!metin.includes('@x.com') && !metin.includes('info@x.com'), 'e-posta sizdi')
  for (const anahtar of Object.keys(k)) {
    assert.ok(anahtar in { ad:1, sektor:1, kategori:1, hizmet_ipuclari:1, adres:1, il:1, ilce:1,
      mahalle:1, telefon:1, web:1, sosyal:1, calisma_saatleri:1, randevu:1, engelli_erisimi:1,
      lat:1, lng:1, maps_url:1, yandex_url:1, osm_url:1, kaynak:1, ilk_gorulme:1, son_gorulme:1 },
      `beyaz liste disi alan: ${anahtar}`)
  }
})

test('noktali virgullu coklu etiket degeri sektorlere eslesir', () => {
  const o = oge({ name: 'A', shop: 'hairdresser;beauty' })
  assert.ok(sektoreUyar(o, SEKTORLER.find((s) => s.ad === 'kuafor').etiketler))
  assert.ok(sektoreUyar(o, SEKTORLER.find((s) => s.ad === 'guzellik-salonu').etiketler))
  assert.ok(!sektoreUyar(o, SEKTORLER.find((s) => s.ad === 'klinik').etiketler))
})

test('yeni ad uzaylari: healthcare=*, egitim kurumlari, fizyoterapi', () => {
  assert.ok(sektoreUyar(oge({ name: 'D', healthcare: 'dentist' }), SEKTORLER.find((s) => s.ad === 'dis-klinigi').etiketler))
  assert.ok(sektoreUyar(oge({ name: 'E', amenity: 'language_school' }), SEKTORLER.find((s) => s.ad === 'egitim-kurs').etiketler))
  assert.ok(sektoreUyar(oge({ name: 'F', healthcare: 'physiotherapist' }), SEKTORLER.find((s) => s.ad === 'fizyoterapi').etiketler))
})

test('isimsiz kayit vitrin degil; way merkeziyle eslenir; ilce parcasi dolabilir', () => {
  assert.equal(kayitEsle(oge({ amenity: 'clinic' }), 'klinik', 'İzmir', 'Bornova', '2026-11-04'), null)
  const w = kayitEsle({ type: 'way', id: 7, center: { lat: 39.9, lon: 32.8 }, tags: { name: 'Salon', shop: 'beauty' } }, 'guzellik-salonu', 'Ankara', 'Etimesgut', '2026-11-04')
  assert.equal(w.lat, 39.9)
  assert.equal(w.ilce, 'Etimesgut')
})

test('birlestirme ilk gorulmeyi korur; sorgu tum etiketleri ister', () => {
  const eski = [{ ...kayitEsle(oge({ name: 'A', shop: 'beauty' }), 'guzellik-salonu', 'Bursa', 'Nilüfer', '2026-01-01'), telefon: null }]
  const yeni = [kayitEsle(oge({ name: 'A', shop: 'beauty', phone: '123' }), 'guzellik-salonu', 'Bursa', 'Nilüfer', '2026-11-04')]
  const b = birlestir(eski, yeni)
  assert.equal(b[0].ilk_gorulme, '2026-01-01')
  assert.equal(b[0].telefon, '123')

  const s = overpassSorgusu(360000223421)
  assert.ok(s.includes('area(360000223421)->.a;'))
  assert.ok(s.includes('["healthcare"="dentist"]'))
  assert.ok(s.includes('["amenity"="language_school"]'))
})
