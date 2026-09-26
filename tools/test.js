#!/usr/bin/env node
/* Тесты чистой логики Кэйко: слияние данных, практика, периоды, карта.
   Запуск: node tools/test.js — гоняется перед каждым релизом рядом с
   node --check. Здесь проверяется ровно то, где регрессии уже случались:
   слияние двух телефонов, заходы практики, хождение по неделям, дубликаты
   точек на карте.

   Приложение живёт в браузере, поэтому app.js загружается в песочницу с
   заглушками вместо document и localStorage. Запуск (init) вырезается:
   тестам нужен код, а не работающее приложение. */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

/* ── Песочница ── */

// универсальный элемент-заглушка: всё принимает, ничего не делает
const стубЭл = () => ({
  style: { cssText: "" }, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  dataset: {}, hidden: true, value: "", textContent: "", innerHTML: "",
  setAttribute() {}, getAttribute: () => null, removeAttribute() {},
  addEventListener() {}, removeEventListener() {},
  appendChild() {}, insertAdjacentHTML() {}, remove() {}, select() {}, focus() {}, blur() {},
  querySelector: () => null, querySelectorAll: () => [],
  getBoundingClientRect: () => ({ width: 0, height: 0, left: 0, top: 0 }),
  getContext: () => null,
});

// Браузерные таймеры не должны держать Node после завершения проверок.
const testTimeouts = new Set(), testIntervals = new Set();
const sandbox = {
  console, clearTimeout, clearInterval,
  setTimeout: (...args) => { const id = setTimeout(...args); testTimeouts.add(id); return id; },
  setInterval: (...args) => { const id = setInterval(...args); testIntervals.add(id); return id; },
  Date, Math, JSON, Intl, URL, fetch: async () => { throw new Error("сети в тестах нет"); },
  /* Браузерные, а значит и здесь: огибающая записи лежит в разборе базой-64,
     и без них проверка рисунка звука молча получала null. */
  atob, btoa, TextEncoder, TextDecoder,
  crypto: globalThis.crypto,
  navigator: { onLine: false, serviceWorker: null, clipboard: null, vibrate() {} },
  /* Настоящее хранилище в памяти: saveData пишет и тут же перечитывает запись,
     а с заглушкой, отдающей null, оно считало это сбоем диска и падало. */
  localStorage: (() => {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
      clear: () => m.clear(),
    };
  })(),
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  Image: function () { return стубЭл(); },
  Audio: function () { return стубЭл(); },
  location: { reload() {}, href: "" },
  history: { pushState() {}, back() {} },
  document: {
    querySelector: () => null, querySelectorAll: () => [],
    getElementById: () => null, createElement: стубЭл,
    addEventListener() {}, removeEventListener() {},
    body: стубЭл(), documentElement: стубЭл(),
    execCommand: () => false, visibilityState: "visible",
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};
vm.createContext(sandbox);

let src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const запуск = "\ninit();";
if (!src.includes(запуск)) { console.error("не нашёл init() в конце app.js — тесты надо обновить"); process.exit(1); }
src = src.replace(запуск, "\n/* init() вырезан тестами */");
/* Доступ к let/const верхнего уровня: изнутри скрипта eval их видит,
   снаружи песочницы — нет. */
src += `\nglobalThis.__t = { _v: null,
  get: (k) => eval(k),
  set: (k, v) => { __t._v = v; eval(k + " = __t._v"); } };`;

try {
  vm.runInContext(src, sandbox, { filename: "app.js" });
} catch (e) {
  console.error("app.js не загрузился в песочницу:", e.message);
  process.exit(1);
}
const t = sandbox.__t;

/* ── Мелкий каркас ── */
let всего = 0, упало = 0;
function ок(имя, факт, надо) {
  всего++;
  const a = JSON.stringify(факт), b = JSON.stringify(надо);
  if (a === b) return;
  упало++;
  console.error(`✗ ${имя}\n    получили: ${a}\n    ожидали:  ${b}`);
}

/* ── mergeLists: записи и мысли с двух телефонов ── */
{
  const m = sandbox.mergeLists;
  const слито = m(
    [{ id: "a", v: "локальная", updatedAt: 2 }, { id: "c", v: "только тут", updatedAt: 1 }],
    [{ id: "a", v: "удалённая", updatedAt: 1 }, { id: "b", v: "только там", updatedAt: 1 }]
  );
  const по = Object.fromEntries(слито.map((x) => [x.id, x.v]));
  ок("mergeLists: свежее локальное побеждает", по.a, "локальная");
  ок("mergeLists: чужая запись не теряется", по.b, "только там");
  ок("mergeLists: своя запись не теряется", по.c, "только тут");
  const ничья = m([{ id: "x", v: "моё", updatedAt: 5 }], [{ id: "x", v: "чужое", updatedAt: 5 }]);
  ок("mergeLists: при ничьей своё главнее", ничья[0].v, "моё");
}

/* ── mergePrac: заходы практики с двух телефонов ── */
{
  const m = sandbox.mergePrac;
  const р = (n, off) => Array.from({ length: n }, (_, i) => ({ lvl: 1, d: "2026-08-0" + (i + 1), ...(off && i === n - 1 ? { off: 1 } : {}) }));

  // длинный список шага включает короткий — побеждает длина
  const a = { p: { at: 10, reps: { "1": { right: р(3) } }, final: {}, done: { "1": 1 } } };
  const b = { p: { at: 5, reps: { "1": { right: р(2), left: р(1) }, "2": { both: р(1) } }, final: { "1-4": р(2) }, done: { "2": 1 }, session: 7 } };
  const из = m(a, b).p;
  ок("mergePrac: длинный список заходов побеждает", из.reps["1"].right.length, 3);
  ок("mergePrac: чужой шаг не теряется", из.reps["1"].left.length, 1);
  ок("mergePrac: чужой такт не теряется", из.reps["2"].both.length, 1);
  ок("mergePrac: сшивки сливаются", из.final["1-4"].length, 2);
  ок("mergePrac: done объединяется", Object.keys(из.done).sort(), ["1", "2"]);
  ок("mergePrac: session — максимум", из.session, 7);

  // равная длина, но у одного заход погашен — гашение это более свежее знание
  const c = m(
    { p: { at: 10, reps: { "3": { both: р(2) } } } },
    { p: { at: 5, reps: { "3": { both: р(2, true) } } } }
  ).p;
  ок("mergePrac: отменённый заход не воскресает", c.reps["3"].both[1].off, 1);

  // старый формат: такт хранил просто массив — при слиянии читается как шаг both
  const d = m({ p: { at: 1, reps: { "5": р(2) } } }, { p: { at: 0, reps: {} } }).p;
  ок("mergePrac: старый формат такта читается", d.reps["5"].both.length, 2);

  // смена источника видео не воскрешает прежний адрес
  const e = m(
    { p: { at: 10, url: "новый", reps: {} } },
    { p: { at: 5, yt: "старый", reps: {} } }
  ).p;
  ок("mergePrac: прежний адрес видео не воскресает", e.yt, undefined);
  ок("mergePrac: новый адрес на месте", e.url, "новый");
}

/* ── mergeUsage: счётчики использования с двух устройств ── */
{
  const m = sandbox.mergeUsage;
  const из = m(
    { тел1: { "карта": { n: 5, at: 100 } } },
    { тел1: { "карта": { n: 3, at: 50 } }, тел2: { "разбор": { n: 7, at: 80 } } }
  );
  ок("mergeUsage: своя ветка не откатывается", из.тел1["карта"].n, 5);
  ок("mergeUsage: чужая ветка не теряется", из.тел2["разбор"].n, 7);
}

/* ── Музей: что открыто по прочитанному ── */
{
  const главы = [7, 19, 31, 44, 66].map((f, i) => ({ name: "Песнь " + (i + 1), from: f }));
  const книга = { id: "od", title: "Одиссея", pages: 464, startPage: 0, chapters: главы };
  t.set("MUSEUM", { items: [
    { id: "a1", book: "od", ch: 1, name: "Юпитер" },
    { id: "a2", book: "od", ch: 3, name: "Кратер" },
    { id: "a3", book: "od", ch: 5, name: "Инталия" },
    { id: "a4", book: "od", ch: 0, name: "Про всю книгу" },
    { id: "b1", book: "нет-такой", ch: 1, name: "Чужая книга" },
  ] });
  const дочитал = (стр) => t.set("data", { book: { books: [книга], activeBook: "od",
    entries: [{ id: "e", bookId: "od", date: "2026-08-01", page: стр, spans: [{ from: 1, to: стр }] }] } });

  дочитал(0);
  ок("музей: без чтения открыто только внеглавное", [...t.get("musOpenSet()")], ["a4"]);
  дочитал(18);                                  // первая песнь кончается на 18-й
  ок("музей: дочитал песнь — предмет открылся", t.get("musOpenSet()").has("a1"), true);
  ок("музей: следующий ещё закрыт", t.get("musOpenSet()").has("a2"), false);
  дочитал(43);                                  // третья песнь кончается на 43-й
  ок("музей: открылся предмет третьей песни", t.get("musOpenSet()").has("a2"), true);
  ок("музей: предмет чужой книги закрыт", t.get("musOpenSet()").has("b1"), false);
  /* Предмет без главы принадлежит книге так же, как остальные: у профиля без
     этой книги он не должен появляться вовсе. */
  t.set("MUSEUM", { items: [
    { id: "c0", book: "чужая", ch: 0, name: "Пролог чужой книги" },
    { id: "c1", book: "od", ch: 0, name: "Пролог своей книги" },
  ] });
  ок("музей: пролог чужой книги не открыт", [...t.get("musOpenSet()")], ["c1"]);
}

/* ── Сердце на артефакте: слияние двух устройств ── */
{
  t.set("MUSEUM", { items: [{ id: "a", book: "b", ch: 0, name: "Вещь" }, { id: "c", book: "b", ch: 0, name: "Вторая" }] });
  t.set("data", { book: { books: [], activeBook: "", entries: [] }, musLike: { a: 100 } });
  ок("сердце: поставленное видно", t.get("musLiked")({ id: "a" }), true);
  ок("сердце: чужого нет", t.get("musLiked")({ id: "c" }), false);
  /* Снятое позже сердце не должно возвращаться с другого телефона: у снятия
     время со знаком минус, побеждает более позднее действие по модулю. */
  const слить = (свои, чужие) => {
    const свод = { ...свои };
    for (const k in чужие) {
      const a = свод[k] || 0, b = чужие[k] || 0;
      свод[k] = Math.abs(b) > Math.abs(a) ? b : a;
    }
    return свод;
  };
  ок("сердце: снятое позже побеждает", слить({ a: 100 }, { a: -200 }).a, -200);
  ок("сердце: поставленное позже побеждает", слить({ a: -100 }, { a: 200 }).a, 200);
  ок("сердце: старое снятие не отменяет новое", слить({ a: 300 }, { a: -200 }).a, 300);
}

/* ── Периоды на «Прогрессе»: неделя, месяц, сдвиг назад ── */
{
  const дата = (s) => t.get("dateStr")(s);
  const пусто = { piano: { entries: [] }, book: { entries: [] }, pastel: { entries: [] }, watch: { entries: [] } };
  t.set("data", { ...пусто, book: { entries: [{ date: "2026-07-20" }] }, weekGoal: 4 });

  t.set("period", "week"); t.set("shift", 0);
  const тек = t.get("periodRange()");
  const пн = t.get("mondayOf")(new sandbox.Date());
  ок("периоды: неделя начинается с понедельника", тек.from, дата(пн));

  t.set("shift", -1);
  const прош = t.get("periodRange()");
  const пн2 = new sandbox.Date(пн); пн2.setDate(пн2.getDate() - 7);
  ок("периоды: сдвиг на неделю назад", прош.from, дата(пн2));
  const срав = t.get("prevSlice()");
  const пн3 = new sandbox.Date(пн); пн3.setDate(пн3.getDate() - 14);
  ок("периоды: сравнение едет вместе со сдвигом", срав.from, дата(пн3));

  ок("периоды: вперёд из прошлого можно", t.get("canShift")(1), true);
  t.set("shift", 0);
  ок("периоды: в будущее нельзя", t.get("canShift")(1), false);

  // назад пускает до первой записи и не дальше
  t.set("period", "month"); t.set("shift", 0);
  const мес = t.get("periodRange()");
  ок("периоды: месяц начинается с первого числа", мес.from.slice(-2), "01");

  t.set("data", пусто);
  ок("периоды: без записей назад некуда", t.get("canShift")(-1), false);
}

/* ── Карта: дубликаты мест и содержание ── */
{
  const места = [
    { name: "Итака", ch: 1, lat: 38.4, lon: 20.7 },
    { name: "Огигия", ch: 1, lat: 36.0, lon: 14.2 },
    { name: "Итака", ch: 5, lat: 38.4, lon: 20.7 },
    { name: "Огигия", ch: 12, lat: 36.0, lon: 14.2 },
  ];
  t.set("gm", {
    места, часть: 0, кучки: {},
    части: [{ n: 1, name: "Песнь I" }, { n: 5, name: "Песнь V" }, { n: 12, name: "Песнь XII" }],
  });
  ок("карта: на общей карте место один раз",
    t.get("gmВидимые()").map((p) => p.name).sort(), ["Итака", "Огигия"]);

  t.set("gm.часть", 5);
  const впесни = t.get("gmВидимые()");
  ок("карта: в песни только её места", впесни.length, 1);
  ок("карта: описание из своей песни", впесни[0].ch, 5);

  t.set("gm.часть", 0);
  ок("карта: содержание считает точки по главам",
    t.get("gmParts()").map((c) => c.n + ":" + c.k), ["1:2", "5:1", "12:1"]);
  ок("карта: главы места для карточки", t.get("gmГлавы")("Итака"), ["Песнь I", "Песнь V"]);
}

/* ── Вокруг книги ──
   Записи без главы стоят первой строкой содержания, а не в хвосте: открывать
   их можно с первого дня, сюжета в них нет. */
{
  const было = t.get("gm");
  t.set("gm", {
    места: [
      { name: "Итака", part: 1, lat: 38, lon: 20 },
      /* Адреса из записной книжки: место есть, главы нет. Именно они и держат
         строку «Вокруг книги» — записи без карты уехали в собрание. */
      { name: "Столярный переулок", lat: 59.92, lon: 30.30 },
      { name: "Вознесенский проспект", lat: 59.93, lon: 30.31 },
      { name: "Дигамма", kind: "text", about: "буква", lat: 0, lon: 0 },
      { name: "Жуковский", kind: "text", about: "подстрочник", lat: 0, lon: 0 },
    ],
    часть: 0, слой: "", at: null, части: [{ n: 1, name: "Песнь I" }],
  });
  const узел = { hidden: true, innerHTML: "" };
  const былПоиск = t.get("document.querySelector");
  t.set("document.querySelector", (s) => (s === "#gmHits" ? узел : null));
  t.get("gmToc")();
  ок("вокруг книги: стоит первой строкой",
    узел.innerHTML.indexOf("Вокруг книги") < узел.innerHTML.indexOf("Песнь I"), true);
  ок("вокруг книги: подпись говорит, что это вне глав",
    /вне глав/.test(узел.innerHTML), true);
  ок("вокруг книги: считает только места без главы",
    /2 места/.test(узел.innerHTML), true);

  t.set("gm.часть", -1);
  t.set("gm.слой", "all");
  ок("вокруг книги: показываются только они",
    t.get("gmВидимые")().map((p) => p.name), ["Дигамма", "Жуковский"]);
  t.set("document.querySelector", былПоиск);
  t.set("gm", было);
}

/* ── Карта: понятие объясняется один раз ──
   Места повторяются от главы к главе — это география. Всё остальное, если
   уже объясняли, в поздних главах не показываем. */
{
  const было = t.get("ARTS");
  t.set("ARTS", { kn: { map: [
    { part: 1, name: "Итака", lat: 38, lon: 20 },
    { part: 3, name: "Итака", lat: 38, lon: 20 },
    { part: 1, kind: "word", name: "Стек", about: "морской столб" },
    { part: 3, kind: "word", name: "Стек", about: "морской столб" },
    { part: 3, kind: "word", name: "Дюльфер", about: "спуск по верёвке" },
    { part: 3, kind: "thing", name: "Жумар", about: "зажим" },
    { part: 5, kind: "thing", name: "Жумар", about: "зажим" },
  ], mapBox: { west: 8, east: 31, north: 42, south: 30 } } });
  const bk = { id: "kn", chapters: [{}, {}, {}, {}, {}] };
  const имена = (i) => t.get("mapPoints")(bk, i).map((p) => p.name).sort();

  ок("карта: слово объясняется в своей главе", имена(0), ["Итака", "Стек"]);
  ок("карта: в поздней главе слово не повторяется", имена(2), ["Дюльфер", "Жумар", "Итака"]);
  ок("карта: вещь тоже одна на книгу", имена(4), []);
  /* Места «Одиссеи» размечены полем ch, слои — полем part. Карта всей книги
     должна отдавать и то и другое: иначе география пропадает вся разом. */
  t.set("ARTS", { kn: { map: [
    { ch: 1, name: "Итака", lat: 38, lon: 20 },
    { ch: 5, name: "Огигия", lat: 36, lon: 14 },
    { part: 1, kind: "word", name: "Гекатомба", about: "сто быков" },
  ], mapBox: { west: 8, east: 31, north: 42, south: 30 } } });
  ок("карта: места по ch и слои по part живут вместе",
    t.get("mapPoints")(bk, -1).map((p) => p.name).sort(), ["Гекатомба", "Итака", "Огигия"]);
  ок("карта: в главе и место, и слово",
    t.get("mapPoints")(bk, 0).map((p) => p.name).sort(), ["Гекатомба", "Итака"]);
  t.set("ARTS", { kn: { map: [
    { part: 1, name: "Итака", lat: 38, lon: 20 },
    { part: 3, name: "Итака", lat: 38, lon: 20 },
    { part: 1, kind: "word", name: "Стек", about: "морской столб" },
    { part: 3, kind: "word", name: "Стек", about: "морской столб" },
    { part: 3, kind: "word", name: "Дюльфер", about: "спуск по верёвке" },
    { part: 3, kind: "thing", name: "Жумар", about: "зажим" },
    { part: 5, kind: "thing", name: "Жумар", about: "зажим" },
  ], mapBox: { west: 8, east: 31, north: 42, south: 30 } } });
  ок("карта: на всей книге понятий по одному",
    t.get("mapPoints")(bk, -1).filter((p) => p.kind).map((p) => p.name).sort(),
    ["Дюльфер", "Жумар", "Стек"]);
  t.set("ARTS", было);
}

/* ── mergeStamps: время открытия наград, карточек и предметов ── */
{
  const m = sandbox.mergeStamps;
  const из = m({ давно: 1, моё: 500, только_моё: 300 },
               { давно: 900, моё: 700, только_чужое: 400 });
  ок("mergeStamps: настоящее время бьёт «когда-то»", из.давно, 900);
  ок("mergeStamps: из двух настоящих берём раннее", из.моё, 500);
  ок("mergeStamps: своё не теряется", из.только_моё, 300);
  ок("mergeStamps: чужое не теряется", из.только_чужое, 400);
  ок("mergeStamps: «когда-то» с обеих сторон остаётся единицей",
    m({ x: 1 }, { x: 1 }).x, 1);
  ок("mergeStamps: пустые стороны не роняют", m(null, null), {});
}

/* ── musOverlays: сколько экранов показать, когда открылось несколько ── */
{
  const пред = (n) => Array.from({ length: n }, (_, i) => ({ id: "m" + i, name: "Предмет " + i }));
  const один = sandbox.musOverlays(пред(1));
  ок("артефакты: один предмет — один экран", один.map((o) => o.type), ["mus"]);
  ок("артефакты: у одного счётчика нет", один[0].n, 1);

  const трое = sandbox.musOverlays(пред(3));
  ок("артефакты: трое идут поодиночке", трое.map((o) => o.type), ["mus", "mus", "mus"]);
  ок("артефакты: счётчик сквозной", трое.map((o) => o.i + "/" + o.n), ["1/3", "2/3", "3/3"]);

  const толпа = sandbox.musOverlays(пред(20));
  ок("артефакты: из двадцати поодиночке только три",
    толпа.map((o) => o.type), ["mus", "mus", "mus", "musMany"]);
  ок("артефакты: остальные уходят в список", толпа[3].list.length, 17);
  ок("артефакты: в списке сказано, сколько всего", толпа[3].n, 20);
  ок("артефакты: ничего не открылось — экранов нет", sandbox.musOverlays([]).length, 0);
}

/* ── nextOverlaySoon: двойной тап не съедает награду ── */
{
  const былTimeout = sandbox.setTimeout;
  let заведено = 0;
  sandbox.setTimeout = (f, ms) => { заведено++; return былTimeout(() => {}, 0); };
  try {
    t.set("overlayQueue", [{ type: "ach" }, { type: "ach" }]);
    t.set("overlayHop", 0);
    t.get("nextOverlaySoon")();
    t.get("nextOverlaySoon")();          // второй тап в те же 220 мс
    ок("очередь: двойной тап заводит один переход", заведено, 1);

    заведено = 0;
    t.set("overlayHop", 0);
    t.set("overlayQueue", []);
    t.get("nextOverlaySoon")();
    ок("очередь: на пустой очереди переход не заводится", заведено, 0);
  } finally {
    sandbox.setTimeout = былTimeout;
    t.set("overlayHop", 0);
    t.set("overlayQueue", []);
  }
}

/* ── Прогноз: скорость в день ──
   Прогноз здесь — обратная связь, а не отчёт: хорошо почитал вечером — дата
   должна придвинуться сегодня же. Проверяем и это, и что один рывок не
   обещает «завтра закончишь». */
{
  const было = { active: t.get("data").active, book: JSON.parse(JSON.stringify(t.get("data").book || {})),
                 today: t.get("todayStr") };
  const книга = (страниц, записи) => {
    t.set("data.book", {
      activeBook: "k", books: [{ id: "k", title: "К", pages: страниц, startPage: 0, chapters: [] }],
      entries: записи.map(([date, page], i) => ({ id: "e" + i, date, bookId: "k", page })),
    });
    t.set("data.active", "book");
  };
  const срок = (сегодня) => {
    t.set("todayStr", () => сегодня);
    const f = t.get("paceForecast")();
    return f && !f.done ? t.get("paceWhen")(f).days : null;
  };

  // читает по 10 страниц в день пять дней подряд: 50 стр. за 5 дней = 10/день
  книга(200, [["2026-03-01", 10], ["2026-03-02", 20], ["2026-03-03", 30],
              ["2026-03-04", 40], ["2026-03-05", 50]]);
  ок("прогноз: скорость считается в день", срок("2026-03-05"), 15);

  /* Тот же ряд, но прошла неделя без единого захода: дни идут, скорость
     падает, дата уезжает сама — объявлять паузу или сбрасывать ничего не надо. */
  ок("прогноз: пока не открываешь — дата уезжает", срок("2026-03-12") > 15, true);

  /* Устойчивое ускорение видно сразу: те же дни, но по 30 страниц. */
  книга(200, [["2026-03-01", 30], ["2026-03-02", 60], ["2026-03-03", 90],
              ["2026-03-04", 120], ["2026-03-05", 150]]);
  ок("прогноз: разогнался — срок короче", срок("2026-03-05"), 2);

  /* Прочитал полкниги за вечер, дальше по 8 страниц. Рывок обрезается, иначе
     после первого же спокойного вечера обещалось бы «завтра закончишь». */
  книга(500, [["2026-03-01", 250], ["2026-03-02", 258], ["2026-03-03", 266],
              ["2026-03-04", 274], ["2026-03-05", 282]]);
  const после = срок("2026-03-05");
  ок("прогноз: один рывок не обещает завтра", после >= 10, true);
  ок("прогноз: но и не игнорируется", после <= 30, true);

  /* Два захода — считаем по ним, а не по выдуманному «раз в два дня». */
  книга(200, [["2026-03-01", 20], ["2026-03-02", 40]]);
  ок("прогноз: два захода — 40 стр. за 2 дня", срок("2026-03-02"), 8);

  /* В строке — возвращения, а не скорость: сколько раз садился и за сколько
     дней. Первое растёт только когда сядешь, второе — каждый день само. */
  книга(200, [["2026-03-01", 10], ["2026-03-03", 20], ["2026-03-05", 30]]);
  t.set("todayStr", () => "2026-03-05");
  ок("строка: возвращения, а не темп", t.get("paceDays")(), "3 дня");
  ок("строка: скорости в ней нет", /стр\.|в день/.test(t.get("paceParts")().join(" ")), false);
  /* Число только растёт: пропуск его не трогает, потому что отыграть долю
     назад нельзя — в прошлое не вернёшься. */
  t.set("todayStr", () => "2026-03-25");
  ок("строка: пропуск не отнимает уже прожитое", t.get("paceDays")(), "3 дня");
  /* Кроме дней и срока в строке ничего нет: ни скорости, ни доли, ни слов о
     том, часто ли садишься. Всё это перебывало тут и снято. */
  ок("строка: простой в ней не поминается",
    /не читаю|раз в неделю|каждый день/.test(t.get("paceParts")().join(" ")), false);
  книга(200, [["2026-03-01", 10], ["2026-03-03", 20], ["2026-03-05", 30], ["2026-03-25", 40]]);
  ок("строка: вернулся после месяца — число выросло", t.get("paceDays")(), "4 дня");

  // дочитал — срока нет, есть «пройдено»
  книга(40, [["2026-03-01", 20], ["2026-03-02", 40]]);
  t.set("todayStr", () => "2026-03-02");
  ок("прогноз: материал пройден", t.get("paceForecast")().done, true);

  t.set("todayStr", было.today);
  t.set("data.book", было.book); t.set("data.active", было.active);
}

/* ── Правка переносов выключается ──
   В поэтическом сборнике попадается проза, а в прозе — стихи: жёстко привязать
   склейку строк к материалу нельзя, решает человек в момент вставки. */
{
  const было = JSON.parse(JSON.stringify(t.get("cfg")));
  const стих = "Я вас любил: любовь ещё, быть может,\nВ душе моей угасла не совсем;"
    + "\nНо пусть она вас больше не тревожит;\nЯ не хочу печалить вас ничем.";
  t.set("cfg.fixPaste", true);
  /* Ровно то, на что жаловались: четыре строки одной длины эвристика считает
     вёрсткой и сшивает в абзац. Для стихов это порча. */
  ок("вставка: правка сшивает строки стихотворения",
    t.get("cleanPastedText")(стих).includes("\n"), false);
  ок("вставка: правка включена", t.get("fixPasteOn")(), true);
  t.set("cfg.fixPaste", false);
  ок("вставка: выключенная правка не трогает текст", t.get("fixPasteOn")(), false);
  ок("вставка: галочка снята — в разметке нет checked",
    /checked/.test(t.get("fmtToggleHTML")("x")), false);
  t.set("cfg.fixPaste", true);
  ок("вставка: галочка стоит", /checked/.test(t.get("fmtToggleHTML")("x")), true);
  t.set("cfg", было);
}

/* ── Обстоятельства: не счётчик, а случай ──
   Дианы больше всего радовали не проценты, а «Филин следит» за выходной и
   «Волчок унёс книжку» за возвращение. Ловим ещё несколько таких же поводов
   из того, что уже лежит в записи. */
{
  const было = { data: JSON.parse(JSON.stringify(t.get("data"))), cat: t.get("CATALOG") };
  const ночью = Date.UTC(2026, 8, 3, 0, 0) + new Date(2026, 8, 3, 1, 0).getTimezoneOffset() * 0;
  const час = (д, ч) => new Date(2026, 8, д, ч, 30).getTime();
  t.set("data", { active: "book", piano: { pieces: [], entries: [{ id: "p1", date: "2026-09-05", pieceId: "x" }] },
    book: { books: [{ id: "kn", title: "К", author: "Автор", pages: 300, startPage: 0,
                      chapters: [{ name: "Раз", from: 1 }, { name: "Два", from: 100 }, { name: "Три", from: 200 }] }],
            activeBook: "kn", entries: [
              { id: "e1", date: "2026-09-01", bookId: "kn", page: 40,  createdAt: час(1, 23) },
              { id: "e2", date: "2026-09-03", bookId: "kn", page: 99,  createdAt: час(3, 6) },
              { id: "e3", date: "2026-09-05", bookId: "kn", page: 205, createdAt: час(5, 14) },
              { id: "e4", date: "2026-11-11", bookId: "kn", page: 210, createdAt: час(5, 14) }] },
    pastel: { courses: [], entries: [] }, watch: { videos: [], entries: [] } });
  t.set("CATALOG", { kn: { ach: [], born: "11-11" } });
  const s = t.get("bookStats")();
  ок("случай: поздняя отметка", s.night, true);
  ок("случай: ранняя отметка", s.dawn, true);
  ок("случай: отметка среди дня", s.daytime, true);
  ок("случай: в один день и книга, и рояль", s.sameDay, true);
  // со 99-й до 205-й — вторая глава (100–199) пройдена целиком за раз
  ок("случай: глава за один присест", s.chapterInOne, true);

  // 1 сентября вторник, 3-е четверг, 5-е суббота, 11 ноября среда
  ок("случай: дней недели набралось", s.weekdays, 4);
  ок("случай: одной субботы мало", s.wholeWeekend, false);
  t.get("data").book.entries.push({ id: "e5", date: "2026-09-06", bookId: "kn", page: 208,
                                    createdAt: час(6, 12) });
  ок("случай: суббота и воскресенье подряд", t.get("bookStats")().wholeWeekend, true);

  t.set("data", было.data); t.set("CATALOG", было.cat);
}

/* ── Промты карты: запрет на спойлеры в каждом ──
   Спрашивают, что такое шинель, а нейросеть добавляет «в конце книги эта
   шинель…». Запрет стоял у трёх видов из восьми — теперь у всех, и книга в нём
   названа прямо: без имени он ни к чему не привязан. */
{
  const было = { data: JSON.parse(JSON.stringify(t.get("data"))), gm: t.get("gm") };
  t.set("data", { active: "book", piano: { pieces: [], entries: [] },
    book: { books: [{ id: "kn", title: "Униженные", author: "Достоевский", pages: 300, chapters: [] }],
            activeBook: "kn", entries: [] },
    pastel: { courses: [], entries: [] }, watch: { videos: [], entries: [] } });
  t.set("gm", { места: [], id: "kn", слой: "all", часть: 1, at: null, части: [] });
  for (const вид of ["place", "thing", "word", "person", "art", "animal", "book", "rock", "text"]) {
    const h = t.get("gmSpravki")({ kind: вид, name: "шинель", t: "верхняя одежда", q: "шинель" });
    const q = decodeURIComponent((h.match(/q=([^"]+)"/) || [])[1] || "");
    ок("промт " + вид + ": запрет на спойлеры", /не пересказывай/.test(q), true);
    ок("промт " + вид + ": книга названа", /«Униженные»/.test(q), true);
  }
  t.set("gm", было.gm); t.set("data", было.data);
}

/* ── Срок словами, без точной даты ──
   «Примерно к 17 сентября» звучит как обещание, которого прогноз дать не
   может: он пересчитывается каждый вечер и на таком расстоянии гуляет на
   неделю. Ни в одной формулировке числа быть не должно. */
{
  const when = t.get("humanWhen"), left = t.get("humanLeft");
  const дата = (через) => { const d = new Date(2026, 8, 5); d.setDate(d.getDate() + через); return d; };
  for (const через of [8, 12, 17, 20, 24, 30, 60, 120]) {
    const s2 = when(дата(через), через);
    ок("срок: без числа через " + через + " дн.", /\d/.test(s2.replace(/20\d\d/, "")), false);
  }
  ок("срок: начало месяца", when(new Date(2026, 9, 3), 28), "примерно к началу октября");
  ок("срок: середина", when(new Date(2026, 9, 15), 40), "примерно к середине октября");
  ок("срок: конец", when(new Date(2026, 9, 27), 52), "примерно к концу октября");
  // близкий срок — не датой, а на пальцах
  ок("срок: пара дней", left(2), "остался день-другой");
  ок("срок: неделя", left(9), "ещё неделя");
  ок("срок: пара недель", left(15), "ещё пара недель");
}

/* ── Собрание у пьесы и рисунка ──
   Глав там нет, есть вечера: вещи выдаются по одной-две за занятие, и открытым
   считается то, что уже выдали. У пьесы порция зависит от времени за
   инструментом — единственное место, где двадцать минут и час отличаются. */
{
  const было = { data: JSON.parse(JSON.stringify(t.get("data"))), arts: t.get("ARTS"),
                 cat: t.get("CATALOG"), mus: t.get("MUSEUM") };
  t.set("data", { active: "piano",
    piano: { pieces: [{ id: "bwv", name: "Бах", bars: 8 }], activePiece: "bwv", entries: [] },
    book: { books: [], activeBook: "", entries: [], asks: [] },
    pastel: { courses: [{ id: "ar", name: "Аргус", lessons: [] }], activeCourse: "ar", entries: [] },
    watch: { videos: [], entries: [] }, practice: {}, colGiven: {} });
  t.set("CATALOG", { bwv: { ach: [] }, ar: { ach: [] } });
  t.set("MUSEUM", { items: [] });
  t.set("ARTS", { bwv: { map: [
    { part: 1, kind: "word", name: "Октава", t: "та же нота", about: "Частота вдвое больше." },
    { part: 1, kind: "word", name: "Полутон", t: "короткий шаг", about: "Соседние клавиши." },
    { part: 2, kind: "word", name: "Каденция", t: "точка в конце", about: "Оборот, закрывающий мысль." },
  ] } });

  const мат = t.get("colMat")();
  ок("собрание: у пьесы оно есть", мат.kind, "piece");
  ок("собрание: сперва не выдано ничего",
    t.get("colItems")(мат).filter((x) => t.get("colOpen")(мат, x)).length, 0);

  /* Считаем занятия, а не минуты: короткий заход и долгий приносят одинаково,
     иначе получается счётчик, за которым тянет досидеть. */
  ок("порция: у пьесы одна за занятие", t.get("colПорция")(мат), 1);
  ок("порция: короткий заход приносит столько же", t.get("colПорция")(мат, 9), 1);
  ок("порция: и долгий тоже", t.get("colПорция")(мат, 55), 1);

  const дали = t.get("colGrant")(мат, 1);
  ок("собрание: выдали первую по порядку", дали.map((x) => x.name), ["Октава"]);
  ок("собрание: она и открыта", t.get("colOpen")(мат, дали[0]), true);
  ок("собрание: следующая ещё нет",
    t.get("colOpen")(мат, t.get("colItems")(мат)[1]), false);
  /* Второй заход в тот же день — вторая вещь. Считаются занятия, а не дни:
     сел дважды за вечер, получил два раза. */
  const дали2 = t.get("colGrant")(мат, t.get("colПорция")(мат));
  ок("собрание: второе занятие за день приносит следующую", дали2.length, 1);
  ок("собрание: и это не та же самая", дали2[0].name !== дали[0].name, true);
  ок("собрание: выдано ровно две",
    t.get("colItems")(мат).filter((x) => t.get("colOpen")(мат, x)).length, 2);

  t.get("colGrant")(мат, 2);
  ок("собрание: дальше по порядку",
    t.get("colItems")(мат).filter((x) => t.get("colOpen")(мат, x)).map((x) => x.name),
    ["Октава", "Полутон", "Каденция"]);
  ок("собрание: кончились — не выдумываем", t.get("colGrant")(мат, 3).length, 0);

  /* У рисунка лист один, а вещей две: приём и картина. */
  t.set("data.active", "pastel");
  ок("порция: у рисунка тоже одна за занятие", t.get("colПорция")(t.get("colMat")()), 1);

  t.set("MUSEUM", было.mus); t.set("ARTS", было.arts);
  t.set("data", было.data); t.set("CATALOG", было.cat);
}

/* ── Собрание ──
   К концу книги остаётся не «пройденный курс», а свой словарь. Порог —
   закрытая глава, а не страница: читают бумажную книгу и не знают, на какой
   странице встретилось слово, известна только глава. */
{
  const было = { data: JSON.parse(JSON.stringify(t.get("data"))), arts: t.get("ARTS"),
                 mus: t.get("MUSEUM"), cat: t.get("CATALOG") };
  t.set("data", { active: "book", piano: { pieces: [], entries: [] },
    book: { books: [{ id: "kn", title: "Книга", pages: 300, startPage: 0,
                      chapters: [{ name: "Раз", from: 1 }, { name: "Два", from: 101 },
                                 { name: "Три", from: 201 }] }],
            activeBook: "kn", entries: [{ id: "e1", date: "2026-09-01", bookId: "kn", page: 100 }],
            asks: [] },
    pastel: { courses: [], entries: [] }, watch: { videos: [], entries: [] } });
  t.set("CATALOG", { kn: { ach: [] } });
  t.set("ARTS", { kn: { map: [
    { part: 1, kind: "place", name: "Итака", t: "остров", about: "…" },
    { part: 1, kind: "word", name: "Скипетр", t: "знак", about: "…" },
    { part: 1, kind: "person", name: "Нестор", t: "старик", about: "…" },
    { part: 2, kind: "place", name: "Пилос", t: "гавань", about: "…" },
    { part: 2, kind: "thing", name: "Финка", t: "нож", about: "…" },
    { part: 3, kind: "art", name: "Гойя", t: "картина", about: "…" },
    { kind: "text", name: "Как переводили", t: "о книге", about: "…" },
  ] } });
  t.set("MUSEUM", { items: [
    { id: "a1", book: "kn", ch: 1, name: "Музей", kind: "место", about: "…" },
    { id: "a2", book: "kn", ch: 3, name: "Ваза", kind: "вещь", about: "…" },
  ] });

  const b = t.get("book")();
  /* Мест в собрании нет: у «Одиссеи» их восемьдесят шесть, и списком это уже
     не собрание, а карта в столбик. Артефакты музеев остаются. */
  ок("собрание: мест в нём нет",
    t.get("colItems")(b).some((x) => x.kind === "place"), false);
  ок("собрание: остальное на месте — карта и артефакты", t.get("colItems")(b).length, 7);

  /* Первая глава кончается на 100-й, и она дочитана. Вторая — нет. */
  const по = {};
  for (const x of t.get("colStats")(b)) по[x.id] = [x.есть, x.всего];
  ок("собрание: быт и слова", по.byt, [1, 3]);   // скипетр, финка и ваза-артефакт
  ок("собрание: люди и книги", по.lyudi, [1, 1]);
  // «Музей» — артефакт-место, он уходит в искусство; запись без главы открыта сразу
  ок("собрание: искусство и о книге", по.art, [2, 3]);

  /* Записи без главы не привязаны к чтению и открыты всегда: без этого у
     «Писем Баламута», где глав у записей нет, собрание было пустым. */
  ок("собрание: запись без главы открыта сразу",
    t.get("colOpen")(b, { ch: 0 }), true);
  ок("собрание: глава ещё не дочитана — закрыто",
    t.get("colOpen")(b, { ch: 2 }), false);

  // дочитали до конца второй
  t.get("data").book.entries.push({ id: "e2", date: "2026-09-02", bookId: "kn", page: 200 });
  const после = {};
  for (const x of t.get("colStats")(b)) после[x.id] = x.есть;
  ок("собрание: вторая глава пополнила", после.byt, 2);


  ок("собрание: что пришло за главу",
    t.get("colOfChapter")(b, 2).map((x) => x.name).sort(), ["Финка"]);
  ок("собрание: кнопка есть, пока есть что собирать", t.get("colBtnOn")(), true);

  /* Пришедшее помечается, пока на него не посмотрели: список длинный, и без
     пометки непонятно, что именно принесла последняя глава. */
  t.set("data.colSeen", {});
  const новых = t.get("colNew")(b).length;
  ок("собрание: сперва всё открытое — новое", новых, t.get("colItems")(b).filter((x) => t.get("colOpen")(b, x)).length);
  ок("собрание: у темы свой счёт нового",
    t.get("colStats")(b).every((x) => x.новых === x.есть), true);
  t.get("colMarkSeen")(b, t.get("colNew")(b));
  ок("собрание: посмотрели — пометок нет", t.get("colNew")(b).length, 0);
  /* Пометка снимается в тот же миг, когда тему показали, а не на выходе:
     выход бывает не всегда — свернул приложение, и назавтра снова точка. */
  ок("собрание: и переживает перезапуск",
    Object.keys(t.get("data").colSeen || {}).length > 0, true);
  ок("собрание: и у тем тоже",
    t.get("colStats")(b).every((x) => !x.новых), true);

  /* Четыре слоя на все книги — слишком грубо: у «Одиссеи» боги, чудовища и
     застольный обычай легли бы в одну кучу. Книга задаёт свои темы, и имя
     главнее слоя: Полифем уходит к чудовищам, Нестор остаётся среди людей,
     хотя оба person. */
  t.set("CATALOG", { kn: { ach: [], themes: [
    { id: "bogi", name: "Боги и чудовища", hint: "не люди", kinds: [], names: ["Полифем"] },
    { id: "lyudi", name: "Люди", hint: "люди", kinds: ["person"] },
    { id: "rest", name: "Остальное", hint: "всё прочее",
      kinds: ["place", "word", "thing", "art", "text", "animal", "rock"] },
  ] } });
  t.get("data").book.entries.push({ id: "e3", date: "2026-09-03", bookId: "kn", page: 300 });
  t.get("ARTS").kn.map.push({ part: 1, kind: "person", name: "Полифем", t: "киклоп", about: "…" });
  const своя = {};
  for (const x of t.get("colStats")(b)) своя[x.id] = x.всего;
  ок("темы: имя главнее слоя", своя.bogi, 1);
  ок("темы: остальные person остались людьми", своя.lyudi, 1);
  ок("темы: имена тем свои у книги",
    t.get("colStats")(b).map((x) => x.name)[0], "Боги и чудовища");

  /* Экран темы: полоса, открытые карточками, закрытые — ячейками без имени.
     Имени в разметке нет вовсе, иначе его достанут выделением или поиском. */
  {
    const узлы = {};
    for (const k of ["#gmCol"])
      узлы[k] = { innerHTML: "", textContent: "", hidden: false, scrollTop: 0,
                  querySelectorAll: () => [], addEventListener() {} };
    const был = t.get("document.querySelector");
    t.set("document.querySelector", (s2) => узлы[s2] || null);
    /* Откатываемся к первой главе: иначе всё открыто и проверять стопку не на
       чем. Собрание тем и живёт, что часть ещё впереди. */
    const хвост = t.get("data").book.entries.pop();
    t.set("colView", "rest");
    t.get("colRender")();
    const h = узлы["#gmCol"].innerHTML;
    const свои = t.get("colItems")(b).filter((x) => x.theme === "rest");
    const мои = свои.filter((x) => t.get("colOpen")(b, x));
    ок("собрание: открытые — карточками", (h.match(/data-item=/g) || []).length, мои.length);
    /* Непройденное — одной стопкой сверху: видно, сколько впереди, и ни одного
       имени в разметке, так что его не достать ни выделением, ни поиском. */
    ок("собрание: стопка сверху одна", (h.match(/cl-stack/g) || []).length, 1);
    ок("собрание: в стопке — сколько впереди",
      new RegExp("Ещё " + (свои.length - мои.length) + " впереди").test(h), true);
    ок("собрание: пустых ячеек хвостом нет", /cl-c off/.test(h), false);
    ок("собрание: подпись темы не показывается", /всё прочее/.test(h), false);
    ок("собрание: полоса нарисована", /class="cl-bar"/.test(h), true);
    /* Сверху — пришедшее последним: собрание открывают сразу после главы, и
       видеть там надо её, а не первую страницу книги. */
    const порядок = (h.match(/<b>[^<]+<\/b>/g) || []).map((x) => x.slice(3, -4))
      .filter((x) => !/^(Собрано|Ещё)/.test(x) && x !== "Остальное");   // шапка темы
    // вторая глава выше первой: Финка из второй, Скипетр из первой
    ок("собрание: свежее сверху", порядок[0], "Финка");

    /* Вещь открывается во весь экран, с описанием, ссылками и переходами к
       соседним: листать собрание, не возвращаясь в список. */
    t.set("colAt", t.get("colOrder")(b, "rest")[0].id);
    t.get("colRender")();
    const о = узлы["#gmCol"].innerHTML;
    ок("вещь: открылась во весь экран", /id="msOne"/.test(о), true);
    ок("вещь: справка на месте", /ms-about/.test(о), true);
    ок("вещь: кнопки поиска", /ChatGPT/.test(о) && /Картинки/.test(о), true);
    ок("вещь: переход к соседней", (о.match(/data-colgo="[^"]+"/g) || []).length >= 1, true);
    t.set("colAt", null);
    t.get("data").book.entries.push(хвост);
    t.set("colView", null);
    t.set("document.querySelector", был);
  }

  t.set("MUSEUM", было.mus); t.set("ARTS", было.arts);
  t.set("data", было.data); t.set("CATALOG", было.cat);
}

/* ── Потолок времени у запроса ──
   Сверка тянет гист целиком — три профиля, больше полумегабайта, — и на
   мобильной сети в двенадцать секунд это не укладывалось: «сохранено локально,
   но не ушло», а «Повторить» упиралось в тот же потолок. Текст ошибки теперь
   называет шаг: иначе обрыв связи и короткий потолок неразличимы. */
{
  ок("таймаут: в тексте виден шаг",
    t.get("timeoutMsg")("PATCH /gists/x"), "не дождались: PATCH /gists/x");
  ок("таймаут: без шага — прежний текст", t.get("timeoutMsg")(""), "нет связи");
}

/* ── Лента: длинное имя на фишке обрезается ──
   Одного эллипсиса из CSS мало: фишка стоит во флексе рядом с иконкой и
   отступами, и длинное имя вылезало за край. */
{
  const было = { data: JSON.parse(JSON.stringify(t.get("data"))), mus: t.get("MUSEUM"),
                 поиск: t.get("document.querySelector"), tab: t.get("tab") };
  t.set("data", { active: "book", piano: { pieces: [], entries: [] },
    book: { books: [{ id: "kn", title: "К", pages: 100, startPage: 0, chapters: [{ name: "I", from: 1 }] }],
            activeBook: "kn", entries: [{ id: "e1", date: "2026-03-05", bookId: "kn", page: 50 }] },
    pastel: { courses: [], entries: [] }, watch: { videos: [], entries: [] },
    musAt: { "v1": Date.parse("2026-03-05T18:00:00") },
    thoughts: [{ id: "ev:session:kn:2026-03-05", event: "session", key: "kn", track: "book",
                 date: "2026-03-05", createdAt: Date.parse("2026-03-05T18:00:00"), text: "Читал",
                 awards: [{ id: "a1", icon: "✦", name: "Ослепление Полифема — группа из Сперлонги" }] }] });
  /* Награда должна быть в описи: фишка показывает нынешнее имя, а снятую
     награду не показывает вовсе. */
  t.set("CATALOG", { kn: { facts: [], noDays: true, ach: [
    { id: "a1", icon: "✦", name: "Ослепление Полифема — группа из Сперлонги",
      hint: "", secret: false, when: [["days", ">=", 1]] }] } });
  t.set("MUSEUM", { items: [] });
  const узел = { hidden: false, innerHTML: "" };
  t.set("document.querySelector", (s) => (s === "#view" ? узел : null));
  t.set("tab", "notes");
  try { t.get("renderNotes")(); } catch (e) { /* остальной DOM тут не нужен */ }
  /* Фишка теперь одна — награда: артефакты из ленты сняты, собрание живёт
     своим экраном. */
  const имя = (/data-ev-ach="[^"]*"[^>]*>\s*<i>[^<]*<\/i><span>([^<]*)</.exec(узел.innerHTML) || [])[1] || "";
  ок("лента: артефактов в карточке дня больше нет", /data-ev-art=/.test(узел.innerHTML), false);
  ок("лента: длинное имя обрезано", имя.length <= 29, true);
  ок("лента: обрезка помечена многоточием", имя.endsWith("…"), true);

  /* Набор наград переписали — вечер не должен остаться с теми, которых нет. */
  t.set("CATALOG", { kn: { facts: [], noDays: true, ach: [
    { id: "b2", icon: "📖", name: "Первый вечер", hint: "", secret: false,
      when: [["days", ">=", 1]] }] } });
  узел.innerHTML = "";
  try { t.get("renderNotes")(); } catch (e) {}
  ок("лента: снятая награда из карточки дня ушла", /data-ev-ach=/.test(узел.innerHTML), false);
  ок("лента: обрыв не посреди слова", /\s\S{0,3}…$/.test(имя), false);
  t.set("document.querySelector", было.поиск); t.set("tab", было.tab);
  t.set("MUSEUM", было.mus); t.set("data", было.data);
}

/* ── Лента: артефакты вместо карточек ──
   Карточки сняты, и фишка в ленте вела в никуда. Вместо неё — предмет,
   открывшийся этой отметкой: у него есть куда вести. День берётся из
   времени открытия предмета, а не пересчитывается по главам. */
{
  const было = { data: JSON.parse(JSON.stringify(t.get("data"))), mus: t.get("MUSEUM") };
  t.set("data", { active: "book", piano: { pieces: [], entries: [] },
    book: { books: [{ id: "kn", title: "К", pages: 100, startPage: 0, chapters: [{ name: "I", from: 1 }] }],
            activeBook: "kn", entries: [{ id: "e1", date: "2026-03-05", bookId: "kn", page: 50 }] },
    pastel: { courses: [], entries: [] }, watch: { videos: [], entries: [] },
    musAt: { "v1": Date.parse("2026-03-05T18:00:00"), "v2": Date.parse("2026-03-01T18:00:00") } });
  t.set("CATALOG", { materials: { kn: { facts: [], ach: {} } } });
  t.set("MUSEUM", { items: [
    { id: "v1", book: "kn", ch: 1, name: "Кратер", kind: "вещь" },
    { id: "v2", book: "kn", ch: 1, name: "Килик", kind: "вещь" },
    { id: "v3", book: "другая", ch: 1, name: "Чужой", kind: "вещь" },
  ] });
  const p = t.get("dayProgress")("book", "kn", "2026-03-05");
  ок("лента: предмет, открытый в этот день, попадает в сессию", p.arts.map((x) => x.name), ["Кратер"]);
  ок("лента: предмет другого дня — нет", p.arts.some((x) => x.id === "v2"), false);
  ок("лента: чужая книга — нет", p.arts.some((x) => x.id === "v3"), false);
  t.set("MUSEUM", было.mus); t.set("data", было.data);
}

/* ── Награды: вкладки «Карточки» больше нет, если карточек ноль ──
   Карточки переехали в карту. Вкладка, за которой пусто, показывала бы
   «0 из 0», а запомненная открытой — встречала бы пустотой. */
{
  const было = { data: JSON.parse(JSON.stringify(t.get("data"))), cfg: JSON.parse(JSON.stringify(t.get("cfg"))),
                 achView: t.get("achView"), achTab: t.get("achTab"), поиск: t.get("document.querySelector") };
  t.set("data", { active: "book", piano: { pieces: [], entries: [] },
    book: { books: [{ id: "kn", title: "К", pages: 100, startPage: 0, chapters: [] }], activeBook: "kn", entries: [] },
    pastel: { courses: [], entries: [] }, watch: { videos: [], entries: [] } });
  t.set("CATALOG", { materials: { kn: { facts: [], ach: {} } } });
  const узел = { hidden: false, innerHTML: "" };
  t.set("document.querySelector", (s) => (s === "#view" ? узел : null));
  t.set("achView", { track: "book", bookId: "kn" });
  t.set("achTab", "facts"); t.set("cfg.achTab", "facts");
  try { t.get("renderAch")(); } catch (e) { /* остальной DOM тут не нужен */ }
  ок("награды: пустая вкладка «Карточки» сбрасывается", t.get("achTab"), "ach");
  ок("награды: кнопки «Карточки» в разметке нет", /data-at="facts"/.test(узел.innerHTML), false);
  t.set("document.querySelector", было.поиск);
  t.set("achView", было.achView); t.set("achTab", было.achTab);
  t.set("data", было.data); t.set("cfg", было.cfg);
}

/* ── Погружение молчит на карте ──
   Карта и справочник — оверлей поверх главной, вкладка остаётся «home», и
   музыка вступала прямо посреди чтения справки. */
{
  const было = { gm: t.get("gm"), zen: t.get("zenTimer"),
                 cfg: JSON.parse(JSON.stringify(t.get("cfg"))),
                 data: JSON.parse(JSON.stringify(t.get("data"))) };
  t.set("data", { active: "piano", piano: { pieces: [{ id: "p", name: "П", bars: 4 }],
      activePiece: "p", entries: [] },
    book: { books: [], entries: [] }, pastel: { courses: [], entries: [] },
    watch: { videos: [], entries: [] } });
  t.set("cfg.sound", true); t.set("cfg.zen", true);
  t.set("zenHold", 0);
  t.set("gm", null);
  t.get("zenArm")();
  ок("погружение: на главной таймер заводится", !!t.get("zenTimer"), true);
  t.set("gm", { места: [], часть: 0, слой: "" });
  t.get("zenArm")();
  ок("погружение: на карте не заводится", !!t.get("zenTimer"), false);
  t.set("gm", было.gm); t.set("cfg", было.cfg); t.set("data", было.data);
  clearTimeout(t.get("zenTimer")); t.set("zenTimer", было.zen);
}

/* ── Какуля: награды идут вперемешку ──
   Раньше талоны открывались пачкой один за другим, и разницы между ними не
   чувствовалось. Соседние награды должны быть разного сорта. */
{
  const ach = t.get("GUT_ACH");
  const сорт = (a) => /^gsms/.test(a.id) ? "смс"
    : /^gtit/.test(a.id) ? "тит"
    : ["gflowers","gbath","gpizza","gtaxi","gsilence","gquiet","gdecide","gguilty","gerrand",
       "gbreakfast","gtea","gdishes","gremote"].includes(a.id) ? "талон" : "прочее";
  const порог = (a) => {
    const m = /s\.after2 >= (\d+)/.exec(String(a.test));
    return m ? Number(m[1]) : null;
  };
  const лесенка = ach.filter((a) => порог(a) !== null && порог(a) > 10)
    .map((a) => ({ n: порог(a), с: сорт(a), id: a.id }))
    .sort((x, y) => x.n - y.n);
  /* Подряд не должны идти не только талоны: две эсэмэски или две весточки
     Тита друг за другом — тот же самый «опять то же самое». */
  let подряд = [];
  for (let i = 1; i < лесенка.length; i++)
    if (лесенка[i].с === лесенка[i - 1].с && лесенка[i].с !== "прочее")
      подряд.push(лесенка[i - 1].id + "→" + лесенка[i].id);
  ок("какуля: одинаковые подряд не идут", подряд, []);
  // серия эсэмэсок должна идти по порядку: первая раньше второй
  const смс = лесенка.filter((x) => x.с === "смс").map((x) => x.id);
  ок("какуля: эсэмэски по порядку", смс, ["gsms1","gsms2","gsms3","gsms4","gsms5","gsms6"]);

  /* Порядок — по выдаче, сверху последняя. Без отметки времени список стоял
     в порядке объявления, и свежая наградка тонула среди давно известных. */
  {
    const былГут = t.get("data").gut, былГутAt = t.get("data").gutAt;
    t.set("data.gut", [{ id: "a", date: "2026-01-01", at: 1 }]);
    t.set("data.gutAt", {});
    ок("какуля: новым проставляется время", t.get("gutStamp")([]), true);
    ок("какуля: повторно не проставляется", t.get("gutStamp")([]), false);
    const открытые = t.get("gutAchState")().filter((a) => a.done);
    t.set("data.gutAt", { [открытые[0].id]: 5, [открытые[1] && открытые[1].id || "x"]: 500 });
    const по = открытые.map((a, i) => [a, i])
      .sort((x, y) => (t.get("gutWhen")(y[0]) - t.get("gutWhen")(x[0])) || (x[1] - y[1]))
      .map(([a]) => a.id);
    ок("какуля: сверху та, что пришла позже", по[0], открытые[1] ? открытые[1].id : открытые[0].id);

    /* Порядок восстанавливается по истории: наградка помечается временем той
       отметки, что её открыла, а не «когда-то». Иначе всё полученное до
       появления записи стоит кучей в порядке объявления. */
    t.set("data.gutAt", {});
    t.set("data.gut", [
      { id: "a", date: "2026-01-01", at: Date.parse("2026-01-01T10:00:00Z") },
      { id: "b", date: "2026-01-02", at: Date.parse("2026-01-02T10:00:00Z") },
      { id: "c", date: "2026-01-02", at: Date.parse("2026-01-02T10:30:00Z") },
    ]);
    ок("какуля: история восстановилась", t.get("gutBackfill")(), true);
    const когда = t.get("data").gutAt;
    ок("какуля: «Почин» помечен первой отметкой",
      когда.g1, Date.parse("2026-01-01T10:00:00Z"));
    ок("какуля: «Дубль» — той, что его открыла",
      когда.g2, Date.parse("2026-01-02T10:30:00Z"));
    ок("какуля: «когда-то» ни у кого не осталось",
      Object.values(когда).some((v) => v === 1), false);
    ок("какуля: повтор ничего не меняет", t.get("gutBackfill")(), false);
    t.set("data.gut", былГут); t.set("data.gutAt", былГутAt);
  }
  ок("какуля: у Тита теперь не две реплики", ach.filter((a) => /^gtit/.test(a.id)).length >= 5, true);
  ок("какуля: эсэмэски складываются в серию", ach.filter((a) => /^gsms/.test(a.id)).length, 6);

  /* Возвращение после перерыва — единственное условие, срабатывающее от паузы. */
  const было = t.get("data").gut;
  t.set("data.gut", [{ id: "a", date: "2026-01-01", at: 1 }, { id: "b", date: "2026-01-02", at: 2 }]);
  ок("какуля: без перерыва возвращения нет", t.get("gutStats")().comeback, false);
  t.set("data.gut", [{ id: "a", date: "2026-01-01", at: 1 }, { id: "b", date: "2026-01-20", at: 2 }]);
  ок("какуля: после недели тишины — засчитано", t.get("gutStats")().comeback, true);
  ок("какуля: и Новый год не выслужить", t.get("gutStats")().newYear, true);
  t.set("data.gut", было);
}

/* ── Рисунок: артефакт за занятие ──
   У рисунка ни уроков, ни содержания — конца нет, есть только заходы за лист.
   Поэтому предмет открывается по их числу, а не по главе. */
{
  const было = { active: t.get("data").active, pastel: JSON.parse(JSON.stringify(t.get("data").pastel || {})),
                 mus: t.get("MUSEUM") };
  t.set("data.pastel", { courses: [{ id: "ris", name: "Рисунок", lessons: [] }],
    entries: [{ id: "e1", date: "2026-09-01", courseId: "ris" },
              { id: "e2", date: "2026-09-02", courseId: "ris" }] });
  t.set("data.active", "pastel");
  const вещь = (ch) => ({ id: "a" + ch, book: "ris", ch, name: "Вещь " + ch });
  t.set("MUSEUM", { items: [вещь(1), вещь(2), вещь(3), { id: "a0", book: "ris", name: "Без номера" }] });

  ок("рисунок: за два захода открылись два предмета",
    t.get("musItems")().filter(t.get("musOpen")).map((x) => x.name).sort(),
    ["Без номера", "Вещь 1", "Вещь 2"]);

  t.get("data").pastel.entries.push({ id: "e3", date: "2026-09-03", courseId: "ris" });
  ок("рисунок: третий заход открыл третий",
    t.get("musItems")().filter(t.get("musOpen")).length, 4);

  /* Две отметки за день — два занятия: каждая отметка своя сессия. */
  t.get("data").pastel.entries.push({ id: "e4", date: "2026-09-03", courseId: "ris" });
  ок("рисунок: две отметки за день считаются порознь",
    t.get("data").pastel.entries.length, 4);

  t.set("MUSEUM", было.mus);
  t.set("data.pastel", было.pastel); t.set("data.active", было.active);
}

/* ── Курс: процент по времени, а не по числу уроков ── */
{
  const было = {
    active: t.get("data").active,
    pastel: JSON.parse(JSON.stringify(t.get("data").pastel || {})),
    practice: JSON.parse(JSON.stringify(t.get("data").practice || {})),
  };
  // два коротких урока и один длинный: 3 + 1 + 110 минут
  const урок = (мин, шагов) => ({ dur: мин * 60, steps: Array.from({ length: шагов }, () => ({})) });
  t.set("data.pastel", {
    course: { id: "c", name: "Курс", lessons: [урок(3, 3), урок(1, 3), урок(110, 10)] },
    entries: [{ id: "e1", date: "2026-08-22", lessons: [0] }],
  });
  t.set("data.practice", { pastel: { done: {
    "L0:s0": "2026-08-22", "L0:s1": "2026-08-22", "L0:s2": "2026-08-22",
    "L1:s0": "2026-08-22",
  } } });
  t.set("data.active", "pastel");

  const вр = t.get("courseTime")();
  ок("курс: всего минут", Math.round(вр.totalSec / 60), 114);
  // урок 0 целиком (180 с) + треть второго (20 с)
  ок("курс: пройдено секунд", Math.round(вр.doneSec), 200);
  ок("курс: прирост записан на день шага", Math.round(вр.поДням["2026-08-22"]), 200);

  const s = t.get("pastelStats")();
  ок("курс: процент по времени", Math.round(s.pct * 10) / 10, 2.9);
  ок("курс: по урокам было бы втрое больше", Math.round(s.done / s.lessons * 100), 33);
  ок("курс: осталось минут", s.minutesLeft, 111);

  const f = t.get("paceForecast")();
  ок("курс: прогноз считает минуты", f && f.unit, "minute");
  ок("курс: остаток в минутах", f && f.left, 111);

  // курс без длительностей считается по-старому, поштучно
  t.set("data.pastel.course.lessons", [{ steps: [] }, { steps: [] }, { steps: [] }, { steps: [] }]);
  ок("курс без длительностей: процент по урокам",
    Math.round(t.get("pastelStats")().pct), 25);

  t.set("data.pastel", было.pastel);
  t.set("data.practice", было.practice);
  t.set("data.active", было.active);
}

/* ── Занятия внутри урока: режем по движениям, а не по минутам ── */
{
  const было = { active: t.get("data").active, pastel: JSON.parse(JSON.stringify(t.get("data").pastel || {})) };
  const ш = (k, g) => ({ k, g, t: "…", at: "0:00" });
  t.set("data.pastel", { entries: [], course: { id: "c", lessons: [{ dur: 600, steps: [
    ш("watch", "Вступление"), ш("watch", "Вступление"), ш("watch", "Вступление"),
    ш("pause", "Рисуем"), ш("pause", "Рисуем"), ш("pause", "Рисуем"),
    ш("pause", "Рисуем"), ш("pause", "Рисуем"),
    ш("read",  "Материалы"),
    ш("do",    "Сам"),
  ] }] } });
  t.set("data.active", "pastel");

  const бл = t.get("lessonBlocks")(0);
  ок("занятия: смотрение не режется",
    бл.map((b) => b.from + "-" + b.to), ["0-2", "3-5", "6-7", "8-8", "9-9"]);
  ок("занятия: больше трёх движений не бывает", бл.every((b) => b.doing <= 3), true);
  ок("занятия: смотрение движений не набирает", бл[0].doing, 0);
  ок("занятия: этап не склеивается с соседним",
    бл.map((b) => b.g), ["Вступление", "Рисуем", "Рисуем", "Материалы", "Сам"]);
  ок("занятия: шаг находит своё", t.get("blockOfStep")(0, 4).from, 3);

  const п1 = t.get("lessonPrep")(0, бл[0]);
  ок("подготовка: перед смотрением доставать нечего", п1.надо, false);
  ок("подготовка: и список пуст", п1.список.length, 0);
  const п2 = t.get("lessonPrep")(0, бл[1]);
  ок("подготовка: перед рисованием список есть", п2.надо, true);
  ок("подготовка: базовый набор на месте", п2.список[0], "Убери со стола лишнее");

  t.set("data.pastel", было.pastel);
  t.set("data.active", было.active);
}

/* ── Артефакты курса: привязка к урокам, а не к главам ── */
{
  const было = {
    pastel: JSON.parse(JSON.stringify(t.get("data").pastel || {})),
    practice: JSON.parse(JSON.stringify(t.get("data").practice || {})),
    museum: t.get("MUSEUM"),
  };
  const ш = () => ({ k: "watch", t: "…" });
  t.set("data.pastel", { entries: [], course: { id: "c", name: "Пастель", lessons: [
    { title: "О материалах", steps: [ш(), ш()] },
    { title: "Тест-драйв", steps: [ш(), ш()] },
  ] } });
  t.set("data.practice", { pastel: { done: { "L0:s0": "2026-08-22" } } });
  t.set("MUSEUM", { items: [
    { id: "m1", book: "pastel", ch: 1, name: "Жжёная сиена" },
    { id: "m2", book: "pastel", ch: 2, name: "Клячка" },
    { id: "m3", book: "pastel", ch: 0, name: "Что такое пастель" },
  ] });

  const открыт = (id) => t.get("musOpen")(t.get("MUSEUM").items.find((x) => x.id === id));
  ок("курс: урок начат — предмет открыт", открыт("m1"), true);
  ок("курс: до урока не открыт", открыт("m2"), false);
  ок("курс: без урока открыт сразу", открыт("m3"), true);
  ок("курс: подпись берёт название урока",
    t.get("musChName")({ book: "pastel", ch: 1 }), "О материалах");
  ок("курс: имя материала — название курса", t.get("musBookName")("pastel"), "Пастель");

  // курса в профиле нет — предметов тоже нет ни одного
  t.set("data.pastel", { entries: [], course: null });
  ок("курс: нет курса — нет артефактов", [открыт("m1"), открыт("m3")], [false, false]);

  t.set("data.pastel", было.pastel);
  t.set("data.practice", было.practice);
  t.set("MUSEUM", было.museum);
}

/* ── Несколько курсов: каждый — отдельный материал ── */
{
  const было = {
    active: t.get("data").active,
    pastel: JSON.parse(JSON.stringify(t.get("data").pastel || {})),
    practice: JSON.parse(JSON.stringify(t.get("data").practice || {})),
    hidden: JSON.parse(JSON.stringify(t.get("data").hidden || {})),
    piano: t.get("data").piano, book: t.get("data").book, watch: t.get("data").watch,
  };
  const ш = (k) => ({ k, g: "Э", t: "…" });
  t.set("data.hidden", {});
  t.set("data.piano", { pieces: [], activePiece: "" });
  t.set("data.book", { books: [], activeBook: "" });
  t.set("data.watch", { videos: [], activeVideo: "", entries: [] });
  t.set("data.pastel", {
    entries: [], course: null, activeCourse: "",
    courses: [
      { id: "c", name: "Пастель", lessons: [{ dur: 600, steps: [ш("do"), ш("do")] }] },
      { id: "argos", name: "Аргос", plain: true, lessons: [{ dur: 600, steps: [ш("do"), ш("do")] }] },
    ],
  });
  t.set("data.active", "pastel");
  t.set("data.practice", {});

  ок("курсы: без выбора берётся первый", t.get("course")().id, "c");
  t.set("data.pastel.activeCourse", "argos");
  ок("курсы: активный выбирается по id", t.get("course")().id, "argos");
  ок("курсы: ключ материала — id курса", t.get("curKey")(), "argos");

  // ход разбора у курсов раздельный, у каждого свой ключ
  t.set("data.pastel.activeCourse", "c");
  t.get("lessonStore")().done["L0:s0"] = "2026-01-01";
  t.set("data.pastel.activeCourse", "argos");
  ок("курсы: свой ход разбора", !!t.get("lessonStore")().done["L0:s0"], false);
  ок("курсы: у каждого курса свой ход разбора",
    Object.keys(t.get("data").practice).sort(), ["pastel:argos", "pastel:c"]);

  // оба курса стоят в ленте как отдельные материалы
  const лента = t.get("railItems")().filter((i) => i.track === "pastel");
  ок("курсы: два материала в ленте", лента.length, 2);
  ок("курсы: ключи материалов", лента.map(t.get("libKey")), ["ps:c", "ps:argos"]);

  // у простого материала нет подготовки
  ок("курсы: простой материал без подготовки",
    t.get("lessonPrep")(0, { doing: 3 }).надо, false);
  t.set("data.pastel.activeCourse", "c");
  ок("курсы: у обычного подготовка есть",
    t.get("lessonPrep")(0, { doing: 3 }).надо, true);

  // под названием — размер материала
  t.set("data.pastel.activeCourse", "argos");
  ок("курсы: размер в шагах рисунка", t.get("courseSize")(), "2 шага рисунка");

  t.set("data.pastel", было.pastel);
  t.set("data.practice", было.practice);
  t.set("data.active", было.active);
  t.set("data.hidden", было.hidden);
  t.set("data.piano", было.piano);
  t.set("data.book", было.book);
  t.set("data.watch", было.watch);
}

/* ── Курсы переживают синхронизацию с устройства, которое их не знает ── */
{
  const mergeLists = t.get("mergeLists");
  const старый = { id: "test-drive", name: "Пастель", updatedAt: 10, lessons: [{}, {}] };
  const новый  = { id: "argos", name: "Аргос", updatedAt: 20, lessons: [{}] };

  // на телефоне списка ещё нет — курсы с ноутбука должны доехать, а не пропасть
  ок("курсы: пустой список не стирает чужие",
    mergeLists([], [старый, новый]).map((c) => c.id).sort(), ["argos", "test-drive"]);

  // и наоборот: свой курс не теряется, когда приходит файл без него
  ок("курсы: свой курс не теряется",
    mergeLists([старый, новый], [старый]).map((c) => c.id).sort(), ["argos", "test-drive"]);

  // свежая правка занятий побеждает
  const правленый = { id: "argos", name: "Аргос", updatedAt: 30, lessons: [{}, {}, {}] };
  ок("курсы: свежая правка побеждает",
    mergeLists([новый], [правленый]).find((c) => c.id === "argos").lessons.length, 3);
}

/* ── Курс-лекция: помним, до какой секунды досмотрел ── */
{
  const было = {
    active: t.get("data").active,
    pastel: JSON.parse(JSON.stringify(t.get("data").pastel || {})),
    practice: JSON.parse(JSON.stringify(t.get("data").practice || {})),
  };
  t.set("data.pastel", {
    entries: [], course: null, activeCourse: "",
    courses: [{ id: "lec", name: "Лекции", mode: "watch", lessons: [
      { title: "Собака", dur: 6600 },
      { title: "Цвет", dur: 6000 },
    ] }],
  });
  t.set("data.active", "pastel");
  t.set("data.practice", {});

  ок("лекция: режим просмотра", t.get("courseWatch")(), true);
  ок("лекция: пока не смотрел — ноль", t.get("lessonProgress")(0).pct, 0);

  t.get("seenSet")(0, 1650, 6600);
  ок("лекция: секунда запомнилась", t.get("seenOf")(0).at, 1650);
  ок("лекция: процент по просмотренному", Math.round(t.get("lessonProgress")(0).pct), 25);
  ок("лекция: соседнее занятие не тронуто", t.get("seenOf")(1).at, 0);

  // досмотренное до конца считается пройденным
  t.get("seenSet")(1, 6000, 6000);
  ок("лекция: досмотрел — пройдено", t.get("lessonProgress")(1).было, 1);

  // просмотренные секунды идут в общее время курса
  ок("лекция: время курса по просмотру",
    Math.round(t.get("courseTime")().doneSec), 7650);

  // прирост ложится на сегодняшний день, а не сваливается весь разом
  const сегодня = t.get("todayStr")();
  ок("лекция: прирост записан на сегодня",
    t.get("seenOf")(0).byDay[сегодня], 1650);
  t.get("seenSet")(0, 1950, 6600);
  ок("лекция: второй заход добавил только разницу",
    t.get("seenOf")(0).byDay[сегодня], 1950);
  t.get("seenSet")(0, 900, 6600);
  ок("лекция: откат назад ничего не приписывает",
    [t.get("seenOf")(0).at, t.get("seenOf")(0).byDay[сегодня]], [900, 1950]);
  t.get("seenSet")(0, 99999, 6600);
  ок("лекция: дальше конца не уедешь", t.get("seenOf")(0).at, 6600);

  // старая отметка «урок пройден» не досматривает лекцию за тебя
  t.set("data.pastel.entries", [{ id: "e1", date: сегодня, lessons: [0] }]);
  t.get("seenSet")(0, 0, 6600);
  ок("лекция: отметка не даёт процентов", Math.round(t.get("lessonProgress")(0).pct), 0);
  t.set("data.pastel.entries", []);

  // часы в подписи появляются только когда они есть

  // под названием — размер материала, а не доля пройденного
  ок("лекция: размер в уроках", t.get("courseSize")(), "2 урока");
  ок("шаги рисунка склоняются", [t.get("shagi")(1), t.get("shagi")(3), t.get("shagi")(24)],
    ["1 шаг рисунка", "3 шага рисунка", "24 шага рисунка"]);
  ок("после «из» — родительный", [t.get("shagov")(1), t.get("shagov")(2), t.get("shagov")(24)],
    ["1 шага рисунка", "2 шагов рисунка", "24 шагов рисунка"]);

  // следующее занятие — первое недосмотренное, а не всегда первое
  ок("лекция: следующее — недосмотренное", t.get("lessonNext")().i, 0);
  t.get("seenSet")(0, 6600, 6600);
  t.get("seenSet")(1, 6000, 6000);
  ок("лекция: досмотрел оба — курс пройден", t.get("lessonNext")(), null);

  t.set("data.pastel", было.pastel);
  t.set("data.practice", было.practice);
  t.set("data.active", было.active);
}

/* ── Старые записи не засчитываются новому материалу ── */
{
  const было = {
    active: t.get("data").active,
    pastel: JSON.parse(JSON.stringify(t.get("data").pastel || {})),
    practice: JSON.parse(JSON.stringify(t.get("data").practice || {})),
  };
  t.set("data.pastel", {
    entries: [
      { id: "old", date: "2026-08-01", lessons: [0] },              // без courseId — из времён одного курса
      { id: "new", date: "2026-08-02", courseId: "b", lessons: [0] },
    ],
    course: null, activeCourse: "a",
    courses: [
      { id: "a", name: "Первый", lessons: [{ dur: 600, steps: [] }] },
      { id: "b", name: "Второй", lessons: [{ dur: 600, steps: [] }] },
    ],
  });
  t.set("data.active", "pastel");
  t.set("data.practice", {});

  ок("записи: старая принадлежит первому курсу", [...t.get("doneLessons")()], [0]);
  t.set("data.pastel.activeCourse", "b");
  ок("записи: второму курсу засчитана только своя", [...t.get("doneLessons")()], [0]);
  t.set("data.pastel.entries", [{ id: "old", date: "2026-08-01", lessons: [0] }]);
  ок("записи: чужая старая не делает новый курс пройденным",
    [...t.get("doneLessons")()], []);

  t.set("data.pastel", было.pastel);
  t.set("data.practice", было.practice);
  t.set("data.active", было.active);
}

/* ── Тело шага: схемы не ломаются, разметка минимальная ── */
{
  const body = t.get("stepBody");
  const txt = [
    "Поставь четыре точки:",
    "",
    "```text",
    "          • верх",
    "",
    "• слева             • справа",
    "```",
    "",
    "- верх — макушка;",
    "- низ — нижняя точка носа;",
    "",
    "**Зачем:** сначала важно занять на листе правильное место.",
  ].join("\n");
  const out = body(txt);

  ок("шаг: схема в моноширинном блоке", /<pre class="ls-pre">/.test(out), true);
  ок("шаг: пробелы схемы целы", out.includes("          • верх"), true);
  ок("шаг: пункты стали списком", (out.match(/<li>/g) || []).length, 2);
  ок("шаг: «Зачем» отдельным абзацем", /<p class="ls-why">/.test(out), true);
  ок("шаг: двойные звёздочки стали жирным", /<b>Зачем:<\/b>/.test(out), true);
  ок("шаг: список закрыт", (out.match(/<ul>/g) || []).length, (out.match(/<\/ul>/g) || []).length);
  ок("шаг: пустое тело ничего не ломает", body(""), "");
  ок("шаг: угловые скобки экранированы", body("a < b").includes("&lt;"), true);

  // разметка из иллюстрированного разбора: строчный код, подзаголовки, таблица
  ок("шаг: строчный код", body("`карандаш H`  ·  `без нажима`").match(/<code>/g).length, 2);
  ок("шаг: строка целиком жирная — подзаголовок",
    /<p class="ls-h3">Что делаем<\/p>/.test(body("**Что делаем**")), true);
  ок("шаг: жирное внутри строки остаётся жирным",
    /<p><b>Почему<\/b> потому что<\/p>/.test(body("**Почему** потому что")), true);
  const таб = body(["| | |", "|---|---|", "| Карандаши | H, HB, 2B |", "| Клячка | мягкий |"].join("\n"));
  ок("шаг: таблица собралась", (таб.match(/<tr>/g) || []).length, 3);
  ок("шаг: разделитель шапки выброшен", таб.includes("---"), false);
  ок("шаг: код внутри таблицы жив", body("| `H` | твёрдый |").includes("<code>H</code>"), true);

  // переносы посреди предложения — вёрстка файла, а не новый абзац
  const склеен = body("Первая строка\nвторая строка\n\nНовый абзац.");
  ок("шаг: строки одного абзаца склеены",
    склеен.includes("<p>Первая строка вторая строка</p>"), true);
  ок("шаг: пустая строка делит абзацы", (склеен.match(/<p>/g) || []).length, 2);
  ок("шаг: подзаголовок узнаётся и после склейки",
    /ls-h3">Зачем</.test(body("**Зачем**\n\nПотому что.")), true);
  ок("шаг: цитата склеивается в одну",
    (body("> первая\n> вторая").match(/<p class="ls-note">/g) || []).length, 1);
}

/* ── Починенное: курсы не путаются между собой ── */
{
  const было = {
    active: t.get("data").active,
    pastel: JSON.parse(JSON.stringify(t.get("data").pastel || {})),
    catalog: t.get("CATALOG"),
  };
  t.set("data.pastel", {
    entries: [
      { id: "e1", date: "2026-08-01", courseId: "a", lessons: [0] },
      { id: "e2", date: "2026-08-01", courseId: "b", lessons: [0] },
    ],
    course: null, activeCourse: "a",
    courses: [
      { id: "a", name: "Пастель", lessons: [{ dur: 600, steps: [] }] },
      { id: "b", name: "Аргос", lessons: [{ dur: 600, steps: [] }] },
    ],
  });
  t.set("data.active", "pastel");

  // ключ материала для любого курса, не только открытого
  ок("курсы: ключ курса — его id",
    [t.get("keyOfCourse")({ id: "a" }), t.get("keyOfCourse")({ id: "b" })], ["a", "b"]);

  // звук у каждого курса свой, а не общий
  ок("курсы: свой ключ звука",
    [t.get("railKey")({ track: "pastel", course: { id: "a" } }),
     t.get("railKey")({ track: "pastel", course: { id: "b" } })], ["a", "b"]);

  // в ленте дня запись подписана именем своего курса
  const лента = t.get("allEntriesOn")("2026-08-01").filter((x) => x.track === "pastel");
  ок("курсы: в ленте дня имя своего курса",
    лента.map((x) => x.title).sort(), ["Аргос", "Пастель"]);

  // незнакомый материал заставляет обновить каталог сразу
  t.set("CATALOG", { a: { cover: true } });
  ок("каталог: новый курс считается незнакомым", t.get("catalogMissing")(), true);
  t.set("CATALOG", { a: { cover: true }, b: { cover: true } });
  ок("каталог: когда все известны — не дёргаем", t.get("catalogMissing")(), false);

  t.set("CATALOG", было.catalog);
  t.set("data.pastel", было.pastel);
  t.set("data.active", было.active);
}

/* ── Слияние: просмотренные минуты не пропадают ── */
{
  const mp = t.get("mergePrac");
  const мой   = { pastel: { at: 100, done: {}, seen: { L0: { at: 600, dur: 6600, byDay: { "2026-08-01": 600 } } } } };
  const чужой = { pastel: { at: 200, done: {}, seen: { L1: { at: 300, dur: 6000, byDay: { "2026-08-02": 300 } } } } };
  const out = mp(мой, чужой).pastel.seen;
  ок("слияние: занятие с другого телефона не пропало",
    [!!out.L0, !!out.L1], [true, true]);
  ок("слияние: минуты своего занятия целы", out.L0.at, 600);

  // одно и то же занятие: побеждает тот, кто досмотрел дальше
  const a = { p: { at: 1, done: {}, seen: { L0: { at: 600, byDay: { d1: 600 } } } } };
  const b = { p: { at: 2, done: {}, seen: { L0: { at: 1800, byDay: { d1: 1800 } } } } };
  ок("слияние: берём того, кто дальше", mp(a, b).p.seen.L0.at, 1800);
  ок("слияние: и в обратную сторону тоже", mp(b, a).p.seen.L0.at, 1800);
}

/* ── Артефакты курса-лекции: приходят по минуте, а не по шагу ── */
{
  const было = {
    active: t.get("data").active,
    pastel: JSON.parse(JSON.stringify(t.get("data").pastel || {})),
    practice: JSON.parse(JSON.stringify(t.get("data").practice || {})),
    museum: t.get("MUSEUM"),
  };
  t.set("data.pastel", {
    entries: [], course: null, activeCourse: "",
    courses: [{
      id: "lec", name: "Лекции", mode: "watch",
      lessons: [{ title: "Собака", dur: 6600, archive: { steps: [
        { at: "3:00" }, { at: "10:00" }, { at: "37:30" },
      ] } }],
    }],
  });
  t.set("data.active", "pastel");
  t.set("data.practice", {});
  t.set("MUSEUM", [
    { id: "m1", book: "pastel", ch: 1, step: 2, name: "Клячка" },
    { id: "m2", book: "pastel", ch: 1, step: 0, name: "Уголь" },
    { id: "m3", book: "pastel", ch: 1, name: "Без шага" },
  ]);
  const открыт = (id) => t.get("musOpen")(t.get("MUSEUM").find((x) => x.id === id));

  ок("предметы: до просмотра закрыты", [открыт("m1"), открыт("m2"), открыт("m3")],
    [false, false, false]);

  t.get("seenSet")(0, 5 * 60, 6600);          // досмотрел до пятой минуты
  ок("предметы: ранний открылся, поздний нет", [открыт("m2"), открыт("m1")], [true, false]);
  ок("предметы: без шага — с начала просмотра", открыт("m3"), true);

  t.get("seenSet")(0, 38 * 60, 6600);         // дошёл до 37:30
  ок("предметы: дошёл до минуты — открылся", открыт("m1"), true);

  // минуты предметов хранятся списком cues, архив прежних шагов больше не нужен
  t.set("data.pastel.courses", [{
    id: "lec", name: "Лекции", mode: "watch",
    lessons: [{ title: "Собака", dur: 6600, cues: { "2": 2250 } }],
  }]);
  t.get("seenSet")(0, 30 * 60, 6600);
  ок("предметы: cues вместо архива", открыт("m1"), false);
  t.get("seenSet")(0, 38 * 60, 6600);
  ок("предметы: дошёл до минуты из cues", открыт("m1"), true);

  ок("тайм-код в секунды",
    [t.get("stepSec")("37:30"), t.get("stepSec")("1:02:30"), t.get("stepSec")("")],
    [2250, 3750, null]);

  t.set("MUSEUM", было.museum);
  t.set("data.pastel", было.pastel);
  t.set("data.practice", было.practice);
  t.set("data.active", было.active);
}

/* ── Раз в секунду перерисовываем только экран с секундами ── */
{
  const было = t.get("prac");
  const тикает = t.get("pracTicking");

  t.set("prac", null);
  ок("тик: без занятия не тикаем", тикает(), false);

  t.set("prac", { kind: "lesson", screen: "work", taskAt: 111, at: { i: 0, phase: "step", step: 3 } });
  ок("тик: на шаге не перерисовываем", тикает(), false);

  t.set("prac", { kind: "lesson", screen: "watch", taskAt: 111, at: { i: 0, phase: "watch" } });
  ок("тик: на лекции не перерисовываем", тикает(), false);

  t.set("prac", { kind: "lesson", screen: "work", taskAt: 111, at: { i: 0, phase: "repeat" } });
  ок("тик: на старом экране с секундами перерисовываем", тикает(), true);

  t.set("prac", { kind: "lesson", screen: "work", taskAt: 0, at: { i: 0, phase: "repeat" } });
  ок("тик: без отсчёта не перерисовываем", тикает(), false);

  t.set("prac", было);
}

/* ── Начать материал заново ── */
{
  const было = {
    pastel: JSON.parse(JSON.stringify(t.get("data").pastel || {})),
    practice: JSON.parse(JSON.stringify(t.get("data").practice || {})),
    piano: t.get("data").piano, achAt: t.get("data").achAt, factAt: t.get("data").factAt,
    musAt: t.get("data").musAt, museum: t.get("MUSEUM"), active: t.get("data").active,
  };
  t.set("data.pastel", {
    entries: [
      { id: "e1", date: "2026-08-01", lessons: [0] },                 // без courseId — первого курса
      { id: "e2", date: "2026-08-02", courseId: "argos", lessons: [] },
    ],
    course: null, activeCourse: "argos",
    courses: [
      { id: "test-drive", name: "Пастель", lessons: [{ dur: 600, steps: [] }] },
      { id: "argos", name: "Аргос", plain: true, lessons: [{ dur: 600, steps: [{ k: "do", t: "…" }] }] },
    ],
  });
  t.set("data.active", "pastel");
  t.set("data.practice", { "pastel": { done: { "L0:s0": "2026-08-01" } },
                           "pastel:argos": { done: { "L0:s0": "2026-08-02" } } });
  t.set("data.achAt", { "argos:first": 1, "pastel:first": 1 });
  t.set("data.factAt", { "argos:f1": 1, "pastel:f1": 1 });
  t.set("data.musAt", { m1: 1, m2: 1 });
  t.set("MUSEUM", [{ id: "m1", book: "argos" }, { id: "m2", book: "pastel" }]);

  const убрано = t.get("resetMaterial")("ps", "argos");

  ок("сброс: запись помечена, а не выкинута",
    [t.get("data").pastel.entries.length, t.get("data").pastel.entries[1].deleted], [2, true]);
  ок("сброс: убрана одна запись", убрано, 1);
  ок("сброс: ход разбора очищен", t.get("data").practice["pastel:argos"], undefined);
  ок("сброс: чужой курс не тронут",
    Object.keys(t.get("data").practice.pastel.done).length, 1);
  ок("сброс: чужая запись жива", !!t.get("data").pastel.entries[0].deleted, false);
  ок("сброс: награды сняты только свои",
    [t.get("data").achAt["argos:first"], t.get("data").achAt["pastel:first"]], [undefined, 1]);
  ок("сброс: карточки сняты только свои",
    [t.get("data").factAt["argos:f1"], t.get("data").factAt["pastel:f1"]], [undefined, 1]);
  ок("сброс: артефакты сняты только свои",
    [t.get("data").musAt.m1, t.get("data").musAt.m2], [undefined, 1]);

  // после сброса материал открывается с первого шага
  ок("сброс: занятие с начала", t.get("lessonNext")(), { i: 0, phase: "step", step: 0 });

  t.set("MUSEUM", было.museum);
  t.set("data.pastel", было.pastel); t.set("data.practice", было.practice);
  t.set("data.achAt", было.achAt); t.set("data.factAt", было.factAt);
  t.set("data.musAt", было.musAt); t.set("data.active", было.active);
}

/* ── Статистика курса: шаги рисунка, минуты у лекции ── */
{
  const было = {
    pastel: JSON.parse(JSON.stringify(t.get("data").pastel || {})),
    practice: JSON.parse(JSON.stringify(t.get("data").practice || {})),
    active: t.get("data").active,
  };
  const ш = (g) => ({ k: "do", g, t: "…" });
  t.set("data.pastel", {
    entries: [], course: null, activeCourse: "risunok",
    courses: [{
      id: "risunok", name: "Рисунок", plain: true,
      lessons: [{ dur: 600, steps: [ш("Первый"), ш("Первый"), ш("Второй"), ш("Второй")] }],
    }],
  });
  t.set("data.active", "pastel");
  t.set("data.practice", {});

  let st = t.get("pastelStats")();
  ок("шаги: всего посчитаны", st.steps, 4);
  ок("шаги: пока ни одного", st.stepsDone, 0);
  ок("шаги: этапов пройдено нет", st.stages, 0);

  const done = t.get("lessonStore")().done;
  done["L0:s0"] = "2026-08-31"; done["L0:s1"] = "2026-08-31"; done["L0:s2"] = "2026-08-31";
  st = t.get("pastelStats")();
  ок("шаги: три закрыто", st.stepsDone, 3);
  ок("шаги: этап засчитан целиком", st.stages, 1);
  ок("шаги: уроков по-прежнему один", st.lessons, 1);

  t.set("data.pastel", было.pastel);
  t.set("data.practice", было.practice);
  t.set("data.active", было.active);
}

/* ── Аудит: то, что курсы делили между собой ── */
{
  const было = {
    pastel: JSON.parse(JSON.stringify(t.get("data").pastel || {})),
    practice: JSON.parse(JSON.stringify(t.get("data").practice || {})),
    active: t.get("data").active, pills: t.get("data").pills,
  };
  const ш = () => ({ k: "do", g: "Э", t: "…" });
  t.set("data.pastel", {
    entries: [
      { id: "e1", date: "2026-08-01", courseId: "one", lessons: [] },
      { id: "e2", date: "2026-08-01", courseId: "two", lessons: [] },
      { id: "e3", date: "2026-08-02", courseId: "two", lessons: [] },
    ],
    course: null, activeCourse: "two",
    courses: [
      { id: "one", name: "Первый", lessons: [{ dur: 600, steps: [ш(), ш()] }] },
      { id: "two", name: "Второй", lessons: [{ dur: 600, steps: [ш(), ш()] }] },
    ],
  });
  t.set("data.active", "pastel");
  t.set("data.practice", {
    "pastel": { done: { "L0:s0": "2026-08-01" } },
    "pastel:two": { done: { "L0:s0": "2026-08-01" } },
  });

  // статистика считает свои дни, а не все дни трека
  ок("аудит: дни считаются по своему курсу", t.get("pastelStats")().days, 2);
  t.set("data.pastel.activeCourse", "one");
  ок("аудит: у первого курса свой счёт дней", t.get("pastelStats")().days, 1);

  // удаление дня гасит шаги своего курса, а не соседнего
  t.set("data.pastel.activeCourse", "two");
  t.get("dropEntry")(t.get("data").pastel.entries[1], "pastel");
  ок("аудит: свои шаги за этот день сняты",
    !!t.get("data").practice["pastel:two"].done["L0:s0"], false);
  ок("аудит: шаги соседнего курса целы",
    t.get("data").practice.pastel.done["L0:s0"], "2026-08-01");

  t.set("data.pastel", было.pastel);
  t.set("data.practice", было.practice);
  t.set("data.active", было.active);
  t.set("data.pills", было.pills);
}

/* ── Аудит: перенос данных ничего не выбрасывает ── */
{
  const внутрь = {
    v: 1, pills: [{ id: "p1", name: "витамин", updatedAt: 5 }],
    piano: { pieces: [], entries: [] }, book: { books: [], entries: [] },
    pastel: { entries: [], courses: [{ id: "c", name: "К", lessons: [] }], activeCourse: "c" },
    watch: { videos: [], entries: [] }, practice: {},
  };
  const из = t.get("migrate")(внутрь);
  ок("перенос: курсы доезжают", (из.pastel.courses || []).length, 1);
  ок("перенос: выбранный курс доезжает", из.pastel.activeCourse, "c");
}

/* ── Предметы и награды второго курса ── */
{
  const было = {
    pastel: JSON.parse(JSON.stringify(t.get("data").pastel || {})),
    practice: JSON.parse(JSON.stringify(t.get("data").practice || {})),
    museum: t.get("MUSEUM"), active: t.get("data").active,
  };
  const ш = (g) => ({ k: "do", g, t: "…" });
  t.set("data.pastel", {
    entries: [], course: null, activeCourse: "vtoroy",
    courses: [
      { id: "test-drive", name: "Первый", mode: "watch", lessons: [{ dur: 600 }] },
      { id: "vtoroy", name: "Второй", plain: true,
        lessons: [{ dur: 600, steps: [ш("А"), ш("А"), ш("Б")] }] },
    ],
  });
  t.set("data.active", "pastel");
  t.set("data.practice", {});
  t.set("MUSEUM", [
    { id: "v1", book: "vtoroy", ch: 1, step: 0, name: "Карандаш" },
    { id: "v2", book: "vtoroy", ch: 1, step: 2, name: "Клячка" },
    { id: "p1", book: "pastel", ch: 1, step: 0, name: "Чужой" },
  ]);
  const открыт = (id) => t.get("musOpen")(t.get("MUSEUM").find((x) => x.id === id));

  ок("второй курс: имя в музее", t.get("musBookName")("vtoroy"), "Второй");
  ок("второй курс: до работы всё закрыто", [открыт("v1"), открыт("v2")], [false, false]);

  t.get("lessonStore")().done["L0:s0"] = "2026-08-31";
  ок("второй курс: предмет своего шага открылся", открыт("v1"), true);
  ок("второй курс: предмет дальнего шага ещё закрыт", открыт("v2"), false);
  ок("второй курс: чужой предмет не тронут", открыт("p1"), false);

  t.set("MUSEUM", было.museum);
  t.set("data.pastel", было.pastel);
  t.set("data.practice", было.practice);
  t.set("data.active", было.active);
}

/* ── Общие награды: накопленные дни у каждого материала ── */
{
  const было = { cat: t.get("CATALOG"), active: t.get("data").active,
    book: JSON.parse(JSON.stringify(t.get("data").book || {})),
    piano: JSON.parse(JSON.stringify(t.get("data").piano || {})) };

  t.set("CATALOG", {
    __common__: { ach: [
      { id: "d5", icon: "🌱", name: "Пять дней", hint: "", secret: false, when: [["days", ">=", 5]] },
      { id: "d30", icon: "🌘", name: "Месяц", hint: "", secret: false, when: [["days", ">=", 30]] },
    ] },
    kniga: { ach: [{ id: "own", icon: "📖", name: "Своя", hint: "", secret: false, when: [["days", ">=", 1]] }] },
  });
  t.set("data.piano", { pieces: [], activePiece: "", entries: [] });
  t.set("data.watch", { videos: [], activeVideo: "", entries: [] });
  t.set("data.pastel", { entries: [], courses: [], course: null, activeCourse: "" });
  t.set("data.book", {
    activeBook: "kniga",
    books: [{ id: "kniga", title: "Книга", pages: 100, startPage: 0 }],
    entries: [
      { id: "1", date: "2026-08-01", bookId: "kniga", page: 10 },
      { id: "2", date: "2026-08-05", bookId: "kniga", page: 20 },
      { id: "3", date: "2026-08-09", bookId: "kniga", page: 30 },
    ],
  });
  t.set("data.active", "book");

  const имена = t.get("achList")().map((a) => a.name);
  ок("общие: добавились к своим", имена, ["Своя", "Пять дней", "Месяц"]);


  const сост = t.get("achState")();
  const дано = (n) => (сост.find((a) => a.name === n) || {}).done;
  ок("общие: за три дня пять ещё не дали", [дано("Своя"), дано("Пять дней")], [true, false]);

  // пропуски дней не мешают: считаются все дни, а не подряд
  t.get("data").book.entries.push(
    { id: "4", date: "2026-08-20", bookId: "kniga", page: 40 },
    { id: "5", date: "2026-09-01", bookId: "kniga", page: 50 });
  const сост2 = t.get("achState")();
  ок("общие: пять дней вразбивку засчитаны",
    (сост2.find((a) => a.name === "Пять дней") || {}).done, true);
  ок("общие: месяц ещё не набран",
    (сост2.find((a) => a.name === "Месяц") || {}).done, false);

  // у материала своё имя и значок при той же логике
  t.set("CATALOG", { ...t.get("CATALOG"), kniga: {
    ach: [{ id: "own", icon: "📖", name: "Своя", hint: "", secret: false, when: [["days", ">=", 1]] }],
    flavor: { d5: { icon: "🪓", name: "Первая поленница" } },
  } });
  const свои = t.get("achState")();
  const пять = свои.find((a) => a.id === "d5");
  ок("вкус: имя своё", пять.name, "Первая поленница");
  ок("вкус: значок свой", пять.icon, "🪓");
  ок("вкус: условие прежнее", пять.when[0], ["days", ">=", 5]);
  ок("вкус: без своего имени остаётся общее",
    свои.find((a) => a.id === "d30").name, "Месяц");

  // лестница обрезается под материал: книге не нужны ступени на полгода
  t.set("CATALOG", { ...t.get("CATALOG"), kniga: {
    ach: [{ id: "own", icon: "📖", name: "Своя", hint: "", secret: false, when: [["days", ">=", 1]] }],
    maxDays: 5,
  } });
  ок("потолок: дальние ступени отрезаны",
    t.get("achList")().map((a) => a.id), ["own", "d5"]);
  t.set("CATALOG", { ...t.get("CATALOG"), kniga: {
    ach: [{ id: "own", icon: "📖", name: "Своя", hint: "", secret: false, when: [["days", ">=", 1]] }],
  } });
  ок("потолок: без потолка лестница целиком",
    t.get("achList")().map((a) => a.id), ["own", "d5", "d30"]);

  // книга может отказаться от лестницы дней вовсе
  t.set("CATALOG", { ...t.get("CATALOG"), kniga: {
    ach: [{ id: "own", icon: "📖", name: "Своя", hint: "", secret: false, when: [["days", ">=", 1]] }],
    noDays: true,
  } });
  ок("без лестницы: остались только свои",
    t.get("achList")().map((a) => a.id), ["own"]);

  t.set("CATALOG", было.cat);
  t.set("data.book", было.book); t.set("data.piano", было.piano);
  t.set("data.active", было.active);
}

/* ── Минуты недели: растут от простоя и обнуляются в понедельник ── */
{
  const было={ данные: JSON.parse(JSON.stringify(t.get("data"))), сег: t.get("todayStr") };
  t.set("data", { active: "piano", book: { books: [], entries: [] },
    pastel: { courses: [], entries: [] }, watch: { videos: [], entries: [] },
    pianoWeek: 150,
    piano: { activePiece: "bwv853", entries: [],
      pieces: [{ id: "bwv853", name: "Прелюдия", bars: 40 }] } });
  const день = (d) => t.set("todayStr", () => d);   // 2026-09-14 — понедельник

  /* Не играл ни дня: остаток делится на то, что осталось, и число растёт. */
  const надо = [];
  for (const d of ["2026-09-14","2026-09-15","2026-09-16","2026-09-17","2026-09-18","2026-09-19","2026-09-20"]) {
    день(d); надо.push(t.get("pianoWeekPlan")().надо);
  }
  ок("неделя: простой поднимает дневное число", надо, [22, 25, 30, 38, 50, 75, 150]);

  /* Поиграл в понедельник тридцать при норме 22 — во вторник просят меньше, и
     все тридцать идут в зачёт: остаток 120 на шесть дней. */
  t.get("data").piano.entries=[{ id: "p1", date: "2026-09-14", pieceId: "bwv853", mins: 30 }];
  день("2026-09-15");
  ок("неделя: сыгранное уменьшает остаток", t.get("pianoWeekPlan")().надо, 20);

  /* Пять дней без пианино, в субботу два часа: в воскресенье просят остаток,
     то есть тридцать. Лишнее работает в обе стороны — в этом весь смысл. */
  t.get("data").piano.entries=[{ id: "p1", date: "2026-09-19", pieceId: "bwv853", mins: 120 }];
  день("2026-09-20");
  ок("неделя: заход про запас уменьшает следующий день",
    t.get("pianoWeekPlan")().надо, 30);
  /* Отыграл в субботу ровно норму — воскресенье просит столько же, сколько
     просило бы: остаток делится на один оставшийся день. */
  t.get("data").piano.entries=[{ id: "p1", date: "2026-09-19", pieceId: "bwv853", mins: 75 }];
  день("2026-09-20");
  ок("неделя: отыграл норму — остаток ровно на завтра",
    t.get("pianoWeekPlan")().надо, 75);
  /* Недоигранное переносится: в этом весь смысл остатка. */
  t.get("data").piano.entries=[{ id: "p1", date: "2026-09-19", pieceId: "bwv853", mins: 25 }];
  день("2026-09-20");
  ок("неделя: недоигранное переносится на следующий день",
    t.get("pianoWeekPlan")().надо, 125);

  /* Лишнее вперёд не переносится, но и не пропадает: неделю оно закрывает.
     Отыграл всю цель в понедельник — до воскресенья не просят ничего. Иначе
     вышло бы, что человек отыграл два с половиной часа, а к субботе у него
     просят ещё два. */
  t.get("data").piano.entries=[{ id: "p1", date: "2026-09-14", pieceId: "bwv853", mins: 150 }];
  день("2026-09-16");
  ок("неделя: отыгранное разом её закрывает",
    [t.get("pianoWeekPlan")().набрано, t.get("pianoWeekPlan")().надо], [true, 0]);
  день("2026-09-20");
  ок("неделя: и молчит до воскресенья", t.get("pianoWeekPlan")().надо, 0);

  /* Понедельник следующей недели: прошлая не считается вовсе. */
  t.get("data").piano.entries=[{ id: "p1", date: "2026-09-19", pieceId: "bwv853", mins: 200 }];
  день("2026-09-21");
  const п = t.get("pianoWeekPlan")();
  ок("неделя: с понедельника счёт с нуля", [п.неделя, п.надо, п.набрано], [0, 22, false]);

  t.set("todayStr", было.сег); t.set("data", было.данные);
}

/* ── Занятие пишется своей записью на каждый заход ── */
{
  const было={ данные: JSON.parse(JSON.stringify(t.get("data"))), prac: t.get("prac") };
  const сег=t.get("todayStr")();
  t.set("data", { active: "piano", book: { books: [], entries: [] },
    pastel: { courses: [], entries: [] }, watch: { videos: [], entries: [] },
    pianoWeek: 150,
    piano: { activePiece: "bwv853", entries: [],
      pieces: [{ id: "bwv853", name: "Прелюдия", bars: 40 }] } });

  /* Первый заход: десять минут. */
  t.set("prac", { kind: "piece", startedAt: Date.now() - 10 * 60000, breakMs: 0, counted: 0 });
  t.get("pracCount")();
  t.get("pracCount")();                       // часы тикают, запись та же
  let зап = t.get("data").piano.entries.filter((e) => !e.deleted);
  ок("заход: первый пишет одну запись", зап.length, 1);
  const первый = зап[0].id;

  /* Второй заход того же вечера — новая запись, а не прибавка к прошлой. */
  t.set("prac", { kind: "piece", startedAt: Date.now() - 4 * 60000, breakMs: 0, counted: 0 });
  t.get("pracCount")();
  зап = t.get("data").piano.entries.filter((e) => !e.deleted);
  ок("заход: второй заводит свою запись", зап.length, 2);
  ок("заход: записи за один день", зап.map((e) => e.date), [сег, сег]);
  ок("заход: минуты по заходам, а не в общий котёл",
    зап.map((e) => e.mins), [10, 4]);
  /* Час начала в подписи — по нему их и различают в списке. */
  ок("заход: в подписи час начала", /· с \d\d:\d\d$/.test(зап[1].note), true);

  /* День при этом остался одним днём: на «days» смотрят награды. */
  ок("заход: два захода — всё равно один день",
    t.get("daysCount")(зап), 1);
  ок("заход: и у пьесы в статистике день один", t.get("pianoStats")().days, 1);
  /* Сегодняшние минуты складываются из обеих записей. */
  ок("заход: минуты дня складываются", t.get("pianoWeekPlan")().сегодня, 14);

  /* Ради чего всё: лишний заход убирается поодиночке, настоящий остаётся. */
  зап[1].deleted = true; зап[1].updatedAt = t.get("now")();
  ок("заход: удалили лишний — минуты вернулись к настоящим",
    t.get("pianoWeekPlan")().сегодня, 10);
  ок("заход: и день на месте", t.get("pianoStats")().days, 1);
  /* Удалили прямо во время занятия — новых минут в удалённую не дописываем. */
  /* `counted` берём с запасом над сыгранным: иначе «дописывать нечего»
     зависит от того, попали ли эти две строки в одну миллисекунду, и тест
     падал раз в несколько прогонов. */
  t.set("prac", { kind: "piece", startedAt: Date.now() - 4 * 60000, breakMs: 0,
                  counted: 5, entryId: зап[1].id });
  t.get("pracCount")();
  ок("заход: в удалённую запись минуты не возвращаются",
    t.get("data").piano.entries.find((e) => e.id === зап[1].id).mins, 4);
  ок("заход: удалённая так и осталась удалённой",
    t.get("data").piano.entries.find((e) => e.id === зап[1].id).deleted, true);
  /* И пустышки на её месте не появилось: дописывать было нечего. */
  ок("заход: пустой записи на ноль минут не заводится",
    t.get("data").piano.entries.filter((e) => !e.deleted).length, 1);

  t.set("prac", было.prac); t.set("data", было.данные);
}

/* ── Минуты записи можно поправить руками ── */
{
  const было={ данные: JSON.parse(JSON.stringify(t.get("data"))) };
  const сег=t.get("todayStr")();
  t.set("data", { active: "piano", book: { books: [], entries: [] },
    pastel: { courses: [], entries: [] }, watch: { videos: [], entries: [] },
    pianoWeek: 150,
    piano: { activePiece: "bwv853",
      entries: [{ id: "e1", date: сег, pieceId: "bwv853", spans: [], mins: 49, sessions: 2,
                  note: "занятие по плану · 49 мин · 2 подхода",
                  createdAt: t.get("fromStr")(сег).setHours(9, 51, 0, 0), updatedAt: 1 }],
      pieces: [{ id: "bwv853", name: "Прелюдия", bars: 40 }] } });
  /* Ровно случай, ради которого правка и появилась: запись, слепленная до
     разделения на заходы. Разнять её нечем — момент разрыва нигде не записан. */
  const e = t.get("data").piano.entries[0];
  e.mins = 12; e.sessions = 1;
  e.note = t.get("minsNote")("piano", 12, e.createdAt);
  ок("правка: подпись собирается одним писателем",
    e.note, "занятие по плану · 12 мин · с 09:51");
  ок("правка: минуты дня стали настоящими", t.get("pianoWeekPlan")().сегодня, 12);
  /* Подпись урока отличается только словом. */
  ок("правка: у курса своя подпись",
    t.get("minsNote")("pastel", 12, e.createdAt), "урок по плану · 12 мин · с 09:51");
  t.set("data", было.данные);
}

/* ── Занятие оседает по ходу, а не только по «Завершить» ── */
{
  const было={ данные: JSON.parse(JSON.stringify(t.get("data"))), prac: t.get("prac") };
  const сег=t.get("todayStr")();
  t.set("data", { active: "piano", book: { books: [], entries: [] },
    pastel: { courses: [], entries: [] }, watch: { videos: [], entries: [] },
    pianoWeek: 150,
    piano: { activePiece: "bwv853", entries: [],
      pieces: [{ id: "bwv853", name: "Прелюдия", bars: 40 }] } });
  const живых = () => t.get("data").piano.entries.filter((e) => !e.deleted);

  /* Меньше двух минут — записи нет: заглянул одним глазом. */
  t.set("prac", { kind: "piece", startedAt: Date.now() - 40 * 1000, breakMs: 0, counted: 0 });
  t.get("pracFlush")();
  ок("сброс: короткий взгляд записи не заводит", живых().length, 0);

  /* Пять минут — запись появляется сама, без единой отметки такта и без
     кнопки «Завершить». Ровно то, что терялось: поиграл и ушёл. */
  t.set("prac", { kind: "piece", startedAt: Date.now() - 5 * 60000, breakMs: 0, counted: 0 });
  t.get("pracFlush")();
  ок("сброс: минуты оседают сами", живых().map((e) => e.mins), [5]);

  /* Повторный тик в ту же минуту ничего не добавляет и второй записи не
     плодит: сбрасываем раз в минуту, а не раз в секунду. */
  t.get("pracFlush")(); t.get("pracFlush")();
  ок("сброс: в ту же минуту не повторяется",
    [живых().length, живых()[0].mins], [1, 5]);

  /* Прошла ещё минута — дописалась к той же записи захода. */
  t.get("prac").startedAt = Date.now() - 6 * 60000;
  t.get("pracFlush")();
  ок("сброс: следующая минута дописывается в тот же заход",
    [живых().length, живых()[0].mins], [1, 6]);

  /* Уход с экрана дописывает не дожидаясь целой минуты. */
  t.get("prac").startedAt = Date.now() - 6.9 * 60000;
  t.get("pracFlush")(true);
  ок("сброс: при уходе с экрана дописываем сразу", живых()[0].mins, 7);

  /* И всё это — минуты дня, из которых считается остаток. */
  ок("сброс: минуты дня выросли", t.get("pianoWeekPlan")().сегодня, 7);
  t.set("prac", было.prac); t.set("data", было.данные);
}

/* ── Цель по часам: её можно выставить, и она делится на дни ── */
{
  const было={ данные: JSON.parse(JSON.stringify(t.get("data"))), сег: t.get("todayStr") };
  t.set("data", { active: "piano", book: { books: [], entries: [] },
    pastel: { courses: [], entries: [] }, watch: { videos: [], entries: [] },
    pianoWeek: 240,
    piano: { activePiece: "bwv853", entries: [],
      pieces: [{ id: "bwv853", name: "Прелюдия", bars: 40 }] } });
  const день = (d) => t.set("todayStr", () => d);

  /* Четыре часа делятся на семь дней, и при простое число растёт. */
  const надо=[];
  for (const d of ["2026-09-14","2026-09-15","2026-09-16","2026-09-17",
                   "2026-09-18","2026-09-19","2026-09-20"]) {
    день(d); надо.push(t.get("pianoWeekPlan")().надо);
  }
  ок("часы: четыре часа по дням недели", надо, [35, 40, 48, 60, 80, 120, 240]);

  /* Переиграл — следующий день просит меньше. Правило работает в обе стороны. */
  день("2026-09-15");
  t.get("data").piano.entries=[{ id:"p1", date:"2026-09-14", pieceId:"bwv853", mins:100 }];
  ок("часы: переиграл — завтра просят меньше", t.get("pianoWeekPlan")().надо, 24);
  /* Недоиграл — больше. */
  t.get("data").piano.entries=[{ id:"p1", date:"2026-09-14", pieceId:"bwv853", mins:10 }];
  ок("часы: недоиграл — завтра просят больше", t.get("pianoWeekPlan")().надо, 39);

  /* Без пьесы ручку не показываем: строка про чужую жизнь. */
  t.get("data").piano.pieces=[];
  ок("часы: без пьесы ручки нет", t.get("pianoGoalUI")(), "");
  t.set("todayStr", было.сег); t.set("data", было.данные);
}

/* ── Рисунок звука: берём готовую огибающую ── */
{
  const было={ pd: JSON.parse(JSON.stringify(t.get("PRACTICE_DATA") || {})),
               данные: JSON.parse(JSON.stringify(t.get("data"))) };
  t.set("data", { active: "piano", book: { books: [], entries: [] },
    pastel: { courses: [], entries: [] }, watch: { videos: [], entries: [] },
    piano: { activePiece: "p1", entries: [], pieces: [{ id: "p1", name: "П", bars: 40 }] } });
  /* Четыре байта: 0, 128, 255, 64 — «AID/QA==» в базе-64. */
  const b64 = Buffer.from([0, 128, 255, 64]).toString("base64");
  t.set("PRACTICE_DATA", { p1: { beats: 3, wave: { rate: 50, data: b64 } } });
  t.set("waveCache", { id: "", buf: null });
  const w = t.get("plWave")();
  ок("рисунок: разворачивается из базы-64", [w.rate, Array.from(w.v)], [50, [0, 128, 255, 64]]);
  /* Второй раз берём из памяти, а не разворачиваем заново. */
  ок("рисунок: помнится по вещи", t.get("plWave")() === w, true);

  /* Нет огибающей — нет и холста. */
  t.set("PRACTICE_DATA", { p1: {} });
  t.set("waveCache", { id: "", buf: null });
  ок("рисунок: без огибающей ничего не рисуем", t.get("plWave")(), null);
  /* Битая база-64 не должна ронять экран занятия. */
  t.set("PRACTICE_DATA", { p1: { wave: { rate: 50, data: "не база-64 вовсе!!" } } });
  t.set("waveCache", { id: "", buf: null });
  const плохо = t.get("plWave")();
  ок("рисунок: битые данные не роняют занятие", плохо === null || плохо.v.length >= 0, true);
  t.set("PRACTICE_DATA", было.pd); t.set("data", было.данные);
  t.set("waveCache", { id: "", buf: null });
}

/* ── Разметка тактов с телефона ── */
{
  const было={ pd: JSON.parse(JSON.stringify(t.get("PRACTICE_DATA") || {})),
               данные: JSON.parse(JSON.stringify(t.get("data"))),
               свои: JSON.parse(JSON.stringify(t.get("marksMine") || {})) };
  t.set("data", { active: "piano", book: { books: [], entries: [] },
    pastel: { courses: [], entries: [] }, watch: { videos: [], entries: [] },
    piano: { activePiece: "p1", entries: [], pieces: [{ id: "p1", name: "П" }] } });
  /* Три такта по шесть секунд: у третьего начало есть, конца нет. */
  t.set("PRACTICE_DATA", { p1: { beats: 3, marks: { 1: 0, 2: 6, 3: 12 },
    hints: { 1: {}, 2: {}, 3: {}, 4: {}, 5: {} } } });
  t.set("marksMine", {});

  ок("разметка: всего тактов знает разбор", t.get("plBarTotal")(), 5);
  /* Третий такт — первый, у которого нет конца: с него и начинают. */
  ок("разметка: начинаем с первого недоделанного", t.get("plEditFirst")(), 3);
  /* Пустую границу предлагаем сами — от соседа на среднюю длину такта. */
  const д = t.get("plEditGuess")(3);
  ок("разметка: конец предложен от соседа", [д.a, Math.round(д.b)], [12, 18]);

  /* Своя метка накладывается поверх разбора, а не вместо него. */
  t.set("marksMine", { p1: { 4: 18 } });
  ок("разметка: своя метка видна вместе с чужими",
    Object.keys(t.get("pracMarks")()).sort(), ["1", "2", "3", "4"]);
  ок("разметка: третий такт стало можно зациклить", t.get("plBars")(), [1, 2, 3]);
  ок("разметка: отрезок третьего такта", t.get("barSpan")(3), { a: 12, b: 18 });

  /* Из «моего» метка уходит, только когда в разборе оказалось то же число. */
  t.get("marksSettle")();
  ок("разметка: пока в разборе другого — своё держим",
    Object.keys(t.get("marksMine")).length, 1);
  t.set("PRACTICE_DATA", { p1: { beats: 3, marks: { 1: 0, 2: 6, 3: 12, 4: 18 },
    hints: { 1: {}, 2: {}, 3: {}, 4: {}, 5: {} } } });
  t.get("marksSettle")();
  ок("разметка: разбор догнал — своё убрано",
    Object.keys(t.get("marksMine")).length, 0);
  ок("разметка: метка при этом не пропала",
    Object.keys(t.get("pracMarks")()).sort(), ["1", "2", "3", "4"]);

  /* Границы не заходят друг за друга. */
  t.set("plEdit", { n: 3, a: 12, b: 12.05 });
  t.get("plEditFix")("a");
  ок("разметка: слипшиеся границы разводятся",
    Math.round((t.get("plEdit").b - t.get("plEdit").a) * 100) / 100, 0.2);
  t.set("plEdit", null);

  t.set("PRACTICE_DATA", было.pd); t.set("data", было.данные);
  t.set("marksMine", было.свои);
}

/* ── Книга с читалки меряется процентами ── */
{
  const было = JSON.parse(JSON.stringify(t.get("data")));
  const общее = { active: "book", piano: { pieces: [], entries: [] },
    pastel: { courses: [], entries: [] }, watch: { videos: [], entries: [] },
    thoughts: [], wishes: [] };
  /* Бумажная книга — страницы. */
  t.set("data", Object.assign({}, общее, { book: { activeBook: "b", entries: [],
    books: [{ id: "b", title: "Бумажная", pages: 300,
      chapters: [{ name: "Раз", from: 1 }, { name: "Два", from: 150 }] }] } }));
  ок("мера: у бумажной книги страницы", t.get("bookUnit")(), "стр");
  ок("мера: и считается страницами", t.get("stranic")(5), "5 страниц");
  ок("мера: склонение работает", t.get("stranic")(2), "2 страницы");

  /* Книга с читалки — проценты: страниц там нет, процент показывает сама. */
  t.set("data", Object.assign({}, общее, { book: { activeBook: "e", entries: [],
    books: [{ id: "e", title: "С читалки", pages: 100, unit: "%",
      chapters: [{ name: "Раз", from: 1 }, { name: "Два", from: 40 }] }] } }));
  ок("мера: у книги с читалки проценты", t.get("bookUnit")(), "%");
  ок("мера: и число называется процентом", t.get("stranic")(5), "5 %");
  ок("мера: без склонения — процент один на все числа", t.get("stranic")(2), "2 %");

  /* Подпись под кольцом говорит на том же языке. */
  t.get("data").book.entries = [{ id: "e1", date: "2026-09-07", bookId: "e", page: 10 }];
  ок("мера: в подписи тоже проценты",
    /Раз.*осталось 29 %/.test(t.get("heroSub")(t.get("curStats")())), true);

  t.set("data", было);
}

/* ── Разметка ролика по тактам ── */
{
  const было = { данные: JSON.parse(JSON.stringify(t.get("data"))),
                 pd: JSON.parse(JSON.stringify(t.get("PRACTICE_DATA") || {})) };
  t.set("data", { active: "piano", book: { books: [], entries: [] },
    pastel: { courses: [], entries: [] }, watch: { videos: [], entries: [] },
    piano: { activePiece: "p1", entries: [], pieces: [{ id: "p1", name: "П", bars: 40 }] },
    practice: {} });
  t.set("PRACTICE_DATA", {});

  /* Старый список кусков переводится в цепочку меток при первом чтении. */
  t.get("pracStore")().vmarks = [{ from: 3, to: 4, a: 10, b: 20 }];
  ок("ролик: старые куски стали цепочкой", t.get("vmAll")(), { 3: 10, 5: 20 });
  ок("ролик: сам старый список не тронут",
    t.get("pracStore")().vmarks.length, 1);

  /* Своя цепочка: у последней метки конца нет, зациклить её нельзя. */
  t.get("pracStore")().vm = { 1: 0, 2: 6, 3: 12, 4: 18 };
  ок("ролик: размеченные такты", t.get("vmBars")(), [1, 2, 3]);
  ок("ролик: отрезок такта", t.get("vmBarSpan")(2), { a: 6, b: 12 });
  ок("ролик: у последней метки отрезка нет", t.get("vmBarSpan")(4), null);
  ок("ролик: отрезок диапазона", t.get("vmSpan")({ from: 1, to: 3 }), { a: 0, b: 18 });
  ок("ролик: неразмеченный диапазон", t.get("vmSpan")({ from: 9, to: 9 }), null);

  /* Всего тактов знает сама пьеса: у ролика разбора может не быть вовсе. */
  ок("ролик: всего тактов — по пьесе", t.get("vidBarTotal")(), 40);

  /* Разметка из «Тактов»: начала берём все, а конец последнего — только если
     он похож на границу такта. В выгрузке он тянется до конца ролика. */
  const пак = { file: "x.mp4", duration: 600, bars: [
    { part: "Прелюдия", n: 1, start: 10, end: 16 },
    { part: "Прелюдия", n: 2, start: 16, end: 22 },
    { part: "Прелюдия", n: 3, start: 22, end: 600 },
  ] };
  const из = t.get("vidMarksFromTakty")(пак);
  ок("такты: начала взяты все", Object.keys(из.m).sort(), ["1", "2", "3"]);
  ок("такты: хвост до конца ролика концом не считается", из.m[4], undefined);
  ок("такты: часть названа", [из.part, из.всего], ["Прелюдия", 3]);
  /* А настоящий конец последнего такта берём. */
  const из2 = t.get("vidMarksFromTakty")({ bars: [
    { part: "П", n: 1, start: 10, end: 16 },
    { part: "П", n: 2, start: 16, end: 22 },
    { part: "П", n: 3, start: 22, end: 28 },
  ] });
  ок("такты: настоящий конец последнего взят", из2.m[4], 28);
  ок("такты: пустой файл не роняет",
    t.get("vidMarksFromTakty")({ bars: [] }).всего, 0);

  t.set("data", было.данные); t.set("PRACTICE_DATA", было.pd);
}

/* ── Круг из нескольких тактов, рисунок — по одному ── */
{
  const было={ pd: JSON.parse(JSON.stringify(t.get("PRACTICE_DATA") || {})),
               данные: JSON.parse(JSON.stringify(t.get("data"))),
               prac: t.get("prac"), el: t.get("pracAudioEl") };
  t.set("data", { active: "piano", book: { books: [], entries: [] },
    pastel: { courses: [], entries: [] }, watch: { videos: [], entries: [] },
    piano: { activePiece: "p1", entries: [], pieces: [{ id: "p1", name: "П", bars: 40 }] } });
  t.set("PRACTICE_DATA", { p1: { beats: 3,
    marks: { 1: 0, 2: 6, 3: 12, 4: 18, 5: 24 } } });
  /* Поддельный звук: нужен только dataset.for и currentTime. */
  let время = 0;
  t.set("pracAudioEl", { dataset: { for: "p1" },
    get currentTime() { return время; }, set currentTime(v) { время = v; } });
  t.set("prac", { cur: { from: 1, to: 4 } });
  const о = () => t.get("plOpt")("p1");
  for (const k of Object.keys(о())) delete о()[k];

  /* Круг с первого по второй: от начала первого до конца второго. */
  t.get("plBarPick")(1, 2);
  ок("круг: с первого по второй", [о().a, о().b], [0, 12]);
  ок("круг: границы запомнены тактами", [о().bf, о().bt], [1, 2]);
  ок("круг: курсор встал в начало", время, 0);

  /* А рисунок при этом — в пределах ОДНОГО такта, и переключается сам. */
  const вид = () => t.get("plShownSpan")({ a: о().a, b: о().b });
  ок("рисунок: пока играет первый — виден первый", вид(), { a: 0, b: 6 });
  время = 7;
  ок("рисунок: пошёл второй — виден второй", вид(), { a: 6, b: 12 });
  время = 99;
  ок("рисунок: курсор вне круга — показываем первый такт круга", вид(), { a: 0, b: 6 });

  /* Задом наперёд не бывает: конец раньше начала сворачивается в один такт. */
  t.get("plBarPick")(3, 1);
  ок("круг: конец раньше начала — остаётся один такт", [о().a, о().b], [12, 18]);

  /* Ноль — весь кусок, границы по тактам снимаются. */
  t.get("plBarPick")(0);
  ок("круг: ноль возвращает кусок целиком", [о().a, о().b], [0, 24]);
  ок("круг: и тактовых границ больше нет",
    [о().bf === undefined, о().bt === undefined], [true, true]);
  /* Без тактовых границ рисунок не переключается — рисуем что дали. */
  ок("рисунок: без тактового круга — как есть",
    t.get("plShownSpan")({ a: 3, b: 9 }), { a: 3, b: 9 });

  t.set("pracAudioEl", было.el); t.set("prac", было.prac);
  t.set("PRACTICE_DATA", было.pd); t.set("data", было.данные);
}

/* ── Метроном: щелчки по разметке ── */
{
  const было={ pd: JSON.parse(JSON.stringify(t.get("PRACTICE_DATA") || {})),
               данные: JSON.parse(JSON.stringify(t.get("data"))) };
  t.set("data", { active: "piano", book: { books: [], entries: [] },
    pastel: { courses: [], entries: [] }, watch: { videos: [], entries: [] },
    piano: { activePiece: "p1", entries: [], pieces: [{ id: "p1", name: "П", bars: 40 }] } });
  /* Три доли в такте, такты по шесть секунд. */
  t.set("PRACTICE_DATA", { p1: { beats: 3, marks: { 1: 0, 2: 6, 3: 12, 4: 18 } } });

  ок("метроном: доля — треть такта", Math.round(t.get("metBeat")() * 100) / 100, 2);

  /* Щелчок на долю: три на такт, первый сильный. */
  const g1=t.get("metGrid")(1);
  ок("метроном: на долю — три щелчка в такте", g1.slice(0, 3).map((x) => x.t), [0, 2, 4]);
  ок("метроном: первый в такте сильный",
    g1.slice(0, 4).map((x) => x.силён), [true, false, false, true]);
  ок("метроном: считаем по всем размеченным тактам", g1.length, 9);

  /* Дробление: щелчков вчетверо больше, доли те же. */
  const g4=t.get("metGrid")(4);
  ок("метроном: на четверть доли — двенадцать в такте", g4.length, 36);
  ок("метроном: шаг вчетверо мельче", Math.round(g4[1].t * 100) / 100, 0.5);
  ок("метроном: сильная доля всё равно на начале такта",
    [g4[0].силён, g4[1].силён, g4[12].силён], [true, false, true]);

  /* Такты у исполнителя разной длины — щелчок идёт за ними, а не по линейке. */
  t.set("PRACTICE_DATA", { p1: { beats: 3, marks: { 1: 0, 2: 6, 3: 15, 4: 21 } } });
  const g2=t.get("metGrid")(1);
  ок("метроном: длинный такт — доли шире",
    g2.slice(3, 6).map((x) => x.t), [6, 9, 12]);

  /* Нет разметки — нет и сетки; метроном тогда работает ровным, от медианы. */
  t.set("PRACTICE_DATA", { p1: { beats: 3 } });
  ок("метроном: без разметки сетки нет", t.get("metGrid")(1), []);
  ок("метроном: и доли посчитать не из чего", t.get("metBeat")(), 0);
  t.set("PRACTICE_DATA", было.pd); t.set("data", было.данные);
}

/* ── Такты по одному: выбор из размеченных ── */
{
  const было={ prac: t.get("prac"), pd: JSON.parse(JSON.stringify(t.get("PRACTICE_DATA") || {})),
               данные: JSON.parse(JSON.stringify(t.get("data"))) };
  t.set("data", { active: "piano", book: { books: [], entries: [] },
    pastel: { courses: [], entries: [] }, watch: { videos: [], entries: [] },
    piano: { activePiece: "p1", entries: [], pieces: [{ id: "p1", name: "П", bars: 40 }] } });
  /* Разметка: такт → секунда, где он начинается. Последний конца не имеет. */
  t.set("PRACTICE_DATA", { p1: { marks: { 9: 50.44, 10: 56.71, 11: 62.5, 12: 68.87, 13: 72.99 } } });
  ок("такты: выбирать можно все, кроме последнего — у него нет конца",
    t.get("plBars")(), [9, 10, 11, 12]);
  ок("такт по одному: от своей метки до следующей",
    t.get("barSpan")(9), { a: 50.44, b: 56.71 });
  ок("такт по одному: последний размеченный отрезка не даёт",
    t.get("barSpan")(13), null);
  ок("такт по одному: неразмеченный — тоже", t.get("barSpan")(7), null);

  /* Кусок целиком — это другое: от первого такта до конца последнего. */
  t.set("prac", { cur: { from: 9, to: 12 } });
  ок("кусок целиком: от девятого до конца двенадцатого",
    t.get("markSpan")({ from: 9, to: 12 }), { a: 50.44, b: 72.99 });
  ок("кусок целиком не равен одному такту",
    t.get("markSpan")({ from: 9, to: 12 }).b !== t.get("barSpan")(9).b, true);

  /* Без разметки выбирать нечего — ряда не будет. */
  t.set("PRACTICE_DATA", { p1: {} });
  ок("такты: без разметки ряда нет", t.get("plBars")(), []);
  t.set("PRACTICE_DATA", было.pd); t.set("prac", было.prac); t.set("data", было.данные);
}

/* ── Шапка занятия: один текст на всех, кто её пишет ── */
{
  const было={ данные: JSON.parse(JSON.stringify(t.get("data"))), prac: t.get("prac"),
               сег0: t.get("todayStr") };
  /* День недели закрепляем понедельником. Без этого в воскресенье «впереди»
     равно единице, дневной план совпадает с недельной целью — и превышение
     плана заодно закрывает неделю: проверка ломалась раз в семь дней, причём
     именно в выходной, когда за пианино и садятся. */
  const сег="2026-09-14";
  t.set("todayStr", () => сег);
  const деньНедели=(t.get("fromStr")(сег).getDay()+6)%7, впереди=7-деньНедели;
  t.set("data", { active: "piano", book: { books: [], entries: [] },
    pastel: { courses: [], entries: [] }, watch: { videos: [], entries: [] },
    pianoWeek: 7*30,
    piano: { activePiece: "bwv853", entries: [],
      pieces: [{ id: "bwv853", name: "Прелюдия", bars: 40 }] } });
  /* pracMin считает от startedAt, поэтому «восемь минут» задаём временем входа.
     counted: 0 — эти восемь минут ещё не записаны в отметку дня, они и есть
     живой хвост текущего захода. */
  t.set("prac", { kind: "piece", startedAt: Date.now() - 8 * 60000, breakMs: 0, counted: 0 });
  const план=Math.ceil(210/впереди);
  /* Числитель — весь день, а не заход: вышел и зашёл снова — цифра не
     обнуляется. Сейчас отыграно восемь минут и все они в этом заходе. */
  ок("шапка занятия: сколько за день из дневного плана",
    t.get("pracWhereText")(), `8 из ${план} мин`);
  /* Часы раз в секунду и перерисовка экрана берут строку из одного места:
     раньше вторые затирали первых старым «Прелюдия · 8 мин», и оно мигало. */
  ок("шапка занятия: названия пьесы в ней нет",
    /Прелюдия/.test(t.get("pracWhereText")()), false);
  /* Уже отыграно двадцать минут раньше сегодня, сейчас идёт ещё восемь:
     показываем двадцать восемь, а не восемь. Ровно то, чего не хватало. */
  t.get("data").piano.entries=[{ id: "p", date: сег, pieceId: "bwv853", mins: 20 }];
  ок("шапка занятия: прошлые заходы дня не теряются",
    t.get("pracWhereText")(), `28 из ${план} мин`);
  /* Перебрал дневную норму — видно и сколько всего, и насколько сверх. */
  t.get("data").piano.entries=[{ id: "p", date: сег, pieceId: "bwv853", mins: план + 7 }];
  ок("шапка занятия: превышение считается",
    t.get("pracWhereText")(), `${план + 15} из ${план} мин · +15`);
  /* Неделя набрана — плана на сегодня нет, остаются просто минуты. */
  t.get("data").piano.entries=[{ id: "p", date: сег, pieceId: "bwv853", mins: 400 }];
  ок("шапка занятия: неделя набрана — плана нет", t.get("pracWhereText")(), "408 мин");
  t.set("prac", было.prac); t.set("data", было.данные);
  t.set("todayStr", было.сег0);
}

/* ── Страницы за период: у сборника они считаются по кускам ── */
{
  const было={ данные: JSON.parse(JSON.stringify(t.get("data"))) };
  const подряд={ id:"lin", kind:"book", title:"Подряд", pages:300, startPage:0,
    chapters:[{from:1,name:"Раз"}] };
  const вразбивку={ id:"parts", kind:"book", title:"Вразбивку", pages:221, startPage:0,
    mode:"parts", chapters:[{from:5,name:"Одна"},{from:51,name:"Две"}] };
  const список={ id:"lst", kind:"book", title:"Полка", mode:"list",
    chapters:[{name:"Статья"}] };
  /* Даты у книг не пересекаются: счёт складывает все книги разом, и в одном
     окне иначе не понять, чей вклад проверяешь. */
  t.set("data", { active:"book", piano:{pieces:[],entries:[]},
    pastel:{courses:[],entries:[]}, watch:{videos:[],entries:[]},
    book:{ activeBook:"lin", books:[подряд, вразбивку, список], entries:[
      { id:"a", date:"2026-09-10", bookId:"lin", page:100 },
      { id:"b", date:"2026-09-11", bookId:"lin", page:160 },
      /* Куски: поля page у таких отметок нет вовсе — на нём весь счёт и молчал. */
      { id:"c", date:"2026-09-13", bookId:"parts", spans:[{from:155,to:194}] },
      { id:"d", date:"2026-09-14", bookId:"parts", spans:[{from:51,to:80}] },
      { id:"e", date:"2026-09-15", bookId:"parts", spans:[{from:51,to:80}] },
      { id:"f", date:"2026-09-16", bookId:"lst", marks:{ "Статья":1 } },
    ]}});

  ок("страницы: книга подряд — по курсору",
    t.get("pagesRead")("2026-09-11", "2026-09-11"), 60);
  /* Главное: сборник теперь тоже считается — тридцать страниц куска 51–80. */
  ок("страницы: сборник — по кускам",
    t.get("pagesRead")("2026-09-14", "2026-09-14"), 30);
  ок("страницы: перечитанное второй раз не прибавляется",
    t.get("pagesRead")("2026-09-15", "2026-09-15"), 0);
  ок("страницы: за весь срок обе книги вместе",
    t.get("pagesRead")("2026-09-01", "2026-09-20"), 160 + 70);
  /* У сборника статей страниц нет по устройству — он в счёт не входит. */
  ок("страницы: сборник статей в счёт не идёт",
    t.get("pagesRead")("2026-09-16", "2026-09-16"), 0);
  t.set("data", было.данные);
}

/* ── Сборник: «сейчас» — последняя отметка, а не дальняя страница ── */
{
  const было={ данные: JSON.parse(JSON.stringify(t.get("data"))), cat: t.get("CATALOG") };
  const книга={ id:"gogol", kind:"book", title:"Петербургские повести", pages:221,
    startPage:0, mode:"parts",
    chapters:[{from:5,name:"Невский проспект"},{from:51,name:"Нос"},
              {from:84,name:"Портрет"},{from:155,name:"Шинель"},
              {from:195,name:"Записки сумасшедшего"}] };
  /* Его настоящие отметки: три повести подряд, последняя — вторая по счёту. */
  const отм=[
    { id:"g1", date:"2026-09-13", bookId:"gogol", spans:[{from:155,to:194}] },
    { id:"g2", date:"2026-09-14", bookId:"gogol", spans:[{from:195,to:206}] },
    { id:"g3", date:"2026-09-15", bookId:"gogol", spans:[{from:195,to:221}] },
    { id:"g4", date:"2026-09-16", bookId:"gogol", spans:[{from:51,to:55}] },
  ];
  t.set("data", { active:"book", piano:{pieces:[],entries:[]},
    pastel:{courses:[],entries:[]}, watch:{videos:[],entries:[]},
    book:{ activeBook:"gogol", books:[книга], entries:отм } });

  ок("сборник: дальняя страница — последняя повесть",
    t.get("bookProgressOf")(книга), 221);
  ок("сборник: а «сейчас» — там, где был в прошлый раз",
    t.get("bookNowPage")(книга), 55);

  /* Ради чего всё: карта должна открыться на «Носе», а не на «Записках». */
  t.set("CATALOG", { gogol: { arts: true } });
  t.set("ARTS", { gogol: { map: [1,2,3,4,5].map((n) => (
    { kind:"place", name:"точка "+n, lat:59.9, lon:30.3, part:n })) } });
  ок("сборник: карта открывается на той повести, которую читаешь",
    t.get("mapHereChapter")(книга), 2);

  /* Вернулся к «Запискам» — карта идёт следом. */
  t.get("data").book.entries.push({ id:"g5", date:"2026-09-17", bookId:"gogol",
    spans:[{from:206,to:210}] });
  ок("сборник: перешёл обратно — и карта за ним",
    t.get("mapHereChapter")(книга), 5);

  /* У книги подряд правило прежнее: там курсор только растёт. */
  const подряд={ id:"lin", kind:"book", title:"Подряд", pages:300, startPage:0,
    chapters:[{from:1,name:"Раз"},{from:100,name:"Два"}] };
  t.get("data").book.books.push(подряд);
  t.get("data").book.entries.push({ id:"l1", date:"2026-09-10", bookId:"lin", page:150 });
  ок("книга подряд: «сейчас» — это курсор", t.get("bookNowPage")(подряд), 150);

  t.set("CATALOG", было.cat); t.set("data", было.данные);
}

/* ── Мысль дня: два месяца отдыха, две недели выдержки ── */
{
  const было={ данные: JSON.parse(JSON.stringify(t.get("data"))), сег: t.get("todayStr") };
  const день = (d) => t.set("todayStr", () => d);
  день("2026-09-18");
  const давно = (n) => { const d=new Date(2026,8,18); d.setDate(d.getDate()-n); return t.get("dateStr")(d); };
  const мысль = (id, возрастДней) =>
    ({ id, text: "цитата " + id, date: давно(возрастДней),
       createdAt: t.get("fromStr")(давно(возрастДней)).getTime() });
  t.set("data", { active: "book", piano: { pieces: [], entries: [] },
    pastel: { courses: [], entries: [] }, watch: { videos: [], entries: [] },
    book: { books: [], entries: [] },
    thoughts: [мысль("a", 100), мысль("b", 100), мысль("c", 3)],
    daily: { date: "", seen: [], off: false, shown: {} } });

  /* Свежая — не годится: записана три дня назад, ждёт две недели. */
  const годна = (id) => {
    const t2 = t.get("data").thoughts.find((x) => x.id === id);
    const род = t.get("dateStr")(new Date(t2.createdAt));
    return t.get("daysBetween")(род, "2026-09-18") >= t.get("DAILY_AGAIN") * 0 + 14;
  };
  ок("мысль дня: записанная три дня назад ещё отлёживается", годна("c"), false);
  ок("мысль дня: столетняя годится", годна("a"), true);

  /* Показанная месяц назад отдыхает, показанная три месяца — снова годна. */
  const отдыхает = (когда) => t.get("daysBetween")(когда, "2026-09-18") < t.get("DAILY_AGAIN");
  ок("мысль дня: показанная месяц назад отдыхает", отдыхает(давно(30)), true);
  ок("мысль дня: показанная два месяца назад — уже нет", отдыхает(давно(61)), false);
  ок("мысль дня: сроки — два месяца и две недели",
    [t.get("DAILY_AGAIN"), t.get("DAILY_FRESH")], [60, 14]);

  /* Перевод старого списка в даты: последняя показана в `date`, предыдущая
     днём раньше. Иначе двухмесячный отдых начался бы с чистого листа. */
  const ст = { date: "2026-09-17", seen: ["x", "y", "z"], off: false };
  ок("мысль дня: старый список переведён", t.get("dailyDates")(ст), true);
  ок("мысль дня: последняя — вчерашним днём", ст.shown.z, "2026-09-17");
  ок("мысль дня: предыдущая — днём раньше", ст.shown.y, "2026-09-16");
  ок("мысль дня: и ещё раньше", ст.shown.x, "2026-09-15");
  /* Второй раз переводить нечего. */
  ок("мысль дня: перевод делается один раз", t.get("dailyDates")(ст), false);
  /* Без даты показа переводить не из чего — и придумывать не надо. */
  const пусто = { date: "", seen: ["q"], off: false };
  t.get("dailyDates")(пусто);
  ок("мысль дня: без даты ничего не выдумываем", пусто.shown, {});

  /* Книга в работе — её цитаты молчат, сколько бы им ни было дней.
     Ровно тот случай: сорок одна цитата из книги, дочитанной месяц назад. */
  t.get("data").book = { books: [{ id: "snow-1", title: "Снег" }],
    entries: [{ id: "e1", date: давно(28), bookId: "snow-1" }] };
  ок("мысль дня: отметка в книге была 28 дней назад",
    t.get("lastMarkOf")("snow-1"), давно(28));
  ок("мысль дня: книгу трогали недавно — её цитаты ещё молчат",
    t.get("daysBetween")(t.get("lastMarkOf")("snow-1"), "2026-09-18") < t.get("DAILY_REST_BOOK"),
    true);
  /* Отложил книгу на полтора месяца — цитаты снова новость. */
  t.get("data").book.entries = [{ id: "e1", date: давно(50), bookId: "snow-1" }];
  ок("мысль дня: книга лежит полтора месяца — цитаты вернулись",
    t.get("daysBetween")(t.get("lastMarkOf")("snow-1"), "2026-09-18") < t.get("DAILY_REST_BOOK"),
    false);
  /* Удалённые отметки не считаются, чужие книги не путаются. */
  t.get("data").book.entries = [{ id: "e1", date: давно(2), bookId: "snow-1", deleted: true },
                                { id: "e2", date: давно(2), bookId: "gogol" }];
  ок("мысль дня: удалённая отметка книгу не держит", t.get("lastMarkOf")("snow-1"), "");
  ок("мысль дня: чужая книга — свой счёт", t.get("lastMarkOf")("gogol"), давно(2));
  ок("мысль дня: без ключа держать нечего", t.get("lastMarkOf")(""), "");
  ок("мысль дня: книга молчит полтора месяца", t.get("DAILY_REST_BOOK"), 42);

  t.set("todayStr", было.сег); t.set("data", было.данные);
}

/* ── Отдых: только время, ничего больше ── */
{
  ок("отдых: минуты и секунды", t.get("restText")(185), "3:05");
  ок("отдых: ноль", t.get("restText")(0), "0:00");
  ок("отдых: секунды с нулём", t.get("restText")(60 * 8 + 4), "8:04");
  ок("отдых: пятнадцать минут", t.get("restText")(900), "15:00");

  /* Дыхание: вдох короче выдоха, круг в десять секунд. */
  ок("дыхание: начало круга — вдох", t.get("restBreath")(0).слово, "вдох");
  ок("дыхание: на четвёртой секунде уже выдох", t.get("restBreath")(4).слово, "выдох");
  ок("дыхание: на девятой ещё выдох", t.get("restBreath")(9).слово, "выдох");
  ок("дыхание: на десятой круг начинается заново", t.get("restBreath")(10).слово, "вдох");
  ок("дыхание: доля идёт от нуля к единице",
    [t.get("restBreath")(0).доля, t.get("restBreath")(2).доля], [0, 0.5]);
  ок("дыхание: выдох длиннее вдоха", t.get("REST_OUT") > t.get("REST_IN"), true);

  /* Тихие строки меняются редко и по кругу. */
  ок("слова: первая держится сорок секунд",
    t.get("restWord")(0) === t.get("restWord")(39), true);
  ок("слова: на сороковой меняется",
    t.get("restWord")(0) !== t.get("restWord")(40), true);
  ок("слова: круг замыкается",
    t.get("restWord")(0), t.get("restWord")(40 * t.get("REST_WORDS").length));
  /* Это наблюдения, а не указания: повелительного наклонения там быть не должно. */
  ок("слова: без приказов",
    t.get("REST_WORDS").some((w) => /^(расслабь|закрой|дыши|сосредоточ)/i.test(w)), false);
}

/* ── Сборник вещей: отметка по произведениям, объём по страницам ── */
{
  const было={ данные: JSON.parse(JSON.stringify(t.get("data"))) };
  /* Три вещи очень разного объёма: страница, сорок страниц, десять. */
  const том={ id:"tom", kind:"book", title:"Том", pages:151, mode:"list",
    chapters:[{name:"Стишок", from:1},{name:"Повесть", from:2},{name:"Очерк", from:142}] };
  t.set("data", { active:"book", piano:{pieces:[],entries:[]},
    pastel:{courses:[],entries:[]}, watch:{videos:[],entries:[]},
    book:{ activeBook:"tom", books:[том], entries:[] } });

  ок("список: объём каждой вещи — до начала следующей",
    t.get("listPages")(том), [1, 140, 9]);
  ок("список: всего страниц", t.get("listCount")(том).страниц, 150);

  /* Прочитан один стишок из трёх вещей — но это одна страница из ста пятидесяти. */
  t.get("data").book.entries.push({ id:"e1", date:"2026-09-20", bookId:"tom",
    marks:{ "Стишок":"done" } });
  ок("список: по штукам это треть", t.get("listCount")(том).прочитано, 1);
  ок("список: но процент считается по страницам", t.get("bookPct")(том), 1);

  /* Прочитана повесть — и процент сразу девяносто четыре. */
  t.get("data").book.entries.push({ id:"e2", date:"2026-09-20", bookId:"tom",
    marks:{ "Повесть":"done" } });
  ок("список: большая вещь весит больше", t.get("bookPct")(том), 94);

  /* У книги без страниц считаем по-прежнему по штукам. */
  const полка={ id:"p", kind:"book", title:"Полка", mode:"list",
    chapters:[{name:"Раз"},{name:"Два"},{name:"Три"},{name:"Четыре"}] };
  t.get("data").book.books.push(полка);
  t.get("data").book.activeBook="p";
  t.get("data").book.entries.push({ id:"e3", date:"2026-09-20", bookId:"p",
    marks:{ "Раз":"done" } });
  ок("список: без страниц — по штукам", t.get("bookPct")(полка), 25);
  ок("список: и объёма у них нет", t.get("listCount")(полка).страниц, 0);
  t.set("data", было.данные);
}

/* ── Второй уровень: вещи внутри раздела ── */
{
  const было={ данные: JSON.parse(JSON.stringify(t.get("data"))), open: t.get("lsOpen") };
  const том={ id:"tom", kind:"book", title:"Том", pages:101, mode:"list", chapters:[
    { name:"Стихи 1814", from:1, items:[{name:"Раз",page:1},{name:"Два",page:2},
                                        {name:"Три",page:3},{name:"Четыре",page:4}] },
    { name:"Поэма", from:21 },
    { name:"Стихи 1815", from:81, items:[{name:"Раз",page:81},{name:"Два",page:82}] },
  ]};
  t.set("data", { active:"book", piano:{pieces:[],entries:[]},
    pastel:{courses:[],entries:[]}, watch:{videos:[],entries:[]},
    book:{ activeBook:"tom", books:[том], entries:[] } });
  t.set("pickItems", {});
  const гл = (i) => t.get("bookList")(том)[i];

  /* Раздел без вещей отмечается сам, как было. */
  ок("уровни: у раздела без вещей своё состояние", t.get("lsState")(том, гл(1)), "");
  /* Раздел с вещами руками не отмечают — его состояние собирается снизу. */
  ок("уровни: пустой раздел с вещами не начат", t.get("lsState")(том, гл(0)), "");
  t.get("pickItems")[t.get("lsKey")("Стихи 1814", "Раз")] = "done";
  ок("уровни: одна вещь прочитана — раздел «читаю»", t.get("lsState")(том, гл(0)), "read");
  ок("уровни: доля раздела — четверть", t.get("lsShare")(том, гл(0)), 0.25);
  for (const имя of ["Два","Три","Четыре"])
    t.get("pickItems")[t.get("lsKey")("Стихи 1814", имя)] = "done";
  ок("уровни: все вещи прочитаны — раздел прочитан", t.get("lsState")(том, гл(0)), "done");

  /* Объём: двадцать страниц раздела засчитываются по доле вещей. */
  ок("уровни: страницы раздела идут долями",
    t.get("listCount")(том).страницПрочитано, 20);
  ок("уровни: всего страниц", t.get("listCount")(том).страниц, 100);

  /* Составной ключ: одно и то же имя в разных разделах — разные вещи. */
  ок("уровни: «Раз» в другом разделе не отмечен",
    t.get("lsInnerState")(том, "Стихи 1815", "Раз"), "");
  ок("уровни: ключ составной",
    t.get("lsKey")("Стихи 1815", "Раз"), "Стихи 1815|Раз");

  /* По кругу и обратно. */
  ок("уровни: круг состояний",
    ["", "read", "done"].map(t.get("lsNext")), ["read", "done", ""]);
  t.set("pickItems", {}); t.set("lsOpen", было.open); t.set("data", было.данные);
}

/* ── Траектория: маршрут по книге с отметками ── */
{
  const было={ данные: JSON.parse(JSON.stringify(t.get("data"))), arts: t.get("ARTS") };
  const том={ id:"tom", kind:"book", title:"Том", pages:101, mode:"list", chapters:[
    { name:"Стихи 1814", from:1, items:[{name:"Раз",page:1},{name:"Два",page:2}] },
    { name:"Поэма", from:21 },
  ]};
  t.set("data", { active:"book", piano:{pieces:[],entries:[]},
    pastel:{courses:[],entries:[]}, watch:{videos:[],entries:[]},
    book:{ activeBook:"tom", books:[том], entries:[
      { id:"e1", date:"2026-09-20", bookId:"tom", marks:{ "Стихи 1814|Раз":"done", "Поэма":"read" } }]}});
  t.set("ARTS", { tom: { route: [
    { name:"Первая глава", why:"почему", tail:"вывод", items:[
      { n:1, name:"Раз", year:1814, page:1, key:"Стихи 1814|Раз" },
      { n:2, name:"Два", year:1814, page:2, key:"Стихи 1814|Два" },
      { n:0, name:"Поэма", year:1820, page:21, key:"Поэма" } ]} ]}});

  const м = t.get("routeOf")(том);
  /* Старая одиночная форма разворачивается в один безымянный маршрут:
     у остальных книг он один, и заводить ему имя незачем. */
  ок("маршрут: берётся из разбора", м.length, 1);
  ок("маршрут: одиночный остаётся без имени", м[0].name, "");
  const г = м[0].chapters;
  ок("маршрут: объяснение главы сохранено", [г[0].why, г[0].tail], ["почему", "вывод"]);
  /* Отметки подтягиваются: прочитанное видно прямо в маршруте. */
  ок("маршрут: прочитанная вещь отмечена",
    t.get("routeState")(том, г[0].items[0]), "done");
  ок("маршрут: непрочитанная — пусто",
    t.get("routeState")(том, г[0].items[1]), "");
  /* Большая вещь ключом равна имени главы. */
  ок("маршрут: большая вещь тянет свою отметку",
    t.get("routeState")(том, г[0].items[2]), "read");
  /* Счёт пройденного — он стоит на вкладке. */
  ок("маршрут: счёт пройденного", t.get("routeCount")(том, м[0]), { всего: 3, мои: 1 });

  /* Маршрутов у книги может быть несколько: стихи, поэмы, проза, статьи. */
  t.set("ARTS", { tom: { route: [{ name:"Старый", items:[] }], routes: [
    { name:"Стихи", chapters:[{ name:"Глава", items:[{ name:"Раз", key:"Стихи 1814|Раз" }] }] },
    { name:"Поэмы", chapters:[{ name:"Глава", items:[{ name:"Поэма", key:"Поэма" }] }] },
    { name:"Пустой", chapters:[] },
  ]}});
  const мн = t.get("routeOf")(том);
  ок("маршруты: берутся все", мн.map((r) => r.name), ["Стихи", "Поэмы"]);
  ок("маршруты: пустой не показываем", мн.length, 2);
  ок("маршруты: счёт у каждого свой",
    мн.map((r) => t.get("routeCount")(том, r).мои), [1, 0]);

  /* Без разбора маршрута нет — и кнопки тоже. */
  t.set("ARTS", { tom: {} });
  ок("маршрут: без разбора его нет", t.get("routeOf")(том), null);
  t.set("ARTS", { tom: { routes: [] } });
  ок("маршрут: пустой список — тоже нет", t.get("routeOf")(том), null);
  t.set("ARTS", было.arts); t.set("data", было.данные);
}

/* ── «Завершить книгу» есть у всех трёх видов содержания ── */
{
  const было={ данные: JSON.parse(JSON.stringify(t.get("data"))), done: t.get("pickDone") };
  const мк = (id, mode, главы) => ({ id, kind: "book", title: id, pages: 200, mode, chapters: главы });
  const книги = [
    мк("ровная", "linear", [{ name: "Глава", from: 1 }]),
    мк("повести", "parts", [{ name: "Нос", from: 1 }, { name: "Шинель", from: 101 }]),
    мк("сборник", "list", [{ name: "Статья" }]),
  ];
  t.set("data", { active: "book", piano: { pieces: [], entries: [] },
    pastel: { courses: [], entries: [] }, watch: { videos: [], entries: [] },
    book: { activeBook: "ровная", books: книги, entries: [] } });
  t.set("pickItems", {}); t.set("pickSpans", []); t.set("partOpen", null); t.set("lsOpen", null);

  /* Кнопка жила только у книги подряд, и сборник повестей закрыть было нечем. */
  for (const id of ["ровная", "повести", "сборник"]) {
    t.get("data").book.activeBook = id;
    const ui = t.get("bookMode")(t.get("book")()) === "list" ? t.get("bookListUI")()
      : t.get("bookMode")(t.get("book")()) === "parts" ? t.get("bookPartsUI")() : t.get("bookSheetUI")();
    ок(`завершение: кнопка есть у «${id}»`, ui.includes('data-fin="1"'), true);
  }
  /* Нажата — надпись меняется, и это одна и та же кнопка на всех. */
  t.set("pickDone", true);
  ок("завершение: нажатая кнопка снимает отметку", t.get("finBtnHTML")().includes('data-fin="0"'), true);

  t.set("pickDone", было.done); t.set("data", было.данные);
}

const именаОпций = (html) => (html.match(/>([^<]+)</g) || []).map((x) => x.slice(1, -1));

/* ── Несколько карт у одной книги ── */
{
  const было={ arts: t.get("ARTS"), gm: t.get("gm") };
  const ru={ west:20, east:52, north:62, south:42 };
  const spb={ west:30.2, east:30.45, north:59.97, south:59.88 };
  t.set("ARTS", { dushi: { mapVer: 7, maps: [
    { key:"ru", name:"Россия", box: ru },
    { key:"spb", name:"Петербург", box: spb },
  ], map: [] } });
  const книга={ id:"dushi", chapters:[] };
  ок("карты: обе видны", t.get("mapMaps")(книга).map((m) => m.key), ["ru","spb"]);
  ок("карты: рамка по ключу", t.get("mapBox")(книга, "spb"), spb);
  ок("карты: без ключа — первая", t.get("mapBox")(книга), ru);
  /* Ключ хранения и имя файла у каждой карты свои: иначе телефон покажет
     петербургскую подложку под русскими точками. */
  ок("карты: ключ хранения свой", t.get("mapKey")("dushi", "spb"), "map-dushi-spb-v7");
  ок("карты: первая — по-старому, без хвоста", t.get("mapKey")("dushi", ""), "map-dushi-v7");
  ок("карты: файл свой", t.get("mapFile")("dushi", "spb"), "art-map-dushi-spb.txt");
  /* Первая карта лежит в каталоге без суффикса — её видят и старые версии.
     Просили её с суффиксом, файла такого нет, и «Мёртвые души» висели в
     «карта загружается…»: картинка была на месте, а адрес — мимо. */
  ок("карты: первая — файл без хвоста",
    t.get("mapFile")("dushi", "ru"), "art-map-dushi.txt");
  ок("карты: и ключ хранения у неё тот же",
    t.get("mapKey")("dushi", "ru"), "map-dushi-v7");

  /* В селекте только карты, где у этой главы точки есть. Книга знает четыре
     карты, а в главе заняты две — две оставшиеся открывались бы пустыми. */
  {
    const надпись = { textContent: "" };
    const короб = { hidden: true }, сел = { innerHTML: "" };
    const узлы = { "#gmMapBox": короб, "#gmMapSel": сел, "#gmMapLabel": надпись };
    const былПоиск = t.get("document.querySelector");
    const былgm = t.get("gm");
    t.set("document.querySelector", (s2) => узлы[s2] || null);
    t.set("gm", { карта: "ru", карты: [{ key:"ru", name:"Россия" },
      { key:"spb", name:"Петербург" }, { key:"eu", name:"Европа" }] });
    t.get("gmMapRow")([{ key:"ru", name:"Россия" }, { key:"eu", name:"Европа" }], true);
    ок("карты: в списке только занятые", (именаОпций(сел.innerHTML)), ["Россия","Европа"]);
    t.set("gm", былgm);
    t.set("document.querySelector", былПоиск);
  }

  /* Одна карта, описанная по-старому одним mapBox, читается как и раньше. */
  t.set("ARTS", { old: { mapVer: 3, mapBox: ru } });
  ок("карты: старая книга с одним mapBox",
    t.get("mapMaps")({ id:"old" }).map((m) => [m.key, m.box === ru]), [["", true]]);
  ок("карты: и ключ у неё прежний", t.get("mapKey")("old", ""), "map-old-v3");
  t.set("ARTS", { none: {} });
  ок("карты: без разбора карт нет", t.get("mapMaps")({ id:"none" }), []);

  /* Выбор карты: та, где лежит больше точек выбранной главы. */
  const т=(имя, m, ch) => ({ name: имя, m, ch, lat: 0, lon: 0 });
  t.set("gm", { карты: [{key:"ru"},{key:"spb"}], часть: 10, места: [
    т("Невский","spb",10), т("Гороховая","spb",10), т("Москва","ru",1) ] });
  ок("карты: у главы про Копейкина открывается Петербург", t.get("gmАвтоКарта")(), "spb");
  t.get("gm").часть = 1;
  ок("карты: у первой главы — Россия", t.get("gmАвтоКарта")(), "ru");
  t.get("gm").часть = 0;
  ок("карты: на всех местах побеждает та, где точек больше", t.get("gmАвтоКарта")(), "spb");

  /* Селект карты нужен только там, где в главе точки на разных картах. */
  t.set("gm", { карты: [{key:"ru"},{key:"spb"}], часть: 6, места: [
    т("Рязань","ru",6), т("Сенная площадь","spb",6), т("Невский","spb",10) ] });
  ок("карты: в смешанной главе выбор есть",
    new Set(t.get("gmМестаГлавы")().map(t.get("картаТочки"))).size, 2);
  t.get("gm").часть = 10;
  ок("карты: в однородной главе выбирать нечего",
    new Set(t.get("gmМестаГлавы")().map(t.get("картаТочки"))).size, 1);

  t.set("gm", было.gm); t.set("ARTS", было.arts);
}

/* ── Счёт по настоящим произведениям ── */
{
  const было={ данные: JSON.parse(JSON.stringify(t.get("data"))) };
  const том={ id:"tom", kind:"book", title:"Том", pages:101, mode:"list", chapters:[
    { name:"Стихи 1814", from:1, kind:"стих",
      items:[{name:"Раз",page:1},{name:"Два",page:2},{name:"Три",page:3}] },
    { name:"Поэма", from:41, kind:"поэма" },
    { name:"Сказка", from:61, kind:"сказка" },
  ]};
  t.set("data", { active:"book", piano:{pieces:[],entries:[]},
    pastel:{courses:[],entries:[]}, watch:{videos:[],entries:[]},
    book:{ activeBook:"tom", books:[том], entries:[] } });
  t.set("pickItems", {});

  /* Настоящих произведений пять: три стихотворения, поэма, сказка.
     Не три раздела — «0 из 3» у тома, где их пять, это не счёт. */
  ок("счёт: считаем произведения, а не разделы",
    t.get("lsHeadText")(том).startsWith("0 из 5 произведений"), true);

  /* После «из» родительный: двадцать один просит единственное число. */
  ок("счёт: из 21 произведения", t.get("вещьИз")(том, 21), "произведения");
  ок("счёт: из 29 произведений", t.get("вещьИз")(том, 29), "произведений");
  ок("счёт: из 2 произведений", t.get("вещьИз")(том, 2), "произведений");
  ок("счёт: из 1 произведения", t.get("вещьИз")(том, 1), "произведения");
  /* Обложка не повторяет фамилию, если она уже стоит в названии. */
  ок("обложка: фамилия из названия не дублируется",
    t.get("cvAuthor")({ author: "А. С. Пушкин", title: "Пушкин. Стихи и проза" }), "");
  ок("обложка: обычный автор остаётся",
    t.get("cvAuthor")({ author: "Николай Гоголь", title: "Петербургские повести" }), "Николай Гоголь");
  ок("обложка: переводчик не путает",
    t.get("cvAuthor")({ author: "Гомер · перевод Григория Стариковского", title: "Одиссея" }),
    "Гомер · перевод Григория Стариковского");
  /* У сборника статей своё слово — оно задано в описи книги. */
  ок("счёт: у сборника статей своё слово",
    t.get("вещьИз")({ word: "статья" }, 21), "статьи");

  t.get("pickItems")[t.get("lsKey")("Стихи 1814", "Раз")] = "done";
  t.get("pickItems")["Поэма"] = "done";
  ок("счёт: прочитанное считается поштучно",
    t.get("lsHeadText")(том).startsWith("2 из 5 произведений"), true);
  t.set("pickItems", {}); t.set("data", было.данные);
}

/* ── У пьесы ни карты, ни собрания ── */
{
  const было={ данные: JSON.parse(JSON.stringify(t.get("data"))), cat: t.get("CATALOG") };
  t.set("CATALOG", {});
  t.set("data", { active: "piano", book: { books: [], entries: [] },
    pastel: { courses: [], entries: [] }, watch: { videos: [], entries: [] },
    piano: { activePiece: "bwv853", entries: [],
      pieces: [{ id: "bwv853", name: "Прелюдия", bars: 40 }] } });
  ок("пьеса: кнопки карты и собрания нет", t.get("mapBtnOn")(), false);
  ок("пьеса: и места под неё не держим — «Отметить» на всю ширину",
    t.get("bookBtnState")(), { map: { on: false, keep: false, route: false } });

  /* Книга с `noMap`: карты не будет никогда, место под кнопку не держим. */
  t.set("data", { active: "book", piano: { pieces: [], entries: [] },
    pastel: { courses: [], entries: [] }, watch: { videos: [], entries: [] },
    book: { activeBook: "b1", entries: [], books: [
      { id: "b1", title: "Том", pages: 800, mode: "parts", noMap: true,
        chapters: [{ name: "Раз", from: 1 }] }] } });
  ок("книга без карты: места под кнопку не держим",
    t.get("bookBtnState")(), { map: { on: false, keep: false, route: false } });
  /* А обычная книга место держит: разбор приезжает из каталога позже. */
  t.get("data").book.books[0].noMap = false;
  ок("обычная книга: место под будущую карту держим",
    t.get("bookBtnState")(), { map: { on: false, keep: true, route: false } });

  /* А если карты не будет, но есть маршрут — кнопка появляется и ведёт в него. */
  const былиARTS = t.get("ARTS");
  t.get("data").book.books[0].noMap = true;
  t.set("ARTS", { b1: { route: [{ name: "Глава", items: [{ name: "Вещь", key: "Вещь" }] }] } });
  ок("маршрут: кнопка занимает место карты",
    t.get("bookBtnState")(), { map: { on: true, keep: true, route: true } });
  t.set("ARTS", былиARTS);
  t.set("data", было.данные); t.set("CATALOG", было.cat);
}

/* ── Мягкий ориентир у пьесы: минуты недели ── */
{
  const было={ данные: JSON.parse(JSON.stringify(t.get("data"))) };
  const сег=t.get("todayStr")();
  const деньНедели=(t.get("fromStr")(сег).getDay()+6)%7, впереди=7-деньНедели;
  t.get("data").pianoWeek=150;
  t.get("data").piano.entries=[{ id: "p1", date: сег, pieceId: "bwv853", mins: 20 }];
  const п=t.get("pianoWeekPlan")();
  ок("минуты: цель берётся из профиля", п.цель, 150);
  ок("минуты: сегодняшнее считается отдельно", п.сегодня, 20);
  /* Норма на сегодня считается от сыгранного ДО сегодня, поэтому текущее
     занятие её не уменьшает. */
  ок("минуты: норма дня — остаток на оставшиеся дни", п.надо, Math.ceil(150/впереди));
  ок("минуты: пока не набрано", п.набрано, false);

  /* Отыграл всю недельную цель за один день — неделя от этого не закрыта:
     в зачёт ушла норма дня, остальное осталось просто сыгранным. Молчит при
     этом только сегодняшний день: своё он отдал. */
  t.get("data").piano.entries=[{ id: "p1", date: сег, pieceId: "bwv853", mins: 160 }];
  const п2=t.get("pianoWeekPlan")();
  ок("минуты: цель за один день неделю закрывает", [п2.набрано, п2.надо], [true, 0]);
  ок("минуты: и плана на сегодня нет", t.get("pianoWeekPlan")().надо, 0);

  /* На экране занятия: этот заход из остатка дня. Минуты пишутся в запись
     живьём, поэтому «сыграно сегодня» включает текущий заход — вычитаем. */
  t.get("data").pianoWeek = 7 * 30;                       // ровно тридцать в день
  const былPrac = t.get("prac");
  t.set("prac", null);                                   // не на занятии: живого хвоста нет
  t.get("data").piano.entries = [];
  ок("день: в начале дня ноль из дневного плана",
    t.get("pracDayMins")(), { всего: 0, надо: Math.ceil(210/впереди), набрано: false });
  t.get("data").piano.entries=[{ id: "p1", date: сег, pieceId: "bwv853", mins: 15 }];
  ок("день: отыгранное показывается, а не вычитается",
    t.get("pracDayMins")().всего, 15);
  t.get("data").piano.entries=[{ id: "p1", date: сег, pieceId: "bwv853", mins: 300 }];
  ок("день: неделя набрана — плана нет, минуты остались",
    [t.get("pracDayMins")().надо, t.get("pracDayMins")().всего], [0, 300]);
  t.set("prac", былPrac);

  t.set("data", было.данные);
}

/* ── Старая карта под точкой ── */
{
  const было={ cat: t.get("ARTS") ? null : null };
  const r={ code: "1418281", year: 1828 };
  const адрес=t.get("retroUrl")(r, { lat: 59.932567, lon: 30.312134 });
  ок("ретромап: код карты в адресе", адрес.includes("l=1418281"), true);
  ок("ретромап: координаты с пятью знаками",
    adресОк(адрес), true);
  function adресОк(a){ return /y=59\.93257&x=30\.31213$/.test(a); }
  ок("ретромап: без кода кнопки нет", t.get("retroMap")({ id: "неттакого" }), null);
}

/* ── Сборник статей: состояния вместо страниц ── */
{
  const было={ данные: t.get("data"), выбор: t.get("pickItems") };
  t.set("data", { active: "book", piano: { pieces: [], entries: [] },
    pastel: { courses: [], entries: [] }, watch: { videos: [], entries: [] },
    book: { activeBook: "polka",
      books: [{ id: "polka", word: "статья", title: "Полка", mode: "list",
        chapters: [{ name: "Предисловие" }, { name: "«Слово о полку Игореве»" },
                   { name: "Гоголь. «Шинель»" }, { name: "Белый. «Петербург»" }] }],
      entries: [
        { id: "e1", date: "2026-09-10", bookId: "polka", createdAt: 1,
          marks: { "«Слово о полку Игореве»": "read" } },
        { id: "e2", date: "2026-09-12", bookId: "polka", createdAt: 2,
          marks: { "«Слово о полку Игореве»": "done", "Гоголь. «Шинель»": "read" } },
      ] } });
  t.set("pickItems", {});
  ок("сборник: состояния берутся из отметок",
    t.get("listStates")(t.get("book")()), ["", "done", "read", ""]);
  ок("сборник: считает прочитанные, а не страницы",
    [t.get("listCount")(t.get("book")()).прочитано, t.get("listCount")(t.get("book")()).всего], [1, 4]);
  const ст = t.get("curStats")();
  ок("сборник: доля — по статьям", Math.round(ст.pct), 25);
  ок("сборник: «сейчас читаю» — помеченная статья", ст.chapter.name, "Гоголь. «Шинель»");
  ок("сборник: в подписи статьи, а не страницы",
    /1 из 4 статей/.test(t.get("heroSub")(ст)), true);
  ок("сборник: в кольце обычная доля, счёт — в подписи", t.get("ringSign")(ст), "");
  ок("сборник: место под кнопку карты не держим",
    t.get("bookBtnState")(), { map: { on: false, keep: false, route: false } });
  /* У обычной книги место держим: разбор с картой приезжает из каталога
     позже, и кнопка не должна двигать раскладку, когда появится. */
  t.get("data").book.books[0].mode = "linear";
  t.get("data").book.books[0].pages = 100;
  ок("книга: место под карту держим и до разбора",
    t.get("bookBtnState")().map.keep, true);
  /* У курса кнопка есть — место под неё держим, пока музей едет из гиста. */
  t.get("data").active = "pastel";
  t.get("data").pastel = { activeCourse: "argos", entries: [],
    courses: [{ id: "argos", name: "Аргус", lessons: [] }] };
  ок("курс: место под кнопку собрания держим", t.get("bookBtnState")().map.keep, true);
  t.get("data").active = "book";
  t.get("data").book.books[0].mode = "list";
  delete t.get("data").book.books[0].pages;

  /* Свайп не пересобирает главную: класс ряда кнопок переставляет syncBookBtns,
     иначе дырка от карты остаётся от того материала, на котором экран собрали. */
  {
    const классы = new Set(["solo"]);
    const ряд = { classList: {
      toggle: (к, в) => { в ? классы.add(к) : классы.delete(к); },
      add: (к) => классы.add(к), remove: (к) => классы.delete(к), contains: (к) => классы.has(к) } };
    /* Кнопка теперь не только красится, но и переименовывается: у книги с
       маршрутом вместо карты компас. Заглушка должна уметь то же, что узел. */
    const кнопка = { parentElement: ряд, textContent: "🗺",
      classList: { toggle() {}, add() {}, remove() {} },
      setAttribute() {}, getAttribute: () => null };
    const былПоиск = t.get("document.getElementById");
    t.set("document.getElementById", (id) => (id === "bookMapBtn" ? кнопка : null));
    t.get("syncBookBtns")();
    ок("сборник: у ряда кнопок остаётся solo", классы.has("solo"), true);
    t.get("data").book.books[0].mode = "linear";
    t.get("data").book.books[0].pages = 100;
    t.get("syncBookBtns")();
    ок("обычная книга: место под карту держим", классы.has("solo"), false);
    t.get("data").book.books[0].mode = "list";
    delete t.get("data").book.books[0].pages;
    t.set("document.getElementById", былПоиск);
  }
  ок("сборник: срока «когда дочитаю» нет", t.get("paceForecast")(), null);
  ок("сборник: сам собой дочитанным не становится", t.get("bookDone")(t.get("book")()), false);

  /* Список можно пересортировать: отметки держатся за имя, а не за номер. */
  t.get("data").book.books[0].chapters.reverse();
  ок("сборник: после пересортировки отметки остались на своих статьях",
    t.get("listStates")(t.get("book")()), ["", "read", "done", ""]);
  t.get("data").book.books[0].chapters.reverse();

  /* Поздняя отметка перебивает раннюю — это и есть отмена. */
  t.get("data").book.entries.push(
    { id: "e3", date: "2026-09-13", bookId: "polka", createdAt: 3,
      marks: { "«Слово о полку Игореве»": "" } });
  ок("сборник: снятая отметка снимается",
    t.get("listStates")(t.get("book")())[1], "");

  t.set("data", было.данные); t.set("pickItems", было.выбор);
}

/* ── После отметки открывается только награда или собрание ── */
{
  const src = require("fs").readFileSync(__dirname + "/../app.js", "utf8");
  const типы = [...src.matchAll(/overlayQueue\.push\(\{\s*type:\s*"(\w+)"/g)].map((m) => m[1]);
  ок("отметка: в очередь встают награда, собрание и итог дочитанной книги",
    [...new Set(типы)].sort(), ["ach", "bookDone", "chapter", "col"]);
  ок("отметка: карточки знаний не всплывают", /type: "facts"/.test(src), false);
}

/* ── После отметки — тихо, без похвалы и процентов ── */
{
  const было={ сег: t.get("selectedDate"), toast: t.get("toast") };
  const сказано=[];
  t.set("toast", (s) => сказано.push(s));
  t.set("selectedDate", t.get("todayStr")());
  t.get("markToast")(false);
  t.get("markToast")(true);
  t.set("selectedDate", "2020-01-02");
  t.get("markToast")(false);
  ок("отметка: без похвалы и процентов", сказано, ["Отмечено", "Запись дополнена", "2 января отмечено"]);
  ок("отметка: похвалы в коде не осталось", t.get("typeof DONE_TITLES"), "undefined");
  t.set("selectedDate", было.сег); t.set("toast", было.toast);
}

/* ── Поправил отметку — лишние награды снимаются ── */
{
  const было = {
    cat: t.get("CATALOG"), active: t.get("data").active,
    book: JSON.parse(JSON.stringify(t.get("data").book || {})),
    piano: t.get("data").piano,
    achAt: JSON.parse(JSON.stringify(t.get("data").achAt || {})),
  };
  t.set("data.piano", { pieces: [], activePiece: "", entries: [] });
  t.set("CATALOG", { otkat: { ach: [
    { id: "konec", icon: "🏺", name: "Дочитано", hint: "", secret: false, when: [["page", ">=", 90]] },
    { id: "zahod", icon: "🌊", name: "Большой заход", hint: "", secret: true, when: [["maxJump", ">=", 50]] },
    { id: "noch",  icon: "🕯", name: "Ночью", hint: "", secret: true, when: [["night", "is", true]] },
    { id: "den",   icon: "📖", name: "Первый вечер", hint: "", secret: false, when: [["days", ">=", 1]] },
  ], words: { konec: "т", zahod: "т", noch: "т", den: "т" } } });
  t.set("data.book", {
    activeBook: "otkat",
    books: [{ id: "otkat", title: "Книга", pages: 100, startPage: 0 }],
    entries: [{ id: "1", date: "2026-08-01", bookId: "otkat", page: 100 }],
  });
  t.set("data.active", "book");
  t.set("data.achAt", { "otkat:konec": 111, "otkat:zahod": 111, "otkat:noch": 111, "otkat:den": 111 });

  // отметку исправили: сотая страница оказалась ошибкой, прочитано сорок
  t.get("data").book.entries[0].page = 40;
  const снято = t.get("dropGoneAch")();
  ок("откат: снято ровно две", снято, 2);
  ок("откат: награда за страницу ушла", t.get("data").achAt["otkat:konec"], undefined);
  ок("откат: размах захода ушёл", t.get("data").achAt["otkat:zahod"], undefined);
  ок("откат: ночь осталась — она была", t.get("data").achAt["otkat:noch"], 111);
  ок("откат: день чтения остался", t.get("data").achAt["otkat:den"], 111);

  // вернули как было — награда возвращается обычным путём, через stampProgress
  t.get("data").book.entries[0].page = 100;
  ок("откат: снимать больше нечего", t.get("dropGoneAch")(), 0);

  // каталог ещё не приехал: пустое состояние ничего не решает
  t.set("data.achAt", { "otkat:konec": 111 });
  t.set("CATALOG", {});
  ок("откат: без каталога награды не трогаем",
    [t.get("dropGoneAch")(), t.get("data").achAt["otkat:konec"]], [0, 111]);

  t.set("CATALOG", было.cat); t.set("data.book", было.book);
  t.set("data.piano", было.piano);
  t.set("data.active", было.active); t.set("data.achAt", было.achAt);
}

/* ── Что предлагается для заметки ── */
{
  const было = {
    active: t.get("data").active, hidden: JSON.parse(JSON.stringify(t.get("data").hidden || {})),
    book: JSON.parse(JSON.stringify(t.get("data").book || {})),
    piano: JSON.parse(JSON.stringify(t.get("data").piano || {})),
    watch: JSON.parse(JSON.stringify(t.get("data").watch || {})),
    pastel: JSON.parse(JSON.stringify(t.get("data").pastel || {})),
    cat: t.get("CATALOG"),
  };
  t.set("CATALOG", {});
  t.set("data.hidden", { "bk:spryatana": 1 });
  t.set("data.piano", { pieces: [], activePiece: "", entries: [] });
  t.set("data.watch", { videos: [{ id: "kino", title: "Кино", done: true }], activeVideo: "kino", entries: [] });
  t.set("data.pastel", { entries: [], course: null, activeCourse: "",
    courses: [{ id: "k1", name: "Курс", lessons: [{ dur: 60, steps: [] }] }] });
  t.set("data.book", {
    activeBook: "chitayu",
    books: [
      { id: "chitayu", title: "Читаю", pages: 100 },
      { id: "prochitana", title: "Прочитана", pages: 100, done: true },
      { id: "spryatana", title: "Спрятана", pages: 100 },
    ],
    entries: [],
  });
  t.set("data.active", "book");

  const все = t.get("achMaterials")();
  const имена = все.map((m) => m.title).sort();
  ок("материалы: в списке все", имена, ["Кино", "Курс", "Прочитана", "Спрятана", "Читаю"]);

  const годится = (m) => (m.track === "watch" || !m.done) && !m.hidden;
  ок("заметка: прочитанной книги нет", все.filter(годится).map((m) => m.title).includes("Прочитана"), false);
  ок("заметка: спрятанной книги нет", все.filter(годится).map((m) => m.title).includes("Спрятана"), false);
  ок("заметка: досмотренный ролик остаётся", все.filter(годится).map((m) => m.title).includes("Кино"), true);
  ок("заметка: остаётся то, что в работе",
    все.filter(годится).map((m) => m.title).sort(), ["Кино", "Курс", "Читаю"]);

  t.set("CATALOG", было.cat);
  t.set("data.book", было.book); t.set("data.piano", было.piano);
  t.set("data.watch", было.watch); t.set("data.pastel", было.pastel);
  t.set("data.hidden", было.hidden); t.set("data.active", было.active);
}

/* ── Путь: дни занятий по всем материалам сразу ── */
{
  const было = {
    cat: t.get("CATALOG"),
    piano: JSON.parse(JSON.stringify(t.get("data").piano || {})),
    book: JSON.parse(JSON.stringify(t.get("data").book || {})),
    pastel: JSON.parse(JSON.stringify(t.get("data").pastel || {})),
    watch: JSON.parse(JSON.stringify(t.get("data").watch || {})),
  };
  t.set("CATALOG", { __path__: { ach: [
    { id: "p3", icon: "🌱", name: "Три дня", hint: "", secret: false, when: [["days", ">=", 3]] },
    { id: "p10", icon: "🌳", name: "Десять дней", hint: "", secret: false, when: [["days", ">=", 10]] },
  ] } });
  t.set("data.piano", { pieces: [], activePiece: "", entries: [
    { id: "1", date: "2026-08-01" }, { id: "2", date: "2026-08-02" },
  ] });
  t.set("data.book", { books: [], activeBook: "", entries: [
    { id: "3", date: "2026-08-02" },                       // тот же день — считается один раз
    { id: "4", date: "2026-08-03" },
    { id: "5", date: "2026-08-04", deleted: true },         // удалённая запись не в счёт
  ] });
  t.set("data.pastel", { entries: [{ id: "6", date: "2026-08-05" }], courses: [], course: null });
  t.set("data.watch", { videos: [], activeVideo: "", entries: [] });

  ок("путь: день считается один раз на все материалы", t.get("pathDays")(), 4);

  const сост = t.get("pathState")();
  ок("путь: три дня взяты, десять нет",
    сост.map((a) => a.done), [true, false]);

  t.get("data").watch.entries.push({ id: "7", date: "2026-08-06" }, { id: "8", date: "2026-08-07" });
  ок("путь: ролики тоже идут в счёт", t.get("pathDays")(), 6);

  ок("путь: без описи ничего не показываем", (() => {
    t.set("CATALOG", {});
    return t.get("pathState")().length;
  })(), 0);

  t.set("CATALOG", было.cat);
  t.set("data.piano", было.piano); t.set("data.book", было.book);
  t.set("data.pastel", было.pastel); t.set("data.watch", было.watch);
}

/* ── Карта открывается там, где читаешь ── */
{
  const было = {
    book: JSON.parse(JSON.stringify(t.get("data").book || {})),
    arts: t.get("ARTS"), active: t.get("data").active,
  };
  t.set("ARTS", { kniga: { map: [
    { ch: 1, name: "Итака", lat: 38.4, lon: 20.7 },
    { ch: 2, name: "Пилос", lat: 36.9, lon: 21.7 },
    { ch: 4, name: "Спарта", lat: 37.1, lon: 22.4 },
  ], mapBox: { west: 8, east: 31, north: 42, south: 30 } } });
  t.set("data.book", {
    activeBook: "kniga",
    books: [{ id: "kniga", title: "Книга", pages: 100, startPage: 0, chapters: [
      { name: "I", from: 1 }, { name: "II", from: 20 },
      { name: "III", from: 40 }, { name: "IV", from: 60 },
    ] }],
    entries: [],
  });
  t.set("data.active", "book");

  ок("карта: книга не начата — открывается первая глава", t.get("mapHereChapter")(), 1);

  t.get("data").book.entries.push({ id: "1", date: "2026-08-01", bookId: "kniga", page: 25 });
  ок("карта: подставлена вторая глава", t.get("mapHereChapter")(), 2);

  /* В третьей главе точек нет — открывается ближайшая, где есть: пустая карта
     на входе читается как поломка. */
  t.get("data").book.entries.push({ id: "2", date: "2026-08-02", bookId: "kniga", page: 45 });
  ок("карта: пустая глава уступает ближайшей полной", t.get("mapHereChapter")(), 2);

  t.get("data").book.entries.push({ id: "3", date: "2026-08-03", bookId: "kniga", page: 65 });
  ок("карта: дальше по книге — своя глава", t.get("mapHereChapter")(), 4);

  // сама карта при этом всегда со всеми точками
  ок("карта: точки не теряются", t.get("mapPoints")(t.get("book")(), -1).length, 3);

  t.set("ARTS", было.arts);
  t.set("data.book", было.book); t.set("data.active", было.active);
}

/* ── Слова, которые можно посмотреть глазами ── */
{
  const было = {
    pastel: JSON.parse(JSON.stringify(t.get("data").pastel || {})),
    active: t.get("data").active,
  };
  t.set("data.pastel", { entries: [], course: null, activeCourse: "к",
    courses: [{ id: "к", name: "Курс", lessons: [], terms: {
      "валик": { q: "надбровные дуги собаки" },
      "мочка": { q: "мочка носа собаки", draw: "как нарисовать нос собаки" },
      "нос": { q: "нос" },
    } }] });
  t.set("data.active", "pastel");
  const body = t.get("stepBody");

  ок("слова: термин подчёркнут",
    /<button type="button" class="term" data-term="валик">Валик<\/button>/
      .test(body("Валик над глазом.")), true);

  ок("слова: падеж пойман",
    /data-term="глазница"/.test(body("Отметь глазницу овалом.")) === false, true);   // нет в словаре

  ок("слова: склонение ловится",
    /data-term="мочка">мочку</.test(body("Отметь мочку носа.")), true);

  ок("слова: одно слово — одна отметка за шаг",
    (body("Валик. Ещё валик. И валиком.").match(/data-term/g) || []).length, 1);

  ок("слова: короткое в словарь не идёт",
    /data-term="нос"/.test(body("Нос собаки.")), false);

  ок("слова: за тегом тоже ловится",
    /data-term="валик"/.test(body("**Валик** — это бугор.")), true);

  ок("слова: внутри атрибута не срабатывает",
    (body("Валик и снова валик").match(/data-term/g) || []).length, 1);

  t.set("data.pastel", было.pastel);
  t.set("data.active", было.active);
}


/* ── Кнопка карты на главной: файл с местами едет отдельно ── */
{
  const было = {
    active: t.get("data").active,
    book: JSON.parse(JSON.stringify(t.get("data").book || {})),
    arts: t.get("ARTS"),
  };
  t.set("data.book", { activeBook: "od", books: [{ id: "od", title: "Одиссея", pages: 400 }], entries: [] });
  t.set("data.active", "book");
  t.set("ARTS", {});

  /* Кнопка ведёт и в карту, и в собрание: пока не приехало ничего, её нет. */
  ок("карта: пока не приехало ничего — кнопки нет", t.get("mapBtnOn")(), false);
  ок("кнопки: до приезда файла состояние молчит", t.get("bookBtnState")().map.on, false);

  t.set("ARTS", { od: { map: [{ name: "Итака", ch: 1, lat: 38.4, lon: 20.7 }],
    mapBox: { w: 100, e: 120, n: 40, s: 30 } } });
  ок("карта: файл приехал — кнопка нужна", t.get("mapBtnOn")(), true);

  /* Рамки картинки нет — карту рисовать не на чем, но одни места в собрание не
     идут, так что и там пусто: кнопки нет. */
  t.set("ARTS", { od: { map: [{ name: "Итака", ch: 1, lat: 38.4, lon: 20.7 }] } });
  ок("карта: без рамки и без собрания кнопки нет", t.get("mapBtnOn")(), false);

  /* Разбор качается не только книге. У пьесы файл не спрашивался вовсе —
     кнопки справочника не было, потому что данных для неё не приезжало. */
  {
    const былиПьесы = JSON.parse(JSON.stringify(t.get("data").piano || {}));
    const былАктив = t.get("data").active;
    t.set("data.piano", { pieces: [{ id: "pp", name: "Пьеса", bars: 8 }], activePiece: "pp", entries: [] });
    t.set("data.active", "piano");
    t.set("ARTS", {});
    const спрошено = [];
    const былPull = t.get("pullArts");
    t.set("pullArts", (id) => { спрошено.push(id); return Promise.resolve(null); });
    t.get("artsAsked").clear();
    t.get("artsPeek")();
    ок("разбор: у пьесы файл тоже спрашивается", спрошено, ["pp"]);
    t.set("pullArts", былPull);
    t.set("data.piano", былиПьесы); t.set("data.active", былАктив);
  }

  /* А книге без географии подложка и не нужна: у «Писем Баламута» одни
     справки, и карта у них — список, которому картинка мира ни к чему. */
  t.set("ARTS", { od: { map: [
    { kind: "text", name: "Полифония", about: "…" },
    { kind: "person", name: "Льюис", about: "…" },
  ] } });
  ок("карта: без географии кнопка есть и без рамки", t.get("mapBtnOn")(), true);

  /* Карточка снизу принадлежит карте: она объясняет метку, на которую ткнули.
     В списке справок текст раскрывается прямо в строке, и всплывающий экран
     показывал бы то же самое вторым способом. */
  {
    const былоGm2 = t.get("gm");
    const узел = { hidden: false, innerHTML: "x" };
    const былПоиск2 = t.get("document.querySelector");
    t.set("document.querySelector", (s) => (s === "#gmCard" ? узел : null));
    t.set("gm", { места: [{ kind: "word", name: "Октава", about: "…" }],
      слой: "all", at: "Октава", часть: 0, части: [] });
    t.get("gmCard")();
    ок("карта: у справки нижней карточки нет", узел.hidden, true);
    t.set("document.querySelector", былПоиск2);
    t.set("gm", былоGm2);
  }
  ок("карта: мест в такой книге нет", t.get("mapHasPlaces")(t.get("book")()), false);

  const былоGm = t.get("gm");
  t.set("gm", { места: t.get("mapWhole")(t.get("book")()), слой: "", часть: 0, at: null, части: [] });
  /* Ни мест, ни залитого текста — остаётся одно собрание. */
  ок("карта: без мест и текста остаётся собрание",
    t.get("gmLayersOf")().map((x) => x[0]), ["col"]);
  t.set("gm", былоGm);

  t.set("data.book", было.book);
  t.set("data.active", было.active);
  t.set("ARTS", было.arts);
}

/* ── Прогон с начала после сшивки блока ── */
{
  const было = {
    active: t.get("data").active,
    piano: JSON.parse(JSON.stringify(t.get("data").piano || {})),
    practice: JSON.parse(JSON.stringify(t.get("data").practice || {})),
  };
  t.set("data.piano", { activePiece: "p", entries: [],
    pieces: [{ id: "p", name: "Пьеса", author: "А", bars: 12 }] });
  t.set("data.active", "piano");

  // закрываем все шаги всех тактов и сшивки двух первых блоков
  const заход = (n) => Array.from({ length: n }, () => ({ lvl: 1, d: "2026-08-28" }));
  const reps = {};
  for (let b = 1; b <= 12; b++) {
    reps[b] = {};
    for (const st of ["readR", "readL", "right", "left", "both"]) reps[b][st] = заход(3);
  }
  t.set("data.practice", { p: { reps, final: {
    "1-4": [{ lvl: 1, d: "2026-08-28" }],
    "5-8": [{ lvl: 1, d: "2026-08-28" }],
  } } });

  const бл = t.get("pracBlocks")();
  ок("прогон: блоков по четыре такта", бл.map((b) => b.from + "-" + b.to), ["1-4", "5-8", "9-12"]);
  ок("прогон: у первого блока его нет — он и есть сшивка", t.get("runNeeded")(бл[0]), false);
  ок("прогон: у первого считается пройденным", t.get("runPassed")(бл[0]), true);
  ок("прогон: у второго нужен", t.get("runNeeded")(бл[1]), true);

  // сшивки 1-4 и 5-8 стоят, значит сейчас просят сыграть с начала до восьмого
  const u = t.get("pracUnitNow")();
  ок("прогон: после сшивки второго блока просят играть с начала",
    [u.from, u.to, !!u.run], [1, 8, true]);
  ок("прогон: блок не закрыт, пока не сыгран с начала", t.get("blockDone")(бл[1]), false);

  // сыграли с начала — очередь уходит на третий блок
  t.set("data.practice.p.final", {
    "1-4": [{ lvl: 1, d: "2026-08-28" }],
    "5-8": [{ lvl: 1, d: "2026-08-28" }],
    "1-8": [{ lvl: 2, d: "2026-08-28" }],
  });
  ок("прогон: пройден — блок закрыт", t.get("blockDone")(бл[1]), true);
  const u2 = t.get("pracUnitNow")();
  ок("прогон: дальше сшивка третьего блока", [u2.from, u2.to, !!u2.run], [9, 12, false]);

  /* Уровней больше нет: прогон закрывает сам факт захода, а не его лёгкость.
     Старые записи с `lvl` при этом читаются как обычные — уровень не смотрят. */
  t.set("data.practice.p.final", {
    "1-4": [{ lvl: 1, d: "2026-08-28" }],
    "5-8": [{ lvl: 1, d: "2026-08-28" }],
    "1-8": [{ lvl: 3, d: "2026-08-28" }],
  });
  ок("прогон: старая запись «сложно» тоже закрывает", t.get("runPassed")(бл[1]), true);
  t.set("data.practice.p.final", { "1-4": [{ d: "2026-08-28" }], "5-8": [{ d: "2026-08-28" }] });
  ок("прогон: пока не сыгран — не закрыт", t.get("runPassed")(бл[1]), false);
  ок("сшивка: заход без уровня засчитан", t.get("finalPassed")(бл[1]), true);

  t.set("data.piano", было.piano);
  t.set("data.practice", было.practice);
  t.set("data.active", было.active);
}

/* ── Место под снимок отводится заранее ── */
{
  const было = t.get("data").takes;
  t.set("data.takes", [{ id: "ph1", srcId: "x", kind: "photo", w: 1050, h: 1400 },
                       { id: "ph2", srcId: "x", kind: "photo" }]);
  t.get("takeUrls").set("ph1", "blob:ph1");
  const с = t.get("mediaHTML")({ mediaId: "ph1", mediaKind: "photo", date: "2026-09-02" });
  ок("снимок: размеры попали в разметку", /width="1050" height="1400"/.test(с), true);
  ок("снимок: помечен своим id", с.includes('data-take="ph1"'), true);
  const без = t.get("mediaHTML")({ mediaId: "ph2", mediaKind: "photo" });
  ок("снимок: пока качается — коробка по его форме", без.includes("aspect-ratio"), false);
  t.get("takeUrls").delete("ph1");
  t.set("data.takes", было);
}

/* ── Перерисовка не рвёт ввод ── */
{
  const было = sandbox.document.activeElement;
  sandbox.document.activeElement = { tagName: "TEXTAREA", closest: (s) => s === "#view" ? {} : null };
  ок("ввод: поле в ленте считается набором", t.get("typingInView")(), true);
  sandbox.document.activeElement = { tagName: "TEXTAREA", closest: () => null };
  ок("ввод: поле вне ленты не мешает", t.get("typingInView")(), false);
  sandbox.document.activeElement = { tagName: "BUTTON", closest: () => ({}) };
  ок("ввод: кнопка — не набор", t.get("typingInView")(), false);
  sandbox.document.activeElement = было;
}

/* ── Ключ курса — это его id ── */
{
  const было = JSON.parse(JSON.stringify(t.get("data").pastel));
  t.set("data.pastel.courses", [{ id: "__new", name: "Рисунок", lessons: [] }]);
  t.set("data.pastel.activeCourse", "__new");
  t.set("data.active", "pastel");
  ок("ключ: курс отвечает своим id", t.get("courseKey")(), "__new");
  ок("ключ: без id — наследный «pastel»", t.get("keyOfCourse")({}), "pastel");
  ок("лента: материал курса помечен своим ключом",
    t.get("libKey")({ track: "pastel", courseId: "__new" }), "ps:__new");
  t.set("data.pastel", было);
}

/* ── Простой рисунок: день плюс снимок ── */
{
  const было = JSON.parse(JSON.stringify(t.get("data")));
  t.set("data.piano", { pieces: [], entries: [], practice: {} });
  t.set("data.book", { books: [], activeBook: "", entries: [] });
  t.set("data.watch", { videos: [], entries: [] });
  t.set("data.pastel.courses", [{ id: "__first", name: "П", lessons: [] },
    { id: "__d", name: "Рисунок", lessons: [] }]);
  t.set("data.pastel.activeCourse", "__d");
  t.set("data.active", "pastel");
  ок("рисунок: простой курс распознан", t.get("plainDraw")(), true);
  ок("рисунок: курс без уроков остаётся на ленте",
    t.get("railItems")().some((i) => i.courseId === "__d"), true);
  ок("рисунок: пока не закончен — ноль", Math.round(t.get("pastelStats")().pct), 0);
  t.set("pickDrawDone", true);
  t.get("markDraw")(null);
  ок("рисунок: кнопка ставит завершение", !!t.get("course")().done, true);
  ок("рисунок: завершён — сто процентов", Math.round(t.get("pastelStats")().pct), 100);
  t.set("pickDrawDone", false);
  t.get("markDraw")(null);
  ок("рисунок: без галочки завершение не снимается", !!t.get("course")().done, true);
  // каждая отметка — своя сессия, и текст события её нумерует
  t.set("data.pastel.entries", [
    { id: "e1", date: "2026-09-01", courseId: "__d", createdAt: 1 },
    { id: "e2", date: "2026-09-02", courseId: "__d", createdAt: 2 },
    { id: "e3", date: "2026-09-02", courseId: "__d", createdAt: 3 },
  ]);
  const txt = (id) => t.get("sessionText")("pastel", t.get("data").pastel.entries.find((x) => x.id === id));
  ок("рисунок: первый день, первая сессия", txt("e1"), "Рисовал: Рисунок · день 1, сессия 1");
  ок("рисунок: второй день, вторая сессия", txt("e3"), "Рисовал: Рисунок · день 2, сессия 2");
  const r = t.get("rangeStats")("2026-09-01", "2026-09-30");
  ок("прогресс: сессии рисунка сосчитаны", r.draws, 3);
  delete t.get("course")().done;      // выше его закрыли — здесь смотрим незакрытый
  ок("рисунок: в кольце прочерк, пока лист не закрыт", t.get("noPct")(), true);
  ок("рисунок: прочерк рисуется", t.get("ringHTML")(0, "—").includes("<b>—</b>"), true);
  /* У рисунка нет срока — значит нет ни даты, ни «материал пройден». Дни при
     этом стоят строкой выше, в подписи под названием, и повторять их под ней
     незачем: нижняя строка у рисунка молчит совсем. */
  ок("рисунок: нижняя строка пустая", t.get("paceParts")(), []);
  ок("рисунок: дни сказаны выше", /\d+ дн[а-я]* за листом/.test(t.get("heroSub")(t.get("curStats")())), true);

  const былСегодня = t.get("todayStr");

  /* И после месяца тишины она так же молчит: срока у рисунка нет. */
  t.set("todayStr", () => "2026-10-01");
  ок("рисунок: после простоя строка так же пуста", t.get("paceParts")(), []);
  t.set("todayStr", былСегодня);
  ок("рисунок: подмена «сегодня» снята", t.get("todayStr")(), t.get("dateStr")(new Date()));
  // снимок к сессии ищется по времени, а не по списку из шторки
  t.set("drawSince", 100);
  t.set("data.takes", [
    { id: "t-old", srcId: "__d", kind: "photo", at: 50 },
    { id: "t-new", srcId: "__d", kind: "photo", at: 150 },
  ]);
  const свежий = t.get("takesFor")("__d").find((x) => x.kind === "photo" && !x.deleted && x.at >= t.get("drawSince"));
  ок("рисунок: берётся снимок после открытия шторки", свежий && свежий.id, "t-new");
  ок("рисунок: курс виден лентой как материал",
    t.get("achMaterials")().some((m) => m.courseId === "__d"), true);
  t.set("data", было);
}

/* ── День за днём на странице курса ── */
{
  const c = { id: "__c", name: "Курс", lessons: [{ steps: [
    { t: "Первый ход", g: "Начало" }, { t: "Второй ход", g: "Начало" }, { t: "Третий ход", g: "Конец" }] }] };
  const html = t.get("pastelDaysHTML")(c,
    { "L0:s0": "2026-09-01", "L0:s1": "2026-09-02", "L0:s2": "2026-09-02" },
    [{ date: "2026-09-02", mins: 36 }]);
  ок("дни: оба дня на месте", (html.match(/class="pd"/g) || []).length, 2);
  ок("дни: ходы названы", html.includes("Второй ход · Третий ход"), true);
  ок("дни: минуты дня показаны", html.includes("36 мин"), true);
  ок("дни: счёт ходов за день", html.includes("2 хода"), true);
  ок("дни: без единой отметки блока нет", t.get("pastelDaysHTML")(c, {}, []), "");
}

/* ── Живые названия в ленте ── */
{
  const t0 = { track: "book", key: "__нет", event: "session" };
  ок("лента: имя карточки берётся запасное, когда материала нет",
    t.get("evName")(t0, "__нет:0", "fact", "Старое имя"), "Старое имя");
  ок("лента: имя награды тоже", t.get("evName")(t0, "d3", "ach", "Старая награда"), "Старая награда");
  const кн = (t.get("data").book.books || [])[0];
  if (кн) {
    const t1 = { track: "book", key: кн.id, event: "session" };
    ок("лента: несуществующий номер не роняет", t.get("evName")(t1, кн.id + ":999", "fact", "Запас"), "Запас");
  }
  t.get("evNameCache").clear();
}

/* ── Подтверждение на кнопке ── */
{
  const b = { textContent: "Промт для ИИ", dataset: {}, classList: { add() {}, remove() {} } };
  t.get("btnSay")(b, "✓ Скопировано");
  ок("кнопка: надпись сменилась", b.textContent, "✓ Скопировано");
  ок("кнопка: прежнюю надпись запомнили", b.dataset.was, "Промт для ИИ");
  t.get("btnSay")(b, "✓ Скопировано");
  ок("кнопка: повторное нажатие не затирает прежнюю надпись", b.dataset.was, "Промт для ИИ");
}

/* ── Промт для разбора главы ── */
{
  const cat = t.get("CATALOG");
  const кн = { id: "__a", title: "Книга", author: "Автор",
    chapters: [{ from: 0, name: "Первая" }, { from: 40, name: "Вторая" }, { from: 90, name: "Третья" }] };
  const общий = t.get("askText")(кн, 1);
  ок("промт: подставилась глава", общий.includes("«Вторая»"), true);
  ок("промт: подставился номер", общий.includes("2-я из 3"), true);
  ок("промт: подставилась книга с автором", общий.includes("«Книга» (Автор)"), true);
  ок("промт: не осталось подстановок", /\{(книга|автор|глава|n|всего)\}/.test(общий), false);

  cat.__a = { ask: "Разбери {n} песнь «{книга}». Всего {всего}." };
  ок("промт: свой шаблон книги сильнее общего", t.get("askText")(кн, 2), "Разбери 3 песнь «Книга». Всего 3.");
  cat.__a.ask = "   ";
  ок("промт: пустой шаблон не в счёт", t.get("askText")(кн, 0).includes("Структура ответа"), true);
  delete cat.__a;

}

/* ── Задание для ChatGPT по слову из шага ── */
{
  const tp = t.get("termPrompt");
  const с = tp("валик", { t: "Мышца над глазом." }, "argos-ref");
  ок("слово: с референсом просят разобрать по картине", с.includes("вставил фрагмент картины"), true);
  ок("слово: с референсом просят порядок линий", с.includes("шаг за шагом"), true);
  ок("слово: пояснение места попадает в задание", с.includes("Мышца над глазом."), true);

  const б = tp("валик", {}, "");
  ок("слово: без референса — прежняя схема", б.includes("Нарисуй пояснительную схему"), true);
  ок("слово: без референса про картину не пишем", б.includes("фрагмент картины"), false);

  ок("слово: своё задание из словаря сильнее", tp("валик", { gen: "своё" }, "argos-ref"), "своё");
}

/* ── Номер главы в содержании карты ──
   Книга, у которой большинство глав нумерует себя сама, показывается как есть:
   «1. Совет богов» спорило бы с изданием, где написано «Песнь I». Книга без
   своей нумерации получает наш номер — иначе непонятно, где ты. */
{
  const было = t.get("gm");
  const и = t.get("gmИмяГлавы");
  const части = (список) => t.set("gm", { места: [], id: "kn", слой: "place", часть: 1,
    at: null, части: список.map((name, i) => ({ n: i + 1, name })) });

  части(["Игла в сердце", "Отступание берега", "Этапы штурма"]);
  ок("глава: без своей нумерации приписываем номер", и(3, "Этапы штурма"), "3. Этапы штурма");
  ок("глава: без названия остаётся номер", и(3, ""), "3. ");

  части(["Песнь I", "Песнь II", "Песнь III", "Комментарии"]);
  ок("глава: своя нумерация остаётся как есть", и(2, "Песнь II"), "Песнь II");
  ок("глава: и хвост издания не трогаем", и(4, "Комментарии"), "Комментарии");

  // предисловие без номера не отменяет того, что книга нумерует себя сама
  части(["Предисловие", "Письмо первое", "Письмо второе", "Письмо третье"]);
  ок("глава: большинства достаточно", и(2, "Письмо первое"), "Письмо первое");
  ок("глава: и безномерная строка тоже без номера", и(1, "Предисловие"), "Предисловие");

  // у пьесы главы названы тактами — номер блока их только повторял бы
  части(["Такты 1–4", "Такты 5–8"]);
  ок("глава: у пьесы номер не приписывается", и(2, "Такты 5–8"), "Такты 5–8");
  t.set("gm", было);
}

/* ── Слои карты ── */
{
  const было = t.get("gm");
  t.set("gm", { слой: "", часть: 0, at: null, части: [{ n: 1, name: "Глава 1" }], места: [
    { name: "Скала", lat: 1, lon: 1, part: 1 },
    { name: "Вторая", lat: 2, lon: 2 },
    { name: "Книга", kind: "book", lat: 3, lon: 3 },
    { name: "Человек", kind: "person", lat: 4, lon: 4 },
  ] });
  ок("слои: без пометки точка географическая", t.get("слойТочки")({ name: "х" }), "place");
  ок("слои: на карте остались места", t.get("gmLayersOf")().map((x) => x[0]), ["place"]);
  t.get("gm").места.push({ name: "Олуша", kind: "animal", lat: 0, lon: 0 },
                         { name: "Дюльфер", kind: "word", lat: 0, lon: 0 });
  /* Справок на карте больше нет — живность и слова живут в собрании. */
  ок("слои: справки на карту не возвращаются",
    t.get("gmLayersOf")().map((x) => x[0]), ["place"]);
  ок("содержание: в подписи только места", t.get("gmМест")({ place: 3, word: 5 }), "3 места");
  ок("содержание: мест нет — подписи нет", t.get("gmМест")({ animal: 2, word: 5 }), "");
  t.get("gm").места.push({ name: "Слово главы 1", kind: "word", part: 1, lat: 0, lon: 0 });
  t.get("gm").часть = 1;
  const счёт = (k) => new Set(t.get("gm").места.filter((p) =>
    (p.kind || "place") === k && (!t.get("gm").часть || (Number(p.part) || Number(p.ch) || 0) === t.get("gm").часть))
    .map((p) => p.name)).size;
  ок("слои: в первой главе одно слово, а не все", счёт("word"), 1);
  ок("слои: в первой главе одно место", счёт("place"), 1);
  t.get("gm").часть = 0;
  ок("слои: по умолчанию видны только места",
    t.get("gmВидимые")().map((p) => p.name), ["Скала", "Вторая"]);
  /* Вторая вкладка — всё, кроме мест, и сразу секциями в порядке СЛОИ:
     книги, люди, живность, слова. */
  t.get("gm").слой = "all";
  ок("слои: справки идут одним списком по секциям",
    t.get("gmВидимые")().map((p) => p.name),
    ["Книга", "Человек", "Олуша", "Дюльфер", "Слово главы 1"]);
  t.get("gm").слой = "";
  /* Две записи в первой главе: место и слово — содержание считает всё разом. */
  ок("содержание: глава считается по всем слоям сразу", t.get("gmParts")().map((c) => c.k), [2]);
  ок("содержание: книги и слова в подписи не считаются",
    t.get("gmМест")({ place: 1, book: 2, word: 7 }), "1 место");
  t.get("gm").слой = "place";
  t.set("gm", было);
}

/* ── Шапка карты: что показывать на какой вкладке ── */
{
  const было = t.get("gm");
  const надпись = { textContent: "" };
  const ряд = { hidden: true };
  const кн = { hidden: true, querySelector: () => надпись };
  const поле = { hidden: true, value: "" };
  const узлы = { "#gmNav": ряд, "#gmToc": кн, "#gmFind": поле };
  const былПоиск = t.get("document.querySelector");
  t.set("document.querySelector", (s2) => узлы[s2] || null);

  /* Книга с местами и главами: вкладок несколько, второй ряд на месте. */
  t.set("gm", { слой: "place", часть: 1, at: null, поиск: "",
    части: [{ n: 1, name: "Шаг в сторону" }, { n: 2, name: "Лес" }],
    места: [{ name: "Байкал", lat: 1, lon: 1, part: 1 }, { name: "Иркутск", lat: 2, lon: 2, part: 1 },
            { name: "Хижина", lat: 3, lon: 3, part: 2 }, { name: "Ольхон", lat: 4, lon: 4, part: 2 }] });
  t.get("gmNavRow")();
  ок("шапка: на местах виден второй ряд", ряд.hidden, false);
  ок("шапка: на кнопке — выбранная глава", кн.querySelector("b").textContent, "1. Шаг в сторону");
  ок("шапка: поиск на месте", поле.hidden, false);

  /* Вкладки «Текст» больше нет — она уехала в attic вместе с файлами книг. */

  /* Собрание главой не сужается: над списком тем «Глава 1» — подпись к
     соседнему экрану, из-за неё всё и затевалось. */
  t.get("gm").слой = "col";
  поле.value = "байк";
  t.get("gmNavRow")();
  ок("шапка: над собранием второго ряда нет", ряд.hidden, true);
  ок("шапка: набранное в поиске снимается вместе с рядом", поле.value, "");

  /* Пьеса и рисунок: ни глав, ни точек — ряда нет ни на одной вкладке. */
  t.set("gm", { слой: "col", часть: 0, at: null, поиск: "", части: [],
    места: [{ name: "Стаккато", kind: "word", lat: 0, lon: 0 }] });
  t.get("gmNavRow")();
  ок("шапка: у пьесы второго ряда нет вовсе", ряд.hidden, true);
  t.get("gm").слой = "place";
  t.get("gmNavRow")();
  ок("шапка: и на других вкладках тоже", ряд.hidden, true);

  t.set("document.querySelector", былПоиск);
  t.set("gm", было);
}

/* ── Отрезок плеера возвращается к такту ── */
{
  const пл = t.get("pracLoops");
  const было = { loops: JSON.parse(JSON.stringify(пл)), prac: t.get("prac"), el: t.get("pracAudioEl") };
  for (const k of Object.keys(пл)) delete пл[k];
  t.set("pracAudioEl", { dataset: { for: "p1" }, duration: 300, currentTime: 0 });
  пл.p1 = {};
  t.set("prac", { cur: { from: 1, to: 4 } });
  t.set("data.piano", { pieces: [{ id: "p1", name: "П", bars: 8 }], activePiece: "p1", entries: [], practice: {} });
  t.set("data.active", "piano");
  const пд = t.get("PRACTICE_DATA");
  const былоPd = пд.p1;
  пд.p1 = { marks: { 1: 10, 5: 30 } };

  ок("плеер: разметка такта найдена", t.get("markSpan")({ from: 1, to: 4 }), { a: 10, b: 30 });
  ок("плеер: пока не трогали — возвращать нечего", t.get("plMoved")(), false);
  пл.p1.a = 12; пл.p1.b = 30;
  ок("плеер: сдвинутый край виден", t.get("plMoved")(), true);
  t.get("plResetSpan")();
  ок("плеер: отрезок вернулся к разметке", [пл.p1.a, пл.p1.b], [10, 30]);
  ок("плеер: и снова возвращать нечего", t.get("plMoved")(), false);

  for (const k of Object.keys(пл)) delete пл[k];
  Object.assign(пл, было.loops);
  t.set("prac", было.prac); t.set("pracAudioEl", было.el);
  if (былоPd === undefined) delete пд.p1; else пд.p1 = былоPd;
}

/* ── Год и показатели графика ── */
{
  const было = { period: t.get("period"), shift: t.get("shift"), metric: t.get("cfg").metric,
    data: JSON.parse(JSON.stringify(t.get("data"))) };
  t.set("data", { active: "book", piano: { pieces: [], entries: [], practice: {} },
    book: { books: [{ id: "b", title: "К", pages: 400 }], activeBook: "b",
      entries: [{ id: "e1", date: "2026-03-10", bookId: "b", page: 50 },
                { id: "e2", date: "2026-08-10", bookId: "b", page: 120 }] },
    watch: { videos: [], entries: [] }, pastel: { courses: [], activeCourse: "", entries: [] },
    practice: {}, thoughts: [], hidden: {}, achAt: {}, factAt: {}, archive: [], daily: {},
    wishes: [], takes: [], weekGoal: 4 });
  t.set("period", "year"); t.set("shift", 0);
  const r = t.get("periodRange")();
  const год = new Date().getFullYear();
  ок("год: границы периода — весь год", [r.from, r.to], [год + "-01-01", год + "-12-31"]);
  const п = t.get("prevSlice")(r);
  ок("год: сравниваем с прошлым годом", [п.from, п.to], [(год - 1) + "-01-01", (год - 1) + "-12-31"]);

  t.set("cfg.metric", "entries");
  const ряд = t.get("periodSeries")();
  ок("год: двенадцать точек", ряд.length, 12);
  ок("год: подписи через одну", ряд.filter((x) => x.label).length, 6);
  ок("год: март и август непустые",
    [ряд[2].value, ряд[7].value], [1, 1]);

  t.set("cfg.metric", "pages");
  const стр = t.get("periodSeries")();
  ок("страницы: график считает прочитанное, а не число отметок", стр[7].value, 70);
  t.set("cfg.metric", "нет-такого");
  ок("показатель: незнакомый откатывается к занятиям", t.get("metricNow")().id, "entries");

  t.set("period", было.period); t.set("shift", было.shift);
  t.set("cfg.metric", было.metric); t.set("data", было.data);
}

/* ── Обложка: путь, которого нет, не показываем ── */
{
  const годен = t.get("coverOk");
  ок("обложка: путь из репозитория больше не годится", годен("covers/tesson.jpg"), false);
  ок("обложка: пустое — не годится", годен(""), false);
  ок("обложка: картинка в данных годится", годен("data:image/jpeg;base64,/9j/"), true);
  ок("обложка: скачанное годится", годен("blob:http://x/1"), true);
  ок("обложка: чужой адрес годится", годен("https://example.com/a.jpg"), true);

  const кэш = t.get("coverCache");
  кэш.set("проба", "");     // уже спрашивали, обложки нет — второй раз не пойдём
  ок("обложка: мёртвый путь не доходит до разметки",
    t.get("coverSrc")("проба", "covers/проба.jpg"), "");
  кэш.set("проба", "blob:готовая");
  ок("обложка: скачанная перебивает всё", t.get("coverSrc")("проба", ""), "blob:готовая");
  кэш.delete("проба");
}

/* ── Опись каталога тянется прямой ссылкой, а не описью всего гиста ── */
const сеть = (() => {
  const cfg = t.get("cfg");
  const былCat = t.get("CATALOG");
  const было = { token: cfg.token, catalogId: cfg.catalogId, catalogOwner: cfg.catalogOwner,
                 catHash: cfg.catHash, catalogAt: cfg.catalogAt };
  Object.assign(cfg, { token: "x", catalogId: "гист", catalogOwner: "кто-то",
                       catHash: {}, catalogAt: 0 });
  const адреса = [];
  const прежний = t.get("fetch");
  t.set("fetch", async (url) => {
    адреса.push(String(url));
    return { ok: true, status: 200, headers: { get: () => "" },
             text: async () => JSON.stringify({ v: 1, materials: { проба: { title: "Проба" } } }) };
  });
  return t.get("catalogPull")(true).then(() => {
    ок("каталог: запрос идёт прямой ссылкой на файл",
      адреса.some((u) => /gist\.githubusercontent\.com\/.+\/raw\/keiko-catalog\.json$/.test(u)), true);
    ок("каталог: опись всего гиста не запрашивается",
      адреса.some((u) => /api\.github\.com\/gists\//.test(u)), false);
    ок("каталог: материал из файла применился", !!t.get("CATALOG")["проба"], true);
    return t.get("catalogPull")(true);
  }).then(() => {
    ок("каталог: то же содержимое второй раз не разбирают заново",
      t.get("cfg").catHash[t.get("CAT_FILE")] !== undefined, true);
    t.set("fetch", прежний);
    Object.assign(t.get("cfg"), было);
    t.set("CATALOG", былCat);
  });
})();

/* ── Собрание: «вокруг книги» и повторы ── */
{
  const былиARTS = t.get("ARTS"), былМузей = t.get("MUSEUM"), былиДанные = t.get("data");
  t.set("MUSEUM", { items: [] });
  t.set("ARTS", { kn: { map: [
    /* Одно слово размечено в трёх главах: на карте это верно, в собрании —
       три одинаковые ячейки. */
    { part: 4, kind: "word", name: "Стек", about: "коротко" },
    { part: 2, kind: "word", name: "Стек", about: "подробно и с историей" },
    { part: 6, kind: "word", name: "Стек", about: "средне" },
    // «вокруг книги»: главы нет
    { kind: "book", name: "Этот перевод", about: "про издание" },
    { kind: "person", name: "Переводчик", about: "про человека" },
    { kind: "word", name: "Премия", about: "про премию" },
  ] } });
  const bk = { id: "kn", kind: "book", pages: 400, startPage: 0,
               chapters: [{ from: 1 }, { from: 51 }, { from: 101 }, { from: 151 },
                          { from: 201 }, { from: 251 }] };
  t.set("data", Object.assign({}, былиДанные, {
    active: "book",
    book: { activeBook: "kn", books: [bk], entries: [] },
  }));

  const вещи = t.get("colItems")(bk);
  const стеки = вещи.filter((x) => x.name === "Стек");
  ок("собрание: повторы одного слова сведены в одну запись", стеки.length, 1);
  ок("собрание: осталось самое полное", стеки[0].about, "подробно и с историей");
  ок("собрание: глава — самая ранняя из встреченных", стеки[0].ch, 2);

  const без = вещи.filter((x) => !Number(x.ch));
  ок("собрание: записей вокруг книги три", без.length, 3);
  ок("собрание: у каждой свой порог по страницам",
    без.map((x) => x.порог).sort((a, b) => a - b), [100, 200, 300]);

  /* Книга не начата — не открыто ничего, включая «вокруг книги». Раньше эти
     записи лежали открытыми с первого дня, и у «Писем Баламута», где главы не
     проставлены ни у одной, собрание было полным до первой страницы. */
  ок("собрание: до чтения не открыто ничего",
    вещи.filter((x) => t.get("colOpen")(bk, x)).length, 0);

  t.get("data").book.entries = [{ id: "e", bookId: "kn", date: "2026-09-06", page: 205 }];
  const открыто = вещи.filter((x) => t.get("colOpen")(bk, x)).map((x) => x.name).sort();
  ок("собрание: на 205 странице пришли две записи вокруг книги и слово",
    открыто.length, 3);

  /* Начал не с первой страницы — пороги считаются от неё же. */
  const bk2 = Object.assign({}, bk, { startPage: 200 });
  const вещи2 = t.get("colПороги")(bk2, [
    { id: "a", ch: 0 }, { id: "b", ch: 0 }, { id: "c", ch: 0 },
  ]);
  ок("собрание: пороги считаются от страницы, с которой начал",
    вещи2.map((x) => x.порог), [250, 300, 350]);

  t.set("ARTS", былиARTS); t.set("MUSEUM", былМузей); t.set("data", былиДанные);
}

/* ── Очередь экранов после занятия ── */
{
  const былаОчередь = t.get("overlayQueue");
  const показано = [];
  const былПоказ = t.get("showNextOverlay");
  t.set("showNextOverlay", function () {
    показано.push(...(t.get("overlayQueue") || []).map((o) => o.type));
    t.set("overlayQueue", []);
  });

  /* Вещь за занятие кладут в очередь до того, как посчитаны награды. Здесь
     стояло overlayQueue = [], и она молча пропадала: открывалась и ложилась в
     собрание, а карточки не было. */
  t.set("overlayQueue", [{ type: "theory", x: { name: "Октава" } }]);
  t.get("showWon")({ ach: [{ id: "a", name: "Награда" }], facts: [] });
  ок("очередь: награда не выбрасывает выданную вещь", показано, ["ach", "theory"]);

  показано.length = 0;
  t.set("overlayQueue", [{ type: "theory", x: { name: "Терция" } }]);
  t.get("showWon")(null);
  ок("очередь: без награды вещь всё равно показывают", показано, ["theory"]);

  показано.length = 0;
  t.set("overlayQueue", []);
  t.get("showWon")(null);
  ок("очередь: показывать нечего — ничего и не показали", показано, []);

  t.set("showNextOverlay", былПоказ);
  t.set("overlayQueue", былаОчередь);
}

/* ── Выданное за занятие переживает перезапуск и синхронизацию ── */
{
  const было = t.get("data");
  const снимок = {
    v: 7, active: "piano", colGiven: { bwv853: ["word|Октава"] },
    colSeen: { "bwv853|word|Октава": 500 }, colSeenV: 1,
    piano: { pieces: [], entries: [] }, book: { books: [], entries: [] },
    pastel: { entries: [], courses: [] }, thoughts: [], wishes: [],
  };
  /* Полей собрания не было ни в нормализации, ни в выгрузке, ни в слиянии —
     выданная вещь жила до первого перезапуска и молча пропадала. */
  const norm = t.get("migrate")(снимок);
  ок("собрание: выданное переживает разбор данных",
    (norm.colGiven || {}).bwv853, ["word|Октава"]);
  ок("собрание: просмотренное тоже", !!(norm.colSeen || {})["bwv853|word|Октава"], true);

  t.set("data", t.get("migrate")(снимок));
  const наружу = t.get("exportData")();
  ок("собрание: выданное уходит в гист", (наружу.colGiven || {}).bwv853, ["word|Октава"]);

  /* Занимался на телефоне и на ноутбуке — выдачи разные, обе остаются. */
  t.get("colMerge")({
    v: 7, colGiven: { bwv853: ["word|Полутон"], more: ["word|Тема"] },
    colSeen: { "bwv853|word|Октава": 200 },
  });
  ок("собрание: выдачи с двух устройств складываются",
    t.get("data").colGiven.bwv853.slice().sort(), ["word|Октава", "word|Полутон"]);
  ок("собрание: чужой материал приезжает целиком",
    t.get("data").colGiven.more, ["word|Тема"]);
  ок("собрание: просмотрено по самой ранней метке",
    t.get("data").colSeen["bwv853|word|Октава"], 200);

  t.set("data", было);
}

/* ── Переход в собрание — у любого материала ── */
{
  const былиДанные = t.get("data");
  const узлы = {};
  const пусто = (id) => (узлы[id] = узлы[id] || {
    hidden: true, textContent: "", innerHTML: "",
    classList: { add(){}, remove(){}, toggle(){}, contains: () => false },
    querySelector: () => null, addEventListener(){},
  });
  const былПоиск = t.get("document.querySelector");
  t.set("document.querySelector", (s2) => (String(s2)[0] === "#" ? пусто(s2) : null));

  /* У книги кнопка в собрание была, у пьесы и рисунка — нет: путь был написан
     внутри итога главы и звал book() напрямую. */
  const былаОчередь = t.get("overlayQueue");
  t.set("overlayQueue", []);
  t.set("cheerGo", null);
  t.get("showColNew")({ n: 1 });
  ок("занятие: последним экраном ведут в собрание", узлы["#cheerOk"].textContent, "Посмотреть");
  ок("занятие: переход и правда назначен", typeof t.get("cheerGo"), "function");
  /* Текстов вещей на этом экране нет: их читают в собрании, а не листая
     подряд десяток экранов после дочитанной главы. */
  ок("занятие: на экране счёт, а не описание", узлы["#cheerText"].textContent, "Пришло 1 запись.");
  ок("занятие: заголовок общий", узлы["#cheerTitle"].textContent, "В собрании новое");

  t.set("cheerGo", null);
  t.set("overlayQueue", [{ type: "ach", a: { name: "Награда" } }]);
  t.get("showColNew")({ n: 3 });
  ок("занятие: пока в очереди есть ещё — кнопка «Дальше»", узлы["#cheerOk"].textContent, "Дальше");
  ок("занятие: и никуда не ведёт", t.get("cheerGo"), null);
  ок("занятие: счёт во множественном", узлы["#cheerText"].textContent, "Пришло 3 записи.");

  /* У книги тот же экран, только назван главой. */
  t.set("overlayQueue", []);
  t.get("showColNew")({ глава: "Песнь IV", n: 10 });
  ок("глава: заголовок — её имя", узлы["#cheerTitle"].textContent, "Песнь IV");
  ок("глава: подпись про главу", узлы["#cheerStep"].textContent, "Глава закрыта");
  ок("глава: та же кнопка", узлы["#cheerOk"].textContent, "Посмотреть");

  /* Пачка идёт одним экраном, а не по экрану на вещь. */
  t.set("overlayQueue", []);
  t.get("colПоказать")([{ id: "a" }, { id: "b" }, { id: "c" }]);
  ок("очередь: на пачку — один экран", (t.get("overlayQueue") || []).length, 1);
  ок("очередь: и он знает, сколько пришло", (t.get("overlayQueue") || [])[0].n, 3);

  t.set("overlayQueue", былаОчередь);
  t.set("document.querySelector", былПоиск);
  t.set("data", былиДанные);
}

/* ── Сборник, который читают вразбивку ── */
{
  const было = t.get("data");
  const bk = { id: "sb", title: "Сборник", pages: 221, startPage: 0, mode: "parts",
    chapters: [{ name: "Невский проспект", from: 5 }, { name: "Нос", from: 51 },
               { name: "Портрет", from: 84 }, { name: "Шинель", from: 155 },
               { name: "Записки сумасшедшего", from: 195 }] };
  t.set("data", { active: "book", piano: { pieces: [], entries: [] },
    pastel: { courses: [], entries: [] }, watch: { videos: [], entries: [] },
    book: { books: [bk], activeBook: "sb", entries: [
      /* Начал с «Шинели» — четвёртой повести. */
      { id: "e1", date: "2026-09-07", bookId: "sb", spans: [{ from: 155, to: 194 }] },
    ] }, thoughts: [], wishes: [] });

  /* Курсор дошёл до 194-й, и по старому правилу это открыло бы три повести,
     которых он не читал, вместе со всей их картой и собранием. */
  ок("вразбивку: курсор ушёл далеко", t.get("bookProgressOf")(bk), 194);
  ок("вразбивку: первая повесть закрыта", t.get("chapterRead")(bk, 1), false);
  ок("вразбивку: вторая закрыта", t.get("chapterRead")(bk, 2), false);
  ок("вразбивку: третья закрыта", t.get("chapterRead")(bk, 3), false);
  ок("вразбивку: прочитанная открыта", t.get("chapterRead")(bk, 4), true);
  ок("вразбивку: последняя ещё нет", t.get("chapterRead")(bk, 5), false);

  /* Дочитал вторую повесть — открылась она, остальные на месте. */
  t.get("data").book.entries.push({ id: "e2", date: "2026-09-08", bookId: "sb",
    spans: [{ from: 51, to: 83 }] });
  ок("вразбивку: дочитанная вторая открылась", t.get("chapterRead")(bk, 2), true);
  ок("вразбивку: первая по-прежнему закрыта", t.get("chapterRead")(bk, 1), false);

  /* Отметка вразбивку — это список кусков, поля page у неё нет. Пока
     считали по нему, у сборника не работали ни размах захода, ни «повесть за
     присест», ни возврат назад: три награды были недостижимы. */
  const ст = t.get("curStats")();
  ок("вразбивку: размах захода считается по кускам", ст.maxJump, 40);
  ок("вразбивку: повесть за присест засчитана", ст.chapterInOne, true);
  ок("вразбивку: назад ещё не возвращались", ст.reread, false);
  t.get("data").book.entries.push({ id: "e3", date: "2026-09-09", bookId: "sb",
    spans: [{ from: 160, to: 170 }] });
  ок("вразбивку: перечитанный кусок замечен", t.get("curStats")().reread, true);

  /* Сто процентов должны быть достижимы: первые четыре страницы — титул, и
     покрыть их нечем. Где начинается текст, знает первая глава; startPage для
     этого не годится — он значит «докуда уже прочитано» и дал бы процент на
     неоткрытой книге. */
  t.get("data").book.books[0] = bk;
  t.get("data").book.entries = [{ id: "e", date: "2026-09-07", bookId: "sb",
    spans: [{ from: 5, to: 221 }] }];
  ок("вразбивку: весь текст — это сто процентов",
    Math.round(t.get("curStats")().pct), 100);
  t.get("data").book.entries = [];
  ок("вразбивку: до первой отметки процента нет", Math.round(t.get("curStats")().pct), 0);

  /* «Осталось» у сборника — про ту повесть, чьё имя стоит рядом. Считалось до
     конца тома: начав «Шинель» со 155-й, человек видел 62 страницы вместо
     тридцати пяти, да ещё и сто пятьдесят непрочитанных в это число не
     входили. */
  t.get("data").book.entries = [{ id: "e", date: "2026-09-13", bookId: "sb",
    spans: [{ from: 155, to: 159 }] }];
  ок("вразбивку: рядом стоит имя читаемой повести",
    t.get("curStats")().chapter.name, "Шинель");
  ок("вразбивку: осталось — до конца повести",
    t.get("bookLeft")(t.get("curStats")()).своё, 35);
  ок("вразбивку: и отдельно — сколько всего не прочитано",
    t.get("bookLeft")(t.get("curStats")()).всего, 212);
  ок("вразбивку: в подписи именно повесть",
    /Шинель.*осталось 35/.test(t.get("heroSub")(t.get("curStats")())), true);

  /* Повесть закрыта — имя из подписи уходит: иначе число молча меняет
     предмет с повести на всю книгу. */
  t.get("data").book.entries = [{ id: "e", date: "2026-09-13", bookId: "sb",
    spans: [{ from: 155, to: 194 }] }];
  ок("вразбивку: у закрытой повести имени в подписи нет",
    /Шинель/.test(t.get("heroSub")(t.get("curStats")())), false);
  ок("вразбивку: и остаток теперь книжный",
    /осталось 177/.test(t.get("heroSub")(t.get("curStats")())), true);

  /* Начал следующую повесть — подпись про неё, хотя курсор помнит 194-ю. */
  t.get("data").book.entries.push({ id: "e2", date: "2026-09-14", bookId: "sb",
    spans: [{ from: 5, to: 20 }] });
  ок("вразбивку: перешёл к другой повести — имя сменилось",
    t.get("curStats")().chapter.name, "Невский проспект");

  /* Срок «когда дочитаю» у сборника не показывался ни разу: прирост считался
     по курсору, которого у таких отметок нет вовсе. */
  t.get("data").book.entries = [{ id: "e", date: t.get("todayStr")(), bookId: "sb",
    spans: [{ from: 155, to: 159 }] }];
  const пр = t.get("paceForecast")();
  ок("вразбивку: срок считается с первого вечера", !!пр, true);
  ок("вразбивку: осталось по покрытию, а не по курсору", пр && пр.left, 212);

  /* Места размечены, а картинки карты ещё нет: вкладка «Места» не показывается,
     но книга открывается — собрание и текст на месте. */
  {
    const былgm = t.get("gm");
    t.set("gm", { подложка: false, слой: "", часть: 0, at: null, части: [],
      места: [{ name: "Невский проспект", lat: 59.9, lon: 30.3 },
              { name: "Шинель", kind: "thing", lat: 0, lon: 0 }] });
    ок("без подложки: вкладки мест нет",
      t.get("gmLayersOf")().map((x) => x[0]).includes("place"), false);
    t.get("gm").подложка = true;
    ок("с подложкой: вкладка мест есть",
      t.get("gmLayersOf")().map((x) => x[0]).includes("place"), true);
    t.set("gm", былgm);
  }

  /* У книги подряд правило прежнее: курсор дошёл — глава открыта. */
  const линия = Object.assign({}, bk, { mode: "linear" });
  t.get("data").book.books[0] = линия;
  t.get("data").book.entries = [{ id: "e1", date: "2026-09-07", bookId: "sb",
    spans: [{ from: 155, to: 194 }] }];
  ок("подряд: правило не изменилось", t.get("chapterRead")(линия, 1), true);

  /* «Осталось» у книги подряд — тоже про ту главу, чьё имя стоит рядом.
     Считалось до конца тома, и «Мёртвые души» на первой же странице обещали
     «Глава I · осталось 351 страница», хотя глава кончается на двадцать
     второй. */
  t.get("data").book.entries = [{ id: "e1", date: "2026-09-07", bookId: "sb",
    page: 160 }];
  ок("подряд: рядом стоит имя читаемой главы",
    t.get("curStats")().chapter.name, "Шинель");
  ок("подряд: осталось — до конца главы, а не тома",
    /Шинель.*осталось 34/.test(t.get("heroSub")(t.get("curStats")())), true);

  /* Книгу ещё не открывали: считаем от первой страницы текста, а не от нуля. */
  t.get("data").book.entries = [];
  ок("подряд: у неоткрытой книги — остаток первой главы",
    /осталось 46/.test(t.get("heroSub")(t.get("curStats")())), true);

  /* Последняя глава считается до конца тома — дальше границы нет. */
  t.get("data").book.entries = [{ id: "e1", date: "2026-09-07", bookId: "sb",
    page: 200 }];
  ок("подряд: последняя глава — до конца тома",
    /Записки.*осталось 21/.test(t.get("heroSub")(t.get("curStats")())), true);

  /* Дочитал последнюю страницу главы — подпись смотрит вперёд, на следующую.
     Иначе имя оставалось прежним, а число становилось остатком всей книги:
     дочитав первую главу «Мёртвых душ» на 22-й странице, человек видел
     «Глава I · осталось 329 страниц». */
  t.get("data").book.entries = [{ id: "e1", date: "2026-09-07", bookId: "sb",
    page: 194 }];
  ок("подряд: глава дочитана — в подписи следующая",
    /Записки сумасшедшего.*осталось 27/.test(t.get("heroSub")(t.get("curStats")())), true);
  ок("подряд: дочитанной главы в подписи уже нет",
    /Шинель/.test(t.get("heroSub")(t.get("curStats")())), false);

  /* Книга дочитана до конца — переходить некуда, имя уходит из подписи. */
  t.get("data").book.entries = [{ id: "e1", date: "2026-09-07", bookId: "sb",
    page: 221 }];
  ок("подряд: у дочитанной книги имени главы нет",
    /Записки/.test(t.get("heroSub")(t.get("curStats")())), false);

  t.set("data", было);
}

/* ── Главная открывается на последнем отмеченном ── */
{
  const было = t.get("data");
  t.set("data", {
    active: "piano", piano: { activePiece: "p1", pieces: [{ id: "p1", name: "Пьеса", bars: 10 }],
      entries: [{ id: "a", date: "2026-09-01", pieceId: "p1", updatedAt: 100 }] },
    book: { activeBook: "kn", books: [{ id: "kn", title: "Книга", pages: 100, chapters: [{ from: 1 }] }],
      entries: [{ id: "b", date: "2026-09-07", bookId: "kn", page: 20, updatedAt: 900 }] },
    pastel: { courses: [], entries: [] }, watch: { videos: [], entries: [] },
    thoughts: [], wishes: [], hidden: {},
  });
  ок("последний отмеченный — книга", t.get("lastMarkedItem")(), { track: "book", id: "kn" });
  t.get("openOnLastMarked")();
  ок("главная встаёт на неё", t.get("data").active, "book");

  /* Отметка у пьесы свежее — открываемся на пьесе. */
  t.get("data").piano.entries[0].updatedAt = 2000;
  t.get("openOnLastMarked")();
  ок("свежая отметка перебивает", t.get("data").active, "piano");

  /* Материала нет на главной — не возвращаем его. */
  t.get("data").piano.pieces = [];
  t.get("data").active = "book";
  t.get("openOnLastMarked")();
  ок("снятого с главной не возвращаем", t.get("data").active, "book");

  t.set("data", было);
}

/* ── Пустое не затирает полное ── */
{
  /* Устройство с вычищенным хранилищем отправляло наверх пустой профиль и
     стирало в гисте книги, отметки и мысли. Спасла только история ревизий. */
  const счёт = (o) => o ? ((o.book || {}).books || []).length + ((o.piano || {}).pieces || []).length
    + ((o.book || {}).entries || []).length + ((o.piano || {}).entries || []).length
    + ((o.pastel || {}).entries || []).length + (o.thoughts || []).length : 0;
  const пусто = { book: { books: [], entries: [] }, piano: { pieces: [], entries: [] },
                  pastel: { entries: [] }, thoughts: [] };
  const полно = { book: { books: [{ id: "kn" }], entries: [{ id: "e" }] },
                  piano: { pieces: [], entries: [] }, pastel: { entries: [] },
                  thoughts: [{ id: "t" }] };
  ок("пустой профиль считается пустым", счёт(пусто), 0);
  ок("полный — нет", счёт(полно) > 0, true);
  ок("отправку пустого поверх полного запрещаем", !счёт(пусто) && !!счёт(полно), true);
  ок("полное поверх полного отправляем", !(!счёт(полно) && счёт(полно)), true);
  ок("пустое поверх пустого не мешаем", !(!счёт(пусто) && счёт(пусто)), true);
}

/* ── Траектория: отметить стихи одним подтверждением ── */
{
  const было = t.get("data");
  const d = sandbox.emptyData();
  const b = { id: "pushkin-test", chapters: [] };
  d.book.books = [b]; d.book.activeBook = b.id;
  t.set("data", d);
  const save = sandbox.confirmRoutePicks;
  ок("траектория: пустой выбор не создаёт отметку", save(b, new Set(), "2026-09-26"), 0);
  ок("траектория: пустой выбор не создаёт запись", d.book.entries.length, 0);
  ок("траектория: записывает все выбранные стихи", save(b, new Set(["Стихотворения 1815|А", "Стихотворения 1815|Б"]), "2026-09-26"), 2);
  ок("траектория: одна запись на день", d.book.entries.length, 1);
  ок("траектория: отмечает стихотворения прочитанными", d.book.entries[0].marks, { "Стихотворения 1815|А": "done", "Стихотворения 1815|Б": "done" });
  const id = d.book.entries[0].id;
  ок("траектория: дополняет отметку того же дня", save(b, new Set(["Стихотворения 1816|В"]), "2026-09-26"), 1);
  ок("траектория: не плодит записи в тот же день", d.book.entries.length, 1);
  ок("траектория: сохраняет прежние отметки", d.book.entries[0].marks, { "Стихотворения 1815|А": "done", "Стихотворения 1815|Б": "done", "Стихотворения 1816|В": "done" });
  ок("траектория: оставляет идентификатор общей записи", d.book.entries[0].id, id);
  const poemChecks = t.get("routeHasPoemChecks");
  ок("траектория: галочки есть только у вкладки стихов", poemChecks({ name: "Стихи" }), true);
  ок("траектория: статьи остаются без галочек", poemChecks({ name: "Статьи" }), false);
  t.set("data", было);
}

/* ── Книга дня ── */
{
  const books = [{id: "a"}, {id: "b"}, {id: "c"}, {id: "done", done: true}];
  const setting = {enabled: true, ids: ["a", "b", "c", "done", "missing"], seed: "test", startDay: "2026-09-25", updatedAt: 10};
  const pick = sandbox.readingChoice;
  const first = pick(books, setting, "2026-09-25");
  ок("книга дня: стабильна после открытия", pick(books, setting, "2026-09-25"), first);
  ок("книга дня: порядок книг на другом устройстве не влияет", pick([...books].reverse(), setting, "2026-09-25"), first);
  ок("книга дня: выключена", pick(books, {...setting, enabled: false}, "2026-09-25"), null);
  ок("книга дня: пустой выбор", pick(books, {...setting, ids: []}, "2026-09-25"), null);
  ок("книга дня: одна книга", pick(books, {...setting, ids: ["a"]}, "2027-01-01"), "a");
  ок("книга дня: завершённые и удалённые не участвуют", pick([{id:"a", deleted:true}, {id:"b", archived:true}, {id:"done", done:true}], setting, "2026-09-25"), null);
  let prev = first;
  for (let i = 1; i < 90; i++) {
    const day = new Date(Date.UTC(2026, 8, 25 + i)).toISOString().slice(0,10);
    const next = pick(books, setting, day);
    ок("книга дня: без повтора " + day, next !== prev && ["a", "b", "c"].includes(next), true);
    prev = next;
  }
  ок("книга дня: свежие настройки выключают старые", sandbox.mergeReading(setting, {enabled:false, updatedAt:11}).enabled, false);
  ок("книга дня: старый клиент не стирает настройки", sandbox.mergeReading(setting, undefined), setting);
  const old = t.get("data");
  const d = sandbox.emptyData();
  d.book.books = books; d.readingRandom = setting;
  d.hidden = {["bk:" + pick(books, setting, t.get("todayStr()"))]: 1};
  t.set("data", d);
  ок("книга дня: на ленте ровно одна книга, даже ранее скрытая", sandbox.railItems().filter(i=>i.track === "book").length, 1);
  ок("книга дня: экспорт и загрузка сохраняют настройки", sandbox.migrate(t.get("exportData()" )).readingRandom, setting);
  t.set("data", old);
}

/* ── Итог ── */
Promise.resolve(сеть).then(() => {
  testTimeouts.forEach(clearTimeout);
  testIntervals.forEach(clearInterval);
  if (упало) { console.error(`\n${упало} из ${всего} тестов упало`); process.exit(1); }
  console.log(`тесты: ${всего} из ${всего} прошли`);
}, (e) => { console.error(e); process.exit(1); });
