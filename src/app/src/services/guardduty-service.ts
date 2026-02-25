import {
  GuardDutyClient,
  ListDetectorsCommand,
  ListFindingsCommand,
  GetFindingsCommand,
  Finding,
} from "@aws-sdk/client-guardduty";
import {
  PutCommand,
  QueryCommand,
  GetCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { docClient } from "./aws-clients";
import { config } from "../config";

const TABLE_NAME = config.dynamodb.guarddutyTable;

/**
 * Fetch findings from all configured regions and store in DynamoDB.
 * Supports management account aggregation (member account findings are included).
 */
export async function fetchAndStoreFindings(): Promise<number> {
  let totalStored = 0;

  for (const region of config.aws.guarddutyRegions) {
    try {
      const count = await fetchAndStoreFindingsForRegion(region.trim());
      totalStored += count;
    } catch (err) {
      console.error(`Error fetching GuardDuty findings in ${region}:`, err);
    }
  }

  console.log(
    `Stored ${totalStored} GuardDuty findings total across ${config.aws.guarddutyRegions.length} regions`
  );
  return totalStored;
}

async function fetchAndStoreFindingsForRegion(
  region: string
): Promise<number> {
  const client = new GuardDutyClient({ region });

  const detectors = await client.send(new ListDetectorsCommand({}));
  if (!detectors.DetectorIds || detectors.DetectorIds.length === 0) {
    console.log(`No GuardDuty detectors found in ${region}`);
    return 0;
  }

  const detectorId = detectors.DetectorIds[0];
  let storedCount = 0;
  let nextToken: string | undefined;

  do {
    const listResult = await client.send(
      new ListFindingsCommand({
        DetectorId: detectorId,
        NextToken: nextToken,
        MaxResults: 50,
      })
    );

    if (listResult.FindingIds && listResult.FindingIds.length > 0) {
      const getResult = await client.send(
        new GetFindingsCommand({
          DetectorId: detectorId,
          FindingIds: listResult.FindingIds,
        })
      );

      if (getResult.Findings) {
        for (const finding of getResult.Findings) {
          await storeFinding(finding);
          storedCount++;
        }
      }
    }

    nextToken = listResult.NextToken;
  } while (nextToken);

  console.log(`Stored ${storedCount} GuardDuty findings from ${region}`);
  return storedCount;
}

async function storeFinding(finding: Finding): Promise<void> {
  const pk = finding.AccountId || "unknown";
  const sk = `FINDING#${finding.Id}`;

  // Preserve existing comment/determination
  const existing = await docClient.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { pk, sk } })
  );

  const item: Record<string, unknown> = {
    pk,
    sk,
    findingId: finding.Id,
    accountId: finding.AccountId,
    region: finding.Region,
    type: finding.Type,
    title: finding.Title,
    description: finding.Description,
    severity: finding.Severity,
    confidence: finding.Confidence,
    createdAt: finding.CreatedAt,
    updatedAt: finding.UpdatedAt,
    archived: finding.Service?.Archived || false,
    resource: JSON.stringify(finding.Resource),
    service: JSON.stringify(finding.Service),
    raw: JSON.stringify(finding),
    ttl: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60, // 1 year TTL
  };

  if (existing.Item?.comment) item.comment = existing.Item.comment;
  if (existing.Item?.determination) item.determination = existing.Item.determination;

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    })
  );
}

export interface FindingsQuery {
  accountId?: string;
  severity?: number;
  limit?: number;
  nextToken?: string;
}

export async function getFindings(query: FindingsQuery) {
  const limit = query.limit || 50;

  if (query.accountId) {
    const params = {
      TableName: TABLE_NAME,
      Limit: limit,
      ScanIndexForward: false,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": query.accountId,
        ":prefix": "FINDING#",
      },
      ExclusiveStartKey: query.nextToken
        ? JSON.parse(Buffer.from(query.nextToken, "base64").toString())
        : undefined,
    };

    const result = await docClient.send(new QueryCommand(params));
    return {
      items: result.Items || [],
      nextToken: result.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString(
            "base64"
          )
        : undefined,
    };
  }

  // Scan all findings (no partition key filter)
  const params = {
    TableName: TABLE_NAME,
    Limit: limit,
    ExclusiveStartKey: query.nextToken
      ? JSON.parse(Buffer.from(query.nextToken, "base64").toString())
      : undefined,
  };

  const result = await docClient.send(new ScanCommand(params));
  return {
    items: result.Items || [],
    nextToken: result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString("base64")
      : undefined,
  };
}

export async function updateFindingMeta(
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
      Key: { pk: accountId, sk: `FINDING#${findingId}` },
      UpdateExpression: `SET ${updates.join(", ")}`,
      ExpressionAttributeNames: Object.keys(names).length > 0 ? names : undefined,
      ExpressionAttributeValues: values,
    })
  );
}

export async function getFindingById(accountId: string, findingId: string) {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: accountId,
        sk: `FINDING#${findingId}`,
      },
    })
  );
  return result.Item || null;
}
