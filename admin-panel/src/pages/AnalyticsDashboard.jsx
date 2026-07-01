import { useEffect, useMemo, useState } from 'react';
import { useProject } from '../context/ProjectContext';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { BarChart3, Activity, Users, Filter } from 'lucide-react';

// One event fetch is scoped to a single (projectId, deviceId). To build a
// project-wide view without a dedicated aggregation function, we fan out one
// per client and merge. Capped to keep this reasonable on projects with many
// devices; a future Firestore-triggered counter aggregation function is the
// scale-out path (see docs/roadmap.md).
const MAX_CLIENTS_TO_SCAN = 50;
const EVENTS_PER_CLIENT = 200;

export function AnalyticsDashboard() {
  const { selectedProjectId, projects } = useProject();
  const [clients, setClients] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedAppType, setSelectedAppType] = useState('all');

  const activeProject = useMemo(
    () => projects.find((p) => p.projectId === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!selectedProjectId) return;
      setLoading(true);
      try {
        const clientsResponse = await api.getClients(selectedProjectId);
        const clientList = clientsResponse.clients || [];
        const capped = clientList.slice(0, MAX_CLIENTS_TO_SCAN);

        const results = await Promise.all(
          capped.map((client) =>
            api
              .getClientEvents(selectedProjectId, client.deviceId, {
                limit: EVENTS_PER_CLIENT,
              })
              .then((response) =>
                (response.events || []).map((event) => ({
                  ...event,
                  deviceId: client.deviceId,
                }))
              )
              .catch(() => [])
          )
        );

        if (cancelled) return;
        setClients(clientList);
        setEvents(results.flat());
      } catch (error) {
        console.error('AnalyticsDashboard load failed', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  const filteredEvents = useMemo(() => {
    if (selectedAppType === 'all') return events;
    return events.filter((event) => event.params?.app_type === selectedAppType);
  }, [events, selectedAppType]);

  const stats = useMemo(() => {
    const byName = {};
    const byDevice = new Set();
    const byAppType = { Game: 0, Enterprise: 0, Kiosk: 0 };

    filteredEvents.forEach((event) => {
      byName[event.name] = (byName[event.name] || 0) + 1;
      byDevice.add(event.deviceId);
      const appType = event.params?.app_type;
      if (appType && byAppType[appType] !== undefined) byAppType[appType]++;
    });

    const topEvents = Object.entries(byName)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    return {
      total: filteredEvents.length,
      uniqueDevices: byDevice.size,
      topEvents,
      byAppType,
    };
  }, [filteredEvents]);

  if (!selectedProjectId) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-slate-500 italic">
        Select a project to view analytics.
      </div>
    );
  }

  const appTypeOptions = ['all', 'Game', 'Enterprise', 'Kiosk'];

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-100 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-500 ring-1 ring-cyan-500/20 shadow-lg shadow-cyan-500/5">
              <BarChart3 size={24} />
            </div>
            Analytics
          </h2>
          <p className="text-slate-400 mt-2">
            Events logged by client devices for {activeProject ? activeProject.name : 'this project'}
            {activeProject?.applicationType ? ` (${activeProject.applicationType})` : ''}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Filter size={14} className="text-slate-500" />
          <select
            value={selectedAppType}
            onChange={(event) => setSelectedAppType(event.target.value)}
            className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50"
          >
            {appTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option === 'all' ? 'All app types' : option}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <p className="text-xs text-slate-500 italic">Scanning up to {MAX_CLIENTS_TO_SCAN} devices...</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <Activity size={14} className="text-cyan-500" /> Total Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-black text-slate-100">{stats.total.toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <Users size={14} className="text-emerald-500" /> Active Devices
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-black text-slate-100">{stats.uniqueDevices}</p>
            <p className="text-xs text-slate-500 mt-1">
              of {clients.length} registered ({Math.min(clients.length, MAX_CLIENTS_TO_SCAN)} scanned)
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              App Type Mix
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {Object.entries(stats.byAppType).map(([type, count]) => (
              <div key={type} className="flex justify-between text-slate-300">
                <span>{type}</span>
                <span className="text-slate-500">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
        <CardHeader>
          <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">
            Top 10 Events
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {stats.topEvents.length === 0 ? (
            <p className="text-xs text-slate-600 italic py-4">
              No events logged yet for this filter.
            </p>
          ) : (
            stats.topEvents.map(([name, count]) => (
              <div key={name} className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-200 truncate pr-4" title={name}>{name}</span>
                  <span className="text-slate-500 shrink-0">{count}</span>
                </div>
                <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)] transition-all duration-1000"
                    style={{ width: `${(count / stats.total) * 100}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
