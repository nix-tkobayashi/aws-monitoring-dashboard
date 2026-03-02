variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "prod"
}

variable "app_name" {
  description = "Application name"
  type        = string
  default     = "aws-monitoring"
}

variable "app_port" {
  description = "Application port"
  type        = number
  default     = 3000
}

variable "app_cpu" {
  description = "Fargate task CPU units"
  type        = number
  default     = 256
}

variable "app_memory" {
  description = "Fargate task memory (MiB)"
  type        = number
  default     = 512
}

variable "vpc_id" {
  description = "Existing VPC ID"
  type        = string
}

variable "guardduty_regions" {
  description = "Regions to scan for GuardDuty findings"
  type        = list(string)
  default     = ["ap-northeast-1", "us-east-1", "us-west-2"]
}

variable "subnet_ids" {
  description = "Existing subnet IDs (at least 2 in different AZs)"
  type        = list(string)
}

variable "security_hub_region" {
  description = "Security Hub aggregation region"
  type        = string
  default     = "ap-northeast-1"
}

variable "github_org" {
  description = "GitHub organization name for OIDC (empty = skip OIDC resources)"
  type        = string
  default     = ""
}

variable "github_repo" {
  description = "GitHub repository name for OIDC (empty = skip OIDC resources)"
  type        = string
  default     = ""
}
