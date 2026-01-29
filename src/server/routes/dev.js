import express from "express";
import * as devController from "../controllers/devController.js";

const router = express.Router();

router.post("/start-task", devController.startTask);
router.post("/apply-delta", devController.applyDelta);

router.get("/task-exec-summary/:taskId", devController.taskExecSummary);

export default router;


