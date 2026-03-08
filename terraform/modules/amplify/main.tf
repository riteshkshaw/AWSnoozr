resource "aws_amplify_app" "main" {
  name       = "${var.project_name}-${var.environment}"
  repository = var.github_repo

  # GitHub access token for repository access
  access_token = var.github_token

  # Build settings
  build_spec = <<-EOT
    version: 1
    frontend:
      phases:
        preBuild:
          commands:
            - cd frontend
            - npm ci
        build:
          commands:
            - npm run build
      artifacts:
        baseDirectory: frontend/build
        files:
          - '**/*'
      cache:
        paths:
          - node_modules/**/*
  EOT

  # Environment variables for React app
  environment_variables = {
    REACT_APP_AWS_REGION           = "us-east-1"
    REACT_APP_USER_POOL_ID         = var.cognito_user_pool_id
    REACT_APP_USER_POOL_CLIENT_ID  = var.cognito_client_id
    REACT_APP_API_GATEWAY_URL      = var.api_gateway_url
  }

  # Enable auto branch creation from Git branches
  enable_auto_branch_creation = false
  enable_branch_auto_build    = true
  enable_branch_auto_deletion = false

  # Custom rules for SPA routing
  custom_rule {
    source = "</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|ttf|map|json)$)([^.]+$)/>"
    status = "200"
    target = "/index.html"
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-amplify"
  }
}

# Main branch
resource "aws_amplify_branch" "main" {
  app_id      = aws_amplify_app.main.id
  branch_name = "main"

  enable_auto_build = true

  tags = {
    Name = "${var.project_name}-${var.environment}-main-branch"
  }
}

output "app_id" {
  value = aws_amplify_app.main.id
}

output "default_domain" {
  value = aws_amplify_app.main.default_domain
}

output "app_url" {
  value = "https://${aws_amplify_branch.main.branch_name}.${aws_amplify_app.main.default_domain}"
}
