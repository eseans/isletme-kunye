// data/*.json -> site/*.json kompakt site ihracati (ana site bunu ceker).
// Isim temizligi: kaynaklardaki susleme artiklari (---Ad---, "Ad", *Ad*) kesilir.
// Emoji/sembol susleri (✂ 📢 《》 ☑) silinir; bastaki/sondaki noktalama kesilir.
// Parantez dengesizse (bastaki "(" gibi) parantezler atilir.
export const adTemiz = (ad) => {
  let t = String(ad || '').normalize('NFC')
    .replace(/[\p{Extended_Pictographic}\p{So}\p{Sk}\p{Co}\p{Cs}‍️《》〈〉«»【】〽§@#~^_=<>\[\]{}\\]/gu, ' ')
  if ((t.match(/\(/g) || []).length !== (t.match(/\)/g) || []).length) t = t.replace(/[()]/g, ' ')
  return t.replace(/\s{2,}/g, ' ').replace(/^[^\p{L}\p{N}(]+|[^\p{L}\p{N})]+$/gu, '').trim()
}
// Gercek isim = en az 2 harf. "." "+90" gibi kayitlar listeye girmez.
export const adGecerli = (ad) => (String(ad).match(/\p{L}/gu) || []).length >= 2
// Liste sirasi: once dolgun (telefon/web), sonra adresli, sonra ad. Ziyaretci
// ilk ekranda bos kunye degil, iletisim bilgisi olan isletme gorur.
const zenginlik = (k) => (dolgun({ telefon: k[2], web: k[3] }) ? 2 : 0) + (k[9] ? 1 : 0)
// Kayit bicimi: [ad, ilce, telefon, web, lat, lng, kaynak, id, instagram, adres, saatler]
// Ayrica site/_sitemap-isletmeler.xml uretir: dizin 90 + DOLGUN vitrin URL'leri
// (sabit telefon veya web). Ince kunyeler bilincli disarida (olceklenmis icerik
// riski); slug/kimlik mantigi ana repo lib/isletmeler.js ile BIREBIR ayni.
// Kullanim: node scripts/site_disari.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { slugla, telefonTemizle } from '../topla.mjs'

// 81 il (iller.json); hangi illerde veri varsa o iller yayina girer.
const IL_AD = Object.fromEntries(JSON.parse(readFileSync('iller.json', 'utf8')).map(([s, a]) => [s, a]))
// Saat kaynagi: isletmenin kendi sitesinden mi geldi (web_kunye.mjs kaydi)?
const webKontrol = existsSync('data/_web_kontrol.json') ? JSON.parse(readFileSync('data/_web_kontrol.json', 'utf8')) : {}
const kokenOf = (w) => { try { return new URL(/^https?:/.test(w) ? w : 'https://' + w).origin } catch { return '' } }
const saatKaynagi = (k) => !k.calisma_saatleri ? ''
  : (webKontrol[kokenOf(k.web)]?.alanlar || []).includes('calisma_saatleri') ? 'web' : (k.kaynak || 'osm')
const SEKTOR_SLUG = ['kuafor', 'guzellik-salonu', 'klinik', 'dis-klinigi', 'spor-salonu',
  'egitim-kurs', 'dovme', 'veteriner', 'spa-masaj', 'diyetisyen', 'optik',
  'fotografci', 'psikoloji', 'fizyoterapi', 'tamamlayici-tip']

const vitrinYolu = (s, k, ad, kimlik) =>
  `/isletmeler/${s}/${k}/${slugla(ad).slice(0, 60) || 'isletme'}-${kimlik}`
const dolgun = (k) => Boolean(telefonTemizle(k.telefon) || k.web)

// Kayit → site satiri. [12] = isletmenin kendi sitesindeki logo (web_kunye.mjs).
function siteKaydi(k, sehir) {
  const ig = (k.sosyal || []).find((x) => x.tur === 'instagram')
  const igAd = ig ? String(ig.deger).split('/').pop().replace(/^@+/, '') : ''
  return [
    // FSQ 'locality' alani bazen sehir adi tasiyor; sahte 'Istanbul ilcesi' olmasin.
    adTemiz(k.ad), (k.ilce && slugla(k.ilce) !== sehir ? k.ilce : ''), telefonTemizle(k.telefon) || '', k.web || '',
    k.lat != null ? Number(k.lat.toFixed(4)) : null,
    k.lng != null ? Number(k.lng.toFixed(4)) : null,
    k.kaynak || 'osm', k.fsq_id || (k.osm_url || '').split('/').pop() || '',
    /^[A-Za-z][A-Za-z0-9._]{1,29}$/.test(igAd) ? igAd : '',
    // Hukuk matrisi #4 (is yeri adresi ✅) ve #9 (saat, "kaynaga gore" damgali).
    k.adres || '', k.calisma_saatleri || '', saatKaynagi(k), k.logo || '',
  ]
}
// Turkce harfte \b calismaz (ş kelime karakteri sayilmaz): kendi kelime siniri.
const kelime = (k) => new RegExp(`(^|[^a-z0-9çğıöşü])(${k})($|[^a-z0-9çğıöşü])`)
export const DUZELT = [
  ['dis-klinigi', kelime('diş|dis|dental|dent|ortodonti|ortodontist|implant|ağız ve diş|agiz ve dis|dişçi')],
  ['diyetisyen', kelime('diyetisyen|dyt|diyet|beslenme')],
  ['fizyoterapi', kelime('fizik tedavi|fizyoterapi|fizyoterapist|physio|fizyo')],
  ['psikoloji', kelime('psikolog|psikoterapi|psikolojik danışmanlık|psikolojik danışman')],
  ['veteriner', kelime('veteriner|vet')],
  ['optik', kelime('optik|gözlükçü')],
]
const tasinan = {}
// Coklu sektorlu isletmenin kalacagi sektor: ozelden genele.
const ONCELIK = ['dis-klinigi', 'diyetisyen', 'psikoloji', 'fizyoterapi', 'veteriner', 'optik', 'dovme', 'fotografci',
  'egitim-kurs', 'spa-masaj', 'spor-salonu', 'kuafor', 'guzellik-salonu', 'tamamlayici-tip', 'klinik']
// Zengin kunye: iletisim (telefon/web) + en az bir ek bilgi (adres, saat, instagram)
// ya da hem telefon hem web. Yalniz bunlar indekslenir.
export const zengin = (k) => Boolean((k[2] || k[3]) && (k[9] || k[10] || k[8] || (k[2] && k[3])))

mkdirSync('site', { recursive: true })
let toplam = 0
const sitemapUrller = []
const ozet = []
const bugun = new Date().toISOString().slice(0, 10)
const sehirMeta = {}
const adlar = {}
for (const sehir of readdirSync('data')) {
  const d = join('data', sehir)
  if (!statSync(d).isDirectory() || !IL_AD[sehir]) continue
  sitemapUrller.push(`  <url><loc>https://esesion.com/isletmeler/${sehir}</loc><lastmod>${bugun}</lastmod></url>`)
  const enlemler = [], boylamlar = []
  mkdirSync(join('site', sehir), { recursive: true })
  // 1) Ilin butun sektorlerini oku (tasima icin hepsi bellekte olmali).
  const kumeler = {}
  for (const f of readdirSync(d)) {
    if (!f.endsWith('.json') || f === '_ozet.json') continue
    kumeler[f.replace('.json', '')] = JSON.parse(readFileSync(join(d, f), 'utf8')).map((k) => siteKaydi(k, sehir)).filter((k) => adGecerli(k[0]))
  }
  // 2) Ada gore sektor duzeltmesi: genis "klinik" kumesinde adi baska sektoru
  //    acikca soyleyenler tasinir ("Formlife Diyetisyen" klinik degil). Eski URL
  //    _tasinan.json ile 301 alir.
  for (const [hedef, rx] of DUZELT) {
    if (!kumeler.klinik) break
    const hedefte = new Set((kumeler[hedef] ||= []).map((k) => k[7]))
    kumeler.klinik = kumeler.klinik.filter((k) => {
      if (!rx.test(k[0].toLocaleLowerCase('tr'))) return true
      if (!hedefte.has(k[7])) kumeler[hedef].push(k)
      tasinan[String(k[7]).slice(-10)] = hedef
      return false
    })
  }
  // 3) Tek adres: ayni isletme birden cok sektorde ise (FSQ coklu kategori, ornegin
  //    kuafor + guzellik salonu) en belirgin sektorde kalir; digerleri _tasinan ile
  //    oraya 301. Kopya sayfa = Google'in olceklenmis icerik sinyali (7.7 bin vardi).
  const sahip = new Map()
  const sira = ONCELIK.filter((s) => kumeler[s]).concat(Object.keys(kumeler).filter((s) => !ONCELIK.includes(s)))
  for (const s of sira) {
    kumeler[s] = kumeler[s].filter((k) => {
      const id = String(k[7]).slice(-10)
      if (!sahip.has(id)) { sahip.set(id, s); return true }
      tasinan[id] = sahip.get(id)
      return false
    })
  }
  for (const sektor of Object.keys(kumeler)) {
    if (!kumeler[sektor].length) continue
    // 5'ten az kayitli liste ince sayfa: yayinda ama sitemap'te yok (worker noindex verir).
    if (kumeler[sektor].length >= 5) sitemapUrller.push(`  <url><loc>https://esesion.com/isletmeler/${sehir}/${sektor}</loc><lastmod>${bugun}</lastmod></url>`)
    const kayitlar = kumeler[sektor]
      .sort((a, b) => zenginlik(b) - zenginlik(a) || String(a[0]).localeCompare(String(b[0]), 'tr'))
    for (const k of kayitlar) {
      if (k[4] != null) { enlemler.push(k[4]); boylamlar.push(k[5]) }
      if (!dolgun({ telefon: k[2], web: k[3] })) continue
      // Arama dizini: yalniz dolgun kunyeler (adiyla aranan isletme genelde budur).
      ;(adlar[sehir] ||= []).push([k[0], sektor, k[1], String(k[7]).slice(-10), k[4], k[5]])
      // Indeks yalniz ZENGIN kunyede (ad+telefon tek basina ince sayfa). Ayni kural
      // ana sitede lib/isletmeler.js zenginMu (robots meta) — ikisi birlikte degisir.
      if (!zengin(k)) continue
      sitemapUrller.push(`  <url><loc>https://esesion.com${vitrinYolu(sehir, sektor, k[0], String(k[7]).slice(-10))}</loc></url>`)
    }
    writeFileSync(join('site', sehir, sektor + '.json'),
      JSON.stringify({ sehir, sektor, n: kayitlar.length, kayitlar }) + '\n')
    const ilceSay = {}
    for (const k of kayitlar) if (k[1]) ilceSay[k[1]] = (ilceSay[k[1]] || 0) + 1
    for (const [ad, n2] of Object.entries(ilceSay)) {
      if (n2 < 5) continue
      sitemapUrller.push(`  <url><loc>https://esesion.com/isletmeler/${sehir}/${sektor}/${slugla(ad)}</loc></url>`)
    }
    ozet.push({ sehir, sektor, n: kayitlar.length, ilceler: Object.fromEntries(Object.entries(ilceSay).filter(([, n2]) => n2 >= 3)) })
    toplam += kayitlar.length
  }
  // Sehir merkezi = medyan (aykiri koordinat haritayi denize cekmesin); kutu = %2-%98.
  const sirala = (a) => a.slice().sort((x, y) => x - y)
  const e = sirala(enlemler), b = sirala(boylamlar), q = (a, p) => a[Math.floor((a.length - 1) * p)]
  if (e.length) sehirMeta[sehir] = { ad: IL_AD[sehir], merkez: [q(e, 0.5), q(b, 0.5)], kutu: [q(e, 0.02), q(b, 0.02), q(e, 0.98), q(b, 0.98)] }
}
mkdirSync('site/_adlar', { recursive: true })
for (const [s, liste] of Object.entries(adlar)) writeFileSync(`site/_adlar/${s}.json`, JSON.stringify(liste) + '\n')
writeFileSync('site/_sehirler.json', JSON.stringify(sehirMeta) + '\n')
// Sektoru duzeltilen vitrinler: kimlik → yeni sektor (worker eski URL'e 301 verir).
writeFileSync('site/_tasinan.json', JSON.stringify(tasinan) + '\n')
// Kapi sayfasi (/isletmeler) sehir x sektor sayilarini buradan okur.
writeFileSync('site/_ozet.json', JSON.stringify(ozet) + '\n')
writeFileSync('site/_sitemap-isletmeler.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrller.join('\n')}\n</urlset>\n`)
console.log('site/ ihracati:', toplam, 'kayit | sitemap:', sitemapUrller.length, 'URL')
