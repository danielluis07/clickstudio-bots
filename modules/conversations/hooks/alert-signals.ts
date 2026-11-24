import type { AlertKind } from "@/modules/conversations/alerts";
import { alertCountLabel, alertKindLabel } from "@/modules/conversations/hooks/alert-display";
import {
  contactDisplayName,
  type ContactNames,
} from "@/modules/conversations/hooks/contact-display";

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
  contact: ContactNames;
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
// the others stay quiet. A merged Alert keeps its id and counts its events, so
// a tab claims an Alert only at a higher count than any tab claimed before; a
// tab whose refetch still shows an earlier count stays quiet.
export const createAlertSignaller = (browser: AlertSignalBrowser) => {
  // The highest claimed count of each recent Alert, oldest first.
  const readClaimed = (): [string, number][] => {
    try {
      const stored: unknown = JSON.parse(browser.storage.getItem(claimedKey) ?? "[]");
      return Array.isArray(stored)
        ? stored.filter(
            (entry): entry is [string, number] =>
              Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "number",
          )
        : [];
    } catch {
      return [];
    }
  };

  // True when this tab is the first to claim the Alert at this count.
  const claim = (alertId: string, count: number) =>
    browser.locks.request(claimLock, () => {
      const claimed = readClaimed();
      const previous = claimed.find(([id]) => id === alertId)?.[1] ?? 0;
      if (count <= previous) return false;
      const updated = [...claimed.filter(([id]) => id !== alertId), [alertId, count]];
      try {
        browser.storage.setItem(claimedKey, JSON.stringify(updated.slice(-claimedLimit)));
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
      // Read only by the tab that signals, so a switch changed in another tab
      // counts.
      preferences: () => Promise<{ sound: boolean; browserNotification: boolean }>;
      tab: { visible: boolean; viewing: boolean };
    }) {
      // An Alert for the Conversation the Member is reading arrives read.
      const silent = alert.read || tab.viewing;
      const rank = tab.viewing ? "viewing" : tab.visible ? "visible" : "hidden";
      await browser.wait(claimDelay[rank]);
      if (!(await claim(alert.id, alert.count)) || silent) return;
      const { sound, browserNotification } = await preferences();
      if (sound) browser.playSound();
      if (browserNotification && !tab.visible)
        browser.notify({
          title: contactDisplayName(alert.contact),
          body: alertKindLabel(alert),
          tag: alert.id,
          conversationId: alert.conversationId,
        });
    },
  };
};
