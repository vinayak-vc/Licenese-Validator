import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWallpaper } from '../hooks/useWallpaper';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { KeyRound } from 'lucide-react';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const wallpaperUrl = useWallpaper();

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
      {wallpaperUrl && (
        <div 
          className="absolute inset-0 z-0 bg-cover bg-center transition-all duration-1000 ease-in-out"
          style={{ backgroundImage: `url(${wallpaperUrl})` }}
        />
      )}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/40 via-slate-950/90 to-slate-950/95"></div>
      
      <Card className="w-full max-w-md relative z-10 border-slate-800 bg-slate-900/80 backdrop-blur-md shadow-2xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-12 h-12 bg-indigo-500/20 text-indigo-400 rounded-xl flex items-center justify-center mb-4 ring-1 ring-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
            <KeyRound size={24} />
          </div>
          <CardTitle className="text-2xl font-bold text-slate-100">Admin Authentication</CardTitle>
          <p className="text-slate-400 text-sm mt-2">Sign in to access the Trial Licensing System</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Email Address</label>
              <input
                type="email"
                required
                className="w-full bg-slate-950/50 border border-slate-800 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Password</label>
              <input
                type="password"
                required
                className="w-full bg-slate-950/50 border border-slate-800 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full mt-6" disabled={isSubmitting}>
              {isSubmitting ? 'Authenticating...' : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
