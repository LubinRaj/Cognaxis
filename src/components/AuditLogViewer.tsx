import React, { useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  FileCheck2,
  Shield,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Calendar,
  Layers
} from 'lucide-react';

export const AuditLogViewer: React.FC = () => {
  const { auditLogs } = useWorkspace();
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  const filteredLogs = auditLogs.filter(log => {
    if (filterStatus === 'ALL') return true;
    return log.status === filterStatus;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Immutable Security & Provenance Audit Trail
              </h2>
              <p className="text-xs text-slate-400">
                Section 10 & Invariant T14 compliant structured metadata logging (zero raw content or token leakage)
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-slate-950 text-xs text-slate-200 border border-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 font-mono"
            >
              <option value="ALL">All Statuses ({auditLogs.length})</option>
              <option value="SUCCESS">Success Only</option>
              <option value="BLOCKED">Blocked Attacks</option>
              <option value="DENIED">Denied Operations</option>
            </select>
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-[11px] uppercase font-mono text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Scope Target</th>
                <th className="px-4 py-3">Actor / IP</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Event Details & Invariant Attestation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-mono">
              {filteredLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap text-[11px]">
                    {new Date(log.timestamp).toLocaleTimeString()}
                    <span className="block text-[9px] text-slate-500">
                      {new Date(log.timestamp).toISOString().split('T')[0]}
                    </span>
                  </td>

                  <td className="px-4 py-3 font-semibold text-indigo-300 whitespace-nowrap">
                    {log.action}
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-[10px] text-slate-300">
                      {log.scopeType}: {log.scopeId.substring(0, 14)}...
                    </span>
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap text-slate-400 text-[10px]">
                    <div>{log.actorUid.substring(0, 10)}...</div>
                    <div className="text-slate-600">{log.ipMasked}</div>
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                      log.status === 'SUCCESS'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : log.status === 'BLOCKED'
                        ? 'bg-red-950 text-red-300 border border-red-800'
                        : 'bg-amber-950 text-amber-300 border border-amber-800'
                    }`}>
                      {log.status}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-slate-300 font-sans text-xs leading-relaxed max-w-md">
                    {log.details}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
