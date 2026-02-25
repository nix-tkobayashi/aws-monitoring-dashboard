# GuardDuty Findings Table
resource "aws_dynamodb_table" "guardduty_findings" {
  name         = "${var.app_name}-guardduty-findings"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  attribute {
    name = "type"
    type = "S"
  }

  attribute {
    name = "severity"
    type = "N"
  }

  # GSI: Query by finding type and severity
  global_secondary_index {
    name            = "gsi-type-severity"
    hash_key        = "type"
    range_key       = "severity"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }
}

# Health Dashboard Events Table
resource "aws_dynamodb_table" "health_events" {
  name         = "${var.app_name}-health-events"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  attribute {
    name = "statusCode"
    type = "S"
  }

  attribute {
    name = "startTime"
    type = "S"
  }

  # GSI: Query by status
  global_secondary_index {
    name            = "gsi-status"
    hash_key        = "statusCode"
    range_key       = "startTime"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }
}
