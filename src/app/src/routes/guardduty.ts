import { Router } from "express";
import {
  getFindings,
  getFindingById,
  fetchAndStoreFindings,
  updateFindingMeta,
} from "../services/guardduty-service";

export const guarddutyRouter = Router();

// GET /api/guardduty/findings
guarddutyRouter.get("/findings", async (req, res) => {
  try {
    const query = {
      accountId: req.query.accountId as string | undefined,
      severity: req.query.severity
        ? Number(req.query.severity)
        : undefined,
      limit: req.query.limit ? Number(req.query.limit) : 20,
      nextToken: req.query.nextToken as string | undefined,
    };

    const result = await getFindings(query);
    res.json(result);
  } catch (err) {
    console.error("Error fetching findings:", err);
    res.status(500).json({ error: "Failed to fetch findings" });
  }
});

// GET /api/guardduty/findings/:accountId/:findingId
guarddutyRouter.get("/findings/:accountId/:findingId", async (req, res) => {
  try {
    const finding = await getFindingById(
      req.params.accountId,
      req.params.findingId
    );
    if (!finding) {
      res.status(404).json({ error: "Finding not found" });
      return;
    }
    res.json(finding);
  } catch (err) {
    console.error("Error fetching finding:", err);
    res.status(500).json({ error: "Failed to fetch finding" });
  }
});

// PATCH /api/guardduty/findings/:accountId/:findingId - Update comment/determination
const VALID_DETERMINATIONS = ["", "未対応", "調査中", "問題有り", "問題無し"];

guarddutyRouter.patch("/findings/:accountId/:findingId", async (req, res) => {
  try {
    const { comment, determination } = req.body ?? {};
    if (
      determination !== undefined &&
      !VALID_DETERMINATIONS.includes(determination)
    ) {
      res.status(400).json({ error: "Invalid determination value" });
      return;
    }
    await updateFindingMeta(
      req.params.accountId,
      req.params.findingId,
      comment,
      determination
    );
    res.json({ message: "Updated" });
  } catch (err) {
    console.error("Error updating finding:", err);
    res.status(500).json({ error: "Failed to update finding" });
  }
});

// POST /api/guardduty/sync - Manual sync trigger
guarddutyRouter.post("/sync", async (_req, res) => {
  try {
    const count = await fetchAndStoreFindings();
    res.json({ message: `Synced ${count} findings` });
  } catch (err) {
    console.error("Error syncing findings:", err);
    res.status(500).json({ error: "Failed to sync findings" });
  }
});
