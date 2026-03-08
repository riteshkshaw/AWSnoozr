resource "aws_iam_role" "lambda_execution" {
  name = "${var.project_name}-${var.environment}-lambda-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-lambda-execution"
  }
}

# Attach AWS managed policy for basic Lambda execution
resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.lambda_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Custom policy with read AND control permissions for all AWS services
resource "aws_iam_role_policy" "resource_management" {
  name = "${var.project_name}-${var.environment}-resource-management"
  role = aws_iam_role.lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # EC2 - Read and Control
      {
        Effect = "Allow"
        Action = [
          "ec2:DescribeInstances",
          "ec2:DescribeVolumes",
          "ec2:DescribeNatGateways",
          "ec2:DescribeAddresses",
          "ec2:DescribeVpnConnections",
          "ec2:DescribeTransitGateways",
          "ec2:DescribeRegions",
          "ec2:StopInstances",
          "ec2:StartInstances"
        ]
        Resource = "*"
      },
      # EKS - Read and Control
      {
        Effect = "Allow"
        Action = [
          "eks:ListClusters",
          "eks:DescribeCluster",
          "eks:DescribeNodegroup",
          "eks:ListNodegroups",
          "eks:UpdateNodegroupConfig"
        ]
        Resource = "*"
      },
      # Auto Scaling - Read and Control
      {
        Effect = "Allow"
        Action = [
          "autoscaling:DescribeAutoScalingGroups",
          "autoscaling:UpdateAutoScalingGroup"
        ]
        Resource = "*"
      },
      # RDS - Read and Control
      {
        Effect = "Allow"
        Action = [
          "rds:DescribeDBInstances",
          "rds:DescribeDBClusters",
          "rds:StopDBInstance",
          "rds:StartDBInstance",
          "rds:StopDBCluster",
          "rds:StartDBCluster"
        ]
        Resource = "*"
      },
      # Redshift - Read and Control
      {
        Effect = "Allow"
        Action = [
          "redshift:DescribeClusters",
          "redshift:PauseCluster",
          "redshift:ResumeCluster"
        ]
        Resource = "*"
      },
      # ElastiCache - Read
      {
        Effect = "Allow"
        Action = [
          "elasticache:DescribeCacheClusters",
          "elasticache:DescribeReplicationGroups"
        ]
        Resource = "*"
      },
      # OpenSearch - Read
      {
        Effect = "Allow"
        Action = [
          "es:ListDomainNames",
          "es:DescribeDomain"
        ]
        Resource = "*"
      },
      # DocumentDB - Read
      {
        Effect = "Allow"
        Action = [
          "docdb:DescribeDBClusters",
          "docdb:DescribeDBInstances"
        ]
        Resource = "*"
      },
      # Neptune - Read
      {
        Effect = "Allow"
        Action = [
          "neptune:DescribeDBClusters",
          "neptune:DescribeDBInstances"
        ]
        Resource = "*"
      },
      # Load Balancing - Read
      {
        Effect = "Allow"
        Action = [
          "elasticloadbalancing:DescribeLoadBalancers",
          "elasticloadbalancing:DescribeTargetGroups",
          "elasticloadbalancing:DescribeTargetHealth"
        ]
        Resource = "*"
      },
      # EFS - Read
      {
        Effect = "Allow"
        Action = [
          "elasticfilesystem:DescribeFileSystems"
        ]
        Resource = "*"
      },
      # FSx - Read
      {
        Effect = "Allow"
        Action = [
          "fsx:DescribeFileSystems"
        ]
        Resource = "*"
      },
      # MSK - Read
      {
        Effect = "Allow"
        Action = [
          "kafka:ListClusters",
          "kafka:DescribeCluster"
        ]
        Resource = "*"
      },
      # Amazon MQ - Read
      {
        Effect = "Allow"
        Action = [
          "mq:ListBrokers",
          "mq:DescribeBroker"
        ]
        Resource = "*"
      },
      # Kinesis - Read
      {
        Effect = "Allow"
        Action = [
          "kinesis:ListStreams",
          "kinesis:DescribeStream"
        ]
        Resource = "*"
      },
      # SageMaker - Read
      {
        Effect = "Allow"
        Action = [
          "sagemaker:ListEndpoints",
          "sagemaker:ListNotebookInstances",
          "sagemaker:DescribeEndpoint",
          "sagemaker:DescribeNotebookInstance"
        ]
        Resource = "*"
      },
      # CloudFront - Read
      {
        Effect = "Allow"
        Action = [
          "cloudfront:ListDistributions"
        ]
        Resource = "*"
      },
      # WorkSpaces - Read
      {
        Effect = "Allow"
        Action = [
          "workspaces:DescribeWorkspaces"
        ]
        Resource = "*"
      },
      # AppStream - Read
      {
        Effect = "Allow"
        Action = [
          "appstream:DescribeFleets"
        ]
        Resource = "*"
      },
      # Direct Connect - Read
      {
        Effect = "Allow"
        Action = [
          "directconnect:DescribeConnections"
        ]
        Resource = "*"
      },
      # Cost Explorer - Read
      {
        Effect = "Allow"
        Action = [
          "ce:GetCostAndUsage",
          "ce:GetCostForecast"
        ]
        Resource = "*"
      },
      # STS for cross-account access
      {
        Effect = "Allow"
        Action = [
          "sts:AssumeRole"
        ]
        Resource = "arn:aws:iam::*:role/AWSnoozrCrossAccountRole"
      },
      # SNS for notifications
      {
        Effect = "Allow"
        Action = [
          "sns:Publish"
        ]
        Resource = "*"
      },
      # DynamoDB for schedules and accounts
      {
        Effect = "Allow"
        Action = [
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem"
        ]
        Resource = "*"
      },
      # Organizations (optional, for multi-account discovery)
      {
        Effect = "Allow"
        Action = [
          "organizations:ListAccounts"
        ]
        Resource = "*"
      }
    ]
  })
}

output "lambda_execution_role_arn" {
  value = aws_iam_role.lambda_execution.arn
}

output "lambda_execution_role_name" {
  value = aws_iam_role.lambda_execution.name
}
