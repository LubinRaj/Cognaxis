import { useState } from "react";
import {
  Divider,
  form as firebaseUIForm,
  useSignInAuthFormSchema,
  useUI,
} from "@firebase-oss/ui-react";
import { signInWithEmailAndPassword } from "@firebase-oss/ui-core";
import { getFirebaseAuthErrorMessage } from "../../auth/auth-errors";
import { AuthCardHeading } from "./AuthCardHeading";
import { GoogleAuthButton } from "./GoogleAuthButton";
import { AuthLegalNote } from "./AuthLegalNote";
import { AuthTextField } from "./AuthTextField";

type AuthSignInScreenProps = {
  onCreateAccount: () => void;
  onForgotPassword: () => void;
};

export function AuthSignInScreen({ onCreateAccount, onForgotPassword }: AuthSignInScreenProps) {
  const [revealed, setRevealed] = useState(false);
  const ui = useUI();
  const schema = useSignInAuthFormSchema();

  const form = firebaseUIForm.useAppForm({
    defaultValues: { email: "", password: "" },
    validators: {
      onChange: schema,
      // FirebaseUI's own submit action rethrows the raw Firebase message for any code outside its
      // translation map, so every failure is mapped by the Cognaxis sanitiser instead.
      onSubmitAsync: async ({ value }) => {
        try {
          await signInWithEmailAndPassword(ui, value.email, value.password);
        } catch (error) {
          return getFirebaseAuthErrorMessage(error);
        }
      },
    },
  });

  return (
    <>
      <AuthCardHeading
        title="Welcome back"
        description="Continue to your private Cognaxis journal."
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

            <form.AppField name="password">
              {(field) => (
                <AuthTextField
                  field={field}
                  label="Password"
                  type="password"
                  autoComplete="current-password"
                  reveal={{ revealed, onToggle: () => setRevealed((value) => !value) }}
                />
              )}
            </form.AppField>

            <div className="flex justify-end">
              <form.Action onClick={onForgotPassword}>Forgot password?</form.Action>
            </div>

            <div className="cx-form__submit">
              <form.SubmitButton>Sign in</form.SubmitButton>
              <form.ErrorMessage />
            </div>
          </form.AppForm>
        </form>

        <p className="text-on-surface-variant text-center text-sm">
          New to Cognaxis?{" "}
          <button
            type="button"
            onClick={onCreateAccount}
            className="text-primary focus-visible:outline-primary rounded font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Create an account
          </button>
        </p>

        <AuthLegalNote />
      </div>
    </>
  );
}
