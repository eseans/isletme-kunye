# FSQ OS Places -> kunye (v3). Iki tablo: places_*.parquet (yerler) + kategori
# boyutu (adi places_ ile baslamayan). Boyuttan id->sektor sozlugu kurulur,
# yerler id kesisimiyle suzulur, OSM kunyeleriyle birlestirilir.
# Kullanim: python3 scripts/fsq_suz.py
import duckdb, json, os, re, unicodedata

KATEGORI = {
  'Hair Salon':'kuafor','Barbershop':'kuafor','Men\u2019s Hair Salon':'kuafor','Men\'s Hair Salon':'kuafor',
  'Beauty Salon':'guzellik-salonu','Nail Salon':'guzellik-salonu','Waxing':'guzellik-salonu','Threading Place':'guzellik-salonu',
  'Eyebrow & Lashes':'guzellik-salonu','Lash Bar':'guzellik-salonu',
  'Dentist\u2019s Office':'dis-klinigi','Dentist\'s Office':'dis-klinigi','Dental Clinic':'dis-klinigi','Orthodontist':'dis-klinigi','Dentist':'dis-klinigi',
  'Doctor\u2019s Office':'klinik','Doctor\'s Office':'klinik','Medical Center':'klinik','Clinic':'klinik',
  'Gym':'spor-salonu','Gym / Fitness Center':'spor-salonu','Pilates Studio':'spor-salonu','Yoga Studio':'spor-salonu',
  'Boxing Gym':'spor-salonu','Martial Arts School':'spor-salonu','CrossFit Box':'spor-salonu','Sports Complex':'spor-salonu',
  'Spa':'spa-masaj','Day Spa':'spa-masaj','Massage':'spa-masaj','Massage Studio':'spa-masaj',
  'Tattoo Parlor':'dovme','Tattoo':'dovme','Piercing':'dovme',
  'Veterinarian':'veteriner','Animal Hospital':'veteriner',
  'Psychologist':'psikoloji','Psychotherapist':'psikoloji','Therapist':'psikoloji',
  'Nutritionist':'diyetisyen','Dietitian':'diyetisyen',
  'Physical Therapist':'fizyoterapi','Chiropractor':'fizyoterapi','Acupuncture':'tamamlayici-tip',
  'Language School':'egitim-kurs','Music School':'egitim-kurs','Dance Studio':'egitim-kurs','Driving School':'egitim-kurs',
  'Tutoring Center':'egitim-kurs','Art School':'egitim-kurs','Cooking School':'egitim-kurs',
  'Optician':'optik','Optical Shop':'optik',
  'Photographer':'fotografci','Photo Studio':'fotografci',
}
SEHIR_BBOX = {
  'istanbul':(40.75,41.75,27.85,29.65),'ankara':(39.70,40.20,32.40,33.20),
  'izmir':(38.20,38.60,26.90,27.35),'bursa':(40.15,40.45,28.80,29.40),
  'antalya':(36.80,37.10,30.50,30.90),'eskisehir':(39.65,39.85,30.40,30.65),
}
def norm(ad):
  k = unicodedata.normalize('NFKD', ad or '')
  k = ''.join(c for c in k if not unicodedata.combining(c)).lower()
  return re.sub(r'[^a-z0-9]', '', k)[:40]

con = duckdb.connect()
dosyalar = sorted(f for f in os.listdir('fsq') if f.endswith('.parquet'))
yer_dosya = ['fsq/' + f for f in dosyalar if f.startswith('places_')]
boyut_dosya = ['fsq/' + f for f in dosyalar if not f.startswith('places_')]
print(f'{len(yer_dosya)} yer dosyasi, {len(boyut_dosya)} boyut dosyasi')

# 1) Boyuttan id -> sektor sozlugu (herhangi bir seviye adi sozlukteyse).
id_sektor = {}
for yol in boyut_dosya:
  kol = [r[0] for r in con.execute(f"DESCRIBE SELECT * FROM read_parquet('{yol}') LIMIT 1").fetchall()]
  ad_kolonlari = [c for c in kol if 'category_name' in c or c == 'category_label']
  id_kolon = next((c for c in kol if 'category_id' in c and 'level' not in c), None)
  if not ad_kolonlari or not id_kolon: continue
  for satir in con.execute(f"SELECT {id_kolon}, {', '.join(ad_kolonlari)} FROM read_parquet('{yol}')").fetchall():
    for v in satir[1:]:
      if v and str(v) in KATEGORI:
        id_sektor[str(satir[0])] = KATEGORI[str(v)]
        break
print(f'kategori id eslemesi: {len(id_sektor)}')

# 2) Yerler: kolonlari kesfet, TR'yi cek.
kol = [r[0] for r in con.execute(f"DESCRIBE SELECT * FROM read_parquet('{yer_dosya[0]}') LIMIT 1").fetchall()]
sec = lambda *a: next((x for x in a if x in kol), None)
id_kolon = sec('fsq_place_id', 'fsq_id', 'id')
ulke, kat_kolon = sec('country_code', 'country'), sec('category_ids', 'fsq_category_ids', 'category_id')
tel, web, hrs = sec('telephone', 'tel'), sec('website'), sec('hours')
reg, adres, ilce_k = sec('admin_region', 'region'), sec('address'), sec('locality')
print('ulke:', ulke, '| kategori:', kat_kolon, '| tel/web:', tel, web)
print('YER KOLONLARI:', kol)
assert ulke and kat_kolon and id_kolon, 'id/ulke/kategori kolonu yok — yukaridaki listeye bak'

rows = con.execute(f"""
 SELECT {id_kolon} AS fsq_id, name, latitude, longitude, {adres or 'NULL'} AS adres, {ilce_k or 'NULL'} AS ilce,
        {reg or 'NULL'} AS bolge, {tel or 'NULL'} AS telefon, {web or 'NULL'} AS web,
        {hrs or 'NULL'} AS saat, {kat_kolon} AS katlar
 FROM read_parquet('fsq/places_*.parquet', union_by_name=true)
 WHERE {ulke} IN ('TR','Turkey','Türkiye','Turkiye') AND name IS NOT NULL AND latitude IS NOT NULL AND date_closed IS NULL
""").fetchall()
print(f'TR kayit: {len(rows)}')

bugun = '2026-11-05'
yeni, toplam = {}, 0
for fsq_id, ad, lat, lng, adres_v, ilce_v, bolge, telefon, web_v, saat, katlar in rows:
  def duzlestir(x):
    if isinstance(x, str): return [x]
    if isinstance(x, (list, tuple)): return [i for e in x for i in duzlestir(e)]
    return [str(x)]
  etiketler = duzlestir(json.loads(katlar) if isinstance(katlar, str) else (katlar or []))
  sektorler = {KATEGORI[str(e)] for e in etiketler if str(e) in KATEGORI}
  if not sektorler: continue
  slug = next((s for s, (a1, a2, b1, b2) in SEHIR_BBOX.items() if a1 <= lat <= a2 and b1 <= lng <= b2), None)
  if not slug: continue
  for sek in sektorler:
    yeni.setdefault(slug, {}).setdefault(sek, []).append({
      'ad': ad, 'sektor': sek, 'kategori': sek, 'hizmet_ipuclari': etiketler[:8],
      'adres': adres_v, 'il': None, 'ilce': ilce_v or bolge, 'mahalle': None,
      'telefon': telefon, 'web': web_v, 'sosyal': [],
      'calisma_saatleri': (str(saat)[:200] if saat else None),
      'randevu': None, 'engelli_erisimi': None, 'lat': lat, 'lng': lng,
      'maps_url': f'https://www.google.com/maps/search/?api=1&query={lat},{lng}',
      'yandex_url': f'https://yandex.com/maps/?text={ad}&ll={lng}%2C{lat}&z=17',
      'osm_url': None, 'fsq_id': str(fsq_id),
      'kaynak': 'foursquare', 'ilk_gorulme': bugun, 'son_gorulme': bugun,
    })
    toplam += 1
print(f'aday yeni kunye: {toplam}')

# 3) OSM ile birlestir: ayni sektor + ~150m + benzer ad -> tek kayitta zenginlestir.
rapor = {}
for slug, sektorler in yeni.items():
  for sek, adaylar in sektorler.items():
    yol = f'data/{slug}/{sek}.json'
    eski = json.load(open(yol, encoding='utf-8')) if os.path.exists(yol) else []
    indeks = [(norm(e['ad']), e) for e in eski if e.get('ad') and e.get('lat') is not None]
    eklendi, zengin = 0, 0
    for a in adaylar:
      na = norm(a['ad'])
      eslesti = next((e for nad, e in indeks
        if nad and na and nad[:20] == na[:20]
        and abs(e['lat'] - a['lat']) < 0.0015 and abs(e['lng'] - a['lng']) < 0.002), None)
      if eslesti:
        eslesti['son_gorulme'] = bugun
        eslesti['fsq_id'] = a['fsq_id']
        for alan in ('telefon', 'web', 'adres', 'calisma_saatleri'):
          if not eslesti.get(alan) and a.get(alan): eslesti[alan] = a[alan]; zengin += 1
      else:
        eski.append(a); eklendi += 1
    eski.sort(key=lambda x: x.get('ad') or '')
    json.dump(eski, open(yol, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    rapor[f'{slug}/{sek}'] = (len(eski), eklendi, zengin)
print(json.dumps(rapor, ensure_ascii=False)[:4000])
