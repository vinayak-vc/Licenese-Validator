// Translate machine event names into operator-friendly labels + groups.
// Anything not mapped here falls into "Other" - safe default so unknown
// custom events still show up somewhere instead of vanishing.

export const EVENT_GROUPS = {
  sessions: { label: 'Sessions', color: 'emerald', accent: '#10b981' },
  screens: { label: 'Screens', color: 'sky', accent: '#0ea5e9' },
  interactions: { label: 'User Actions', color: 'cyan', accent: '#06b6d4' },
  game: { label: 'Gameplay', color: 'violet', accent: '#8b5cf6' },
  enterprise: { label: 'Work Tasks', color: 'amber', accent: '#f59e0b' },
  kiosk: { label: 'Kiosk Activity', color: 'rose', accent: '#f43f5e' },
  errors: { label: 'Errors', color: 'red', accent: '#ef4444' },
  other: { label: 'Other', color: 'slate', accent: '#94a3b8' },
};

const KNOWN_EVENTS = {
  session_start: { label: 'App Opened', group: 'sessions' },
  session_end: { label: 'App Closed', group: 'sessions' },
  app_open: { label: 'App Opened', group: 'sessions' },
  app_pause: { label: 'App Backgrounded', group: 'sessions' },
  app_resume: { label: 'App Foregrounded', group: 'sessions' },
  screen_view: { label: 'Screen Viewed', group: 'screens' },
  error_reported: { label: 'Error Reported', group: 'errors' },
  exception_caught: { label: 'Crash / Exception', group: 'errors' },

  level_start: { label: 'Level Started', group: 'game' },
  level_complete: { label: 'Level Finished', group: 'game' },
  level_fail: { label: 'Level Failed', group: 'game' },
  tutorial_step: { label: 'Tutorial Step', group: 'game' },
  purchase_completed: { label: 'Purchase Made', group: 'game' },
  ad_impression: { label: 'Ad Shown', group: 'game' },
  rewarded_ad_watched: { label: 'Rewarded Ad Watched', group: 'game' },
  currency_earned: { label: 'Currency Earned', group: 'game' },
  currency_spent: { label: 'Currency Spent', group: 'game' },

  enterprise_login: { label: 'Logged In', group: 'enterprise' },
  enterprise_login_failure: { label: 'Login Failed', group: 'enterprise' },
  enterprise_module_opened: { label: 'Module Opened', group: 'enterprise' },
  enterprise_task_started: { label: 'Task Started', group: 'enterprise' },
  enterprise_task_completed: { label: 'Task Completed', group: 'enterprise' },
  enterprise_feature_adopted: { label: 'Feature Used', group: 'enterprise' },
  enterprise_permission_denied: { label: 'Permission Denied', group: 'enterprise' },
  enterprise_api_call: { label: 'API Call', group: 'enterprise' },

  kiosk_attract_started: { label: 'Attract Loop Started', group: 'kiosk' },
  kiosk_session_started: { label: 'Kiosk Session Started', group: 'kiosk' },
  kiosk_idle_timeout: { label: 'Kiosk Idle Timeout', group: 'kiosk' },
  kiosk_content_impression: { label: 'Content Viewed', group: 'kiosk' },
  kiosk_cta_click: { label: 'Call to Action Clicked', group: 'kiosk' },
  kiosk_transaction_completed: { label: 'Transaction Completed', group: 'kiosk' },
  kiosk_hardware_fault: { label: 'Hardware Fault', group: 'errors' },
  kiosk_language_selected: { label: 'Language Selected', group: 'kiosk' },
};

// Auto-captured UI events look like "ui_click:PlayButton/MainMenu" - we
// slice out the actual widget name from the hierarchy segment.
export function humanize(eventName) {
  if (!eventName) return { label: 'Unknown', group: 'other', kind: 'unknown', target: '' };

  const known = KNOWN_EVENTS[eventName];
  if (known) return { ...known, kind: eventName, target: '' };

  if (eventName.startsWith('ui_click')) {
    const target = extractUiTarget(eventName);
    return { label: target ? `Clicked ${target}` : 'Clicked (unknown)', group: 'interactions', kind: 'ui_click', target };
  }
  if (eventName.startsWith('ui_toggle_changed')) {
    const target = extractUiTarget(eventName);
    return { label: target ? `Toggled ${target}` : 'Toggle changed', group: 'interactions', kind: 'ui_toggle', target };
  }
  if (eventName.startsWith('ui_slider_changed')) {
    return { label: 'Slider Moved', group: 'interactions', kind: 'ui_slider', target: extractUiTarget(eventName) };
  }
  if (eventName.startsWith('ui_dropdown_changed')) {
    return { label: 'Dropdown Changed', group: 'interactions', kind: 'ui_dropdown', target: extractUiTarget(eventName) };
  }
  if (eventName.startsWith('ui_input_submitted')) {
    return { label: 'Text Entered', group: 'interactions', kind: 'ui_input', target: extractUiTarget(eventName) };
  }

  return { label: eventName, group: 'other', kind: 'custom', target: '' };
}

function extractUiTarget(eventName) {
  const colonIndex = eventName.indexOf(':');
  if (colonIndex < 0) return '';
  const path = eventName.slice(colonIndex + 1);
  // path is child-first (leaf/parent/root) - the first segment is the widget itself.
  return path.split('/')[0] || '';
}

// Sums counts into groups so we can chart categories instead of raw names.
export function groupCounts(topEvents) {
  const totals = {};
  Object.keys(EVENT_GROUPS).forEach((key) => { totals[key] = 0; });
  topEvents.forEach(([name, count]) => {
    const info = humanize(name);
    totals[info.group] = (totals[info.group] || 0) + count;
  });
  return totals;
}
