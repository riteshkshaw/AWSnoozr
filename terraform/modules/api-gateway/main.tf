# IAM role for API Gateway to write CloudWatch Logs
resource "aws_iam_role" "api_gateway_cloudwatch" {
  name = "${var.project_name}-${var.environment}-api-gateway-cloudwatch"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "apigateway.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "api_gateway_cloudwatch" {
  role       = aws_iam_role.api_gateway_cloudwatch.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs"
}

resource "aws_api_gateway_account" "main" {
  cloudwatch_role_arn = aws_iam_role.api_gateway_cloudwatch.arn
}

resource "aws_api_gateway_rest_api" "main" {
  name        = "${var.project_name}-${var.environment}-api"
  description = "AWSnoozr API for AWS resource management"

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-api"
  }

  depends_on = [aws_api_gateway_account.main]
}

# Cognito Authorizer
resource "aws_api_gateway_authorizer" "cognito" {
  name            = "${var.project_name}-${var.environment}-cognito-authorizer"
  rest_api_id     = aws_api_gateway_rest_api.main.id
  type            = "COGNITO_USER_POOLS"
  provider_arns   = [var.cognito_user_pool_arn]
  identity_source = "method.request.header.Authorization"
}

# Resources and methods configuration
locals {
  # Define root-level API resources
  root_resources = {
    "compute"   = {}
    "databases" = {}
    "networking" = {}
    "storage"   = {}
    "schedules" = {}
    "costs"     = {}
    "accounts"  = {}
  }

  # Define child API resources
  child_resources = {
    "compute_ec2"              = { parent = "compute", path_part = "ec2" }
    "compute_eks"              = { parent = "compute", path_part = "eks" }
    "databases_rds"            = { parent = "databases", path_part = "rds" }
    "databases_redshift"       = { parent = "databases", path_part = "redshift" }
    "networking_nat"           = { parent = "networking", path_part = "nat-gateways" }
    "networking_eips"          = { parent = "networking", path_part = "elastic-ips" }
    "networking_loadbalancers" = { parent = "networking", path_part = "load-balancers" }
    "storage_ebs"              = { parent = "storage", path_part = "ebs" }
    "costs_summary"            = { parent = "costs", path_part = "summary" }
    "costs_trend"              = { parent = "costs", path_part = "trend" }
    "accounts_resources"       = { parent = "accounts", path_part = "resources" }
  }

  # Define GET methods for read operations
  get_methods = {
    "compute_ec2"                 = { lambda = "list-ec2" }
    "compute_eks"                 = { lambda = "list-eks-clusters" }
    "databases_rds"               = { lambda = "list-rds" }
    "databases_redshift"          = { lambda = "list-redshift" }
    "networking_nat"              = { lambda = "list-nat-gateways" }
    "networking_eips"             = { lambda = "list-elastic-ips" }
    "networking_loadbalancers"    = { lambda = "list-load-balancers" }
    "storage_ebs"                 = { lambda = "list-ebs-volumes" }
    "schedules"                   = { lambda = "manage-schedules" }
    "costs_summary"               = { lambda = "cost-analyzer" }
    "costs_trend"                 = { lambda = "cost-analyzer" }
    "accounts"                    = { lambda = "multi-account-aggregator" }
    "accounts_resources"          = { lambda = "multi-account-aggregator" }
  }

  # Define POST/PUT/DELETE methods for schedules
  schedule_methods = {
    POST   = { lambda = "manage-schedules" }
    PUT    = { lambda = "manage-schedules" }
    DELETE = { lambda = "manage-schedules" }
  }
}

# Create root-level API Gateway resources
resource "aws_api_gateway_resource" "root_resources" {
  for_each = local.root_resources

  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = each.key
}

# Create child API Gateway resources
resource "aws_api_gateway_resource" "child_resources" {
  for_each = local.child_resources

  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.root_resources[each.value.parent].id
  path_part   = each.value.path_part

  depends_on = [aws_api_gateway_resource.root_resources]
}

# Create GET methods
resource "aws_api_gateway_method" "get_methods" {
  for_each = local.get_methods

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = contains(keys(local.root_resources), each.key) ? aws_api_gateway_resource.root_resources[each.key].id : aws_api_gateway_resource.child_resources[each.key].id
  http_method   = "GET"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id

  request_parameters = {
    "method.request.querystring.region" = false
  }
}

# Create Lambda integrations for GET methods
resource "aws_api_gateway_integration" "get_integrations" {
  for_each = local.get_methods

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = contains(keys(local.root_resources), each.key) ? aws_api_gateway_resource.root_resources[each.key].id : aws_api_gateway_resource.child_resources[each.key].id
  http_method             = aws_api_gateway_method.get_methods[each.key].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_function_invoke_arns[each.value.lambda]
}

# Lambda permissions for API Gateway
resource "aws_lambda_permission" "api_gateway_invoke" {
  for_each = local.get_methods

  statement_id  = "AllowAPIGatewayInvoke-${each.key}"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_function_names[each.value.lambda]
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

# Schedule management methods (POST, PUT, DELETE)
resource "aws_api_gateway_method" "schedule_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.root_resources["schedules"].id
  http_method   = "POST"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

resource "aws_api_gateway_integration" "schedule_post" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.root_resources["schedules"].id
  http_method             = aws_api_gateway_method.schedule_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_function_invoke_arns["manage-schedules"]
}

resource "aws_api_gateway_method" "schedule_put" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.root_resources["schedules"].id
  http_method   = "PUT"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

resource "aws_api_gateway_integration" "schedule_put" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.root_resources["schedules"].id
  http_method             = aws_api_gateway_method.schedule_put.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_function_invoke_arns["manage-schedules"]
}

resource "aws_api_gateway_method" "schedule_delete" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.root_resources["schedules"].id
  http_method   = "DELETE"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

resource "aws_api_gateway_integration" "schedule_delete" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.root_resources["schedules"].id
  http_method             = aws_api_gateway_method.schedule_delete.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_function_invoke_arns["manage-schedules"]
}

# Lambda permission for schedule management - already covered by api_gateway_invoke loop

# Account management methods (POST, PUT, DELETE)
resource "aws_api_gateway_method" "account_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.root_resources["accounts"].id
  http_method   = "POST"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

resource "aws_api_gateway_integration" "account_post" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.root_resources["accounts"].id
  http_method             = aws_api_gateway_method.account_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_function_invoke_arns["multi-account-aggregator"]
}

resource "aws_api_gateway_method" "account_put" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.root_resources["accounts"].id
  http_method   = "PUT"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

resource "aws_api_gateway_integration" "account_put" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.root_resources["accounts"].id
  http_method             = aws_api_gateway_method.account_put.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_function_invoke_arns["multi-account-aggregator"]
}

resource "aws_api_gateway_method" "account_delete" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.root_resources["accounts"].id
  http_method   = "DELETE"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

resource "aws_api_gateway_integration" "account_delete" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.root_resources["accounts"].id
  http_method             = aws_api_gateway_method.account_delete.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_function_invoke_arns["multi-account-aggregator"]
}

# Lambda permission for account management - already covered by api_gateway_invoke loop

# CORS configuration for OPTIONS method
resource "aws_api_gateway_method" "options_methods" {
  for_each = local.get_methods

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = contains(keys(local.root_resources), each.key) ? aws_api_gateway_resource.root_resources[each.key].id : aws_api_gateway_resource.child_resources[each.key].id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "options_integrations" {
  for_each = local.get_methods

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = contains(keys(local.root_resources), each.key) ? aws_api_gateway_resource.root_resources[each.key].id : aws_api_gateway_resource.child_resources[each.key].id
  http_method = aws_api_gateway_method.options_methods[each.key].http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "options_responses" {
  for_each = local.get_methods

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = contains(keys(local.root_resources), each.key) ? aws_api_gateway_resource.root_resources[each.key].id : aws_api_gateway_resource.child_resources[each.key].id
  http_method = aws_api_gateway_method.options_methods[each.key].http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "options_integration_responses" {
  for_each = local.get_methods

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = contains(keys(local.root_resources), each.key) ? aws_api_gateway_resource.root_resources[each.key].id : aws_api_gateway_resource.child_resources[each.key].id
  http_method = aws_api_gateway_method.options_methods[each.key].http_method
  status_code = aws_api_gateway_method_response.options_responses[each.key].status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.options_integrations]
}

# ============================================================
# Control route path-parameter resources
# ============================================================

# /compute/ec2/{instanceId}
resource "aws_api_gateway_resource" "ec2_instance_id" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.child_resources["compute_ec2"].id
  path_part   = "{instanceId}"
}

# /compute/ec2/{instanceId}/stop
resource "aws_api_gateway_resource" "ec2_stop" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.ec2_instance_id.id
  path_part   = "stop"
}

# /compute/ec2/{instanceId}/start
resource "aws_api_gateway_resource" "ec2_start" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.ec2_instance_id.id
  path_part   = "start"
}

# /databases/rds/{resourceId}
resource "aws_api_gateway_resource" "rds_resource_id" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.child_resources["databases_rds"].id
  path_part   = "{resourceId}"
}

# /databases/rds/{resourceId}/stop
resource "aws_api_gateway_resource" "rds_stop" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.rds_resource_id.id
  path_part   = "stop"
}

# /databases/rds/{resourceId}/start
resource "aws_api_gateway_resource" "rds_start" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.rds_resource_id.id
  path_part   = "start"
}

# /databases/redshift/{clusterId}
resource "aws_api_gateway_resource" "redshift_cluster_id" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.child_resources["databases_redshift"].id
  path_part   = "{clusterId}"
}

# /databases/redshift/{clusterId}/pause
resource "aws_api_gateway_resource" "redshift_pause" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.redshift_cluster_id.id
  path_part   = "pause"
}

# /databases/redshift/{clusterId}/resume
resource "aws_api_gateway_resource" "redshift_resume" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.redshift_cluster_id.id
  path_part   = "resume"
}

# /compute/eks/{clusterName}
resource "aws_api_gateway_resource" "eks_cluster_name" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.child_resources["compute_eks"].id
  path_part   = "{clusterName}"
}

# /compute/eks/{clusterName}/nodegroup
resource "aws_api_gateway_resource" "eks_nodegroup" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.eks_cluster_name.id
  path_part   = "nodegroup"
}

# /compute/eks/{clusterName}/nodegroup/{nodegroupName}
resource "aws_api_gateway_resource" "eks_nodegroup_name" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.eks_nodegroup.id
  path_part   = "{nodegroupName}"
}

# /compute/eks/{clusterName}/nodegroup/{nodegroupName}/scale
resource "aws_api_gateway_resource" "eks_scale" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.eks_nodegroup_name.id
  path_part   = "scale"
}

# /compute/eks/{clusterName}/workloads
resource "aws_api_gateway_resource" "eks_workloads" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.eks_cluster_name.id
  path_part   = "workloads"
}

# /compute/eks/{clusterName}/scale-deployment
resource "aws_api_gateway_resource" "eks_scale_deployment" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.eks_cluster_name.id
  path_part   = "scale-deployment"
}

# ============================================================
# Control action endpoints — POST + OPTIONS for each
# ============================================================

locals {
  control_actions = {
    "ec2_stop"            = { resource_id = aws_api_gateway_resource.ec2_stop.id,            lambda = "control-ec2" }
    "ec2_start"           = { resource_id = aws_api_gateway_resource.ec2_start.id,           lambda = "control-ec2" }
    "rds_stop"            = { resource_id = aws_api_gateway_resource.rds_stop.id,            lambda = "control-rds" }
    "rds_start"           = { resource_id = aws_api_gateway_resource.rds_start.id,           lambda = "control-rds" }
    "redshift_pause"      = { resource_id = aws_api_gateway_resource.redshift_pause.id,      lambda = "control-redshift" }
    "redshift_resume"     = { resource_id = aws_api_gateway_resource.redshift_resume.id,     lambda = "control-redshift" }
    "eks_scale"           = { resource_id = aws_api_gateway_resource.eks_scale.id,           lambda = "control-eks-nodegroup" }
    "eks_scale_deployment"= { resource_id = aws_api_gateway_resource.eks_scale_deployment.id,lambda = "control-eks-workload" }
  }

  workload_get_actions = {
    "eks_workloads" = { resource_id = aws_api_gateway_resource.eks_workloads.id, lambda = "list-eks-workloads" }
  }
}

# POST methods (Cognito-protected)
resource "aws_api_gateway_method" "control_post" {
  for_each = local.control_actions

  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = each.value.resource_id
  http_method   = "POST"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

# POST Lambda integrations
resource "aws_api_gateway_integration" "control_post" {
  for_each = local.control_actions

  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = each.value.resource_id
  http_method             = aws_api_gateway_method.control_post[each.key].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_function_invoke_arns[each.value.lambda]
}

# OPTIONS methods (unauthenticated preflight)
resource "aws_api_gateway_method" "control_options" {
  for_each = local.control_actions

  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = each.value.resource_id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# OPTIONS MOCK integrations
resource "aws_api_gateway_integration" "control_options" {
  for_each = local.control_actions

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = each.value.resource_id
  http_method = aws_api_gateway_method.control_options[each.key].http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

# OPTIONS method responses
resource "aws_api_gateway_method_response" "control_options" {
  for_each = local.control_actions

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = each.value.resource_id
  http_method = aws_api_gateway_method.control_options[each.key].http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

# OPTIONS integration responses (writes the actual CORS header values)
resource "aws_api_gateway_integration_response" "control_options" {
  for_each = local.control_actions

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = each.value.resource_id
  http_method = aws_api_gateway_method.control_options[each.key].http_method
  status_code = aws_api_gateway_method_response.control_options[each.key].status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.control_options]
}

# GET method for workload listing
resource "aws_api_gateway_method" "workload_get" {
  for_each = local.workload_get_actions

  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = each.value.resource_id
  http_method   = "GET"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

resource "aws_api_gateway_integration" "workload_get" {
  for_each = local.workload_get_actions

  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = each.value.resource_id
  http_method             = aws_api_gateway_method.workload_get[each.key].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_function_invoke_arns[each.value.lambda]
}

resource "aws_api_gateway_method" "workload_get_options" {
  for_each = local.workload_get_actions

  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = each.value.resource_id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "workload_get_options" {
  for_each = local.workload_get_actions

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = each.value.resource_id
  http_method = aws_api_gateway_method.workload_get_options[each.key].http_method
  type        = "MOCK"
  request_templates = { "application/json" = "{\"statusCode\": 200}" }
}

resource "aws_api_gateway_method_response" "workload_get_options" {
  for_each = local.workload_get_actions

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = each.value.resource_id
  http_method = aws_api_gateway_method.workload_get_options[each.key].http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = { "application/json" = "Empty" }
}

resource "aws_api_gateway_integration_response" "workload_get_options" {
  for_each = local.workload_get_actions

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = each.value.resource_id
  http_method = aws_api_gateway_method.workload_get_options[each.key].http_method
  status_code = aws_api_gateway_method_response.workload_get_options[each.key].status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.workload_get_options]
}

# Lambda invoke permissions for control functions
# Uses a distinct statement_id prefix "AllowControlInvoke-" to avoid collisions
# with the "AllowAPIGatewayInvoke-" prefix used for get_methods above.
resource "aws_lambda_permission" "control_invoke" {
  for_each = toset(["control-ec2", "control-rds", "control-redshift", "control-eks-nodegroup", "control-eks-workload", "list-eks-workloads"])

  statement_id  = "AllowControlInvoke-${each.key}"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_function_names[each.key]
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

# ============================================================
# Gateway Responses — inject CORS headers into all API Gateway
# generated error responses (4xx / 5xx) so the browser sees
# the real error instead of a misleading CORS error.
# ============================================================
resource "aws_api_gateway_gateway_response" "cors_4xx" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  response_type = "DEFAULT_4XX"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

resource "aws_api_gateway_gateway_response" "cors_5xx" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  response_type = "DEFAULT_5XX"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# Deployment
# triggers causes a new deployment snapshot whenever routes/integrations change,
# ensuring the stage always serves the latest API definition.
resource "aws_api_gateway_deployment" "main" {
  rest_api_id = aws_api_gateway_rest_api.main.id

  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_resource.root_resources,
      aws_api_gateway_resource.child_resources,
      aws_api_gateway_resource.ec2_instance_id,
      aws_api_gateway_resource.ec2_stop,
      aws_api_gateway_resource.ec2_start,
      aws_api_gateway_resource.rds_resource_id,
      aws_api_gateway_resource.rds_stop,
      aws_api_gateway_resource.rds_start,
      aws_api_gateway_resource.redshift_cluster_id,
      aws_api_gateway_resource.redshift_pause,
      aws_api_gateway_resource.redshift_resume,
      aws_api_gateway_resource.eks_cluster_name,
      aws_api_gateway_resource.eks_nodegroup,
      aws_api_gateway_resource.eks_nodegroup_name,
      aws_api_gateway_resource.eks_scale,
      aws_api_gateway_method.get_methods,
      aws_api_gateway_integration.get_integrations,
      aws_api_gateway_method.options_methods,
      aws_api_gateway_integration.options_integrations,
      aws_api_gateway_method.control_post,
      aws_api_gateway_integration.control_post,
      aws_api_gateway_method.control_options,
      aws_api_gateway_integration.control_options,
      aws_api_gateway_method.workload_get,
      aws_api_gateway_integration.workload_get,
      aws_api_gateway_method.workload_get_options,
      aws_api_gateway_integration.workload_get_options,
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Stage
resource "aws_api_gateway_stage" "prod" {
  deployment_id = aws_api_gateway_deployment.main.id
  rest_api_id   = aws_api_gateway_rest_api.main.id
  stage_name    = "prod"

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      caller         = "$context.identity.caller"
      user           = "$context.identity.user"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      resourcePath   = "$context.resourcePath"
      status         = "$context.status"
      protocol       = "$context.protocol"
      responseLength = "$context.responseLength"
    })
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-api-prod"
  }
}

# CloudWatch Log Group for API Gateway
resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/api-gateway/${var.project_name}-${var.environment}"
  retention_in_days = 30

  tags = {
    Name = "${var.project_name}-${var.environment}-api-gateway-logs"
  }
}

# Output API URL
output "api_url" {
  value = aws_api_gateway_stage.prod.invoke_url
}

output "api_id" {
  value = aws_api_gateway_rest_api.main.id
}
