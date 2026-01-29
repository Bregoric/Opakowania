import pool from "../db/db.js";
import { mapMaterial } from "../lib/materialLocale.js";

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
        active
      FROM materials
      ORDER BY number ASC
    `);

    const locale = res.locals.locale || "pl";
    const materials = result.rows.map((m) => mapMaterial(m, locale));

    res.render("materials/list", { materials });
  } catch (err) {
    console.error("Błąd przy pobieraniu materiałów:", err);
    res.status(500).send("Błąd serwera");
  }
}
