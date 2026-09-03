import React from "react";

export type MaterialIconName =
  | "psychiatry"
  | "desktop_windows"
  | "light_mode"
  | "dark_mode"
  | "arrow_drop_down"
  | "auto_awesome"
  | "arrow_forward"
  | "verified_user"
  | "dns"
  | "lock"
  | "progress_activity"
  | "error"
  | "memory"
  | "edit_document"
  | "forum"
  | "bookmark_added"
  | "fingerprint"
  | "vpn_key"
  | "cloud"
  | "folder_managed"
  | "check"
  | "close"
  | "menu"
  | "search"
  | "settings"
  | "logout"
  | "arrow_back"
  | "visibility"
  | "visibility_off"
  | "mark_email_unread"
  | "refresh"
  | "check_circle"
  | "radio_button_unchecked"
  | "lock_reset"
  | "info"
  | "warning"
  | "add"
  | "more_vert"
  | "download"
  | "delete"
  | "content_copy"
  | "send"
  | "expand_more"
  | "expand_less"
  | "chat_bubble"
  | "person"
  | "description"
  | "checklist"
  | "my_location"
  | "place"
  | "auto_graph"
  | "map"
  | "groups";

interface MaterialIconProps {
  name: MaterialIconName;
  className?: string;
  size?: number | string;
}

export const MaterialIcon: React.FC<MaterialIconProps> = ({
  name,
  className = "",
  size = 24,
}) => {
  const pixelSize = typeof size === "number" ? `${size}px` : size;

  switch (name) {
    case "psychiatry":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M12 3a9 9 0 0 0-9 9 9 9 0 0 0 9 9 9 9 0 0 0 9-9 9 9 0 0 0-9-9zm0 2a7 7 0 0 1 7 7c0 1.8-.7 3.5-1.9 4.8l-1.4-1.4a5 5 0 0 0 1.3-3.4 5 5 0 0 0-5-5 5 5 0 0 0-3.4 1.3L7.2 6.9A7 7 0 0 1 12 5zm-5.1 3.5 1.4 1.4A5 5 0 0 0 7 12a5 5 0 0 0 5 5c1.3 0 2.5-.5 3.4-1.3l1.4 1.4A7 7 0 0 1 12 19a7 7 0 0 1-7-7c0-1.8.7-3.5 1.9-4.8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
        </svg>
      );

    case "auto_awesome":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="m19 9 1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zm7.5 5.5-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z" />
        </svg>
      );

    case "desktop_windows":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M21 2H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7l-2 3v1h8v-1l-2-3h7c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 12H3V4h18v10z" />
        </svg>
      );

    case "light_mode":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z" />
        </svg>
      );

    case "dark_mode":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z" />
        </svg>
      );

    case "arrow_drop_down":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="m7 10 5 5 5-5H7z" />
        </svg>
      );

    case "arrow_forward":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8z" />
        </svg>
      );

    case "verified_user":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
        </svg>
      );

    case "dns":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M20 13H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1v-6c0-.55-.45-1-1-1zM7 19c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM20 3H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1zM7 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
        </svg>
      );

    case "lock":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
        </svg>
      );

    case "progress_activity":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={`animate-spin ${className}`}
          aria-hidden="true"
        >
          <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" opacity="0.3" />
          <path d="M12 2v4a6 6 0 0 1 6 6h4a10 10 0 0 0-10-10z" />
        </svg>
      );

    case "error":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
        </svg>
      );

    case "memory":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M15 9H9v6h6V9zm-2 4h-2v-2h2v2zm8-2V9h-2V7c0-1.1-.9-2-2-2h-2V3h-2v2h-2V3H9v2H7c-1.1 0-2 .9-2 2v2H3v2h2v2H3v2h2v2c0 1.1.9 2 2 2h2v2h2v-2h2v2h2v-2h2c1.1 0 2-.9 2-2v-2h2v-2h-2v-2h2zm-4 6H7V7h10v10z" />
        </svg>
      );

    case "edit_document":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
        </svg>
      );

    case "forum":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M21 6h-2v9H6v2c0 .55.45 1 1 1h11l4 4V7c0-.55-.45-1-1-1zm-4 6V3c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v14l4-4h10c.55 0 1-.45 1-1z" />
        </svg>
      );

    case "bookmark_added":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm-7.2 10.8-2.6-2.6 1.4-1.4 1.2 1.2 3.8-3.8 1.4 1.4-5.2 5.2z" />
        </svg>
      );

    case "fingerprint":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M17.81 4.47c-.08 0-.16-.02-.23-.06C15.66 3.42 14 3 12.01 3c-1.98 0-3.86.47-5.57 1.41-.24.13-.54.04-.68-.2-.13-.24-.04-.55.2-.68C7.82 2.52 9.86 2 12.01 2c2.13 0 3.99.47 6.03 1.52.25.13.34.43.21.67-.09.18-.26.28-.44.28zM3.5 9.72c-.1 0-.2-.03-.29-.09-.23-.16-.28-.47-.12-.7.99-1.4 2.25-2.5 3.75-3.27C9.98 4.04 14 4.03 17.15 5.65c1.5.77 2.76 1.86 3.75 3.25.16.22.11.54-.12.7-.23.16-.54.11-.7-.12-.9-1.26-2.04-2.25-3.39-2.94-2.87-1.47-6.54-1.47-9.4.01-1.36.7-2.5 1.7-3.4 2.96-.08.14-.23.21-.39.21zm6.25 12.07c-.13 0-.26-.05-.35-.15-.87-.87-1.34-1.43-2.01-2.64-.69-1.23-1.05-2.73-1.05-4.34 0-2.97 2.54-5.39 5.66-5.39s5.66 2.42 5.66 5.39c0 .28-.22.5-.5.5s-.5-.22-.5-.5c0-2.42-2.09-4.39-4.66-4.39-2.57 0-4.66 1.97-4.66 4.39 0 1.44.32 2.77.93 3.85.64 1.15 1.08 1.64 1.85 2.42.19.2.19.51 0 .71-.11.1-.24.15-.37.15zm7.17-1.85c-1.19 0-2.24-.3-3.1-.89-1.49-1.01-2.38-2.65-2.38-4.39 0-.28.22-.5.5-.5s.5.22.5.5c0 1.41.72 2.74 1.94 3.56.71.48 1.54.71 2.54.71.24 0 .64-.03 1.04-.1.27-.05.53.13.58.41.05.27-.13.53-.41.58-.57.11-1.07.12-1.21.12zM14.91 22c-.04 0-.09-.01-.13-.02-1.59-.44-2.63-1.03-3.72-2.1-1.4-1.39-2.17-3.24-2.17-5.22 0-1.62 1.38-2.94 3.08-2.94 1.7 0 3.08 1.32 3.08 2.94 0 1.07.93 1.94 2.08 1.94s2.08-.87 2.08-1.94c0-3.77-3.25-6.83-7.25-6.83-2.84 0-5.44 1.58-6.61 4.03-.39.81-.59 1.76-.59 2.8 0 .78.07 2.01.67 3.61.1.26-.03.55-.29.64-.26.1-.55-.04-.64-.29-.49-1.31-.73-2.61-.73-3.96 0-1.2.23-2.29.68-3.24 1.33-2.79 4.28-4.6 7.51-4.6 4.55 0 8.25 3.51 8.25 7.83 0 1.62-1.38 2.94-3.08 2.94s-3.08-1.32-3.08-2.94c0-1.07-.93-1.94-2.08-1.94s-2.08.87-2.08 1.94c0 1.71.66 3.31 1.87 4.51.95.94 1.86 1.46 3.27 1.85.27.07.42.35.35.61-.05.23-.26.38-.47.38z" />
        </svg>
      );

    case "vpn_key":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
        </svg>
      );

    case "cloud":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM19 18H6c-2.21 0-4-1.79-4-4 0-2.05 1.53-3.76 3.56-3.97l1.07-.11.5-.95C8.08 7.14 9.94 6 12 6c2.62 0 4.88 1.86 5.39 4.43l.3 1.5 1.53.11c1.56.1 2.78 1.41 2.78 2.96 0 1.65-1.35 3-3 3z" />
        </svg>
      );

    case "folder_managed":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6 10H6v-2h8v2zm4-4H6v-2h12v2z" />
        </svg>
      );

    case "check":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
        </svg>
      );

    case "close":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
        </svg>
      );

    case "menu":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
        </svg>
      );

    case "search":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
        </svg>
      );

    case "settings":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
        </svg>
      );

    case "logout":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="m17 7-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
        </svg>
      );

    case "arrow_back":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
        </svg>
      );

    case "visibility":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
        </svg>
      );

    case "visibility_off":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M12 6.5c2.76 0 5 2.24 5 5 0 .51-.1 1-.24 1.46l3.06 3.06c1.39-1.23 2.49-2.77 3.18-4.53C21.27 7.11 17 4 12 4c-1.27 0-2.49.2-3.64.57l2.17 2.17c.47-.14.96-.24 1.47-.24zM2.71 3.16a.996.996 0 0 0 0 1.41l1.97 1.97A11.892 11.892 0 0 0 1 11.5C2.73 15.89 7 19 12 19c1.52 0 2.97-.3 4.31-.82l2.72 2.72a.996.996 0 1 0 1.41-1.41L4.13 3.16a.996.996 0 0 0-1.42 0zM12 16.5a5 5 0 0 1-4.55-7.07l1.63 1.63c-.05.3-.08.61-.08.94 0 1.66 1.34 3 3 3 .33 0 .64-.03.94-.08l1.63 1.63c-.75.36-1.6.55-2.57.55z" />
        </svg>
      );

    case "mark_email_unread":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V9.87a4.5 4.5 0 0 1-2 .57V18H4V8l8 5 4.09-2.56A4.5 4.5 0 0 1 15.5 8.5c0-.17.01-.34.03-.5H4V6h11.53A4.5 4.5 0 0 1 20 2.5 4.5 4.5 0 0 1 20 11V4z" />
          <circle cx="20" cy="6" r="3" />
        </svg>
      );

    case "refresh":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
        </svg>
      );

    case "check_circle":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
        </svg>
      );

    case "radio_button_unchecked":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z" />
        </svg>
      );

    case "lock_reset":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M12 3a5 5 0 0 0-5 5v1H6c-1.1 0-2 .9-2 2v9c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-9c0-1.1-.9-2-2-2h-1V8a5 5 0 0 0-5-5zm0 2a3 3 0 0 1 3 3v1H9V8a3 3 0 0 1 3-3zm0 8a2 2 0 0 1 1 3.73V18h-2v-1.27A2 2 0 0 1 12 13z" />
        </svg>
      );

    case "info":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M11 7h2v2h-2V7zm0 4h2v6h-2v-6zm1-9a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z" />
        </svg>
      );

    case "warning":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M12 2 1 21h22L12 2zm0 4 6.5 13h-13L12 6zm-1 4v4h2v-4h-2zm0 6v2h2v-2h-2z" />
        </svg>
      );

    case "add":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z" />
        </svg>
      );

    case "more_vert":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M12 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" />
        </svg>
      );

    case "download":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M12 16l-5-5 1.41-1.41L11 12.17V4h2v8.17l2.59-2.58L17 11l-5 5zM5 18h14v2H5v-2z" />
        </svg>
      );

    case "delete":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5-1-1h-5l-1 1H5v2h14V4h-3.5z" />
        </svg>
      );

    case "content_copy":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z" />
        </svg>
      );

    case "send":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      );

    case "expand_more":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6-1.41-1.41z" />
        </svg>
      );

    case "expand_less":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M12 10.83 16.59 15.41 18 14l-6-6-6 6 1.41 1.41L12 10.83z" />
        </svg>
      );

    case "chat_bubble":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm0 14H5.17L4 17.17V4h16v12z" />
        </svg>
      );

    case "person":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
        </svg>
      );

    case "description":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM8 12h8v2H8v-2zm0 4h8v2H8v-2z" />
        </svg>
      );

    case "checklist":
      return (
        <svg
          viewBox="0 0 24 24"
          width={pixelSize}
          height={pixelSize}
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M22 7h-9v2h9V7zm0 8h-9v2h9v-2zM5.54 11 2 7.46l1.41-1.41 2.12 2.12 4.24-4.24 1.42 1.41L5.54 11zm0 8L2 15.46l1.41-1.41 2.12 2.12 4.24-4.24 1.42 1.41L5.54 19z" />
        </svg>
      );

    default:
      return null;
  }
};
