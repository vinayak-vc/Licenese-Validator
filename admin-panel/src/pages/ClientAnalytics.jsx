import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  Activity, ArrowLeft, Clock, Radio, LogIn, LogOut, Pause, Play, Eye, MousePointerClick, AlertTriangle
} from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { api, getServerTime } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';

// A client counts as "live" if its lastOnline (updated on every logEvents
// batch; the Unity provider flushes every 15s by default) is within this
// window. 90s is a healthy margin for one dropped flush without false-alarm
// churn on the pill.
const LIVE_WINDOW_MS = 90 * 1000;

const EVENT_ICONS = {
  session_start: LogIn,
  session_end: LogOut,
  app_pause: Pause,
  app_resume: Play,
  app_open: LogIn,
  screen_view: Eye,
  error_reported: AlertTriangle,
  exception_caught: AlertTriangle,
};

function pickEventIcon(name) {
  if (EVENT_ICONS[name]) return EVENT_ICONS[name];
  if (name?.startsWith('ui_')) return MousePointerClick;
  return Activity;
}

export function ClientAnalytics() {
  const { deviceId } = useParams();
  const { selectedProjectId, projects } = useProject();

  const [client, setClient] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nowTick, setNowTick] = useState(getServerTime());

  const project = useMemo(
    () => projects.find((p) => p.projectId === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!selectedProjectId || !deviceId) return;
      setLoading(true);
      try {
        const [clientsResponse, eventsResponse] = await Promise.all([
          api.getClients(selectedProjectId),
          api.getClientEvents(selectedProjectId, deviceId, { limit: 200 }),
        ]);
        if (cancelled) return;
        const match = (clientsResponse.clients || []).find((c) => c.deviceId === deviceId) || null;
        setClient(match);
        setEvents(eventsResponse.events || []);
      } catch (error) {
        console.error('ClientAnalytics load failed', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [selectedProjectId, deviceId]);

  // Refresh "live now" pill every 5s without re-fetching data.
  useEffect(() => {
    const timer = setInterval(() => setNowTick(getServerTime()), 5000);
    return () => clearInterval(timer);
  }, []);

  const lastOnlineMs = client?.lastOnline || 0;
  const isLive = lastOnlineMs > 0 && nowTick - lastOnlineMs < LIVE_WINDOW_MS;
  const lastSeenLabel = lastOnlineMs > 0 ? formatDistanceToNow(new Date(lastOnlineMs), { addSuffix: true }) : 'never';

  const stats = useMemo(() => {
    const byName = {};
    let sessionStarts = 0;
    let sessionEnds = 0;
    let totalSessionSeconds = 0;

    events.forEach((event) => {
      byName[event.name] = (byName[event.name] || 0) + 1;
      if (event.name === 'session_start') sessionStarts++;
      if (event.name === 'session_end') {
        sessionEnds++;
        const duration = Number(event.params?.duration_seconds);
        if (Number.isFinite(duration)) totalSessionSeconds += duration;
      }
    });

    const topEvents = Object.entries(byName)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    return { total: events.length, sessionStarts, sessionEnds, totalSessionSeconds, topEvents };
  }, [events]);

  if (!selectedProjectId) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-slate-500 italic">
        Select a project first.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link
            to="/clients"
            className="inline-flex items-center gap-2 text-xs text-slate-500 hover:text-cyan-400 mb-3"
          >
            <ArrowLeft size={12} /> Back to Client Registry
          </Link>
          <h2 className="text-2xl font-black tracking-tight text-slate-100 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-500 ring-1 ring-cyan-500/20">
              <Activity size={20} />
            </div>
            Client Analytics
          </h2>
          <p className="text-slate-500 text-xs mt-1 font-mono break-all">{deviceId}</p>
          {project && <p className="text-slate-400 mt-1">{project.name}</p>}
        </div>

        <div className="flex items-center gap-2">
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
              <Radio size={12} className="animate-pulse" /> Live now
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-widest bg-slate-800 text-slate-400 border border-slate-700">
              <Radio size={12} /> Offline
            </span>
          )}
        </div>
      </div>

      {loading && <p className="text-xs text-slate-500 italic">Loading...</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-500">Last Seen</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-bold text-slate-200">{lastSeenLabel}</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total Events</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black text-slate-100">{stats.total}</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-500">Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black text-slate-100">{stats.sessionStarts}</p>
            <p className="text-[10px] text-slate-500 mt-1">{stats.sessionEnds} closed cleanly</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total Time</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black text-slate-100">
              {Math.round(stats.totalSessionSeconds / 60)}<span className="text-sm text-slate-500 ml-1">min</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-slate-900/50 border-slate-800 md:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <Clock size={14} className="text-cyan-500" /> Event Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-xs text-slate-600 italic py-4">No events logged for this device yet.</p>
            ) : (
              <div className="max-h-[500px] overflow-y-auto space-y-1 pr-2">
                {events.map((event) => {
                  const Icon = pickEventIcon(event.name);
                  const paramString = Object.entries(event.params || {})
                    .filter(([key]) => key !== 'app_type' && key !== 'game_id')
                    .map(([key, val]) => `${key}=${val}`)
                    .join(' · ');
                  return (
                    <div key={event.id} className="flex items-start gap-3 py-2 border-b border-slate-800 last:border-0">
                      <div className="mt-0.5 text-cyan-500 shrink-0">
                        <Icon size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-200 truncate">{event.name}</span>
                          <span className="text-[10px] text-slate-500 shrink-0">
                            {event.receivedAt
                              ? formatDistanceToNow(new Date(event.receivedAt), { addSuffix: true })
                              : 'unknown'}
                          </span>
                        </div>
                        {paramString && (
                          <p className="text-[10px] text-slate-500 mt-0.5 truncate font-mono">{paramString}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">
              Top Events
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.topEvents.length === 0 ? (
              <p className="text-xs text-slate-600 italic py-4">Nothing to show yet.</p>
            ) : (
              stats.topEvents.map(([name, count]) => (
                <div key={name} className="space-y-1">
                  <div className="flex justify-between text-[11px] font-bold">
                    <span className="text-slate-200 truncate pr-2" title={name}>{name}</span>
                    <span className="text-slate-500">{count}</span>
                  </div>
                  <div className="h-1 w-full bg-slate-950 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 transition-all duration-1000"
                      style={{ width: `${(count / stats.total) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
