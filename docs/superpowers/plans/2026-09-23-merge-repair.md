# Merge repair and production readiness

User authorization: fix the reviewed problems and identify production gaps. Implement in the current checkout; preserve existing data and the user's lockfile changes. No deployment or purchases are authorized.

## Implementation sequence

- [x] Restore approved test tooling and add contract regressions. Updated vulnerable Vitest to 4.1.11.
- [x] Backend roadmap: multiline experience, explicit level, bounded rich metadata and arithmetic weights totaling 100; legacy inputs remain accepted.
- [x] Mobile roadmap: retain metadata and weights; migrate both known shapes; preserve unreadable data and gate navigation on hydration.
- [x] CV lifecycle: evidence notes, local completion, CV-screen queue with fresh state, stop new work off-screen, aligned deadlines and safe provider 429.
- [x] RevenueCat: consumers subscribe to SDK customer-info updates; Expo Go guard, purchase/restore feedback, target creation/switching/deletion, unsupported rewrite claim removed.
- [x] Intake: custom roles, follow-up questions, actual byte limits, cache cleanup, stale-result protection.
- [x] Auth and abuse: approved SecureStore migration with read-back check, auth timeout, revoked-session recovery, project-wide quota ceiling. Attestation/ingress provisioning remains a launch gate.
- [x] Local UX: empty-roadmap recovery, focus editing/check-ins, asymmetric schedule rounding and stale due dates corrected. Notifications remain unimplemented and are documented as such.
- [x] Production code/config: backend-only Docker install, context exclusions, release mock/HTTPS checks and current setup documentation.
- [x] Read-only independent review; reproduced and fixed its asymmetric schedule finding and rejected-file cleanup gap.
- [ ] Live device, store, provider and deployed infrastructure acceptance — requires external configuration/builds; see production-readiness.md.

## Review focus

Regression tests cover mobile requests reaching real backend validators, legacy data surviving migration, successful purchase updating its consumer, work enqueued during an active CV request, unavailable credentials and revoked sessions, unequal weights, deadline rounding, and malicious or missing PDF metadata. Native store purchases, OS secure-storage migration, document-picker cleanup and rendering require a development build on a real device.
