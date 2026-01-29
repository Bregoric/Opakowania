// src/server/routes/tasksHistory.js
// Mount in app.js as: app.use("/tasks", tasksHistoryRouter);
// Endpoints:
//   GET  /tasks/:id/history/partial
//   GET  /tasks/:id/history/:auditId/partial
//   GET  /tasks/:id/history
//   GET  /tasks/:id/history/:auditId

import express from "express";
import pool from "../db/pool.js";
import { mapMaterial } from "../lib/materialLocale.js"; // <- istnieje po utworzeniu src/server/db/pool.js

const router = express.Router();

// -------------------- helpers --------------------
const parseLimit = (v, def = 20, max = 100) => {
  const n = parseInt(v ?? def, 10);
  if (Number.isNaN(n) || n <= 0) return def;
  return Math.min(n, max);
};

const isUuid = (s) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(s)
  );

const isPositiveInt = (s) => /^\d+$/.test(String(s));

function buildDiff(auditRow) {
  const keys = auditRow.changed_keys || [];
  const oldData = auditRow.old_data || {};
  const newData = auditRow.new_data || {};
  return keys.map((k) => ({
    key: k,
    before: oldData[k] === undefined ? null : oldData[k],
    after: newData[k] === undefined ? null : newData[k],
  }));
}

// -------------------- ACL stub --------------------
// Na razie tylko weryfikacja, że task istnieje.
async function ensureCanViewTask(req, res, next) {
  const taskId = req.params.id;
  if (!isUuid(taskId)) return res.status(400).json({ message: "invalid task id" });

  try {
    const { rows } = await pool.query(`SELECT id FROM tasks WHERE id=$1 LIMIT 1`, [
      taskId,
    ]);
    if (!rows.length) return res.status(404).json({ message: "task not found" });
    return next();
  } catch (err) {
    return next(err);
  }
}

// ==================== ROUTES (ORDER MATTERS) ====================
// Najpierw "partial" (bardziej specyficzne), potem dynamiczne :auditId.

// 1) PARTIAL LIST
router.get("/:id/history/partial", ensureCanViewTask, async (req, res, next) => {
  try {
    const taskId = req.params.id;
    const limit = parseLimit(req.query.limit);
    const before = req.query.before ?? null;
    const action = req.query.action ?? null;

    const params = [taskId];
    let idx = 1;
    let where = "task_id = $1";

    if (action) {
      idx++;
      params.push(action);
      where += ` AND action = $${idx}`;
    }
    if (before) {
      idx++;
      params.push(before);
      where += ` AND created_at < $${idx}`;
    }

    idx++;
    params.push(limit);

    const { rows } = await pool.query(
      `
      SELECT id, action, actor_id, changed_keys, created_at
      FROM task_audit
      WHERE ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT $${idx}
      `,
      params
    );

    const next_before = rows.length
  ? new Date(rows[rows.length - 1].created_at).toISOString()
  : null;

    // views/partials/task_history_list.ejs
    return res.render("partials/task_history_list", {
      taskId,
      audits: rows,
      next_before,
      limit,
    });
  } catch (err) {
    return next(err);
  }
});

// 2) PARTIAL DETAIL
router.get(
  "/:id/history/:auditId/partial",
  ensureCanViewTask,
  async (req, res, next) => {
    try {
      const { id: taskId, auditId } = req.params;
      if (!isPositiveInt(auditId)) return res.status(400).send("invalid audit id");

      const { rows } = await pool.query(
        `
        SELECT id, actor_id, action, old_data, new_data, changed_keys, meta, created_at
        FROM task_audit
        WHERE task_id = $1 AND id = $2
        LIMIT 1
        `,
        [taskId, auditId]
      );

      if (!rows.length) return res.status(404).send("<div>Not found</div>");

      const audit = rows[0];
      const diff = buildDiff(audit);

      // views/partials/task_history_detail.ejs
      return res.render("partials/task_history_detail", { taskId, audit, diff });
    } catch (err) {
      return next(err);
    }
  }
);

// 3) JSON LIST
router.get("/:id/history", ensureCanViewTask, async (req, res, next) => {
  try {
    const taskId = req.params.id;
    const limit = parseLimit(req.query.limit);
    const before = req.query.before ?? null;
    const action = req.query.action ?? null;
    const actor = req.query.actor ?? null;

    const params = [taskId];
    let idx = 1;
    let where = "task_id = $1";

    if (action) {
      idx++;
      params.push(action);
      where += ` AND action = $${idx}`;
    }

    if (actor) {
      if (!isUuid(actor)) return res.status(400).json({ message: "invalid actor id" });
      idx++;
      params.push(actor);
      where += ` AND actor_id = $${idx}`;
    }

    if (before) {
      idx++;
      params.push(before);
      where += ` AND created_at < $${idx}`;
    }

    idx++;
    params.push(limit);

    const sql = `
      SELECT id, action, actor_id, changed_keys, created_at
      FROM task_audit
      WHERE ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT $${idx}
    `;

    const { rows } = await pool.query(sql, params);
    const next_before = rows.length
  ? new Date(rows[rows.length - 1].created_at).toISOString()
  : null;

    return res.json({
      items: rows,
      meta: { limit, count: rows.length, next_before },
    });
  } catch (err) {
    return next(err);
  }
});

// 4) JSON DETAIL
router.get("/:id/history/:auditId", ensureCanViewTask, async (req, res, next) => {
  try {
    const { id: taskId, auditId } = req.params;
    if (!isPositiveInt(auditId)) return res.status(400).json({ message: "invalid audit id" });

    const { rows } = await pool.query(
      `
      SELECT id, actor_id, action, old_data, new_data, changed_keys, meta, created_at
      FROM task_audit
      WHERE task_id = $1 AND id = $2
      LIMIT 1
      `,
      [taskId, auditId]
    );

    if (!rows.length) return res.status(404).json({ message: "not found" });

    const audit = rows[0];
    const diff = buildDiff(audit);

    return res.json({ audit: { ...audit, diff } });
  } catch (err) {
    return next(err);
  }
});

// ==================== MATERIAL ACTIONS HISTORY ====================
// GET /tasks/:id/material-history/partial
router.get("/:id/material-history/partial", ensureCanViewTask, async (req, res, next) => {
  try {
    const taskId = req.params.id;
    const limit = Math.min(200, parseInt(req.query.limit || "50", 10));

    const { rows } = await pool.query(
      `
        SELECT
          a.created_at,
          a.delta,
          a.actor_id,
          u.login AS actor_name,
          a.material_id,
          m.number AS material_number,
          m.common AS material_common,
          m.pl AS material_pl,
          m.de AS material_de,
          m.en AS material_en
        FROM task_exec_actions a
        LEFT JOIN users u ON u.id = a.actor_id
        LEFT JOIN materials m ON m.id = a.material_id
        WHERE a.task_id = $1
        ORDER BY a.created_at DESC
        LIMIT $2
      `,
      [taskId, limit]
    );

    const locale = res.locals.locale || "pl";
    const actions = rows.map((a) => {
      const material = mapMaterial(
        {
          id: a.material_id,
          number: a.material_number,
          common: a.material_common,
          pl: a.material_pl,
          de: a.material_de,
          en: a.material_en,
        },
        locale
      );

      return {
        ...a,
        material_common: material.common,
        material_localized: material.localizedName,
      };
    });

    return res.render("partials/task_material_history_list", {
      taskId,
      actions,
      limit,
    });
  } catch (err) {
    return next(err);
  }
});

  
  // (opcjonalnie) JSON wersja
router.get("/:id/material-history", ensureCanViewTask, async (req, res, next) => {
  try {
    const taskId = req.params.id;
    const limit = Math.min(200, parseInt(req.query.limit || "50", 10));

    const { rows } = await pool.query(
      `
        SELECT
          a.created_at,
          a.delta,
          a.actor_id,
          u.login AS actor_name,
          a.material_id,
          m.number AS material_number,
          m.common AS material_common,
          m.pl AS material_pl,
          m.de AS material_de,
          m.en AS material_en
        FROM task_exec_actions a
        LEFT JOIN users u ON u.id = a.actor_id
        LEFT JOIN materials m ON m.id = a.material_id
        WHERE a.task_id = $1
        ORDER BY a.created_at DESC
        LIMIT $2
      `,
      [taskId, limit]
    );

    const locale = res.locals.locale || "pl";
    const items = rows.map((a) => {
      const material = mapMaterial(
        {
          id: a.material_id,
          number: a.material_number,
          common: a.material_common,
          pl: a.material_pl,
          de: a.material_de,
          en: a.material_en,
        },
        locale
      );

      return {
        ...a,
        material_common: material.common,
        material_localized: material.localizedName,
      };
    });

    return res.json({ items, meta: { limit, count: items.length } });
  } catch (err) {
    return next(err);
  }
});
  



export default router;
