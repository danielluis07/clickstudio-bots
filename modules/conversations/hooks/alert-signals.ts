import type { AlertKind } from "@/modules/conversations/alerts";
import { alertCountLabel, alertKindLabel } from "@/modules/conversations/hooks/alert-display";
import { contactDisplayName } from "@/modules/conversations/hooks/contact-display";

const countPrefix = /^\(\d+\+?\) /;

// The tab title with the unread count in front, e.g. "(3) Painel".
export const alertTabTitle = (title: string, unread: number) => {
  const base = title.replace(countPrefix, "");
  return unread > 0 ? `(${alertCountLabel(unread)}) ${base}` : base;
};

export type SignalledAlert = {
  id: string;
  kind: AlertKind;
  count: number;
  read: boolean;
  conversationId: string;
  contact: {
    name: string | null;
    appName: string | null;
    profileName: string | null;
    phone: string;
  };
};

// What a browser notification shows: the Contact and the kind, never message text.
export type AlertNotification = {
  title: string;
  body: string;
  tag: string;
  conversationId: string;
};

// The browser APIs the signals use, shared by every tab of one browser. Tests
// pass fakes.
export type AlertSignalBrowser = {
  locks: { request: <T>(name: string, run: () => T | Promise<T>) => Promise<T> };
  storage: { getItem(key: string): string | null; setItem(key: string, value: string): void };
  wait: (ms: number) => Promise<void>;
  playSound: () => void;
  notify: (notification: AlertNotification) => void;
};

const claimLock = "clickstudio:alert-signals";
const claimedKey = "clickstudio:alert-signals";
const claimedLimit = 100;

// How long a tab waits before claiming an Alert event. A tab where the Member
// is reading the Conversation claims first and silences it; a tab in front
// claims before one in the background, so the notification only shows when
// no dashboard tab is in front.
const claimDelay = { viewing: 0, visible: 250, hidden: 1000 };

// Plays the sound and shows the browser notification for a new Alert, in only
// one of the Member's open dashboard tabs. Every tab offers each Alert event;
// the first to claim it, under a browser-wide lock, signals and records it so
// the others stay quiet. A merged Alert keeps its id, so each event is its id
// and count.
export const createAlertSignaller = (browser: AlertSignalBrowser) => {
  const readClaimed = (): string[] => {
    try {
      const stored: unknown = JSON.parse(browser.storage.getItem(claimedKey) ?? "[]");
      return Array.isArray(stored) ? stored.filter((key) => typeof key === "string") : [];
    } catch {
      return [];
    }
  };

  // True when this tab is the first to claim the event.
  const claim = (event: string) =>
    browser.locks.request(claimLock, () => {
      const claimed = readClaimed();
      if (claimed.includes(event)) return false;
      try {
        browser.storage.setItem(
          claimedKey,
          JSON.stringify([...claimed, event].slice(-claimedLimit)),
        );
      } catch {
        // Storage full or blocked: this tab still signals.
      }
      return true;
    });

  return {
    async signal({
      alert,
      preferences,
      tab,
    }: {
      alert: SignalledAlert;
      preferences: { sound: boolean; browserNotification: boolean };
      tab: { visible: boolean; viewing: boolean };
    }) {
      // An Alert for the Conversation the Member is reading arrives read.
      const silent = alert.read || tab.viewing;
      const rank = tab.viewing ? "viewing" : tab.visible ? "visible" : "hidden";
      await browser.wait(claimDelay[rank]);
      if (!(await claim(`${alert.id}:${alert.count}`)) || silent) return;
      if (preferences.sound) browser.playSound();
      if (preferences.browserNotification && !tab.visible)
        browser.notify({
          title: contactDisplayName(alert.contact),
          body: alertKindLabel(alert),
          tag: alert.id,
          conversationId: alert.conversationId,
        });
    },
  };
};

// The Conversation this tab has open, if any. Only one ConversationView is
// mounted at a time.
let viewedConversation: string | null = null;
export const setViewedConversation = (conversationId: string | null) => {
  viewedConversation = conversationId;
};
export const getViewedConversation = () => viewedConversation;

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

export const notificationsSupported = () =>
  typeof window !== "undefined" && "Notification" in window;

// Asks the browser for permission. Call it only from the Member turning
// browser notifications on.
export const requestNotificationPermission = async () => {
  if (!notificationsSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
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
      if (!notificationsSupported() || Notification.permission !== "granted") return;
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
