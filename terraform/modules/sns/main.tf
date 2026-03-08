resource "aws_sns_topic" "resource_notifications" {
  name = "${var.project_name}-${var.environment}-resource-notifications"

  tags = {
    Name = "${var.project_name}-${var.environment}-resource-notifications"
  }
}

resource "aws_sns_topic_subscription" "admin_email" {
  topic_arn = aws_sns_topic.resource_notifications.arn
  protocol  = "email"
  endpoint  = var.admin_email
}

resource "aws_sns_topic_policy" "resource_notifications" {
  arn = aws_sns_topic.resource_notifications.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
      Action   = "SNS:Publish"
      Resource = aws_sns_topic.resource_notifications.arn
    }]
  })
}

# SNS Platform Applications for mobile push notifications
resource "aws_sns_platform_application" "apns" {
  count = var.enable_mobile_notifications ? 1 : 0

  name                = "${var.project_name}-${var.environment}-apns"
  platform            = "APNS"
  platform_credential = var.apns_certificate
}

resource "aws_sns_platform_application" "fcm" {
  count = var.enable_mobile_notifications ? 1 : 0

  name                = "${var.project_name}-${var.environment}-fcm"
  platform            = "GCM"
  platform_credential = var.fcm_api_key
}

output "resource_notifications_topic_arn" {
  value = aws_sns_topic.resource_notifications.arn
}

output "apns_application_arn" {
  value = var.enable_mobile_notifications ? aws_sns_platform_application.apns[0].arn : null
}

output "fcm_application_arn" {
  value = var.enable_mobile_notifications ? aws_sns_platform_application.fcm[0].arn : null
}
