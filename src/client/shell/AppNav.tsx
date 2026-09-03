import { NavLink } from "react-router-dom";
import { MaterialIcon, type MaterialIconName } from "../components/MaterialIcon";
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
    { path: "/app/journal", label: "Journal", icon: "forum" },
  ];
  if (features?.insights) {
    destinations.push({ path: "/app/insights", label: "Insights", icon: "auto_graph" });
  }
  if (features?.maps) {
    destinations.push({ path: "/app/map", label: "Map", icon: "map" });
  }
  if (features?.organizations) {
    destinations.push({ path: "/app/organizations", label: "Organizations", icon: "groups" });
  }
  if (features?.admin) {
    destinations.push({ path: "/app/admin", label: "Admin", icon: "admin_panel_settings" });
  }
  return destinations;
}

function navLinkClasses(isActive: boolean): string {
  return [
    "group flex flex-col items-center gap-1 rounded-control px-2 py-2 text-[11px] font-medium",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
    "motion-safe:transition-colors motion-safe:duration-feedback",
    isActive ? "text-on-surface" : "text-on-surface-variant hover:text-on-surface",
  ].join(" ");
}

function NavItem({ destination }: { destination: NavDestination }) {
  return (
    <NavLink to={destination.path} className={({ isActive }) => navLinkClasses(isActive)} end={false}>
      {({ isActive }) => (
        <>
          <span
            className={[
              "flex h-8 w-14 items-center justify-center rounded-full",
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

export function NavRail() {
  const destinations = useNavDestinations();

  return (
    <nav
      aria-label="Cognaxis sections"
      className="border-outline-variant bg-surface-container-low hidden w-[84px] shrink-0 flex-col items-stretch gap-1 border-r px-2 pt-4 md:flex"
    >
      {destinations.map((destination) => (
        <NavItem key={destination.path} destination={destination} />
      ))}
    </nav>
  );
}

export function BottomNav() {
  const destinations = useNavDestinations();

  return (
    <nav
      aria-label="Cognaxis sections"
      className="border-outline-variant bg-surface-container-low flex shrink-0 items-stretch justify-around border-t px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] md:hidden"
    >
      {destinations.map((destination) => (
        <NavItem key={destination.path} destination={destination} />
      ))}
    </nav>
  );
}
