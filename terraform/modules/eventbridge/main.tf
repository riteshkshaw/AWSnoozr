resource "aws_cloudwatch_event_rule" "schedule_processor" {
  name                = "${var.project_name}-${var.environment}-schedule-processor"
  description         = "Trigger schedule processor Lambda every 5 minutes"
  schedule_expression = "rate(5 minutes)"

  tags = {
    Name = "${var.project_name}-${var.environment}-schedule-processor"
  }
}

output "schedule_processor_rule_arn" {
  value = aws_cloudwatch_event_rule.schedule_processor.arn
}

output "schedule_processor_rule_name" {
  value = aws_cloudwatch_event_rule.schedule_processor.name
}
