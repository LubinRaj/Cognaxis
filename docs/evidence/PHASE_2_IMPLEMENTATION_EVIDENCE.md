# Phase 2 Implementation Evidence

Status legend: `IMPLEMENTED`, `TESTED`, `CONFIGURED EXTERNALLY`, `DEFERRED`, `BLOCKED`

This record distinguishes source implementation from cloud configuration and observed runtime evidence. It must not be used to claim that unconfigured cloud controls are active.

| Requirement or control | Status | Current evidence |
|---|---|---|
| Firebase Google Sign-In through the official FirebaseUI provider button | IMPLEMENTED | `src/client/components/auth/GoogleAuthButton.tsx`, `src/client/auth/firebase-ui.ts`; real Google OAuth requires a live smoke test |
| Firebase email/password registration and sign-in | TESTED | `src/client/components/auth/AuthSignUpScreen.tsx`, `AuthSignInScreen.tsx`; component suites drive both flows against a synthetic Firebase Auth module |
| Popup sign-in with an approved redirect fallback | TESTED | `src/client/auth/firebase-ui.ts` (`popupWithRedirectFallback`); `tests/component/auth-sign-in.test.tsx` proves redirect is used only for popup-blocked, not for user cancellation |
| Email verification send, resend cooldown, and confirmation | TESTED | `src/client/components/auth/AuthVerifyEmailScreen.tsx`, `src/client/auth/AuthProvider.tsx`; `tests/component/auth-verify-email.test.tsx` |
| Verified-email access gate on every private route | TESTED | `src/server/middleware/require-verified-email.ts`, `src/server/routes/journal-routes.ts`; `tests/integration/verified-email-boundary.test.ts`, `tests/unit/require-verified-email.test.ts` |
| Verification status derived only from a verified token claim | TESTED | `src/server/auth/firebase-token-verifier.ts`; integration tests reject client-supplied `emailVerified`, `uid`, `email`, provider, and header claims |
| Password reset with an enumeration-resistant confirmation | TESTED | `src/client/components/auth/AuthForgotPasswordScreen.tsx`, `AuthResetSentScreen.tsx`; `tests/component/auth-forgot-password.test.tsx` compares known and unknown addresses |
| No application-owned authentication endpoint | TESTED | `src/server/routes/journal-routes.ts` exposes only journal routes; `tests/component/auth-sign-up.test.tsx` asserts no `fetch` occurs during account creation |
| Enumeration-resistant credential messaging | TESTED | `src/client/auth/auth-errors.ts` plus the Cognaxis FirebaseUI locale in `src/client/auth/firebase-ui.ts`; `tests/unit/auth-errors.test.ts` proves one identical message across five credential codes |
| Redaction of untranslated provider errors | TESTED | Every submit path and the Google button route failures through `getFirebaseAuthErrorMessage`; sign-in and sign-up suites assert no `Firebase:` or `auth/` text reaches the user |
| Centralised auth state machine with a single Firebase observer | TESTED | `src/client/auth/auth-state.ts`, `src/client/auth/AuthProvider.tsx`; `tests/unit/auth-state.test.ts` covers the full transition table and rejects every undefined transition; `tests/component/auth-bootstrap.test.tsx` asserts exactly one observer |
| Bootstrap without a signed-out or private flash, with a bounded retry | TESTED | `src/client/components/auth/AuthLoading.tsx`; `tests/component/auth-bootstrap.test.tsx` |
| Firebase-managed token refresh with one bounded retry | TESTED | `src/client/auth/token-retry-policy.ts`, `src/client/lib/api-client.ts`; `tests/unit/token-retry-policy.test.ts`, `tests/unit/api-client.test.ts` |
| No application-managed token or refresh-token storage | TESTED | `tests/component/auth-session-isolation.test.tsx` asserts no token, bearer header, or address appears in `localStorage` or `sessionStorage` |
| Private state cleared on sign-out and account switch | TESTED | Workspace keyed by verified `uid` in `src/client/App.tsx`; `tests/component/auth-session-isolation.test.tsx` |
| Session-expired recovery after a terminal token failure | TESTED | `src/client/components/auth/AuthSessionExpiredScreen.tsx`; `tests/component/auth-session-isolation.test.tsx` |
| Lazy loading of FirebaseUI away from the authenticated workspace | TESTED | `src/client/App.tsx` dynamic import; build emits a separate `AuthSurface` chunk, and CI runs `scripts/security/inspect-client-bundle.mjs` immediately after the build to reject FirebaseUI in the entry chunk |
| Cognaxis Material token theming for FirebaseUI, light and dark | TESTED | `src/client/styles/firebase-ui-theme.css` maps every `--fui-*` variable to `--sys-*` in an unlayered rule so the in-app theme control, not the operating system, drives FirebaseUI; `tests/component/auth-theme-accessibility.test.tsx` |
| Accessibility of every authentication screen | TESTED | `tests/component/auth-theme-accessibility.test.tsx` runs `axe-core` on five screens plus an error state, and covers keyboard-only navigation, focus order, field error association, and the skip link |
| Configuration-required screen fails closed and reveals no value | TESTED | `src/client/components/ConfigurationRequired.tsx`; `tests/component/auth-configuration-required.test.tsx` |
| Recovery when the lazy authentication chunk fails to load | TESTED | `src/client/components/auth/AuthSurfaceBoundary.tsx`; `tests/component/auth-surface-boundary.test.tsx` proves a bounded reload action and that no asset path or error text is rendered |
| Firebase project provider, enumeration protection, password policy, and email templates | CONFIGURED EXTERNALLY | Pending; see `docs/deployment/CLOUD_SETUP_CHECKLIST.md` section 2.1 |
| Firebase Emulator Suite end-to-end authentication journeys | BLOCKED | The Firebase emulators require a Java runtime, which is not installed in this environment, and `firebase-tools` is not installed. No emulator run has been performed. |
| Browser end-to-end and visual/responsive screenshot capture | BLOCKED | A read-only local browser smoke verified landing/auth navigation and theme switching. No repeatable browser E2E suite or responsive screenshot matrix has been run. |
| Live Google OAuth and real Firebase email delivery smoke test | BLOCKED | Requires project-owner approval to exercise the live Firebase project. Not performed. |
| Backend Firebase ID-token verification | TESTED | `src/server/auth/firebase-token-verifier.ts`; full negative token matrix in `tests/integration/verified-email-boundary.test.ts` |
| Server-derived personal identity and paths | TESTED | Firestore repository plus cross-user API tests |
| Confidential direct Firestore browser access denied | IMPLEMENTED | `firestore.rules`; emulator deployment/test pending |
| Personal sessions and messages | TESTED | Journal service, repository, and API integration suite |
| Multi-turn server-side Gemini call | IMPLEMENTED | Gemini model adapter; real call pending secret configuration |
| Structured auto-summary with provenance | TESTED | Service/repository path with synthetic model; real Gemini output pending integration test |
| Secret Manager access with ADC and pinned version | IMPLEMENTED | `src/server/services/secret-provider.ts`; IAM/runtime verification pending |
| Exact-origin CORS, CSP, no-store, body bounds, rate headers | TESTED | API integration suite |
| Unknown-field and oversized-input rejection | TESTED | Zod unit and API integration tests |
| Deletion removes source messages and derived summary | TESTED | Synthetic repository/API integration test |
| Cross-organization authorization | DEFERRED | Organization interface disabled; membership backend not implemented |
| Semantic vector retrieval | DEFERRED | Not required for base Personal Gemini Journal; future enhancement |
| Voice, uploads, calendar, email, external tools | DEFERRED | Gated by Phase 1 threat model |
| App Check | DEFERRED | Planned as later abuse defence; never a substitute for authentication or authorization |
| Cloud Run deployment and runtime IAM | CONFIGURED EXTERNALLY | Pending project-owner-approved cloud setup |

## Local verification record

Executed on 31 August 2026 against the working tree, with no commit, push, deploy, or cloud
mutation performed.

| Command | Result |
|---|---|
| `npm ci` | Clean install from `package-lock.json` |
| `npm run typecheck` | Pass. Four projects: client, server, node tests, client tests |
| `npm run lint` | Pass. No errors, no warnings, no disabled rules |
| `npm test` | Pass. 17 files, 165 tests |
| `npm run build` | Pass. Entry chunk 751.45 kB, lazy `AuthSurface` chunk 327.55 kB plus its own 30.70 kB stylesheet |
| `npm run security:check` | Pass. Repository policy checks and client bundle inspection |
| `npm audit` | 6 moderate findings, all on the single `firebase-admin -> @google-cloud/storage -> uuid` path recorded as D-01. No new finding of any severity was introduced by the authentication dependencies. |
| `npm run test:e2e` | Not available. No end-to-end runner is installed; the emulator journeys it would drive are blocked as recorded above. |

### Bundle inspection detail

- `fui-`, `@firebase-oss`, `tanstack`, and `nanostores` appear zero times in the entry chunk and
  only in the lazily loaded authentication chunk.
- `libphonenumber-js` is tree-shaken out of both chunks, so the unused phone and MFA code paths do
  not ship.
- No asset contains a Gemini key marker, service-account material, private key block, or OAuth
  access token pattern.
- No source map is emitted into the production client build.

## Defects found and fixed during implementation

| Defect | Impact | Resolution |
|---|---|---|
| FirebaseUI's shipped English copy names the exact credential failure (`No account found with this email address`, `Incorrect password`, `An account already exists with this email`) | Email enumeration through response text, contradicting a mandatory control | A Cognaxis locale registered through `registerLocale` replaces every enumeration-revealing string, and the Cognaxis error adapter sanitises the rendered message independently |
| `ERROR_CODE_MAP` in `@firebase-oss/ui-translations` omits popup, domain, session, and internal error codes, so `FirebaseUIError` falls back to the raw Firebase message | Raw provider text, including `auth/` codes, reaching the user through FirebaseUI's own provider button and submit actions | Cognaxis owns the submit action for sign-in, sign-up, and password reset, and renders its own Google button, routing every failure through `getFirebaseAuthErrorMessage` |
| FirebaseUI wraps the label, the input, and any action button in one `<label>` element | Two labelable controls share one label, and the password visibility control is announced as the password field | Cognaxis renders its own field component with an explicit `htmlFor`/`id` pair, `aria-describedby` error association, and the reveal control outside the label's control set |
| FirebaseUI inputs carry no `autocomplete` attribute | Password managers and assistive technology receive no field purpose | The Cognaxis field sets `email`, `current-password`, and `new-password` explicitly |
| The FirebaseUI stylesheet redefines `--color-primary` and switches its dark palette with `prefers-color-scheme` | The application palette could be hijacked, and FirebaseUI would follow the operating system rather than the in-app theme control | An unlayered rule maps every `--fui-*` variable to the Cognaxis `--sys-*` tokens and re-asserts the application tokens, so both follow `data-theme` |
| The password policy result could be applied to a password it was not computed for | A stale policy verdict could block or allow the wrong value | `usePasswordPolicy` returns the exact value it validated, and the submit guard only applies a verdict computed for that value |
| `Cannot update ref during render` in the sign-up screen | React correctness defect flagged by the lint rules | The policy snapshot is written in an effect |
| Two identically named `Show password` controls on the sign-up screen | Ambiguous accessible names | The reveal control derives its name from its field label |
| The verification screen offered a route back to the public page | A half-completed identity could be left signed in on the public page | The shell hides that action while an unverified identity is held; the account must verify or sign out |
| A failed lazy authentication chunk left a permanent loading screen with no error boundary | The sign-in surface became unreachable after a transient network failure | An error boundary renders a bounded reload action and no diagnostic detail |

## Manual configuration and verification still pending

1. Firebase Console: enable email-enumeration protection, set the password policy to `Require`
   with a 12–128 character range, and brand both email templates. See
   `docs/deployment/CLOUD_SETUP_CHECKLIST.md` section 2.1.
2. Install a Java runtime and `firebase-tools`, then run the Firebase Emulator Suite end-to-end
   authentication journeys.
3. Run the controlled staging smoke test for real Google OAuth, one real verification email, and
   one real password-reset email with synthetic accounts.
4. Capture sanitized responsive screenshots at 1440×900, 1024×768, 390×844, and 320×568 in light
   and dark themes.
5. Verify 200% browser zoom and reduced-motion rendering in a real browser.
6. After deployment, add the exact production hostname to Firebase authorized domains and set the
   exact production `APP_ORIGIN`.
7. Provide real Privacy and Terms URLs. The authentication card currently carries a factual privacy
   note with no links, because linking to a page that does not exist would be worse than omitting
   it. Once the URLs exist, pass them to `FirebaseUIProvider` as `policies` and the official
   `Policies` component will render them.

## Residual risks

- FirebaseUI 7.1.0 is a recent major release. The exact version is pinned and the superseded
  Google-only implementation was removed only after the replacement was tested.
- Firebase Authentication is a public endpoint. Credential stuffing and reset-email flooding are
  bounded by provider controls, project quotas, and interface cooldowns; App Check remains deferred.
- Account creation for an address already in use still fails. The message is generic and confirms
  nothing, but request timing remains a provider-level signal.
- Automatic Google and email/password account linking is not implemented. Provider conflicts show a
  safe message and are documented as threat T32 rather than described as seamless linking.
- `@firebase-oss/ui-react` calls `console.error` for a non-Firebase error inside its own hooks. The
  Cognaxis-owned submit paths avoid that code path, but a future use of an unmodified FirebaseUI
  form component would reintroduce it.
- `cva@1.0.0-beta.4` is a pre-release transitive dependency of the styles package. It is
  styling-only and on no credential or authorization path.

Do not mark external Firebase, Firestore, Secret Manager, IAM, Gemini, or Cloud Run controls as tested until their sanitized evidence is actually observed.
