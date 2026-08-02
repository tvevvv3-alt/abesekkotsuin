// 阿部接骨院 院内システム：Webプッシュ用サービスワーカー
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// 未読カウンタは IndexedDB に保持（SWが止まっても消えない）
function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("abe-badge", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function getCount() {
  try {
    const db = await openDB();
    return await new Promise((res) => {
      const req = db.transaction("kv", "readonly").objectStore("kv").get("count");
      req.onsuccess = () => res(Number(req.result) || 0);
      req.onerror = () => res(0);
    });
  } catch { return 0; }
}
async function setCount(n) {
  try {
    const db = await openDB();
    await new Promise((res) => {
      const req = db.transaction("kv", "readwrite").objectStore("kv").put(n, "count");
      req.onsuccess = () => res();
      req.onerror = () => res();
    });
  } catch {}
}
function applyBadge(n) {
  try {
    if (self.navigator && "setAppBadge" in self.navigator) {
      if (n > 0) return self.navigator.setAppBadge(n);
      return self.navigator.clearAppBadge();
    }
  } catch {}
  return Promise.resolve();
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
        data: { url: data.url || "/admin" },
      });
      const n = (await getCount()) + 1;
      await setCount(n);
      await applyBadge(n);
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/admin";
  event.waitUntil((async () => {
    await setCount(0);
    await applyBadge(0);
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (c.url.includes("/admin") && "focus" in c) return c.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});

// 画面（アプリ）を開いたら未読をクリア
self.addEventListener("message", (event) => {
  if (event.data === "clear-badge") {
    event.waitUntil((async () => {
      await setCount(0);
      await applyBadge(0);
      try {
        const notes = await self.registration.getNotifications();
        notes.forEach((nt) => nt.close());
      } catch {}
    })());
  }
});
