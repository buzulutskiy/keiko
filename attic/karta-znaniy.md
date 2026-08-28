# Карта знаний — в архиве

Колесо-таксономия: круговая карта областей знания, по которой прочитанные книги
раскладывались листьями. Открывалась с Полки и из настроек, рисовалась на канвасе,
листалась внутрь по секторам с анимацией и хлебными крошками.

**Убрана 28 августа 2026 года** — не потому что сломалась, а потому что не понадобилась:
за всё время один заход. Работала исправно, код цел и лежит здесь целиком.

Данные её живут в каталожном гисте `8a3a280b21390e3b32569913f9f3cabe` — файлы
`keiko-taxonomy.json` (скелет: области и подобласти) и `keiko-categories.json`
(привязка id материала к коду листа). Их не трогали: карта вернётся к готовым данным.

Точная версия до удаления — коммит перед тем, где в сообщении «Карта знаний в архив».

## Как вернуть

Пять вставок, все — обратно на свои места.

1. `app.js`, рядом с `LS_PRAC` и `PRACTICE_DATA` — объявления и чтение из хранилища.
2. `app.js`, в `applyPractice` (тогда она звалась `applyTaxonomy`) — чтение обоих файлов.
3. `app.js`, `renderShelf` — кнопка на Полке и её привязка.
4. `app.js`, `SETTINGS_SECS` и обработчик `[data-sec]` — пункт настроек.
5. `app.js`, самый конец файла, перед `init()` — сам модуль.
6. `index.html` — стили и разметка оверлея.

И вернуть три ссылки, которые при удалении подчистили:
`sheetOpen()` учитывал открытый `#kmap`; `coversArrived()` перерисовывал карту, когда
доезжали обложки; `COVER_BOX` содержал `.km-cover`.

---

## 1. Данные (app.js, рядом с PRACTICE_DATA)

```js
// Карта знаний: скелет (taxonomy) и привязка id материала → код листа (categories) —
// живут в том же каталожном гисте отдельными файлами, читаются вместе с каталогом.
const LS_TAX = "keiko-taxonomy-v1";
const TAX_FILE = "keiko-taxonomy.json";
const PRAC_FILE = "keiko-practice.json";
const LS_PRAC = "keiko-practice-data-v1";
const CATS_FILE = "keiko-categories.json";
let TAXONOMY = null, CATEGORIES = {};
```

```js
try {
  const t = JSON.parse(localStorage.getItem(LS_TAX) || "{}") || {};
  if (t.taxonomy) TAXONOMY = t.taxonomy;
  if (t.categories) CATEGORIES = t.categories;
} catch {}

```

## 2. Чтение из гиста (app.js, внутри applyTaxonomy)

```js
    const tax = await readFile(TAX_FILE);
    const cats = await readFile(CATS_FILE);
    if (tax) TAXONOMY = tax;
    if (cats && cats.byId) CATEGORIES = cats.byId;
    if (tax || cats) localStorage.setItem(LS_TAX, JSON.stringify({ taxonomy: TAXONOMY, categories: CATEGORIES }));
```

## 3. Кнопка на Полке (app.js, renderShelf)

```js
    <button class="btn km-open" id="shelfMap" type="button">◍ Карта знаний</button>
```

```js
  const mapBtn = $("#shelfMap");
  if (mapBtn) mapBtn.addEventListener("click", openKnowledgeMap);
```

## 4. Пункт настроек (app.js)

```js
  { id: "kmap",      icon: "◍", name: "Карта знаний", hint: () => "что уже узнал" },
```

```js
      // карта знаний — оверлей, отдельный экран ей не нужен
      if (b.dataset.sec === "kmap") { openKnowledgeMap(); return; }
```

## 5. Модуль (app.js, перед init)

```js
/* ══════════════ Карта знаний — оверлей над Полкой ══════════════
   Данные: скелет TAXONOMY + привязка CATEGORIES (оба из гиста) + завершённые
   материалы из архива. Логика перенесена из утверждённого макета.
   Всё в IIFE — имена render/count/card/go/back совпадают с приложением. */
(function () {
  const stage = document.getElementById("kmStage");
  const cv = document.getElementById("kmCanvas");
  if (!stage || !cv) return;
  const ctx = cv.getContext("2d");
  let W = 0, H = 0, sheetH = 0, MAP = null, path = [], anim = null, hitZones = [];

  const count = (n) => n.sub ? n.sub.reduce((s, x) => s + count(x), 0) : n.books.length;
  const nodeAt = (p) => p.reduce((n, i) => n.sub[i], MAP);
  const ease = (t) => 1 - Math.pow(1 - t, 3);

  function buildTree() {
    const clone = (n) => {
      const node = { name: n.name, code: n.code };
      if (n.sub) node.sub = n.sub.map(clone); else node.books = [];
      return node;
    };
    const root = { name: (TAXONOMY && TAXONOMY.root) || "Всё знание",
      sub: ((TAXONOMY && TAXONOMY.areas) || []).map(clone) };
    const byCode = {};
    const idx = (n) => { if (n.sub) n.sub.forEach(idx); else byCode[n.code] = n; };
    root.sub.forEach(idx);
    for (const a of shelfItems()) {
      const code = CATEGORIES[a.srcId] || CATEGORIES[a.id];
      const leaf = code && byCode[code];
      if (leaf) leaf.books.push(a);   // кладём саму запись полки — обложку рисуем ею же
    }
    return root;
  }

  function size() {
    const r = stage.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 3);
    W = r.width; H = r.height; sheetH = Math.min(H * 0.44, 380);
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
  }
  const cx = () => W / 2;
  const cy = () => (H - sheetH) / 2;
  const R = () => Math.max(60, Math.min(W * 0.45, (H - sheetH) / 2 - 12));

  const layoutOf = (node) => node.sub.map((child, i) => ({
    child, i,
    a0: (i / node.sub.length) * 6.283 - 1.5708,
    a1: ((i + 1) / node.sub.length) * 6.283 - 1.5708
  }));

  function drawSector(s, scale, alpha) {
    const x = cx(), y = cy(), R0 = R() * scale, node = s.child, c = count(node), pad = 0.01;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, R0, s.a0 + pad, s.a1 - pad); ctx.closePath();
    ctx.fillStyle = c ? `rgba(255, 214, 150, ${0.035 * alpha})` : `rgba(140, 150, 190, ${0.03 * alpha})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.07 * alpha})`; ctx.lineWidth = 0.8; ctx.stroke();
    if (c) {
      const grow = Math.min(1, Math.sqrt(c) / Math.sqrt(16)), r = R0 * (0.2 + 0.8 * grow);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, s.a0 + pad, s.a1 - pad); ctx.closePath();
      const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
      g.addColorStop(0, `rgba(255, 224, 168, ${0.14 * alpha})`);
      g.addColorStop(1, `rgba(255, 190, 118, ${(0.22 + 0.28 * grow) * alpha})`);
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = `rgba(255, 220, 170, ${0.28 * alpha})`; ctx.lineWidth = 0.9; ctx.stroke();
    }
    if (alpha > 0.5 && (s.a1 - s.a0) > 0.2) {
      const mid = (s.a0 + s.a1) / 2, flip = Math.cos(mid) < 0, innerR = R0 * 0.34;
      ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.rotate(flip ? mid + Math.PI : mid);
      ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 5;
      ctx.fillStyle = c ? "rgba(248, 244, 255, 0.9)" : "rgba(158, 166, 198, 0.55)";
      ctx.font = `${c ? 450 : 400} 10px -apple-system, sans-serif`;
      ctx.textBaseline = "middle"; ctx.textAlign = flip ? "right" : "left";
      let text = node.name; const maxW = R0 * 0.9 - innerR;
      while (ctx.measureText(text).width > maxW && text.length > 5) text = text.slice(0, -2) + "…";
      ctx.fillText(text, (flip ? -1 : 1) * innerR, 0); ctx.restore();
    }
  }
  const paint = (list, scale, alpha) => { for (const s of list) drawSector(s, scale, alpha); };

  function render() {
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createRadialGradient(W / 2, cy(), 0, W / 2, cy(), W);
    bg.addColorStop(0, "#0d0a1a"); bg.addColorStop(1, "#05040a");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const node = nodeAt(path), target = layoutOf(node);
    if (anim) {
      const t = ease(Math.min(1, anim.t));
      paint(anim.fromList.map(s => ({ ...s })), 1 + t * (anim.dir > 0 ? 0.55 : -0.3), (1 - t) * 0.9);
      const grow = anim.fromSlice;
      paint(target.map(s => ({ child: s.child, i: s.i,
        a0: grow.a0 + (s.a0 - grow.a0) * t, a1: grow.a1 + (s.a1 - grow.a1) * t })), 0.72 + 0.28 * t, t);
    } else { paint(target, 1, 1); hitZones = target; }
    const x = cx(), y = cy();
    ctx.beginPath(); ctx.arc(x, y, R() * 0.13, 0, 6.283);
    ctx.fillStyle = "#0a0813"; ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.stroke();
    if (path.length) {
      ctx.fillStyle = "rgba(255, 201, 77, 0.75)"; ctx.font = "600 13px -apple-system, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("‹", x, y);
    }
    crumbs(); card();
  }

  // анимация на таймере, а не на rAF — чтобы шла и когда вкладка не перерисовывается
  let animTimer = 0;
  function startAnim() {
    clearInterval(animTimer);
    animTimer = setInterval(() => {
      if (!anim) { clearInterval(animTimer); return; }
      anim.t += 0.06;
      if (anim.t >= 1) { anim = null; clearInterval(animTimer); render(); return; }
      render();
    }, 16);
  }
  function go(i) {
    const from = layoutOf(nodeAt(path)), slice = from.find(s => s.i === i);
    if (!nodeAt([...path, i]).sub) { scrollToSection(i); return; }
    anim = { fromList: from, fromSlice: slice, t: 0, dir: 1 };
    path = [...path, i]; startAnim();
  }
  function back() {
    if (!path.length) return;
    const wasIdx = path[path.length - 1];
    path = path.slice(0, -1);
    const slice = layoutOf(nodeAt(path)).find(s => s.i === wasIdx);
    anim = { fromList: layoutOf(nodeAt([...path, wasIdx])), fromSlice: slice, t: 0, dir: -1 };
    startAnim();
  }

  function crumbs() {
    const box = document.getElementById("kmCrumbs");
    box.innerHTML = "";
    const mk = (text, at) => {
      const btn = document.createElement("button");
      btn.type = "button"; btn.textContent = text;
      btn.addEventListener("click", () => { while (path.length > at) back(); });
      return btn;
    };
    box.appendChild(mk("Всё знание", 0));
    path.forEach((idx, k) => {
      const sep = document.createElement("span"); sep.className = "sep"; sep.textContent = "›"; box.appendChild(sep);
      const name = nodeAt(path.slice(0, k + 1)).name;
      if (k === path.length - 1) {
        const here = document.createElement("span"); here.className = "here"; here.textContent = name; box.appendChild(here);
      } else box.appendChild(mk(name, k + 1));
    });
  }

  function card() {
    const node = nodeAt(path), sheet = document.getElementById("kmSheet");
    sheet.innerHTML = "";
    const groups = [];
    (node.sub || []).forEach((child, ci) => {
      const walk = (n, title) => {
        if (!n.sub) { if (n.books.length) groups.push({ ci, title, books: n.books }); return; }
        n.sub.forEach(g => walk(g, title ? title + " · " + g.name : g.name));
      };
      walk(child, child.name);
    });
    for (const { ci, title, books } of groups) {
      const cap = document.createElement("div");
      cap.className = "km-group"; cap.textContent = title; cap.dataset.sec = ci;
      sheet.appendChild(cap);
      const shelf = document.createElement("div");
      shelf.className = "km-shelf"; shelf.dataset.sec = ci;
      // обложка ровно та же, что на Полке — одна функция на всё приложение
      shelf.innerHTML = books.map(a => `<div class="km-item">${shelfCoverHTML(a)}</div>`).join("");
      sheet.appendChild(shelf);
    }
    const empty = (node.sub || []).map((s, i) => [s, i]).filter(([s]) => !count(s));
    if (empty.length) {
      const cap = document.createElement("div");
      cap.className = "km-group";
      cap.textContent = groups.length ? "Сюда вы ещё не заходили" : "Здесь пока пусто";
      sheet.appendChild(cap);
      const rows = document.createElement("div"); rows.className = "km-rows";
      empty.forEach(([s, i]) => {
        const d = document.createElement("div"); d.className = "faint"; d.dataset.sec = i;
        const b = document.createElement("b"); b.textContent = s.name; d.appendChild(b);
        rows.appendChild(d);
      });
      sheet.appendChild(rows);
    }
  }

  let scrollTimer = 0;
  function scrollToSection(i) {
    const sheet = document.getElementById("kmSheet");
    const el = sheet.querySelector(`[data-sec="${i}"]`);
    if (!el) return;
    const to = Math.max(0, Math.min(el.offsetTop - 12, sheet.scrollHeight - sheet.clientHeight));
    const from = sheet.scrollTop, dist = to - from, t0 = Date.now();
    clearInterval(scrollTimer);
    scrollTimer = setInterval(() => {
      const k = Math.min(1, (Date.now() - t0) / 420);
      sheet.scrollTop = from + dist * (1 - Math.pow(1 - k, 3));
      if (k >= 1) clearInterval(scrollTimer);
    }, 16);
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  }

  cv.addEventListener("click", (e) => {
    if (anim) return;
    const r = stage.getBoundingClientRect();
    const x = e.clientX - r.left - cx(), y = e.clientY - r.top - cy(), d = Math.hypot(x, y);
    if (d < R() * 0.14) { back(); return; }
    if (d > R()) return;
    const ang = Math.atan2(y, x);
    const hit = hitZones.find(s => { let a = ang; if (a < s.a0) a += 6.283; return a >= s.a0 && a <= s.a1; });
    if (hit) go(hit.i);
  });
  window.addEventListener("resize", () => { const ov = document.getElementById("kmap"); if (ov && !ov.hidden) size(); });

  // подтянуть свежие taxonomy+categories и перестроить карту, если она открыта
  function refreshFromGist() {
    catalogPull(true).then(() => {
      const ov = document.getElementById("kmap");
      if (ov && !ov.hidden) { MAP = buildTree(); render(); }
    }).catch(() => {});
  }

  window.openKnowledgeMap = function () {
    useMark("карта-знаний");
    if (!data) return;
    if (!TAXONOMY) { toast("Карта ещё грузится — попробуй через миг"); refreshFromGist(); return; }
    MAP = buildTree(); path = []; anim = null;
    const ov = document.getElementById("kmap");
    ov.hidden = false; ov.setAttribute("aria-hidden", "false");
    document.body.classList.add("km-on");
    setTimeout(size, 0);
    refreshFromGist();   // категории кэшируются на 24ч — освежаем при каждом открытии
  };
  window.closeKnowledgeMap = function () {
    const ov = document.getElementById("kmap");
    if (ov) { ov.hidden = true; ov.setAttribute("aria-hidden", "true"); }
    document.body.classList.remove("km-on");
    clearInterval(animTimer); clearInterval(scrollTimer); anim = null;
  };
  // перерисовать открытую карту после прихода свежих данных или обложек
  window.refreshKnowledgeMap = function () {
    const ov = document.getElementById("kmap");
    if (!ov || ov.hidden || !TAXONOMY || !data) return;
    MAP = buildTree();
    if (path.length && !nodeAt([]).sub.length) path = [];
    render();
  };
  const closeBtn = document.getElementById("kmClose");
  if (closeBtn) closeBtn.addEventListener("click", window.closeKnowledgeMap);
  // системная «назад» и Esc закрывают карту, а не выкидывают из приложения
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const ov = document.getElementById("kmap");
    if (ov && !ov.hidden) { e.preventDefault(); path.length ? back() : window.closeKnowledgeMap(); }
  });
})();
```

## 6. Разметка (index.html, перед `#gmap`)

```html
  <div id="kmap" hidden aria-hidden="true">
    <div id="kmTop">
      <div id="kmCrumbs"></div>
      <button id="kmClose" type="button" aria-label="Закрыть">✕</button>
    </div>
    <div id="kmStage">
      <canvas id="kmCanvas"></canvas>
      <div id="kmSheet"></div>
    </div>
  </div>
```

## 7. Стили (index.html)

```css
    /* ── Карта знаний ── */
    #kmap { position: fixed; inset: 0; z-index: 60; background: #08060f; display: flex; flex-direction: column; }
    #kmap[hidden] { display: none; }
    #kmTop { display: flex; align-items: center; gap: 10px; padding: calc(env(safe-area-inset-top, 0px) + 12px) 16px 8px; }
    #kmCrumbs { flex: 1; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 0.9rem; min-width: 0; }
    #kmCrumbs button { background: none; border: 0; color: var(--gold); font: inherit; cursor: pointer; padding: 0; }
    #kmCrumbs .sep { color: var(--dim); }
    #kmCrumbs .here { color: var(--ink); font-weight: 700; }
    #kmClose { background: var(--glass); border: 1px solid var(--glass-line); color: var(--ink); width: 34px; height: 34px; border-radius: 50%; font-size: 1rem; cursor: pointer; flex: 0 0 auto; }
    #kmStage { position: relative; flex: 1; overflow: hidden; }
    #kmCanvas { position: absolute; inset: 0; width: 100%; height: 100%; }
    #kmSheet { position: absolute; left: 0; right: 0; bottom: 0; max-height: 44%; overflow-y: auto; background: var(--sheet); backdrop-filter: blur(26px) saturate(1.5); -webkit-backdrop-filter: blur(26px) saturate(1.5); border-top: 1px solid var(--glass-line); border-radius: 22px 22px 0 0; padding: 14px 16px calc(env(safe-area-inset-bottom, 0px) + 20px); }
    #kmSheet .km-group { margin-top: 16px; font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--dim); transition: color 0.5s ease; }
    #kmSheet .km-group:first-child { margin-top: 2px; }
    #kmSheet .km-group.flash { color: var(--gold); }
    /* обложки те же, что на Полке (.cover) — здесь только раскладка в три колонки.
       На Полке высота задана рядом, а в сетке её задавать нечему: поэтому ширину
       тянем на колонку, а высоту отдаём пропорции — иначе обложка сплющивается. */
    #kmSheet .km-shelf { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px 10px; margin-top: 10px; align-items: start; }
    #kmSheet .km-item .cover,
    #kmSheet .km-item .shelf-cover.photo { width: 100%; height: auto; }
    #kmSheet .km-rows { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 11px; }
    #kmSheet .km-rows div { font-size: 0.78rem; padding: 3px 10px; border-radius: 20px; border: 1px dashed rgba(255, 255, 255, 0.1); transition: color 0.5s ease, border-color 0.5s ease; }
    #kmSheet .km-rows div b { font-weight: 400; color: var(--dim); }
    #kmSheet .km-rows div.flash, #kmSheet .km-rows div.flash b { color: var(--gold); border-color: rgba(255, 201, 77, 0.45); }
    .km-open { color: var(--gold); border-color: rgba(255, 201, 77, 0.3); margin-bottom: 12px; }
```

```css
    body.km-on { overflow: hidden; }
```
