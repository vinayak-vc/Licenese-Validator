import { useEffect, useMemo, useState } from 'react';
import { useProject } from '../context/ProjectContext';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Donut } from '../components/charts/Donut';
import { humanize, EVENT_GROUPS } from '../lib/eventTaxonomy';
import {
  Activity, Users, Filter, LogIn, LogOut, Eye, MousePointerClick, Gamepad2, Briefcase,
  Monitor, AlertTriangle, Sparkles, TrendingUp
} from 'lucide-react';

// One event fetch is scoped to (projectId, deviceId). Building a project-wide
// view without a dedicated aggregation function requires fanning out one call
// per client and merging. Kept small so this stays snappy on projects with
// many devices; a Firestore-triggered rollup is the scale-out path.
const MAX_CLIENTS_TO_SCAN = 50;
const EVENTS_PER_CLIENT = 200;

const GROUP_ICONS = {
  sessions: LogIn,
  screens: Eye,
  interactions: MousePointerClick,
  game: Gamepad2,
  enterprise: Briefcase,
  kiosk: Monitor,
  errors: AlertTriangle,
  other: Sparkles,
};

const APP_TYPE_COLORS = { Game: '#8b5cf6', Enterprise: '#f59e0b', Kiosk: '#f43f5e' };

function formatMinutes(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0m';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

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
              .getClientEvents(selectedProjectId, client.deviceId, { limit: EVENTS_PER_CLIENT })
              .then((response) => (response.events || []).map((event) => ({ ...event, deviceId: client.deviceId })))
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
    return () => { cancelled = true; };
  }, [selectedProjectId]);

  const filteredEvents = useMemo(() => {
    if (selectedAppType === 'all') return events;
    return events.filter((event) => event.params?.app_type === selectedAppType);
  }, [events, selectedAppType]);

  const summary = useMemo(() => {
    const groupCounts = {};
    Object.keys(EVENT_GROUPS).forEach((key) => { groupCounts[key] = 0; });

    const humanCounts = {};
    const byAppType = { Game: 0, Enterprise: 0, Kiosk: 0 };
    const byDevice = new Set();

    let sessionStarts = 0;
    let sessionEnds = 0;
    let totalSessionSeconds = 0;
    let errorCount = 0;
    let uiInteractions = 0;

    filteredEvents.forEach((event) => {
      const info = humanize(event.name);
      groupCounts[info.group] = (groupCounts[info.group] || 0) + 1;
      humanCounts[info.label] = (humanCounts[info.label] || 0) + 1;
      byDevice.add(event.deviceId);
      const appType = event.params?.app_type;
      if (appType && byAppType[appType] !== undefined) byAppType[appType]++;
      if (info.group === 'errors') errorCount++;
      if (info.group === 'interactions') uiInteractions++;
      if (event.name === 'session_start' || event.name === 'app_open') sessionStarts++;
      if (event.name === 'session_end') {
        sessionEnds++;
        const duration = Number(event.params?.duration_seconds);
        if (Number.isFinite(duration)) totalSessionSeconds += duration;
      }
    });

    const topHuman = Object.entries(humanCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

    return {
      total: filteredEvents.length,
      uniqueDevices: byDevice.size,
      groupCounts,
      topHuman,
      byAppType,
      sessionStarts,
      sessionEnds,
      totalSessionSeconds,
      errorCount,
      uiInteractions,
      cleanCloseRate: sessionStarts > 0 ? Math.round((sessionEnds / sessionStarts) * 100) : null,
      avgSessionSeconds: sessionEnds > 0 ? totalSessionSeconds / sessionEnds : 0,
    };
  }, [filteredEvents]);

  const donutSegments = useMemo(
    () =>
      Object.entries(summary.groupCounts)
        .filter(([, count]) => count > 0)
        .map(([groupKey, count]) => ({
          key: groupKey,
          label: EVENT_GROUPS[groupKey]?.label || groupKey,
          value: count,
          color: EVENT_GROUPS[groupKey]?.accent || '#94a3b8',
        })),
    [summary.groupCounts]
  );

  const appTypeSegments = useMemo(
    () =>
      Object.entries(summary.byAppType)
        .filter(([, count]) => count > 0)
        .map(([type, count]) => ({ label: type, value: count, color: APP_TYPE_COLORS[type] || '#94a3b8' })),
    [summary.byAppType]
  );

  if (!selectedProjectId) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-slate-500 italic">
        Pick a project on the left to see its analytics.
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
              <Activity size={24} />
            </div>
            How's this app doing?
          </h2>
          <p className="text-slate-400 mt-2">
            {activeProject
              ? `Real-world activity from ${activeProject.name}${activeProject.applicationType ? ` — a ${activeProject.applicationType} app` : ''}.`
              : 'Real-world activity from your app.'}
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
        <p className="text-xs text-slate-500 italic">Loading recent activity from up to {MAX_CLIENTS_TO_SCAN} devices...</p>
      )}

      <NarrativeSummary summary={summary} scanned={Math.min(clients.length, MAX_CLIENTS_TO_SCAN)} totalDevices={clients.length} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-slate-900/50 border-slate-800 shadow-xl md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <TrendingUp size={14} className="text-cyan-500" /> Activity Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-6 items-center">
              <Donut segments={donutSegments} centerValue={summary.total.toLocaleString()} centerLabel="Total" />
              <div className="flex-1 space-y-2 w-full">
                {Object.entries(EVENT_GROUPS).map(([groupKey, groupMeta]) => {
                  const count = summary.groupCounts[groupKey] || 0;
                  if (count === 0) return null;
                  const Icon = GROUP_ICONS[groupKey] || Sparkles;
                  const pct = summary.total > 0 ? Math.round((count / summary.total) * 100) : 0;
                  return (
                    <div key={groupKey} className="flex items-center gap-3">
                      <span
                        className="flex items-center justify-center h-8 w-8 rounded-lg shrink-0"
                        style={{ backgroundColor: `${groupMeta.accent}20`, color: groupMeta.accent }}
                      >
                        <Icon size={14} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-200 truncate">{groupMeta.label}</span>
                          <span className="text-slate-400 shrink-0 ml-2">
                            {count.toLocaleString()} <span className="text-slate-600">({pct}%)</span>
                          </span>
                        </div>
                        <div className="h-1 w-full bg-slate-950 rounded-full overflow-hidden mt-1">
                          <div
                            className="h-full rounded-full transition-all duration-1000"
                            style={{ width: `${pct}%`, backgroundColor: groupMeta.accent }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {donutSegments.length === 0 && (
                  <p className="text-xs text-slate-600 italic py-8 text-center">
                    No activity yet. Once devices start using the app, this fills in.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <Users size={14} className="text-emerald-500" /> App Type Mix
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            {appTypeSegments.length > 0 ? (
              <>
                <Donut
                  segments={appTypeSegments}
                  centerValue={summary.uniqueDevices.toString()}
                  centerLabel="Devices"
                  size={160}
                  thickness={20}
                />
                <div className="w-full space-y-2 text-xs">
                  {Object.entries(summary.byAppType).map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-slate-300">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: APP_TYPE_COLORS[type] }}
                        />
                        {type}
                      </span>
                      <span className="text-slate-500">{count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-600 italic py-6 text-center">No categorised activity yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
        <CardHeader>
          <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">
            What are users doing most?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {summary.topHuman.length === 0 ? (
            <p className="text-xs text-slate-600 italic py-4">
              No activity yet. Once devices use the app, the most common actions show up here.
            </p>
          ) : (
            summary.topHuman.map(([label, count]) => (
              <div key={label} className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-200 truncate pr-4" title={label}>{label}</span>
                  <span className="text-slate-500 shrink-0">{count.toLocaleString()}</span>
                </div>
                <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)] transition-all duration-1000"
                    style={{ width: `${(count / summary.total) * 100}%` }}
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

function NarrativeSummary({ summary, scanned, totalDevices }) {
  const openings = summary.sessionStarts;
  const avgLabel = formatMinutes(summary.avgSessionSeconds);
  const totalLabel = formatMinutes(summary.totalSessionSeconds);
  const closeRate = summary.cleanCloseRate;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <StatTile
        icon={LogIn}
        color="#10b981"
        label="App Openings"
        value={openings.toLocaleString()}
        hint={openings > 0 ? `Avg session ${avgLabel}` : 'Nothing opened yet.'}
      />
      <StatTile
        icon={Users}
        color="#0ea5e9"
        label="Reporting Devices"
        value={summary.uniqueDevices.toString()}
        hint={`Out of ${totalDevices} registered · ${scanned} scanned`}
      />
      <StatTile
        icon={MousePointerClick}
        color="#06b6d4"
        label="User Actions"
        value={summary.uiInteractions.toLocaleString()}
        hint="Every button click, toggle, slider"
      />
      <StatTile
        icon={summary.errorCount > 0 ? AlertTriangle : LogOut}
        color={summary.errorCount > 0 ? '#ef4444' : '#8b5cf6'}
        label={summary.errorCount > 0 ? 'Errors Reported' : 'Total Time Used'}
        value={summary.errorCount > 0 ? summary.errorCount.toLocaleString() : totalLabel}
        hint={
          summary.errorCount > 0
            ? 'Investigate the Errors group below.'
            : closeRate === null
              ? 'Waiting on first session.'
              : closeRate >= 90
                ? `${closeRate}% closed cleanly — healthy.`
                : `${closeRate}% closed cleanly — some crashes.`
        }
      />
    </div>
  );
}

function StatTile({ icon: Icon, color, label, value, hint }) {
  return (
    <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
      <CardContent className="p-5">
        <div className="flex items-center gap-3 mb-3">
          <span
            className="flex items-center justify-center h-10 w-10 rounded-xl ring-1"
            style={{ backgroundColor: `${color}20`, color, boxShadow: `0 0 20px ${color}20`, borderColor: `${color}40` }}
          >
            <Icon size={18} />
          </span>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</span>
        </div>
        <p className="text-3xl font-black text-slate-100 leading-none">{value}</p>
        {hint && <p className="text-[11px] text-slate-500 mt-2">{hint}</p>}
      </CardContent>
    </Card>
  );
}
