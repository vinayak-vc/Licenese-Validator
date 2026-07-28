import { useState, useEffect, useRef } from 'react';
import { Search, Monitor, Apple, TerminalSquare, CheckCircle2, XCircle, AlertCircle, ExternalLink, Cpu } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useProject } from '../context/ProjectContext';
import { readSystemInfo, countryToFlag } from '../lib/systemInfo';
import { cn } from '../lib/utils';
import { FlagIcon } from '../components/ui/FlagIcon';

function OsIcon({ os }) {
  const o = (os || '').toLowerCase();
  if (o.includes('win')) return <Monitor size={14} />;
  if (o.includes('mac') || o.includes('darwin')) return <Apple size={14} />;
  return <TerminalSquare size={14} />;
}

function StatusPill({ status }) {
  if (status === 'revoked') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-red-500/10 text-red-500 border border-red-500/20">
      <XCircle size={10} /> Revoked
    </span>
  );
  if (status === 'expired') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/10 text-amber-500 border border-amber-500/20">
      <AlertCircle size={10} /> Expired
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
      <CheckCircle2 size={10} /> Active
    </span>
  );
}

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef(null);
  const { setSelectedProjectId } = useProject();
  const navigate = useNavigate();

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.searchClients(query.trim());
        setResults(res.clients || []);
        setSearched(true);
      } catch {
        setResults([]);
        setSearched(true);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const goToClient = (client) => {
    setSelectedProjectId(client.projectId);
    navigate('/clients');
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-black tracking-tight text-slate-100 flex items-center gap-3">
          Global Search
          <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono uppercase tracking-widest border border-slate-700">
            All Projects
          </span>
        </h2>
        <p className="text-slate-400 text-sm mt-1">Search by IP, hardware, country, device name, or project across all registries.</p>
      </div>

      {/* Search Input */}
      <div className="relative group">
        <Search
          size={18}
          className={cn(
            "absolute left-4 top-1/2 -translate-y-1/2 transition-colors",
            loading ? "text-cyan-400 animate-pulse" : "text-slate-500 group-focus-within:text-cyan-500"
          )}
        />
        <input
          type="text"
          autoFocus
          placeholder="27.109.19.18 · Intel Core i9 · India · Windows 11 · SHM_Dual..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full bg-slate-950/60 border border-slate-700 rounded-xl pl-12 pr-4 py-3.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500/50 transition-all"
        />
        {query.length > 0 && query.length < 2 && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-slate-600 font-mono">
            min 2 chars
          </span>
        )}
      </div>

      {/* Results */}
      {searched && !loading && (
        <div className="text-[11px] text-slate-500 font-mono px-1">
          {results.length === 0
            ? `No results for "${query}"`
            : `${results.length} result${results.length !== 1 ? 's' : ''} for "${query}"`}
        </div>
      )}

      {results.length > 0 && (
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="text-[10px] uppercase font-bold tracking-[0.2em] bg-slate-950/50 text-slate-500 border-b border-slate-800">
              <tr>
                <th className="px-5 py-4">Project</th>
                <th className="px-5 py-4">Device</th>
                <th className="px-5 py-4">IP</th>
                <th className="px-5 py-4">Hardware</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Last Online</th>
                <th className="px-5 py-4 text-right">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {results.map(client => {
                const info = readSystemInfo(client.systemInfo);
                const flag = countryToFlag(info.country);
                const displayName = info.deviceName || client.deviceId;

                return (
                  <tr
                    key={`${client.projectId}__${client.deviceId}`}
                    onClick={() => goToClient(client)}
                    className="group cursor-pointer hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <span className="text-[11px] font-bold text-cyan-400/80 bg-cyan-500/5 border border-cyan-500/20 rounded px-1.5 py-0.5 font-mono">
                        {client.projectName || client.projectId}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col">
                        <span className="flex items-center gap-1.5 text-slate-200 font-medium text-xs truncate max-w-[160px]">
                          <FlagIcon flag={flag} />
                          <span className={cn("truncate", !info.deviceName && "font-mono")} title={client.deviceId}>
                            {displayName}
                          </span>
                        </span>
                        {info.country && (
                          <span className="text-[10px] text-slate-500 mt-0.5">{info.country}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-[11px] text-slate-400 font-mono">{client.ip || '—'}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <OsIcon os={info.os} />
                        <div className="flex flex-col min-w-0">
                          <span className="text-[11px] text-slate-300 truncate max-w-[160px]" title={info.cpu}>{info.cpu || '—'}</span>
                          <span className="text-[10px] text-slate-500 truncate max-w-[160px]" title={info.gpu}>{info.gpu || '—'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusPill status={client.status} />
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={cn(
                        "text-[11px] font-mono",
                        client.lastOnline ? "text-cyan-600/70" : "text-slate-600"
                      )}>
                        {client.lastOnline
                          ? formatDistanceToNow(client.lastOnline, { addSuffix: true })
                          : 'Never'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <ExternalLink size={14} className="text-slate-600 group-hover:text-cyan-400 transition-colors ml-auto" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state / tips */}
      {!searched && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4">
          {[
            { label: 'IP Address', example: '27.109.19.18', icon: '🌐' },
            { label: 'CPU / GPU', example: 'Intel Core i9', icon: '🔲' },
            { label: 'Country', example: 'India', icon: '🗺️' },
            { label: 'Device Name', example: 'DESKTOP-ABC123', icon: '💻' },
          ].map(tip => (
            <button
              key={tip.label}
              onClick={() => setQuery(tip.example)}
              className="flex flex-col gap-1 p-3 bg-slate-900/40 border border-slate-800 rounded-xl hover:border-slate-700 hover:bg-slate-800/40 transition-colors text-left"
            >
              <span className="text-lg">{tip.icon}</span>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{tip.label}</span>
              <span className="text-[11px] text-slate-600 font-mono truncate">{tip.example}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
