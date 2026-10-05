// Inline line icons, 24px, drawn in currentColor. Decorative: the label next to each
// icon carries the meaning, so every icon is aria-hidden.
import type { ReactNode } from "react";

function Icon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = () => (
  <Icon>
    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
  </Icon>
);

export const TicketIcon = () => (
  <Icon>
    <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z" />
    <path d="M15 5v2M15 11v2M15 17v2" />
  </Icon>
);

export const RequestIcon = () => (
  <Icon>
    <path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-9l-5 4v-4H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
    <path d="M12 7.5v6M9 10.5h6" />
  </Icon>
);

export const PersonIcon = () => (
  <Icon>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Icon>
);

export const CalendarIcon = () => (
  <Icon>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Icon>
);

export const CarIcon = () => (
  <Icon>
    <path d="M5 17H3v-4l2-5a2 2 0 0 1 1.9-1.3h10.2A2 2 0 0 1 19 8l2 5v4h-2M9 17h6M3 13h18" />
    <circle cx="7" cy="17" r="2" />
    <circle cx="17" cy="17" r="2" />
  </Icon>
);

export const RouteIcon = () => (
  <Icon>
    <circle cx="6" cy="19" r="2" />
    <circle cx="18" cy="5" r="2" />
    <path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16" />
  </Icon>
);

export const InboxIcon = () => (
  <Icon>
    <path d="M3 13 6 5h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
    <path d="M3 13h5l1 2h6l1-2h5" />
  </Icon>
);

// Points "back". It is drawn pointing left and mirrored in RTL, so back points right.
export const BackChevron = () => (
  <Icon className="rtl:-scale-x-100">
    <path d="m15 18-6-6 6-6" />
  </Icon>
);

// Points "forward" (into a deeper screen): right in LTR, left in RTL.
export const ForwardChevron = () => (
  <Icon className="rtl:-scale-x-100">
    <path d="m9 18 6-6-6-6" />
  </Icon>
);
