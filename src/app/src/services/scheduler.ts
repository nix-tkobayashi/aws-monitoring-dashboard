import cron from "node-cron";
import { fetchAndStoreFindings } from "./guardduty-service";
import { fetchAndStoreHealthEvents } from "./health-service";

export function startScheduler(): void {
  // Fetch GuardDuty findings every hour
  cron.schedule("0 * * * *", async () => {
    console.log("Scheduled: Fetching GuardDuty findings...");
    try {
      await fetchAndStoreFindings();
    } catch (err) {
      console.error("Failed to fetch GuardDuty findings:", err);
    }
  });

  // Fetch Health events every 30 minutes
  cron.schedule("*/30 * * * *", async () => {
    console.log("Scheduled: Fetching Health events...");
    try {
      await fetchAndStoreHealthEvents();
    } catch (err) {
      console.error("Failed to fetch Health events:", err);
    }
  });

  console.log("Scheduler started: GuardDuty (hourly), Health (every 30min)");
}
