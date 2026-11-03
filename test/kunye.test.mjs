// Kunye eslemesinin KVKK siniri — beyaz liste davranisini kilitler.
//
// Neden test: "kisi verisi toplama" yasagi yorum degil, sabit listesidir.
// Bir gun birisi operator/contact:email eklemek isterse bu test kirar.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { kayitEsle, birlestir, overpassSorgusu, SEKTORLER } from '../topla.mjs'

const oge = (tags, extra = {}) => ({
  type: 'node', id: 42, lat: 41.01, lon: 28.97,
  tags, ...extra,
})

test('kunye alannlari eslenir; maps/yandex linkleri hesaplanir', () => {
  const k = kayitEsle(oge({
    name: 'Ada Diş Kliniği',
    amenity: 'dentist',
    'addr:street': 'Bağdat Caddesi', 'addr:housenumber': '120',
    'addr:city': 'İstanbul', 'addr:district': 'Kadıköy', 'addr:neighbourhood': 'Fenerbahçe',
    phone: '+90 216 000 00 00', website: 'https://adadis.com',
    'contact:instagram': '@adadis', opening_hours: 'Mo-Fr 09:00-18:00',
  }), 'dis-klinigi', 'İstanbul', '2026-11-03')

  assert.equal(k.ad, 'Ada Diş Kliniği')
  assert.equal(k.ilce, 'Kadıköy')
  assert.equal(k.telefon, '+90 216 000 00 00')
  assert.equal(k.web, 'https://adadis.com')
  assert.deepEqual(k.sosyal, [{ tur: 'instagram', deger: 'https://instagram.com/adadis' }])
  assert.ok(k.maps_url.startsWith('https://www.google.com/maps/search/?api=1&query='))
  assert.ok(k.yandex_url.includes('yandex.com/maps'))
  assert.ok(k.osm_url.endsWith('/node/42'))
})

test('KISISEL alanlar HIC okunmaz: operator, e-posta, kisi adi', () => {
  const k = kayitEsle(oge({
    name: 'X Klinik', amenity: 'clinic',
    operator: 'Ayşe Yılmaz', 'operator:type': 'private',
    'contact:name': 'Ayşe Yılmaz', 'contact:email': 'ayse@x.com',
    email: 'info@x.com', owner: 'Mehmet Demir',
  }), 'klinik', 'Ankara', '2026-11-03')
  const metin = JSON.stringify(k)
  assert.ok(!metin.includes('Ayşe'), 'kisi adi sizdi')
  assert.ok(!metin.includes('@x.com') && !metin.includes('info@x.com'), 'e-posta sizdi')
  assert.ok(!metin.includes('Mehmet'), 'owner sizdi')
  // Beyaz liste sablonu disinda alan olamaz.
  for (const anahtar of Object.keys(k)) {
    assert.ok(anahtar in { ad:1, sektor:1, kategori:1, adres:1, il:1, ilce:1, mahalle:1,
      telefon:1, web:1, sosyal:1, calisma_saatleri:1, lat:1, lng:1, maps_url:1,
      yandex_url:1, osm_url:1, kaynak:1, ilk_gorulme:1, son_gorulme:1 }, `beyaz liste disi alan: ${anahtar}`)
  }
})

test('isimsiz kayit vitrin degil; way ogeleri merkez koordinatla eslenir', () => {
  assert.equal(kayitEsle(oge({ amenity: 'clinic' }), 'klinik', 'İzmir', '2026-11-03'), null)
  const w = kayitEsle({ type: 'way', id: 7, center: { lat: 39.9, lon: 32.8 }, tags: { name: 'Salon', shop: 'beauty' } }, 'guzellik-salonu', 'Ankara', '2026-11-03')
  assert.equal(w.lat, 39.9)
  assert.ok(w.osm_url.endsWith('/way/7'))
})

test('birlestirme ilk gorulme tarihini korur, alannlari tazeler', () => {
  const eski = [{ ...kayitEsle(oge({ name: 'A', shop: 'beauty' }), 'guzellik-salonu', 'Bursa', '2026-01-01'), telefon: null }]
  const yeni = [kayitEsle(oge({ name: 'A', shop: 'beauty', phone: '123' }), 'guzellik-salonu', 'Bursa', '2026-11-03')]
  const b = birlestir(eski, yeni)
  assert.equal(b.length, 1)
  assert.equal(b[0].ilk_gorulme, '2026-01-01')
  assert.equal(b[0].son_gorulme, '2026-11-03')
  assert.equal(b[0].telefon, '123')
})

test('sorgu her sektor etiketi icin uc OSM tipini ister', () => {
  const s = overpassSorgusu(360000223421)
  assert.ok(s.includes('area(360000223421)->.a;'), 'sayisal alan kimligi kullanilmali')
  for (const sek of SEKTORLER) {
    for (const [a, d] of sek.etiketler) {
      assert.ok(s.includes(`["${a}"="${d}"]`), `eksik: ${a}=${d}`)
    }
  }
  assert.ok(s.includes('out center tags;'))
})
