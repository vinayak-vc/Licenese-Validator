import { useEffect, useState } from 'react';
import { useProject } from '../context/ProjectContext';
import { Card, CardContent } from '../components/ui/Card';
import { api, getServerTime } from '../lib/api';
import { Users, AlertTriangle, ShieldCheck, Cpu, LayoutDashboard, Activity, Radio, Bug } from 'lucide-react';

function FleetTile({ label, value, color, icon: Icon, pulse }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-950 border border-slate-800">
      <span
        className="flex items-center justify-center h-10 w-10 rounded-lg shrink-0"
        style={{ backgroundColor: `${color}20`, color }}
      >
        <Icon size={16} className={pulse ? 'animate-pulse' : ''} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
        <p className="text-2xl font-black text-slate-100">{value.toLocaleString()}</p>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { selectedProjectId } = useProject();
  const [stats, setStats] = useState({
    active: 0,
    expiringSoon: 0,
    new24h: 0,
    topOS: 'N/A',
    topGPU: 'N/A'
  });
  const [fleet, setFleet] = useState({ online: 0, offline: 0, silent: 0, errors24h: 0, activeInWindow: 0, totalRegistered: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchStats() {
      if (!selectedProjectId) return;
      setLoading(true);
      try {
        const res = await api.getClients(selectedProjectId);
        const clients = res.clients || [];
        const now = getServerTime();
        const oneDayMs = 24 * 60 * 60 * 1000;

        let active = 0;
        let expiringSoon = 0;
        let new24h = 0;
        const osCounts = {};
        const gpuCounts = {};

        for (const client of clients) {
          // Skip internal/staff dev rows from core analytics
          if (client.isStaff) continue;

          const trialEnd = Number(client.trialEnd || 0);
          const createdAt = client.createdAt ? new Date(client.createdAt).getTime() : now;
          
          if (trialEnd > now) {
            active++;
            if (trialEnd - now < oneDayMs) {
              expiringSoon++;
            }
          }
          if (now - createdAt < oneDayMs) {
            new24h++;
          }

          // Hardware Profile
          const os = client.systemInfo?.os || 'Unknown';
          const gpu = client.systemInfo?.gpu || 'Unknown';
          osCounts[os] = (osCounts[os] || 0) + 1;
          gpuCounts[gpu] = (gpuCounts[gpu] || 0) + 1;
        }

        const topOS = Object.keys(osCounts).reduce((a, b) => osCounts[a] > osCounts[b] ? a : b, 'N/A');
        const topGPU = Object.keys(gpuCounts).reduce((a, b) => gpuCounts[a] > gpuCounts[b] ? a : b, 'N/A');

        setStats({ active, expiringSoon, new24h, topOS, topGPU });

        // Fleet health signals — merged into one pass so we don't re-fetch.
        // Live = client pinged (lastOnline) within 90s.
        // Silent = licensed / active trial but no lastOnline ever recorded.
        // Offline = has lastOnline but stale (> 24h).
        const LIVE_WINDOW_MS = 90 * 1000;
        let online = 0;
        let offline = 0;
        let silent = 0;
        for (const client of clients) {
          if (client.isStaff) continue;
          const trialEnd = Number(client.trialEnd || 0);
          if (trialEnd <= now) continue;
          const lastOnline = Number(client.lastOnline || 0);
          if (lastOnline === 0) silent += 1;
          else if (now - lastOnline < LIVE_WINDOW_MS) online += 1;
          else if (now - lastOnline > oneDayMs) offline += 1;
        }

        // Errors in last 24h — fetch recent events endpoint and count errors.
        let errors24h = 0;
        let activeInWindow = 0;
        try {
          const recentResult = await api.getRecentEvents(selectedProjectId, now - oneDayMs, 500);
          const recent = recentResult.events || [];
          const activeSet = new Set();
          recent.forEach((event) => {
            activeSet.add(event.deviceId);
            if (event.name === 'error_reported' || event.name === 'exception_caught' || event.name === 'kiosk_hardware_fault') {
              errors24h += 1;
            }
          });
          activeInWindow = activeSet.size;
        } catch (recentError) {
          console.warn('recent events fetch failed', recentError);
        }

        setFleet({
          online,
          offline,
          silent,
          errors24h,
          activeInWindow,
          totalRegistered: clients.length,
        });
      } catch (error) {
        console.error("Failed to load dashboard stats", error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, [selectedProjectId]);

  if (!selectedProjectId) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-center px-4">
        <div className="w-20 h-20 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-6 shadow-2xl relative">
          <div className="absolute inset-0 bg-cyan-500/5 blur-2xl rounded-full"></div>
          <LayoutDashboard size={40} className="text-slate-700" />
        </div>
        <h2 className="text-2xl font-bold text-slate-100 mb-2">No Project Selected</h2>
        <p className="text-slate-400 max-w-xs mx-auto">
          Please select a project from the sidebar or create a new one to begin monitoring your licenses.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-100">Project Overview</h2>
          <p className="text-slate-400 mt-1">Real-time performance metrics for your enterprise suite.</p>
        </div>
      </div>
      
      <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-cyan-500" />
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">Fleet Health (last 24h)</span>
            </div>
            <span className="text-[10px] text-slate-600">
              {fleet.activeInWindow} device(s) reported activity · {fleet.totalRegistered} registered
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <FleetTile label="Live Now" value={fleet.online} color="#10b981" icon={Radio} pulse={fleet.online > 0} />
            <FleetTile label="Offline (>24h)" value={fleet.offline} color="#f59e0b" icon={Radio} />
            <FleetTile label="Silent (never online)" value={fleet.silent} color="#94a3b8" icon={Users} />
            <FleetTile label="Errors 24h" value={fleet.errors24h} color={fleet.errors24h > 0 ? '#ef4444' : '#334155'} icon={Bug} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
            <ShieldCheck size={80} />
          </div>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 ring-1 ring-emerald-500/20">
                <ShieldCheck size={24} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Active Licenses</p>
                <h3 className="text-3xl font-black mt-1 text-slate-100 font-mono tracking-tighter">
                  {loading ? '---' : stats.active}
                </h3>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
            <AlertTriangle size={80} />
          </div>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 ring-1 ring-amber-500/20">
                <AlertTriangle size={24} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Expiring Soon</p>
                <h3 className="text-3xl font-black mt-1 text-slate-100 font-mono tracking-tighter">
                  {loading ? '---' : stats.expiringSoon}
                </h3>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
            <Cpu size={80} />
          </div>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-500 ring-1 ring-cyan-500/20">
                <Cpu size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Top Hardware</p>
                <div className="mt-1 flex flex-col">
                  <span className="text-sm font-bold text-slate-100 truncate">{stats.topOS}</span>
                  <span className="text-[10px] text-slate-500 truncate font-mono">{stats.topGPU}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-slate-900/50 border-slate-800">
           <CardContent className="p-8 flex flex-col items-center justify-center min-h-[200px] text-center">
              <div className="w-12 h-12 bg-indigo-500/10 rounded-full flex items-center justify-center text-indigo-400 mb-4">
                <Users size={24} />
              </div>
              <h4 className="text-lg font-bold text-slate-100">New Enrollments</h4>
              <p className="text-3xl font-black text-indigo-400 font-mono mt-2">+{stats.new24h}</p>
              <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest">In the last 24 hours</p>
           </CardContent>
        </Card>
        
        {/* Placeholder for future Charts */}
        <Card className="bg-slate-900/30 border-slate-800 border-dashed flex flex-col items-center justify-center min-h-[200px]">
           <p className="text-slate-600 font-medium italic">Temporal Analytics Coming Soon</p>
        </Card>
      </div>
    </div>
  );
}
