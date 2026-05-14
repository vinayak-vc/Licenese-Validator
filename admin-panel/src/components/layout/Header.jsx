import { useEffect, useState } from 'react';
import { getServerTime } from '../../lib/api';
import { useProject } from '../../context/ProjectContext';
import { Clock, Globe } from 'lucide-react';

export function Header() {
  const { selectedProject } = useProject();
  const [time, setTime] = useState(new Date(getServerTime()));

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date(getServerTime()));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="h-20 border-b border-slate-800 bg-slate-900/40 backdrop-blur-md flex items-center justify-between px-8 sticky top-0 z-40 transition-all duration-300">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
           <div className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.6)] animate-pulse" />
           <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
             Systems Operational
           </h2>
        </div>
        {selectedProject && (
          <>
            <div className="h-4 w-px bg-slate-800" />
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/50 border border-slate-700/50">
               <Globe size={12} className="text-cyan-400" />
               <span className="text-xs font-bold text-slate-200 tracking-tight">{selectedProject.name}</span>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-6">
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-2 text-[13px] font-bold text-slate-100 font-mono tracking-tighter">
            <Clock size={14} className="text-slate-500" />
            {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
          </div>
          <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">
            Server Sync (UTC/IST)
          </p>
        </div>
        
        <div className="relative group">
          <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="h-12 w-12 rounded-xl bg-slate-950 border border-slate-800 p-1.5 flex items-center justify-center shadow-2xl relative z-10 hover:border-cyan-500/50 transition-all cursor-pointer">
             <img 
               src="/favicon.png" 
               alt="User Instance" 
               className="w-full h-full object-contain" 
             />
          </div>
        </div>
      </div>
    </header>
  );
}

