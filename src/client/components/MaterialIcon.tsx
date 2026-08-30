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
  | "logout";

interface MaterialIconProps {
  name: MaterialIconName;
  className?: string;
  size?: number | string;
  filled?: boolean;
}

export const MaterialIcon: React.FC<MaterialIconProps> = ({
  name,
  className = "",
  size = 24,
  filled = false,
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
          <path d="M17.81 4.47c-.08 0-.16-.02-.23-.06C15.66 3.42 14 3 12.01 3c-1.98 0-3.86.47-5.57 1.41-.24.13-.54.04-.68-.2-.13-.24-.04-.55.2-.68C7.82 2.52 9.86 2 12.01 2c2.13 0 3.99.47 6.03 1.52.25.13.34.43.21.67-.09.18-.26.28-.44.28zM3.5 9.72c-.1 0-.2-.03-.29-.09-.23-.16-.28-.47-.12-.7.99-1.4 2.25-2.5 3.75-3.27C9.9 4.04 12 4 12.06 4c.28 0 .5.22.5.5s-.22.5-.5.5c-.1 0-1.99.05-4.88 1.5-1.39.71-2.56 1.73-3.48 3.03-.08.12-.2.19-.34.19zm16.99 1.13c-.22 0-.42-.15-.48-.37-.75-2.59-2.39-4.34-4.87-5.2-1.7-.59-3.49-.66-5.32-.2-2.12.54-3.79 1.84-4.96 3.86-.14.24-.45.32-.69.18-.24-.14-.32-.45-.18-.69 1.33-2.3 3.23-3.78 5.65-4.4 2.08-.52 4.12-.44 6.06.23 2.82.98 4.69 2.97 5.54 5.92.08.27-.08.55-.35.63-.07.02-.13.04-.2.04zm-9.59 10.74c-.16 0-.32-.08-.41-.23-.74-1.22-1.13-2.61-1.13-4.01 0-2.48 2.02-4.5 4.5-4.5s4.5 2.02 4.5 4.5c0 1.25-.39 2.52-1.12 3.65-.15.23-.46.3-.69.15-.23-.15-.3-.46-.15-.69.61-.95.94-2.02.94-3.11 0-1.93-1.57-3.5-3.5-3.5s-3.5 1.57-3.5 3.5c0 1.19.33 2.37.96 3.41.15.24.07.55-.17.7-.09.07-.19.1-.28.1zm-4.34-4.66c-.07 0-.15-.02-.22-.05-.25-.12-.36-.41-.25-.66.86-1.91 1.3-3.99 1.3-6.19 0-.28.22-.5.5-.5s.5.22.5.5c0 2.33-.47 4.54-1.38 6.56-.08.19-.27.3-.45.3zm12.35.48c-.2 0-.39-.12-.46-.32-.78-2.09-1.18-4.22-1.18-6.33 0-1.85-.59-3.23-1.77-4.1-.98-.73-2.32-1.1-3.98-1.1-1.86 0-3.35.46-4.44 1.37-1.13.94-1.7 2.29-1.7 4.01 0 1.07-.2 2.14-.6 3.19-.1.26-.39.39-.65.29-.26-.1-.39-.39-.29-.65.45-1.18.68-2.38.68-3.58 0-2.03.68-3.63 2.02-4.75 1.29-1.07 3.05-1.61 5.23-1.61 1.95 0 3.52.44 4.67 1.3 1.39 1.03 2.09 2.66 2.09 4.83 0 2.23.42 4.49 1.25 6.7.1.26-.04.55-.3.65-.06.02-.11.04-.17.04z" />
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

    default:
      return null;
  }
};
