// 阿部接骨院 院内システム：Webプッシュ用サービスワーカー
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// トレイに残っている通知の数をアプリアイコンのバッジに反映
async function syncBadge() {
  try {
    const notes = await self.registration.getNotifications();
    const n = notes.length;
    if (self.navigator && "setAppBadge" in self.navigator) {
      if (n > 0) await self.navigator.setAppBadge(n);
      else await self.navigator.clearAppBadge();
    }
  } catch (_) {}
}

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  const title = data.title || "阿部接骨院";
  const body = data.body || "";
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, {
        body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: data.tag || undefined,
        renotify: !!data.tag,
        data: { url: data.url || "/admin" },
      });
      await syncBadge();
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/admin";
  event.waitUntil((async () => {
    await syncBadge();
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (c.url.includes("/admin") && "focus" in c) return c.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});

// トレイから消したときもバッジを合わせる
self.addEventListener("notificationclose", (event) => {
  event.waitUntil(syncBadge());
});

// 画面（アプリ）から「バッジを消して」と言われたらクリア
self.addEventListener("message", (event) => {
  if (event.data === "clear-badge") {
    event.waitUntil((async () => {
      try {
        const notes = await self.registration.getNotifications();
        notes.forEach((nt) => nt.close());
        if (self.navigator && "clearAppBadge" in self.navigator) await self.navigator.clearAppBadge();
      } catch (_) {}
    })());
  }
});
