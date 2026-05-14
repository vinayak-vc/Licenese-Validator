import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, Settings, TerminalSquare, LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useProject } from '../../context/ProjectContext';
import { cn } from '../../lib/utils';

export function Sidebar() {
  const { logout } = useAuth();
  const { projects, selectedProjectId, setSelectedProjectId } = useProject();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const navLinks = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/clients', icon: Users, label: 'Client Registry' },
    { to: '/integration', icon: TerminalSquare, label: 'Integration Hub' },
    { to: '/settings', icon: Settings, label: 'Project Settings' },
  ];

  const selectedProject = projects.find((p) => p.projectId === selectedProjectId);

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen fixed top-0 left-0">
      <div className="p-4 border-b border-slate-800">
        <h1 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2 mb-4">
          <span className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center text-xs font-mono">T</span>
          Trial License
        </h1>

        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-full flex items-center justify-between p-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-left hover:border-slate-700 transition-colors"
          >
            <span className="truncate flex-1">
              {selectedProject ? selectedProject.name : 'Select a project...'}
            </span>
            <ChevronDown size={16} className="text-slate-400 ml-2" />
          </button>
          
          {dropdownOpen && (
            <div className="absolute top-full left-0 w-full mt-1 bg-slate-950 border border-slate-800 rounded-md shadow-xl z-50 max-h-60 overflow-y-auto">
              {projects.length === 0 ? (
                <div className="p-2 text-sm text-slate-500">No projects</div>
              ) : (
                projects.map((p) => (
                  <button
                    key={p.projectId}
                    className={cn('w-full text-left px-3 py-2 text-sm hover:bg-slate-800', {
                      'bg-slate-800 text-indigo-400': p.projectId === selectedProjectId
                    })}
                    onClick={() => {
                      setSelectedProjectId(p.projectId);
                      setDropdownOpen(false);
                    }}
                  >
                    {p.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        {navLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-indigo-600/10 text-indigo-400'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              )
            }
          >
            <link.icon size={18} />
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </aside>
  );
}
