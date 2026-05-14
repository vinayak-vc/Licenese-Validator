import { useEffect, useState } from 'react';
import { useProject } from '../context/ProjectContext';
import { Card, CardContent } from '../components/ui/Card';
import { api, getServerTime } from '../lib/api';
import { Users, AlertTriangle, ShieldCheck, Cpu, LayoutDashboard } from 'lucide-react';

export function Dashboard() {
  const { selectedProjectId } = useProject();
  const [stats, setStats] = useState({ 
    active: 0, 
    expiringSoon: 0, 
    new24h: 0,
    topOS: 'N/A',
    topGPU: 'N/A'
  });
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
