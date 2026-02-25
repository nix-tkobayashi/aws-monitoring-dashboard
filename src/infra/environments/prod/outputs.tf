output "service_url" {
  description = "Express Mode service URL (HTTPS)"
  value       = module.aws_monitoring.service_url
}

output "ecr_repository_url" {
  description = "ECR repository URL"
  value       = module.aws_monitoring.ecr_repository_url
}

output "guardduty_table_name" {
  description = "DynamoDB GuardDuty findings table name"
  value       = module.aws_monitoring.guardduty_table_name
}

output "health_table_name" {
  description = "DynamoDB Health events table name"
  value       = module.aws_monitoring.health_table_name
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = module.aws_monitoring.ecs_cluster_name
}

output "ecs_service_name" {
  description = "ECS Express Mode service name"
  value       = module.aws_monitoring.ecs_service_name
}

output "lambda_function_name" {
  description = "Event processor Lambda function name"
  value       = module.aws_monitoring.lambda_function_name
}

output "lambda_function_arn" {
  description = "Event processor Lambda function ARN"
  value       = module.aws_monitoring.lambda_function_arn
}

output "ecr_registry" {
  description = "ECR registry URL (account-level)"
  value       = module.aws_monitoring.ecr_registry
}

output "aws_account_id" {
  description = "AWS account ID"
  value       = module.aws_monitoring.aws_account_id
}

output "github_actions_role_arn" {
  description = "GitHub Actions OIDC IAM Role ARN"
  value       = var.github_org != "" ? aws_iam_role.github_actions[0].arn : null
}
