variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "main_account_id" {
  description = "Main AWS account ID that will assume this role"
  type        = string
}
