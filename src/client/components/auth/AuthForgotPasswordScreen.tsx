import { form as firebaseUIForm, useUI } from "@firebase-oss/ui-react";
import { sendPasswordResetEmail } from "@firebase-oss/ui-core";
import { z } from "zod";
import {
  authMessages,
  classifyAuthFailure,
  getFirebaseAuthErrorMessage,
} from "../../auth/auth-errors";
import { AuthCardHeading } from "./AuthCardHeading";
import { AuthTextField } from "./AuthTextField";

const forgotPasswordSchema = z.object({
  email: z.email({ message: authMessages.invalidEmail }),
});

// Only failures that cannot indicate whether an address is registered are surfaced. Every other
// outcome resolves to the same generic confirmation screen.
const reportableCategories = new Set(["network", "rate_limited", "configuration"]);

type AuthForgotPasswordScreenProps = {
  onBackToSignIn: () => void;
  onResetRequestAccepted: (email: string) => void;
};

export function AuthForgotPasswordScreen({
  onBackToSignIn,
  onResetRequestAccepted,
}: AuthForgotPasswordScreenProps) {
  const ui = useUI();

  const form = firebaseUIForm.useAppForm({
    defaultValues: { email: "" },
    validators: {
      onChange: forgotPasswordSchema,
      onSubmitAsync: async ({ value }) => {
        try {
          await sendPasswordResetEmail(ui, value.email);
        } catch (error) {
          if (reportableCategories.has(classifyAuthFailure(error))) {
            return getFirebaseAuthErrorMessage(error);
          }
        }
        onResetRequestAccepted(value.email);
      },
    },
  });

  return (
    <>
      <AuthCardHeading
        title="Reset your password"
        description="Enter your email and we'll send password reset instructions if an account is available."
      />

      <div className="flex flex-col gap-6">
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

            <div className="cx-form__submit">
              <form.SubmitButton>Send reset instructions</form.SubmitButton>
              <form.ErrorMessage />
            </div>
          </form.AppForm>
        </form>

        <p className="text-center text-sm">
          <button
            type="button"
            onClick={onBackToSignIn}
            className="text-primary focus-visible:outline-primary rounded font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Back to sign in
          </button>
        </p>
      </div>
    </>
  );
}
