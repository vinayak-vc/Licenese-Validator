import { Outlet, Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useAuth } from '../../context/AuthContext';
import { useWallpaper } from '../../hooks/useWallpaper';

export function Layout() {
  const { user, loading } = useAuth();
  const wallpaperUrl = useWallpaper();

  if (loading) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans flex relative overflow-hidden">
      {/* Dynamic Wallpaper Background */}
      {wallpaperUrl && (
        <div 
          className="absolute inset-0 z-0 bg-cover bg-center transition-all duration-1000 ease-in-out"
          style={{ backgroundImage: `url(${wallpaperUrl})` }}
        />
      )}
      <div className="absolute inset-0 z-0 bg-slate-950/80 backdrop-blur-[2px]"></div>

      <div className="z-10 flex w-full">
        <Sidebar />
        <div className="flex-1 ml-64 flex flex-col min-h-screen">
          <Header />
          <main className="flex-1 p-6 overflow-x-hidden relative">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
