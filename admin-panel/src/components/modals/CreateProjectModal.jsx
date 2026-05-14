import { useState } from 'react';
import { X, Layout, Info, PlusCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { api } from '../../lib/api';
import { useToast } from '../../context/ToastContext';

export function CreateProjectModal({ isOpen, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [projectId, setProjectId] = useState('');
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !projectId) return;

    setLoading(true);
    try {
      await api.createProject({ 
        name, 
        projectId: projectId.toLowerCase().trim().replace(/\s+/g, '-'),
        createdAt: Date.now()
      });
      addToast(`Project "${name}" created successfully.`, 'success');
      onCreated();
      onClose();
      setName('');
      setProjectId('');
    } catch (error) {
      addToast(`Failed to create project: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-[0_30px_60px_-12px_rgba(0,0,0,0.5)] overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <PlusCircle size={20} className="text-cyan-400" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-100 tracking-tight">New Project</h3>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Expansion Protocol</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-100 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
              <Layout size={12} /> Project Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                // Auto-generate ID if empty
                if (!projectId) setProjectId(e.target.value.toLowerCase().trim().replace(/\s+/g, '-'));
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500/50 transition-all"
              placeholder="e.g. Project Phoenix"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
              <Info size={12} /> Unique System ID
            </label>
            <input
              type="text"
              required
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-mono text-cyan-400 placeholder:text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500/50 transition-all"
              placeholder="project-phoenix-v1"
            />
            <p className="text-[9px] text-slate-500 italic">This ID will be used in your integration scripts.</p>
          </div>

          <div className="pt-4 flex gap-3">
            <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
              Abort
            </Button>
            <Button type="submit" disabled={loading} className="flex-[2]">
              {loading ? 'Initializing...' : 'Construct Project'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
