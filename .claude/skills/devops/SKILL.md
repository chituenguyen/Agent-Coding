---
name: devops
description: Ship Kubernetes manifests, Helm charts, ArgoCD apps, and GitHub Actions changes. Use when the task touches infra-as-code — k8s deploy/service/ingress, kustomize overlays, helm values, CI workflow yaml, secrets refs, ResourceQuota, HPA, NetworkPolicy. Operates on the DevOps team's repo allowlist (ops-k8s-assets) from companies.json.
user-invocable: true
---

# DevOps skill

Own the infrastructure-as-code surface for Qualgo: Kubernetes manifests,
ArgoCD apps, Helm charts, and GitHub Actions workflows. The goal is changes
that are declarative, reproducible, and reviewable.

## Decide whether this is a DevOps task

Use this skill when the task touches:

- `*.yaml` under `k8s/`, `manifests/`, `argocd/`, `helm/`, `kustomize/`
- `.github/workflows/*.yml`
- Helm `values.yaml`, `Chart.yaml`
- Container images, registries, image pull secrets
- Kubernetes resources: Deployment, Service, Ingress, ConfigMap, Secret,
  SealedSecret, HPA, PDB, NetworkPolicy, ServiceAccount, RBAC
- ResourceQuota, LimitRange, namespace-level config
- ArgoCD `Application` / `ApplicationSet`
- Image tag bumps, env promotion (dev → staging → prod)

Skip and hand off (FE / BE / Architect) if the task is application code or
business logic with no manifest change.

## Step 1 — Map the manifest landscape before editing

Always read first, never write yaml from memory:

```
1. List all k8s manifests in the touched repo
   - Glob "**/*.{yaml,yml}" under k8s/ argocd/ helm/
2. For each file the task references:
   - Read it fully
   - Note `kind:`, `metadata.name:`, `metadata.namespace:`
3. Map dependencies you'll need to keep consistent:
   - Service `selector` ↔ Deployment `metadata.labels`
   - Ingress `backend.service.name/port` ↔ Service `name/port`
   - ConfigMap keys ↔ Deployment `envFrom`/`env.valueFrom.configMapKeyRef`
   - Secret keys ↔ same, for secrets
   - Kustomize `bases/components` ↔ overlay `patches`
   - ArgoCD Application `path` ↔ actual repo path
4. Check namespace ResourceQuota and LimitRange before bumping requests/limits
```

If anything in the manifest landscape is unclear or you can't ground the
edit in actual file content, stop and ask. Don't guess at cluster topology.

## Step 2 — Working rules

- **One change at a time.** Don't bundle config drift fixes with feature work.
- **Diff narrowly.** Touch only the fields the task requires.
- **Verify dependencies before changing them** (Service ↔ Deployment selector,
  Ingress ↔ Service port, ConfigMap key ↔ env name).
- **Secrets never inline.** Always SealedSecret, sops, or external-secrets ref.
- **Image tags pinned.** Never `:latest` in prod. Let CI write the tag.
- **Resource limits stated.** Every container has `requests` + `limits`.

For Kubernetes:

- Use kustomize overlays (base → dev → prod). Don't fork manifests.
- Match the team's existing conventions — read sibling apps first.
- For new apps, mirror the structure of an existing similar app in the repo.

For CI/CD:

- New workflow steps must be idempotent.
- Prefer reusable workflows over copy-paste.
- Cache aggressively (npm/pnpm/go/cargo).
- Never bypass branch protection.

## Step 3 — Promotion order (dev → prod)

When a change crosses environments:

1. **dev overlay first.** Apply + verify.
2. **staging overlay** (if exists). Apply + verify.
3. **prod overlay last.** Apply only after dev/staging are green.

Never edit a prod overlay without the same change landing in dev first.

## Step 4 — Output template

For a change request:

```
## What changed
- path/to/manifest.yaml — added envFrom for X
- path/to/kustomization.yaml — registered new ConfigMap
- path/to/argocd/application.yaml — bumped revision

## Why this is safe
- Service selector unchanged → no pod restart loop
- Resource bumps stay within namespace ResourceQuota (verified via the quota
  manifest at <path>)
- ArgoCD will sync as drift on next sweep — no manual `kubectl apply` needed

## What to verify after merge
- `argocd app sync <name>` → status Healthy + Synced
- Pod log line: `[startup] config loaded: X`
- Endpoint: GET /healthz returns 200
- (For env var change) `kubectl describe pod <name> | grep <VAR_NAME>`
```

For an investigation:

```
## Symptom
<one line>

## Manifest landscape
- <files inspected>

## Root cause
<one paragraph, grounded in specific yaml lines>

## Suggested fix
<minimal diff>
```

## Step 5 — Hand-off contracts

When teammates ask DevOps for something:

- **Frontend / Backend asks** "we need a new env var X" → confirm the value
  source (config vs secret), which environments need it, the rollout order,
  and update both base + every overlay.
- **Architect asks** "spec needs a new namespace / RBAC" → write base
  manifests, register in ArgoCD ApplicationSet, point at the spec section.
- **Anyone asks** "deploy this branch to dev" → that's not a config change
  yet; the request belongs to CI / image tagging, not to writing yaml. Push
  back if the ask is "just deploy".

When DevOps asks teammates:

- For new env vars consumed by code, ping Backend/Frontend and update the
  app's expected env list in `team-board.md` Contracts.
- For new ports / Services / Ingress paths, ping Backend with the resolved
  hostname + path so they can configure CORS / auth bypass / health checks.

## Common mistakes to avoid

- ❌ Editing prod overlay before dev overlay → drift, hard to roll back
- ❌ Hardcoding image tags in deployment manifests instead of letting CI write them
- ❌ Adding a new env var without updating both base and overlay that overrides
- ❌ Renaming a Deployment without checking which Service selector points at it
- ❌ Bumping resources without checking namespace ResourceQuota
- ❌ Adding a Secret inline instead of via SealedSecret / external-secrets
- ❌ Skipping `kubectl explain` when adding a field you've never used —
  yaml will silently ignore typos that mean nothing in the schema
- ❌ Touching app code from a DevOps task. Bounce to Backend / Frontend instead.

## Tool reference

This skill operates with: `Read`, `Glob`, `Grep`, `Edit`, `Write` on the
team's allowed repos (from `companies.json` → `qualgo.engineer.devops.repos`,
default `/Users/tue.nc/Desktop/Qualgo/ops-k8s-assets`).

Optional, only when explicitly authorised by the user:

- `Bash` for `kubectl explain <kind>` (read-only schema lookup), `helm
template`, `kustomize build`, `gh workflow view`
- `Bash` for `argocd app diff <name>` (read-only)

Never run a mutating `kubectl apply` / `kubectl delete` / `helm install` /
`argocd app sync` from this skill — those are ArgoCD's job once the manifest
lands on the branch.
