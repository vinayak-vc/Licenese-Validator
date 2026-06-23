import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';
import { auth } from '../firebase';

const NotificationContext = createContext(null);

const POLL_MS = 60_000;
const STORAGE_KEY = 'nexusgate_notif_read_at';

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [lastReadAt, setLastReadAt] = useState(
    () => Number(localStorage.getItem(STORAGE_KEY) || 0)
  );
  const timerRef = useRef(null);

  const fetch = useCallback(async () => {
    if (!auth.currentUser) return;
    try {
      const res = await api.getNotifications();
      setNotifications(res.notifications || []);
    } catch {
      // non-critical — silent fail
    }
  }, []);

  useEffect(() => {
    fetch();
    timerRef.current = setInterval(fetch, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [fetch]);

  const unreadCount = notifications.filter(n => n.timestamp > lastReadAt).length;

  const markAllRead = () => {
    const now = Date.now();
    localStorage.setItem(STORAGE_KEY, String(now));
    setLastReadAt(now);
  };

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAllRead, refresh: fetch, lastReadAt }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
