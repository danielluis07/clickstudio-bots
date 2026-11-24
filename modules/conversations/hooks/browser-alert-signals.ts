import { createAlertSignaller } from "@/modules/conversations/hooks/alert-signals";

// The Conversation this tab has open, if any. Only one ConversationView is
// mounted at a time.
let viewedConversation: string | null = null;
export const setViewedConversation = (conversationId: string | null) => {
  viewedConversation = conversationId;
};

// How this tab stands towards an Alert: in front or not, and showing its
// Conversation.
export const alertTabState = (conversationId: string) => {
  const visible = document.visibilityState === "visible";
  return { visible, viewing: visible && viewedConversation === conversationId };
};

let audio: AudioContext | undefined;

// A short two-note chime, made in the browser so no sound file is served.
// Browsers may refuse to play before the Member interacts with the page;
// then it stays silent.
const playChime = () => {
  try {
    audio ??= new AudioContext();
    const context = audio;
    void context.resume().catch(() => {});
    const start = context.currentTime;
    [880, 1320].forEach((frequency, index) => {
      const at = start + index * 0.12;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.2, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.3);
    });
  } catch {
    // No Web Audio: no sound.
  }
};

const notificationsSupported = () => typeof window !== "undefined" && "Notification" in window;

// Whether this browser lets the dashboard show notifications. Permission
// belongs to the browser, while the preference follows the Member everywhere.
export const notificationsGranted = () =>
  notificationsSupported() && Notification.permission === "granted";

const permissionListeners = new Set<() => void>();

// For useSyncExternalStore: told when a request may have changed permission.
export const subscribeNotificationPermission = (listener: () => void) => {
  permissionListeners.add(listener);
  return () => {
    permissionListeners.delete(listener);
  };
};

// Asks the browser for permission. Call it only from the Member turning
// browser notifications on.
export const requestNotificationPermission = async () => {
  if (!notificationsSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const granted = (await Notification.requestPermission()) === "granted";
  permissionListeners.forEach((listener) => listener());
  return granted;
};

// The real browser behind the signals. Clicking a notification brings the tab
// forward and opens the Conversation.
export const createBrowserAlertSignaller = ({
  openConversation,
}: {
  openConversation: (conversationId: string) => void;
}) =>
  createAlertSignaller({
    locks: {
      // Without Web Locks (insecure context, old browser) each tab decides on
      // its own, so several may signal.
      request: (name, run) =>
        typeof navigator !== "undefined" && navigator.locks
          ? navigator.locks.request(name, run)
          : Promise.resolve().then(run),
    },
    storage: {
      getItem: (key) => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value),
    },
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    playSound: playChime,
    notify: ({ title, body, tag, conversationId }) => {
      if (!notificationsGranted()) return;
      try {
        const notification = new Notification(title, { body, tag });
        notification.onclick = () => {
          window.focus();
          openConversation(conversationId);
          notification.close();
        };
      } catch {
        // Some mobile browsers only notify through a service worker.
      }
    },
  });
