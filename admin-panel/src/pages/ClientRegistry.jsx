import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Monitor, Apple, TerminalSquare, Cpu, HardDrive } from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { useToast } from '../context/ToastContext';
import { api, getServerTime } from '../lib/api';
import { Button } from '../components/ui/Button';
import { cn } from '../lib/utils';

function StatusPill({ status, trialEnd }) {
  const now = getServerTime();
  const isExpired = trialEnd < now;

  if (status === 'revoked') {
    return <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-500/10 text-red-500 border border-red-500/20">Revoked</span>;
  }
  if (isExpired) {
    return <span className="px-2 py-1 text-xs font-medium rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">Expired</span>;
  }
  return <span className="px-2 py-1 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">Active</span>;
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
  const [confirmRevoke, setConfirmRevoke] = useState(null);

  const loadClients = async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    try {
      const res = await api.getClients(selectedProjectId, search);
      setClients(res.clients || []);
    } catch (error) {
      addToast(`Failed to load clients: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, [selectedProjectId]);

  const handleSearch = (e) => {
    e.preventDefault();
    loadClients();
  };

  const handleExtend = async (deviceId) => {
    try {
      await api.extendTrial({ projectId: selectedProjectId, deviceId, extendDays: 7 });
      addToast(`Extended trial for ${deviceId} by 7 days.`, 'success');
      loadClients();
    } catch (error) {
      addToast(`Failed to extend: ${error.message}`, 'error');
    }
  };

  const handleRevoke = async (deviceId) => {
    if (confirmRevoke !== deviceId) {
      setConfirmRevoke(deviceId);
      setTimeout(() => setConfirmRevoke(null), 3000);
      return;
    }
    try {
      await api.revokeTrial({ projectId: selectedProjectId, deviceId });
      addToast(`Revoked trial for ${deviceId}.`, 'success');
      setConfirmRevoke(null);
      loadClients();
    } catch (error) {
      addToast(`Failed to revoke: ${error.message}`, 'error');
    }
  };

  if (!selectedProjectId) {
    return <div className="text-slate-500">Please select a project first.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Client Registry</h2>
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            placeholder="Search device ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
          />
          <Button type="submit" size="sm" variant="secondary">Search</Button>
        </form>
      </div>

      <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="text-xs uppercase bg-slate-950/50 border-b border-slate-800 text-slate-400">
            <tr>
              <th className="px-6 py-4 font-medium">Device ID</th>
              <th className="px-6 py-4 font-medium">Status</th>
              <th className="px-6 py-4 font-medium">Hardware</th>
              <th className="px-6 py-4 font-medium">Trial End</th>
              <th className="px-6 py-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="5" className="px-6 py-8 text-center text-slate-500">Loading...</td>
              </tr>
            ) : clients.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-6 py-8 text-center text-slate-500">No clients found.</td>
              </tr>
            ) : (
              clients.map((client) => {
                const trialEndMs = Number(client.trialEnd || 0);
                const now = getServerTime();
                const relativeTime = trialEndMs > now
                  ? `Ends in ${formatDistanceToNow(trialEndMs)}`
                  : `Expired ${formatDistanceToNow(trialEndMs)} ago`;

                return (
                  <tr key={client.deviceId} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                    <td className="px-6 py-4 font-mono text-slate-300">{client.deviceId}</td>
                    <td className="px-6 py-4">
                      <StatusPill status={client.status} trialEnd={trialEndMs} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="relative group inline-flex items-center text-slate-400 hover:text-slate-200">
                        <OsIcon os={client.systemInfo?.os} />
                        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-max bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-md p-2 shadow-xl z-10">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2"><Cpu size={12}/> {client.systemInfo?.cpu || 'Unknown CPU'}</div>
                            <div className="flex items-center gap-2"><HardDrive size={12}/> {client.systemInfo?.gpu || 'Unknown GPU'}</div>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-400">{relativeTime}</td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <Button size="sm" variant="secondary" onClick={() => handleExtend(client.deviceId)}>
                        +7d
                      </Button>
                      <Button
                        size="sm"
                        variant={confirmRevoke === client.deviceId ? 'danger' : 'ghost'}
                        onClick={() => handleRevoke(client.deviceId)}
                        className={cn(confirmRevoke === client.deviceId && 'animate-pulse')}
                      >
                        {confirmRevoke === client.deviceId ? 'Confirm Revoke' : 'Revoke'}
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
