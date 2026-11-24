import { expect, test } from "bun:test";
import {
  alertTabTitle,
  createAlertSignaller,
  type AlertNotification,
} from "@/modules/conversations/hooks";

test("the tab title leads with the unread count and drops it when all are read", () => {
  expect(alertTabTitle("Painel | ClickStudio Bots", 3)).toBe("(3) Painel | ClickStudio Bots");
  expect(alertTabTitle("(3) Painel | ClickStudio Bots", 4)).toBe("(4) Painel | ClickStudio Bots");
  expect(alertTabTitle("(4) Conversas | ClickStudio Bots", 0)).toBe("Conversas | ClickStudio Bots");
  expect(alertTabTitle("Painel", 120)).toBe("(99+) Painel");
  expect(alertTabTitle("(99+) Painel", 0)).toBe("Painel");
});

const alert = {
  id: "alert-a",
  kind: "team_message" as const,
  count: 1,
  read: false,
  conversationId: "conversation-a",
  contact: { name: "Maria Souza", appName: null, profileName: null, phone: "5511999990000" },
  preview: { type: "text" as const, text: "Meu cartão é 1234", revoked: false },
};
const allOn = async () => ({ sound: true, browserNotification: true });

// One browser: tabs share its locks and storage, and what each one plays or shows.
const createBrowser = () => {
  let held = Promise.resolve();
  const storage = new Map<string, string>();
  const sounds: string[] = [];
  const notifications: AlertNotification[] = [];
  const openTab = (name: string) =>
    createAlertSignaller({
      locks: {
        request: (_lock, run) => {
          const result = held.then(run);
          held = result.then(
            () => {},
            () => {},
          );
          return result;
        },
      },
      storage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => void storage.set(key, value),
      },
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms / 50)),
      playSound: () => void sounds.push(name),
      notify: (notification) => void notifications.push(notification),
    });
  return { openTab, sounds, notifications };
};

const hidden = { visible: false, viewing: false };
const visible = { visible: true, viewing: false };
const viewing = { visible: true, viewing: true };

test("three background tabs play one sound and show one notification, with no message text", async () => {
  const browser = createBrowser();
  const tabs = ["a", "b", "c"].map(browser.openTab);
  await Promise.all(tabs.map((tab) => tab.signal({ alert, preferences: allOn, tab: hidden })));

  expect(browser.sounds).toHaveLength(1);
  expect(browser.notifications).toEqual([
    {
      title: "Maria Souza",
      body: "Nova mensagem na equipe",
      tag: "alert-a",
      conversationId: "conversation-a",
    },
  ]);
  expect(JSON.stringify(browser.notifications)).not.toContain("1234");
});

test("a tab in front plays the sound and no tab shows a notification", async () => {
  const browser = createBrowser();
  const [back, front] = ["back", "front"].map(browser.openTab);
  await Promise.all([
    back.signal({ alert, preferences: allOn, tab: hidden }),
    front.signal({ alert, preferences: allOn, tab: visible }),
  ]);

  expect(browser.sounds).toEqual(["front"]);
  expect(browser.notifications).toEqual([]);
});

test("an Alert for the Conversation the Member is reading signals in no tab", async () => {
  const browser = createBrowser();
  const [back, front, reading] = ["back", "front", "reading"].map(browser.openTab);
  await Promise.all([
    back.signal({ alert, preferences: allOn, tab: hidden }),
    front.signal({ alert, preferences: allOn, tab: visible }),
    reading.signal({ alert, preferences: allOn, tab: viewing }),
  ]);
  await browser
    .openTab("late")
    .signal({ alert: { ...alert, read: true }, preferences: allOn, tab: hidden });

  expect(browser.sounds).toEqual([]);
  expect(browser.notifications).toEqual([]);
});

test("each signal follows its own preference switch", async () => {
  const soundOnly = createBrowser();
  await soundOnly.openTab("a").signal({
    alert,
    preferences: async () => ({ sound: true, browserNotification: false }),
    tab: hidden,
  });
  expect([soundOnly.sounds.length, soundOnly.notifications.length]).toEqual([1, 0]);

  const notificationOnly = createBrowser();
  await notificationOnly.openTab("a").signal({
    alert,
    preferences: async () => ({ sound: false, browserNotification: true }),
    tab: hidden,
  });
  expect([notificationOnly.sounds.length, notificationOnly.notifications.length]).toEqual([0, 1]);

  const off = createBrowser();
  await off.openTab("a").signal({
    alert,
    preferences: async () => ({ sound: false, browserNotification: false }),
    tab: hidden,
  });
  expect([off.sounds.length, off.notifications.length]).toEqual([0, 0]);
});

test("a slow tab that still sees an earlier merge count stays quiet", async () => {
  const browser = createBrowser();
  await browser
    .openTab("fast")
    .signal({ alert: { ...alert, count: 2 }, preferences: allOn, tab: hidden });
  await browser.openTab("slow").signal({ alert, preferences: allOn, tab: hidden });

  expect(browser.sounds).toEqual(["fast"]);
});

test("only the tab that signals reads the preferences, as they are then", async () => {
  const browser = createBrowser();
  let reads = 0;
  const preferences = async () => {
    reads += 1;
    return { sound: true, browserNotification: false };
  };
  await Promise.all(
    ["a", "b", "c"].map((name) =>
      browser.openTab(name).signal({ alert, preferences, tab: hidden }),
    ),
  );

  expect(reads).toBe(1);
  expect(browser.sounds).toHaveLength(1);
});

test("a later event merged into the same Alert signals again, once", async () => {
  const browser = createBrowser();
  const tabs = ["a", "b"].map(browser.openTab);
  for (const count of [1, 2])
    await Promise.all(
      tabs.map((tab) =>
        tab.signal({ alert: { ...alert, count }, preferences: allOn, tab: hidden }),
      ),
    );

  expect(browser.sounds).toHaveLength(2);
  expect(browser.notifications.map((n) => n.body)).toEqual([
    "Nova mensagem na equipe",
    "2 novas mensagens na equipe",
  ]);
});
