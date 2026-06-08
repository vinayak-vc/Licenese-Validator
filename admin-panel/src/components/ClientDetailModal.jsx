import { useEffect, useState } from 'react';
import { X, Cpu, HardDrive, Monitor, Smartphone, Boxes, Clock, MapPin, Pencil, Save, Loader2 } from 'lucide-react';
import { groupSystemInfo, readSystemInfo, countryToFlag, SYSTEM_INFO_FORM, toNested } from '../lib/systemInfo';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { Button } from './ui/Button';
import { cn } from '../lib/utils';

const GROUP_ICON = {
  application: Boxes,
  device: Smartphone,
  hardware: Cpu,
  display: Monitor,
  runtime: Clock,
  system: HardDrive,
};

// Build the editable form model { 'group.field': stringValue } from systemInfo.
function buildFormState(systemInfo) {
  const nested = toNested(systemInfo);
  const state = {};
  for (const group of SYSTEM_INFO_FORM) {
    for (const field of group.fields) {
      const value = nested[group.key]?.[field.name];
      state[`${group.key}.${field.name}`] = value === undefined || value === null ? '' : String(value);
    }
  }
  return state;
}

// Collapse the form model back into a nested systemInfo payload, dropping blanks.
function formStateToPayload(form) {
  const payload = {};
  for (const group of SYSTEM_INFO_FORM) {
    for (const field of group.fields) {
      const raw = form[`${group.key}.${field.name}`];
      if (raw === undefined || raw === null || String(raw).trim() === '') continue;
      const value = field.type === 'number' ? Number(raw) : String(raw).trim();
      if (field.type === 'number' && !Number.isFinite(value)) continue;
      payload[group.key] = { ...(payload[group.key] || {}), [field.name]: value };
    }
  }
  return payload;
}

export function ClientDetailModal({ client, projectId, onClose, onSaved }) {
  const { addToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});

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

  const startEdit = () => {
    setForm(buildFormState(client.systemInfo));
    setEditing(true);
  };

  const handleField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    const systemInfo = formStateToPayload(form);
    if (Object.keys(systemInfo).length === 0) {
      addToast('Nothing to save — add at least one value.', 'info');
      return;
    }
    setSaving(true);
    try {
      const res = await api.updateClient({ projectId, deviceId: client.deviceId, systemInfo });
      addToast(`Updated details for ${client.deviceId}`, 'success');
      setEditing(false);
      onSaved?.({ ...client, systemInfo: res.systemInfo || systemInfo });
    } catch (error) {
      addToast(`Failed to update: ${error.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

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
          <div className="flex items-center gap-2 shrink-0">
            {!editing && (
              <Button size="sm" variant="secondary" className="gap-1.5 h-8" onClick={startEdit}>
                <Pencil size={13} /> Add / Edit
              </Button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
          {editing ? (
            <>
              <p className="text-[11px] text-slate-500">
                Fill any missing fields. Blank fields are left unchanged. Existing values are pre-filled.
              </p>
              {SYSTEM_INFO_FORM.map((group) => {
                const Icon = GROUP_ICON[group.key] || HardDrive;
                return (
                  <div key={group.key} className="rounded-xl border border-slate-800 bg-slate-950/40 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-950/60 border-b border-slate-800">
                      <Icon size={13} className="text-cyan-500" />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                        {group.title}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
                      {group.fields.map((f) => {
                        const key = `${group.key}.${f.name}`;
                        return (
                          <label key={key} className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              {f.label}
                            </span>
                            <input
                              type={f.type === 'number' ? 'number' : 'text'}
                              value={form[key] ?? ''}
                              onChange={(e) => handleField(key, e.target.value)}
                              className="bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500/50 transition-all"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </>
          ) : groups.length === 0 ? (
            <p className="text-sm text-slate-500 italic text-center py-8">
              No system telemetry recorded for this node. Use <span className="text-slate-300 font-bold">Add / Edit</span> to enter details.
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

        {/* Footer (edit mode) */}
        {editing && (
          <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-800">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Saving...' : 'Save Details'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
