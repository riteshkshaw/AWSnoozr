output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = module.cognito.user_pool_id
}

output "cognito_user_pool_client_id" {
  description = "Cognito User Pool Client ID"
  value       = module.cognito.user_pool_client_id
}

output "cognito_domain" {
  description = "Cognito hosted UI domain"
  value       = module.cognito.domain
}

output "api_gateway_url" {
  description = "API Gateway invoke URL"
  value       = module.api_gateway.api_url
}

output "amplify_app_url" {
  description = "Amplify application URL"
  value       = module.amplify.default_domain
}

output "lambda_execution_role_arn" {
  description = "Lambda execution role ARN for EKS RBAC configuration"
  value       = module.iam.lambda_execution_role_arn
}

output "sns_topic_arn" {
  description = "SNS topic ARN for notifications"
  value       = module.sns.resource_notifications_topic_arn
}

output "schedules_table_name" {
  description = "DynamoDB schedules table name"
  value       = module.dynamodb.schedules_table_name
}

output "accounts_table_name" {
  description = "DynamoDB accounts table name"
  value       = module.dynamodb.accounts_table_name
}
