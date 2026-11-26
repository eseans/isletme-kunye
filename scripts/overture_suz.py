# Overture Maps -> kunye birlestirme. Overture (Amazon/Meta/Microsoft/TomTom acik
# verisi; CDLA-Permissive-2.0, FSQ kaynakli kayitlar Apache-2.0) Turkiye kayitlari:
#  - eldeki kayitla (ayni il, ~150 m, benzer ad) eslesirse ZENGINLESTIRIR: kapi
#    numarali adres, sabit telefon, web, sosyal, alt kategori, overture_id
#    (iki kaynakta goruldu = dogrulama sinyali). Kimlik (fsq/osm) DEGISMEZ: URL sabit.
#  - eslesmezse guveni >= 0.5 ve acik olan kayit YENI kunye olarak eklenir.
# Cep (05) numara asla girmez (KVKK); hastane/acil gibi randevusuz yerler alinmaz.
# Kullanim: python3 scripts/overture_suz.py   (OVERTURE_SURUM bos = en yeni surum)
import duckdb, json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
from fsq_suz_ortak import il_bul, telefon_temizle, norm, IL_NORM, _n

# taxonomy.primary -> (sektor, alt kategori). Alt = sitede ayri filtre/sayfa.
KATEGORI = {
  'hair_salon': ('kuafor', None), 'barber': ('kuafor', 'berber'),
  'beauty_salon': ('guzellik-salonu', None), 'nail_salon': ('guzellik-salonu', 'tirnak'),
  'eyelash_service': ('guzellik-salonu', 'kirpik'), 'hair_removal': ('guzellik-salonu', 'epilasyon'),
  'skin_care': ('guzellik-salonu', 'cilt-bakimi'), 'waxing': ('guzellik-salonu', 'epilasyon'),
  'massage': ('spa-masaj', 'masaj'), 'massage_therapy': ('spa-masaj', 'masaj'), 'spa': ('spa-masaj', 'spa'),
  'gym': ('spor-salonu', 'fitness'), 'pilates_studio': ('spor-salonu', 'pilates'),
  'yoga_studio': ('spor-salonu', 'yoga'), 'martial_arts_club': ('spor-salonu', 'dovus-sanatlari'),
  'boxing_gym': ('spor-salonu', 'boks'), 'boxing_club': ('spor-salonu', 'boks'),
  'dental_clinic': ('dis-klinigi', None), 'dentist': ('dis-klinigi', None), 'orthodontist': ('dis-klinigi', 'ortodonti'),
  'doctors_office': ('klinik', 'muayenehane'), 'plastic_and_reconstructive_surgery': ('klinik', 'estetik'),
  'dermatology': ('klinik', 'dermatoloji'),
  'veterinarian': ('veteriner', None), 'pet_groomer': ('veteriner', 'pet-kuafor'),
  'psychology': ('psikoloji', None), 'psychotherapist': ('psikoloji', None),
  'nutrition_service': ('diyetisyen', None), 'dietitian': ('diyetisyen', None),
  'physical_therapy': ('fizyoterapi', None), 'chiropractor': ('fizyoterapi', 'kiropraktik'),
  'eyewear_store': ('optik', None), 'optometry': ('optik', None),
  'tattoo_and_piercing': ('dovme', None), 'tattoo': ('dovme', None),
  'photographer': ('fotografci', None), 'event_photography_service': ('fotografci', 'etkinlik'),
  'driving_school': ('egitim-kurs', 'surucu-kursu'), 'language_school': ('egitim-kurs', 'dil-kursu'),
  'music_school': ('egitim-kurs', 'muzik'), 'art_school': ('egitim-kurs', 'sanat'),
  'dance_studio': ('egitim-kurs', 'dans'), 'tutoring_service': ('egitim-kurs', 'etut'),
  'acupuncture': ('tamamlayici-tip', None),
}

c = duckdb.connect()
c.sql("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
SURUM = os.environ.get('OVERTURE_SURUM') or c.sql(
  "SELECT max(regexp_extract(file, 'release/([^/]+)/', 1)) FROM glob('s3://overturemaps-us-west-2/release/*/theme=places/type=place/*.parquet')"
).fetchall()[0][0]
print('Overture surumu:', SURUM, flush=True)
P = f"s3://overturemaps-us-west-2/release/{SURUM}/theme=places/type=place/*"
liste = ', '.join(f"'{k}'" for k in KATEGORI)
rows = c.sql(f"""
SELECT id, names.primary, bbox.ymin, bbox.xmin, taxonomy.primary, confidence, operating_status,
  phones, websites, socials, addresses[1].freeform, addresses[1].locality, addresses[1].region
FROM read_parquet('{P}')
WHERE bbox.xmin BETWEEN 25.6 AND 44.9 AND bbox.ymin BETWEEN 35.8 AND 42.2
  AND (addresses[1].country = 'TR' OR addresses IS NULL OR len(addresses) = 0)
  AND taxonomy.primary IN ({liste}) AND names.primary IS NOT NULL""").fetchall()
print('Overture aday:', len(rows), flush=True)

def tel_bicim(liste_):
  # Ilk sabit hat, sitedeki bicimde: (0216) 347 22 44. Cep (5..) hic alinmaz.
  for t in liste_ or []:
    h = re.sub(r'\D', '', t)
    if h.startswith('90') and len(h) == 12: h = h[2:]
    h = h.lstrip('0')
    if telefon_temizle('0' + h): return f'(0{h[:3]}) {h[3:6]} {h[6:8]} {h[8:10]}' if len(h) == 10 else '0' + h
  return None

def sosyal(liste_):
  out = []
  for u in liste_ or []:
    m = re.match(r'https?://(?:www\.)?instagram\.com/([A-Za-z][A-Za-z0-9._]{1,29})/?$', u or '')
    if m: out.append({'tur': 'instagram', 'deger': 'https://instagram.com/' + m.group(1)})
  return out

# Mevcut kayitlar: il -> izgara (yaklasik 550 m hucre) icinde (norm ad, kayit, dosya).
veri, izgara, merkez = {}, {}, {}
for il in os.listdir('data'):
  d = f'data/{il}'
  if not os.path.isdir(d): continue
  la = lo = n = 0
  for f in os.listdir(d):
    if not f.endswith('.json') or f.startswith('_'): continue
    ks = json.load(open(f'{d}/{f}', encoding='utf-8')); veri[(il, f[:-5])] = ks
    for k in ks:
      if k.get('lat') is None: continue
      la += k['lat']; lo += k['lng']; n += 1
      izgara.setdefault((il, round(k['lat'] * 200), round(k['lng'] * 200)), []).append((norm(k.get('ad')), k))
  if n >= 20: merkez[il] = (la / n, lo / n)

def en_yakin_il(lat, lng):
  en, ek = None, 1e18
  for il, (a, b) in merkez.items():
    d = ((lat - a) * 111) ** 2 + ((lng - b) * 85) ** 2
    if d < ek: en, ek = il, d
  return en if ek < 60 ** 2 else None

def eslesen(il, ad, lat, lng):
  na = norm(ad)
  if not na: return None
  gy, gx = round(lat * 200), round(lng * 200)
  for dy in (-1, 0, 1):
    for dx in (-1, 0, 1):
      for nad, k in izgara.get((il, gy + dy, gx + dx), []):
        if nad and (nad[:12] == na[:12] or nad.startswith(na) or na.startswith(nad)) \
           and abs(k['lat'] - lat) < 0.0015 and abs(k['lng'] - lng) < 0.002:
          return k
  return None

bugun = os.environ.get('BUGUN') or '2026-11-27'
say = {'zengin': 0, 'yeni': 0, 'il_yok': 0, 'kapali': 0, 'dusuk': 0, 'adres': 0, 'tel': 0, 'web': 0}
for oid, ad, lat, lng, kat, guven, durum, tels, webs, sos, adres, yer, bolge in rows:
  if durum in ('permanently_closed', 'temporarily_closed'): say['kapali'] += 1; continue
  il = il_bul(bolge, yer, 999, 999) or en_yakin_il(lat, lng)
  if not il: say['il_yok'] += 1; continue
  sek, alt = KATEGORI[kat]
  # Overture 'spa' Turkiye'de otel/tesis da tasiyor: yalniz adi spa/hamam/masaj olan.
  if kat == 'spa' and not re.search(r'spa|hamam|masaj|massage|wellness|sauna|termal', ad.lower()): say['dusuk'] += 1; continue
  ilce = yer if yer and _n(yer) not in IL_NORM else None
  tam_adres = ', '.join(x for x in (adres, ilce) if x) or None
  tel, web, sosy = tel_bicim(tels), (webs or [None])[0], sosyal(sos)
  k = eslesen(il, ad, lat, lng)
  if k:
    say['zengin'] += 1
    k['overture_id'] = oid; k['son_gorulme'] = bugun
    # Alt etiket yalniz ayni sektorde: dis klinigine 'muayenehane' yapismasin.
    if alt and not k.get('alt') and k.get('sektor') == sek: k['alt'] = alt
    # Adres: mevcut kapi numarasizsa ("Etiler") Overture'un tam adresi gecer.
    if tam_adres and re.search(r'\d', tam_adres) and not re.search(r'\d', k.get('adres') or ''):
      k['adres'] = tam_adres; say['adres'] += 1
    if tel and not telefon_temizle(k.get('telefon')): k['telefon'] = tel; say['tel'] += 1
    if web and not k.get('web'): k['web'] = web; say['web'] += 1
    if sosy and not k.get('sosyal'): k['sosyal'] = sosy
    continue
  if (guven or 0) < 0.5: say['dusuk'] += 1; continue
  yeni = {
    'ad': ad, 'sektor': sek, 'kategori': sek, 'alt': alt, 'hizmet_ipuclari': [kat],
    'adres': tam_adres, 'il': None, 'ilce': ilce, 'mahalle': None,
    'telefon': tel, 'web': web, 'sosyal': sosy, 'calisma_saatleri': None,
    'randevu': None, 'engelli_erisimi': None, 'lat': lat, 'lng': lng,
    'maps_url': f'https://www.google.com/maps/search/?api=1&query={lat},{lng}',
    'yandex_url': f'https://yandex.com/maps/?text={ad}&ll={lng}%2C{lat}&z=17',
    'osm_url': None, 'fsq_id': None, 'overture_id': oid,
    'kaynak': 'overture', 'ilk_gorulme': bugun, 'son_gorulme': bugun,
  }
  veri.setdefault((il, sek), []).append(yeni)
  izgara.setdefault((il, round(lat * 200), round(lng * 200)), []).append((norm(ad), yeni))
  say['yeni'] += 1

for (il, sek), ks in veri.items():
  ks.sort(key=lambda x: x.get('ad') or '')
  os.makedirs(f'data/{il}', exist_ok=True)
  json.dump(ks, open(f'data/{il}/{sek}.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps(say, ensure_ascii=False))
# Gozle kontrol icin ornekler (log).
ornek = [k for ks in veri.values() for k in ks if k.get('overture_id')]
for k in ornek[:4] + [k for k in ornek if k.get('kaynak') == 'overture'][:4]:
  print('ORNEK', json.dumps({x: k.get(x) for x in ('ad', 'sektor', 'alt', 'adres', 'ilce', 'telefon', 'web', 'kaynak', 'fsq_id')}, ensure_ascii=False))
