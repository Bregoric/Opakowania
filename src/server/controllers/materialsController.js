import pool from "../db/db.js";

function materialLocalizedName(m, locale) {
  if (locale === "de") return m.de ?? m.en ?? m.pl;
  if (locale === "en") return m.en ?? m.de ?? m.pl;
  return m.pl; // pl oraz inne locale fallbackują do pl
}

export async function listMaterials(req, res) {
  try {
    const result = await pool.query(`
      SELECT
        id,
        number,
        common,
        pl,
        de,
        en,
        rodzaj,
        ksiegowanie,
        image_url,
        active,
        common AS name,        -- kompatybilność dla obecnego EJS
        'szt.'::text AS unit   -- kompatybilność po usunięciu unit
      FROM materials
    `);

    const locale = res.locals.locale || "pl";
    const materials = result.rows.map((m) => ({
      ...m,
      localizedName: materialLocalizedName(m, locale),
    }));

    res.render("materials/list", { materials });
  } catch (err) {
    console.error("Błąd przy pobieraniu materiałów:", err);
    res.status(500).send("Błąd serwera");
  }
}
