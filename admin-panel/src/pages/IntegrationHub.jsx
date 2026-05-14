import { useState } from 'react';
import { Copy, Check, TerminalSquare, Bug, Eye, EyeOff, ShieldCheck, Play, ArrowRight } from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { useToast } from '../context/ToastContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <div className="absolute right-3 top-3">
        <Button size="sm" variant="ghost" onClick={handleCopy} className="h-8 bg-slate-900/80 hover:bg-slate-800 border border-slate-700">
          {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
        </Button>
      </div>
      <pre className="p-5 rounded-xl bg-slate-950 border border-slate-800 overflow-x-auto">
        <code className="text-[13px] font-mono text-slate-300 leading-relaxed">{code}</code>
      </pre>
    </div>
  );
}

export function IntegrationHub() {
  const { selectedProject } = useProject();
  const { addToast } = useToast();
  const [showKey, setShowKey] = useState(false);
  const [simulatorDeviceId, setSimulatorDeviceId] = useState('');

  if (!selectedProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-center px-4">
        <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-4">
          <TerminalSquare size={32} className="text-slate-700" />
        </div>
        <p className="text-slate-500 italic max-w-xs">Initialize a project to access the developer automation suite.</p>
      </div>
    );
  }

  const { projectId, projectApiKey } = selectedProject;
  const baseUrl = 'https://us-central1-licence-registration-1c9ac.cloudfunctions.net/clientApi';

  const curlVerify = `curl -X POST ${baseUrl}/verifyTrial \\
  -H "Content-Type: application/json" \\
  -d '{
    "projectId": "${projectId}",
    "projectApiKey": "${projectApiKey || 'YOUR_API_KEY'}",
    "deviceId": "DEVICE_ID_HERE",
    "systemInfo": {
      "os": "Windows",
      "cpu": "Intel Core i9",
      "gpu": "NVIDIA RTX 4090"
    }
  }'`;

  const pythonVerify = `import requests

url = "${baseUrl}/verifyTrial"
payload = {
    "projectId": "${projectId}",
    "projectApiKey": "${projectApiKey || 'YOUR_API_KEY'}",
    "deviceId": "DEVICE_ID_HERE",
    "systemInfo": {
        "os": "Windows",
        "cpu": "Intel Core i9",
        "gpu": "NVIDIA RTX 4090"
    }
}

response = requests.post(url, json=payload)
print(response.json())`;

  const handleSimulateExpiry = () => {
    if (!simulatorDeviceId) {
      addToast("Enter a Device ID to simulate.", "error");
      return;
    }
    addToast(`Simulation: Overriding validity for ${simulatorDeviceId}...`, "info");
    setTimeout(() => {
      addToast(`Machine ${simulatorDeviceId} marked as EXPIRED in simulation mode.`, "success");
    }, 1000);
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-100 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-500 ring-1 ring-cyan-500/20 shadow-lg shadow-cyan-500/5">
              <TerminalSquare size={24} />
            </div>
            Integration Hub
          </h2>
          <p className="text-slate-400 mt-2">Enterprise-grade automation snippets and developer debug tools.</p>
        </div>
        
        <div className="flex items-center gap-4 bg-slate-900/50 p-1.5 rounded-2xl border border-slate-800 pr-4">
           <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
              <ShieldCheck size={18} className="text-emerald-500" />
           </div>
           <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">API Gateway Key</p>
              <div className="flex items-center gap-3">
                <code className="text-sm font-mono text-cyan-400 font-bold">
                   {showKey ? projectApiKey : '••••••••••••••••••••'}
                </code>
                <button 
                  onClick={() => setShowKey(!showKey)}
                  className="text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Card className="bg-slate-900/50 border-slate-800 border-none shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-slate-800/50 mx-6 px-0">
              <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">cURL Validation</CardTitle>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300">SH / BASH</span>
            </CardHeader>
            <CardContent className="p-6">
              <CodeBlock language="bash" code={curlVerify} />
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800 border-none shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-slate-800/50 mx-6 px-0">
              <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Python Implementation</CardTitle>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300">PY 3.10+</span>
            </CardHeader>
            <CardContent className="p-6">
              <CodeBlock language="python" code={pythonVerify} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-slate-950 border-slate-800 shadow-xl overflow-hidden group">
            <div className="h-1 bg-gradient-to-r from-amber-500/50 to-orange-500/50" />
            <CardHeader>
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-200">
                <Bug size={16} className="text-amber-500" />
                Debug Simulator
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                Simulate trial lifecycle events without modifying database state. Useful for frontend UI testing on your desktop clients.
              </p>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Target Machine ID..."
                  value={simulatorDeviceId}
                  onChange={(e) => setSimulatorDeviceId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500/50 font-mono"
                />
                <Button 
                  onClick={handleSimulateExpiry}
                  className="w-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-500 gap-2 h-9 text-xs font-bold"
                >
                  <Play size={12} fill="currentColor" />
                  Simulate Expiry
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/30 border-slate-800 border-dashed">
            <CardContent className="p-6">
               <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">Enterprise Docs</h4>
               <ul className="space-y-3">
                 {['API Specification', 'Desktop SDK Guide', 'Webhook Setup'].map(item => (
                   <li key={item} className="flex items-center justify-between group/link cursor-pointer">
                      <span className="text-xs text-slate-400 group-hover/link:text-cyan-400 transition-colors">{item}</span>
                      <ArrowRight size={12} className="text-slate-700 group-hover/link:translate-x-1 transition-transform group-hover/link:text-cyan-500" />
                   </li>
                 ))}
               </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
