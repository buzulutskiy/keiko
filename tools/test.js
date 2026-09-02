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
  ок("музей: список книги фильтруется", t.get("musOf")("od").length, 4);
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

  // ход разбора у курсов раздельный, первый остаётся под старым ключом
  t.set("data.pastel.activeCourse", "c");
  t.get("lessonStore")().done["L0:s0"] = "2026-01-01";
  t.set("data.pastel.activeCourse", "argos");
  ок("курсы: свой ход разбора", !!t.get("lessonStore")().done["L0:s0"], false);
  ок("курсы: второй курс под своим ключом",
    Object.keys(t.get("data").practice).sort(), ["pastel", "pastel:argos"]);

  // оба курса стоят в ленте как отдельные материалы
  const лента = t.get("railItems")().filter((i) => i.track === "pastel");
  ок("курсы: два материала в ленте", лента.length, 2);
  ок("курсы: ключи материалов", лента.map(t.get("libKey")), ["ps", "ps:argos"]);

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
  ок("лекция: часы в подписи", [t.get("lcClock")(750), t.get("lcClock")(3750)], ["12:30", "1:02:30"]);

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
  ок("курсы: ключ первого — старый",
    [t.get("keyOfCourse")({ id: "a" }), t.get("keyOfCourse")({ id: "b" })], ["pastel", "b"]);

  // звук у каждого курса свой, а не общий
  ок("курсы: свой ключ звука",
    [t.get("railKey")({ track: "pastel", course: { id: "a" } }),
     t.get("railKey")({ track: "pastel", course: { id: "b" } })], ["pastel", "b"]);

  // в ленте дня запись подписана именем своего курса
  const лента = t.get("allEntriesOn")("2026-08-01").filter((x) => x.track === "pastel");
  ок("курсы: в ленте дня имя своего курса",
    лента.map((x) => x.title).sort(), ["Аргос", "Пастель"]);

  // незнакомый материал заставляет обновить каталог сразу
  t.set("CATALOG", { pastel: { cover: true } });
  ок("каталог: новый курс считается незнакомым", t.get("catalogMissing")(), true);
  t.set("CATALOG", { pastel: { cover: true }, b: { cover: true } });
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
  ок("перенос: таблетки не теряются", (из.pills || []).length, 1);
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

  ок("карта: книга не начата — глава не подставляется", t.get("mapHereChapter")(), 0);

  t.get("data").book.entries.push({ id: "1", date: "2026-08-01", bookId: "kniga", page: 25 });
  ок("карта: подставлена вторая глава", t.get("mapHereChapter")(), 2);

  // в третьей главе точек нет — подставлять нечего, открывается вся карта
  t.get("data").book.entries.push({ id: "2", date: "2026-08-02", bookId: "kniga", page: 45 });
  ок("карта: глава без точек не подставляется", t.get("mapHereChapter")(), 0);

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

/* ── Палитра: слово курса → номера мелков ── */
{
  const было = t.get("data").palette;
  ок("палитра: без набора текст не трогаем",
    t.get("сНомерами")("Возьми бежевый и чёрный"), "Возьми бежевый и чёрный");

  t.set("data.palette", [
    { hex: "E0C9A6", name: "246" }, { hex: "EAB991", name: "239" },
    { hex: "060508", name: "черный" }, { hex: "2A1F1D", name: "229" },
    { hex: "D42A2A", name: "225" }, { hex: "016F50", name: "254" },
    { hex: "974609", name: "242" }, { hex: "E8BDBE", name: "227" },
    { hex: "012466", name: "272" },
  ]);
  ок("палитра: номер идёт следом за словом",
    t.get("сНомерами")("Возьми яркий красный"), "Возьми яркий красный (225)");
  ок("палитра: точное совпадение не тянет за собой второе",
    t.get("сНомерами")("бежевый"), "бежевый (246)");
  ок("палитра: одноимённый мелок не подписываем — он ничего не добавляет",
    t.get("сНомерами")("чёрный"), "чёрный (229)");
  ок("палитра: строка про бумагу остаётся без номеров",
    t.get("сНомерами")("Возьми бумагу: любую, хоть синюю"), "Возьми бумагу: любую, хоть синюю");
  ок("палитра: но «фон голубым» — про мелок, хоть бумага и упомянута",
    t.get("сНомерами")("Фон синим, близким к тону бумаги"), "Фон синим (272) , близким к тону бумаги".replace(" ,", ","));
  ок("палитра: номер уходит в уже открытую скобку",
    t.get("сНомерами")("рыжий (жжёная сиена)").includes("сиена, "), true);
  ок("палитра: чего в наборе нет — то и не подписываем",
    t.get("сНомерами")("возьми зелёный и голубой"), "возьми зелёный (254) и голубой");
  ок("палитра: слово с окончанием тоже ловится",
    t.get("сНомерами")("Красным пройди по краю"), "Красным (225) пройди по краю");

  const близко = t.get("мелкиДля")("E0C9A6");
  ок("подбор: ближайший первым", близко[0], "246");
  ок("подбор: далёкого не предлагаем", t.get("мелкиДля")("7FB6D9").length, 0);

  t.set("data.palette", было);
}

/* ── Кнопка карты на главной: зависит от разбора, который едет отдельно ── */
{
  const было = {
    active: t.get("data").active,
    book: JSON.parse(JSON.stringify(t.get("data").book || {})),
    arts: t.get("ARTS"),
  };
  t.set("data.book", { activeBook: "od", books: [{ id: "od", title: "Одиссея", pages: 400 }], entries: [] });
  t.set("data.active", "book");
  t.set("ARTS", {});

  ок("карта: пока разбор не приехал — кнопки нет", t.get("mapBtnOn")(), false);
  ок("кнопки: до приезда файла обе молчат",
    [t.get("bookBtnState")().talk.on, t.get("bookBtnState")().map.on], [false, false]);

  t.set("ARTS", { od: { article: [{ ch: 1, t: "…" }],
    map: [{ name: "Итака", ch: 1, lat: 38.4, lon: 20.7 }],
    mapBox: { w: 100, e: 120, n: 40, s: 30 } } });
  ок("карта: разбор приехал — кнопка нужна", t.get("mapBtnOn")(), true);
  {
    const к = t.get("bookBtnState")();
    ок("кнопки: у книги с разбором и картой — облачко и карта",
      [к.talk.icon, к.talk.on, к.map.on], ["💬", true, true]);
  }

  // у книги, где кроме карты ничего нет, отдельной кнопки карты не бывает:
  // её место занимает кнопка разбора, превращённая в карту
  t.set("ARTS", { od: { map: [{ name: "Итака", ch: 0, lat: 38.4, lon: 20.7 }],
    mapBox: { w: 100, e: 120, n: 40, s: 30 } } });
  ок("карта: у книги только с картой отдельной кнопки нет", t.get("mapBtnOn")(), false);
  ок("карта: тогда её показывает кнопка разбора", t.get("talkBtnIcon")(), "🗺");
  /* Главное, ради чего кнопки считаются вместе: карта не может оказаться
     сразу на обеих. Раньше «Разбор» успевал превратиться в карту, а отдельная
     кнопка карты оставалась с прошлого расчёта — и карт становилось две. */
  {
    const к = t.get("bookBtnState")();
    ок("кнопки: двух карт разом не бывает", к.talk.icon === "🗺" && к.map.on, false);
  }

  // рамки картинки нет — карту рисовать не на чем
  t.set("ARTS", { od: { map: [{ name: "Итака", ch: 1, lat: 38.4, lon: 20.7 }], article: [{ ch: 1 }] } });
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

/* ── Выключенная часть разбора ── */
{
  const cat = t.get("CATALOG");
  cat.__t = { article: [{ ch: 1, p: "а" }], faq: [{ ch: 1, q: "б", a: "в" }] };
  const кн = { id: "__t", chapters: [{ from: 0, name: "I" }] };
  ок("разбор: обе части на месте",
    [t.get("bookArticle")(кн).length, t.get("bookFaq")(кн).length], [1, 1]);
  ок("разбор: песнь в списке", t.get("articleChapters")(кн).length, 1);
  cat.__t.off = ["article"];
  ок("разбор: выключенная часть не показывается", t.get("bookArticle")(кн).length, 0);
  ок("разбор: соседняя часть не задета", t.get("bookFaq")(кн).length, 1);
  ок("разбор: песнь остаётся в списке ради вопросов", t.get("articleChapters")(кн).length, 1);
  cat.__t.off = ["article", "faq"];
  cat.__t.map = [{ name: "м", lat: 1, lon: 1 }];
  ок("разбор: остались одни места — кнопка ведёт в карту", t.get("onlyMap")(кн), true);
  cat.__t.faq = [];
  cat.__t.off = ["article"];
  ок("разбор: без обоих песнь уходит", t.get("articleChapters")(кн).length, 0);
  delete cat.__t;
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

/* ── Итог ── */
if (упало) { console.error(`\n${упало} из ${всего} тестов упало`); process.exit(1); }
console.log(`тесты: ${всего} из ${всего} прошли`);
