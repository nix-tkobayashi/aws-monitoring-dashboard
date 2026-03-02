terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.28"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }
}

# ---------------------------------------------------------------------------
# Providers
# ---------------------------------------------------------------------------

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "aws-monitoring"
      ManagedBy   = "terraform"
      Environment = var.environment
    }
  }
}

provider "aws" {
  alias  = "uswest2"
  region = "us-west-2"

  default_tags {
    tags = {
      Project     = "aws-monitoring"
      ManagedBy   = "terraform"
      Environment = var.environment
    }
  }
}

provider "aws" {
  alias  = "apne1"
  region = "ap-northeast-1"

  default_tags {
    tags = {
      Project     = "aws-monitoring"
      ManagedBy   = "terraform"
      Environment = var.environment
    }
  }
}

# ---------------------------------------------------------------------------
# Module
# ---------------------------------------------------------------------------

module "aws_monitoring" {
  source = "../../modules/aws-monitoring"

  providers = {
    aws         = aws
    aws.uswest2 = aws.uswest2
    aws.apne1   = aws.apne1
  }

  aws_region        = var.aws_region
  environment       = var.environment
  app_name          = var.app_name
  app_port          = var.app_port
  app_cpu           = var.app_cpu
  app_memory        = var.app_memory
  vpc_id            = var.vpc_id
  guardduty_regions = var.guardduty_regions
  subnet_ids        = var.subnet_ids
  security_hub_region = var.security_hub_region
}

# ---------------------------------------------------------------------------
# Moved blocks — migrate flat state → module addresses
# ---------------------------------------------------------------------------

moved {
  from = aws_ecr_repository.app
  to   = module.aws_monitoring.aws_ecr_repository.app
}

moved {
  from = aws_cloudwatch_log_group.app
  to   = module.aws_monitoring.aws_cloudwatch_log_group.app
}

moved {
  from = aws_ecs_cluster.main
  to   = module.aws_monitoring.aws_ecs_cluster.main
}

moved {
  from = aws_iam_role.ecs_infrastructure
  to   = module.aws_monitoring.aws_iam_role.ecs_infrastructure
}

moved {
  from = aws_iam_role_policy_attachment.ecs_infrastructure
  to   = module.aws_monitoring.aws_iam_role_policy_attachment.ecs_infrastructure
}

moved {
  from = aws_ecs_express_gateway_service.app
  to   = module.aws_monitoring.aws_ecs_express_gateway_service.app
}

moved {
  from = aws_dynamodb_table.guardduty_findings
  to   = module.aws_monitoring.aws_dynamodb_table.guardduty_findings
}

moved {
  from = aws_dynamodb_table.health_events
  to   = module.aws_monitoring.aws_dynamodb_table.health_events
}

moved {
  from = aws_iam_role.ecs_execution
  to   = module.aws_monitoring.aws_iam_role.ecs_execution
}

moved {
  from = aws_iam_role_policy_attachment.ecs_execution
  to   = module.aws_monitoring.aws_iam_role_policy_attachment.ecs_execution
}

moved {
  from = aws_iam_role.ecs_task
  to   = module.aws_monitoring.aws_iam_role.ecs_task
}

moved {
  from = aws_iam_policy.ecs_task
  to   = module.aws_monitoring.aws_iam_policy.ecs_task
}

moved {
  from = aws_iam_role_policy_attachment.ecs_task
  to   = module.aws_monitoring.aws_iam_role_policy_attachment.ecs_task
}

moved {
  from = aws_iam_role.eventbridge_forwarder
  to   = module.aws_monitoring.aws_iam_role.eventbridge_forwarder
}

moved {
  from = aws_iam_role_policy.eventbridge_forwarder
  to   = module.aws_monitoring.aws_iam_role_policy.eventbridge_forwarder
}

moved {
  from = aws_iam_role.lambda_execution
  to   = module.aws_monitoring.aws_iam_role.lambda_execution
}

moved {
  from = aws_iam_role_policy.lambda_execution
  to   = module.aws_monitoring.aws_iam_role_policy.lambda_execution
}

moved {
  from = aws_cloudwatch_log_group.lambda
  to   = module.aws_monitoring.aws_cloudwatch_log_group.lambda
}

moved {
  from = aws_lambda_function.event_processor
  to   = module.aws_monitoring.aws_lambda_function.event_processor
}

moved {
  from = aws_lambda_permission.eventbridge_invoke
  to   = module.aws_monitoring.aws_lambda_permission.eventbridge_invoke
}

moved {
  from = aws_cloudwatch_event_rule.event_processor
  to   = module.aws_monitoring.aws_cloudwatch_event_rule.event_processor
}

moved {
  from = aws_cloudwatch_event_target.lambda
  to   = module.aws_monitoring.aws_cloudwatch_event_target.lambda
}

moved {
  from = aws_cloudwatch_event_rule.health_forwarder
  to   = module.aws_monitoring.aws_cloudwatch_event_rule.health_forwarder
}

moved {
  from = aws_cloudwatch_event_target.health_forward
  to   = module.aws_monitoring.aws_cloudwatch_event_target.health_forward
}

moved {
  from = aws_cloudwatch_event_rule.guardduty_forwarder
  to   = module.aws_monitoring.aws_cloudwatch_event_rule.guardduty_forwarder
}

moved {
  from = aws_cloudwatch_event_target.guardduty_forward
  to   = module.aws_monitoring.aws_cloudwatch_event_target.guardduty_forward
}
