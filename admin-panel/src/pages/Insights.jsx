import { useEffect, useMemo, useState } from 'react';
import { useProject } from '../context/ProjectContext';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { humanize, EVENT_GROUPS } from '../lib/eventTaxonomy';
import { Sparkles, Filter, Zap, Users, Cpu, Globe } from 'lucide-react';

const WINDOW_OPTIONS = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 60, label: 'Last 60 days' },
];

const TABS = [
  { key: 'funnel', label: 'Funnel', icon: Filter },
  { key: 'retention', label: 'Retention', icon: Users },
  { key: 'hardware', label: 'Hardware & Country', icon: Cpu },
];

const RECOMMENDED_STEP_TEMPLATES = {
  Game: ['session_start', 'level_start', 'level_complete'],
  Enterprise: ['session_start', 'enterprise_login', 'enterprise_task_started', 'enterprise_task_completed'],
  Kiosk: ['session_start', 'kiosk_content_impression', 'kiosk_cta_click', 'kiosk_transaction_completed'],
};

export function Insights() {
  const { selectedProjectId, projects } = useProject();
  const project = useMemo(() => projects.find((p) => p.projectId === selectedProjectId), [projects, selectedProjectId]);
  const [tab, setTab] = useState('funnel');

  if (!selectedProjectId) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-slate-500 italic">
        Pick a project on the left to explore insights.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h2 className="text-3xl font-black tracking-tight text-slate-100 flex items-center gap-3">
          <div className="p-2 rounded-xl bg-violet-500/10 text-violet-500 ring-1 ring-violet-500/20 shadow-lg shadow-violet-500/5">
            <Sparkles size={24} />
          </div>
          Insights
        </h2>
        <p className="text-slate-400 mt-2">
          {project ? `Deeper analysis for ${project.name}.` : 'Deeper analysis.'}
        </p>
      </div>

      <div className="flex items-center gap-2 border-b border-slate-800">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={
              tab === key
                ? 'flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-widest text-cyan-400 border-b-2 border-cyan-500'
                : 'flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-500 border-b-2 border-transparent hover:text-slate-300'
            }
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'funnel' && <FunnelPanel project={project} />}
      {tab === 'retention' && <RetentionPanel project={project} />}
      {tab === 'hardware' && <HardwarePanel project={project} />}
    </div>
  );
}

function FunnelPanel({ project }) {
  const [steps, setSteps] = useState(RECOMMENDED_STEP_TEMPLATES[project?.applicationType] || RECOMMENDED_STEP_TEMPLATES.Game);
  const [windowDays, setWindowDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stepDraft, setStepDraft] = useState('');

  async function run() {
    setLoading(true);
    try {
      const result = await api.getFunnel(project.projectId, steps, windowDays);
      setData(result);
    } catch (error) {
      console.error('funnel failed', error);
      setData({ error: error.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
      <CardHeader>
        <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
          <Filter size={14} className="text-cyan-500" /> Conversion Funnel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-2 items-center">
          {steps.map((step, index) => (
            <div key={`${step}-${index}`} className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Step {index + 1}</span>
              <span className="text-xs font-mono text-slate-200">{step}</span>
              <button
                onClick={() => setSteps(steps.filter((_, i) => i !== index))}
                className="text-slate-500 hover:text-red-400 ml-1"
                title="Remove step"
              >
                ×
              </button>
            </div>
          ))}
          <input
            type="text"
            value={stepDraft}
            onChange={(e) => setStepDraft(e.target.value)}
            placeholder="add event name..."
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && stepDraft.trim()) {
                setSteps([...steps, stepDraft.trim()]);
                setStepDraft('');
              }
            }}
          />
        </div>

        <div className="flex items-center gap-3">
          <select
            value={windowDays}
            onChange={(e) => setWindowDays(Number(e.target.value))}
            className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200"
          >
            {WINDOW_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={run}
            disabled={loading || steps.length < 2}
            className="px-4 py-2 rounded text-xs font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20 disabled:opacity-50"
          >
            {loading ? 'Computing...' : 'Compute Funnel'}
          </button>
        </div>

        {data?.error && <p className="text-xs text-red-400">{data.error}</p>}

        {data?.steps && (
          <div className="space-y-2 mt-4">
            <p className="text-[11px] text-slate-500">
              {data.totalDevicesInWindow} device(s) had activity in the last {data.windowDays} days.
            </p>
            {data.steps.map((step, index) => {
              const width = data.steps[0].count === 0 ? 0 : (step.count / data.steps[0].count) * 100;
              return (
                <div key={index} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-bold text-slate-200">
                      Step {index + 1}: <span className="font-mono text-slate-300">{step.name}</span>
                    </span>
                    <span className="text-slate-400">
                      {step.count.toLocaleString()}
                      {index > 0 && <span className="text-slate-600 ml-2">({step.pctOfPrev}% from prior)</span>}
                    </span>
                  </div>
                  <div className="h-3 w-full bg-slate-950 rounded overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 transition-all duration-700"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RetentionPanel({ project }) {
  const [windowDays, setWindowDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!project) return;
      setLoading(true);
      try {
        const result = await api.getRetention(project.projectId, windowDays);
        if (!cancelled) setData(result);
      } catch (error) {
        if (!cancelled) setData({ error: error.message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [project?.projectId, windowDays]);

  return (
    <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
          <Users size={14} className="text-emerald-500" /> Retention by Install Cohort
        </CardTitle>
        <select
          value={windowDays}
          onChange={(e) => setWindowDays(Number(e.target.value))}
          className="bg-slate-950 border border-slate-800 rounded px-3 py-1 text-xs text-slate-200"
        >
          {WINDOW_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </CardHeader>
      <CardContent>
        {loading && <p className="text-xs text-slate-500 italic py-2">Computing cohorts...</p>}
        {data?.error && <p className="text-xs text-red-400">{data.error}</p>}
        {data?.cohorts && data.cohorts.length === 0 && (
          <p className="text-xs text-slate-600 italic py-4">
            Not enough history yet. Once a few devices install and come back a day/week later, this fills in.
          </p>
        )}
        {data?.cohorts && data.cohorts.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-slate-500">
                <th className="text-left py-2 pr-4">Install Day</th>
                <th className="text-right py-2 px-4">Installed</th>
                <th className="text-right py-2 px-4">D1</th>
                <th className="text-right py-2 px-4">D7</th>
                <th className="text-right py-2 px-4">D30</th>
              </tr>
            </thead>
            <tbody>
              {data.cohorts.map((cohort) => (
                <tr key={cohort.day} className="border-t border-slate-800">
                  <td className="py-2 pr-4 font-mono text-slate-300">{cohort.day}</td>
                  <td className="py-2 px-4 text-right text-slate-200">{cohort.size}</td>
                  <RetentionCell count={cohort.d1} size={cohort.size} />
                  <RetentionCell count={cohort.d7} size={cohort.size} />
                  <RetentionCell count={cohort.d30} size={cohort.size} />
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function RetentionCell({ count, size }) {
  if (size === 0) return <td className="py-2 px-4 text-right text-slate-600">—</td>;
  const pct = Math.round((count / size) * 100);
  const intensity = Math.min(100, pct);
  return (
    <td className="py-2 px-4 text-right">
      <span
        className="inline-block px-2 py-1 rounded text-slate-100 font-bold"
        style={{ backgroundColor: `rgba(16, 185, 129, ${0.1 + (intensity / 100) * 0.5})` }}
      >
        {pct}%
      </span>
    </td>
  );
}

function HardwarePanel({ project }) {
  const [windowDays, setWindowDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!project) return;
      setLoading(true);
      try {
        const result = await api.getHardwareBreakdown(project.projectId, windowDays);
        if (!cancelled) setData(result);
      } catch (error) {
        if (!cancelled) setData({ error: error.message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [project?.projectId, windowDays]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <select
          value={windowDays}
          onChange={(e) => setWindowDays(Number(e.target.value))}
          className="bg-slate-950 border border-slate-800 rounded px-3 py-1 text-xs text-slate-200"
        >
          {WINDOW_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {loading && <p className="text-xs text-slate-500 italic py-2">Cross-referencing hardware with activity...</p>}
      {data?.error && <p className="text-xs text-red-400">{data.error}</p>}
      {data?.activity && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FacetCard title="Activity by GPU" icon={Cpu} accent="#a855f7" list={data.activity.gpu} errors={data.errors?.gpu || []} />
          <FacetCard title="Activity by CPU" icon={Cpu} accent="#06b6d4" list={data.activity.cpu} errors={data.errors?.cpu || []} />
          <FacetCard title="Activity by OS" icon={Cpu} accent="#10b981" list={data.activity.os} errors={data.errors?.os || []} />
          <FacetCard title="Activity by Country" icon={Globe} accent="#0ea5e9" list={data.activity.country} errors={data.errors?.country || []} />
        </div>
      )}
    </div>
  );
}

function FacetCard({ title, icon: Icon, accent, list, errors }) {
  const errorMap = new Map(errors.map((e) => [e.key, e.count]));
  const total = list.reduce((sum, item) => sum + item.count, 0);

  return (
    <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
          <Icon size={12} style={{ color: accent }} /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {list.length === 0 && <p className="text-[11px] text-slate-600 italic">No data yet.</p>}
        {list.map((item) => {
          const pct = total === 0 ? 0 : Math.round((item.count / total) * 100);
          const errCount = errorMap.get(item.key) || 0;
          return (
            <div key={item.key} className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-200 truncate pr-2" title={item.key}>{item.key}</span>
                <span className="text-slate-500 whitespace-nowrap">
                  {item.count.toLocaleString()}
                  {errCount > 0 && <span className="text-rose-400 ml-2">⚠ {errCount}</span>}
                </span>
              </div>
              <div className="h-1 w-full bg-slate-950 rounded-full overflow-hidden">
                <div className="h-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: accent }} />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
