# Cognaxis Cloud Setup Checklist

Status: Not provisioned
Execution rule: Each state-changing Google Cloud or Firebase step requires project-owner approval before it is performed.

## 1. Decisions required first

- Confirm the Firebase/Firestore region. Prefer the region nearest the expected demo users and keep Cloud Run in a compatible nearby region.
- Confirm the final production origin and Cloud Run service name.
- Confirm whether the Gemini Developer API key requirement will be met by a key stored in Secret Manager or whether the event accepts Vertex AI identity-based access. The current code implements the challenge's explicit Secret Manager key path.

## 2. Firebase

- Attach Firebase to the existing ideathon Google Cloud project.
- Register a web application named `Cognaxis Web`.
- Enable Google as an Authentication sign-in provider.
- Enable Email/Password as an Authentication sign-in provider. Leave email-link (passwordless)
  sign-in disabled; it is out of scope for this iteration.
- Add only localhost and the final Cloud Run/custom domains to authorized domains.
- Copy the Firebase web configuration identifiers into deployment environment variables; never add Admin SDK credentials to the browser.
- Create Firestore in Native mode in the approved region.
- Deploy `firestore.rules` only after emulator verification. These baseline rules deny all direct confidential client access.

### 2.1 Email/password settings to verify before release

These are Firebase Console settings. The application cannot set them, and the application's
enumeration-resistant copy is defence in depth rather than a substitute for them.

- Email-enumeration protection is **enabled**. Without it, Firebase returns
  `auth/user-not-found` and `auth/wrong-password` separately; the Cognaxis error adapter still shows
  one identical message, but request behaviour may differ.
- Password policy is in **Require** mode.
- Approved MVP policy: minimum 8 characters, maximum 128 characters. Avoid additional composition
  rules unless the project owner approves them. The sign-up screen and the branded password-reset
  screen both render whatever policy the project returns from `validatePassword()`, so changing the
  range in the console needs no code change and no redeploy.
- The verification email template uses the Cognaxis name and a real support address.
- The password-reset email template uses the Cognaxis name and a real support address.
- The public-facing project name is `Cognaxis`.
- Action links return only to an authorized Cognaxis domain. The application supplies no
  continuation URL of its own; confirm no open redirect or unapproved continuation URL has been
  configured in the console.
- Record the daily quota for verification and reset emails, and add monitoring for a spike, which is
  the signal for the email-flooding threat (T30).

### 2.2 Branded email-action handler

Cognaxis ships a branded handler at `/auth/action`. Until the Firebase email templates are pointed
at it, Firebase keeps using its own hosted page and the branded screen is simply unused. Nothing
breaks either way, and the release must not be described as having a custom handler until step 4
below has actually been performed.

Perform in this order, each with project-owner approval:

1. Deploy the application so `/auth/action` is reachable on the production origin.
2. Add that exact origin to Firebase Authorized domains if it is not already listed.
3. Open a reset and a verification link manually against the deployed route and confirm each state
   renders and completes.
4. In Firebase Authentication, set the email templates' action URL to
   `https://<production-origin>/auth/action`.
5. Send a fresh verification email and a fresh reset email and complete both through the branded
   page.
6. Confirm an expired or already-used link shows the safe invalid state and leaks no code.

`ActionCodeSettings.url` is not the action-handler URL: it only supplies the post-action continue
destination. The template configuration in step 4 is what decides which page receives the code.

If the console reports that template customisation is unavailable for this project, stop, keep
Firebase's default handler, and record the restriction. Do not work around it.

## 3. Gemini secret

- Enable Secret Manager only when ready to configure the runtime.
- Create a secret named for the Cognaxis Gemini credential.
- Add the key as a secret version without displaying it in screenshots, logs, shell history, source, or chat.
- Use a pinned numeric version in `GEMINI_API_KEY_SECRET`; do not use `latest` for the production environment.

## 4. Runtime identity and IAM

- Create a dedicated keyless Cloud Run runtime service account.
- Do not create or download a service-account key.
- Grant only the datastore permissions required by the repository operations.
- Grant `roles/secretmanager.secretAccessor` on the single Gemini secret, not at project scope.
- Do not grant Owner, Editor, IAM administration, billing administration, or broad Secret Manager roles to the runtime.
- Record sanitized IAM evidence without principal email addresses or project identifiers.

## 5. Cloud Run

- Build from the reviewed commit using the included `Dockerfile`.
- Set `APP_ORIGIN`, `GOOGLE_CLOUD_PROJECT`, `GEMINI_MODEL`, and the pinned `GEMINI_API_KEY_SECRET` resource name.
- Never set a plain `GEMINI_API_KEY` in production; only the Secret Manager reference is accepted.
- Bind the dedicated runtime service account.
- Set conservative request concurrency, timeout, maximum instances, and minimum instances for the demo budget.
- Restrict unauthenticated access to the public HTTPS service only; all protected application routes still require Firebase tokens.
- Configure budget alerts and review logs for metadata-only behavior.

## 6. Release verification

- Run Firestore emulator rule tests and API integration tests with synthetic User A/User B accounts.
- Verify a forged, expired, wrong-project, and revoked token matrix.
- Verify User A cannot read, summarize, delete, or infer User B data.
- Inspect the production browser bundle for credentials and server-only modules
  (`npm run security:check` performs this automatically once `npm run build` has produced
  `dist/client`).

### 6.1 Authentication release verification

After deployment, add the exact Cloud Run or custom production hostname to Firebase authorized
domains and set the exact production `APP_ORIGIN`, then verify with synthetic accounts only:

- the real Google OAuth redirect completes and reaches the journal;
- Google Auth Platform homepage, privacy-policy, and terms URLs are complete;
- one real verification email arrives, its link verifies the account, and the journal opens only
  after the refreshed token carries the verified claim;
- one real password-reset email arrives, the hosted action page changes the password, the old
  password fails, and the new password succeeds;
- an unverified synthetic account receives `403 EMAIL_VERIFICATION_REQUIRED` from a private route;
- production logs contain no email address, action link, action code, token, or private content;
- the same email address used first with Google and then with email/password, and the reverse
  order, behave as documented in threat T32, and any limitation observed is recorded rather than
  described as seamless linking.
- Verify exact-origin CORS, CSP, private/no-store responses, rate limits, and generic errors.
- Verify Secret Manager access works through runtime identity without a user-managed key.
- Verify deleting a session removes its messages and derived summary.
- Record the tested commit, environment, date, sanitized result, and residual risks.

## 7. Extended features (signals, insights, Maps, organizations, administration)

### 7.1 Firestore indexes

- [ ] Deploy the versioned composite indexes together with the rules:
      `firebase deploy --only firestore:rules,firestore:indexes --project <project>`.
- [ ] Confirm in the console that the personalInsights and platformUsers composites are built
      before exercising the insights list or the admin user directory in production.

### 7.2 Google Maps browser key

- [ ] Create one dedicated Maps JavaScript API browser key; never reuse the Firebase or any
      server key.
- [ ] Restrict websites to `http://localhost:3000/*` and the exact production origin.
- [ ] Restrict APIs to the Maps JavaScript API only — explicitly not Generative Language,
      Secret Manager, or any privileged Cloud API.
- [ ] Set quota limits and a budget alert scoped to this key.
- [ ] Provide it at build time as `VITE_GOOGLE_MAPS_API_KEY` (Docker build argument). If omitted,
      the application intentionally degrades to accessible list views — record that state rather
      than describing the interactive map as delivered.

### 7.3 Feature flags

- [ ] Decide the launch state of `FEATURE_INSIGHTS`, `FEATURE_MAPS`, `FEATURE_ORGANIZATIONS`,
      and `FEATURE_ADMIN` (all default to enabled) and set any overrides in the Cloud Run
      environment. Disabled modules answer with generic 404s and hide their navigation.

### 7.4 Super-admin bootstrap

- [ ] Have the intended administrator sign in to the deployed application once.
- [ ] Run `GOOGLE_CLOUD_PROJECT=<project> npx tsx scripts/admin/bootstrap-super-admin.ts <uid>`
      with owner credentials. This is the only supported way to create the first super admin and
      it initializes `platformControl/access` atomically.
- [ ] Verify the Admin navigation appears for that account and that a second ordinary synthetic
      account still receives 403 on `/api/v1/admin/*`.

### 7.5 Extended release verification (synthetic accounts only)

- [ ] A check-in with an approximate location stores rounded coordinates and appears on the
      private map; deleting the reflection removes the pin.
- [ ] A generated daily recap is grounded in that day's records; a repeated request returns the
      stored result; the eleventh generation in fifteen minutes is rate-limited.
- [ ] Org A's invited viewer can read but cannot write or trigger Gemini; an Org B account
      cannot reach Org A by any identifier; a revoked invitation link no longer works.
- [ ] The super admin sees counts, directory metadata, and audit events but no journal text,
      session identifier, coordinate, or wellbeing value (canary review of responses and logs).
- [ ] Suspending a synthetic user blocks every API without deleting data; restoring re-enables.
- [ ] Suspending an organization blocks its workspace while personal journals stay usable.
- [ ] The container serves on the injected `PORT` and `/api/health` passes on Cloud Run.
