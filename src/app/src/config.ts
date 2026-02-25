export const config = {
  aws: {
    region: process.env.AWS_REGION || "us-east-1",
    // GuardDuty scan target regions (comma-separated)
    guarddutyRegions: (
      process.env.GUARDDUTY_REGIONS || "ap-northeast-1,us-east-1"
    ).split(","),
  },
  dynamodb: {
    guarddutyTable:
      process.env.DYNAMODB_GUARDDUTY_TABLE || "aws-monitoring-guardduty-findings",
    healthTable: process.env.DYNAMODB_HEALTH_TABLE || "aws-monitoring-health-events",
  },
  basicAuth: {
    user: process.env.BASIC_AUTH_USER || "",
    pass: process.env.BASIC_AUTH_PASS || "",
  },
};
