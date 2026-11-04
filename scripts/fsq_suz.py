# FSQ OS Places -> kunye. DuckDB ile TR + sektor suzme, OSM ile birlestirme.
# Kullanim: python3 scripts/fsq_suz.py  (fsq/*.parquet ve data/ hazir olmali)
import duckdb, json, glob, re, os, unicodedata

KATEGORI = {
  'Hair Salon':'kuafor','Barbershop':'kuafor','Men\u2019s Hair Salon':'kuafor',
  'Beauty Salon':'guzellik-salonu','Nail Salon':'guzellik-salonu','Waxing':'guzellik-salonu','Threading Place':'guzellik-salonu',
  'Eyebrow & Lashes':'guzellik-salonu',
  'Dentist\u2019s Office':'dis-klinigi','Dental Clinic':'dis-klinigi','Orthodontist':'dis-klinigi','Dentist':'dis-klinigi',
  'Doctor\u2019s Office':'klinik','Medical Center':'klinik','Clinic':'klinik','Dental Lab':'klinik',
  'Gym':'spor-salonu','Gym / Fitness Center':'spor-salonu','Pilates Studio':'spor-salonu','Yoga Studio':'spor-salonu',
  'Boxing Gym':'spor-salonu','Martial Arts School':'spor-salonu','CrossFit Box':'spor-salonu','Sports Complex':'spor-salonu',
  'Spa':'spa-masaj','Day Spa':'spa-masaj','Massage':'spa-masaj','Massage Studio':'spa-masaj',
  'Tattoo Parlor':'dovme','Tattoo':'dovme','Piercing':'dovme',
  'Veterinarian':'veteriner','Animal Hospital':'veteriner',
  'Psychologist':'psikoloji','Psychotherapist':'psikoloji','Therapist':'psikoloji',
  'Nutritionist':'diyetisyen','Dietitian':'diyetisyen',
  'Physical Therapist':'fizyoterapi','Chiropractor':'fizyoterapi','Acupuncture':'tamamlayici-tip',
  'Language School':'egitim-kurs','Music School':'egitim-kurs','Dance Studio':'egitim-kurs','Driving School':'egitim-kurs',
  'Tutoring Center':'egitim-kurs','Art School':'egitim-kurs','Cooking School':'egitim-kurs','Preschool':'egitim-kurs',
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
kolonlar = {r[0] for r in con.execute("DESCRIBE SELECT * FROM read_parquet('fsq/*.parquet') LIMIT 1").fetchall()}
ulke = 'country_code' if 'country_code' in kolonlar else ('country_fips' if 'country_fips' in kolonlar else None)
tel = 'telephone' if 'telephone' in kolonlar else 'tel'
hrs = 'hours' if 'hours' in kolonlar else None
web = 'website' if 'website' in kolonlar else None
reg = 'admin_region' if 'admin_region' in kolonlar else 'region'
assert ulke, f'ulke kolonu yok: {kolonlar}'

rows = con.execute(f"""
 SELECT fsq_id, name, latitude, longitude, address, locality, {reg} AS bolge,
        {'telephone' if tel else 'NULL'} AS telefon, {'website' if web else 'NULL'} AS web,
        {hrs or 'NULL'} AS saat, fsq_category_labels
 FROM read_parquet('fsq/*.parquet')
 WHERE {ulke} = 'TR' AND name IS NOT NULL AND closed_date IS NULL
""").fetchall()
print(f'TR kayit: {len(rows)}')

yeni = {}   # slug -> sektor -> [record]
toplam = 0
for fsq_id, ad, lat, lng, adres, ilce1, bolge, telefon, web_, saat, katlar in rows:
  if not ad or lat is None: continue
  etik = json.loads(katlar) if isinstance(katlar, str) else (katlar or [])
  sek = None
  for k in KATEGORI:
    if any(k.lower() == str(e).lower() or k.lower() in str(e).lower() for e in etik):
      sek = KATEGORI[k]; break
  if not sek: continue
  slug = None
  for s,(la1,la2,lo1,lo2) in SEHIR_BBOX.items():
    if la1 <= lat <= la2 and lo1 <= lng <= lo2: slug = s; break
  if not slug: continue
  k = {
    'ad': ad, 'sektor': sek, 'kategori': sek, 'hizmet_ipuclari': [str(e) for e in etik][:8],
    'adres': adres, 'il': None, 'ilce': ilce1 or bolge, 'mahalle': None,
    'telefon': telefon, 'web': web_, 'sosyal': [], 'calisma_saatleri': (json.dumps(saat)[:200] if saat else None),
    'randevu': None, 'engelli_erisimi': None, 'lat': lat, 'lng': lng,
    'maps_url': f'https://www.google.com/maps/search/?api=1&query={lat},{lng}',
    'yandex_url': f'https://yandex.com/maps/?text={ad}&ll={lng}%2C{lat}&z=17',
    'osm_url': None, 'fsq_id': str(fsq_id),
    'kaynak': 'foursquare', 'ilk_gorulme': '2026-11-05', 'son_gorulme': '2026-11-05',
  }
  yeni.setdefault(slug, {}).setdefault(sek, []).append(k)
  toplam += 1
print(f'Sehre/sektore eslesen yeni aday: {toplam}')

# OSM kayitlariyla birlestir: ayni sektor + ~150m + benzer ad -> tek kayit.
bugun = '2026-11-05'
rapor = {}
for slug, sektorler in yeni.items():
  for sek, adaylar in sektorler.items():
    yol = f'data/{slug}/{sek}.json'
    eski = json.load(open(yol, encoding='utf-8')) if os.path.exists(yol) else []
    indeks = [(norm(e['ad']), e) for e in eski]
    eklenen, baglanti = 0, 0
    for a in adaylar:
      eslesti = None
      for nad, e in indeks:
        if nad and (nad == norm(a['ad']) or nad[:20] == norm(a['ad'])[:20]) \
           and abs(e['lat'] - a['lat']) < 0.0015 and abs(e['lng'] - a['lng']) < 0.002:
          eslesti = e; break
      if eslesti:
        eslesti['son_gorulme'] = bugun
        if not eslesti.get('telefon') and a['telefon']: eslesti['telefon'] = a['telefon']; baglanti += 1
        if not eslesti.get('web') and a['web']: eslesti['web'] = a['web']
        if not eslesti.get('fsq_id'): eslesti['fsq_id'] = a['fsq_id']
      else:
        eski.append(a); eklenen += 1
    eski.sort(key=lambda x: x['ad'])
    json.dump(eski, open(yol, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    rapor[f'{slug}/{sek}'] = (len(eski), eklenen, baglanti)
print(json.dumps(rapor, ensure_ascii=False)[:3000])
