# Production logging and CI

## Application logs

The backend emits one JSON `http_request` record on response completion or connection close. `X-Request-ID` is generated on the server for each request and returned to the caller; incoming IDs are not trusted or echoed. Fields are allowlisted:

- `timestamp`, `requestId`, `event`, `severity`
- `route` (known routes only; unknown paths become `unmatched`), `method` (known methods only)
- `status`, `durationMs`, `errorCategory`

No request/response content, query parameters, original URLs, user IDs, IPs, headers, tokens, raw exceptions or stack traces are serialized. Parser failures use safe response messages instead of Express's default error output. Logger failures do not interrupt responses. Aborted responses use the telemetry-only status 499; this does not claim a 499 response was delivered to the client. Duration measures the whole application request, including body parsing, authentication, attestation, quota and generation.

Useful categories:

| Signal | Category | Severity |
| --- | --- | --- |
| Application quota 429 (UID or global) | `application_quota` | WARNING |
| Provider capacity 429 | `provider_quota` | WARNING |
| Quota storage failure 503 | `quota_store_unavailable` | ERROR |
| Generation failure 502 | `generation_failed` | ERROR |
| Unexpected failure 500 | `internal_error` | ERROR |
| Invalid Auth / App Check | `authentication` / `app_check` | WARNING |
| Bad input / malformed JSON / oversized body | `validation` / `invalid_json` / `request_too_large` | WARNING |
| Client disconnected | `request_aborted` | WARNING |

Cloud Run collects stdout; configure log-based metrics and alerts in the production project. Example Logs Explorer filters:

```
resource.type="cloud_run_revision"
jsonPayload.event="http_request"
jsonPayload.status>=500
```

For provider throttling filter `jsonPayload.errorCategory="provider_quota"`; for broken quota storage use `jsonPayload.errorCategory="quota_store_unavailable"`. Define a latency distribution from `jsonPayload.durationMs`. Never use request IDs as metric labels (unbounded cardinality). Choose thresholds from staging traffic, set a retention policy and access controls, and assign alert ownership. These cloud settings are not provisioned by this patch.

This schema protects application logs only. Cloud Run/load balancers and third-party SDKs have separate logging policies; review them independently. Never put personal content or credentials in URLs. HTTP request IDs are not Cloud Trace IDs and automatic Cloud Trace correlation is not implemented.

## GitHub Actions

`.github/workflows/ci.yml` runs on pushes, pull requests, manual dispatch and weekly schedules. It uses read-only repository permissions, non-persisted checkout credentials, commit-pinned actions, job timeouts and cancellation of obsolete runs. It does not deploy, publish an image, run real AI/purchase calls or receive production secrets.

Required checks to select in repository branch protection after the first successful run:

1. **TypeScript, tests and production config**: lockfile install, both TypeScript projects, backend/mobile suites, production configuration contracts for both platforms, audit-gate regression tests. Native APIs are mocked. Synthetic configuration proves validation rules, not that production URLs, files or keys are provisioned or valid.
2. **Secret scan**: checksum-pinned Gitleaks scans the fetched Git history with 100% finding redaction. A real historical secret must be revoked/rotated and remediated; do not hide it behind a broad baseline. The scanner cannot guarantee detection of every possible secret. Local uncommitted/ignored files are not scanned by GitHub CI.
3. **Dependency audit**: reports every severity in a 14-day artifact; high/critical findings fail, existing moderate/low findings remain visible without blocking. Registry outages, invalid/missing reports and unexpected command exits fail closed. The job audits the lockfile without executing install scripts. A passing gate does not mean zero vulnerabilities.
4. **Backend Docker build and health check**: builds the existing image, verifies non-root runtime, and calls `/health` without Firebase or Gemini credentials. No image is pushed. This does not prove protected endpoints or provider availability.

Enable the workflow and require all four checks in branch protection/rulesets. Restrict who can change workflows, and review version/checksum updates. CI cannot enforce merge policy until these repository settings are enabled. Fork PRs may require a maintainer to approve the workflow run; never switch to `pull_request_target` to execute untrusted PR code with privileged credentials.

## Dependency audit exceptions

`scripts/check-audit.mjs` blocks on a high or critical vulnerable package whose **effective severity** is still high or critical. Effective severity is the highest severity among the advisories behind the package, including ones it inherits through dependencies, that have no valid exception. Moderate and low advisories never block and need no exception; they are printed as informational. A finding can be excepted by an entry in `scripts/audit-exceptions.json`: `{ advisory: "GHSA-…", package, severity, scope: "dev-tooling" | "unreachable", justification, owner, expires: "YYYY-MM-DD" }`, matched per advisory to the package the advisory is on. An entry is never used if the advisory is critical, the entry's severity is lower than the advisory's, its justification or owner is blank, it has expired, or it expires more than 90 days from today. A new high or critical advisory on an excepted package blocks until reviewed. A malformed exceptions file or audit report exits 2 (fail closed). Entries matching no current finding only warn, and every active exception is printed with its days remaining. Do not add an entry without checking the advisory is truly unreachable, and do not renew one without re-checking; the gate cannot judge reachability.

## Local verification

```
npm run typecheck
node node_modules/vitest/vitest.mjs run backend/src/observability/requestLog.test.ts backend/src/app.test.ts mobile/app.config.test.ts
node --test scripts/check-audit.test.mjs
git diff --check
```

The GitHub workflow has not yet run for these uncommitted changes. Docker, Gitleaks and actionlint are not installed in the current local environment; their execution is not claimed as locally verified. Workflow YAML parsing and action-pin checks are separate from an actual GitHub run.

References: [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use), [Gitleaks usage](https://github.com/gitleaks/gitleaks#usage).
