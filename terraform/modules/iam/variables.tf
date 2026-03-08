variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "aws_regions" {
  description = "List of AWS regions"
  type        = list(string)
}
