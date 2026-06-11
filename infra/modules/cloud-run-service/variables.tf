variable "service_name"          { type = string }
variable "region"                { type = string }
variable "image"                 { type = string }
variable "min_instances"         { type = number; default = 1 }
variable "max_instances"         { type = number; default = 10 }
variable "cpu"                   { type = string; default = "1" }
variable "memory"                { type = string; default = "512Mi" }
variable "service_account_email" { type = string }
variable "allow_public"          { type = bool; default = false }
# Secret Manager secret names, injected via secret_key_ref.
variable "env_vars"              { type = map(string); default = {} }
# Non-secret values (project ids, regions, ports), injected as plain env vars.
variable "plain_env_vars"        { type = map(string); default = {} }
# Members granted roles/run.invoker (e.g. the Cloud Tasks OIDC service account).
variable "invoker_members"       { type = list(string); default = [] }
