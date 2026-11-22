// iller.json uretir: [slug, ad, plaka] — 81 il. Python (fsq_suz.py) ve Node
// (site_disari.mjs) ayni listeyi okur; ana sitede lib/isletmeler.js kopyasi var.
// Kullanim: node scripts/iller_uret.mjs
import { writeFileSync } from 'node:fs'
import { slugla } from '../topla.mjs'

const ILLER = 'Adana,Adıyaman,Afyonkarahisar,Ağrı,Amasya,Ankara,Antalya,Artvin,Aydın,Balıkesir,Bilecik,Bingöl,Bitlis,Bolu,Burdur,Bursa,Çanakkale,Çankırı,Çorum,Denizli,Diyarbakır,Edirne,Elazığ,Erzincan,Erzurum,Eskişehir,Gaziantep,Giresun,Gümüşhane,Hakkari,Hatay,Isparta,Mersin,İstanbul,İzmir,Kars,Kastamonu,Kayseri,Kırklareli,Kırşehir,Kocaeli,Konya,Kütahya,Malatya,Manisa,Kahramanmaraş,Mardin,Muğla,Muş,Nevşehir,Niğde,Ordu,Rize,Sakarya,Samsun,Siirt,Sinop,Sivas,Tekirdağ,Tokat,Trabzon,Tunceli,Şanlıurfa,Uşak,Van,Yozgat,Zonguldak,Aksaray,Bayburt,Karaman,Kırıkkale,Batman,Şırnak,Bartın,Ardahan,Iğdır,Yalova,Karabük,Kilis,Osmaniye,Düzce'.split(',')

const iller = ILLER.map((ad, i) => [slugla(ad), ad, i + 1])
if (new Set(iller.map((x) => x[0])).size !== 81) throw new Error('il slug cakismasi')
writeFileSync('iller.json', JSON.stringify(iller) + '\n')
console.log('iller.json —', iller.length, 'il')
