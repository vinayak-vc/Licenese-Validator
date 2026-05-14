import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWallpaper } from '../hooks/useWallpaper';
import { useFact } from '../hooks/useFact';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Info } from 'lucide-react';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const wallpaperUrl = useWallpaper();
  const fact = useFact();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (error) {
      // Error is handled by Toast in AuthContext
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Dynamic Wallpaper Layer */}
      {wallpaperUrl && (
        <div
          className="absolute inset-0 z-0 bg-cover bg-center transition-opacity duration-1000"
          style={{ backgroundImage: `url(${wallpaperUrl})` }}
        />
      )}

      {/* Obsidian Stealth Overlay */}
      <div className="absolute inset-0 z-0 obsidian-stealth-bg opacity-90 backdrop-blur-[6px]"></div>
      <div className="absolute inset-0 z-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.05] pointer-events-none"></div>

      <Card className="w-full max-w-md relative z-10 border-slate-800 bg-slate-900/80 backdrop-blur-md shadow-2xl">
        <CardHeader className="text-center pb-6">
          <div className="flex flex-col items-center">
            <img
              src="/icon.svg"
              alt="NexusGate Core"
              className="w-100 h-100 object-contain drop-shadow-[0_0_30px_rgba(6,182,212,0.6)] animate-pulse"
            />
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5 mt-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Node Administrator</label>
              <input
                type="email"
                required
                className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500/50 transition-all"
                placeholder="admin@nexusgate.io"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Security Cipher</label>
              <input
                type="password"
                required
                className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500/50 transition-all"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full mt-6 h-12 font-black uppercase tracking-widest text-[11px]" disabled={isSubmitting}>
              {isSubmitting ? 'Verifying Credentials...' : 'Initialize System'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Persistent Intel (Facts) Footer */}
      {fact && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-xl px-4 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-500">
          <div className="flex items-center gap-4 bg-slate-950/40 backdrop-blur-md border border-slate-800/50 rounded-2xl p-4 group">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/5 border border-cyan-500/10 flex items-center justify-center shrink-0 group-hover:border-cyan-500/30 transition-colors">
              <Info size={16} className="text-cyan-500/50 group-hover:text-cyan-400" />
            </div>
            <div className="min-w-0">
               <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 mb-0.5">Nexus Intel Feed</p>
               <p className="text-[11px] font-medium text-slate-400 font-mono italic">
                 "{fact}"
               </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
