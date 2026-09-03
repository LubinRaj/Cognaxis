import { useEffect, useState, useMemo } from "react";
import { MaterialIcon } from "../MaterialIcon";
import { ApiClient } from "../../lib/api-client";
import { type User } from "firebase/auth";
import { AdminUsersTable } from "./AdminUsersTable";

type Props = {
  user: User;
  onNavigate: (path: string) => void;
};

interface CapabilitiesResponse {
  platformRole: string;
  status: string;
}

interface AdminMetrics {
  totalUsers: number;
  totalOrganizations: number;
  totalSessions: number;
}

export function AdminDashboard({ user, onNavigate }: Props) {
  const api = useMemo(() => new ApiClient(() => user), [user]);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    let live = true;

    // Check capabilities first
    api.request<CapabilitiesResponse>("/me/capabilities")
      .then(caps => {
        if (!live) return;
        if (caps.platformRole !== "super_admin") {
          setError("You do not have permission to access the platform admin dashboard.");
          setLoading(false);
          return;
        }
        setIsSuperAdmin(true);
        
        // Fetch metrics
        api.request<AdminMetrics>("/admin/metrics")
          .then(data => {
            if (live) setMetrics(data);
          })
          .catch((e: unknown) => {
            if (live) setError(e instanceof Error ? e.message : String(e));
          })
          .finally(() => {
            if (live) setLoading(false);
          });
      })
      .catch((e: unknown) => {
        if (live) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      });

    return () => { live = false; };
  }, [api]);

  return (
    <div className="flex h-screen w-screen flex-col bg-[#060d0b] text-[#e8f3ef]">
      <header className="flex items-center justify-between border-b border-[#16201d] px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => onNavigate("/journal")}
            className="flex items-center gap-2 text-slate-400 hover:text-white"
          >
            <MaterialIcon name="arrow_back" size={20} />
            <span className="text-sm font-medium">Back</span>
          </button>
          <div className="h-4 w-px bg-slate-700" />
          <h1 className="text-xl font-semibold text-teal-400">Platform Admin</h1>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 lg:p-10">
        <div className="mx-auto max-w-5xl space-y-8">
          
          {loading ? (
            <div className="flex justify-center p-12">
              <MaterialIcon name="progress_activity" size={32} className="animate-spin text-teal-500" />
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center text-red-300">
              <MaterialIcon name="lock" size={48} className="mx-auto mb-4 text-red-400/50" />
              <h2 className="text-lg font-medium mb-2">Access Denied</h2>
              <p>{error}</p>
            </div>
          ) : isSuperAdmin && metrics ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="rounded-2xl border border-[#2d3734] bg-[#0d1614] p-6 text-center">
                <h3 className="mb-2 text-sm font-medium text-slate-400">Total Users</h3>
                <div className="text-5xl font-light text-teal-400">{metrics.totalUsers}</div>
              </div>

              <div className="rounded-2xl border border-[#2d3734] bg-[#0d1614] p-6 text-center">
                <h3 className="mb-2 text-sm font-medium text-slate-400">Organizations</h3>
                <div className="text-5xl font-light text-teal-400">{metrics.totalOrganizations}</div>
              </div>

            </div>
          ) : null}

          {isSuperAdmin && metrics && (
             <AdminUsersTable api={api} />
          )}
        </div>
      </main>
    </div>
  );
}
