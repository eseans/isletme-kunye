# Ispanya kunyesi: Overture Maps (CDLA-Permissive-2.0; FSQ kaynakli kayitlar
# Apache-2.0) -> site/es/<provincia>/<sektor>.json (Turkiye ile ayni satir bicimi
# [0..14]; ana site lib/isletmeler.js okur). Provincia posta kodunun ilk iki
# hanesinden (INE il kodu: 28 Madrid, 08 Barcelona) — tahminsiz.
# GDPR: yalniz sabit hat (+34 8xx/9xx); 6xx/7xx cep (kisisel olabilir) yazilmaz.
# Kullanim: python3 scripts/overture_es.py   (OVERTURE_SURUM bos = en yeni)
import duckdb, json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
from fsq_suz_ortak import KATEGORI_OVERTURE as KATEGORI  # noqa: E402

PROVINCIAS = {  # INE kodu -> (slug, ad)
  '01': ('araba', 'Araba/Álava'), '02': ('albacete', 'Albacete'), '03': ('alicante', 'Alicante'),
  '04': ('almeria', 'Almería'), '05': ('avila', 'Ávila'), '06': ('badajoz', 'Badajoz'),
  '07': ('illes-balears', 'Illes Balears'), '08': ('barcelona', 'Barcelona'), '09': ('burgos', 'Burgos'),
  '10': ('caceres', 'Cáceres'), '11': ('cadiz', 'Cádiz'), '12': ('castellon', 'Castellón'),
  '13': ('ciudad-real', 'Ciudad Real'), '14': ('cordoba', 'Córdoba'), '15': ('a-coruna', 'A Coruña'),
  '16': ('cuenca', 'Cuenca'), '17': ('girona', 'Girona'), '18': ('granada', 'Granada'),
  '19': ('guadalajara', 'Guadalajara'), '20': ('gipuzkoa', 'Gipuzkoa'), '21': ('huelva', 'Huelva'),
  '22': ('huesca', 'Huesca'), '23': ('jaen', 'Jaén'), '24': ('leon', 'León'), '25': ('lleida', 'Lleida'),
  '26': ('la-rioja', 'La Rioja'), '27': ('lugo', 'Lugo'), '28': ('madrid', 'Madrid'), '29': ('malaga', 'Málaga'),
  '30': ('murcia', 'Murcia'), '31': ('navarra', 'Navarra'), '32': ('ourense', 'Ourense'),
  '33': ('asturias', 'Asturias'), '34': ('palencia', 'Palencia'), '35': ('las-palmas', 'Las Palmas'),
  '36': ('pontevedra', 'Pontevedra'), '37': ('salamanca', 'Salamanca'),
  '38': ('santa-cruz-de-tenerife', 'Santa Cruz de Tenerife'), '39': ('cantabria', 'Cantabria'),
  '40': ('segovia', 'Segovia'), '41': ('sevilla', 'Sevilla'), '42': ('soria', 'Soria'),
  '43': ('tarragona', 'Tarragona'), '44': ('teruel', 'Teruel'), '45': ('toledo', 'Toledo'),
  '46': ('valencia', 'Valencia'), '47': ('valladolid', 'Valladolid'), '48': ('bizkaia', 'Bizkaia'),
  '49': ('zamora', 'Zamora'), '50': ('zaragoza', 'Zaragoza'), '51': ('ceuta', 'Ceuta'), '52': ('melilla', 'Melilla'),
}

def sabit(liste):
  for t in liste or []:
    h = re.sub(r'\D', '', t or '')
    if h.startswith('34') and len(h) == 11: h = h[2:]
    if len(h) == 9 and h[0] in '89': return f'{h[:3]} {h[3:5]} {h[5:7]} {h[7:]}'
  return ''

def insta(liste):
  for u in liste or []:
    m = re.match(r'https?://(?:www\.)?instagram\.com/([A-Za-z][A-Za-z0-9._]{1,29})/?$', u or '')
    if m: return m.group(1)
  return ''

c = duckdb.connect()
c.sql("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
SURUM = os.environ.get('OVERTURE_SURUM') or c.sql(
  "SELECT max(regexp_extract(file, 'release/([^/]+)/', 1)) FROM glob('s3://overturemaps-us-west-2/release/*/theme=places/type=place/*.parquet')"
).fetchall()[0][0]
print('Overture surumu:', SURUM, flush=True)
P = f"s3://overturemaps-us-west-2/release/{SURUM}/theme=places/type=place/*"
liste = ', '.join(f"'{k}'" for k in KATEGORI)
rows = c.sql(f"""
SELECT id, names.primary, bbox.ymin, bbox.xmin, taxonomy.primary, phones, websites, socials,
  addresses[1].freeform, addresses[1].locality, addresses[1].postcode
FROM read_parquet('{P}')
WHERE addresses[1].country = 'ES' AND taxonomy.primary IN ({liste}) AND names.primary IS NOT NULL
  AND coalesce(confidence, 0) >= 0.5 AND coalesce(operating_status, 'open') NOT IN ('permanently_closed', 'temporarily_closed')
""").fetchall()
print('ES aday:', len(rows), flush=True)

kume, say = {}, {'yazildi': 0, 'posta_yok': 0, 'spa_atlandi': 0}
for oid, ad, lat, lng, kat, tels, webs, sos, adres, yer, posta in rows:
  if kat == 'spa' and not re.search(r'spa|masaj|massage|wellness|sauna|termal|balneario|hammam', ad.lower()):
    say['spa_atlandi'] += 1; continue
  p = PROVINCIAS.get(str(posta or '')[:2]) if re.match(r'^\d{5}$', str(posta or '')) else None
  if not p: say['posta_yok'] += 1; continue
  sek, alt = KATEGORI[kat]
  tam = ', '.join(x for x in (adres, f"{posta} {yer}".strip() if yer else posta) if x)
  kume.setdefault((p[0], sek), []).append([
    ad, yer or '', sabit(tels), (webs or [''])[0] or '', round(lat, 4), round(lng, 4), 'overture',
    oid.replace('-', ''), insta(sos), tam, '', '', '', alt or '', 1,
  ])
  say['yazildi'] += 1

# Liste sirasi: Turkiye ile ayni fikir (dolu once), alfabe esitlikte.
puan = lambda k: (2 if (k[2] or k[3]) else 0) + (1 if re.search(r'\d', k[9]) else 0) + (1 if k[8] else 0)
ozet = []
os.makedirs('site/es', exist_ok=True)
for (prov, sek), ks in kume.items():
  ks.sort(key=lambda k: (-puan(k), k[0].lower()))
  os.makedirs(f'site/es/{prov}', exist_ok=True)
  json.dump({'pais': 'es', 'sehir': prov, 'sektor': sek, 'n': len(ks), 'kayitlar': ks},
            open(f'site/es/{prov}/{sek}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
  ilce = {}
  for k in ks:
    if k[1]: ilce[k[1]] = ilce.get(k[1], 0) + 1
  ozet.append({'sehir': prov, 'sektor': sek, 'n': len(ks), 'ilceler': {a: n for a, n in ilce.items() if n >= 3}})
json.dump(ozet, open('site/es/_ozet.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
json.dump({s: a for s, a in PROVINCIAS.values()}, open('site/es/_provincias.json', 'w', encoding='utf-8'), ensure_ascii=False)
print(json.dumps(say), 'dosya:', len(kume))
