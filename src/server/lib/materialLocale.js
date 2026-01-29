export function materialLocalizedName(m, locale) {
    if (locale === "de") return m.de ?? m.en ?? m.pl;
    if (locale === "en") return m.en ?? m.de ?? m.pl;
    return m.pl; // pl oraz inne locale fallbackują do pl
  }
  
  export function mapMaterial(m, locale) {
    return { ...m, localizedName: materialLocalizedName(m, locale) };
  }
  