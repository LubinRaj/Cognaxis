import { useEffect, useRef, useState } from "react";
import { updateProfile, type User } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { useTheme, type ThemeOption } from "../../hooks/useTheme";
import { useApiClient } from "../../lib/use-api-client";
import { ApiError } from "../../lib/api-client";
import { MaterialIcon, type MaterialIconName } from "../MaterialIcon";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Menu, type MenuItemDescriptor } from "../ui/Menu";
import { TextField } from "../ui/TextField";

const themeOptions: { value: ThemeOption; label: string; icon: MaterialIconName }[] = [
  { value: "system", label: "System", icon: "desktop_windows" },
  { value: "light", label: "Light", icon: "light_mode" },
  { value: "dark", label: "Dark", icon: "dark_mode" },
];

const PROFILE_PHOTO_MAX_BYTES = 1_000_000;
const PROFILE_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type AccountMenuProps = {
  user: User;
  onSignOut: () => void;
  signingOut: boolean;
  compact?: boolean;
  align?: "start" | "end";
};

export function AccountMenu({
  user,
  onSignOut,
  signingOut,
  compact = false,
  align = "start",
}: AccountMenuProps) {
  const navigate = useNavigate();
  const api = useApiClient(user);
  const { theme, setTheme } = useTheme();
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState(user.displayName?.trim() ?? "");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(user.photoURL ?? "");
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(null);
  const [profilePhotoRemoved, setProfilePhotoRemoved] = useState(false);
  const [profilePending, setProfilePending] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const profilePreviewRef = useRef<string | null>(null);

  const displayName = profileName.trim();
  const email = user.email ?? "";
  const currentTheme = themeOptions.find((option) => option.value === theme) ?? themeOptions[0];

  function openProfile() {
    setProfileName(user.displayName?.trim() ?? "");
    setProfilePhotoUrl(user.photoURL ?? "");
    setProfilePhotoFile(null);
    setProfilePhotoRemoved(false);
    if (profilePreviewRef.current) URL.revokeObjectURL(profilePreviewRef.current);
    profilePreviewRef.current = null;
    setProfilePhotoPreview(null);
    setProfileError(null);
    setProfileOpen(true);
  }

  useEffect(() => {
    let active = true;
    void api.getProfilePhoto().then((photoUrl) => {
      if (active && photoUrl) setProfilePhotoUrl(photoUrl);
    }).catch(() => {
      // The account menu remains usable with Firebase's cached profile photo if the optional
      // profile storage read is temporarily unavailable.
    });
    return () => {
      active = false;
      if (profilePreviewRef.current) URL.revokeObjectURL(profilePreviewRef.current);
    };
  }, [api]);

  function handleProfilePhotoChange(file: File | undefined) {
    if (!file) return;
    if (!PROFILE_PHOTO_TYPES.has(file.type) || file.size > PROFILE_PHOTO_MAX_BYTES) {
      setProfileError("Choose a JPEG, PNG, or WebP image up to 1 MB.");
      return;
    }
    if (profilePreviewRef.current) URL.revokeObjectURL(profilePreviewRef.current);
    const preview = URL.createObjectURL(file);
    profilePreviewRef.current = preview;
    setProfilePhotoFile(file);
    setProfilePhotoPreview(preview);
    setProfilePhotoRemoved(false);
    setProfileError(null);
  }

  function removeProfilePhoto() {
    if (profilePreviewRef.current) URL.revokeObjectURL(profilePreviewRef.current);
    profilePreviewRef.current = null;
    setProfilePhotoFile(null);
    setProfilePhotoPreview(null);
    setProfilePhotoRemoved(true);
    setProfilePhotoUrl("");
    setProfileError(null);
  }

  const items: MenuItemDescriptor[] = [
    {
      id: "profile",
      label: "Your profile",
      icon: "person",
      onSelect: openProfile,
    },
    {
      id: "archives",
      label: "Archives",
      icon: "archive",
      onSelect: () => void navigate("/app/archives"),
    },
    {
      id: "theme",
      label: "Theme",
      icon: currentTheme.icon,
      description: currentTheme.label,
      onSelect: () => undefined,
      submenu: (
        <div role="group" aria-label="Theme options" className="flex gap-1">
          {themeOptions.map((option) => {
            const selected = theme === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                aria-label={option.label}
                onClick={() => setTheme(option.value)}
                className={`focus-visible:outline-focus-ring flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  selected
                    ? "bg-secondary-container text-on-secondary-container"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                }`}
              >
                <MaterialIcon name={option.icon} size={15} />
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      ),
    },
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
        align={align}
        placement="top"
        header={
          <div className="flex items-center gap-3">
            <Avatar displayName={displayName} email={email} photoUrl={profilePhotoUrl} />
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
            aria-label={`${displayName || "Your account"}, ${email}`}
            className={
              compact
                ? "hover:bg-surface-container-high focus-visible:outline-focus-ring flex h-full min-h-14 w-full flex-col items-center justify-center gap-1 rounded-control px-1 py-1 text-center text-[11px] font-medium transition-colors duration-(--duration-feedback) focus-visible:outline-2 focus-visible:-outline-offset-2"
                : "hover:bg-surface-container-high focus-visible:outline-focus-ring flex min-h-14 w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors duration-(--duration-feedback) focus-visible:outline-2 focus-visible:-outline-offset-2"
            }
          >
            <Avatar displayName={displayName} email={email} photoUrl={profilePhotoUrl} />
            {!compact && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="text-on-surface block truncate text-sm font-medium">
                    {displayName || "Your account"}
                  </span>
                  <span className="text-on-surface-variant block truncate text-xs">{email}</span>
                </span>
                <span aria-hidden="true" className="text-on-surface-variant shrink-0">
                  <MaterialIcon name="expand_less" size={20} />
                </span>
              </>
            )}
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

      <Dialog
        open={profileOpen}
        title="Your profile"
        description="Update the name and optional profile picture shown in Cognaxis."
        onClose={() => {
          if (!profilePending) setProfileOpen(false);
        }}
        busy={profilePending}
        actions={
          <>
            <Button variant="text" onClick={() => setProfileOpen(false)} disabled={profilePending}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                void (async () => {
                  setProfilePending(true);
                  setProfileError(null);
                  try {
                    let photo = profilePhotoUrl || null;
                    if (profilePhotoFile) {
                      photo = await api.uploadProfilePhoto(profilePhotoFile);
                    } else if (profilePhotoRemoved) {
                      await api.deleteProfilePhoto();
                      photo = null;
                    }
                    await updateProfile(user, {
                      displayName: profileName.trim() || null,
                    });
                    // Refresh the token so the backend identity projection and team member lists
                    // receive the new display name without waiting for Firebase's normal expiry.
                    await user.getIdToken(true).catch(() => undefined);
                    setProfilePhotoUrl(photo ?? "");
                    setProfilePhotoFile(null);
                    setProfilePhotoRemoved(false);
                    if (profilePreviewRef.current) URL.revokeObjectURL(profilePreviewRef.current);
                    profilePreviewRef.current = null;
                    setProfilePhotoPreview(null);
                    setProfileOpen(false);
                  } catch (error) {
                    setProfileError(
                      error instanceof ApiError ? error.message : "Your profile could not be updated. Try again.",
                    );
                  } finally {
                    setProfilePending(false);
                  }
                })();
              }}
              loading={profilePending}
            >
              Save profile
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          {profileError && <p className="text-error text-sm" role="alert">{profileError}</p>}
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar size="large" displayName={profileName} email={email} photoUrl={profilePhotoPreview ?? profilePhotoUrl} />
              <label className="bg-primary text-on-primary hover:bg-primary/90 focus-within:outline-focus-ring absolute right-0 bottom-0 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full shadow-sm focus-within:outline-2 focus-within:outline-offset-2" title={profilePhotoUrl || profilePhotoPreview ? "Replace photo" : "Upload photo"}>
                <span className="sr-only">{profilePhotoUrl || profilePhotoPreview ? "Replace photo" : "Upload photo"}</span>
                <MaterialIcon name="add" size={17} />
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(event) => {
                    handleProfilePhotoChange(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
            <div className="text-on-surface-variant text-xs">
              <p>This is how your account appears in the app.</p>
              <p className="mt-1">JPEG, PNG, or WebP · 1 MB maximum</p>
              {(profilePhotoUrl || profilePhotoPreview) && (
                <Button variant="text" size="compact" className="mt-1 -ml-2" onClick={removeProfilePhoto} disabled={profilePending}>
                  Remove photo
                </Button>
              )}
            </div>
          </div>
          <TextField
            label="Display name"
            value={profileName}
            maxLength={80}
            autoFocus
            onChange={(event) => setProfileName(event.target.value)}
          />
        </div>
      </Dialog>
    </>
  );
}
