import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useAuth } from '../../context/AuthContext';
import { useWallpaper } from '../../hooks/useWallpaper';
import { useFact } from '../../hooks/useFact';
import { Info } from 'lucide-react';

export function Layout() {
  const { user, loading } = useAuth();
  const wallpaperUrl = useWallpaper();
  const fact = useFact();
  const location = useLocation();

  if (loading) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans flex relative overflow-hidden">
      {/* 1. Dynamic Wallpaper Layer (Deepest) */}
      {wallpaperUrl && (
        <div 
          className="absolute inset-0 z-0 bg-cover bg-center transition-opacity duration-1000"
          style={{ backgroundImage: `url(${wallpaperUrl})` }}
        />
      )}
      
      {/* 2. Obsidian Stealth Gradient & Mesh Layer (Middle) */}
      <div className="absolute inset-0 z-0 obsidian-stealth-bg opacity-90 backdrop-blur-[4px]"></div>
      <div className="absolute inset-0 z-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.05] pointer-events-none"></div>

      <div className="z-10 flex w-full">
        <Sidebar />
        <div className="flex-1 ml-64 flex flex-col h-screen">
          <Header />
          <main key={location.key} className="flex-1 overflow-y-auto p-8 nexus-page-unfold">
            <Outlet />
          </main>

          {/* Persistent Intel (Facts) Footer */}
          {fact && (
            <div className="relative mt-auto px-8 py-3 border-t border-slate-800/50 flex items-center justify-between group cursor-default bg-slate-900/40 backdrop-blur-md">
              <div className="nexus-wave-bar wave-rtl absolute -top-[3px] left-0 right-0 z-50" />
              <div className="flex items-center gap-3 max-w-[80%]">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/5 border border-cyan-500/10 flex items-center justify-center shrink-0 group-hover:border-cyan-500/30 transition-colors">
                  <Info size={14} className="text-cyan-500/50 group-hover:text-cyan-400" />
                </div>
                <div className="min-w-0">
                   <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 mb-0.5">Nexus Intel Feed</p>
                   <p className="text-[11px] font-medium text-slate-400 font-mono italic truncate" title={fact}>
                     "{fact}"
                   </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-700 uppercase tracking-widest shrink-0">
                 <span className="w-1 h-1 rounded-full bg-slate-800" />
                 Encrypted Stream
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
