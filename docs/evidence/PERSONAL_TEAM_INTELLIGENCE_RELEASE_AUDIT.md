# Personal and Team Intelligence Release Audit

Date: 2026-09-06  
Baseline commit: `7c4310a`  
Scope: the uncommitted local working tree; no commit, push, deployment, IAM change, or cloud-data
mutation was performed.

## Verdict

The local application is code-complete for the approved Personal and Team Intelligence scope. A
complete local release gate passed before the focused re-audit below; targeted compile, lint, and
regression checks then passed after its repairs. The audit found and repaired correctness,
retrieval, attachment, streaming, EOD, lifecycle, and experience gaps that were not covered by the
earlier implementation.

This is not a claim that the current Cloud Run revision is verified. Real Firebase, Firestore,
Cloud Storage, Gemini generation/transcription/embeddings, the deployed vector indexes, Maps key
restrictions, and Cloud Run streaming still require the documented production smoke test after the
local changes are published.

## Defects repaired in this audit

- Streamed personal and team messages now refresh their correctly scoped memory indexes after the
  exchange is persisted, without delaying or failing a successful conversation.
- Summary fallback retrieval no longer sends or cites unrelated zero-match captures. Weak evidence
  produces an explicit insufficient-evidence answer without calling Gemini.
- Personal and team Ask now use a structured Gemini response. Model citations are treated as
  untrusted and rejected unless the session was supplied, every message ID belongs to that source,
  and the supporting excerpt is copied exactly from the authorized evidence.
- Existing history can be indexed through bounded owner/admin actions: **Refresh saved memory** for
  a person and **Refresh team memory** for a team owner/admin. The result reports indexed, skipped,
  and failed items honestly.
- The reflection composer uses `MediaRecorder` plus the private server transcription path. It
  requests microphone access only on Record, shows elapsed recording state, enforces the five-minute
  and 15 MB limits, preserves failed audio for Retry/Discard, exposes an editable transcript, and
  never publishes until the user explicitly sends.
- Capture retries reuse the same request ID and uploaded attachments instead of creating duplicate
  exchanges or objects after an uncertain response.
- Personal and team source messages now render their private image/audio attachments after send and
  reload; object URLs are revoked and no public storage URL is introduced.
- Attachment substitution across user, session, and organization boundaries is rejected. Source
  deletion cascades to attachment metadata/object state and retrieval chunks.
- Team conversations use the same incremental NDJSON streaming/cancel/recovery behavior as personal
  conversations; duplicate pending indicators were removed.
- EOD submission now requires the caller's own completed organization-scoped `update` session.
  Viewers, foreign sessions, wrong capture types, and incomplete sessions are rejected.
- The optional EOD status surface exposes only an aggregate same-day submission count and never an
  individual attendance list.
- The Teams list shows the latest shared update, and personal Home shows bounded open loops derived
  only from stored summary next steps.
- Voice transcription keeps the current draft during asynchronous completion and presents a real
  retry/discard recovery state.
- The landing page now presents Cognaxis as Personal and Team Intelligence, with concise proof of
  grounded memory, voice/image capture, pattern insights, and role-controlled shared context instead
  of making the completed product look like the unextended starter journal.

## Security and isolation evidence

- Personal content remains under `users/{verifiedUid}/...`; team content remains under
  `organizations/{authorizedOrgId}/...`. There is no global content collection.
- All private routes retain the shared token, verified-email, live-account-status, rate-limit, and
  no-store pipeline. Owner UIDs and storage paths are never accepted from the browser.
- Firestore client rules remain deny-all; confidential reads/writes go through the authorized
  backend only.
- Personal Ask cannot retrieve another user's chunk. Team Ask cannot retrieve personal content or
  another team's content. Super admin responses contain operational metadata only.
- Attachment reads validate the exact authorized scope, parent session, and attachment ID.
- Gemini, transcription, and embedding credentials remain server-only; the repository and built
  browser bundle passed credential/policy scans.
- No hardcoded Google API key, private key, fake assertion, unresolved TODO/FIXME marker, or tracked
  `.env` file was found. `.env.example` contains names/placeholders only.

## Final local verification

The latest post-repair non-browser release gate passed:

- TypeScript application, server, test, component, and Playwright configurations: pass.
- ESLint: pass.
- Vitest: **66 files, 701 tests passed**.
- Production Vite/server build: pass.
- Client bundle and repository security policy checks: pass.

The preceding complete release gate also ran Playwright Chromium: **38 user-visible journeys passed**
in about 1.1 minutes. Those browser journeys were not repeated after the narrow focused re-audit.

### Focused re-audit on 2026-09-06

The subsequent lifecycle and team-experience review found and repaired these additional gaps:

- Team reflections can now be renamed through a role-authorized API and transactional Firestore
  write; archived reflections remain read-only.
- Archiving a personal or team reflection removes its semantic-memory index, while restoring it
  rebuilds the index on a best-effort basis. Active-session authorization remains the primary
  isolation boundary even if an external index cleanup fails.
- Team attachment deletion and transcription now reject missing or archived parent reflections.
- Rapid team-reflection switching ignores stale detail responses instead of letting an older request
  overwrite the latest selection.
- Team summary panels can be collapsed, newly generated summaries open deliberately, and existing
  summaries no longer monopolize the conversation view.
- Archived team management actions are hidden from viewers, and permanent team deletion now requires
  an explicit destructive confirmation.
- Archives no longer appear inside Home or team conversations. The account menu opens a dedicated,
  responsive Archives page; personal archives load there, team archives load only when their team is
  opened, and authorized users can restore or permanently delete each item. Normal reflection views
  no longer make background archive requests.
- Profile changes force-refresh the Firebase token so the backend and team member projections receive
  the new display name promptly. Profile image URLs are HTTPS-only.
- Ask Me keeps its memory-refresh action aligned with the desktop header and keeps the submit action
  on one line at narrow widths; the selected personal/team scope remains explicit.
- Voice input now remains active through browser silence and only commits on the explicit check action
  or the five-minute limit; the composer presents an in-row waveform with X/check controls.
- Gemini provider quota/rate-limit failures are normalized across replies, streams, attachments,
  transcription, embeddings, memory answers, summaries, and Insights so they are not misreported as
  generic server failures. This does not replace the provider project's own quota/billing setup.
- Reflection tags are canonical lowercase labels in a scoped persistent catalog: private tags,
  each organization's tags, and the session-to-tag references remain isolated. New reflections give
  the model the relevant catalog for tag reuse, and the UI supports picker assignment and filtering.
- Uploaded image and document attachments are now included in the post-message memory refresh: Gemini
  extracts searchable text or an image description, and the resulting bounded content is embedded
  into the same personal or organization-scoped Firestore vector chunk as the reflection.

After these repairs, all TypeScript configurations, ESLint, `git diff --check`, the production build,
repository security checks, and the complete **66-file, 702-test** Vitest suite passed. Focused
organization, journal, attachment-isolation, Ask Me, quick-reflection, history, and overlay runs were
also used while making the repairs.

The browser suite covers public/auth flows, verification and safe auth failures, personal journal
streaming/summary/persistence/deletion, private attachments, pending/error recovery, personal memory
with citations and cross-user isolation, check-ins, Insights, Places/map fallback, teams, invitation
acceptance/revocation, member/viewer/owner changes, shared streaming, Team Ask citations, EOD, super
admin suspension/restoration/audit behavior, keyboard operation, themes, and serious/critical
accessibility scans.

A separate manual visual pass reviewed the landing page and authenticated Home, Ask me, Insights,
Places, Teams, and Admin surfaces. The current hierarchy, spacing, state design, navigation, and
dark-theme consistency are coherent at the primary desktop viewport; no blank page, broken icon, or
unexpected browser-console error was observed.

## Remaining external verification and accepted residuals

1. Firestore rules emulator tests could not run because this machine has no Java runtime. The rules
   suite remains available through `npm run test:rules`; this is a local tooling prerequisite, not a
   passing result.
2. Run the production smoke suite after publishing with disposable accounts and cleanup. It must
   verify real Gemini streaming, summary JSON generation, audio transcription, private Storage,
   Firestore writes, semantic retrieval, Maps loading, and all required indexes/IAM.
3. `npm audit --omit=dev` reports six moderate and zero high/critical findings in the current
   `firebase-admin -> @google-cloud/storage -> retry-request/teeny-request/gaxios -> uuid` dependency
   chain. The suggested automatic remedy is a major downgrade to `firebase-admin@10.3.0`; it was not
   applied because it is not a safe maintenance upgrade. Keep the existing documented dependency
   risk and update when the upstream chain provides a compatible fix.
4. The automated UI matrix intentionally uses Chromium. A final physical-device/mobile and screen-
   reader spot check is still useful before the public demo, but it is not a code blocker.

## Recommended next action

Review the local diff, commit it as one release candidate, sync it to AI Studio, publish a new Cloud
Run revision, apply the deployment checklist (Storage/IAM/secrets/vector indexes/Maps restrictions),
and run the production smoke suite. Do not treat the previously published revision as containing
these local repairs until that publish completes.
