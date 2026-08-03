import { Router } from "express";
import { MODELS } from "../config/models";

export const configRouter = Router();

configRouter.get("/active-models", (_req, res) => {
  res.json(MODELS);
});
