export interface Country {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
}

/**
 * Convert an ISO 3166-1 alpha-2 country code to its flag emoji.
 * Works because regional indicator symbols are offset from 'A' at 0x1F1E6.
 */
function codeToFlag(code: string): string {
  return [...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('');
}

export const COUNTRIES: Country[] = [
  { code: 'US', name: 'United States', dialCode: '1', flag: codeToFlag('US') },
  { code: 'CA', name: 'Canada', dialCode: '1', flag: codeToFlag('CA') },
  { code: 'GB', name: 'United Kingdom', dialCode: '44', flag: codeToFlag('GB') },
  { code: 'AU', name: 'Australia', dialCode: '61', flag: codeToFlag('AU') },
  { code: 'NZ', name: 'New Zealand', dialCode: '64', flag: codeToFlag('NZ') },
  { code: 'IE', name: 'Ireland', dialCode: '353', flag: codeToFlag('IE') },
  { code: 'MX', name: 'Mexico', dialCode: '52', flag: codeToFlag('MX') },
  { code: 'BR', name: 'Brazil', dialCode: '55', flag: codeToFlag('BR') },
  { code: 'AR', name: 'Argentina', dialCode: '54', flag: codeToFlag('AR') },
  { code: 'CO', name: 'Colombia', dialCode: '57', flag: codeToFlag('CO') },
  { code: 'CL', name: 'Chile', dialCode: '56', flag: codeToFlag('CL') },
  { code: 'PE', name: 'Peru', dialCode: '51', flag: codeToFlag('PE') },
  { code: 'IN', name: 'India', dialCode: '91', flag: codeToFlag('IN') },
  { code: 'PH', name: 'Philippines', dialCode: '63', flag: codeToFlag('PH') },
  { code: 'JP', name: 'Japan', dialCode: '81', flag: codeToFlag('JP') },
  { code: 'KR', name: 'South Korea', dialCode: '82', flag: codeToFlag('KR') },
  { code: 'CN', name: 'China', dialCode: '86', flag: codeToFlag('CN') },
  { code: 'TW', name: 'Taiwan', dialCode: '886', flag: codeToFlag('TW') },
  { code: 'TH', name: 'Thailand', dialCode: '66', flag: codeToFlag('TH') },
  { code: 'VN', name: 'Vietnam', dialCode: '84', flag: codeToFlag('VN') },
  { code: 'ID', name: 'Indonesia', dialCode: '62', flag: codeToFlag('ID') },
  { code: 'MY', name: 'Malaysia', dialCode: '60', flag: codeToFlag('MY') },
  { code: 'SG', name: 'Singapore', dialCode: '65', flag: codeToFlag('SG') },
  { code: 'DE', name: 'Germany', dialCode: '49', flag: codeToFlag('DE') },
  { code: 'FR', name: 'France', dialCode: '33', flag: codeToFlag('FR') },
  { code: 'IT', name: 'Italy', dialCode: '39', flag: codeToFlag('IT') },
  { code: 'ES', name: 'Spain', dialCode: '34', flag: codeToFlag('ES') },
  { code: 'PT', name: 'Portugal', dialCode: '351', flag: codeToFlag('PT') },
  { code: 'NL', name: 'Netherlands', dialCode: '31', flag: codeToFlag('NL') },
  { code: 'BE', name: 'Belgium', dialCode: '32', flag: codeToFlag('BE') },
  { code: 'CH', name: 'Switzerland', dialCode: '41', flag: codeToFlag('CH') },
  { code: 'AT', name: 'Austria', dialCode: '43', flag: codeToFlag('AT') },
  { code: 'SE', name: 'Sweden', dialCode: '46', flag: codeToFlag('SE') },
  { code: 'NO', name: 'Norway', dialCode: '47', flag: codeToFlag('NO') },
  { code: 'DK', name: 'Denmark', dialCode: '45', flag: codeToFlag('DK') },
  { code: 'FI', name: 'Finland', dialCode: '358', flag: codeToFlag('FI') },
  { code: 'PL', name: 'Poland', dialCode: '48', flag: codeToFlag('PL') },
  { code: 'CZ', name: 'Czech Republic', dialCode: '420', flag: codeToFlag('CZ') },
  { code: 'ZA', name: 'South Africa', dialCode: '27', flag: codeToFlag('ZA') },
  { code: 'NG', name: 'Nigeria', dialCode: '234', flag: codeToFlag('NG') },
  { code: 'KE', name: 'Kenya', dialCode: '254', flag: codeToFlag('KE') },
  { code: 'EG', name: 'Egypt', dialCode: '20', flag: codeToFlag('EG') },
  { code: 'AE', name: 'United Arab Emirates', dialCode: '971', flag: codeToFlag('AE') },
  { code: 'SA', name: 'Saudi Arabia', dialCode: '966', flag: codeToFlag('SA') },
  { code: 'IL', name: 'Israel', dialCode: '972', flag: codeToFlag('IL') },
  { code: 'TR', name: 'Turkey', dialCode: '90', flag: codeToFlag('TR') },
  { code: 'RU', name: 'Russia', dialCode: '7', flag: codeToFlag('RU') },
  { code: 'UA', name: 'Ukraine', dialCode: '380', flag: codeToFlag('UA') },
  { code: 'GH', name: 'Ghana', dialCode: '233', flag: codeToFlag('GH') },
  { code: 'PR', name: 'Puerto Rico', dialCode: '1', flag: codeToFlag('PR') },
];

export const DEFAULT_COUNTRY: Country = COUNTRIES[0]; // US

export function findCountryByCode(code: string): Country | undefined {
  return COUNTRIES.find(c => c.code === code);
}

export function findCountryByDialCode(dialCode: string): Country | undefined {
  return COUNTRIES.find(c => c.dialCode === dialCode);
}
