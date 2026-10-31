/**
 * International mobile numbers: the country picker's list and the one check
 * both the form and the API apply. Stored as E.164 (`+306912345678`).
 */

/** ISO country → calling code. Names come from `Intl.DisplayNames` in Greek. */
const DIAL_CODES =
  'GR:30,CY:357,AD:376,AE:971,AF:93,AG:1268,AI:1264,AL:355,AM:374,AO:244,AR:54,AS:1684,AT:43,AU:61,' +
  'AW:297,AZ:994,BA:387,BB:1246,BD:880,BE:32,BF:226,BG:359,BH:973,BI:257,BJ:229,BM:1441,BN:673,BO:591,' +
  'BR:55,BS:1242,BT:975,BW:267,BY:375,BZ:501,CA:1,CD:243,CF:236,CG:242,CH:41,CI:225,CK:682,CL:56,CM:237,' +
  'CN:86,CO:57,CR:506,CU:53,CV:238,CW:599,CZ:420,DE:49,DJ:253,DK:45,DM:1767,DO:1809,DZ:213,EC:593,EE:372,' +
  'EG:20,ER:291,ES:34,ET:251,FI:358,FJ:679,FO:298,FR:33,GA:241,GB:44,GD:1473,GE:995,GH:233,GI:350,GL:299,' +
  'GM:220,GN:224,GQ:240,GT:502,GU:1671,GW:245,GY:592,HK:852,HN:504,HR:385,HT:509,HU:36,ID:62,IE:353,' +
  'IL:972,IN:91,IQ:964,IR:98,IS:354,IT:39,JM:1876,JO:962,JP:81,KE:254,KG:996,KH:855,KI:686,KM:269,' +
  'KN:1869,KP:850,KR:82,KW:965,KY:1345,KZ:7,LA:856,LB:961,LC:1758,LI:423,LK:94,LR:231,LS:266,LT:370,' +
  'LU:352,LV:371,LY:218,MA:212,MC:377,MD:373,ME:382,MG:261,MK:389,ML:223,MM:95,MN:976,MO:853,MR:222,' +
  'MT:356,MU:230,MV:960,MW:265,MX:52,MY:60,MZ:258,NA:264,NE:227,NG:234,NI:505,NL:31,NO:47,NP:977,NZ:64,' +
  'OM:968,PA:507,PE:51,PG:675,PH:63,PK:92,PL:48,PR:1787,PS:970,PT:351,PY:595,QA:974,RO:40,RS:381,RU:7,' +
  'RW:250,SA:966,SC:248,SD:249,SE:46,SG:65,SI:386,SK:421,SL:232,SM:378,SN:221,SO:252,SR:597,SS:211,' +
  'SV:503,SY:963,SZ:268,TC:1649,TD:235,TG:228,TH:66,TJ:992,TL:670,TM:993,TN:216,TO:676,TR:90,TT:1868,' +
  'TW:886,TZ:255,UA:380,UG:256,US:1,UY:598,UZ:998,VA:379,VC:1784,VE:58,VG:1284,VI:1340,VN:84,WS:685,' +
  'XK:383,YE:967,ZA:27,ZM:260,ZW:263'

export interface Country {
  iso: string
  dial: string
  name: string
  flag: string
}

export const DEFAULT_COUNTRY = 'GR'

const flagOf = (iso: string) =>
  String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))

let countries: Country[] | null = null

/** Greece and Cyprus first, then every other country alphabetically in Greek. */
export function countryList(): Country[] {
  if (countries) return countries
  let names: Intl.DisplayNames | null = null
  try {
    names = new Intl.DisplayNames(['el'], { type: 'region' })
  } catch {
    // Very old browsers: the ISO code stands in for the name.
  }
  const all = DIAL_CODES.split(',').map((pair) => {
    const [iso, dial] = pair.split(':')
    return { iso, dial, name: names?.of(iso) || iso, flag: flagOf(iso) }
  })
  const [gr, cy, ...rest] = all
  countries = [gr, cy, ...rest.sort((a, b) => a.name.localeCompare(b.name, 'el'))]
  return countries
}

export function dialCodeOf(iso: string): string {
  return countryList().find((c) => c.iso === iso)?.dial || '30'
}

/**
 * The number as typed (spaces, a leading 0, the country code typed again)
 * joined to the picked country, or null when it can't be a mobile there.
 */
export function toE164(iso: string, typed: string): string | null {
  const dial = dialCodeOf(iso)
  let digits = typed.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith(dial) && digits.length > dial.length + 7) digits = digits.slice(dial.length)
  digits = digits.replace(/^0+/, '')
  const e164 = `+${dial}${digits}`
  return isValidPhoneNumber(e164) ? e164 : null
}

/** E.164, and for Greece a real mobile (69 + 8 digits). */
export function isValidPhoneNumber(value: string): boolean {
  if (!/^\+[1-9]\d{7,14}$/.test(value)) return false
  if (value.startsWith('+30')) return /^\+3069\d{8}$/.test(value)
  return true
}
