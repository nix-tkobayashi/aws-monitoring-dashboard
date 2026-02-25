import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { GuardDutyClient } from "@aws-sdk/client-guardduty";
import { SecurityHubClient } from "@aws-sdk/client-securityhub";
import { OrganizationsClient } from "@aws-sdk/client-organizations";
import { config } from "../config";

const dynamoDBClient = new DynamoDBClient({ region: config.aws.region });
export const docClient = DynamoDBDocumentClient.from(dynamoDBClient);

export const guarddutyClient = new GuardDutyClient({
  region: config.aws.region,
});

// Security Hub aggregation region
export const securityHubClient = new SecurityHubClient({
  region: "ap-northeast-1",
});

// Organizations (global service, us-east-1)
export const organizationsClient = new OrganizationsClient({
  region: "us-east-1",
});
