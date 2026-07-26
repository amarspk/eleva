# DOC-010 §10.5 — Branch Protection Rules

> Branch protection must be configured manually in GitHub repository settings.
> GitHub Actions workflows cannot automate branch protection rule creation.

## Required Rules for `main` Branch

### 1. Require Pull Request Reviews
- **Setting:** Require at least 1 approval before merging
- **Dismiss stale reviews:** Yes
- **Require review from code owners:** Yes (when CODEOWNERS file exists)

### 2. Require Status Checks
- **Required checks before merging:**
  - `code-quality` (lint)
  - `test` (unit & integration tests)
  - `build` (TypeScript build verification)
  - `docker` (Docker image build verification)
- **Require branches to be up to date:** Yes

### 3. Require Conversation Resolution
- All review conversations must be resolved before merging

### 4. Require Linear History
- Require squash merges (enforces clean, linear commit history)
- Or require rebase merges (preserves individual commits)

### 5. Require Signed Commits
- **Recommended:** GPG-signed commits for supply chain security

### 6. Include Administrators
- Repository admins are subject to the same branch protection rules

### 7. Restrict Who Can Push
- **Do not allow:** Direct pushes to `main`
- **Allow:** Only via pull request merge

---

## Setup Instructions

1. Go to **Settings → Branches → Add rule**
2. Branch name pattern: `main`
3. Enable the above protections
4. Save changes

---

## GitHub Environment Protection Rules

Configure these in **Settings → Environments:**

### `staging` Environment
- **Required reviewers:** None (auto-deploy on CI success)
- **Wait timer:** 0 minutes
- **Deployment branches:** `main` only

### `production` Environment
- **Required reviewers:** At least 1 team member
- **Wait timer:** 5 minutes (allows cancellation)
- **Deployment branches:** `main` only

---

## Required GitHub Secrets

| Secret | Purpose | Example |
|--------|---------|---------|
| `STAGING_API_URL` | Staging API base URL | `https://staging-api.zayjar.com` |
| `PRODUCTION_API_URL` | Production API base URL | `https://api.zayjar.com` |
| `DEPLOY_COMMAND_STAGING` | Staging deploy command (optional) | `ecs update-service ...` |
| `DEPLOY_COMMAND_PRODUCTION` | Production deploy command (optional) | `ecs update-service ...` |

> `GITHUB_TOKEN` is provided automatically by GitHub Actions for container registry pushes.
