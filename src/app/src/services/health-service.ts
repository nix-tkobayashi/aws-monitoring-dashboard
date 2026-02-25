import {
  GetFindingsCommand,
  AwsSecurityFinding,
} from "@aws-sdk/client-securityhub";
import {
  PutCommand,
  QueryCommand,
  ScanCommand,
  GetCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { securityHubClient, docClient } from "./aws-clients";
import { config } from "../config";

const TABLE_NAME = config.dynamodb.healthTable;

/**
 * Parse service name from Health finding ARN.
 * Format: arn:aws:health:REGION:ACCOUNT:event/SERVICE/TYPE_CODE/...
 */
function parseServiceFromArn(arn: string): string {
  const parts = arn.split("/");
  return parts[1] || "unknown";
}

/**
 * Map ASFF RecordState to simple status: ACTIVE → "open", ARCHIVED → "closed"
 */
function mapStatusCode(recordState?: string): string {
  return recordState === "ARCHIVED" ? "closed" : "open";
}

/**
 * Convert a Security Hub ASFF finding to our DynamoDB item schema.
 */
function mapFindingToItem(finding: AwsSecurityFinding) {
  const id = finding.Id!;
  const accountId = finding.AwsAccountId || "unknown";
  const service = parseServiceFromArn(id);
  const startTime =
    finding.ProductFields?.["HealthEventStartTime"] || finding.CreatedAt;

  return {
    pk: accountId,
    sk: `EVENT#${id}`,
    findingId: id,
    accountId,
    service,
    eventTypeCode: finding.GeneratorId || "",
    region: finding.Region || "",
    title: finding.Title || "",
    description: finding.Description || "",
    statusCode: mapStatusCode(finding.RecordState),
    startTime,
    lastUpdatedTime: finding.UpdatedAt,
    severity: finding.Severity?.Label || "",
    workflowStatus: finding.Workflow?.Status || "",
    raw: JSON.stringify(finding),
    ttl: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
  };
}

export async function fetchAndStoreHealthEvents(): Promise<number> {
  let storedCount = 0;
  let nextToken: string | undefined;

  do {
    const result = await securityHubClient.send(
      new GetFindingsCommand({
        Filters: {
          ProductName: [{ Value: "Health", Comparison: "EQUALS" }],
        },
        MaxResults: 100,
        NextToken: nextToken,
      })
    );

    if (result.Findings) {
      for (const finding of result.Findings) {
        if (!finding.Id) continue;

        const item: Record<string, unknown> = mapFindingToItem(finding);

        // Preserve existing comment/determination
        const existing = await docClient.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: { pk: item.pk as string, sk: item.sk as string },
          })
        );
        if (existing.Item?.comment) item.comment = existing.Item.comment;
        if (existing.Item?.determination) item.determination = existing.Item.determination;

        await docClient.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: item,
          })
        );
        storedCount++;
      }
    }

    nextToken = result.NextToken;
  } while (nextToken);

  console.log(`Stored ${storedCount} Health events from Security Hub`);
  return storedCount;
}

export interface HealthEventsQuery {
  accountId?: string;
  service?: string;
  limit?: number;
  nextToken?: string;
}

export async function getHealthEvents(query: HealthEventsQuery) {
  const limit = query.limit || 20;

  if (query.accountId) {
    // Query by accountId (pk)
    const params: Record<string, unknown> = {
      TableName: TABLE_NAME,
      Limit: limit,
      ScanIndexForward: false,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": query.accountId,
        ":prefix": "EVENT#",
      },
    };

    if (query.service) {
      Object.assign(params, {
        FilterExpression: "service = :svc",
      });
      (params.ExpressionAttributeValues as Record<string, string>)[":svc"] =
        query.service;
    }

    if (query.nextToken) {
      Object.assign(params, {
        ExclusiveStartKey: JSON.parse(
          Buffer.from(query.nextToken, "base64").toString()
        ),
      });
    }

    const result = await docClient.send(new QueryCommand(params as never));

    return {
      items: result.Items || [],
      nextToken: result.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString(
            "base64"
          )
        : undefined,
    };
  }

  // Default: query open events via GSI
  const params: Record<string, unknown> = {
    TableName: TABLE_NAME,
    IndexName: "gsi-status",
    Limit: limit,
    ScanIndexForward: false,
    KeyConditionExpression: "statusCode = :status",
    ExpressionAttributeValues: { ":status": "open" },
  };

  if (query.service) {
    Object.assign(params, {
      FilterExpression: "service = :svc",
    });
    (params.ExpressionAttributeValues as Record<string, string>)[":svc"] =
      query.service;
  }

  if (query.nextToken) {
    Object.assign(params, {
      ExclusiveStartKey: JSON.parse(
        Buffer.from(query.nextToken, "base64").toString()
      ),
    });
  }

  const result = await docClient.send(new QueryCommand(params as never));

  return {
    items: result.Items || [],
    nextToken: result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString("base64")
      : undefined,
  };
}

export async function updateHealthEventMeta(
  accountId: string,
  findingId: string,
  comment?: string,
  determination?: string
) {
  const updates: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, string> = {};

  if (comment !== undefined) {
    updates.push("#comment = :c");
    names["#comment"] = "comment";
    values[":c"] = comment;
  }
  if (determination !== undefined) {
    updates.push("determination = :d");
    values[":d"] = determination;
  }
  if (updates.length === 0) return;

  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: accountId, sk: `EVENT#${findingId}` },
      UpdateExpression: `SET ${updates.join(", ")}`,
      ExpressionAttributeNames: Object.keys(names).length > 0 ? names : undefined,
      ExpressionAttributeValues: values,
    })
  );
}

export async function getHealthEventById(accountId: string, findingId: string) {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: accountId,
        sk: `EVENT#${findingId}`,
      },
    })
  );
  return result.Item || null;
}
