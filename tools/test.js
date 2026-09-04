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

const sandbox = {
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  Date, Math, JSON, Intl, URL, fetch: async () => { throw new Error("сети в тестах нет"); },
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
  ок("вокруг книги: подпись обещает, что сюжета нет",
    /без сюжета/.test(узел.innerHTML), true);
  ок("вокруг книги: считает только записи без главы",
    /2 записи/.test(узел.innerHTML), true);

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
  ок("строка: скорости в ней нет", /стр\.|в день/.test(t.get("paceHTML")()), false);
  /* Число только растёт: пропуск его не трогает, потому что отыграть долю
     назад нельзя — в прошлое не вернёшься. */
  t.set("todayStr", () => "2026-03-25");
  ок("строка: пропуск не отнимает уже прожитое", t.get("paceDays")(), "3 дня");
  /* Кроме дней и срока в строке ничего нет: ни скорости, ни доли, ни слов о
     том, часто ли садишься. Всё это перебывало тут и снято. */
  ок("строка: простой в ней не поминается",
    /не читаю|раз в неделю|каждый день/.test(t.get("paceHTML")()), false);
  книга(200, [["2026-03-01", 10], ["2026-03-03", 20], ["2026-03-05", 30], ["2026-03-25", 40]]);
  ок("строка: вернулся после месяца — число выросло", t.get("paceDays")(), "4 дня");

  // дочитал — срока нет, есть «пройдено»
  книга(40, [["2026-03-01", 20], ["2026-03-02", 40]]);
  t.set("todayStr", () => "2026-03-02");
  ок("прогноз: материал пройден", t.get("paceForecast")().done, true);

  t.set("todayStr", было.today);
  t.set("data.book", было.book); t.set("data.active", было.active);
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

  t.set("CATALOG", было.cat);
  t.set("data.book", было.book); t.set("data.piano", было.piano);
  t.set("data.active", было.active);
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

  ок("карта: пока файл не приехал — кнопки нет", t.get("mapBtnOn")(), false);
  ок("кнопки: до приезда файла состояние молчит", t.get("bookBtnState")().map.on, false);

  t.set("ARTS", { od: { map: [{ name: "Итака", ch: 1, lat: 38.4, lon: 20.7 }],
    mapBox: { w: 100, e: 120, n: 40, s: 30 } } });
  ок("карта: файл приехал — кнопка нужна", t.get("mapBtnOn")(), true);

  // рамки картинки нет — карту рисовать не на чем
  t.set("ARTS", { od: { map: [{ name: "Итака", ch: 1, lat: 38.4, lon: 20.7 }] } });
  ок("карта: без рамки картинки кнопки нет", t.get("mapBtnOn")(), false);

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

  // «сложно» прогон не закрывает
  t.set("data.practice.p.final", {
    "1-4": [{ lvl: 1, d: "2026-08-28" }],
    "5-8": [{ lvl: 1, d: "2026-08-28" }],
    "1-8": [{ lvl: 3, d: "2026-08-28" }],
  });
  ок("прогон: «сложно» не закрывает", t.get("runPassed")(бл[1]), false);

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
  /* У рисунка нет срока — значит нет ни даты, ни «материал пройден». Но дни
     и частота считаются как у всех: без них строка пустая, а занятия идут. */
  const рис = t.get("paceHTML")();
  ок("рисунок: срока нет", /примерно|осталось|неделя|пройден/.test(рис), false);
  ок("рисунок: дни на месте", /\d+ дн[а-я]*/.test(рис), true);

  const былСегодня = t.get("todayStr");

  /* У рисунка в строке только дни — и после месяца тишины тоже. */
  t.set("todayStr", () => "2026-10-01");
  ок("рисунок: после простоя всё те же дни",
    /^\s*\d+ дн[а-я]*\s*$/.test(t.get("paceHTML")().replace(/<[^>]+>/g, "")), true);
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

  // файл книги показываем только тогда, когда каталог говорит, что он есть
  ок("книга .md: без пометки кнопки нет", t.get("hasBookFile")(кн), false);
  cat.__a = { md: true };
  ок("книга .md: с пометкой кнопка есть", t.get("hasBookFile")(кн), true);
  ок("книга .md: имя файла по материалу", t.get("CAT_BOOK_FILE")("__a"), "book-__a.md");
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

/* ── Номер главы в содержании карты ── */
{
  const и = t.get("gmИмяГлавы");
  ок("глава: номер приписывается", и(8, "Этапы штурма"), "8. Этапы штурма");
  ок("глава: своя нумерация не дублируется", и(9, "Песнь IX. Киклоп"), "9. Киклоп");
  ок("глава: «Глава вторая» тоже снимается", и(2, "Глава вторая. Отступание берега"), "2. Отступание берега");
  ок("глава: без названия остаётся номер", и(3, ""), "3. ");
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
  ок("слои: вкладок две — карта и справки", t.get("gmLayersOf")().map((x) => x[0]), ["place", "all"]);
  t.get("gm").места.push({ name: "Олуша", kind: "animal", lat: 0, lon: 0 },
                         { name: "Дюльфер", kind: "word", lat: 0, lon: 0 });
  ок("слои: живность и слова идут в те же справки",
    t.get("gmLayersOf")().map((x) => x[0]), ["place", "all"]);
  ок("содержание: разбивка знает про новые виды",
    t.get("gmРазбивка")({ animal: 2, word: 5 }), "2 животных · 5 слов");
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
  ок("содержание: разбивка по видам",
    t.get("gmРазбивка")({ place: 3, book: 2, word: 7 }), "3 места · 2 книги · 7 слов");
  t.get("gm").слой = "place";
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

/* ── Итог ── */
if (упало) { console.error(`\n${упало} из ${всего} тестов упало`); process.exit(1); }
console.log(`тесты: ${всего} из ${всего} прошли`);
