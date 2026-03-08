variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "awsnoozr"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "prod"
}

variable "aws_regions" {
  description = "List of AWS regions to monitor"
  type        = list(string)
  default     = ["us-east-1", "us-west-2", "eu-west-1"]
}

variable "github_repo" {
  description = "GitHub repository URL for Amplify"
  type        = string
}

variable "github_token" {
  description = "GitHub personal access token for Amplify"
  type        = string
  sensitive   = true
}

variable "admin_email" {
  description = "Admin email for SNS notifications"
  type        = string
}

variable "main_account_id" {
  description = "Main AWS account ID for cross-account access"
  type        = string
}
