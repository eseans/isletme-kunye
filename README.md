# isletme-kunye — halka açık işletme künyesi deposu

Randevuyla çalışan işletmelerin (diş klinikleri, güzellik salonları, kuaförler,
veterinerler, stüdyolar…) **halka açık künye bilgisini** açık veri kaynağından
toplayan, sürümleyen ve yayımlayan otomatik depo. GitHub Actions haftada bir
çalışır; manuel tetiklemeyle herhangi bir şehir anında toplanabilir.

## Ne toplar (künye beyaz listesi)

| Alan | Örnek |
|---|---|
| ad, sektör, kategori, hizmet ipuçları | "Ada Diş Kliniği", dis-klinigi, [orthodontics, implant] |
| il, ilçe, mahalle, adres | İstanbul · Kadıköy · Bağdat Cad. 120 |
| telefon | yalnız kayıtta **kamuyla paylaşılmış** kurumsal numara |
| web sitesi, sosyal medya hesabı | işletme hesapları |
| çalışma saatleri, randevu, engelli erişimi | OSM `opening_hours` / `appointment` / `wheelchair` |
| koordinat + harita linki | Google Maps ve Yandex Maps **arama linkleri (hesaplanır, kazınmaz)** |

## Ne TOPLAMAZ (KVKK sınırı — kodla kilitli)

- ❌ Gerçek kişi adları (`operator`, `contact:name`, `owner`…)
- ❌ E-posta adresleri
- ❌ Kişisel telefon/WhatsApp
- ❌ Puan, yorum, popülerlik (uydurma veri zaten ürün kuralı gereği yasak)

**Puan/eşleşme sinyali:** harita servislerinin puanları ToS + KVKK gereği KAZINMAZ.
Sinyal olarak OSM etiket zenginliği toplanır (hizmet ipuçları, randevu, dolgunluk);
gerçek puanlar yalnız kendi platform değerlendirmelerinden birikecek.

Bu sınır `test/kunye.test.mjs` ile kilitlidir: beyaz liste dışına alan
ekleyen değişiklik testi kırmızısı yapar. Dayanak çerçeve: ana repodaki
`docs/261103.isletme-verisi-hukuk-matrisi.md` (mühendislik rehberi; hukuki
danışmanlık değildir).

## Kaynak ve lisans

- **Kaynak:** [OpenStreetMap](https://www.openstreetmap.org) üzerinden
  Overpass API. Künye alanları OSM katkıcıları tarafından yayımlanmıştır.
- **Veri lisansı:** `data/` altındaki türev veri **ODbL 1.0** (© OpenStreetMap
  katkıcıları). Kullanırken atıf verin.
- **Kod lisansı:** MIT (bkz. LICENSE).
- Google/Yandex linkleri koordinat+işletme adından **resmî URL bicimiyle**
  üretilir; hiçbir harita servisi kazınmaz, API anahtarı gerekmez.

## Yapı

```
topla.mjs                     toplayici + esleme + birlestirme (bagimliliksiz Node)
test/kunye.test.mjs           KVKK beyaz liste kilidi
data/<sehir>/<sektor>.json    kunye kayitlari (osm_url anahtariyla kararli)
data/<sehir>/_ozet.json       tarih + sektor sayilari
.github/workflows/topla.yml   haftalik cron + manuel dispatch
```

Kayıt örneği:

```json
{
  "ad": "Ada Diş Kliniği", "sektor": "dis-klinigi", "kategori": "dis-klinigi",
  "adres": "120 Bağdat Caddesi", "il": "İstanbul", "ilce": "Kadıköy",
  "telefon": "+90 216 …", "web": "https://…", "sosyal": [{"tur":"instagram","deger":"https://instagram.com/…"}],
  "calisma_saatleri": "Mo-Fr 09:00-18:00", "lat": 41.01, "lng": 28.97,
  "maps_url": "https://www.google.com/maps/search/?api=1&query=…",
  "yandex_url": "https://yandex.com/maps/?text=…",
  "osm_url": "https://www.openstreetmap.org/node/…",
  "kaynak": "osm", "ilk_gorulme": "2026-11-03", "son_gorulme": "2026-11-03"
}
```

## Tarama düzeni

- **Yoğun dönem (2026-11-11'e kadar):** her gün 03:00 UTC'de İstanbul, ilçe ilçe
  (39 parça) tazelenir — süre bitince workflow kendini atlar.
- **Normal:** her pazartesi 04:00 UTC'de İstanbul + Ankara + İzmir.
- Büyük şehirler `parcala: true` ile ilçe ilişkilerine bölünür (tek dev sorgu
  eksik/noksallı döner); küçük şehirler tek parça.

## Yeni şehir ekleme

1. `topla.mjs` içindeki `SEHIRLER` sözlüğüne `SehirAdi: { slug, alan }` ekle.
2. İlk toplamayı yerelde çalıştır: `node topla.mjs SehirAdi`
3. Commit + push — Actions haftalık takvimine girer; anında istersen:
   `gh workflow run topla.yml -f sehir=SehirAdi`

## Neden OSM?

Belediye açık verisi ve ticaret sicili tek biçimli değil; OSM tek sorguda tüm
sektörleri, koordinatları ve açık lisansı (ODbL) verir. Sicil/gazete taraması
ve belediye entegrasyonları bu deponun üstüne ayrı kaynak bağlayıcıları olarak
eklenebilir (`kaynak` alanı hazırlanmıştır).
