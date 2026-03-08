terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_regions[0]  # Primary region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# Cognito User Pool for authentication
module "cognito" {
  source = "./modules/cognito"

  project_name = var.project_name
  environment  = var.environment
}

# IAM roles and policies for Lambda
module "iam" {
  source = "./modules/iam"

  project_name = var.project_name
  environment  = var.environment
  aws_regions  = var.aws_regions
}

# DynamoDB tables for schedules and account configuration
module "dynamodb" {
  source = "./modules/dynamodb"

  project_name = var.project_name
  environment  = var.environment
}

# SNS topic for email notifications
module "sns" {
  source = "./modules/sns"

  project_name  = var.project_name
  environment   = var.environment
  admin_email   = var.admin_email
}

# EventBridge rules for scheduled processing
module "eventbridge" {
  source = "./modules/eventbridge"

  project_name = var.project_name
  environment  = var.environment
}

# Lambda functions and layer
module "lambda" {
  source = "./modules/lambda"

  project_name              = var.project_name
  environment               = var.environment
  lambda_execution_role_arn = module.iam.lambda_execution_role_arn
  sns_topic_arn             = module.sns.resource_notifications_topic_arn
  schedules_table_name      = module.dynamodb.schedules_table_name
  accounts_table_name       = module.dynamodb.accounts_table_name
  event_rule_arn            = module.eventbridge.schedule_processor_rule_arn
}

# API Gateway REST API
module "api_gateway" {
  source = "./modules/api-gateway"

  project_name                  = var.project_name
  environment                   = var.environment
  cognito_user_pool_arn         = module.cognito.user_pool_arn
  lambda_function_invoke_arns   = module.lambda.function_invoke_arns
  lambda_function_names         = module.lambda.function_names
}

# AWS Amplify hosting
module "amplify" {
  source = "./modules/amplify"

  project_name           = var.project_name
  environment            = var.environment
  github_repo            = var.github_repo
  github_token           = var.github_token
  cognito_user_pool_id   = module.cognito.user_pool_id
  cognito_client_id      = module.cognito.user_pool_client_id
  api_gateway_url        = module.api_gateway.api_url
}

# Multi-account cross-account roles
module "multi_account" {
  source = "./modules/multi-account"

  project_name     = var.project_name
  environment      = var.environment
  main_account_id  = var.main_account_id
}
