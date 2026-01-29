import express from "express";
import { listMaterials } from "../controllers/materialsController.js";

const router = express.Router();

router.get("/", listMaterials);

export default router;
