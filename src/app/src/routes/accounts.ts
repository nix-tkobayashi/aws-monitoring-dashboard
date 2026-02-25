import { Router } from "express";
import {
  ListAccountsCommand,
  paginateListAccounts,
} from "@aws-sdk/client-organizations";
import { organizationsClient } from "../services/aws-clients";

export const accountsRouter = Router();

// In-memory cache (refreshed every 30 minutes)
let cache: Record<string, string> = {};
let cacheExpiry = 0;
const CACHE_TTL_MS = 30 * 60 * 1000;

async function fetchAccountMap(): Promise<Record<string, string>> {
  if (Date.now() < cacheExpiry && Object.keys(cache).length > 0) {
    return cache;
  }

  const map: Record<string, string> = {};
  const paginator = paginateListAccounts(
    { client: organizationsClient },
    {}
  );

  for await (const page of paginator) {
    for (const account of page.Accounts || []) {
      if (account.Id && account.Name) {
        map[account.Id] = account.Name;
      }
    }
  }

  cache = map;
  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return map;
}

// GET /api/accounts
accountsRouter.get("/", async (_req, res) => {
  try {
    const map = await fetchAccountMap();
    res.json(map);
  } catch (err) {
    console.error("Error fetching accounts:", err);
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});
