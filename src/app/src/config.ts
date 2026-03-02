import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

export const config = {
  aws: {
    region: process.env.AWS_REGION || "us-east-1",
    // GuardDuty scan target regions (comma-separated)
    guarddutyRegions: (
      process.env.GUARDDUTY_REGIONS || "ap-northeast-1,us-east-1"
    ).split(","),
    securityHubRegion:
      process.env.SECURITY_HUB_REGION || "us-west-2",
  },
  dynamodb: {
    guarddutyTable:
      process.env.DYNAMODB_GUARDDUTY_TABLE || "aws-monitoring-guardduty-findings",
    healthTable: process.env.DYNAMODB_HEALTH_TABLE || "aws-monitoring-health-events",
  },
  basicAuth: {
    secretName: process.env.BASIC_AUTH_SECRET_NAME || "",
  },
};

export async function loadBasicAuthFromSecret(): Promise<{
  username: string;
  password: string;
} | null> {
  const secretName = config.basicAuth.secretName;
  if (!secretName) {
    return null;
  }

  const client = new SecretsManagerClient({ region: config.aws.region });
  const resp = await client.send(
    new GetSecretValueCommand({ SecretId: secretName })
  );

  if (!resp.SecretString) {
    throw new Error(`Secret "${secretName}" has no value. Set it via AWS CLI or Console.`);
  }

  const parsed = JSON.parse(resp.SecretString) as {
    username?: string;
    password?: string;
  };

  if (!parsed.username || !parsed.password) {
    throw new Error(
      `Secret "${secretName}" is missing "username" or "password" field.`
    );
  }

  return { username: parsed.username, password: parsed.password };
}
