import {
    applyDelta as applyDeltaService,
    getTaskExecSummary as getTaskExecSummaryService,
    getTaskExecSummaryForOperatorSession,
    createOperatorSession,
    NotFoundError,
    ForbiddenError,
    ConflictError,
    getTaskHeader as getTaskHeaderService
  } from "../services/taskService.js";

import { mapMaterial } from "../lib/materialLocale.js";


  
  function mapError(res, err) {
    if (err instanceof NotFoundError) return res.status(404).send(err.message);
    if (err instanceof ForbiddenError) return res.status(403).send(err.message);
    if (err instanceof ConflictError) return res.status(409).send(err.message);
  
    console.error(err);
    return res.status(500).send("Internal error");
  }
  
// GET /tasks/:taskId/execute
export async function executeView(req, res) {
    try {
      const { taskId } = req.params;
      const header = await getTaskHeaderService(taskId);
  
      // actorId z req.user (mockAuth / auth)
      const queryActorId = req.query.actorId ? String(req.query.actorId).trim() : null;
      // jeśli nie ma actorId, fallback do query (tylko dev)
      const effectiveActorId = queryActorId || req.user?.id || null;
  
      let sessionId = null;
      let summaryResult;
  
      if (effectiveActorId) {
        // utwórz sesję operatora i snapshot BYŁO (jeśli operatorId dostępny)
        const sess = await createOperatorSession(taskId, effectiveActorId);
        if (!sess.ok) {
            summaryResult = await getTaskExecSummaryService(taskId);
          } else {
            sessionId = sess.sessionId;
            summaryResult = await getTaskExecSummaryForOperatorSession(taskId, effectiveActorId);
          }
  
        // pobierz summary dopasowane do sesji operatora
        summaryResult = await getTaskExecSummaryForOperatorSession(taskId, effectiveActorId, sessionId);

      } else {
        // fallback: dotychczasowa agregacja (bez sesji)
        summaryResult = await getTaskExecSummaryService(taskId);
      }
  
      const locale = res.locals.locale || 'pl';

      const items = (summaryResult.items || []).map((it) => mapMaterial(it, locale));
  
      return res.render("tasks/execute", {
        taskId,
        actorId: effectiveActorId,
        taskNo: header.task_no,
        items,
        sessionId,
      });
    } catch (err) {
      return mapError(res, err);
    }
  }
  
  
  
// POST /tasks/:taskId/materials/:materialId/delta  (HTMX)
export async function applyDeltaHtmx(req, res) {
    try {
      const { taskId, materialId } = req.params;
  
      // HTMX wysyła z formularza:
      const { actionId, delta } = req.body;
  
      // WAŻNE: preferujemy actorId z formularza (body) — to działa przy braku pełnego auth
      // fallback do req.user?.id kiedy formularz go nie dostarcza
      const actorId = (req.body && req.body.actorId) ? String(req.body.actorId).trim() : (req.user?.id || null);
  
      await applyDeltaService({
        actionId,
        taskId,
        materialId,
        actorId,
        delta,
      });
  
      // zwróć od razu odświeżony wiersz (po sumowaniu)
      const summary = await getTaskExecSummaryForOperatorSession(taskId, actorId);
      const locale = res.locals.locale || 'pl';
      const rawItem = summary.items.find((x) => x.materialId === materialId);
      const item = rawItem ? mapMaterial(rawItem, locale) : null;
      return res.render("tasks/partials/materialRow", { taskId, actorId, item });
    } catch (err) {
      return mapError(res, err);
    }
  }
  
  