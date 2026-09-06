import { NavLink, useLocation, useNavigate } from "react-router-dom";
import type { User } from "firebase/auth";
import { MaterialIcon, type MaterialIconName } from "../components/MaterialIcon";
import { AccountMenu } from "../components/workspace/AccountMenu";
import { Menu } from "../components/ui/Menu";
import { useCapabilities } from "./capabilities-context";

export type NavDestination = {
  path: string;
  label: string;
  icon: MaterialIconName;
};

export function useNavDestinations(): NavDestination[] {
  const { state } = useCapabilities();
  const features = state.status === "ready" ? state.capabilities.features : null;

  const destinations: NavDestination[] = [
    { path: "/app/journal", label: "Home", icon: "forum" },
    { path: "/app/ask", label: "Ask me", icon: "memory" },
  ];
  if (features?.insights) {
    destinations.push({ path: "/app/insights", label: "Insights", icon: "auto_graph" });
  }
  if (features?.maps) {
    destinations.push({ path: "/app/map", label: "Places", icon: "map" });
  }
  if (features?.organizations) {
    destinations.push({ path: "/app/organizations", label: "Teams", icon: "groups" });
  }
  if (features?.admin) {
    destinations.push({ path: "/app/admin", label: "Admin", icon: "admin_panel_settings" });
  }
  return destinations;
}

function navLinkClasses(isActive: boolean): string {
  return [
    "group flex flex-col items-center justify-center gap-1 rounded-control px-2 py-2 text-[11px] font-medium",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
    "motion-safe:transition-colors motion-safe:duration-feedback",
    isActive ? "text-on-surface" : "text-on-surface-variant hover:text-on-surface",
  ].join(" ");
}

function NavItem({ destination, compact = false }: { destination: NavDestination; compact?: boolean }) {
  return (
    <NavLink
      to={destination.path}
      className={({ isActive }) =>
        `${navLinkClasses(isActive)} ${compact ? "h-full w-full px-1 py-1 text-[10px] leading-tight" : ""}`
      }
      end={false}
    >
      {({ isActive }) => (
        <>
          <span
            className={[
              `flex h-8 ${compact ? "w-10" : "w-14"} items-center justify-center rounded-full`,
              "motion-safe:transition-colors motion-safe:duration-feedback",
              isActive
                ? "bg-secondary-container text-on-secondary-container"
                : "group-hover:bg-surface-container-high",
            ].join(" ")}
          >
            <MaterialIcon name={destination.icon} size={22} />
          </span>
          {destination.label}
        </>
      )}
    </NavLink>
  );
}

type AccountControls = {
  user: User;
  onSignOut: () => void;
  signingOut: boolean;
};

export function NavRail({ user, onSignOut, signingOut }: AccountControls) {
  const destinations = useNavDestinations();

  return (
    <nav
      aria-label="Cognaxis sections"
      className="border-outline-variant bg-surface-container-low hidden w-[84px] shrink-0 flex-col items-stretch gap-1 border-r px-2 pt-4 md:flex"
    >
      {destinations.map((destination) => (
        <NavItem key={destination.path} destination={destination} />
      ))}
      <div className="border-outline-variant mt-auto border-t pt-2 pb-3">
        <AccountMenu
          user={user}
          onSignOut={onSignOut}
          signingOut={signingOut}
          compact
          align="start"
        />
      </div>
    </nav>
  );
}

export function BottomNav({ user, onSignOut, signingOut }: AccountControls) {
  const destinations = useNavDestinations();
  const navigate = useNavigate();
  const location = useLocation();
  const primaryDestinations = destinations.slice(0, 3);
  const moreDestinations = destinations.slice(3);
  const moreActive = moreDestinations.some((destination) =>
    location.pathname.startsWith(destination.path),
  );

  return (
    <nav
      aria-label="Cognaxis sections"
      className="app-bottom-nav border-outline-variant bg-surface-container-low flex shrink-0 items-stretch justify-around border-t px-1 pt-1 md:hidden"
    >
      {primaryDestinations.map((destination) => (
        <div key={destination.path} className="min-w-0 flex-1">
          <NavItem destination={destination} compact />
        </div>
      ))}
      {moreDestinations.length > 0 && (
        <div className="min-w-0 flex-1">
          <Menu
            label="More Cognaxis sections"
            placement="top"
            items={moreDestinations.map((destination) => ({
              id: destination.path,
              label: destination.label,
              icon: destination.icon,
              onSelect: () => void navigate(destination.path),
            }))}
            trigger={(props) => (
              <button
                {...props}
                type="button"
                aria-label="More Cognaxis sections"
                className={`${navLinkClasses(moreActive)} h-full w-full px-1 py-1 text-[10px] leading-tight`}
              >
                <span
                  className={`flex h-8 w-10 items-center justify-center rounded-full ${
                    moreActive
                      ? "bg-secondary-container text-on-secondary-container"
                      : "group-hover:bg-surface-container-high"
                  }`}
                >
                  <MaterialIcon name="more_vert" size={22} />
                </span>
                More
              </button>
            )}
          />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <AccountMenu
          user={user}
          onSignOut={onSignOut}
          signingOut={signingOut}
          compact
          align="end"
        />
      </div>
    </nav>
  );
}
