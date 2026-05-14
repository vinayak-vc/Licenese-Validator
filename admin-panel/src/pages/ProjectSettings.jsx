import { useState } from 'react';
import { useProject } from '../context/ProjectContext';
import { useToast } from '../context/ToastContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Eye, EyeOff, Copy, ShieldAlert } from 'lucide-react';
import { cn } from '../lib/utils';

export function ProjectSettings() {
  const { selectedProject } = useProject();
  const { addToast } = useToast();
  const [showKey, setShowKey] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');

  if (!selectedProject) {
    return <div className="text-slate-500">Please select a project first.</div>;
  }

  const handleCopyKey = () => {
    if (selectedProject.projectApiKey) {
      navigator.clipboard.writeText(selectedProject.projectApiKey);
      addToast('Project API Key copied to clipboard', 'success');
    }
  };

  const handleRevokeProject = () => {
    if (deleteInput !== 'REVOKE') {
      addToast('Please type REVOKE to confirm.', 'error');
      return;
    }
    // Implement revoke project logic here
    addToast('Project revoked! (Simulated)', 'warning');
    setDeleteInput('');
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <h2 className="text-2xl font-bold tracking-tight">Project Settings</h2>

      <Card>
        <CardHeader>
          <CardTitle>API Key Management</CardTitle>
          <p className="text-sm text-slate-400">Manage the secret key used to authenticate clients for this project.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Project API Key</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  readOnly
                  value={selectedProject.projectApiKey || 'No API key available'}
                  className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 pr-10 text-sm font-mono text-slate-300 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <Button variant="secondary" onClick={handleCopyKey}>
                <Copy size={16} className="mr-2" />
                Copy
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-red-900/50 bg-red-950/10">
        <CardHeader>
          <div className="flex items-center gap-2 text-red-500">
            <ShieldAlert size={20} />
            <CardTitle>Danger Zone</CardTitle>
          </div>
          <p className="text-sm text-red-400/80">Destructive actions that cannot be undone.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-950/50 border border-red-900/30 rounded-lg">
            <div>
              <h4 className="font-medium text-slate-200">Revoke Project</h4>
              <p className="text-sm text-slate-400">Permanently invalidates all active trials for this project.</p>
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                placeholder="Type REVOKE"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-md px-3 py-1.5 text-sm w-32 focus:border-red-500 focus:outline-none"
              />
              <Button 
                variant="danger" 
                onClick={handleRevokeProject}
                disabled={deleteInput !== 'REVOKE'}
              >
                Revoke Project
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
