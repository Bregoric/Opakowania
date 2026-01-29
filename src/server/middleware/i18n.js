import { createTranslator } from '../lib/i18n.js';

const SUPPORTED = ['pl', 'en', 'de'];

function normalizeLocale(v) {
  if (typeof v !== 'string') return null;
  const code = v.slice(0, 2).toLowerCase();
  return SUPPORTED.includes(code) ? code : null;
}

function pickLocaleFromAcceptLanguage(header) {
  if (!header) return null;
  const parts = header.split(',').map(p => p.split(';')[0].trim());
  for (const p of parts) {
    const code = p.slice(0,2).toLowerCase();
    if (SUPPORTED.includes(code)) return code;
  }
  return null;
}

export default function i18nMiddleware(req, res, next) {
  try {
    const overrideLocale =
      normalizeLocale(req.query?.locale) ||
      normalizeLocale(req.headers['x-locale']);

    const userLocale = normalizeLocale(req.user?.locale);
    const cookieLocale = normalizeLocale(req.cookies?.lang);
    const headerLocale = pickLocaleFromAcceptLanguage(req.headers['accept-language']);

    const locale =
      overrideLocale ||
      userLocale ||
      cookieLocale ||
      (SUPPORTED.includes(headerLocale) ? headerLocale : 'pl');

    // "effectiveLocale" = res.locals.locale
    res.locals.locale = locale;
    res.locals.t = createTranslator(locale);
    next();
  } catch (err) {
    console.error('i18n middleware error:', err);
    res.locals.locale = 'pl';
    res.locals.t = createTranslator('pl');
    next();
  }
}
