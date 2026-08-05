const CACHE = "keiko-v14";
const SHELL = ["./", "./index.html", "./app.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      // чистим только прошлые версии оболочки: обложки лежат отдельно и переживают обновление
      .then((keys) => Promise.all(keys
        .filter((k) => k !== CACHE && !k.startsWith("keiko-covers"))
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;        // GitHub API — только сеть
  if (url.pathname.endsWith("version.json")) return; // проверка версии — всегда из сети

  e.respondWith((async () => {
    // 1. точное совпадение в кэше — отдаём сразу, не дожидаясь сети.
    //    Свежесть обеспечивает version.json: при новой версии придёт баннер обновления
    const hit = await caches.match(e.request);
    if (hit) {
      // тихо обновляем копию в фоне, ответ пользователю уже ушёл
      fetch(new Request(e.request.url, { cache: "reload", credentials: "same-origin" }))
        .then((r) => { if (r && r.ok) caches.open(CACHE).then((c) => c.put(e.request, r)); })
        .catch(() => {});
      return hit;
    }

    // 2. в кэше нет (например, новая метка версии) — идём в сеть
    try {
      const r = await fetch(new Request(e.request.url, { cache: "reload", credentials: "same-origin" }));
      if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return r;
    } catch {
      // 3. сети нет — ищем в кэше, не глядя на ?v=…
      const any = await caches.match(e.request, { ignoreSearch: true });
      if (any) return any;
      if (e.request.mode === "navigate") {
        const page = await caches.match("./index.html", { ignoreSearch: true });
        if (page) return page;
      }
      return Response.error();
    }
  })());
});
