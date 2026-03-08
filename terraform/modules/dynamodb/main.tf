resource "aws_dynamodb_table" "schedules" {
  name           = "${var.project_name}-${var.environment}-schedules"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "resourceId"
  range_key      = "scheduleType"

  attribute {
    name = "resourceId"
    type = "S"
  }

  attribute {
    name = "scheduleType"
    type = "S"
  }

  attribute {
    name = "enabled"
    type = "N"
  }

  global_secondary_index {
    name            = "EnabledSchedulesIndex"
    hash_key        = "enabled"
    range_key       = "scheduleType"
    projection_type = "ALL"
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-schedules"
  }
}

resource "aws_dynamodb_table" "accounts" {
  name         = "${var.project_name}-${var.environment}-accounts"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "accountId"

  attribute {
    name = "accountId"
    type = "S"
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-accounts"
  }
}

resource "aws_dynamodb_table" "budgets" {
  name         = "${var.project_name}-${var.environment}-budgets"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "budgetId"

  attribute {
    name = "budgetId"
    type = "S"
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-budgets"
  }
}

resource "aws_dynamodb_table" "tag_index" {
  name         = "${var.project_name}-${var.environment}-tag-index"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "tagKey"
  range_key    = "tagValue"

  attribute {
    name = "tagKey"
    type = "S"
  }

  attribute {
    name = "tagValue"
    type = "S"
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-tag-index"
  }
}

output "schedules_table_name" {
  value = aws_dynamodb_table.schedules.name
}

output "schedules_table_arn" {
  value = aws_dynamodb_table.schedules.arn
}

output "accounts_table_name" {
  value = aws_dynamodb_table.accounts.name
}

output "accounts_table_arn" {
  value = aws_dynamodb_table.accounts.arn
}

output "budgets_table_name" {
  value = aws_dynamodb_table.budgets.name
}

output "budgets_table_arn" {
  value = aws_dynamodb_table.budgets.arn
}

output "tag_index_table_name" {
  value = aws_dynamodb_table.tag_index.name
}

output "tag_index_table_arn" {
  value = aws_dynamodb_table.tag_index.arn
}
