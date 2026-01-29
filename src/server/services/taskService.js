import  pool  from '../db/db.js';

/**
 * Błędy domenowe – ułatwiają mapowanie na HTTP (403/404/409)
 */
export class NotFoundError extends Error {}
export class ForbiddenError extends Error {}
export class ConflictError extends Error {}

/**
 * Rozpoczęcie zlecenia:
 * - tylko operator przypisany do zlecenia
 * - tylko gdy status = NEW
 * - ustawia started_at, started_by, status = IN_PROGRESS
 */
// zastąp istniejącą funkcję startTask tym kodem
export async function startTask(taskId, operatorId) {
    const client = await pool.connect();
  
    try {
      await client.query('BEGIN');
  
      // 1) Pobierz zlecenie z blokadą wiersza
      const { rows } = await client.query(
        `
        SELECT id, status, operator_id
        FROM tasks
        WHERE id = $1
        FOR UPDATE
        `,
        [taskId]
      );
  
      if (rows.length === 0) {
        throw new NotFoundError('Task not found');
      }
  
      const task = rows[0];
  
      // 2) Walidacje domenowe
      if (task.operator_id !== operatorId) {
        throw new ForbiddenError('Not assigned operator');
      }
  
      if (task.status !== 'NEW') {
        throw new ConflictError('Task already started or closed');
      }
  
      // 3) Przejście statusu
      await client.query(
        `
        UPDATE tasks
        SET
          status = 'IN_PROGRESS',
          started_at = NOW(),
          started_by = $2
        WHERE id = $1
        `,
        [taskId, operatorId]
      );
  
      // 4) Snapshot startowy: wypełnij task_exec_items na podstawie planu (jeśli istnieje)
      // Używamy istniejącej struktury: qty, source
      await client.query(
        `
        INSERT INTO task_exec_items (task_id, material_id, qty, source, created_at)
        SELECT $1 AS task_id, tpi.material_id, COALESCE(tpi.qty::integer, 0) AS qty, 'PLAN'::text AS source, NOW()
        FROM task_plan_items tpi
        WHERE tpi.task_id = $1
        ON CONFLICT (task_id, material_id) DO NOTHING
        `,
        [taskId]
      );
  
      await client.query('COMMIT');
  
      return { ok: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  



// replace applyDelta with this safer version
export async function applyDelta({ actionId, taskId, materialId, actorId, delta }) {
    if (!actionId) throw new ConflictError("actionId is required");
    if (!taskId) throw new ConflictError("taskId is required");
    if (!materialId) throw new ConflictError("materialId is required");
    if (!actorId) throw new ConflictError("actorId is required");
  
    const nDelta = Number(delta);

    // musi być integer
    if (!Number.isInteger(nDelta)) {
      throw new ConflictError("delta must be an integer");
    }
    
    // limit bezpieczeństwa (ustaw jak chcesz)
    if (nDelta === 0) {
      throw new ConflictError("delta cannot be 0");
    }
    if (nDelta < -1) {
        throw new ConflictError("negative delta not allowed (except -1)");
      }
    if (Math.abs(nDelta) > 1000) {
      throw new ConflictError("delta too large");
    }
  
    // UUID regex
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const actionIsUuid = typeof actionId === "string" && uuidRegex.test(actionId);
    const actorIsUuid = typeof actorId === "string" && uuidRegex.test(actorId);
  
    if (!actorIsUuid) {
      // Early reject — actorId must be a valid UUID
      throw new ForbiddenError("Invalid actorId");
    }
  
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
  
      // lock task row
      const taskRes = await client.query(
        `SELECT id, status FROM tasks WHERE id = $1 FOR UPDATE`,
        [taskId]
      );
      if (taskRes.rows.length === 0) throw new NotFoundError("Task not found");
      const task = taskRes.rows[0];
      if (task.status !== "IN_PROGRESS") throw new ConflictError("Task is not in progress");
  
      // --- NEW: validate actor exists in users ---
      const userRes = await client.query(
        `SELECT id FROM users WHERE id = $1`,
        [actorId]
      );
      if (userRes.rows.length === 0) {
        // don't attempt insert — return meaningful 403
        throw new ForbiddenError("Actor not recognized");
      }
  
      // idempotency only if actionId looks like uuid
      if (actionIsUuid) {
        const already = await client.query(
          `SELECT action_id FROM task_exec_actions WHERE action_id = $1`,
          [actionId]
        );
        if (already.rows.length > 0) {
          await client.query("COMMIT");
          return { ok: true, idempotent: true };
        }
      }
  
      // material validation
      const matRes = await client.query(
        `SELECT id, active FROM materials WHERE id = $1`,
        [materialId]
      );
      if (matRes.rows.length === 0) throw new NotFoundError("Material not found");
      if (matRes.rows[0].active === false) throw new ConflictError("Material is inactive");
  
      // safe insert: if actionId not uuid, generate server UUID; actorId is validated to exist
// ... po walidacjach task/user/material

// BLOKADA: minus tylko jeśli operator ma dodatni ileDodalem (od startu sesji)
if (nDelta === -1) {
    const sessionRes = await client.query(
      `
      SELECT id, started_at
      FROM task_operator_sessions
      WHERE task_id = $1 AND operator_id = $2
      ORDER BY started_at DESC
      LIMIT 1
      `,
      [taskId, actorId]
    );
  
    const sess = sessionRes.rows[0];
    if (!sess) {
      throw new ConflictError("No operator session; cannot decrement");
    }
  
    const addedRes = await client.query(
      `
      SELECT COALESCE(SUM(delta), 0)::integer AS added
      FROM task_exec_actions
      WHERE task_id = $1
        AND material_id = $2
        AND actor_id = $3
        AND created_at >= $4
      `,
      [taskId, materialId, actorId, sess.started_at]
    );
  
    const added = addedRes.rows[0]?.added ?? 0;
    if (added <= 0) {
      throw new ConflictError("Cannot decrement more than you added");
    }
  }
  
  // dopiero teraz insert akcji
  await client.query(
    `
    INSERT INTO task_exec_actions(action_id, task_id, material_id, actor_id, delta)
    VALUES (
      CASE
        WHEN $1 ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          THEN $1::uuid
        ELSE gen_random_uuid()
      END,
      $2::uuid, $3::uuid, $4::uuid, $5
    )
    `,
    [actionId, taskId, materialId, actorId, nDelta]
  );
  
  
      await client.query("COMMIT");
      return { ok: true, idempotent: false };
    } catch (err) {
      await client.query("ROLLBACK");
      if (err?.code === "23505") {
        return { ok: true, idempotent: true };
      }
      throw err;
    } finally {
      client.release();
    }
  }
  
  

// zastąp istniejącą funkcję getTaskExecSummary tą wersją
export async function getTaskExecSummary(taskId) {
    const { rows } = await pool.query(
      `
      SELECT
        m.id               AS "materialId",
        m.number           AS "number",
        m.name             AS "name",
        m.unit             AS "unit",
        m.image_url        AS "imageUrl",
        m.active           AS "active",
        COALESCE(te.qty, 0)::integer AS "startQty",
        COALESCE(SUM(a.delta), 0)::integer + COALESCE(te.qty, 0) AS "qty"
      FROM materials m
      LEFT JOIN task_exec_actions a
        ON a.material_id = m.id
       AND a.task_id = $1
      LEFT JOIN task_exec_items te
        ON te.material_id = m.id
       AND te.task_id = $1
      WHERE m.active = true
      GROUP BY m.id, m.number, m.name, m.unit, m.image_url, m.active, te.qty
      ORDER BY m.number ASC
      `,
      [taskId]
    );
  
    return { ok: true, items: rows };
  }
  
  
  export async function getTaskHeader(taskId) {
    const { rows } = await pool.query(
      `SELECT id, task_no, status, operator_id, vehicle_plate
       FROM tasks
       WHERE id = $1`,
      [taskId]
    );
  
    if (rows.length === 0) throw new NotFoundError("Task not found");
    return rows[0];
  }
  
  /**
 * Utwórz sesję operatora (jeśli jeszcze nie istnieje) i snapshot BYŁO dla tej sesji.
 * Zwraca { sessionId }.
 *
 * Logika:
 *  - tworzy wpis w task_operator_sessions
 *  - dla każdego aktywnego materiału zapisuje snapshot startowy (start_qty)
 *    gdzie start_qty = COALESCE(qty_from_task_exec_items, 0) + COALESCE(sum(delta) dla tego materiału do teraz, 0)
 *  - używa ON CONFLICT DO NOTHING na snapshotach, żeby nie nadpisywać istniejących
 */
// bezpieczna wersja createOperatorSession
export async function createOperatorSession(taskId, operatorId) {
    const client = await pool.connect();
    try {
      // 0) krótkie sprawdzenie czy operator istnieje
      const userRes = await client.query(
        `SELECT id FROM users WHERE id = $1`,
        [operatorId]
      );
      if (userRes.rows.length === 0) {
        // nie tworzymy sesji jeśli nie ma użytkownika — caller dostanie informację
        return { ok: false, reason: "no_user" };
      }
  
      await client.query("BEGIN");
  
      // 1) create session
      const insertSessionRes = await client.query(
        `
        INSERT INTO task_operator_sessions (task_id, operator_id, started_at)
        VALUES ($1, $2, NOW())
        RETURNING id
        `,
        [taskId, operatorId]
      );
  
      const sessionId = insertSessionRes.rows[0].id;
  
      // 2) insert snapshots for active materials: compute current global qty per material
      await client.query(
        `
        INSERT INTO task_operator_snapshots (session_id, material_id, start_qty, created_at)
        SELECT
          $1 AS session_id,
          m.id AS material_id,
          (COALESCE(te.qty, 0) + COALESCE(agg.sum_delta, 0))::numeric AS start_qty,
          NOW() AS created_at
        FROM materials m
        LEFT JOIN (
          SELECT material_id, SUM(delta) AS sum_delta
          FROM task_exec_actions
          WHERE task_id = $2
          GROUP BY material_id
        ) agg ON agg.material_id = m.id
        LEFT JOIN task_exec_items te ON te.task_id = $2 AND te.material_id = m.id
        WHERE m.active = true
        ON CONFLICT (session_id, material_id) DO NOTHING
        `,
        [sessionId, taskId]
      );
  
      await client.query("COMMIT");
      return { ok: true, sessionId };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  
  
  /**
 * Zwraca listę materiałów z wartościami:
 * - plan       (task_exec_items.qty dla source='PLAN')
 * - bylo       (task_operator_snapshots.start_qty dla ostatniej sesji operatora)
 * - ileDodalem (suma delta dla actor_id od momentu ostatniej sesji)
 * - jest       (plan + sum(all deltas) czyli globalny current)
 *
 * Jeśli operatorId nie ma aktywnej sesji, funkcja wybiera ostatnią sesję operatora (jeśli istnieje).
 */
export async function getTaskExecSummaryForOperatorSession(taskId, operatorId) {
    // znajdź ostatnią sesję operatora dla tego taska (może być NULL)
    const sessionRes = await pool.query(
      `
      SELECT id, started_at
      FROM public.task_operator_sessions
      WHERE task_id = $1
        AND operator_id = $2
      ORDER BY started_at DESC
      LIMIT 1
      `,
      [taskId, operatorId]
    );
  
    const sessionId = sessionRes.rows[0]?.id || null;
  
    const { rows } = await pool.query(
      `
      SELECT
        m.id               AS "materialId",
        m.number           AS "number",
        m.name             AS "name",
        m.unit             AS "unit",
        m.image_url        AS "imageUrl",
        m.active           AS "active",
  
        -- PLAN (z task_exec_items, source = 'PLAN')
        COALESCE((SELECT qty FROM public.task_exec_items te WHERE te.task_id = $1 AND te.material_id = m.id AND te.source = 'PLAN'), 0)::integer AS "plan",
  
        -- BYŁO (snapshot dla sesji operatora)
        COALESCE((SELECT start_qty FROM public.task_operator_snapshots ts WHERE ts.session_id = $2 AND ts.material_id = m.id), 0)::integer AS "bylo",
  
        -- ILE_DODALEM: delta dla tego actor od momentu session.started_at (jeśli session istnieje)
        COALESCE((
          SELECT SUM(a.delta)
          FROM public.task_exec_actions a
          WHERE a.task_id = $1
            AND a.material_id = m.id
            AND a.actor_id = $3
            AND ($2 IS NULL OR a.created_at >= (SELECT started_at FROM public.task_operator_sessions WHERE id = $2 LIMIT 1))
        ), 0)::integer AS "ileDodalem",
  
        -- JEST: plan + sum(all deltas)
        (COALESCE((SELECT qty FROM public.task_exec_items te WHERE te.task_id = $1 AND te.material_id = m.id AND te.source = 'PLAN'), 0)
         + COALESCE((
             SELECT SUM(a2.delta)
             FROM public.task_exec_actions a2
             WHERE a2.task_id = $1
               AND a2.material_id = m.id
           ), 0)
        )::integer AS "jest"
  
      FROM public.materials m
      WHERE m.active = true
      ORDER BY m.number ASC
      `,
      [taskId, sessionId, operatorId]
    );
  
    return { ok: true, items: rows, sessionId };
  }
  