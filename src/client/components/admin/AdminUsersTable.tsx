import { useEffect, useState } from "react";
import type { ApiClient } from "../../lib/api-client";
import type { PlatformUser, PlatformRole } from "../../../shared/schemas";

type Props = { api: ApiClient };

export function AdminUsersTable({ api }: Props) {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    api.request<{ users: PlatformUser[] }>("/admin/users")
      .then(res => { if(live) { setUsers(res.users); setLoading(false); }})
      .catch(() => { if(live) setLoading(false); });
    return () => { live = false; };
  }, [api]);

  async function toggleRole(targetUid: string, currentRole: PlatformRole) {
    const newRole: PlatformRole = currentRole === "super_admin" ? "user" : "super_admin";
    if (!confirm(`Change role to ${newRole}?`)) return;
    try {
      await api.request(`/admin/users/${targetUid}/role`, { method: "PATCH", body: JSON.stringify({ role: newRole }) });
      setUsers(curr => curr.map(u => u.uid === targetUid ? { ...u, platformRole: newRole } : u));
    } catch {
      alert("Failed to update role");
    }
  }

  if (loading) return <div className="text-slate-500 py-4 text-center">Loading directory...</div>;

  return (
    <div className="overflow-x-auto mt-8">
      <table className="w-full text-left text-sm text-slate-300">
        <thead className="bg-[#16201d] text-xs uppercase text-slate-400">
          <tr>
            <th className="px-4 py-3 rounded-tl-xl">User</th>
            <th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 rounded-tr-xl">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#2d3734]">
          {users.map(u => (
            <tr key={u.uid} className="bg-[#0d1614] hover:bg-[#16201d] transition-colors">
              <td className="px-4 py-4 font-medium text-white">
                <div>{u.displayName || "Unknown User"}</div>
                <div className="text-xs text-slate-500">{u.email || u.uid}</div>
              </td>
              <td className="px-4 py-4">
                <span className={`px-2 py-1 rounded text-xs font-semibold ${u.platformRole === 'super_admin' ? 'bg-amber-500/20 text-amber-300' : 'bg-teal-500/10 text-teal-300'}`}>
                  {u.platformRole}
                </span>
              </td>
              <td className="px-4 py-4">
                <span className={`px-2 py-1 rounded text-xs font-semibold ${u.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                  {u.status}
                </span>
              </td>
              <td className="px-4 py-4">
                <button onClick={() => { void toggleRole(u.uid, u.platformRole); }} className="text-teal-400 hover:text-teal-300 text-xs font-medium px-2 py-1 rounded border border-teal-500/30">
                  Toggle Role
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
