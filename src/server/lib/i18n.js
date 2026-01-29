import fs from 'fs';
import path from 'path';

const cache = {};

function loadLocaleSync(locale) {
  // dev: allow hot-reload of locale files
  if (process.env.NODE_ENV !== 'production') {
    delete cache[locale];
  }

  if (cache[locale]) return cache[locale];

  const filePath = path.join(process.cwd(), 'locales', `${locale}.json`);
  if (!fs.existsSync(filePath)) {
    // fallback do 'pl' (lub pustego obiektu) zamiast rzucać
    if (locale !== 'pl' && fs.existsSync(path.join(process.cwd(), 'locales', 'pl.json'))) {
      cache[locale] = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'locales', 'pl.json'), 'utf8'));
      return cache[locale];
    }
    cache[locale] = {};
    return cache[locale];
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    cache[locale] = JSON.parse(raw);
    return cache[locale];
  } catch (e) {
    // loguj problem, ale nie przerywaj serwera
    console.error(`Invalid locale JSON (${filePath}):`, e.message);
    cache[locale] = {};
    return cache[locale];
  }
}

export function createTranslator(locale = 'pl') {
  const dict = loadLocaleSync(locale);

  return function t(key) {
    const parts = key.split('.');
    let value = dict;

    for (const p of parts) {
      value = value?.[p];
      if (value === undefined) {
        // opcjonalnie: loguj brakujący klucz w dewelopmencie
        if (process.env.NODE_ENV !== 'production') {
          // debounce/aggregate logging w realnej aplikacji
          console.warn(`Missing translation key: ${key} for locale ${locale}`);
        }
        return key;
      }
    }
    return value;
  };
}
