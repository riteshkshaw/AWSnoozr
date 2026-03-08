variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "cognito_user_pool_arn" {
  description = "Cognito User Pool ARN for API authorization"
  type        = string
}

variable "lambda_function_invoke_arns" {
  description = "Map of Lambda function invoke ARNs"
  type        = map(string)
}

variable "lambda_function_names" {
  description = "Map of Lambda function names"
  type        = map(string)
}
