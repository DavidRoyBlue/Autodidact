# ADR-021: Infrastructure as code

## Status

Accepted
Date: 2026-05-10

## Context

We deploy three services to GCP Cloud Run ([ADR-012](./ADR-012-cloud-hosting-platform.md))
plus supporting infrastructure: Memorystore Redis ([ADR-007](../_superseded/ADR-007-background-job-queue.md)),
Artifact Registry (container images), Secret Manager (env secrets), VPC
connector, IAM bindings, service accounts. Terraform state lives in a GCS
bucket (`autodidact-terraform-state`).

This setup needs to be reproducible (a fresh environment can be created
from scratch), reviewable (changes go through PR like code), and safe
(destroying production-by-accident is hard). Doing this via the GCP
console clicks-and-screenshots is anti-engineering; doing it via shell
scripts and `gcloud` invocations works for small things but loses
reproducibility quickly.

This decision is downstream of [ADR-012](./ADR-012-cloud-hosting-platform.md)
(GCP) and shapes [ADR-022](./ADR-022-cicd-platform.md) (CI/CD has to
apply the IaC). It is independent of the application code's framework
choices.

## Non-goals

- Specific Terraform module organization — owned by `infra/README.md` and `infra/CLAUDE.md`.
- Terraform state backend configuration details — already operational; a GCS bucket with versioning and locking via state file conditional checks.
- Per-environment variable management (dev vs prod) — operational, owned by `infra/environments/*`.
- Application secrets — managed via Secret Manager, referenced from Terraform.

## Decision Drivers

- **Reproducibility** — fresh environments must be createable from scratch with the same config.
- **Multi-environment support** — dev and prod need different scaling, different secrets, but same shape.
- **GCP coverage** — must support the GCP resources we use (Cloud Run, Memorystore, Artifact Registry, Secret Manager, IAM).
- **State management** — remote state with locking, so concurrent applies don't corrupt.
- **Review workflow** — diffs must be reviewable in a PR.
- **Onboarding cost** — solo team, multi-month contributors.
- **Vendor neutrality / portability** — IaC tool itself shouldn't lock us into one cloud.
- **Maintenance trajectory** — multi-year horizon; the tool needs ongoing support.

## Options Considered

### Option A: Terraform (current, HashiCorp version)
**What it is:** HCL-based declarative IaC. Cloud-vendor providers expose resources; we declare desired state; `terraform apply` reconciles. Remote state via GCS / S3 / Terraform Cloud.

**Pros**
- The de-facto industry standard. Documentation, community modules, tutorials are abundant for every cloud.
- GCP provider (`hashicorp/google`) is first-class; supports every resource we use.
- Remote state in GCS is simple and free; locking via the GCS bucket's strong-consistency semantics.
- HCL is declarative and readable. Diffs in PRs show resource-level intent.
- Mature ecosystem around it (terragrunt, atlantis, terraform-docs).
- Per-environment workspaces or separate `environments/*` folders both work.

**Cons**
- HashiCorp re-licensed Terraform from MPL to BUSL (Business Source License) in August 2023. While end-user use is permitted, the license is no longer truly OSS, which has motivated the OpenTofu fork.
- HCL is a separate DSL — not a programming language. Loops and conditionals exist but are awkward for complex logic.
- State drift between code and reality is a constant operational concern; `terraform plan` is mandatory before `apply`.
- Provider versions occasionally change resource shapes; minor refactors during upgrades.

### Option B: OpenTofu (open-source Terraform fork)
**What it is:** A drop-in fork of Terraform 1.5.x maintained under the Linux Foundation, MPL-licensed. Diverged from Terraform after the BUSL license change.

**Pros**
- Drop-in compatible with Terraform 1.5 syntax. Migration is changing the binary.
- Genuinely open source; no licensing risk from HashiCorp.
- Supported by the Linux Foundation; active maintenance.
- Same provider ecosystem (most providers work for both).

**Cons**
- Diverging from Terraform mainline over time — newer Terraform features may not be in OpenTofu and vice versa. We'd need to track.
- Smaller community than Terraform proper (though growing).
- Tooling integration (atlantis, terraform-docs) needs config to point at the OpenTofu binary; some still optimize for Terraform.

### Option C: Pulumi
**What it is:** IaC using real programming languages — TypeScript, Python, Go, etc. Cloud resources are code-level objects; the engine reconciles desired vs actual state.

**Pros**
- TypeScript IaC! In a TS-monorepo team, infra and application code share a language — meaningful for a small team.
- Loops, conditionals, abstractions are first-class language features instead of HCL constructs.
- IDE autocomplete on resource properties is real (more than Terraform's HCL editor support).
- Supports any cloud Terraform supports (Pulumi can wrap Terraform providers).

**Cons**
- Smaller community than Terraform; fewer tutorials, fewer Stack Overflow answers per question.
- Pulumi requires a state-management backend (Pulumi Cloud free tier or self-hosted); slightly more setup than Terraform on GCS.
- Programming language flexibility cuts both ways — easier to write infra-as-side-effects bugs that wouldn't compile in HCL.
- Migration from existing Terraform configs would be real work.

### Option D: AWS CDK / Google Cloud equivalent (via CDKTF)
**What it is:** AWS-style Cloud Development Kit. Originally AWS-only; CDKTF (Terraform CDK) extends the model to any Terraform provider.

**Pros**
- Same TypeScript-as-IaC story as Pulumi.
- CDKTF reuses Terraform providers under the hood — same coverage as A.

**Cons**
- CDKTF is a derivative of Terraform — adds an abstraction layer; the underlying engine and state are still Terraform.
- Smaller community than either Terraform or Pulumi.
- We already have Terraform configs working; CDKTF doesn't pay off unless we want TypeScript IaC, in which case Pulumi is a more direct alternative.

### Option E: Shell scripts + gcloud CLI
**What it is:** Bash scripts that invoke `gcloud run deploy`, `gcloud secrets create`, etc. State lives in GCP itself.

**Pros**
- No tool to install beyond `gcloud`.
- For small projects, scripting can ship faster than learning Terraform.

**Cons**
- No state reconciliation. We can't tell what the script *should* produce vs what's actually deployed.
- No PR-level diff of "what will change."
- Idempotency is the script-author's responsibility.
- This approach is a pre-IaC era; it works briefly and breaks as soon as multiple environments or contributors are involved.

### Option F: Crossplane (Kubernetes-native IaC)
**What it is:** Kubernetes operator for managing cloud infrastructure declaratively via Custom Resources.

**Pros**
- If you already run Kubernetes, infra and apps are managed in the same control plane.
- Declarative reconciliation loop.

**Cons**
- Requires Kubernetes ([ADR-012](./ADR-012-cloud-hosting-platform.md) decided against). Crossplane without K8s isn't applicable.
- Severe over-engineering for our scale.

## Decision

**We use Terraform (HashiCorp version).**

## Rationale

Lining up the drivers:

- **Reproducibility (#1)**: A, B, C, D all yes. E and F don't apply.
- **Multi-environment (#2)**: A's `environments/*` pattern (which we use) is clean. C/D have similar.
- **GCP coverage (#3)**: A has the most-supported provider. B uses the same providers. C wraps them. D wraps them. E is incomplete by definition.
- **State management (#4)**: A's GCS backend is one block of config. C/D need a Pulumi-style backend.
- **Review workflow (#5)**: A's HCL diffs are clear in PRs. C/D show TypeScript code diffs which are also fine. E provides no diff.
- **Onboarding (#6)**: A's HCL is the most-documented IaC syntax. C/D require both TypeScript familiarity (we have it) and IaC-pattern familiarity. E is "just shell" but the patterns to maintain are bespoke.
- **Vendor neutrality (#7)**: A best (any cloud Terraform has a provider for). B inherits. C and D similar.
- **Maintenance trajectory (#8)**: A and B both well-maintained. A has the larger community; B has the licensing high ground.

What we are sacrificing by picking Terraform over OpenTofu:

- True open-source licensing. The BUSL license is real but its practical
  impact on us as an end user is currently nil. If HashiCorp's licensing
  posture changes in a way that affects us (e.g., paid features locked
  behind a tier), switching to OpenTofu is straightforward — same syntax,
  same providers.

What we are sacrificing by picking Terraform over Pulumi:

- TypeScript-as-IaC. Real DX win in principle; the migration cost from
  existing HCL is non-trivial; the operational cost of a smaller
  community is real.

No reconsideration flag is raised. Terraform is the first-principles
choice for our specific intersection (GCP-only, small team, existing
configs work, multi-year horizon). The OpenTofu option is held in
reserve as a license-driven escape hatch.

## Consequences

### Positive
- Cloud Run, Memorystore, Artifact Registry, Secret Manager, IAM all defined declaratively.
- Diffs visible in PR review.
- Per-environment configs in `infra/environments/*` keep dev and prod isolated.
- State in GCS bucket is durable and shared across the team.
- Industry-standard tool — onboarding is the same as for any Terraform shop.

### Negative
- HCL DSL has limits — complex logic forces awkward patterns.
- BUSL license — unlikely but real future risk.
- State drift requires discipline; running `terraform plan` before every change.
- HashiCorp provider version updates occasionally break configs.

### Follow-up decisions
- Module organization, environment layout — owned by `infra/README.md` and `infra/CLAUDE.md`.
- Reconsider this ADR if: HashiCorp imposes paid-only features that block our use, OpenTofu's feature parity with Terraform diverges meaningfully (we'd switch defensively), or the team migrates en masse to a TypeScript-IaC paradigm.
