# fsq_suz.py ve overture_suz.py ortak yardimcilari (il bulma, telefon, ad normali).
import json, re, unicodedata

SEHIR_BBOX = {
  'istanbul':(40.75,41.75,27.85,29.65),'ankara':(39.70,40.20,32.40,33.20),
  'izmir':(38.20,38.60,26.90,27.35),'bursa':(40.15,40.45,28.80,29.40),
  'antalya':(36.80,37.10,30.50,30.90),'eskisehir':(39.65,39.85,30.40,30.65),
}
# 81 il: kaydin kendi admin_region alanindan (bbox yalniz yedek). Bolge adi
# "Istanbul", "İstanbul", "Istanbul Province", "Antalya İli" gibi gelebilir.
ILLER = json.load(open('iller.json', encoding='utf-8'))
def _n(x):
  k = unicodedata.normalize('NFKD', str(x or '').replace('ı', 'i').replace('İ', 'i'))
  return re.sub(r'[^a-z]', '', ''.join(c for c in k if not unicodedata.combining(c)).lower())
IL_NORM = {_n(ad): slug for slug, ad, _ in ILLER}
IL_NORM.update({'icel': 'mersin', 'kahramanmaras': 'kahramanmaras', 'afyon': 'afyonkarahisar', 'maras': 'kahramanmaras', 'urfa': 'sanliurfa', 'antep': 'gaziantep', 'izmit': 'kocaeli', 'adapazari': 'sakarya'})
def il_bul(bolge, ilce, lat, lng):
  for aday in (bolge, ilce):
    n = _n(aday)
    for ek in ('province', 'ili', 'il', 'provinces'):
      if n.endswith(ek) and n[:-len(ek)] in IL_NORM: n = n[:-len(ek)]
    if n in IL_NORM: return IL_NORM[n]
  return next((s for s, (a1, a2, b1, b2) in SEHIR_BBOX.items() if a1 <= lat <= a2 and b1 <= lng <= b2), None)
def telefon_temizle(t):
  # topla.mjs telefonTemizle ile ayni: parca parca, 5'li asla, yalniz bicimi tutan sabit hat.
  if not t: return None
  kalan = []
  for p in re.split(r'[;,/|]|\s-\s|veya', str(t), flags=re.I):
    p = p.strip(); h = re.sub(r'\D', '', p)
    if h.startswith('90') and len(h) == 12: h = h[2:]
    h = h.lstrip('0')
    if not p or h.startswith('5'): continue
    if re.fullmatch(r'[2-4]\d{9}', h) or re.fullmatch(r'8[05]0\d{7}', h) or re.fullmatch(r'444\d{4}', h): kalan.append(p)
  return '; '.join(kalan) or None

def norm(ad):
  k = unicodedata.normalize('NFKD', ad or '')
  k = ''.join(c for c in k if not unicodedata.combining(c)).lower()
  return re.sub(r'[^a-z0-9]', '', k)[:40]

# taxonomy.primary -> (sektor, alt kategori). Alt = sitede ayri filtre/sayfa.
KATEGORI_OVERTURE = {
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
