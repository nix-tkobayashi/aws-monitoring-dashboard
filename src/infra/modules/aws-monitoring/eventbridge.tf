# =============================================================================
# EventBridge → Lambda → DynamoDB (Health + GuardDuty event capture)
# =============================================================================

data "aws_caller_identity" "current" {}

data "archive_file" "lambda" {
  type        = "zip"
  source_file = "${path.module}/src/lambda/index.mjs"
  output_path = "${path.module}/dist/lambda.zip"
}

# -----------------------------------------------------------------------------
# IAM: EventBridge cross-region forwarding role
# -----------------------------------------------------------------------------

resource "aws_iam_role" "eventbridge_forwarder" {
  name = "${var.app_name}-eventbridge-forwarder"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "events.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "eventbridge_forwarder" {
  name = "put-events"
  role = aws_iam_role.eventbridge_forwarder.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "events:PutEvents"
      Resource = "arn:aws:events:us-east-1:${data.aws_caller_identity.current.account_id}:event-bus/default"
    }]
  })
}

# -----------------------------------------------------------------------------
# IAM: Lambda execution role
# -----------------------------------------------------------------------------

resource "aws_iam_role" "lambda_execution" {
  name = "${var.app_name}-event-processor"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "lambda_execution" {
  name = "lambda-execution"
  role = aws_iam_role.lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
        ]
        Resource = [
          aws_dynamodb_table.guardduty_findings.arn,
          aws_dynamodb_table.health_events.arn,
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "${aws_cloudwatch_log_group.lambda.arn}:*"
      }
    ]
  })
}

# -----------------------------------------------------------------------------
# Lambda: Event Processor
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.app_name}-event-processor"
  retention_in_days = 30
}

resource "aws_lambda_function" "event_processor" {
  function_name    = "${var.app_name}-event-processor"
  runtime          = "nodejs22.x"
  handler          = "index.handler"
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  role             = aws_iam_role.lambda_execution.arn
  memory_size      = 128
  timeout          = 30

  environment {
    variables = {
      DYNAMODB_GUARDDUTY_TABLE = aws_dynamodb_table.guardduty_findings.name
      DYNAMODB_HEALTH_TABLE    = aws_dynamodb_table.health_events.name
    }
  }

  depends_on = [aws_cloudwatch_log_group.lambda]
}

resource "aws_lambda_permission" "eventbridge_invoke" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.event_processor.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.event_processor.arn
}

# -----------------------------------------------------------------------------
# us-east-1: EventBridge rule — GuardDuty + Health → Lambda
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_event_rule" "event_processor" {
  name        = "${var.app_name}-event-processor"
  description = "Route GuardDuty and Health events to Lambda"

  event_pattern = jsonencode({
    source      = ["aws.guardduty", "aws.health"]
    detail-type = ["GuardDuty Finding", "AWS Health Event"]
  })
}

resource "aws_cloudwatch_event_target" "lambda" {
  rule = aws_cloudwatch_event_rule.event_processor.name
  arn  = aws_lambda_function.event_processor.arn
}

# -----------------------------------------------------------------------------
# us-west-2: Forward Health events → us-east-1 default bus
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_event_rule" "health_forwarder" {
  provider    = aws.uswest2
  name        = "${var.app_name}-health-forwarder"
  description = "Forward Health events to us-east-1"

  event_pattern = jsonencode({
    source      = ["aws.health"]
    detail-type = ["AWS Health Event"]
  })
}

resource "aws_cloudwatch_event_target" "health_forward" {
  provider = aws.uswest2
  rule     = aws_cloudwatch_event_rule.health_forwarder.name
  arn      = "arn:aws:events:us-east-1:${data.aws_caller_identity.current.account_id}:event-bus/default"
  role_arn = aws_iam_role.eventbridge_forwarder.arn
}

# -----------------------------------------------------------------------------
# ap-northeast-1: Forward GuardDuty events → us-east-1 default bus
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_event_rule" "guardduty_forwarder" {
  provider    = aws.apne1
  name        = "${var.app_name}-guardduty-forwarder"
  description = "Forward GuardDuty events to us-east-1"

  event_pattern = jsonencode({
    source      = ["aws.guardduty"]
    detail-type = ["GuardDuty Finding"]
  })
}

resource "aws_cloudwatch_event_target" "guardduty_forward" {
  provider = aws.apne1
  rule     = aws_cloudwatch_event_rule.guardduty_forwarder.name
  arn      = "arn:aws:events:us-east-1:${data.aws_caller_identity.current.account_id}:event-bus/default"
  role_arn = aws_iam_role.eventbridge_forwarder.arn
}
