import {
    startTask as startTaskService,
    applyDelta as applyDeltaService,
    getTaskExecSummary as getTaskExecSummaryService,
    NotFoundError,
    ForbiddenError,
    ConflictError,
  } from "../services/taskService.js";
  
  function mapError(res, err) {
    if (err instanceof NotFoundError)
      return res.status(404).json({ ok: false, error: err.message });
    if (err instanceof ForbiddenError)
      return res.status(403).json({ ok: false, error: err.message });
    if (err instanceof ConflictError)
      return res.status(409).json({ ok: false, error: err.message });
  
    console.error(err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
  
  export async function startTask(req, res) {
    try {
      const { taskId, operatorId } = req.body;
      const result = await startTaskService(taskId, operatorId);
      return res.json(result);
    } catch (err) {
      return mapError(res, err);
    }
  }
  
  export async function applyDelta(req, res) {
    try {
      const { actionId, taskId, materialId, actorId, delta } = req.body;
  
      const result = await applyDeltaService({
        actionId,
        taskId,
        materialId,
        actorId,
        delta,
      });
  
      return res.json(result);
    } catch (err) {
      return mapError(res, err);
    }
  }

  export async function taskExecSummary(req, res) {
    try {
      const { taskId } = req.params;
      const result = await getTaskExecSummaryService(taskId);
      return res.json(result);
    } catch (err) {
      return mapError(res, err);
    }
  }
  