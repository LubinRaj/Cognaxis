# Phase 3 Unified Product UI Evidence

Status legend: `IMPLEMENTED`, `TESTED`, `CONFIGURED EXTERNALLY`, `DEFERRED`, `BLOCKED`

Scope: the authenticated personal journal, the shared design system it consumes, and the branded
Firebase email-action surface. The authentication screens delivered in Phase 2 were preserved, not
redesigned; their behaviour tests still pass unchanged apart from sign-out moving into the account
menu.

## 1. Design system and primitives

| Requirement | Status | Evidence |
|---|---|---|
| One semantic token system for landing, auth, and workspace | TESTED | `src/client/styles.css` gained success, warning, scrim, focus-ring, radius, and duration roles with light and dark values. `tests/component/ui-primitives.test.tsx` asserts no primitive carries an `emerald`, `teal`, `zinc`, `slate`, or `sky` class. |
| Shared primitives | TESTED | `src/client/components/ui/`: `Button`, `IconButton`, `Surface`, `TextField`, `Chip`, `InlineAlert`, `Dialog`, `Menu`, `EmptyState`, `Skeleton`, `Avatar`. 30 tests cover disabled, loading, focus, keyboard, and error behaviour. |
| One icon language | TESTED | `lucide-react` removed from `package.json`; every live component uses the `MaterialIcon` wrapper. A repository search for `lucide-react` returns nothing. |
| Reduced motion | IMPLEMENTED | A global `prefers-reduced-motion` rule in `styles.css` removes animation and transition duration; spinners use `motion-safe:`/`motion-reduce:` variants. |
| Dialog and Menu accessibility | TESTED | Focus trap, Escape, backdrop close, scroll lock, focus restoration, arrow-key navigation, disabled-item skipping, and outside-click close are each asserted. `axe-core` reports no serious or critical violation. |

A defect was found and fixed here: the focus trap filtered candidates on `offsetParent`, which is
`null` for fixed-position elements and always `null` without a layout engine. The trap silently
degraded to trapping on the panel itself. It now excludes only `hidden` and `aria-hidden` subtrees,
and the dialog tests exercise a real trap.

## 2. Product truthfulness

| Requirement | Status | Evidence |
|---|---|---|
| Only real capabilities are visible | TESTED | `tests/component/workspace-history.test.tsx` asserts the interface contains no "Personal Vault", "Workspace Boundary", "UID", "MVP", "Org", or "Scope" text. |
| No mock records after authentication | TESTED | `src/client/data/` and `src/client/lib/mockStore.ts` are deleted. `mockData.ts` was in the production import graph through `ExportModal`; that import is gone with the module. |
| Prototype modules removed | IMPLEMENTED | Removed: `AudioMemosView`, `BentoGridView`, `CalendarView`, `GuidesView`, `MacNavSidebar`, `MainEditorCanvas`, `MediaGalleryView`, `SettingsModal`, `TimelineColumn`, `guidesData`, `mockData`, `mockStore`, `utils`, plus the superseded `JournalWorkspace`, `Sidebar`, `Header`, `ConversationView`, `Composer`, `MemoryCard`, `ExportModal`, and `DeleteConfirmModal`. An import-graph walk from `main.tsx` confirms nothing unreachable remains. |
| Unused dependencies removed | IMPLEMENTED | `lucide-react`, `clsx`, `tailwind-merge`, and `motion` were removed after a clean import search. Entry chunk fell from 751 kB to 644 kB and the entry stylesheet from 93 kB to 40 kB. |
| No unsupported security claim | TESTED | The account privacy dialog is asserted to contain no "zero-knowledge", "encrypted at rest", or "100%" claim. The summary surface is asserted to contain no storage path, uid, or tenant wording. |

## 3. Workspace behaviour

| Requirement | Status | Evidence |
|---|---|---|
| Operation-specific loading states | TESTED | `useWorkspaceController` exposes separate `workspaceStatus`, `sessionStatus`, `createStatus`, `sendStatus`, `summaryStatus`, and `deleteStatus`. A test asserts the "Cognaxis is responding" indicator never appears while another reflection is opening. |
| Rapid selection ends on the latest choice | TESTED | A request-sequence guard drops superseded session responses; the test holds three overlapping requests and asserts the third reflection wins. |
| Failed send restores the exact draft | TESTED | The draft, including its line break, is restored and the optimistic message removed. A regression test switches reflections while the failed request is pending and confirms the draft and error remain attached only to their originating reflection. |
| Summary survives navigation and reload | TESTED | `SessionDetail` now carries `summary`, populated by `JournalService.getSession` through the same user-scoped `getSummary` repository call. `tests/integration/session-summary.test.ts` covers present, absent, current, and stale cases. The current-summary app-bar action expands and scrolls to the stored summary without calling the summarize API. |
| Themes and next steps rendered | TESTED | Both are asserted in the summary surface and in both export formats. |
| Session counts stay consistent | TESTED | `applyExchange` advances the count by exactly two and marks the summary current only when the server returned one. A component test asserts the history row moves from "2 messages" to "4 messages". |
| Export contains only the active reflection | TESTED | Markdown and JSON generation are deterministic pure functions with 20 unit tests, plus a download test that reads the produced Blob. Filenames derive from a fixed prefix and date only. |
| Delete handles recent-auth expiry | TESTED | A `401 RECENT_AUTH_REQUIRED` hands control to the auth state machine, the private title disappears, and exactly one DELETE is issued with no automatic replay. |

## 4. Security and privacy

| Requirement | Status | Evidence |
|---|---|---|
| Summary read stays ownership scoped | TESTED | The summary is read with the verified uid through the existing repository. A cross-user request for a known session id returns `404` with no summary text, no theme, and no session id in the body. |
| Unverified accounts still denied | TESTED | Session detail, and therefore the summary, returns `403 EMAIL_VERIFICATION_REQUIRED` before any repository read. |
| Content rendered as text | TESTED | A model message containing `<img src=x onerror=alert(1)>` renders as text; the test asserts no `img` or `b` element exists in the message. |
| No private data in browser storage | TESTED | After a full journal session the only stored key is `cognaxis_theme_preference`. Tokens, addresses, and message content are asserted absent. |
| Export never uploaded | TESTED | The request log is asserted unchanged across a download, and the object URL is revoked. |
| Account switching clears private state | TESTED | The workspace is keyed by verified uid; the User A to User B test asserts no User A record survives and every request carries User B's token. |

## 5. Branded email-action surface

| Requirement | Status | Evidence |
|---|---|---|
| State-driven handler at `/auth/action` | TESTED | `AuthActionSurface` renders checking, reset form, reset complete, verifying, verified, email recovered, invalid, and configuration-unavailable states. |
| Documented Firebase methods only | TESTED | `verifyPasswordResetCode` then `confirmPasswordReset` for reset; `applyActionCode` for verification; `checkActionCode` then `applyActionCode` for recovery. Each is asserted. |
| Action code treated as a one-time credential | TESTED | Only `mode`, `oobCode`, and `continueUrl` are read; `apiKey` and `lang` are ignored. The code is held in a ref, cleared after use, and `history.replaceState` removes it from the visible URL. Storage is asserted free of the code, the address, and the password. |
| Invalid, expired, and reused links fail safely | TESTED | The raw Firebase message is replaced by generic copy; the code, the `Firebase:` prefix, and the account address are all asserted absent from the rendered page. |
| Continuation allowlisting | TESTED | 10 unit tests reject other hosts, protocol-relative references, `javascript:`, `data:`, `file:`, and credentials-in-URL forms, and only ever return an in-application path. A component regression test confirms the validated path is passed to the return action. |
| No automatic sign-in after reset | TESTED | An explicit "Return to sign in" action is required and no credential call is made. |
| Firebase template configuration | BLOCKED | Until the console templates point at the deployed route, Firebase keeps its own hosted page. The sequence and the stop condition are recorded in `docs/deployment/CLOUD_SETUP_CHECKLIST.md` section 2.2. This release must not be described as having a custom handler in production. |

## 6. Commands run and results

Executed against the working tree. No commit, push, publish, deployment, or cloud mutation was
performed.

| Command | Result |
|---|---|
| `npm ci` | Clean install from `package-lock.json` |
| `npm run typecheck` | Pass, four projects |
| `npm run lint` | Pass, no errors or warnings, no disabled rules |
| `npm test` | Pass. 27 files, 341 tests. The earlier 339-test baseline was repeated 12 consecutive times; the two added regression tests pass in the final full run. |
| `npm run build` | Pass. Entry 645.05 kB, `AuthSurface` 323.15 kB, `AuthActionRoute` 9.88 kB, shared FirebaseUI theme 10.25 kB plus its 30.76 kB stylesheet |
| `npm run security:check` | Pass, including the client bundle inspection |
| `npm audit` | 6 moderate findings, all the pre-existing D-01 path. No new finding. |

### Flakiness diagnosed and removed

A full-suite run failed once in twelve with `Unable to find role "heading" and name "Welcome back"`.
The cause was the lazily imported authentication surface occasionally taking longer than Testing
Library's one-second async timeout while 27 files ran in parallel. The fix resolves the dynamic
import inside the render helper before the first render, so Suspense no longer races a query
timeout. The timeout itself was not raised and no retry was added.

That change immediately exposed a second, latent defect: the export test replaced the whole `URL`
global with an object spread, which removed the constructor. It only mattered once module loading
moved after the stub. The test now spies on `createObjectURL` and `revokeObjectURL` alone. Twelve
further consecutive full runs passed.

### Bundle inspection

`scripts/security/inspect-client-bundle.mjs` was extended and negative-tested in both directions.
It now fails the build if FirebaseUI reaches the entry chunk, if a server-side credential marker
appears in any asset, if source maps are emitted, if no stylesheet maps FirebaseUI colours to
Cognaxis tokens, if that mapping is declared inside a cascade layer where the FirebaseUI theme
layer could override it, or if the mapping leaks into the entry stylesheet.

## 7. Not done

| Item | Reason |
|---|---|
| Visual regression screenshots at the seven required widths, in both themes | No browser automation was run in this session. Layout was built to the specified breakpoints and asserted structurally, but pixel output has not been observed. |
| 200% zoom and 320 px reflow verification | Requires a real browser. |
| Screen-reader spot check | Requires assistive technology; automated `axe-core` scans and keyboard walkthroughs were run instead. |
| Contrast verification for both themes | `axe-core`'s colour-contrast rule cannot run without a layout engine and is explicitly disabled rather than silently passed. Token values follow the Material 3 tonal steps but have not been measured. |
| End-to-end journeys against a real backend | The Firebase emulators need a Java runtime that is not installed, and a live run needs project-owner approval. |
| Firebase console configuration | External; see the deployment checklist. |

## 8. Residual risks

- The summary now travels with session detail. It is read through the same user-scoped repository
  call as the messages, so it inherits the existing authorization, but it does widen the session
  detail response. Cross-user and unverified denial are both covered by tests.
- The interface trusts `messageCount` and `summarizedMessageCount` to decide whether a summary is
  current. If a future server change updates one without the other, the interface would show a
  stale-summary hint that a user cannot clear. The derivation is a pure, unit-tested function, so
  the contract is at least explicit.
- Local filtering only searches the reflections already loaded, capped at 30 by the list request.
  The heading changes to "Matching reflections" while filtering to make the scope visible, but a
  user with more than 30 reflections cannot find older ones by title until a server-side search
  exists.
- Export produces a file that leaves every Cognaxis protection behind. The dialog says so plainly,
  but nothing can enforce it after download.
- The branded action page is complete and tested, yet unreachable until the Firebase templates are
  reconfigured. Until then it is dead weight in the bundle, at 9.85 kB in its own lazy chunk.
