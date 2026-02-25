import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const GUARDDUTY_TABLE = process.env.DYNAMODB_GUARDDUTY_TABLE;
const HEALTH_TABLE = process.env.DYNAMODB_HEALTH_TABLE;
const TTL_SECONDS = 365 * 24 * 60 * 60; // 1 year

export async function handler(event) {
  console.log("Received event:", JSON.stringify(event));

  try {
    switch (event.source) {
      case "aws.guardduty":
        await processGuardDuty(event);
        break;
      case "aws.health":
        await processHealth(event);
        break;
      default:
        console.warn("Unknown event source:", event.source);
    }
  } catch (err) {
    console.error("Error processing event:", err);
    throw err;
  }
}

async function processGuardDuty(event) {
  const d = event.detail;

  // camelCase fields from EventBridge (API uses PascalCase)
  const item = {
    pk: d.accountId || "unknown",
    sk: `FINDING#${d.id}`,
    findingId: d.id,
    accountId: d.accountId,
    region: d.region,
    type: d.type,
    title: d.title,
    description: d.description,
    severity: d.severity,
    confidence: d.confidence,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    archived: d.service?.archived || false,
    resource: JSON.stringify(d.resource),
    service: JSON.stringify(d.service),
    raw: JSON.stringify(d),
    ttl: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  };

  // Preserve existing comment/determination
  const existing = await docClient.send(
    new GetCommand({ TableName: GUARDDUTY_TABLE, Key: { pk: item.pk, sk: item.sk } })
  );
  if (existing.Item?.comment) item.comment = existing.Item.comment;
  if (existing.Item?.determination) item.determination = existing.Item.determination;

  await docClient.send(
    new PutCommand({ TableName: GUARDDUTY_TABLE, Item: item })
  );
  console.log(`Stored GuardDuty finding: ${d.accountId} / ${d.id}`);
}

function mapSeverityFromCategory(category) {
  switch (category) {
    case "issue":
      return "HIGH";
    case "scheduledChange":
      return "MEDIUM";
    case "accountNotification":
      return "INFORMATIONAL";
    default:
      return "LOW";
  }
}

async function processHealth(event) {
  const d = event.detail;
  const accountId = d.affectedAccount || event.account;
  const eventArn = d.eventArn;
  const service = eventArn ? eventArn.split("/")[1] : "unknown";
  const description = d.eventDescription?.[0]?.latestDescription || "";

  const item = {
    pk: accountId,
    sk: `EVENT#${eventArn}`,
    findingId: eventArn,
    accountId,
    service,
    eventTypeCode: d.eventTypeCode || "",
    region: d.eventRegion || event.region || "",
    title: d.eventTypeCode || "",
    description,
    statusCode: d.statusCode === "closed" ? "closed" : "open",
    startTime: d.startTime || "",
    lastUpdatedTime: d.lastUpdatedTime || "",
    severity: mapSeverityFromCategory(d.eventTypeCategory),
    raw: JSON.stringify(d),
    ttl: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  };

  // Preserve existing comment/determination
  const existing = await docClient.send(
    new GetCommand({ TableName: HEALTH_TABLE, Key: { pk: item.pk, sk: item.sk } })
  );
  if (existing.Item?.comment) item.comment = existing.Item.comment;
  if (existing.Item?.determination) item.determination = existing.Item.determination;

  await docClient.send(
    new PutCommand({ TableName: HEALTH_TABLE, Item: item })
  );
  console.log(`Stored Health event: ${accountId} / ${eventArn}`);
}
