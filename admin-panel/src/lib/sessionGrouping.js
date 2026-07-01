// Groups a stream of events into sessions bracketed by session_start /
// session_end. Events outside any session (dangling before first
// session_start or after the last session_end without a matching pair)
// are stitched into pseudo-sessions using a 30-minute inactivity gap.
//
// Input: events sorted ASCENDING by receivedAt.
// Output: array of { id, startMs, endMs, events, screensViewed, clicks,
//   errors, durationSeconds, cleanClose }.

const INACTIVITY_GAP_MS = 30 * 60 * 1000;

export function groupIntoSessions(eventsAsc) {
  if (!eventsAsc || eventsAsc.length === 0) return [];

  const sessions = [];
  let current = null;
  let sessionCounter = 0;

  function openSession(startEvent, cleanStart) {
    sessionCounter += 1;
    current = {
      id: `session-${sessionCounter}`,
      startMs: startEvent.receivedAt || startEvent.clientTimestamp,
      endMs: null,
      cleanStart,
      cleanClose: false,
      events: [],
      screensViewed: new Set(),
      clicks: 0,
      errors: 0,
    };
    sessions.push(current);
  }

  function closeSession(closeEvent, cleanClose) {
    if (!current) return;
    current.endMs = closeEvent.receivedAt || closeEvent.clientTimestamp;
    current.cleanClose = cleanClose;
    current = null;
  }

  eventsAsc.forEach((event) => {
    const eventTime = event.receivedAt || event.clientTimestamp;
    if (!current) {
      openSession(event, event.name === 'session_start' || event.name === 'app_open');
    } else if (eventTime - (current.events[current.events.length - 1]?.receivedAt || current.startMs) > INACTIVITY_GAP_MS) {
      // Long idle gap - close prior implicitly, start new.
      closeSession(current.events[current.events.length - 1] || event, false);
      openSession(event, event.name === 'session_start' || event.name === 'app_open');
    }

    if (current) {
      current.events.push(event);
      if (event.name === 'screen_view') {
        const screen = event.params?.screen_name || 'unknown';
        current.screensViewed.add(screen);
      } else if (event.name?.startsWith('ui_click')) {
        current.clicks += 1;
      } else if (event.name === 'error_reported' || event.name === 'exception_caught') {
        current.errors += 1;
      }

      if (event.name === 'session_end') {
        closeSession(event, true);
      }
    }
  });

  // If there's still an open session at the end, close it against its own tail.
  if (current) {
    const tail = current.events[current.events.length - 1];
    if (tail) closeSession(tail, false);
  }

  return sessions.map((session) => ({
    ...session,
    screensViewed: Array.from(session.screensViewed),
    durationSeconds: session.endMs && session.startMs
      ? Math.max(0, Math.round((session.endMs - session.startMs) / 1000))
      : 0,
  }));
}
