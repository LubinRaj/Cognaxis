import { useState } from "react";
import type { User } from "firebase/auth";
import { useTheme, type ThemeOption } from "../../hooks/useTheme";
import { MaterialIcon, type MaterialIconName } from "../MaterialIcon";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Menu, type MenuItemDescriptor } from "../ui/Menu";

const themeOptions: { value: ThemeOption; label: string; icon: MaterialIconName }[] = [
  { value: "system", label: "System", icon: "desktop_windows" },
  { value: "light", label: "Light", icon: "light_mode" },
  { value: "dark", label: "Dark", icon: "dark_mode" },
];

type AccountMenuProps = {
  user: User;
  onSignOut: () => void;
  signingOut: boolean;
};

export function AccountMenu({ user, onSignOut, signingOut }: AccountMenuProps) {
  const { theme, setTheme } = useTheme();
  const [privacyOpen, setPrivacyOpen] = useState(false);

  const displayName = user.displayName?.trim() ?? "";
  const email = user.email ?? "";

  const items: MenuItemDescriptor[] = [
    ...themeOptions.map((option) => ({
      id: `theme-${option.value}`,
      label: option.label,
      icon: option.icon,
      description: theme === option.value ? "Selected" : undefined,
      onSelect: () => setTheme(option.value),
    })),
    {
      id: "privacy",
      label: "How your journal is protected",
      icon: "lock",
      separated: true,
      onSelect: () => setPrivacyOpen(true),
    },
    {
      id: "sign-out",
      label: signingOut ? "Signing out…" : "Sign out",
      icon: "logout",
      separated: true,
      disabled: signingOut,
      onSelect: onSignOut,
    },
  ];

  return (
    <>
      <Menu
        label="Account and appearance"
        align="start"
        placement="top"
        header={
          <div className="flex items-center gap-3">
            <Avatar displayName={displayName} email={email} />
            <div className="min-w-0">
              {displayName && (
                <p className="text-on-surface truncate text-sm font-medium">{displayName}</p>
              )}
              <p className="text-on-surface-variant truncate text-xs" title={email}>
                {email}
              </p>
              {user.emailVerified && (
                <p className="text-on-surface-variant mt-1 flex items-center gap-1 text-xs">
                  <span aria-hidden="true" className="text-success">
                    <MaterialIcon name="check_circle" size={14} />
                  </span>
                  Email verified
                </p>
              )}
            </div>
          </div>
        }
        items={items}
        trigger={(props) => (
          <button
            {...props}
            type="button"
            className="hover:bg-surface-container-high focus-visible:outline-focus-ring flex w-full min-h-14 items-center gap-3 rounded-2xl p-2 text-left transition-colors duration-(--duration-feedback) focus-visible:outline-2 focus-visible:-outline-offset-2"
          >
            <Avatar displayName={displayName} email={email} />
            <span className="min-w-0 flex-1">
              <span className="text-on-surface block truncate text-sm font-medium">
                {displayName || "Your account"}
              </span>
              <span className="text-on-surface-variant block truncate text-xs">{email}</span>
            </span>
            <span aria-hidden="true" className="text-on-surface-variant shrink-0">
              <MaterialIcon name="expand_less" size={20} />
            </span>
          </button>
        )}
      />

      <Dialog
        open={privacyOpen}
        title="How your journal is protected"
        onClose={() => setPrivacyOpen(false)}
        actions={<Button onClick={() => setPrivacyOpen(false)}>Close</Button>}
      >
        <ul className="text-on-surface-variant flex flex-col gap-4 text-sm leading-relaxed">
          <li className="flex gap-3">
            <span aria-hidden="true" className="text-primary mt-0.5 shrink-0">
              <MaterialIcon name="verified_user" size={20} />
            </span>
            <span>
              Signing in is handled by Firebase Authentication. Cognaxis never stores or sees your
              password.
            </span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden="true" className="text-primary mt-0.5 shrink-0">
              <MaterialIcon name="lock" size={20} />
            </span>
            <span>
              Every request to your journal is checked on the server against your verified sign-in,
              and only your own reflections are returned.
            </span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden="true" className="text-primary mt-0.5 shrink-0">
              <MaterialIcon name="dns" size={20} />
            </span>
            <span>
              Gemini runs on the server and its credentials are never sent to your browser. Your
              reflections go to Google only to generate a response, under API terms stating that
              paid-tier content is not used to train Google&apos;s models.
            </span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden="true" className="text-primary mt-0.5 shrink-0">
              <MaterialIcon name="download" size={20} />
            </span>
            <span>
              Anything you export leaves this protection behind. Downloaded files are yours to look
              after.
            </span>
          </li>
        </ul>
      </Dialog>
    </>
  );
}
