import { useEffect, useState, useMemo } from 'react';
import { useProject } from '../context/ProjectContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { api } from '../lib/api';
import { readSystemInfo, countryToFlag } from '../lib/systemInfo';
import { Cpu, HardDrive, Monitor, PieChart, BarChart3, Globe } from 'lucide-react';

export function HardwareInsights() {
  const { selectedProjectId } = useProject();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (!selectedProjectId) return;
      setLoading(true);
      try {
        const res = await api.getClients(selectedProjectId);
        setClients(res.clients || []);
      } catch (error) {
        console.error("Failed to load hardware insights", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [selectedProjectId]);

  const distribution = useMemo(() => {
    const os = {};
    const cpu = {};
    const gpu = {};
    const country = {};

    clients.forEach(c => {
      const info = readSystemInfo(c.systemInfo);
      const osVal = info.os || 'Unknown';
      const cpuVal = info.cpu || 'Unknown';
      const gpuVal = info.gpu || 'Unknown';
      const countryVal = (info.country || '').replace(/\s*\(local\)\s*$/i, '').trim() || 'Unknown';

      os[osVal] = (os[osVal] || 0) + 1;
      cpu[cpuVal] = (cpu[cpuVal] || 0) + 1;
      gpu[gpuVal] = (gpu[gpuVal] || 0) + 1;
      country[countryVal] = (country[countryVal] || 0) + 1;
    });

    const sort = (obj, n = 5) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);

    return {
      os: sort(os),
      cpu: sort(cpu),
      gpu: sort(gpu),
      country: sort(country, 8),
    };
  }, [clients]);

  const hasCountryData = distribution.country.some(([name]) => name !== 'Unknown');

  if (!selectedProjectId) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-slate-500 italic">
        Select a project to analyze node hardware telemetry.
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div>
        <h2 className="text-3xl font-black tracking-tight text-slate-100 flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20 shadow-lg shadow-emerald-500/5">
            <Cpu size={24} />
          </div>
          Hardware Insights
        </h2>
        <p className="text-slate-400 mt-2">Telemetry distribution across the active node registry.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <Monitor size={14} className="text-cyan-500" />
              OS Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {distribution.os.map(([name, count]) => (
              <div key={name} className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-200">{name}</span>
                  <span className="text-slate-500">{count} Nodes</span>
                </div>
                <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)] transition-all duration-1000" 
                    style={{ width: `${(count / clients.length) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {distribution.os.length === 0 && <p className="text-xs text-slate-600 italic py-4">No telemetry data available.</p>}
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <Cpu size={14} className="text-emerald-500" />
              CPU Architecture
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {distribution.cpu.map(([name, count]) => (
              <div key={name} className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-200 truncate pr-4" title={name}>{name}</span>
                  <span className="text-slate-500 shrink-0">{count}</span>
                </div>
                <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] transition-all duration-1000" 
                    style={{ width: `${(count / clients.length) * 100}%` }}
                  />
                </div>
              </div>
            ))}
             {distribution.cpu.length === 0 && <p className="text-xs text-slate-600 italic py-4">No telemetry data available.</p>}
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <HardDrive size={14} className="text-purple-500" />
              GPU Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {distribution.gpu.map(([name, count]) => (
              <div key={name} className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-200 truncate pr-4" title={name}>{name}</span>
                  <span className="text-slate-500 shrink-0">{count}</span>
                </div>
                <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)] transition-all duration-1000" 
                    style={{ width: `${(count / clients.length) * 100}%` }}
                  />
                </div>
              </div>
            ))}
             {distribution.gpu.length === 0 && <p className="text-xs text-slate-600 italic py-4">No telemetry data available.</p>}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
         <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <Globe size={14} className="text-sky-500" />
                Geographic Insights
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!hasCountryData ? (
                <p className="text-xs text-slate-600 italic py-4">No geographic telemetry reported yet.</p>
              ) : (
                distribution.country.map(([name, count]) => {
                  const flag = name === 'Unknown' ? null : countryToFlag(name);
                  return (
                    <div key={name} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-slate-200 truncate pr-4 flex items-center gap-1.5" title={name}>
                          {flag?.flag && <span className="text-sm leading-none">{flag.flag}</span>}
                          {name}
                        </span>
                        <span className="text-slate-500 shrink-0">{count}</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.5)] transition-all duration-1000"
                          style={{ width: `${(count / clients.length) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
         </Card>
         
         <Card className="bg-slate-950 border-slate-800 p-8 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-3xl bg-slate-900 flex items-center justify-center mb-6">
               <BarChart3 size={32} className="text-slate-700" />
            </div>
            <h4 className="text-lg font-bold text-slate-100 mb-2">Usage Patterns</h4>
            <p className="text-sm text-slate-500 max-w-xs">Temporal usage heatmaps are generated once the project exceeds 100 active nodes.</p>
         </Card>
      </div>
    </div>
  );
}
