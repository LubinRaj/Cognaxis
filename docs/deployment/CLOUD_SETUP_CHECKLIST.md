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
- Never set `GEMINI_API_KEY_LOCAL` in production.
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
