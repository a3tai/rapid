# Infrastructure Project

## Overview

This is an infrastructure-as-code repository using Terraform and Kubernetes.

## Tech Stack

- **Terraform** - Infrastructure provisioning
- **Kubernetes** - Container orchestration
- **Helm** - Kubernetes package management
- **AWS/Azure/GCP** - Cloud providers

## Project Structure

```
.
├── environments/        # Environment-specific configs
│   ├── dev/
│   ├── staging/
│   └── prod/
├── modules/            # Reusable Terraform modules
├── kubernetes/         # Kubernetes manifests
│   ├── base/          # Base configurations
│   └── overlays/      # Environment overlays (Kustomize)
├── helm/              # Helm charts
└── scripts/           # Utility scripts
```

## Commands

### Terraform

```bash
# Initialize
terraform init

# Plan changes
terraform plan -var-file=environments/dev/terraform.tfvars

# Apply changes
terraform apply -var-file=environments/dev/terraform.tfvars

# Destroy
terraform destroy -var-file=environments/dev/terraform.tfvars
```

### Kubernetes

```bash
# Apply manifests
kubectl apply -k kubernetes/overlays/dev

# Check status
kubectl get pods -n <namespace>

# View logs
kubectl logs -f deployment/<name> -n <namespace>
```

### Helm

```bash
# Install chart
helm install <release> ./helm/<chart> -f values-dev.yaml

# Upgrade
helm upgrade <release> ./helm/<chart> -f values-dev.yaml

# List releases
helm list
```

## Guidelines

### Terraform

- Use modules for reusable components
- Keep state in remote backend (S3, Azure Blob, GCS)
- Use workspaces or separate state files per environment
- Always run `terraform fmt` before committing
- Run `terraform validate` and `tflint` before applying

### Kubernetes

- Use Kustomize for environment overlays
- Never hardcode secrets in manifests
- Use resource limits on all containers
- Implement health checks (readiness/liveness probes)

### Security

- Never commit credentials or secrets
- Use IAM roles and service accounts
- Enable encryption at rest and in transit
- Follow principle of least privilege
- Run `checkov` for security scanning

## Restrictions

- Do NOT modify production environment files without explicit approval
- Do NOT run `terraform apply` on prod - that's done via CI/CD
- Do NOT commit `.tfvars` files containing secrets
- Always use `-target` carefully to avoid unintended changes

## Pre-commit Hooks

```bash
# Install hooks
pre-commit install

# Run manually
pre-commit run --all-files
```

## Common Patterns

### Module Usage

```hcl
module "vpc" {
  source = "./modules/vpc"
  
  name        = var.environment
  cidr_block  = var.vpc_cidr
  
  tags = local.common_tags
}
```

### Variable Definition

```hcl
variable "environment" {
  description = "Environment name"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}
```
