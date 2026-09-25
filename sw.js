const CACHE = "keiko-v575";
const SHELL = ["./", "./index.html", "./app.js", "./howler.min.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      /* Чистим ТОЛЬКО прошлые версии оболочки (keiko-v*). Всё остальное —
         обложки, звуки, записи собственной игры — данные пользователя и
         обновление их не касается. Записи вообще незаменимы. */
      .then((keys) => Promise.all(keys
        .filter((k) => k !== CACHE && /^keiko-v\d+$/.test(k))
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;        // GitHub API — только сеть
  if (url.pathname.endsWith("version.json")) return; // проверка версии — всегда из сети

  e.respondWith((async () => {
    /* 1. точное совпадение в кэше этой версии — отдаём сразу, не дожидаясь сети.
       Свежесть обеспечивает version.json: при новой версии придёт баннер
       обновления, а новый воркер скачает оболочку заново на установке — имя
       кэша меняется с каждым релизом.
       Фонового обновления копии здесь больше нет. Оно шло при КАЖДОМ
       попадании и с `cache: "reload"`, то есть мимо кэша браузера: каждый
       запуск приложения заново тянул app.js, index.html, howler и иконки —
       больше четырёхсот килобайт, ради файлов, которые не могли измениться
       без смены имени кэша. На телефоне это отъедало канал ровно в те
       секунды, когда качается гист с настоящими данными.
       Ищем только в своём кэше, а не во всех: рядом лежат обложки, звук и
       записи игры, и чужая запись по тому же адресу подменяла бы оболочку. */
    const box = await caches.open(CACHE);
    const hit = await box.match(e.request);
    if (hit) return hit;

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
