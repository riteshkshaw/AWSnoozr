variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "admin_email" {
  description = "Admin email for SNS notifications"
  type        = string
}

variable "enable_mobile_notifications" {
  description = "Enable mobile push notifications (requires APNS/FCM credentials)"
  type        = bool
  default     = false
}

variable "apns_certificate" {
  description = "APNS certificate for iOS push notifications"
  type        = string
  default     = ""
  sensitive   = true
}

variable "fcm_api_key" {
  description = "FCM API key for Android push notifications"
  type        = string
  default     = ""
  sensitive   = true
}
