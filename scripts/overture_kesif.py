# Overture Maps (Amazon/Meta/Microsoft/TomTom acik harita verisi, CDLA-Permissive-2.0;
# Foursquare kaynakli kayitlar Apache-2.0) Turkiye kesfi.
# NEDEN: Foursquare OS Places Turkiye'de cogunlukla eski/kapanmis kayit (Kadikoy
# Moda kutusunda FSQ 556 kuafor, Overture 34 aktif salon). Once olcuyoruz: hangi
# kategoride kac isletme, sabit telefon / sokak adresi / son 12 ayda guncellenme
# oranlari. Cikti: rapor/overture_kesif.md + tr.parquet (sonraki adimlarin girdisi).
# Anahtarsiz, ucretsiz: herkese acik S3 (us-west-2).
import duckdb, os, time

SURUM = os.environ.get('OVERTURE_SURUM', '2026-11-18.0')
P = f"s3://overturemaps-us-west-2/release/{SURUM}/theme=places/type=place/*"
t0 = time.time()
c = duckdb.connect()
c.sql("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
kolonlar = [r[0] for r in c.sql(f"DESCRIBE SELECT * FROM read_parquet('{P}')").fetchall()]
print('kolonlar:', kolonlar, flush=True)
# Sema surume gore degisir: yeni 'taxonomy', eski 'categories'.
kat = 'taxonomy.primary' if 'taxonomy' in kolonlar else 'categories.primary'

# Turkiye kutusu (bbox alanlari parquet satir grubu istatistikleriyle budanir),
# sonra adres ulkesi TR (kutu Yunan adalari, Bulgaristan, Gurcistan, Suriye'ye tasar).
c.sql(f"""
COPY (
  SELECT * FROM read_parquet('{P}')
  WHERE bbox.xmin BETWEEN 25.6 AND 44.9 AND bbox.ymin BETWEEN 35.8 AND 42.2
    AND (addresses[1].country = 'TR' OR addresses IS NULL OR len(addresses) = 0)
) TO 'tr.parquet' (FORMAT parquet)""")
print('tr.parquet hazir', round(time.time() - t0), 'sn', flush=True)

c.sql("CREATE VIEW tr AS SELECT * FROM 'tr.parquet'")
toplam = c.sql("SELECT count(*) FROM tr").fetchone()[0]
# Sabit hat: +90 sonrasi 5 ile baslamayan (05'li cep KVKK geregi kullanilmaz).
ozet = c.sql(f"""
SELECT {kat} AS kategori, count(*) AS n,
  round(100*avg(CASE WHEN list_filter(phones, p -> p LIKE '+90%' AND NOT p LIKE '+905%') <> [] THEN 1 ELSE 0 END)) AS sabit_tel,
  round(100*avg(CASE WHEN regexp_matches(coalesce(addresses[1].freeform,''), '[0-9]') THEN 1 ELSE 0 END)) AS sokak_no,
  round(100*avg(CASE WHEN len(coalesce(websites,[])) > 0 THEN 1 ELSE 0 END)) AS web,
  round(100*avg(CASE WHEN list_filter(sources, s -> s.dataset = 'meta') <> [] THEN 1 ELSE 0 END)) AS meta,
  round(100*avg(CASE WHEN list_max(list_transform(sources, s -> try_cast(left(s.update_time, 10) AS DATE))) >= current_date - 365 THEN 1 ELSE 0 END)) AS guncel_12ay
FROM tr GROUP BY 1 ORDER BY n DESC LIMIT 400""").fetchall()

os.makedirs('rapor', exist_ok=True)
with open('rapor/overture_kesif.md', 'w', encoding='utf-8') as f:
    f.write(f"# Overture Turkiye kesfi ({SURUM})\n\nToplam kayit: {toplam}\n\n")
    f.write("| kategori | n | sabit tel % | sokak no % | web % | meta % | son 12 ay % |\n|---|---|---|---|---|---|---|\n")
    for r in ozet:
        f.write('| ' + ' | '.join(str(x) for x in r) + ' |\n')
print('rapor yazildi; toplam', toplam, 'sure', round(time.time() - t0), 'sn')
