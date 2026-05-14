import { useEffect, useState } from 'react';
import { getServerTime } from '../../lib/api';

export function Header() {
  const [time, setTime] = useState(new Date(getServerTime()));

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date(getServerTime()));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm flex items-center justify-between px-6 sticky top-0 z-40">
      <div>
        <h2 className="text-sm font-medium text-slate-400">Admin Console</h2>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm font-mono bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-md text-slate-300">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Live Server Time: {time.toLocaleString()}
        </div>
      </div>
    </header>
  );
}
