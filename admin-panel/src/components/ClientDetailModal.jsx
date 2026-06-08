import { useEffect } from 'react';
import { X, Cpu, HardDrive, Monitor, Smartphone, Boxes, Clock, MapPin } from 'lucide-react';
import { groupSystemInfo, readSystemInfo, countryToFlag } from '../lib/systemInfo';
import { cn } from '../lib/utils';

const GROUP_ICON = {
  application: Boxes,
  device: Smartphone,
  hardware: Cpu,
  display: Monitor,
  runtime: Clock,
  system: HardDrive,
};

export function ClientDetailModal({ client, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!client) return null;

  const { deviceName, country } = readSystemInfo(client.systemInfo);
  const groups = groupSystemInfo(client.systemInfo);
  const flag = countryToFlag(country);
  const title = deviceName || client.deviceId;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/80 backdrop-blur-sm p-4 sm:p-8 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl ring-1 ring-white/10 my-auto animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-800">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {flag?.flag && <span className="text-2xl leading-none">{flag.flag}</span>}
              <h3 className="text-lg font-black text-slate-100 truncate">{title}</h3>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[11px] font-mono text-slate-500">
              <span className="truncate">ID: {client.deviceId}</span>
              <span>IP: {client.ip || '---.---.---.---'}</span>
              {flag?.label && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={11} /> {flag.label}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-2 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
          {groups.length === 0 ? (
            <p className="text-sm text-slate-500 italic text-center py-8">
              No system telemetry recorded for this node.
            </p>
          ) : (
            groups.map((group) => {
              const Icon = GROUP_ICON[group.key] || HardDrive;
              return (
                <div key={group.key} className="rounded-xl border border-slate-800 bg-slate-950/40 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-950/60 border-b border-slate-800">
                    <Icon size={13} className="text-cyan-500" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                      {group.title}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-800/50">
                    {group.fields.map((f) => (
                      <div key={f.label} className="flex items-start gap-4 px-4 py-2.5">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider w-40 shrink-0">
                          {f.label}
                        </span>
                        <span
                          className={cn(
                            'text-xs text-slate-200 break-words min-w-0',
                            (f.label === 'Unique Identifier' || f.label === 'Build GUID') && 'font-mono'
                          )}
                        >
                          {f.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
