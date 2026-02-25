output "service_url" {
  description = "Express Mode service URL (HTTPS)"
  value       = aws_ecs_express_gateway_service.app.ingress_paths
}

output "ecr_repository_url" {
  description = "ECR repository URL"
  value       = aws_ecr_repository.app.repository_url
}

output "guardduty_table_name" {
  description = "DynamoDB GuardDuty findings table name"
  value       = aws_dynamodb_table.guardduty_findings.name
}

output "health_table_name" {
  description = "DynamoDB Health events table name"
  value       = aws_dynamodb_table.health_events.name
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "ECS Express Mode service name"
  value       = aws_ecs_express_gateway_service.app.service_name
}

output "lambda_function_name" {
  description = "Event processor Lambda function name"
  value       = aws_lambda_function.event_processor.function_name
}

output "lambda_function_arn" {
  description = "Event processor Lambda function ARN"
  value       = aws_lambda_function.event_processor.arn
}

output "ecr_registry" {
  description = "ECR registry URL (account-level)"
  value       = split("/", aws_ecr_repository.app.repository_url)[0]
}

output "aws_account_id" {
  description = "AWS account ID"
  value       = data.aws_caller_identity.current.account_id
}
