import { useEffect, useRef, useState } from "react";
import { Divider, form as firebaseUIForm, useUI } from "@firebase-oss/ui-react";
import { createUserWithEmailAndPassword } from "@firebase-oss/ui-core";
import { sendEmailVerification, type PasswordValidationStatus } from "firebase/auth";
import { z } from "zod";
import { authMessages, getFirebaseAuthErrorMessage } from "../../auth/auth-errors";
import { usePasswordPolicy } from "../../auth/use-password-policy";
import { auth } from "../../lib/firebase";
import { AuthCardHeading } from "./AuthCardHeading";
import { GoogleAuthButton } from "./GoogleAuthButton";
import { AuthLegalNote } from "./AuthLegalNote";
import { AuthTextField } from "./AuthTextField";
import { PasswordPolicyChecklist, describePasswordPolicy } from "./PasswordPolicyChecklist";

const signUpSchema = z
  .object({
    email: z.email({ message: authMessages.invalidEmail }),
    password: z.string().min(1, { message: "Enter a password." }),
    confirmPassword: z.string().min(1, { message: "Re-enter your password." }),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Both passwords must match.",
    path: ["confirmPassword"],
  });

type AuthSignUpScreenProps = {
  onSignIn: () => void;
  onVerificationEmailResult: (sent: boolean) => void;
};

export function AuthSignUpScreen({ onSignIn, onVerificationEmailResult }: AuthSignUpScreenProps) {
  const [revealed, setRevealed] = useState(false);
  const [password, setPassword] = useState("");
  const ui = useUI();
  const { status, unavailable, validatedPassword } = usePasswordPolicy(auth, password);
  const policyStatus = useRef<{
    status: PasswordValidationStatus | null;
    validatedPassword: string | null;
  }>({ status: null, validatedPassword: null });

  useEffect(() => {
    policyStatus.current = { status, validatedPassword };
  }, [status, validatedPassword]);

  const form = firebaseUIForm.useAppForm({
    defaultValues: { email: "", password: "", confirmPassword: "" },
    validators: {
      onChange: signUpSchema,
      onSubmitAsync: async ({ value }) => {
        // Only a policy result computed for this exact value may block the request. Firebase
        // re-evaluates the project policy regardless of what this check decides.
        const policy = policyStatus.current;
        if (
          policy.status &&
          policy.validatedPassword === value.password &&
          !policy.status.isValid
        ) {
          return authMessages.weakPassword;
        }

        let credential;
        try {
          credential = await createUserWithEmailAndPassword(ui, value.email, value.password);
        } catch (error) {
          return getFirebaseAuthErrorMessage(error);
        }

        if (!credential) return;

        try {
          await sendEmailVerification(credential.user);
          onVerificationEmailResult(true);
        } catch {
          onVerificationEmailResult(false);
        }
      },
    },
  });

  const requirements = describePasswordPolicy(status);

  return (
    <>
      <AuthCardHeading
        title="Create your private space"
        description="Use Google or create an account with your email."
      />

      <div className="flex flex-col gap-5">
        <GoogleAuthButton />

        <Divider>or continue with email</Divider>

        <form
          className="fui-form cx-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <form.AppForm>
            <form.AppField name="email">
              {(field) => (
                <AuthTextField
                  field={field}
                  label="Email"
                  type="email"
                  autoComplete="email"
                />
              )}
            </form.AppField>

            <div className="flex flex-col gap-3">
              <form.AppField name="password">
                {(field) => (
                  <AuthTextField
                    field={field}
                    label="Password"
                    type="password"
                    autoComplete="new-password"
                    describedBy="password-policy"
                    reveal={{ revealed, onToggle: () => setRevealed((value) => !value) }}
                    onValueChange={setPassword}
                  />
                )}
              </form.AppField>
              <PasswordPolicyChecklist
                id="password-policy"
                requirements={requirements}
                unavailable={unavailable}
              />
            </div>

            <form.AppField name="confirmPassword">
              {(field) => (
                <AuthTextField
                  field={field}
                  label="Confirm password"
                  type="password"
                  autoComplete="new-password"
                  reveal={{ revealed, onToggle: () => setRevealed((value) => !value) }}
                />
              )}
            </form.AppField>

            <div className="cx-form__submit">
              <form.SubmitButton>Create account</form.SubmitButton>
              <form.ErrorMessage />
            </div>
          </form.AppForm>
        </form>

        <p className="text-on-surface-variant text-center text-sm">
          Already have an account?{" "}
          <button
            type="button"
            onClick={onSignIn}
            className="text-primary focus-visible:outline-primary rounded font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Sign in
          </button>
        </p>

        <AuthLegalNote />
      </div>
    </>
  );
}
