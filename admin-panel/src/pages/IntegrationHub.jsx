import { useState } from 'react';
import { Copy, Check, TerminalSquare } from 'lucide-react';
import { useProject } from '../context/ProjectContext';
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
      <div className="absolute right-2 top-2">
        <Button size="sm" variant="ghost" onClick={handleCopy} className="bg-slate-900/80 hover:bg-slate-800">
          {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
        </Button>
      </div>
      <pre className="p-4 rounded-md bg-slate-950 border border-slate-800 overflow-x-auto">
        <code className="text-sm font-mono text-slate-300">{code}</code>
      </pre>
    </div>
  );
}

export function IntegrationHub() {
  const { selectedProject } = useProject();

  if (!selectedProject) {
    return <div className="text-slate-500">Please select a project first.</div>;
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

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500">
          <TerminalSquare size={20} />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Integration Hub</h2>
      </div>
      <p className="text-slate-400">Use these generated snippets to integrate the trial licensing validation into your client applications.</p>

      <Card>
        <CardHeader>
          <CardTitle>cURL Example</CardTitle>
        </CardHeader>
        <CardContent>
          <CodeBlock language="bash" code={curlVerify} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Python Example</CardTitle>
        </CardHeader>
        <CardContent>
          <CodeBlock language="python" code={pythonVerify} />
        </CardContent>
      </Card>
    </div>
  );
}
