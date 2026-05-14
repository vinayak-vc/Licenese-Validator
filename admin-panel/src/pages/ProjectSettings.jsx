import { useState } from 'react';
import { useProject } from '../context/ProjectContext';
import { useToast } from '../context/ToastContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Eye, EyeOff, Copy, ShieldAlert, Key, Globe, Trash2, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

export function ProjectSettings() {
  const { selectedProject } = useProject();
  const { addToast } = useToast();
  const [showKey, setShowKey] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  if (!selectedProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-center px-4">
        <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-4">
          <Globe size={32} className="text-slate-700" />
        </div>
        <p className="text-slate-500 italic max-w-xs">No project context detected. Select a target to modify configuration.</p>
      </div>
    );
  }

  const handleCopyKey = () => {
    if (selectedProject.projectApiKey) {
      navigator.clipboard.writeText(selectedProject.projectApiKey);
      addToast('Secure Key string exported to clipboard.', 'success');
    }
  };

  const handleDangerAction = (type) => {
    if (confirmInput !== selectedProject.name) {
      addToast(`Validation failed. Type "${selectedProject.name}" exactly.`, 'error');
      return;
    }
    
    setIsDeleting(true);
    addToast(`${type === 'revoke' ? 'Revoking all licenses' : 'Deleting project'} sequence initiated...`, 'warning');
    
    // Simulate API delay
    setTimeout(() => {
      addToast(`Action "${type}" finalized for ${selectedProject.name}.`, 'success');
      setConfirmInput('');
      setIsDeleting(false);
    }, 2000);
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-12">
      <div>
        <h2 className="text-3xl font-black tracking-tight text-slate-100">Core Configuration</h2>
        <p className="text-slate-400 mt-2">Manage security protocols and project metadata for <span className="text-cyan-400 font-mono">{selectedProject.projectId}</span>.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-8">
          <Card className="bg-slate-900/50 border-slate-800 shadow-xl overflow-hidden">
            <div className="h-1 bg-cyan-500/50" />
            <CardHeader className="p-6 pb-0">
               <div className="flex items-center gap-3">
                 <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-500 ring-1 ring-cyan-500/20">
                    <Key size={18} />
                 </div>
                 <div>
                   <CardTitle className="text-base font-bold text-slate-100">Master API Credential</CardTitle>
                   <p className="text-xs text-slate-500 mt-0.5 font-medium tracking-tight">Required for all cross-origin verification requests.</p>
                 </div>
               </div>
            </CardHeader>
            <CardContent className="p-6 pt-8 space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Secure Access Key</label>
                  <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-1">
                    <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                    Encrypted State
                  </span>
                </div>
                <div className="flex gap-3">
                  <div className="relative flex-1 group">
                    <div className="absolute inset-0 bg-cyan-500/5 blur-md group-focus-within:bg-cyan-500/10 transition-colors"></div>
                    <input
                      type={showKey ? 'text' : 'password'}
                      readOnly
                      value={selectedProject.projectApiKey || 'UNAVAILABLE'}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 pr-12 text-sm font-mono text-cyan-400 font-bold focus:outline-none focus:border-cyan-500/50 transition-all relative z-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 z-20 transition-colors"
                    >
                      {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <Button 
                    variant="secondary" 
                    onClick={handleCopyKey}
                    className="rounded-xl h-auto px-6 font-bold text-xs uppercase tracking-widest gap-2 bg-slate-800 hover:bg-slate-700"
                  >
                    <Copy size={16} />
                    Copy
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800 border-dashed">
            <CardContent className="p-8 flex items-center gap-6">
               <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center shrink-0">
                  <Globe size={24} className="text-slate-600" />
               </div>
               <div>
                 <h4 className="text-sm font-bold text-slate-300">Origin Whitelisting</h4>
                 <p className="text-xs text-slate-500 mt-1">Restrict API calls to specific domains or applications. Contact support to enable origin verification.</p>
               </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
           <Card className="bg-slate-950 border-red-900/40 shadow-2xl overflow-hidden group">
             <div className="h-1 bg-red-600" />
             <CardHeader className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-red-500/10 text-red-500 ring-1 ring-red-500/20">
                     <ShieldAlert size={18} />
                  </div>
                  <CardTitle className="text-base font-bold text-slate-100">The Danger Zone</CardTitle>
                </div>
                <p className="text-xs text-red-400/70 mt-3 font-medium leading-relaxed">
                  These operations are irreversible. Proceed with extreme caution. All associated data will be purged.
                </p>
             </CardHeader>
             <CardContent className="p-6 pt-0 space-y-6">
               <div className="space-y-4">
                 <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500/70">Security Check</p>
                    <p className="text-[11px] text-slate-500">Type <span className="text-slate-200 font-bold">"{selectedProject.name}"</span> to confirm.</p>
                    <input
                      type="text"
                      placeholder="Enter Project Name..."
                      value={confirmInput}
                      onChange={(e) => setConfirmInput(e.target.value)}
                      className="w-full bg-slate-900 border border-red-900/20 rounded-xl px-4 py-3 text-xs text-slate-100 focus:outline-none focus:border-red-500/50 transition-all font-mono"
                    />
                 </div>

                 <div className="grid grid-cols-1 gap-3">
                    <Button 
                      variant="ghost" 
                      className="w-full bg-red-500/5 hover:bg-red-500/10 text-red-500 border border-red-900/20 font-bold text-[11px] uppercase tracking-widest h-11 gap-2"
                      onClick={() => handleDangerAction('revoke')}
                      disabled={confirmInput !== selectedProject.name || isDeleting}
                    >
                      <AlertCircle size={14} />
                      Revoke All Clients
                    </Button>
                    <Button 
                      variant="danger" 
                      className="w-full font-bold text-[11px] uppercase tracking-widest h-11 gap-2 shadow-[0_10px_20px_rgba(239,68,68,0.1)]"
                      onClick={() => handleDangerAction('delete')}
                      disabled={confirmInput !== selectedProject.name || isDeleting}
                    >
                      <Trash2 size={14} />
                      Delete Project
                    </Button>
                 </div>
               </div>
             </CardContent>
           </Card>

           <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800">
             <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-3">System Metrics</h5>
             <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                   <span className="text-slate-400">Database Uptime</span>
                   <span className="text-emerald-500 font-bold">99.98%</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                   <span className="text-slate-400">Global Latency</span>
                   <span className="text-cyan-500 font-bold">42ms</span>
                </div>
             </div>
           </div>
        </div>
      </div>
    </div>
  );
}
