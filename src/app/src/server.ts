import express from "express";
import path from "path";
import { config } from "./config";
import { guarddutyRouter } from "./routes/guardduty";
import { healthRouter } from "./routes/health";
import { dashboardRouter } from "./routes/dashboard";
import { accountsRouter } from "./routes/accounts";
import { startScheduler } from "./services/scheduler";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check for ECS (no auth required)
app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

// BASIC auth middleware (skip if env vars not set)
if (config.basicAuth.user && config.basicAuth.pass) {
  app.use((req, res, next) => {
    const header = req.headers.authorization;
    if (header) {
      const parts = header.split(" ");
      if (parts[0] === "Basic" && parts[1]) {
        const decoded = Buffer.from(parts[1], "base64").toString("utf-8");
        const [user, ...passParts] = decoded.split(":");
        const pass = passParts.join(":");
        if (user === config.basicAuth.user && pass === config.basicAuth.pass) {
          return next();
        }
      }
    }
    res.set("WWW-Authenticate", 'Basic realm="AWS Monitoring"');
    res.status(401).send("Authentication required");
  });
}

app.use(express.static(path.join(__dirname, "../public")));

// API routes
app.use("/api/guardduty", guarddutyRouter);
app.use("/api/health", healthRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/accounts", accountsRouter);

// SPA fallback
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startScheduler();
});

export default app;
