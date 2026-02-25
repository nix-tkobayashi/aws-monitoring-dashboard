import { Router } from "express";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "../services/aws-clients";
import { config } from "../config";

export const dashboardRouter = Router();

// GET /api/dashboard/summary
dashboardRouter.get("/summary", async (_req, res) => {
  try {
    // GuardDuty findings count by severity
    const guarddutyResult = await docClient.send(
      new ScanCommand({
        TableName: config.dynamodb.guarddutyTable,
        ProjectionExpression: "severity, #type, createdAt",
        ExpressionAttributeNames: { "#type": "type" },
      })
    );

    const findings = guarddutyResult.Items || [];
    const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };

    for (const f of findings) {
      const sev = f.severity as number;
      if (sev >= 7) severityCounts.critical++;
      else if (sev >= 4) severityCounts.high++;
      else if (sev >= 2) severityCounts.medium++;
      else severityCounts.low++;
    }

    // Health events count
    const healthResult = await docClient.send(
      new ScanCommand({
        TableName: config.dynamodb.healthTable,
        ProjectionExpression: "statusCode",
      })
    );

    const events = healthResult.Items || [];
    const healthSummary = {
      total: events.length,
      open: events.filter((e) => e.statusCode === "open").length,
      upcoming: 0,
      closed: events.filter((e) => e.statusCode === "closed").length,
    };

    res.json({
      guardduty: {
        total: findings.length,
        severity: severityCounts,
      },
      health: healthSummary,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Error fetching dashboard summary:", err);
    res.status(500).json({ error: "Failed to fetch dashboard summary" });
  }
});
