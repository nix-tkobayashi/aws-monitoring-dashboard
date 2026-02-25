import { Router } from "express";
import {
  getHealthEvents,
  getHealthEventById,
  fetchAndStoreHealthEvents,
  updateHealthEventMeta,
} from "../services/health-service";

export const healthRouter = Router();

// GET /api/health/events
healthRouter.get("/events", async (req, res) => {
  try {
    const query = {
      accountId: req.query.accountId as string | undefined,
      service: req.query.service as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : 20,
      nextToken: req.query.nextToken as string | undefined,
    };

    const result = await getHealthEvents(query);
    res.json(result);
  } catch (err) {
    console.error("Error fetching health events:", err);
    res.status(500).json({ error: "Failed to fetch health events" });
  }
});

// GET /api/health/events/:accountId/:findingId
healthRouter.get("/events/:accountId/:findingId", async (req, res) => {
  try {
    const event = await getHealthEventById(
      req.params.accountId,
      req.params.findingId
    );
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    res.json(event);
  } catch (err) {
    console.error("Error fetching health event:", err);
    res.status(500).json({ error: "Failed to fetch health event" });
  }
});

// PATCH /api/health/events/:accountId/:findingId - Update comment/determination
const VALID_DETERMINATIONS = ["", "未対応", "調査中", "問題有り", "問題無し"];

healthRouter.patch("/events/:accountId/:findingId", async (req, res) => {
  try {
    const { comment, determination } = req.body ?? {};
    if (
      determination !== undefined &&
      !VALID_DETERMINATIONS.includes(determination)
    ) {
      res.status(400).json({ error: "Invalid determination value" });
      return;
    }
    await updateHealthEventMeta(
      req.params.accountId,
      req.params.findingId,
      comment,
      determination
    );
    res.json({ message: "Updated" });
  } catch (err) {
    console.error("Error updating health event:", err);
    res.status(500).json({ error: "Failed to update health event" });
  }
});

// POST /api/health/sync - Manual sync trigger
healthRouter.post("/sync", async (_req, res) => {
  try {
    const count = await fetchAndStoreHealthEvents();
    res.json({ message: `Synced ${count} events` });
  } catch (err) {
    console.error("Error syncing health events:", err);
    res.status(500).json({ error: "Failed to sync health events" });
  }
});
