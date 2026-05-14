import { useEffect, useState } from 'react';
import { useProject } from '../context/ProjectContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { api, getServerTime } from '../lib/api';
import { Users, AlertTriangle, ShieldCheck } from 'lucide-react';

export function Dashboard() {
  const { selectedProjectId } = useProject();
  const [stats, setStats] = useState({ active: 0, expiringToday: 0, new24h: 0 });
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
        let expiringToday = 0;
        let new24h = 0;

        for (const client of clients) {
          const trialEnd = Number(client.trialEnd || 0);
          const createdAt = new Date(client.createdAt).getTime();
          
          if (trialEnd > now) {
            active++;
            if (trialEnd - now < oneDayMs) {
              expiringToday++;
            }
          }
          if (now - createdAt < oneDayMs) {
            new24h++;
          }
        }

        setStats({ active, expiringToday, new24h });
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
      <div className="flex items-center justify-center h-full text-slate-500">
        Please select or create a project to view the dashboard.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Dashboard Overview</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-400">Total Active Licenses</p>
              <h3 className="text-3xl font-bold mt-2 text-emerald-400">{loading ? '-' : stats.active}</h3>
            </div>
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <ShieldCheck size={24} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-400">Expiring Today</p>
              <h3 className="text-3xl font-bold mt-2 text-amber-400">{loading ? '-' : stats.expiringToday}</h3>
            </div>
            <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
              <AlertTriangle size={24} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-400">New Registrations (24h)</p>
              <h3 className="text-3xl font-bold mt-2 text-indigo-400">{loading ? '-' : stats.new24h}</h3>
            </div>
            <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-500">
              <Users size={24} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
