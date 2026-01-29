import express from "express";
import * as tasksController from "../controllers/tasksController.js";

const router = express.Router();

router.get("/:taskId/execute", tasksController.executeView);
router.post("/:taskId/materials/:materialId/delta", tasksController.applyDeltaHtmx);

export default router;
