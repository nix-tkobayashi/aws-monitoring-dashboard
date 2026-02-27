# ECS Express Mode - Infrastructure IAM Role
data "aws_iam_policy" "ecs_infrastructure_express" {
  name = "AmazonECSInfrastructureRoleforExpressGatewayServices"
}

resource "aws_iam_role" "ecs_infrastructure" {
  name = "${var.app_name}-ecs-infrastructure"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "AllowAccessToECSForInfrastructureManagement"
      Effect = "Allow"
      Principal = {
        Service = "ecs.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_infrastructure" {
  role       = aws_iam_role.ecs_infrastructure.name
  policy_arn = data.aws_iam_policy.ecs_infrastructure_express.arn
}

# ECS Express Gateway Service
resource "aws_ecs_express_gateway_service" "app" {
  service_name            = "${var.app_name}-svc"
  cluster                 = aws_ecs_cluster.main.name
  execution_role_arn      = aws_iam_role.ecs_execution.arn
  infrastructure_role_arn = aws_iam_role.ecs_infrastructure.arn
  task_role_arn           = aws_iam_role.ecs_task.arn

  cpu    = tostring(var.app_cpu)
  memory = tostring(var.app_memory)

  health_check_path = "/healthz"

  primary_container {
    image          = "${aws_ecr_repository.app.repository_url}:latest"
    container_port = var.app_port

    environment {
      name  = "AWS_REGION"
      value = var.aws_region
    }

    environment {
      name  = "BASIC_AUTH_PASS"
      value = var.basic_auth_pass
    }

    environment {
      name  = "BASIC_AUTH_USER"
      value = var.basic_auth_user
    }

    environment {
      name  = "DYNAMODB_GUARDDUTY_TABLE"
      value = aws_dynamodb_table.guardduty_findings.name
    }

    environment {
      name  = "DYNAMODB_HEALTH_TABLE"
      value = aws_dynamodb_table.health_events.name
    }

    environment {
      name  = "GUARDDUTY_REGIONS"
      value = join(",", var.guardduty_regions)
    }

    environment {
      name  = "PORT"
      value = tostring(var.app_port)
    }

    environment {
      name  = "SECURITY_HUB_REGION"
      value = var.security_hub_region
    }

    aws_logs_configuration {
      log_group         = aws_cloudwatch_log_group.app.name
      log_stream_prefix = "ecs/"
    }
  }

  network_configuration {
    subnets = var.subnet_ids
  }

  scaling_target {
    min_task_count            = 1
    max_task_count            = 3
    auto_scaling_metric       = "AVERAGE_CPU"
    auto_scaling_target_value = 80
  }

  wait_for_steady_state = true

  lifecycle {
    ignore_changes = [
      network_configuration,
      # Workaround: AWS provider returns environment blocks in inconsistent
      # order, causing perpetual phantom diffs.  Actual env vars are set
      # correctly on the ECS service.  When adding/changing env vars, remove
      # this line temporarily, apply, then restore it.
      primary_container[0].environment,
    ]
  }
}
