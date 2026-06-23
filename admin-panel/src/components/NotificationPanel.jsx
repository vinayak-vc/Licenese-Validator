import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { UserPlus, AlertTriangle, XCircle, CheckCheck, RefreshCw, BellOff } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { useProject } from '../context/ProjectContext';
import { cn } from '../lib/utils';

const TYPE_META = {
  NEW_CLIENT: {
    icon: UserPlus,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    label: 'New Registration',
  },
  EXPIRING: {
    icon: AlertTriangle,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    label: 'Expiring Soon',
  },
  EXPIRED: {
    icon: XCircle,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    label: 'Trial Expired',
  },
};

function NotifRow({ notif, isUnread, onNavigate }) {
  const meta = TYPE_META[notif.type] || TYPE_META.EXPIRING;
  const Icon = meta.icon;

  const label = notif.type === 'NEW_CLIENT'
    ? `${notif.deviceId.slice(0, 16)}… joined ${notif.projectName}`
    : notif.type === 'EXPIRING'
      ? `${notif.deviceId.slice(0, 16)}… expires ${formatDistanceToNow(notif.trialEnd, { addSuffix: true })}`
      : `${notif.deviceId.slice(0, 16)}… expired ${formatDistanceToNow(notif.trialEnd, { addSuffix: true })}`;

  return (
    <button
      onClick={() => onNavigate(notif.projectId)}
      className={cn(
        'w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-slate-800/60 transition-colors border-b border-slate-800/50 last:border-0',
        isUnread && 'bg-slate-800/30'
      )}
    >
      <div className={cn('mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border', meta.bg, meta.border)}>
        <Icon size={13} className={meta.color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn('text-[9px] font-black uppercase tracking-widest', meta.color)}>{meta.label}</span>
          {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0" />}
        </div>
        <p className="text-[11px] text-slate-300 font-medium mt-0.5 truncate">{label}</p>
        <p className="text-[10px] text-slate-600 font-mono mt-0.5">
          {notif.projectName} · {formatDistanceToNow(notif.timestamp, { addSuffix: true })}
        </p>
      </div>
    </button>
  );
}

export function NotificationPanel({ onClose }) {
  const { notifications, unreadCount, markAllRead, refresh, lastReadAt } = useNotifications();
  const { setSelectedProjectId } = useProject();
  const navigate = useNavigate();
  const panelRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const handleNavigate = (projectId) => {
    setSelectedProjectId(projectId);
    navigate('/clients');
    onClose();
  };

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-3 w-80 bg-slate-950 border border-slate-800 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] z-[200] overflow-hidden ring-1 ring-white/5"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/60">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-300">Notifications</p>
          {unreadCount > 0 && (
            <p className="text-[9px] text-cyan-400 font-mono mt-0.5">{unreadCount} unread</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={12} />
          </button>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="p-1.5 rounded-lg text-slate-500 hover:text-cyan-400 hover:bg-slate-800 transition-colors"
              title="Mark all read"
            >
              <CheckCheck size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="max-h-[420px] overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <BellOff size={24} className="text-slate-700 mb-3" />
            <p className="text-[11px] text-slate-600 font-medium">No notifications</p>
            <p className="text-[10px] text-slate-700 mt-1">New registrations and expiries appear here</p>
          </div>
        ) : (
          notifications.map(n => (
            <NotifRow
              key={n.id}
              notif={n}
              isUnread={n.timestamp > lastReadAt}
              onNavigate={handleNavigate}
            />
          ))
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="px-4 py-2 border-t border-slate-800 bg-slate-900/40">
          <p className="text-[9px] text-slate-600 text-center font-mono">
            Polls every 60s · Shows last 24h + upcoming 3d
          </p>
        </div>
      )}
    </div>
  );
}
