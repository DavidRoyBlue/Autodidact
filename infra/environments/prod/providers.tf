terraform {
  required_version = ">= 1.9.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  # Remote state in GCS (bucket created by scripts/gcp-bootstrap.sh). State is
  # never local — see infra/CLAUDE.md.
  backend "gcs" {
    bucket = "autodidact-terraform-state"
    prefix = "terraform/state"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
