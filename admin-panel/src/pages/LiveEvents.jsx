import { useEffect, useMemo, useState, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useProject } from '../context/ProjectContext';
import { api } from '../lib/api';
import { humanize, EVENT_GROUPS } from '../lib/eventTaxonomy';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Radio, Pause, Play } from 'lucide-react';

const POLL_INTERVAL_MS = 10 * 1000;
const WINDOW_MS = 10 * 60 * 1000;

export function LiveEvents() {
  const { selectedProjectId, projects } = useProject();
  const project = useMemo(() => projects.find((p) => p.projectId === selectedProjectId), [projects, selectedProjectId]);
  const [events, setEvents] = useState([]);
  const [running, setRunning] = useState(true);
  const [lastPolledAt, setLastPolledAt] = useState(null);
  const seenIds = useRef(new Set());

  useEffect(() => {
    setEvents([]);
    seenIds.current = new Set();
  }, [selectedProjectId]);

  useEffect(() => {
    if (!running || !selectedProjectId) return undefined;

    let cancelled = false;
    async function poll() {
      try {
        const since = Date.now() - WINDOW_MS;
        const result = await api.getRecentEvents(selectedProjectId, since, 200);
        if (cancelled) return;
        setLastPolledAt(Date.now());
        const incoming = result.events || [];
        const fresh = incoming.filter((e) => !seenIds.current.has(e.id));
        fresh.forEach((e) => seenIds.current.add(e.id));
        if (fresh.length > 0) {
          setEvents((prev) => [...fresh, ...prev].slice(0, 300));
        }
      } catch (error) {
        console.error('Live poll failed', error);
      }
    }

    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [selectedProjectId, running]);

  if (!selectedProjectId) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-slate-500 italic">
        Pick a project to watch live activity.
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-100 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30">
              <Radio size={18} className={running ? 'animate-pulse' : ''} />
            </div>
            Live Activity
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            {project ? `Real-time feed for ${project.name}. Refreshes every ${POLL_INTERVAL_MS / 1000}s.` : ''}
          </p>
        </div>

        <button
          onClick={() => setRunning((r) => !r)}
          className={
            running
              ? 'inline-flex items-center gap-2 px-3 py-2 rounded text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
              : 'inline-flex items-center gap-2 px-3 py-2 rounded text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
          }
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Resume</>}
        </button>
      </div>

      <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
        <CardHeader>
          <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center justify-between">
            <span>{events.length} event(s) shown · window {WINDOW_MS / 60000}min</span>
            {lastPolledAt && (
              <span className="normal-case tracking-normal text-slate-600 font-mono">
                last polled {formatDistanceToNow(lastPolledAt, { addSuffix: true })}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-xs text-slate-600 italic py-8 text-center">
              Waiting for events... nothing new in the last {WINDOW_MS / 60000} minutes.
            </p>
          ) : (
            <div className="max-h-[600px] overflow-y-auto space-y-1 pr-2">
              {events.map((event) => {
                const info = humanize(event.name);
                const groupMeta = EVENT_GROUPS[info.group] || EVENT_GROUPS.other;
                return (
                  <div key={event.id} className="flex items-start gap-3 py-2 border-b border-slate-800 last:border-0">
                    <div
                      className="mt-0.5 shrink-0 w-1.5 h-6 rounded-full"
                      style={{ backgroundColor: groupMeta.accent }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-200 truncate">{info.label}</span>
                        <span className="text-[10px] text-slate-500 shrink-0 font-mono">
                          {event.receivedAt ? formatDistanceToNow(new Date(event.receivedAt), { addSuffix: true }) : ''}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5 truncate font-mono">
                        {event.deviceId.slice(0, 12)}...{event.deviceId.slice(-4)}
                        {event.params?.screen_name && ` · on ${event.params.screen_name}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
