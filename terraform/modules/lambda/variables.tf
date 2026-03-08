variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "lambda_execution_role_arn" {
  description = "IAM role ARN for Lambda execution"
  type        = string
}

variable "sns_topic_arn" {
  description = "SNS topic ARN for notifications"
  type        = string
}

variable "schedules_table_name" {
  description = "DynamoDB schedules table name"
  type        = string
}

variable "accounts_table_name" {
  description = "DynamoDB accounts table name"
  type        = string
}

variable "event_rule_arn" {
  description = "EventBridge rule ARN for schedule processor"
  type        = string
}
