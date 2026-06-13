variable "project_id" { type = string }
variable "region"     { type = string }

# Service account (email) that api/worker run as — granted enqueue + OIDC actAs.
variable "enqueuer_service_account" { type = string }
