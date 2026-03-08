# Lambda Layer with common dependencies
resource "aws_lambda_layer_version" "common" {
  filename            = "${path.module}/../../../lambda/layers/common/layer.zip"
  layer_name          = "${var.project_name}-${var.environment}-common"
  compatible_runtimes = ["nodejs20.x"]
  source_code_hash    = fileexists("${path.module}/../../../lambda/layers/common/layer.zip") ? filebase64sha256("${path.module}/../../../lambda/layers/common/layer.zip") : null

  lifecycle {
    ignore_changes = [source_code_hash]
  }
}

# Local values for function definitions
locals {
  lambda_timeout = 300  # 5 minutes for multi-region queries
  lambda_memory  = 512

  # Define all Lambda functions with their configurations
  functions = {
    # Compute - Read
    "list-ec2"          = { path = "compute/list-ec2", handler = "index.handler" }
    "list-eks-clusters" = { path = "compute/list-eks-clusters", handler = "index.handler" }

    # Compute - Control
    "control-ec2"            = { path = "compute/control-ec2", handler = "index.handler" }
    "control-eks-nodegroup"  = { path = "compute/control-eks-nodegroup", handler = "index.handler" }

    # Databases - Read
    "list-rds"      = { path = "databases/list-rds", handler = "index.handler" }
    "list-redshift" = { path = "databases/list-redshift", handler = "index.handler" }

    # Databases - Control
    "control-rds"      = { path = "databases/control-rds", handler = "index.handler" }
    "control-redshift" = { path = "databases/control-redshift", handler = "index.handler" }

    # Networking - Read
    "list-nat-gateways"  = { path = "networking/list-nat-gateways", handler = "index.handler" }
    "list-elastic-ips"   = { path = "networking/list-elastic-ips", handler = "index.handler" }
    "list-load-balancers" = { path = "networking/list-load-balancers", handler = "index.handler" }

    # Storage - Read
    "list-ebs-volumes" = { path = "storage/list-ebs-volumes", handler = "index.handler" }

    # Automation
    "schedule-processor"        = { path = "automation/schedule-processor", handler = "index.handler" }
    "manage-schedules"          = { path = "automation/manage-schedules", handler = "index.handler" }
    "cost-analyzer"             = { path = "automation/cost-analyzer", handler = "index.handler" }
    "multi-account-aggregator"  = { path = "automation/multi-account-aggregator", handler = "index.handler" }
  }
}

# Create Lambda functions dynamically
resource "aws_lambda_function" "functions" {
  for_each = local.functions

  filename         = "${path.module}/../../../lambda/functions/${each.value.path}/function.zip"
  function_name    = "${var.project_name}-${var.environment}-${each.key}"
  role             = var.lambda_execution_role_arn
  handler          = each.value.handler
  runtime          = "nodejs20.x"
  timeout          = local.lambda_timeout
  memory_size      = local.lambda_memory
  source_code_hash = fileexists("${path.module}/../../../lambda/functions/${each.value.path}/function.zip") ? filebase64sha256("${path.module}/../../../lambda/functions/${each.value.path}/function.zip") : null

  layers = [aws_lambda_layer_version.common.arn]

  environment {
    variables = {
      SNS_TOPIC_ARN        = var.sns_topic_arn
      SCHEDULES_TABLE_NAME = var.schedules_table_name
      ACCOUNTS_TABLE_NAME  = var.accounts_table_name
      NODE_ENV             = var.environment
    }
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-${each.key}"
  }

  lifecycle {
    ignore_changes = [source_code_hash]
  }
}

# CloudWatch Log Groups for Lambda functions
resource "aws_cloudwatch_log_group" "lambda_logs" {
  for_each = local.functions

  name              = "/aws/lambda/${var.project_name}-${var.environment}-${each.key}"
  retention_in_days = 30

  tags = {
    Name = "${var.project_name}-${var.environment}-${each.key}-logs"
  }
}

# EventBridge permission for schedule-processor Lambda
resource "aws_lambda_permission" "eventbridge_invoke_schedule_processor" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.functions["schedule-processor"].function_name
  principal     = "events.amazonaws.com"
  source_arn    = var.event_rule_arn
}

# EventBridge target for schedule-processor
resource "aws_cloudwatch_event_target" "schedule_processor" {
  rule      = basename(var.event_rule_arn)
  target_id = "ScheduleProcessorLambda"
  arn       = aws_lambda_function.functions["schedule-processor"].arn
}

# Output function invoke ARNs for API Gateway
output "function_invoke_arns" {
  value = { for k, v in aws_lambda_function.functions : k => v.invoke_arn }
}

output "function_names" {
  value = { for k, v in aws_lambda_function.functions : k => v.function_name }
}

output "layer_arn" {
  value = aws_lambda_layer_version.common.arn
}
