# Multi-Account Cross-Account IAM Roles Module
# This module should be deployed in each AWS account you want to monitor

# Cross-account IAM role that allows main account to assume
resource "aws_iam_role" "cross_account" {
  name = "${var.project_name}-${var.environment}-cross-account"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${var.main_account_id}:root"
        }
        Action = "sts:AssumeRole"
        Condition = {
          StringEquals = {
            "sts:ExternalId" = "${var.project_name}-${var.environment}"
          }
        }
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-${var.environment}-cross-account"
    Project     = var.project_name
    Environment = var.environment
  }
}

# Attach ReadOnlyAccess for resource discovery
resource "aws_iam_role_policy_attachment" "readonly" {
  role       = aws_iam_role.cross_account.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

# Custom policy for control actions
resource "aws_iam_role_policy" "control_actions" {
  name = "${var.project_name}-${var.environment}-control-actions"
  role = aws_iam_role.cross_account.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          # EC2 control
          "ec2:StopInstances",
          "ec2:StartInstances",
          "ec2:RebootInstances",
          # RDS control
          "rds:StopDBInstance",
          "rds:StartDBInstance",
          "rds:StopDBCluster",
          "rds:StartDBCluster",
          "rds:RebootDBInstance",
          # Redshift control
          "redshift:PauseCluster",
          "redshift:ResumeCluster",
          # EKS control and read
          "eks:UpdateNodegroupConfig",
          "eks:ListFargateProfiles",
          "eks:DescribeFargateProfile",
          "eks:ListClusters",
          "eks:DescribeCluster",
          "eks:ListNodegroups",
          "eks:DescribeNodegroup",
          # Auto Scaling
          "autoscaling:UpdateAutoScalingGroup",
          "autoscaling:SetDesiredCapacity",
          # ElastiCache
          "elasticache:ModifyCacheCluster",
          "elasticache:ModifyReplicationGroup"
        ]
        Resource = "*"
      }
    ]
  })
}

# Output the role ARN for configuration
output "cross_account_role_arn" {
  description = "ARN of the cross-account role"
  value       = aws_iam_role.cross_account.arn
}

output "external_id" {
  description = "External ID for assuming the role"
  value       = "${var.project_name}-${var.environment}"
}
