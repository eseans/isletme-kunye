# Yurt disi aday ulkeler icin Overture kesfi: bizim kategorilerimizde (overture_suz
# KATEGORI) kac isletme, telefon / kapi numarali adres / web orani. Ilk yurt disi
# pazarini veriyle secmek icin. Cikti: rapor/overture_ulkeler.md
# Kullanim: ULKELER="ES,MX,AR,CO,DE" python3 scripts/overture_ulke_kesif.py
import duckdb, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from fsq_suz_ortak import KATEGORI_OVERTURE as KATEGORI  # noqa: E402

ULKELER = [u.strip() for u in (os.environ.get('ULKELER') or 'ES,MX,AR,CO,DE').split(',') if u.strip()]
c = duckdb.connect()
c.sql("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
SURUM = os.environ.get('OVERTURE_SURUM') or c.sql(
  "SELECT max(regexp_extract(file, 'release/([^/]+)/', 1)) FROM glob('s3://overturemaps-us-west-2/release/*/theme=places/type=place/*.parquet')"
).fetchall()[0][0]
P = f"s3://overturemaps-us-west-2/release/{SURUM}/theme=places/type=place/*"
liste = ', '.join(f"'{k}'" for k in KATEGORI)
ulk = ', '.join(f"'{u}'" for u in ULKELER)
rows = c.sql(f"""
SELECT addresses[1].country AS ulke, taxonomy.primary AS kat, count(*) AS n,
  round(100*avg(CASE WHEN len(coalesce(phones,[])) > 0 THEN 1 ELSE 0 END)) AS tel,
  round(100*avg(CASE WHEN regexp_matches(coalesce(addresses[1].freeform,''), '[0-9]') THEN 1 ELSE 0 END)) AS adres,
  round(100*avg(CASE WHEN len(coalesce(websites,[])) > 0 THEN 1 ELSE 0 END)) AS web
FROM read_parquet('{P}')
WHERE addresses[1].country IN ({ulk}) AND taxonomy.primary IN ({liste}) AND coalesce(confidence, 0) >= 0.5
GROUP BY 1, 2 ORDER BY 1, n DESC""").fetchall()
os.makedirs('rapor', exist_ok=True)
toplam = {}
for u, _, n, *_ in rows: toplam[u] = toplam.get(u, 0) + n
with open('rapor/overture_ulkeler.md', 'w', encoding='utf-8') as f:
  f.write(f"# Overture yurt disi kesfi ({SURUM}) — bizim kategoriler, guven >= 0.5\n\n")
  f.write('| ulke | toplam |\n|---|---|\n' + ''.join(f'| {u} | {n} |\n' for u, n in sorted(toplam.items(), key=lambda x: -x[1])) + '\n')
  f.write('| ulke | kategori | n | tel % | kapi no % | web % |\n|---|---|---|---|---|---|\n')
  for r in rows: f.write('| ' + ' | '.join(str(x) for x in r) + ' |\n')
print('TOPLAM', toplam)
