export const INSTITUTION_SOURCE_TYPES = ['MEB', 'MANUAL'] as const;
export const INSTITUTION_PACKAGE_CODES = ['STANDARD', 'PREMIUM', 'CUSTOM'] as const;
export const INSTITUTION_OWNERSHIPS = ['PUBLIC', 'PRIVATE'] as const;
export const INSTITUTION_FEATURE_KEYS = [
  'EXAM_CENTER',
  'GUIDANCE_TESTS',
  'QUESTION_BANK',
  'GAMES',
  'MOBILE_API',
  'STUDIO',
  'RECOVERY',
  'LEARNING_GRAPH',
] as const;

export type InstitutionSourceType = typeof INSTITUTION_SOURCE_TYPES[number];
export type InstitutionPackageCode = typeof INSTITUTION_PACKAGE_CODES[number];

export type InstitutionCreateBody = {
  sourceType?: string;
  mebCode?: string;
  code?: string;
  name?: string;
  city?: string;
  district?: string;
  institutionType?: string;
  ownership?: string;
  educationLevel?: string;
  officialUrl?: string;
  address?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  academicYear?: string;
  studentLimit?: number | string;
  userLimit?: number | string;
  packageCode?: string;
  features?: string[];
  startTrial?: boolean;
  manager?: {
    displayName?: string;
    email?: string;
    username?: string;
    phone?: string;
    password?: string;
  };
};

export type NormalizedInstitutionCreate = {
  sourceType: InstitutionSourceType;
  mebCode: string | null;
  code: string | null;
  name: string;
  city: string;
  district: string;
  institutionType: string;
  ownership: 'PUBLIC' | 'PRIVATE';
  educationLevel: string | null;
  officialUrl: string | null;
  address: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  academicYear: string;
  studentLimit: number;
  userLimit: number;
  packageCode: InstitutionPackageCode;
  features: string[];
  startTrial: boolean;
  manager: {
    displayName: string;
    email: string | null;
    username: string | null;
    phone: string | null;
    password: string;
  };
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function boundedInteger(value: unknown, fallback: number, field: string, max: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) throw new Error(`${field} geçerli bir sayı olmalıdır.`);
  return parsed;
}

export function normalizeInstitutionCreateBody(body: InstitutionCreateBody): NormalizedInstitutionCreate {
  const sourceType = text(body.sourceType || 'MANUAL').toUpperCase() as InstitutionSourceType;
  if (!INSTITUTION_SOURCE_TYPES.includes(sourceType)) throw new Error('Kurum kaynağı MEB veya MANUAL olmalıdır.');

  const name = text(body.name);
  const city = text(body.city);
  const district = text(body.district);
  if (!name || !city || !district) throw new Error('Kurum adı, il ve ilçe zorunludur.');
  if (name.length > 200 || city.length > 100 || district.length > 100) throw new Error('Kurum adı, il veya ilçe uzunluğu geçersiz.');

  const mebCode = text(body.mebCode);
  if (mebCode && !/^\d{5,12}$/.test(mebCode)) throw new Error('MEB kurum kodu 5–12 haneli olmalıdır.');
  if (sourceType === 'MEB' && !mebCode) throw new Error('MEB kaynağında MEB kurum kodu zorunludur.');

  const requestedCode = text(body.code).toUpperCase();
  if (requestedCode && !/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(requestedCode)) throw new Error('Kurum kodu 3–32 karakter olmalı; yalnız harf, rakam, alt çizgi veya tire içermelidir.');
  if (sourceType === 'MEB' && requestedCode && requestedCode !== mebCode) throw new Error('MEB kurum kodu ile kurum kodu aynı olmalıdır.');

  const academicYear = text(body.academicYear || '2026-2027');
  if (!/^\d{4}-\d{4}$/.test(academicYear)) throw new Error('Akademik yıl 2026-2027 biçiminde olmalıdır.');

  const packageCode = text(body.packageCode || 'STANDARD').toUpperCase() as InstitutionPackageCode;
  if (!INSTITUTION_PACKAGE_CODES.includes(packageCode)) throw new Error('Geçersiz kurum paketi.');
  const ownership = text(body.ownership || 'PRIVATE').toUpperCase() as 'PUBLIC' | 'PRIVATE';
  if (!INSTITUTION_OWNERSHIPS.includes(ownership)) throw new Error('Geçersiz mülkiyet türü.');

  const contactEmail = text(body.contactEmail).toLowerCase();
  if (contactEmail && !/^\S+@\S+\.\S+$/.test(contactEmail)) throw new Error('İletişim e-postası geçersiz.');
  const officialUrl = text(body.officialUrl);
  if (officialUrl && !/^https:\/\//i.test(officialUrl)) throw new Error('Resmî web adresi https:// ile başlamalıdır.');

  const managerBody = body.manager || {};
  const manager = {
    displayName: text(managerBody.displayName),
    email: text(managerBody.email).toLowerCase() || null,
    username: text(managerBody.username).toLowerCase() || null,
    phone: text(managerBody.phone) || null,
    password: managerBody.password || '',
  };
  if (!manager.displayName || (!manager.email && !manager.username)) throw new Error('İlk kurum yöneticisi için ad soyad ve e-posta veya kullanıcı adı zorunludur.');
  if (manager.email && !/^\S+@\S+\.\S+$/.test(manager.email)) throw new Error('Kurum yöneticisi e-postası geçersiz.');
  if (manager.password.length < 8) throw new Error('Kurum yöneticisi şifresi en az 8 karakter olmalıdır.');

  const featureSet = new Set((Array.isArray(body.features) ? body.features : []).map((feature) => text(feature).toUpperCase()));
  const features = [...featureSet].filter((feature) => (INSTITUTION_FEATURE_KEYS as readonly string[]).includes(feature));
  if (!features.includes('EXAM_CENTER')) features.unshift('EXAM_CENTER');

  return {
    sourceType,
    mebCode: mebCode || null,
    code: requestedCode || null,
    name,
    city,
    district,
    institutionType: text(body.institutionType || 'OTHER').toUpperCase() || 'OTHER',
    ownership,
    educationLevel: text(body.educationLevel) || null,
    officialUrl: officialUrl || null,
    address: text(body.address) || null,
    contactName: text(body.contactName) || manager.displayName,
    contactPhone: text(body.contactPhone) || manager.phone,
    contactEmail: contactEmail || manager.email,
    academicYear,
    studentLimit: boundedInteger(body.studentLimit, 500, 'Öğrenci lisans limiti', 1000000),
    userLimit: boundedInteger(body.userLimit, 0, 'Kullanıcı limiti', 100000),
    packageCode,
    features,
    startTrial: body.startTrial !== false,
    manager,
  };
}

export function generatedInstitutionCode(id: string): string {
  return `ANX-${id.replace(/[^a-z0-9]/gi, '').slice(-8).toUpperCase()}`;
}
