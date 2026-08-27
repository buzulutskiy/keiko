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
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
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

/* ── Итог ── */
if (упало) { console.error(`\n${упало} из ${всего} тестов упало`); process.exit(1); }
console.log(`тесты: ${всего} из ${всего} прошли`);
