import { useEffect, useState, useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { 
  Monitor, Apple, TerminalSquare, Cpu, HardDrive, 
  MoreVertical, CheckCircle2, XCircle, AlertCircle, 
  Trash2, Calendar, Download, ShieldAlert, UserCheck, 
  UserMinus, Search, Filter
} from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { useToast } from '../context/ToastContext';
import { api, getServerTime } from '../lib/api';
import { Button } from '../components/ui/Button';
import { cn } from '../lib/utils';

function StatusPill({ status, trialEnd }) {
  const now = getServerTime();
  const isExpired = trialEnd < now;

  if (status === 'revoked') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-500/10 text-red-500 border border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]">
        <XCircle size={12} /> Revoked
      </span>
    );
  }
  if (isExpired) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-500 border border-amber-500/20">
        <AlertCircle size={12} /> Expired
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
      <CheckCircle2 size={12} /> Active
    </span>
  );
}

function OsIcon({ os }) {
  const osLower = (os || '').toLowerCase();
  if (osLower.includes('win')) return <Monitor size={16} />;
  if (osLower.includes('mac') || osLower.includes('darwin')) return <Apple size={16} />;
  return <TerminalSquare size={16} />;
}

export function ClientRegistry() {
  const { selectedProjectId } = useProject();
  const { addToast } = useToast();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [confirmRevoke, setConfirmRevoke] = useState(null);
  const [revokeReasonOpen, setRevokeReasonOpen] = useState(null);

  const loadClients = async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    try {
      const res = await api.getClients(selectedProjectId, search);
      setClients(res.clients || []);
      setSelectedRows(new Set());
    } catch (error) {
      addToast(`Failed to load clients: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, [selectedProjectId]);

  const ipCollisions = useMemo(() => {
    const counts = {};
    clients.forEach(c => {
      if (c.ip) counts[c.ip] = (counts[c.ip] || 0) + 1;
    });
    return Object.fromEntries(Object.entries(counts).filter(([_, count]) => count > 1));
  }, [clients]);

  const toggleRow = (id) => {
    const next = new Set(selectedRows);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedRows(next);
  };

  const toggleAll = () => {
    if (selectedRows.size === clients.length) setSelectedRows(new Set());
    else setSelectedRows(new Set(clients.map(c => c.deviceId)));
  };

  const handleExtend = async (deviceId) => {
    try {
      await api.extendTrial({ projectId: selectedProjectId, deviceId, extendDays: 7 });
      addToast(`Extended trial for ${deviceId} (+7d)`, 'success');
      loadClients();
    } catch (error) {
      addToast(`Failed to extend: ${error.message}`, 'error');
    }
  };

  const handleRevoke = async (deviceId, reason = 'Manual Override') => {
    try {
      await api.revokeTrial({ projectId: selectedProjectId, deviceId, reason });
      addToast(`Revoked trial for ${deviceId}: ${reason}`, 'success');
      setRevokeReasonOpen(null);
      setConfirmRevoke(null);
      loadClients();
    } catch (error) {
      addToast(`Failed to revoke: ${error.message}`, 'error');
    }
  };

  const handleBatchExtend = async () => {
    if (selectedRows.size === 0) return;
    const ids = Array.from(selectedRows);
    addToast(`Batch extending ${ids.length} clients...`, 'info');
    try {
      await Promise.all(ids.map(id => api.extendTrial({ projectId: selectedProjectId, deviceId: id, extendDays: 7 })));
      addToast(`Successfully extended ${ids.length} trials.`, 'success');
      loadClients();
    } catch (error) {
      addToast(`Batch operation partially failed: ${error.message}`, 'error');
    }
  };

  const handleExport = () => {
    const rows = clients.filter(c => selectedRows.size === 0 || selectedRows.has(c.deviceId));
    const csv = [
      ['Device ID', 'Status', 'IP', 'OS', 'CPU', 'Trial End'],
      ...rows.map(c => [
        c.deviceId, c.status, c.ip || '', c.systemInfo?.os || '', 
        c.systemInfo?.cpu || '', new Date(Number(c.trialEnd)).toISOString()
      ])
    ].map(r => r.join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexusgate_export_${selectedProjectId}.csv`;
    a.click();
    addToast("Client list exported to CSV", "success");
  };

  if (!selectedProjectId) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-slate-500 italic">
        Select a project to unlock registry insights.
      </div>
    );
  }

  return (
    <div className="space-y-6 relative pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-100 flex items-center gap-3">
            Client Registry
            <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono uppercase tracking-widest border border-slate-700">
              {clients.length} Total
            </span>
          </h2>
          <p className="text-slate-400 text-sm mt-1">Manage and audit cross-platform trial licenses.</p>
        </div>
        
        <form onSubmit={(e) => { e.preventDefault(); loadClients(); }} className="flex gap-2">
          <div className="relative group">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-cyan-500 transition-colors" />
            <input
              type="text"
              placeholder="Search ID / IP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-950/50 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500/50 transition-all w-64"
            />
          </div>
          <Button type="submit" variant="secondary" className="gap-2">
            <Filter size={14} />
            Filter
          </Button>
        </form>
      </div>

      <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-2xl overflow-visible shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="text-[10px] uppercase font-bold tracking-[0.2em] bg-slate-950/50 text-slate-500 border-b border-slate-800">
              <tr>
                <th className="px-6 py-5 w-4">
                  <input 
                    type="checkbox" 
                    checked={clients.length > 0 && selectedRows.size === clients.length}
                    onChange={toggleAll}
                    className="rounded border-slate-800 bg-slate-950 text-cyan-600 focus:ring-cyan-500/20"
                  />
                </th>
                <th className="px-6 py-5">Node Identity</th>
                <th className="px-6 py-5">Status</th>
                <th className="px-6 py-5 text-center">Hardware</th>
                <th className="px-6 py-5">Chronology</th>
                <th className="px-6 py-5 text-right">Directives</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-slate-500 animate-pulse font-medium tracking-wide italic">
                    Accessing Central Repository...
                  </td>
                </tr>
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-slate-500 font-medium">
                    No registry entries found for this project.
                  </td>
                </tr>
              ) : (
                clients.map((client) => {
                  const trialEndMs = Number(client.trialEnd || 0);
                  const now = getServerTime();
                  const isSelected = selectedRows.has(client.deviceId);
                  const hasCollision = ipCollisions[client.ip];

                  const relativeTime = trialEndMs > now
                    ? `Expires in ${formatDistanceToNow(trialEndMs)}`
                    : `Expired ${formatDistanceToNow(trialEndMs)} ago`;

                  return (
                    <tr 
                      key={client.deviceId} 
                      className={cn(
                        "group transition-all duration-200",
                        isSelected ? "bg-cyan-500/5" : "hover:bg-slate-800/30",
                        client.isStaff && "opacity-40 grayscale-[0.5]"
                      )}
                    >
                      <td className="px-6 py-4">
                        <input 
                          type="checkbox" 
                          checked={isSelected}
                          onChange={() => toggleRow(client.deviceId)}
                          className="rounded border-slate-800 bg-slate-950 text-cyan-600 focus:ring-cyan-500/20"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-mono text-slate-200 font-bold tracking-tight truncate max-w-[140px]" title={client.deviceId}>
                            {client.deviceId}
                          </span>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-slate-500 font-mono tracking-tighter">
                              IP: {client.ip || '---.---.---.---'}
                            </span>
                            {hasCollision && (
                              <div className="group/collision relative">
                                <ShieldAlert size={12} className="text-amber-500 animate-pulse cursor-help" />
                                <div className="absolute left-0 bottom-full mb-1 hidden group-hover/collision:block bg-amber-500 text-slate-950 text-[10px] font-bold px-2 py-1 rounded shadow-xl whitespace-nowrap z-50">
                                  IP COLLISION: {ipCollisions[client.ip]} Nodes
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <StatusPill status={client.status} trialEnd={trialEndMs} />
                      </td>
                      <td className="px-6 py-4 relative overflow-visible">
                        <div className="flex justify-center">
                          <div className="relative group/hw inline-flex items-center text-slate-500 hover:text-cyan-400 transition-colors p-2 rounded-lg hover:bg-cyan-500/5 ring-1 ring-transparent hover:ring-cyan-500/20 cursor-help">
                            <OsIcon os={client.systemInfo?.os} />
                            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-3 hidden group-hover/hw:block w-72 bg-slate-950 border border-slate-800 shadow-2xl rounded-xl p-4 z-[9999] pointer-events-none ring-1 ring-white/10">
                              <div className="space-y-3">
                                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                                   <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Hardware Metrics</span>
                                   <OsIcon os={client.systemInfo?.os} />
                                </div>
                                <div className="space-y-2 text-left">
                                  <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center shrink-0 border border-slate-800">
                                      <Cpu size={14} className="text-cyan-500" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Processor</p>
                                      <p className="text-xs font-medium text-slate-200 truncate">{client.systemInfo?.cpu || 'Standard Compute Node'}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center shrink-0 border border-slate-800">
                                      <HardDrive size={14} className="text-emerald-500" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">GPU Engine</p>
                                      <p className="text-xs font-medium text-slate-200 truncate">{client.systemInfo?.gpu || 'Integrated Silicon'}</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className={cn(
                            "text-xs font-medium tracking-tight",
                            trialEndMs > now ? "text-slate-300" : "text-red-400/80"
                          )}>
                            {relativeTime}
                          </span>
                          <span className="text-[10px] text-slate-600 font-mono mt-1">
                            {new Date(trialEndMs).toLocaleDateString()}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8 hover:bg-emerald-500/10 hover:text-emerald-500"
                            title="Extend +7 Days"
                            onClick={() => handleExtend(client.deviceId)}
                          >
                            <Calendar size={14} />
                          </Button>
                          
                          <div className="relative">
                            <Button
                              size="icon"
                              variant="ghost"
                              className={cn(
                                "h-8 w-8 transition-all",
                                confirmRevoke === client.deviceId ? "bg-red-500 text-white hover:bg-red-600 scale-110" : "hover:bg-red-500/10 hover:text-red-500"
                              )}
                              onClick={() => {
                                if (confirmRevoke === client.deviceId) setRevokeReasonOpen(client.deviceId);
                                else {
                                  setConfirmRevoke(client.deviceId);
                                  setTimeout(() => setConfirmRevoke(null), 3000);
                                }
                              }}
                            >
                              <Trash2 size={14} />
                            </Button>
                            
                            {revokeReasonOpen === client.deviceId && (
                              <div className="absolute right-0 top-full mt-2 w-48 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl z-50 p-2 overflow-hidden ring-1 ring-white/10">
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2 px-2">Revocation Reason</p>
                                {['Time Tampering', 'Leaked Key', 'Manual Override'].map(reason => (
                                  <button
                                    key={reason}
                                    onClick={() => handleRevoke(client.deviceId, reason)}
                                    className="w-full text-left px-3 py-1.5 text-[11px] font-medium text-slate-300 hover:bg-red-500/10 hover:text-red-400 rounded-md transition-colors"
                                  >
                                    {reason}
                                  </button>
                                ))}
                                <div className="border-t border-slate-800 mt-2 pt-1">
                                  <button 
                                    onClick={() => setRevokeReasonOpen(null)}
                                    className="w-full text-center py-1 text-[9px] font-bold text-slate-500 hover:text-slate-300"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>

                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8 hover:bg-slate-800"
                            title={client.isStaff ? "Demote from Staff" : "Promote to Staff"}
                            onClick={() => {
                              // Local simulation of staff toggle
                              const next = clients.map(c => c.deviceId === client.deviceId ? { ...c, isStaff: !c.isStaff } : c);
                              setClients(next);
                              addToast(`${client.deviceId} staff status toggled.`, 'info');
                            }}
                          >
                            {client.isStaff ? <UserMinus size={14} /> : <UserCheck size={14} />}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating Batch Action Bar */}
      {selectedRows.size > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-max bg-slate-950 border border-slate-800 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[60] p-2 flex items-center gap-2 animate-in slide-in-from-bottom-8 duration-300 ring-1 ring-cyan-500/20">
          <div className="px-4 py-2 border-r border-slate-800 flex items-center gap-3">
             <div className="w-6 h-6 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center text-[10px] font-black">
                {selectedRows.size}
             </div>
             <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">Active Selections</span>
          </div>
          
          <div className="flex items-center gap-1 p-1">
            <Button variant="ghost" size="sm" className="h-9 gap-2 text-emerald-400 hover:bg-emerald-500/10" onClick={handleBatchExtend}>
               <Calendar size={14} />
               Extend +7d
            </Button>
            <Button variant="ghost" size="sm" className="h-9 gap-2 text-red-400 hover:bg-red-500/10" onClick={() => {
              if (confirm("Revoke selected trials?")) {
                 Promise.all(Array.from(selectedRows).map(id => api.revokeTrial({ projectId: selectedProjectId, deviceId: id })))
                  .then(() => { addToast(`Revoked ${selectedRows.size} trials`, 'success'); loadClients(); });
              }
            }}>
               <Trash2 size={14} />
               Revoke Batch
            </Button>
            <div className="w-px h-6 bg-slate-800 mx-2" />
            <Button variant="ghost" size="sm" className="h-9 gap-2 text-slate-300 hover:bg-slate-800" onClick={handleExport}>
               <Download size={14} />
               Export CSV
            </Button>
            <button 
              className="ml-2 text-[10px] font-bold text-slate-500 hover:text-slate-300 px-3 uppercase tracking-tighter"
              onClick={() => setSelectedRows(new Set())}
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
