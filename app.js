"use strict";

/* Главный экран — обложка, прогресс и одна кнопка;
   детали разнесены по вкладкам «Прогресс», «Награды» и «Обзор». */

/* Приложение приходит пустым: и материалы, и профили лежат в гисте.
   Пока гист не подключён, показываем только экран подключения. */
let PROFILES = [];
const LS_PROFILE = "keiko-profile-id";
let profileId = null;

const profile = () => PROFILES.find(p => p.id === profileId) || PROFILES[0] || { id: profileId || "", name: profileId || "", hint: "" };
const suffix = () => profileId ? "-" + profileId : "";

const LS = {
  get data() { return "keiko-data-v1" + suffix(); },
  get cfg() { return "keiko-cfg-v1"; },            // токен и гист общие для всех профилей
  get older() { return []; }
};
const GIST_FILE = "prokachka.json";                // тот же файл, что и в первой версии
const APP_VERSION = "Кэйко 78";

const DEFAULT_PIECES = [];
// Курс пастели — данные из pastel-course-viewer
const DEFAULT_COURSE = { id: "course", name: "", author: "", lessons: [] };

const DEFAULT_BOOKS = [];

// материалы профиля Дианы
const DIANA_BOOKS = [];

const FIRM_AT = 3;
const DONE_TITLES = ["Молодец!", "Красавчик!", "Есть!", "Сделано!"];
const DOW = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const DOW_FULL = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];

/* ── Состояние ── */
let data = null;
let cfg = { token: "", gistId: "", lastSync: 0, tab: "home", period: "week", achView: null, shake: false, shakeAsked: false, sound: false, bgPreset: "breath", bgWave: true, zen: true };
let period = "week";   // week | month — что показываем на «Прогрессе»
let achView = null;    // {track, pieceId} — открытый материал на вкладке наград
let online = navigator.onLine !== false;   // офлайн — не ошибка, а режим работы
let editingThought = null; // момент, который сейчас правим
let pendingMedia = null;   // вложение, которое уедет вместе с моментом
let settingsOpen = false, settingsView = null;   // настройки — отдельный экран
let notesFocus = false;    // ставить ли курсор в поле мысли при следующем рендере
let notesFilter = "all";   // all | liked — что показываем в ленте мыслей
let shuffleThought = null; // id мысли, вытянутой наугад: лента сворачивается до неё одной
let achTop = "mats";        // верхний уровень «Достижений»: материалы или полка
let achTab = "ach";          // вкладка внутри материала: достижения / знания
let tab = "home";                 // home | progress | ach | overview
let calYear, calMonth;
let selectedDate = todayStr();
let pickHand = "right", pickFrom = 1, pickTo = 1, pending = [];
let pickPage = 0;
let pickLessons = [];
let pickSpans = [];    // отмеченные в этой сессии куски книги
let partOpen = null;   // какая часть сейчас раскрыта
let libBook = null;    // открытый материал в «Библиотеке»: "bk:id" | "pf:id" | "ps:pastel"
let partUpto = {};     // выбранная страница внутри части             // выбранные уроки курса
let sheetMode = null;             // log | settings
let pushTimer = null, syncing = false;
let syncError = "";               // текст последней ошибки синхронизации
let newVersion = "";              // версия на сервере, если она свежее установленной

// без подключённого гиста данные жили бы только на телефоне — ввод запрещаем
const gistReady = () => !!(cfg.token && cfg.gistId);

const $ = (s) => document.querySelector(s);

/* ── Утилиты ── */
const uid = () => crypto.randomUUID();
const now = () => Date.now();
function todayStr() { return dateStr(new Date()); }

function copyText(text) {
  const t = String(text || "");
  if (!t) return;
  /* Сначала старый способ через выделение: он синхронный и потому переживает
     жест надёжнее, чем обещание clipboard API. */
  try {
    const ta = document.createElement("textarea");
    ta.value = t;
    ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if (ok) { toast("Название скопировано"); return; }
  } catch {}
  if (navigator.clipboard) {
    navigator.clipboard.writeText(t)
      .then(() => toast("Название скопировано"))
      .catch(() => toast("Не вышло скопировать"));
  } else toast("Не вышло скопировать");
}
function dateStr(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function fromStr(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function daysBetween(a, b) { return Math.round((fromStr(b) - fromStr(a)) / 864e5); }

function fmtDay(s) {
  if (s === todayStr()) return "сегодня";
  if (s === dateStr(new Date(Date.now() - 864e5))) return "вчера";
  return new Intl.DateTimeFormat("ru", { day: "numeric", month: "long" }).format(fromStr(s));
}
function esc(v) {
  return String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function plural(n, one, few, many) {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}
const takty = n => `${n} ${plural(n, "такт", "такта", "тактов")}`;
const stranic = n => `${n} ${plural(n, "страница", "страницы", "страниц")}`;
const handIcon = h => h === "left" ? "𝄢" : "𝄞";
const spanText = s => `${handIcon(s.hand)} ${s.from === s.to ? s.from + "-й" : s.from + "–" + s.to}`;
const rnd = l => l[Math.floor(Math.random() * l.length)];

function toast(text) {
  const el = $("#toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove("show"), 2300);
}

/* ── Хранилище ── */
// пустая заготовка: материалы приезжают из гиста, в приложении их нет
/* Виды событий, которых в ленте больше не бывает. */
const EV_GONE = new Set(["ach", "fact"]);

function emptyData() {
  return {
    active: "book",
    piano: { pieces: [], activePiece: "", entries: [] },
    book: { books: [], activeBook: "", entries: [] },
    pastel: { course: null, entries: [] },
    watch:  { videos: [], activeVideo: "", entries: [] },
    practice: {},   // ход разбора по пьесам: { pieceId: { done, session } }
    shop: { theme: "dusk" },   // только оформление: покупать давно нечего
    thoughts: [],  // мысли по ходу материала — отдельно от отметок занятий
    wishes: [],    // «захотелось»: куда съездить, что прочитать, купить, сделать
    weekGoal: 4,   // общая цель: сколько дней в неделю заниматься чем угодно
    freezes: [],   // периоды паузы: отпуск, болезнь — серия их не замечает
    archive: [],   // пройденные материалы
    takes: [],     // записи собственной игры: как звучало в тот день
    takesId: "",   // гист с файлами вложений — общий для всех устройств
    daily: { date: "", seen: [], off: false }   // мысль дня: когда показывали и что уже видели
  };
}

/* Приводим то, что приехало из гиста, к ожидаемой форме.
   Старых схем здесь нет: это новое приложение, данные всегда свежего вида. */
function migrate(obj) {
  const base = emptyData();
  if (!obj || typeof obj !== "object") return base;

  if (obj.piano) {
    base.piano.pieces = Array.isArray(obj.piano.pieces) ? obj.piano.pieces : [];
    base.piano.entries = Array.isArray(obj.piano.entries) ? obj.piano.entries : [];
    if (obj.piano.activePiece && base.piano.pieces.some(p => p.id === obj.piano.activePiece)) {
      base.piano.activePiece = obj.piano.activePiece;
    } else if (base.piano.pieces[0]) {
      base.piano.activePiece = base.piano.pieces[0].id;
    }
  }

  if (obj.book) {
    base.book.books = Array.isArray(obj.book.books) ? obj.book.books : [];
    base.book.entries = Array.isArray(obj.book.entries) ? obj.book.entries : [];
    if (obj.book.activeBook && base.book.books.some(b => b.id === obj.book.activeBook)) {
      base.book.activeBook = obj.book.activeBook;
    } else if (base.book.books[0]) {
      base.book.activeBook = base.book.books[0].id;
    }
  }

  if (obj.pastel) {
    base.pastel.entries = Array.isArray(obj.pastel.entries) ? obj.pastel.entries : [];
    if (obj.pastel.course) base.pastel.course = obj.pastel.course;
  }

  if (obj.practice && typeof obj.practice === "object") base.practice = obj.practice;
  if (obj.achAt && typeof obj.achAt === "object") base.achAt = obj.achAt;
  if (obj.factAt && typeof obj.factAt === "object") base.factAt = obj.factAt;
  if (obj.eventsV) base.eventsV = obj.eventsV;

  if (obj.watch) {
    base.watch.videos = Array.isArray(obj.watch.videos) ? obj.watch.videos : [];
    base.watch.entries = Array.isArray(obj.watch.entries) ? obj.watch.entries : [];
    /* Первая версия «Смотрю» держала ролики одним списком-курсом, а отметки —
       номерами позиций. Переселяем: каждый ролик становится своим материалом. */
    if (!base.watch.videos.length && obj.watch.course && Array.isArray(obj.watch.course.lessons)) {
      const seen = new Set();
      for (const e of base.watch.entries) for (const i of e.lessons || []) seen.add(i);
      base.watch.videos = obj.watch.course.lessons.map((l, i) => ({
        id: "v_" + (l.videoId || i), videoId: l.videoId || "", title: l.title || "Ролик",
        author: l.author || "", url: l.url || "", thumb: l.thumb || "",
        addedAt: l.addedAt || 0, archived: !!l.hidden,
        done: seen.has(i), doneAt: seen.has(i) ? (l.addedAt || 0) : 0
      }));
      base.watch.entries = base.watch.entries.map(e => {
        const i = (e.lessons || [])[0];
        const v = base.watch.videos[i];
        return { ...e, lessons: undefined, videoId: v ? v.id : "" };
      }).filter(e => e.videoId);
    }
    if (obj.watch.activeVideo && base.watch.videos.some(v => v.id === obj.watch.activeVideo)) {
      base.watch.activeVideo = obj.watch.activeVideo;
    } else if (base.watch.videos[0]) {
      base.watch.activeVideo = base.watch.videos[0].id;
    }
  }

  if (obj.shop) {
    if (typeof obj.shop.theme === "string") base.shop.theme = obj.shop.theme;
  }
  if (Number(obj.weekGoal) > 0) base.weekGoal = Math.min(7, Math.round(obj.weekGoal));
  /* Одиночные записи о наградах и карточках убраны навсегда: награда живёт
     внутри сессии, в которую открылась. Отсеиваем их прямо на входе — и то,
     что лежит в телефоне, и то, что приезжает из гиста. Иначе достаточно
     одной синхронизации со старым устройством, чтобы они вернулись. */
  if (Array.isArray(obj.thoughts)) base.thoughts = obj.thoughts.filter((t) => !EV_GONE.has(t && t.event));
  if (Array.isArray(obj.wishes)) base.wishes = obj.wishes;
  if (Array.isArray(obj.freezes)) base.freezes = obj.freezes;
  if (Array.isArray(obj.archive)) base.archive = obj.archive;
  if (Array.isArray(obj.takes)) base.takes = obj.takes;
  if (typeof obj.takesId === "string") base.takesId = obj.takesId;
  if (obj.daily && typeof obj.daily === "object") base.daily = obj.daily;

  // записи без привязки достаются первому материалу — иначе они потеряются
  const firstBook = base.book.books[0] ? base.book.books[0].id : "";
  base.book.entries = base.book.entries.map(e => ({ ...e, bookId: e.bookId || firstBook }));
  const firstPiece = base.piano.pieces[0] ? base.piano.pieces[0].id : "";
  base.piano.entries = base.piano.entries.map(e => ({ ...e, pieceId: e.pieceId || firstPiece }));
  const courseId = (base.pastel.course && base.pastel.course.id) || "";
  base.pastel.entries = base.pastel.entries.map(e => ({ ...e, courseId: e.courseId || courseId }));

  if (["book", "piano", "pastel"].includes(obj.active)) base.active = obj.active;
  return base;
}

function load() {
  let raw = null;
  for (const key of [LS.data, ...LS.older]) {
    try {
      const val = JSON.parse(localStorage.getItem(key) || "null");
      if (val) { raw = val; break; }
    } catch {}
  }
  data = migrate(raw);
  try { eventsReset(); } catch {}      // разовая чистка выдуманных событий
  try { cfg = Object.assign(cfg, JSON.parse(localStorage.getItem(LS.cfg)) || {}); } catch {}
}
const saveData = () => localStorage.setItem(LS.data, JSON.stringify(data));
const saveCfg = () => localStorage.setItem(LS.cfg, JSON.stringify(cfg));

/* ── Выборки ── */
const isBook = () => data.active === "book";
const isPastel = () => data.active === "pastel";
const isWatch  = () => data.active === "watch";
const isCourse = () => isPastel();
const courseTrack = () => data.pastel;

// каждое видео — самостоятельный материал: со своим прогрессом, мыслями и завершением
const EMPTY_VIDEO = { id: "", videoId: "", title: "", author: "", url: "", thumb: "", done: false };
const videos = () => (data.watch && data.watch.videos) || [];
const video = () => videos().find(v => v.id === data.watch.activeVideo) || videos()[0] || EMPTY_VIDEO;
const watchEntriesOf = (id) => watchEntries().filter(e => (e.videoId || "") === id);
const isPiano = () => data.active === "piano";
const trackOf = () => data[data.active];
const EMPTY_PIECE = { id: "", name: "", author: "", bars: 0, tone: "violet" };
const piece = () => data.piano.pieces.find(p => p.id === data.piano.activePiece) || data.piano.pieces[0] || EMPTY_PIECE;
const course = () => courseTrack().course || { id: "", name: "", author: "", lessons: [] };
const EMPTY_BOOK = { id: "", title: "", author: "", pages: 0, chapters: [], tone: "sea" };
const book = () => data.book.books.find(b => b.id === data.book.activeBook) || data.book.books[0] || EMPTY_BOOK;
const pieceEntriesOf = (id) => data.piano.entries.filter(e => !e.deleted && (e.pieceId || "bwv853") === id);
const bookEntriesOf = (id) => data.book.entries.filter(e => !e.deleted && (e.bookId || "snow-1") === id);

// сколько страниц прочитано за период — считаем прирост отдельно по каждой книге
function pagesRead(from, to) {
  let sum = 0;
  for (const b of data.book.books) {
    const list = bookEntriesOf(b.id);
    let before = b.startPage || 0, after = 0;
    for (const e of list) {
      if (e.date < from) before = Math.max(before, e.page || 0);
      else if (e.date <= to) after = Math.max(after, e.page || 0);
    }
    if (after) sum += Math.max(0, after - before);
  }
  return sum;
}
// записи текущего трека, а для пианино — ещё и текущей композиции
const entries = () => isPiano()
  ? data.piano.entries.filter(e => !e.deleted && (e.pieceId || "bwv853") === piece().id)
  : isBook()
    ? bookEntriesOf(book().id)
    : isWatch()
      ? watchEntriesOf(video().id)
      : courseTrack().entries.filter(e => !e.deleted && (e.courseId || course().id) === course().id);
const entryFor = d => entries().find(e => e.date === d);

// день попадает в паузу (отпуск) — такие дни серию не рвут
function isFrozen(ds) {
  return (data.freezes || []).some(f => !f.deleted && ds >= f.from && ds <= f.to);
}

function activeFreeze() {
  const t = todayStr();
  return (data.freezes || []).find(f => !f.deleted && t >= f.from && t <= f.to) || null;
}

// дни, когда было занятие любым материалом — серия общая для всех хобби
function activeDays() {
  const out = new Set();
  for (const e of [...data.piano.entries, ...data.book.entries, ...data.pastel.entries, ...watchEntries()])
    if (!e.deleted) out.add(e.date);
  return out;
}

// серия по конкретному материалу: занимался именно им день за днём
function streak() {
  const days = new Set(entries().map(e => e.date));
  return streakFrom(days);
}

// общая серия: важно заниматься каждый день, а чем — не важно
function streakAll() {
  return streakFrom(activeDays());
}

function streakFrom(days) {
  let n = 0, skipped = 0, steps = 0;
  const d = new Date();
  if (!days.has(dateStr(d)) && !isFrozen(dateStr(d))) d.setDate(d.getDate() - 1);
  while (steps++ < 4000) {
    const ds = dateStr(d);
    if (days.has(ds)) n++;
    else if (isFrozen(ds)) skipped++;      // пауза: пропускаем день молча
    else break;
    if (n + skipped > 3650) break;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
function mondayOf(d) { const r = new Date(d); r.setDate(r.getDate() - ((r.getDay() + 6) % 7)); return r; }

function passes() {
  const bars = piece().bars;
  const right = new Array(bars + 1).fill(0), left = new Array(bars + 1).fill(0);
  for (const e of entries())
    for (const s of e.spans || []) {
      const arr = s.hand === "left" ? left : right;
      for (let b = Math.max(1, s.from); b <= Math.min(bars, s.to); b++) arr[b]++;
    }
  return { right, left };
}

function pianoStats() {
  const bars = piece().bars;
  const p = passes();
  const list = entries().slice().sort((a, b) => a.date < b.date ? -1 : 1);
  const cnt = (arr, min) => arr.slice(1).filter(v => v >= min).length;
  const touchedR = cnt(p.right, 1), touchedL = cnt(p.left, 1);
  const firmR = cnt(p.right, FIRM_AT), firmL = cnt(p.left, FIRM_AT);
  const maxPass = Math.max(0, ...p.right.slice(1), ...p.left.slice(1));

  let bothInOne = false, maxRun = 0, weekend = false, comeback = false, prev = null;
  for (const e of list) {
    if (new Set((e.spans || []).map(s => s.hand)).size >= 2) bothInOne = true;
    for (const s of e.spans || []) maxRun = Math.max(maxRun, s.to - s.from + 1);
    const dw = fromStr(e.date).getDay();
    if (dw === 0 || dw === 6) weekend = true;
    if (prev && daysBetween(prev, e.date) >= 7) comeback = true;
    prev = e.date;
  }
  return {
    bars, passes: p, days: list.length, streak: streak(), streakAll: streakAll(),
    touchedR, touchedL, firmR, firmL, maxPass,
    pctR: bars ? touchedR / bars * 100 : 0,
    pctL: bars ? touchedL / bars * 100 : 0,
    pct: bars ? (touchedR + touchedL) / (bars * 2) * 100 : 0,
    // Пройденный один раз такт ещё не выучен: чтобы он закрепился, нужно FIRM_AT
    // проходов. Этот процент и показываем — он честнее отвечает «сколько осталось».
    // pct выше не трогаем: на нём висят условия наград.
    pctLearn: bars ? (() => {
      let n = 0;
      for (let b = 1; b <= bars; b++)
        n += Math.min(p.right[b], FIRM_AT) + Math.min(p.left[b], FIRM_AT);
      return n / (bars * 2 * FIRM_AT) * 100;
    })() : 0,
    pctFirm: bars ? (firmR + firmL) / (bars * 2) * 100 : 0,
    bothInOne, maxRun, weekend, comeback
  };
}

/* ── Прочитанное как множество страниц, а не курсор ──
   Сборник читают вразнобой: прочёл 30–50, потом 10–20. При курсоре второй
   заход выглядел откатом, будто прогресса нет. Считаем покрытие: оно растёт
   при любом порядке чтения и никогда не падает.
   Старые записи хранят только «докуда дочитал» — понимаем их как отрезок
   от начала книги до этой страницы, поэтому ничего не теряется. */
function bookSpans(b) {
  const bk = b || book();
  const out = [];
  for (const e of bookEntriesOf(bk.id)) {
    if (Array.isArray(e.spans) && e.spans.length) {
      for (const sp of e.spans) {
        const from = Math.max(1, Math.min(sp.from, sp.to));
        const to = Math.min(bk.pages || sp.to, Math.max(sp.from, sp.to));
        if (to >= from) out.push({ from, to });
      }
    } else if (e.page) {
      out.push({ from: Math.max(1, (bk.startPage || 0) + 1), to: Math.min(bk.pages || e.page, e.page) });
    }
  }
  return out;
}

// сливаем пересекающиеся отрезки — из них считается и процент, и вид оглавления
function mergeSpans(list) {
  const a = list.slice().sort((x, y) => x.from - y.from);
  const out = [];
  for (const sp of a) {
    const last = out[out.length - 1];
    if (last && sp.from <= last.to + 1) last.to = Math.max(last.to, sp.to);
    else out.push({ from: sp.from, to: sp.to });
  }
  return out;
}

const bookCovered = (b) => mergeSpans(bookSpans(b)).reduce((n, sp) => n + (sp.to - sp.from + 1), 0);

// «докуда дошёл» — для линейных книг и для подписи «осталось столько-то»
function bookProgress() {
  const b = book();
  let page = b.startPage || 0;
  for (const e of bookEntriesOf(b.id)) {
    page = Math.max(page, e.page || 0);
    for (const sp of e.spans || []) page = Math.max(page, sp.to || 0);
  }
  return Math.min(page, b.pages);
}
function chapterAt(page) {
  const list = book().chapters || [];
  let cur = list[0] || { name: "", from: 0 };
  for (const c of list) if (page >= c.from) cur = c;
  return cur;
}
function bookStats() {
  const b = book();
  const list = bookEntriesOf(b.id).slice().sort((a, x) => a.date < x.date ? -1 : 1);
  const page = bookProgress();
  let maxJump = 0, weekend = false, comeback = false, notes = 0, reread = false;
  let running = b.startPage || 0, prev = null;
  for (const e of list) {
    const jump = (e.page || 0) - running;
    if (jump > maxJump) maxJump = jump;
    if ((e.page || 0) < running) reread = true;
    running = Math.max(running, e.page || 0);
    if (e.note) notes++;
    const dw = fromStr(e.date).getDay();
    if (dw === 0 || dw === 6) weekend = true;
    if (prev && daysBetween(prev, e.date) >= 7) comeback = true;
    prev = e.date;
  }
  const covered = Math.min(b.pages || 0, bookCovered(b));
  /* Линейная книга считается как раньше — по курсору. Так и должно быть:
     у книги может стоять старт с середины (у «Снега на траве» со 183-й),
     и всё до него уже прочитано, просто не отмечено записями. Покрытие
     этого не знает и занижало процент втрое.
     Вразнобой — там курсора нет, и процент честно считается по покрытию. */
  const parts = bookMode(b) === "parts";
  return {
    pages: b.pages, page, covered,
    pct: b.pages ? (parts ? covered / b.pages : page / b.pages) * 100 : 0,
    days: list.length, streak: streak(), streakAll: streakAll(),
    maxJump, weekend, comeback, notes, reread, chapter: chapterAt(page)
  };
}

/* ── Пастель ── */
/* Ссылка на YouTube в любом из привычных видов: watch, youtu.be, shorts, embed, live. */
const ytId = (url) => {
  const m = String(url || "").match(
    /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{6,})/);
  return m ? m[1] : "";
};
const watchThumbKey = (vid) => "yt:" + vid;
// пока обложка не легла в кэш — показываем прямо с ютуба, чтобы не ждать
const watchThumb = (l) => coverCache.get(watchThumbKey(l.videoId)) || l.thumb || "";

let watchBusy = false;

async function watchAdd(url) {
  const vid = ytId(url);
  if (!vid) { toast("Это не похоже на ссылку с YouTube"); return false; }
  const was = videos().find(v => v.videoId === vid);
  if (was && !was.archived) { toast(was.done ? "Это видео уже посмотрено" : "Это видео уже добавлено"); return false; }

  watchBusy = true; render();
  try {
    const r = await withTimeout(fetch("https://www.youtube.com/oembed?format=json&url=" +
      encodeURIComponent("https://www.youtube.com/watch?v=" + vid)), 15000);
    if (!r.ok) { toast(r.status === 404 ? "Ролик не найден или закрыт" : "YouTube не ответил"); return false; }
    const j = await r.json();

    let v = was;
    if (v) { v.archived = false; v.updatedAt = now(); }   // вернули убранное — записи и мысли на месте
    else {
      v = { id: uid(), videoId: vid, title: j.title || "Ролик", author: j.author_name || "",
            url: "https://www.youtube.com/watch?v=" + vid, thumb: j.thumbnail_url || "",
            addedAt: now(), updatedAt: now(), done: false, doneAt: 0 };
      data.watch.videos.push(v);
    }
    data.watch.activeVideo = v.id;
    data.active = "watch";
    saveData(); schedulePush();
    pullWatchThumb(vid);                                  // обложку кладём в кэш, чтобы работала офлайн
    toast("Добавлено: " + (j.title || "ролик"));
    return true;
  } catch (e) {
    toast("Не получилось достать данные ролика");
    return false;
  } finally { watchBusy = false; render(); }
}

// картинку берём в лучшем доступном размере: maxres есть не у всех роликов
async function pullWatchThumb(vid) {
  for (const name of ["maxresdefault", "hqdefault"]) {
    try {
      const r = await withTimeout(fetch(`https://i.ytimg.com/vi/${vid}/${name}.jpg`), 15000);
      if (!r.ok) continue;
      const b = await r.blob();
      if (b.size < 2000) continue;                        // заглушка «нет картинки» весит копейки
      await coverSaveBlob(watchThumbKey(vid), b);
      coversArrived();
      return;
    } catch {}
  }
}

const watchEntries = () => (data.watch && data.watch.entries) || [];

function doneLessons() {
  const set = new Set();
  for (const e of courseTrack().entries.filter(e => !e.deleted))
    for (const i of e.lessons || []) set.add(i);
  return set;
}

function pastelStats() {
  const c = course();
  const done = doneLessons();
  const list = courseTrack().entries.filter(e => !e.deleted).slice().sort((a, b) => a.date < b.date ? -1 : 1);
  const totalSec = c.lessons.reduce((a, l) => a + (l.hidden ? 0 : l.dur), 0);
  const doneSec = c.lessons.reduce((a, l, i) => a + (!l.hidden && done.has(i) ? l.dur : 0), 0);

  let weekend = false, comeback = false, notes = 0, maxAtOnce = 0, prev = null;
  for (const e of list) {
    maxAtOnce = Math.max(maxAtOnce, (e.lessons || []).length);
    if (e.note) notes++;
    const dw = fromStr(e.date).getDay();
    if (dw === 0 || dw === 6) weekend = true;
    if (prev && daysBetween(prev, e.date) >= 7) comeback = true;
    prev = e.date;
  }

  const next = c.lessons.findIndex((l, i) => !l.hidden && !done.has(i));
  const shown = c.lessons.reduce((n, l) => n + (l.hidden ? 0 : 1), 0);
  const doneShown = c.lessons.reduce((n, l, i) => n + (!l.hidden && done.has(i) ? 1 : 0), 0);
  return {
    lessons: shown, done: doneShown, doneSet: done,
    pct: shown ? doneShown / shown * 100 : 0,
    totalSec, doneSec, minutes: Math.round(doneSec / 60),
    days: list.length, streak: streak(), streakAll: streakAll(),
    weekend, comeback, notes, maxAtOnce,
    nextLesson: next < 0 ? null : next
  };
}

function watchStats() {
  const v = video();
  const list = entries().slice().sort((a, b) => a.date < b.date ? -1 : 1);
  return {
    done: v.done ? 1 : 0, lessons: 1, watched: v.done,
    pct: v.done ? 100 : 0,
    days: list.length, streak: streak(), streakAll: streakAll(),
    first: list[0] ? list[0].date : "", last: list.length ? list[list.length - 1].date : "",
    notes: list.filter(e => e.note).length
  };
}

const curStats = () => isBook() ? bookStats() : isWatch() ? watchStats() : isCourse() ? pastelStats() : pianoStats();
// на экране — процент выученности; для пианино он строже, чем «такт задет»
const shownPct = (s) => isPiano() && typeof s.pctLearn === "number" ? s.pctLearn : s.pct;

/* ── Достижения ── */
const ACH_PIANO = [];

const ACH_BOOK = [];

const WORDS_PIANO = {};

const WORDS_BOOK = {};

const ACH_PASTEL = [];

const WORDS_PASTEL = {};

/* Контекстные названия и тексты для конкретных пьес:
   у Баха — барочные, у «Мальчиков и море» — морские. */
const PIECE_FLAVOR = {};

const ACH_ODYSSEY = [];

const WORDS_ODYSSEY = {};

const ACH_TESSON = [];

const WORDS_TESSON = {};

const ACH_SCREWTAPE = [];


const WORDS_SCREWTAPE = {};


const ACH_UNIZH = [];

const WORDS_UNIZH = {};

const BOOK_ACH = { "snow-1": ACH_BOOK, odyssey: ACH_ODYSSEY, tesson: ACH_TESSON, screwtape: ACH_SCREWTAPE, unizhennye: ACH_UNIZH };
const BOOK_WORDS = { "snow-1": WORDS_BOOK, odyssey: WORDS_ODYSSEY, tesson: WORDS_TESSON, screwtape: WORDS_SCREWTAPE, unizhennye: WORDS_UNIZH };

/* ══════════ Каталог материалов ══════════
   Награды, карточки знаний и обложки могут лежать не в коде, а в гисте.
   Что есть в каталоге — берётся оттуда, остальное из зашитого. */

const LS_CAT = "keiko-catalog-v2";
const LS_COVER = (id) => "keiko-cover-" + id;
let CATALOG = {};
try {
  const saved = JSON.parse(localStorage.getItem(LS_CAT) || "{}") || {};
  CATALOG = saved.materials || {};
  if (Array.isArray(saved.profiles)) PROFILES = saved.profiles;
} catch {}

// Карта знаний: скелет (taxonomy) и привязка id материала → код листа (categories) —
// живут в том же каталожном гисте отдельными файлами, читаются вместе с каталогом.
const LS_TAX = "keiko-taxonomy-v1";
const TAX_FILE = "keiko-taxonomy.json";
const PRAC_FILE = "keiko-practice.json";
const LS_PRAC = "keiko-practice-data-v1";
const CATS_FILE = "keiko-categories.json";
let TAXONOMY = null, CATEGORIES = {};
/* Разбор пьес для «Практики» — данные, а не код: лежит в приватном гисте
   рядом с наградами и карточками. В репозитории его нет намеренно —
   это по-нотный разбор чужих произведений, и публиковать его незачем. */
let PRACTICE_DATA = {};
try { PRACTICE_DATA = JSON.parse(localStorage.getItem(LS_PRAC)) || {}; } catch {}
try {
  const t = JSON.parse(localStorage.getItem(LS_TAX) || "{}") || {};
  if (t.taxonomy) TAXONOMY = t.taxonomy;
  if (t.categories) CATEGORIES = t.categories;
} catch {}

const OPS = {
  ">=": (a, b) => a >= b, ">": (a, b) => a > b,
  "<=": (a, b) => a <= b, "<": (a, b) => a < b, "==": (a, b) => a === b
};
// условие награды в каталоге — данные, а не код: [["page", ">=", 45], ["days", ">=", 20]]
const testFromWhen = (when) => (s) => (when || []).every(([m, op, v]) => {
  if (op === "is") return !!s[m] === (v !== false);
  if (op === "has") return !!(s[m] && s[m].has && s[m].has(v));
  return OPS[op] ? OPS[op](Number(s[m]) || 0, Number(v)) : false;
});

const curKey = () => isBook() ? book().id : isWatch() ? video().id : isCourse() ? "pastel" : (piece() ? piece().id : "");
const catOf = (id) => CATALOG[id] || null;

const achCache = new Map();
function achFromCatalog(id) {
  const c = catOf(id);
  if (!c || !Array.isArray(c.ach)) return null;
  if (!achCache.has(id)) achCache.set(id, c.ach.map(a => ({ ...a, test: testFromWhen(a.when) })));
  return achCache.get(id);
}

const achList = () => achFromCatalog(curKey()) ||
  (isBook() ? (BOOK_ACH[book().id] || ACH_BOOK) : isCourse() ? ACH_PASTEL : ACH_PIANO);
const achWords = () => (catOf(curKey()) || {}).words ||
  (isBook() ? (BOOK_WORDS[book().id] || WORDS_BOOK) : isCourse() ? WORDS_PASTEL : WORDS_PIANO);
const flavor = () => (!isBook() && !isCourse() && PIECE_FLAVOR[piece().id]) || {};
const lastName = (author) => String(author || "").trim().split(/\s+/).pop();

function achState() {
  if (!hasMaterials()) return [];
  const s = curStats();
  const fl = flavor();
  return achList().map(a => {
    const item = { ...a, done: !!a.test(s) };
    if (fl[a.id]) { item.name = fl[a.id][0]; item.word = fl[a.id][1]; }
    // финальная награда носит имя автора текущей композиции
    if (isPiano() && a.id === "bach") item.name = `${lastName(piece().author)} доволен`;
    return item;
  });
}

// текст награды с учётом контекста материала
const wordOf = (a) => a.word || achWords()[a.id] || a.hint;

/* ── Действия ── */
function normSpan(hand, from, to) {
  const bars = piece().bars;
  let f = Math.max(1, Math.min(bars, from)), t = Math.max(1, Math.min(bars, to));
  if (t < f) [f, t] = [t, f];
  return { hand, from: f, to: t };
}
function currentSpans() {
  if (pending.length) return pending.slice();
  return pickHand === "both"
    ? [normSpan("right", pickFrom, pickTo), normSpan("left", pickFrom, pickTo)]
    : [normSpan(pickHand, pickFrom, pickTo)];
}

/* ══════════ Карточки знаний ══════════
   Смысловые заметки о материале. Открываются по мере занятий:
   на 1, 3, 6, 10 и 15-й день с этой пьесой, книгой или курсом. */

const FACTS = {};

// карточки текущего материала: сколько открыто по числу дней занятий
/* Карточка открывается за занятие: одно занятие — одна карточка.
   У курса занятий мало (уроки), поэтому там за раз открывается несколько.
   Когда материал пройден до конца — открывается всё, что осталось. */
function factsState() {
  const key = isBook() ? book().id : isWatch() ? video().id : isCourse() ? "pastel" : piece().id;
  const list = (catOf(key) || {}).facts || FACTS[key] || [];
  if (!list.length) return [];
  // у курса шагом служат пройденные уроки: их мало, поэтому за раз открывается несколько карточек
  const step = isCourse() ? doneLessons().size : new Set(entries().map(e => e.date)).size;
  const span = isCourse() ? Math.max(1, course().lessons.length) : list.length;
  const finished = curStats().pct >= 100;
  const page = isBook() ? bookProgress() : 0;

  const out = list.map((f, i) => {
    // карточка с привязкой к странице открывается, когда до неё дочитал
    if (f.page) return { ...f, id: key + ":" + i, need: f.page, unit: "page", open: page >= f.page };
    const need = Math.max(1, Math.ceil((i + 1) * span / list.length));
    return { ...f, id: key + ":" + i, need, unit: isCourse() ? "lesson" : "day", open: finished || step >= need };
  });

  return out;
}

function fmtRange(from, to) {
  const f = new Intl.DateTimeFormat("ru", { day: "numeric", month: "short" });
  return from === to ? f.format(fromStr(from)) : `${f.format(fromStr(from))} — ${f.format(fromStr(to))}`;
}

function goalProgress() {
  const from = dateStr(mondayOf(new Date()));
  const days = new Set(
    [...data.piano.entries, ...data.book.entries, ...data.pastel.entries, ...watchEntries()]
      .filter(e => !e.deleted && e.date >= from).map(e => e.date)
  ).size;
  const goal = data.weekGoal || 4;
  return { days, goal, left: Math.max(0, goal - days), done: days >= goal, pct: Math.min(100, days / goal * 100) };
}

function weeklyHistory(weeks = 12) {
  const days = new Set(entries().map(e => e.date));
  const out = [];
  const monday = mondayOf(new Date());
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(monday); start.setDate(start.getDate() - i * 7);
    let n = 0;
    for (let d = 0; d < 7; d++) {
      const cur = new Date(start); cur.setDate(cur.getDate() + d);
      if (cur > new Date()) break;
      if (days.has(dateStr(cur))) n++;
    }
    out.push({ start: dateStr(start), days: n });
  }
  return out;
}

function weekSummary(offset = 0) {
  const monday = mondayOf(new Date());
  monday.setDate(monday.getDate() - offset * 7);
  const from = dateStr(monday);
  const end = new Date(monday); end.setDate(end.getDate() + 6);
  const to = dateStr(end);
  const inWeek = (e) => !e.deleted && e.date >= from && e.date <= to;

  const pianoEntries = data.piano.entries.filter(inWeek);
  /* Считаем РАЗНЫЕ такты, а не сумму проходов. Сыграл 1–8, назавтра 1–4 —
     это по-прежнему восемь тактов, а не двенадцать: дальше ты не ушёл. */
  const barSet = new Set();
  for (const e of pianoEntries)
    for (const sp of e.spans || [])
      for (let i = Math.max(1, sp.from); i <= sp.to; i++) barSet.add(i);
  const bars = barSet.size;

  const bookEntries = data.book.entries.filter(inWeek);
  const pages = pagesRead(from, to);

  const pastelEntries = data.pastel.entries.filter(inWeek);
  let lessons = 0;
  for (const e of pastelEntries) lessons += (e.lessons || []).length;

  const watchList = watchEntries().filter(inWeek);
  const watched = watchList.length;

  const allDays = new Set([...pianoEntries, ...bookEntries, ...pastelEntries, ...watchList].map(e => e.date));
  return { from, to, days: allDays.size, bars, pages, lessons, watched };
}

function currentMaterial() {
  if (!hasMaterials()) return { icon: "◌", title: "нет материалов", sub: "", pct: 0 };
  if (isBook()) {
    const b = book(), s = bookStats();
    return { icon: "📖", title: b.title, sub: `${s.page} из ${s.pages} стр.`, pct: s.pct };
  }
  if (isWatch()) {
    const v = video(), s = watchStats();
    return { icon: "🎬", title: v.title, sub: v.author || "видео", pct: s.pct };
  }
  if (isCourse()) {
    const c = course(), s = pastelStats();
    return { icon: "🎨", title: c.name, sub: `${s.done} из ${s.lessons} уроков`, pct: s.pct };
  }
  const p = piece(), s = pianoStats();
  return { icon: "🎹", title: p.name,
    sub: `${s.touchedR + s.touchedL} из ${s.bars * 2} тактов-рук`,
    pct: s.pctLearn };
}

function archiveCurrent() {
  const m = currentMaterial();
  const days = new Set(entries().map(e => e.date)).size;

  if (!confirm(`Отправить «${m.title}» в архив?\n\nПройдено: ${Math.round(m.pct)}%, ${days} ${plural(days, "день", "дня", "дней")} занятий.\nЗаписи и вклад в баланс останутся.`)) return;

  const dates = entries().map(e => e.date).sort();
  const look = isBook() ? book() : isCourse() ? { art: "smears", tone: "pastel" } : piece();
  const rec = {
    id: uid(), srcId: curKey(), track: data.active, icon: m.icon, title: m.title,
    sub: m.sub, pct: Math.round(m.pct), days,
    art: look.art || "", tone: look.tone || "",
    startedAt: dates[0] || todayStr(), finishedAt: todayStr(),
    rating: 0, review: "",
    createdAt: now(), updatedAt: now()
  };
  data.archive.push(rec);
  addEvent("done", rec.srcId, rec.track, "Завершил: " + rec.title, { tag: rec.srcId });

  if (isBook()) {
    const cur = book();
    cur.archived = true; cur.updatedAt = now();
    const next = data.book.books.find(b => !b.archived);
    if (next) { data.book.activeBook = next.id; saveData(); schedulePush(); render(); openShelfSheet(rec.id); return; }

    const title = prompt("Какую книгу читаешь теперь?", "");
    if (title === null || !title.trim()) { data.archive.pop(); cur.archived = false; return; }
    const pagesStr = prompt("Сколько в ней страниц?", "300");
    const pages = Math.round(Number((pagesStr || "").replace(",", ".")));
    if (!pages || pages < 1) { data.archive.pop(); cur.archived = false; toast("Не понял число страниц"); return; }
    const fresh = {
      id: uid(), title: title.trim(), author: "", volume: "",
      pages, startPage: 0, art: "snow", tone: "sea",
      chapters: [{ name: "Начало", from: 1 }], updatedAt: now()
    };
    data.book.books.push(fresh);
    data.book.activeBook = fresh.id;
  } else if (isCourse()) {
    const name = prompt("Какой курс проходишь теперь?", "");
    if (name === null || !name.trim()) { data.archive.pop(); return; }
    const cnt = Math.round(Number((prompt("Сколько в нём уроков?", "10") || "").replace(",", ".")));
    if (!cnt || cnt < 1) { data.archive.pop(); toast("Не понял число уроков"); return; }
    data.pastel.course = {
      id: uid(), name: name.trim(), author: "",
      lessons: Array.from({ length: cnt }, (_, i) => ({ title: `Урок ${i + 1}`, dur: 600 })),
      updatedAt: now()
    };
  } else {
    const p = piece();
    p.archived = true; p.updatedAt = now();
    const rest = data.piano.pieces.filter(x => !x.archived);
    if (!rest.length) {
      const name = prompt("Какую вещь разбираешь теперь?", "");
      if (name === null || !name.trim()) { p.archived = false; data.archive.pop(); return; }
      const bars = Math.round(Number((prompt("Сколько в ней тактов?", "40") || "").replace(",", ".")));
      if (!bars || bars < 1) { p.archived = false; data.archive.pop(); toast("Не понял число тактов"); return; }
      const np = { id: uid(), author: "", name: name.trim(), bars, art: "keys", tone: "violet", updatedAt: now() };
      data.piano.pieces.push(np);
      data.piano.activePiece = np.id;
    } else {
      data.piano.activePiece = rest[0].id;
    }
  }

  saveData(); schedulePush(); syncPickers(); render();
  openShelfSheet(rec.id);      // сразу предлагаем поставить оценку и написать отзыв
}

function freezeUI() {
  const list = (data.freezes || []).filter(f => !f.deleted)
    .sort((a, b) => a.from < b.from ? 1 : -1);
  const today = todayStr();

  return `
    <div class="freeze">
      <div class="fz-head">🌴 <b>Пауза</b> — дни отпуска или болезни, которые не рвут серию</div>
      <div class="fz-form">
        <input class="note-input" id="fzFrom" type="date" value="${today}" max="2100-01-01">
        <input class="note-input" id="fzTo" type="date" value="${today}" max="2100-01-01">
        <button class="btn" id="fzAdd" type="button">Добавить</button>
      </div>
      ${list.length ? `<div class="fz-list">${list.map(f => `
        <div class="fz-item ${today >= f.from && today <= f.to ? "now" : ""}">
          <span>${fmtRange(f.from, f.to)}${today >= f.from && today <= f.to ? " · идёт сейчас" : ""}</span>
          <button data-fz="${f.id}" type="button">✕</button>
        </div>`).join("")}</div>` : `<div class="fz-empty">Пока пауз нет</div>`}
    </div>`;
}

function bindFreezeUI() {
  const add = $("#fzAdd");
  if (!add) return;
  add.addEventListener("click", () => {
    const from = $("#fzFrom").value, to = $("#fzTo").value;
    if (!from || !to) { toast("Укажи даты"); return; }
    const a = from <= to ? from : to, b = from <= to ? to : from;
    data.freezes.push({ id: uid(), from: a, to: b, createdAt: now(), updatedAt: now() });
    saveData(); schedulePush();
    toast("Пауза добавлена — серия не прервётся");
    openSettingsSheet();
    render();
  });

  document.querySelectorAll("[data-fz]").forEach(b =>
    b.addEventListener("click", () => {
      const f = data.freezes.find(x => x.id === b.dataset.fz);
      if (!f) return;
      if (!confirm("Убрать эту паузу?\n\nДни снова начнут рвать серию.")) return;
      f.deleted = true; f.updatedAt = now();
      saveData(); schedulePush();
      openSettingsSheet();
      render();
    }));
}

function goalUI() {
  const g = goalProgress();
  return `
    <div class="freeze">
      <div class="fz-head">🎯 <b>Цель на неделю</b> — сколько дней заниматься чем угодно из трёх</div>
      <div class="goal-pick">
        ${[2, 3, 4, 5, 6, 7].map(n =>
          `<button class="gbtn ${g.goal === n ? "on" : ""}" data-goal="${n}" type="button">${n}</button>`).join("")}
      </div>
      <div class="fz-empty">Сейчас: <b>${g.days} из ${g.goal}</b> на этой неделе</div>
    </div>`;
}

function bindGoalUI() {
  document.querySelectorAll("[data-goal]").forEach(b =>
    b.addEventListener("click", () => {
      data.weekGoal = Number(b.dataset.goal);
      saveData(); schedulePush();
      openSettingsSheet();
      render();
      toast(`Цель: ${data.weekGoal} ${plural(data.weekGoal, "день", "дня", "дней")} в неделю`);
    }));
}

function archiveUI() {
  if (!hasMaterials()) return "";
  const cur = currentMaterial();
  const list = (data.archive || []).filter(a => !a.deleted)
    .sort((a, b) => a.finishedAt < b.finishedAt ? 1 : -1);
  const fmt = new Intl.DateTimeFormat("ru", { day: "numeric", month: "short", year: "numeric" });

  return `
    <div class="freeze">
      <div class="fz-head">📦 <b>Материалы</b> — пройденное уходит в архив, дни занятий остаются</div>
      <div class="fz-empty">Сейчас: <b>${esc(cur.title)}</b> · ${Math.round(cur.pct)}%</div>
      <button class="btn" id="archBtn" type="button">Отправить в архив и начать новое</button>
      ${list.length ? `<div class="fz-list">${list.map(a => `
        <div class="fz-item">
          <span>${a.icon} ${esc(a.title)} · ${a.pct}% · ${fmt.format(fromStr(a.finishedAt)).replace(" г.", "")}</span>
        </div>`).join("")}</div>` : ""}
    </div>`;
}

function bindArchiveUI() {
  const b = $("#archBtn");
  if (b) b.addEventListener("click", () => { closeSheet(); archiveCurrent(); });
}

function diagLine() {
  const bar = document.querySelector(".tabbar");
  const r = bar ? bar.getBoundingClientRect() : null;
  const safe = getComputedStyle(document.documentElement).getPropertyValue("--safe-b").trim() || "0px";
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone ? "standalone" : "браузер";
  return `${standalone} · окно ${Math.round(innerWidth)}×${Math.round(innerHeight)} · экран ${screen.width}×${screen.height}` +
    `<br>таббар ${r ? Math.round(r.height) : "?"}px, снизу ${r ? Math.round(innerHeight - r.bottom) : "?"}px · safe-area ${safe}`;
}

function saveEntry() {
  if (!gistReady()) { closeSheet(); openSettingsSheet(); return; }
  const existing = entryFor(selectedDate);
  const beforeDone = new Set(achState().filter(a => a.done).map(a => a.id));
  const beforeFacts = new Set(factsState().filter(f => f.open).map(f => f.id));
  const before = curStats();
  const note = ($("#noteInput") && $("#noteInput").value.trim()) || "";

  if (existing) {
    if (isWatch()) { /* пересмотр: новых единиц нет, важна только сама дата */ }
    else if (isBook() && bookMode(book()) === "parts") {
      existing.spans = mergeSpans((existing.spans || []).concat(pickSpans));
    } else if (isBook()) existing.page = Math.max(existing.page || 0, pickPage);
    else if (isCourse()) existing.lessons = [...new Set([...(existing.lessons || []), ...pickLessons])];
    else existing.spans = (existing.spans || []).concat(currentSpans());
    if (note) existing.note = existing.note ? existing.note + "; " + note : note;
    existing.updatedAt = now();
  } else {
    trackOf().entries.push(Object.assign(
      { id: uid(), date: selectedDate, note, createdAt: now(), updatedAt: now() },
      isWatch() ? { videoId: video().id } :
      isBook() ? Object.assign({ bookId: book().id },
        bookMode(book()) === "parts" ? { spans: pickSpans.slice() } : { page: pickPage }) : isCourse() ? { lessons: pickLessons.slice() } : { pieceId: piece().id, spans: currentSpans() }
    ));
  }

  if (isWatch()) {
    const v = video();
    if (v.id && !v.done) {
      v.done = true; v.doneAt = now(); v.updatedAt = now();
      /* Видео уходит с главной — и это событие: иначе оно просто исчезает,
         и в ленте не остаётся следа, что ты его досмотрел. */
      addEvent("done", v.id, "watch", "Досмотрел: " + v.title,
        { tag: v.id, date: selectedDate, fields: { createdAt: now() } });
    }
  }

  pending = [];
  pickLessons = [];
  pickSpans = [];
  saveData();
  schedulePush();
  closeSheet();

  const after = curStats();
  const fresh = achState().filter(a => a.done && !beforeDone.has(a.id));
  const freshFacts = factsState().filter(f => f.open && !beforeFacts.has(f.id));
  /* Снимок вида материала ДО перерисовки: досмотренное видео уходит из ленты,
     активным становится соседний материал — и итог рассказал бы про него. */
  const ctx = { watch: isWatch(), book: isBook(), course: isCourse(),
                title: isWatch() ? video().title : "" };
  render();

  overlayQueue = [];
  // каждая награда — свой экран: раньше показывалась только последняя,
  // а промежуточные пропадали, хотя открылись честно
  fresh.forEach((a, i) => overlayQueue.push({ type: "ach", a, i: i + 1, n: fresh.length }));

  const stamped = stampProgress();
  if (stamped.ach.length || stamped.facts.length) {
    const ent = trackOf().entries.filter((x) => !x.deleted && x.date === selectedDate).slice(-1)[0];
    addEvent("session", curKey(), data.active, sessionText(data.active, ent || {}), {
      tag: curKey(), date: selectedDate,
      fields: { createdAt: now(), awards: stamped.ach, facts: stamped.facts },
    });
  }
  if (freshFacts.length) overlayQueue.push({ type: "facts", list: freshFacts });

  if (overlayQueue.length) { showNextOverlay(); return; }
  showDone(before, after, !!existing, ctx);
}

let overlayQueue = [];

function showNextOverlay() {
  const item = overlayQueue.shift();
  if (!item) return;
  if (item.type === "ach") showCheer(item.a, item.i, item.n);
  else showFacts(item.list);
}

// все новые карточки знаний — одним экраном, листаются прокруткой
function showFacts(list) {
  $("#cheerStep").hidden = true;
  $("#cheerIc").textContent = "💡";
  $("#cheerTitle").textContent = list.length > 1
    ? `${list.length} ${plural(list.length, "новая карточка", "новые карточки", "новых карточек")}`
    : list[0].t;
  $("#cheerText").innerHTML = list.length > 1
    ? `<span class="cheer-list">${list.map(f => `
        <span class="cheer-item">
          <b>${esc(f.t)}</b>
          <i>${esc(f.x)}</i>
          ${(f.more || []).map(m => `<em>→ ${esc(m)}</em>`).join("")}
        </span>`).join("")}</span>`
    : esc(list[0].x) + ((list[0].more || []).length
        ? `<span class="cheer-dig"><b>Копнуть глубже</b>${(list[0].more || []).map(m => `<i>${esc(m)}</i>`).join("")}</span>`
        : "");
  $("#cheerOk").textContent = overlayQueue.length ? "Дальше" : "Интересно!";
  $("#cheer").classList.add("show", "fact");
}

function showCheer(a, i, n) {
  const step = $("#cheerStep");
  step.hidden = !(n > 1);
  step.textContent = n > 1 ? `Награда ${i} из ${n}` : "";
  $("#cheerIc").textContent = a.icon;
  $("#cheerTitle").textContent = a.name;
  $("#cheerText").textContent = wordOf(a);
  $("#cheerOk").textContent = overlayQueue.length ? "Дальше" : "Красота!";
  $("#cheer").classList.remove("fact");
  $("#cheer").classList.add("show");
}

function showDone(before, after, wasExisting, ctx) {
  if (selectedDate !== todayStr()) { toast(fmtDay(selectedDate) + " отмечено"); return; }
  if (wasExisting) { toast("Запись дополнена"); return; }

  $("#cheerStep").hidden = true;
  $("#cheerIc").textContent = after.streakAll >= 2 ? "🔥" : "🎉";
  $("#cheerTitle").textContent = rnd(DONE_TITLES);
  let text;
  if (ctx.book) {
    const g = after.page - before.page;
    text = g > 0 ? `Дочитал до ${after.page}-й страницы (+${stranic(g)}), это ${Math.round(after.pct)}% книги. ` : "Перечитывал уже пройденное — тоже дело. ";
  } else if (ctx.watch) {
    text = before.watched
      ? "Пересмотрел — значит, зацепило. "
      : `«${ctx.title}» — посмотрено. Видео ушло с главной, но осталось в библиотеке. `;
  } else if (ctx.course) {
    const g = after.done - before.done;
    text = g > 0
      ? `+${g} ${plural(g, "урок", "урока", "уроков")}, пройдено ${after.done} из ${after.lessons}. `
      : "Возвращался к пройденному — тоже дело. ";
  } else {
    const g = (after.touchedR + after.touchedL) - (before.touchedR + before.touchedL);
    text = g > 0 ? `+${takty(g)} к разбору, всего ${Math.round(after.pct)}%. ` : "Повторение — эти такты стали крепче. ";
  }
  text += after.streakAll >= 2
    ? `Серия — ${after.streakAll} ${plural(after.streakAll, "день", "дня", "дней")} подряд. Возвращайся завтра, будет ${after.streakAll + 1} 🔥`
    : "Возвращайся завтра — начнём серию!";
  $("#cheerText").textContent = text;
  $("#cheer").classList.add("show");
}

/* Удалили запись за день — из разбора уходит и то, что в этот день закрылось.
   Иначе выходило вранье: в прогрессе пусто, а практика уверена, что такты
   пройдены, и предлагает следующие. */
function pracForgetDay(pieceId, ds) {
  const st = data.practice && data.practice[pieceId];
  if (!st || !st.done) return 0;
  let n = 0;
  for (const [k, v] of Object.entries(st.done))
    if (v === ds) { delete st.done[k]; n++; }
  return n;
}

function dropEntry(e, track) {
  e.deleted = true;
  e.updatedAt = now();
  if (track === "piano") pracForgetDay(e.pieceId || "bwv853", e.date);
  saveData();
  schedulePush();
}

function deleteEntry(id) {
  const e = trackOf().entries.find(x => x.id === id);
  if (!e) return;
  if (!confirm(`Удалить запись за ${fmtDay(e.date)}?\n\nПрогресс по этому дню пропадёт.`)) return;
  dropEntry(e, data.active);
  syncPickers(); render();
  toast("Запись удалена");
}

function goToDate(ds) {
  if (ds > todayStr()) { toast("Это ещё в будущем 🙂"); return; }
  selectedDate = ds; pending = []; pickLessons = [];
  const d = fromStr(ds);
  calYear = d.getFullYear(); calMonth = d.getMonth();
  render();
}
function shiftDay(delta) {
  const d = fromStr(selectedDate); d.setDate(d.getDate() + delta);
  goToDate(dateStr(d));
}

function switchTrack(which) {
  if (data.active === which) return;
  data.active = which;
  pending = []; pickLessons = []; pickSpans = []; selectedDate = todayStr();
  const t = new Date(); calYear = t.getFullYear(); calMonth = t.getMonth();
  syncPickers(); saveData(); schedulePush(); render();
}

function syncPickers() {
  if (!hasMaterials()) return;
  if (isBook()) pickPage = bookProgress();
  else if (isPiano() && piece()) {
    const bars = piece().bars;
    pickFrom = Math.min(pickFrom, bars); pickTo = Math.min(pickTo, bars);
  }
}

/* ══════════ Рендер ══════════ */

function renderBanner() {
  const box = $("#banner");
  if (!box) return;

  if (!online && gistReady()) {
    box.innerHTML = `
      <div class="warn off">
        <span>📴 <b>Нет сети.</b> Записи сохраняются на устройстве и уйдут в гист, как только связь появится.</span>
      </div>`;
    return;
  }

  if (newVersion) {
    box.innerHTML = `
      <div class="warn upd">
        <span>⬆️ <b>Есть новая версия</b> ${esc(newVersion)} — сейчас установлена ${esc(APP_VERSION)}</span>
        <button id="bnUpdate" type="button">Обновить</button>
      </div>`;
    $("#bnUpdate").addEventListener("click", forceUpdate);
    return;
  }

  if (!gistReady()) {
    box.innerHTML = `
      <div class="warn">
        <span>🔒 <b>Синхронизация не подключена.</b> Записи отключены, чтобы прогресс не остался только на этом устройстве.</span>
        <button id="bnConnect" type="button">Подключить</button>
      </div>`;
    $("#bnConnect").addEventListener("click", openSettingsSheet);
    return;
  }

  if (syncError) {
    box.innerHTML = `
      <div class="warn err">
        <span>⚠️ <b>Данные сохранены локально</b>, но не ушли в гист: ${esc(syncError)}</span>
        <button id="bnRetry" type="button">Повторить</button>
      </div>`;
    $("#bnRetry").addEventListener("click", () => syncNow(true));
    return;
  }

  box.innerHTML = "";
}

// если что-то упало — показываем понятный экран вместо пустоты
function crashScreen(e) {
  const box = $("#view");
  if (!box) return;
  // карта — оверлей поверх всего: если её не убрать, человек увидит её вместо сообщения
  try { if (window.closeKnowledgeMap) window.closeKnowledgeMap(); } catch {}
  // запоминаем причину: экран можно закрыть и забыть, а разбираться потом по чему-то надо
  try {
    localStorage.setItem("keiko-last-crash", JSON.stringify({
      at: new Date().toISOString(), profile: profileId || "",
      tab, achTop, achView, msg: String((e && e.message) || e || ""),
      stack: String((e && e.stack) || "").slice(0, 600)
    }));
  } catch {}

  // первая попытка — молча снять service worker и перезагрузиться: чаще всего виноват он
  let tried = "1";
  try { tried = sessionStorage.getItem("keiko-selfheal") || ""; } catch {}
  if (tried !== "1") {
    try { sessionStorage.setItem("keiko-selfheal", "1"); } catch {}
    (async () => {
      try {
        if (navigator.serviceWorker) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.unregister()));
        }
        if (window.caches) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
      } catch {}
      location.replace(location.origin + location.pathname + "?v=" + Date.now());
    })();
    box.innerHTML = `<div class="empty-state"><div class="es-mark">稽古</div><h2>Восстанавливаю…</h2></div>`;
    return;
  }

  box.innerHTML = `
    <div class="empty-state">
      <div class="es-mark">稽古</div>
      <h2>Что-то пошло не так</h2>
      <p>Данные целы — сбой в самом приложении. Кнопка ниже переустановит его начисто.</p>
      <button class="btn gold" id="crashUpd" type="button" style="max-width:280px">Переустановить</button>
      <p class="crash-why">${esc(String((e && e.message) || e || ""))}</p>
    </div>`;
  const b = $("#crashUpd");
  if (b) b.addEventListener("click", () => {
    location.replace(location.origin + location.pathname + "?reset=1");
  });
}

// снимок данных: если синхронизация ничего не изменила, перерисовывать нечего
const dataStamp = () => [
  data.piano.entries, data.book.entries, data.pastel.entries, watchEntries(),
  data.thoughts || [], data.archive || [], data.freezes || [], data.takes || [],
  data.wishes || []
].map(list => list.length + ":" + list.reduce((m, e) => Math.max(m, e.updatedAt || 0), 0)).join("|")
  + "|" + (data.shop.theme || "");
// выбранный материал в снимок не входит: он меняется от свайпа и уже показан на экране —
// перерисовывать из-за него главную значит сбивать листание

let quietRender = false;   // перерисовка без анимаций — например, после фоновой синхронизации

/* Пока человек листает ленту обложек, главную не трогаем: перерисовка пересобирает
   ленту и возвращает её к активной обложке — со стороны это «свайп не сработал». */
let railBusy = false;
let railBusyTimer = null;
let pendingRender = null;

function markRailBusy() {
  railBusy = true;
  clearTimeout(railBusyTimer);
  railBusyTimer = setTimeout(releaseRail, 1400);   // страховка, если события кончились молча
}

function releaseRail() {
  clearTimeout(railBusyTimer);
  if (!railBusy) return;
  railBusy = false;
  if (pendingRender) { const q = pendingRender === "quiet"; pendingRender = null; render(q); }
}

function render(quiet) {
  if (railBusy && tab === "home" && !settingsOpen) {
    if (pendingRender !== "loud") pendingRender = quiet ? "quiet" : "loud";
    return;
  }
  quietRender = !!quiet;
  try { renderInner(); } catch (e) { console.error(e); crashScreen(e); }
  quietRender = false;
}

function renderInner() {
  const box = $("#view");
  const keepScroll = box ? box.scrollTop : 0;
  clearTimeout(railBusyTimer); railBusy = false; pendingRender = null;   // лента пересобирается заново

  renderSeg();
  renderBanner();
  renderTabbar();
  // главная всегда влезает в экран, остальные вкладки скроллятся внутри себя
  $("#view").className = (tab === "home" && !settingsOpen ? "fixed" : "scrolls") + (quietRender ? " quiet" : "");
  /* Сбой внутри одной вкладки не должен убивать приложение: сбрасываем то, что
     чаще всего протухает при смене профиля, и показываем главную. */
  try {
    if (settingsOpen) renderSettings();
    else if (tab === "home") renderHome();
    else if (tab === "progress") renderProgress();
    else if (tab === "notes") renderNotes();
    else if (tab === "wish") renderWishes();
    else renderAch();
  } catch (e) {
    console.error("вкладка " + (settingsOpen ? "настройки" : tab) + ":", e);
    try {
      localStorage.setItem("keiko-last-crash", JSON.stringify({
        at: new Date().toISOString(), profile: profileId || "", tab, achTop, achView,
        msg: String((e && e.message) || e || ""), stack: String((e && e.stack) || "").slice(0, 600)
      }));
    } catch {}
    settingsOpen = false; achView = null; cfg.achView = null; achTop = "mats";
    tab = "home"; cfg.tab = "home"; saveCfg();
    renderTabbar();
    $("#view").className = "fixed";
    renderHome();
    toast("Экран не открылся — вернул на главную");
  }
  markImages();          // разметить, какие обложки ещё едут
  syncNotesFabs();
  audioSync();
  zenArm(true);
  paintSndBtn();

  if (quietRender && box && keepScroll) box.scrollTop = keepScroll;   // не сбрасываем место, где человек читал

  // успешный рендер — снимаем флаг восстановления. Если рендер упал, флаг остаётся,
  // и следующая попытка покажет экран ошибки вместо бесконечной перезагрузки.
  try { sessionStorage.removeItem("keiko-selfheal"); } catch {}
}

function renderSeg() {
  const box = $("#seg");
  if (box) { box.style.display = "none"; box.innerHTML = ""; }
}

// высота закреплённого таббара — чтобы контент не заезжал под него
function syncTabHeight() {
  const bar = document.querySelector(".tabbar");
  if (!bar) return;
  const h = Math.ceil(bar.getBoundingClientRect().height);
  if (h) document.documentElement.style.setProperty("--tab-h", h + "px");
}

function renderTabbar() {
  $("#tabbar").innerHTML = [
    [ "home", ICON("home", "◉"), T("tabHome")],
    ["progress", ICON("progress", "▤"), T("tabProgress")],
    ["notes", ICON("notes", "✎"), T("tabNotes")],
    /* «Достижения» с нижней панели убраны: награды и карточки знаний теперь
       видно в «Моментах», внутри той сессии, где они открылись, а полку
       и карту знаний перенесли в Библиотеку. Экран остался — просто без
       постоянной кнопки. */
    ["wish", ICON("wish", "✧"), `${T("tabWish")} ${wishOpenCount() || ""}`]
  ].map(([id, ic, nm]) =>
    `<button data-tab="${id}" class="${tab === id ? "on" : ""}" type="button"><i>${ic}</i>${nm}</button>`).join("");
  syncTabHeight();
  requestAnimationFrame(syncTabHeight);
  document.querySelectorAll("#tabbar button").forEach(b =>
    b.addEventListener("click", () => {
      tab = b.dataset.tab;
      settingsOpen = false; settingsView = null;
      if (tab === "notes") { notesFocus = true; shuffleThought = null; notesFilter = "all"; }
      cfg.tab = tab; saveCfg();
      render();
      $("#view").scrollTop = 0;
    }));
}

const KEYS_ART = `
  <div class="keys">
    <span class="w"></span><span class="w"></span><span class="w"></span><span class="w"></span>
    <span class="w"></span><span class="w"></span><span class="w"></span>
    <span class="b" style="left:10.2%"></span><span class="b" style="left:24.5%"></span>
    <span class="b" style="left:53%"></span><span class="b" style="left:67.3%"></span><span class="b" style="left:81.6%"></span>
  </div>`;

const WAVE_ART = `
  <svg class="wave" viewBox="0 0 120 56" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <circle cx="92" cy="15" r="8" fill="rgba(255,201,77,.85)"/>
    <path d="M2 36 Q 17 24 32 36 T 62 36 T 92 36 T 118 36" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M2 45 Q 17 33 32 45 T 62 45 T 92 45 T 118 45" fill="none" stroke="rgba(255,255,255,.32)" stroke-width="2.2" stroke-linecap="round"/>
  </svg>`;

const SEA_ART = `
  <svg class="wave sea" viewBox="0 0 120 64" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <circle cx="98" cy="14" r="7" fill="rgba(255,201,77,.85)"/>
    <path d="M52 10 L52 40" stroke="rgba(255,255,255,.78)" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M54 13 L74 28 L54 34 Z" fill="rgba(255,255,255,.7)"/>
    <path d="M34 40 L78 40 L70 49 L42 49 Z" fill="rgba(255,255,255,.55)"/>
    <path d="M4 54 Q 19 46 34 54 T 64 54 T 94 54 T 116 54" fill="none" stroke="rgba(255,255,255,.48)" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M4 61 Q 19 53 34 61 T 64 61 T 94 61 T 116 61" fill="none" stroke="rgba(255,255,255,.24)" stroke-width="2" stroke-linecap="round"/>
  </svg>`;

const PINE_ART = `
  <svg class="wave pine" viewBox="0 0 120 64" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <circle cx="102" cy="13" r="7" fill="rgba(255,201,77,.8)"/>
    <path d="M60 8 L69 28 L64 28 L74 48 L46 48 L56 28 L51 28 Z" fill="rgba(255,255,255,.62)"/>
    <path d="M30 20 L37 35 L33 35 L41 49 L19 49 L27 35 L23 35 Z" fill="rgba(255,255,255,.34)"/>
    <path d="M90 22 L97 36 L93 36 L100 49 L80 49 L87 36 L83 36 Z" fill="rgba(255,255,255,.3)"/>
    <path d="M8 54 L112 54" stroke="rgba(255,255,255,.3)" stroke-width="2" stroke-linecap="round"/>
  </svg>`;

const QUILL_ART = `
  <svg class="wave quill" viewBox="0 0 120 64" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <path d="M84 10 C 66 16, 52 30, 44 48 C 58 44, 72 34, 80 22 C 78 32, 70 42, 58 50 L 84 10 Z" fill="rgba(255,255,255,.66)"/>
    <path d="M44 48 L 30 56" stroke="rgba(255,255,255,.6)" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M12 58 L 96 58" stroke="rgba(255,255,255,.26)" stroke-width="2" stroke-linecap="round"/>
    <circle cx="100" cy="16" r="6" fill="rgba(255,201,77,.8)"/>
  </svg>`;

const LAMP_ART = `
  <svg class="wave lamp" viewBox="0 0 120 64" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <path d="M60 6 L60 14" stroke="rgba(255,255,255,.5)" stroke-width="2" stroke-linecap="round"/>
    <path d="M40 34 L60 14 L80 34 Z" fill="rgba(255,255,255,.62)"/>
    <circle cx="60" cy="40" r="5" fill="rgba(255,201,77,.9)"/>
    <path d="M46 56 L74 56" stroke="rgba(255,255,255,.3)" stroke-width="2" stroke-linecap="round"/>
    <path d="M28 60 Q 60 46 92 60" fill="none" stroke="rgba(255,201,77,.28)" stroke-width="2"/>
  </svg>`;

// одна обложка (книга, композиция или курс)
// все материалы одной лентой: пьесы, книга, курс
function railItems() {
  const out = data.piano.pieces.filter(p => !p.archived)
    .map(p => ({ track: "piano", pieceId: p.id, piece: p }));
  for (const b of data.book.books.filter(b => !b.archived)) out.push({ track: "book", bookId: b.id, book: b });
  if ((data.pastel.course || { lessons: [] }).lessons.length) out.push({ track: "pastel" });
  for (const v of videos().filter(v => !v.archived && !v.done)) out.push({ track: "watch", videoId: v.id, video: v });
  return out;
}
const hasMaterials = () => railItems().length > 0;

// активным может остаться трек, материалов которого у профиля нет — переставляем на первый доступный
function normalizeActive() {
  const items = railItems();
  if (!items.length) return;
  const ok = items.some(i => i.track === data.active
    && (i.track !== "piano" || i.pieceId === data.piano.activePiece)
    && (i.track !== "book" || i.bookId === data.book.activeBook)
    && (i.track !== "watch" || i.videoId === data.watch.activeVideo));
  if (ok) return;
  const first = items[0];
  data.active = first.track;
  if (first.pieceId) data.piano.activePiece = first.pieceId;
  if (first.bookId) data.book.activeBook = first.bookId;
  if (first.videoId) data.watch.activeVideo = first.videoId;
}

function activeRailIndex(items) {
  const i = items.findIndex(it => it.track === data.active &&
    (it.track !== "piano" || it.pieceId === data.piano.activePiece) &&
    (it.track !== "book" || it.bookId === data.book.activeBook) &&
    (it.track !== "watch" || it.videoId === data.watch.activeVideo));
  return Math.max(0, i);
}

/* Картинка обложки: из каталога, если она там есть, иначе файл рядом с приложением.
   Каталожную держим в localStorage — иначе при каждом запуске её пришлось бы качать. */
/* Обложки лежат в Cache Storage, а не в localStorage: там место меряется
   сотнями мегабайт, и картинка хранится файлом, а не строкой в памяти. */
const coverCache = new Map();          // id → blob-ссылка, готовая для <img>
/* ── Атмосфера: у материала может быть свой звук ──
   Хранится как обложки: в приватном гисте каталога, на устройстве — в Cache Storage.
   Играет только на главной, только когда материал активен, и только по разрешению. */
const AUDIO_CACHE = "keiko-audio-v1";
const audioKey = (id) => "keiko-audio/" + encodeURIComponent(id);
const CAT_AUDIO_FILE = (id) => `audio-${id}.txt`;
const audioUrls = new Map();          // id → blob-ссылка
const audioPulling = new Set();

async function audioBox() { return await caches.open(AUDIO_CACHE); }

async function audioSave(id, dataUri) {
  const blob = await (await fetch(dataUri)).blob();
  const box = await audioBox();
  await box.put(audioKey(id), new Response(blob, { headers: { "Content-Type": blob.type || "audio/mp4" } }));
  audioUrls.set(id, URL.createObjectURL(blob));
}

async function audioLoadAll() {
  if (!window.caches) return;
  try {
    const box = await audioBox();
    for (const req of await box.keys()) {
      const id = decodeURIComponent(req.url.split("/").pop());
      if (audioUrls.get(id)) continue;
      const res = await box.match(req);
      if (res) audioUrls.set(id, URL.createObjectURL(await res.blob()));
    }
  } catch {}
}

/* Скачиваем с отчётом о ходе: нота в шапке показывает, что музыка грузится. */
async function readWithProgress(res, id, report) {
  const len = +(res.headers.get("content-length") || 0);
  if (!res.body || !len) return await res.text();     // длины нет — просто ждём
  const rd = res.body.getReader(), parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    parts.push(value); got += value.length;
    (report || audioProgress)(id, got / len);
  }
  let all = new Uint8Array(got), at = 0;
  for (const p of parts) { all.set(p, at); at += p.length; }
  return new TextDecoder().decode(all);
}

async function pullAudio(id) {
  if (!cfg.token || !cfg.catalogId || audioPulling.has(id) || audioUrls.has(id)) return;
  audioPulling.add(id);
  audioProgress(id, 0);
  try {
    const r = await gh("/gists/" + cfg.catalogId);
    if (!r.ok) return;
    const f = (await r.json()).files[CAT_AUDIO_FILE(id)];
    if (!f) { audioUrls.set(id, ""); return; }        // звука у материала нет — больше не спрашиваем
    let txt = f.content;
    if (f.truncated && f.raw_url) {
      const res = await withTimeout(fetch(f.raw_url), 90000);
      txt = await readWithProgress(res, id);
    }
    txt = txt.trim();
    if (!txt.startsWith("data:")) return;
    await audioSave(id, txt);
    audioNow = "";                                    // пусть audioSync подхватит заново
    audioSync();
  } catch {} finally { audioPulling.delete(id); audioProgress(id, 1); }
}

/* ── Нота в шапке ── */
let audioPct = { id: "", v: 0 };
function audioProgress(id, v) {
  audioPct = { id, v: Math.max(0, Math.min(1, v)) };
  paintSndBtn();
}
function paintSndBtn() {
  /* Нота живёт внутри обложки, а не поверх экрана: при листании она едет
     вместе со своей книгой и не тащится следом. */
  const id = audioPulling.size ? audioPct.id : "";
  const on = !!id && cfg.sound && tab === "home" && !settingsOpen;
  document.querySelectorAll("[data-snd]").forEach(el => {
    const mine = on && el.dataset.snd === id;
    el.classList.toggle("show", mine);
    if (!mine) return;
    const bar = el.querySelector(".sn-bar");
    if (bar) bar.style.strokeDashoffset = String(94.2 * (1 - audioPct.v));
    el.setAttribute("aria-label", `Музыка грузится, ${Math.round(audioPct.v * 100)}%`);
  });
}




/* Проигрывание — на howler.js: он ведёт громкость плавно (а не рывками по таймеру),
   сам разбирается с политикой автозапуска и разблокировкой звука на iOS.
   Два разных произведения намеренно НЕ накладываются: старое уходит, потом
   приходит новое. Наложение музыки звучит грязно — проверено на слух. */
const howls = new Map();              // id → Howl
let audioNow = "";                    // что звучит (или вот-вот зазвучит)
let audioUnlocked = false;
let audioSwitchTimer = 0;             // ждём, пока лента успокоится
let audioStarting = false;            // запуск назначен, но ещё не случился
const AUDIO_VOL = 0.55;
const FADE_OUT = 700;
const FADE_IN = 1100;
const SETTLE_MS = 420;                // свайп через несколько обложек не дёргает звук

function howlFor(id, url) {
  let h = howls.get(id);
  if (h) return h;
  h = new Howl({
    src: [url], format: ["mp4"],
    html5: true,                      // потоком: длинная запись не разворачивается в память целиком
    loop: true, volume: 0, preload: true,
    /* Волны ждут музыку, а не наоборот: пока поток разворачивается, играть
       ещё нечего. Как зазвучало — будим отрисовку, даже если её успели
       остановить, пока грузилось. */
    onplay: () => { if (window.waveStart) waveStart(); }
  });
  howls.set(id, h);
  return h;
}

/* iOS не даёт менять громкость у <audio> программно: присваивание молча
   игнорируется. Потоковый режим howler управляет звуком именно так — поэтому
   на телефоне затухания не было вовсе: музыка шла на полной и обрывалась
   в момент паузы. Проверяем это один раз и, если громкость неподатлива,
   ведём звук через регулятор Web Audio: он на iOS слушается, а поток не ломает. */
let volCtl = null;
function volumeControllable() {
  if (volCtl !== null) return volCtl;
  try {
    const a = new Audio();
    a.volume = 0.5;
    volCtl = Math.abs(a.volume - 0.5) < 0.01;
  } catch { volCtl = false; }
  return volCtl;
}

/* Регулятор привязан к самому <audio>, а не к материалу: howler держит пул
   элементов и переиспользует их между треками, а подключить один элемент
   к звуковому графу можно ровно один раз — второй вызов бросает исключение.
   Ключ по материалу давал здесь то молчание навсегда (элемент остался висеть
   на старом регуляторе, выкрученном в ноль), то отказ от затухания. */
const nodeGain = new WeakMap();
/* Элементы <audio> у howler ходят по кругу: остановленный трек отдаёт свой
   обратно, и следующий может получить тот же самый — вместе с регулятором
   громкости. Поэтому регулятор помнит, чей он сейчас: гасить чужой нельзя. */
const gainOwner = new WeakMap();
const nodeOf = (h) => (h && h._sounds && h._sounds[0] && h._sounds[0]._node) || null;

function gainOf(h) {
  const node = nodeOf(h);
  return node ? (nodeGain.get(node) || null) : null;
}

function gainFor(h) {
  const node = nodeOf(h);
  if (!node) return null;
  const have = nodeGain.get(node);
  if (have) { gainOwner.set(have, h); return have; }   // забрали элемент — забрали и регулятор
  try {
    // ctx у howler создаётся лениво; обращение к громкости его поднимает
    if (window.Howler && !Howler.ctx) { try { Howler.volume(Howler.volume()); } catch {} }
    const ctx = window.Howler && Howler.ctx;
    if (!ctx || !ctx.createMediaElementSource) return null;
    /* Не перенаправляем, пока движок не запущен: элемент, подключённый
       к спящему графу, замолчит совсем — а это хуже, чем резкая остановка. */
    if (ctx.state !== "running") { try { ctx.resume(); } catch {} return null; }
    const g = ctx.createGain();
    g.gain.value = 0;
    ctx.createMediaElementSource(node).connect(g);
    g.connect(ctx.destination);
    nodeGain.set(node, g);
    gainOwner.set(g, h);
    return g;
  } catch { return null; }
}

/* Ведём громкость от from к to за ms. Возвращает false, если платформа
   не даёт этого сделать ни одним способом — тогда зовущий гасит резко,
   но сразу: лучше чистая тишина, чем хвост на полной громкости. */
function fadeVol(h, from, to, ms) {
  h.volume(to);                        // внутренний учёт howler держим в согласии
  if (volumeControllable()) { h.volume(from); h.fade(from, to, ms); return true; }
  const g = gainFor(h);
  if (!g) return false;
  const ctx = Howler.ctx;
  try { if (ctx.state === "suspended") ctx.resume(); } catch {}
  const t = ctx.currentTime;
  try {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(from, t);
    g.gain.linearRampToValueAtTime(to, t + ms / 1000);
  } catch { return false; }
  return true;
}
const volNow = (h) => volumeControllable() ? h.volume() : ((gainOf(h) || { gain: { value: 0 } }).gain.value);

/* Раньше остановка висела на событии "fade" от библиотеки. В потоковом режиме
   это событие приходит не всегда, и прошлая композиция продолжала звучать
   поверх новой. Теперь гасим по таймеру — событие лишь ускоряет развязку. */
const stopTimers = new Map();
function hardStop(h, id, ms) {
  clearTimeout(stopTimers.get(id));
  stopTimers.set(id, setTimeout(() => {
    stopTimers.delete(id);
    if (id === audioNow) return;         // за это время вернулись к нему — глушить нечего
    /* Регулятор берём ДО паузы: после неё элемент уже может уйти в общий котёл.
       И обнуляем, только если он всё ещё наш — иначе этот отложенный удар
       приходился по музыке следующего материала, и она молчала при играющих
       волнах: элемент-то звучал, просто в ноль. */
    const g = gainOf(h);
    try { h.volume(0); h.pause(); } catch {}
    if (g && gainOwner.get(g) === h) {
      try { g.gain.cancelScheduledValues(Howler.ctx.currentTime); g.gain.value = 0; } catch {}
    }
  }, (ms || FADE_OUT) + 120));
}
const anyPlaying = () => { let n = false; howls.forEach(h => { if (h.playing()) n = true; }); return n; };

function stopAllExcept(keepId, ms) {
  const dur = ms || FADE_OUT;
  howls.forEach((h, id) => {
    if (id === keepId) { clearTimeout(stopTimers.get(id)); stopTimers.delete(id); return; }
    if (!h.playing()) { try { h.volume(0); h.pause(); } catch {} return; }
    const faded = fadeVol(h, volNow(h), 0, dur);
    if (!faded) { try { h.pause(); } catch {} clearTimeout(stopTimers.get(id)); stopTimers.delete(id); return; }
    hardStop(h, id, dur);               // страховка: замолчит в любом случае
  });
}

/* Сторож на случай, если музыка идёт вхолостую: элемент играет, волны бегут,
   а громкость осталась в нуле. Так бывает, когда регулятор достался от
   прошлого трека или граф успел заснуть. Молча возвращаем звук. */
let audioGuardTimer = 0;
function audioGuard() {
  if (!audioNow || audioStarting || stopTimers.has(audioNow)) return;
  if (!(cfg.sound && zenOn && tab === "home" && !settingsOpen && !document.hidden)) return;
  const h = howls.get(audioNow);
  if (!h || !h.playing()) return;
  if (volNow(h) >= AUDIO_VOL * 0.5) return;
  fadeVol(h, volNow(h), AUDIO_VOL, 500);
}

/* Что должно звучать прямо сейчас: только главная, только активный материал,
   только если человек включил звук и уже коснулся экрана. */
function audioSync() {
  if (!audioGuardTimer) audioGuardTimer = setInterval(audioGuard, 900);
  if (typeof Howl !== "function") return;          // библиотека не догрузилась — просто тишина
  /* Музыка не начинается сразу при входе на главную: она вступает, когда
     человек задержался и интерфейс ушёл. Иначе звук догоняет тебя на бегу. */
  const want = (cfg.sound && !takeMute && audioUnlocked && zenOn && tab === "home"
    && !settingsOpen && !document.hidden && hasMaterials()) ? curKey() : "";

  /* Раньше здесь был простой выход при совпадении. Но метка audioNow ставится
     заранее, ещё до запуска: если быстро уйти с обложки и вернуться, трек успевал
     остановиться, а метка оставалась — и звук пропадал насовсем. Поэтому сверяем
     не метку, а то, играет ли он на самом деле. */
  if (want && want === audioNow) {
    if (audioStarting) return;                         // запуск уже назначен
    const h = howls.get(want);
    if (h && h.playing()) {
      // вернулись на обложку, пока трек гас: начинаем мелодию сначала —
      // возвращение к материалу должно звучать как начало, а не как середина
      if (volNow(h) < AUDIO_VOL * 0.9) {
        try { h.seek(0); } catch {}
        fadeVol(h, 0, AUDIO_VOL, FADE_IN);
      }
      if (window.waveStart) waveStart();
      return;
    }
  } else {
    clearTimeout(audioSwitchTimer); audioStarting = false;
  }

  if (!want) {
    clearTimeout(audioSwitchTimer); audioStarting = false;
    audioNow = ""; stopAllExcept(null); return;
  }

  if (!audioUrls.has(want)) pullAudio(want);
  const url = audioUrls.get(want);
  if (!url) { audioNow = ""; stopAllExcept(null); return; }   // звук ещё качается

  audioNow = want;
  stopAllExcept(want);                             // старое уходит сразу
  audioStarting = true;

  // новое вводим, только когда человек действительно остановился на этой обложке
  clearTimeout(audioSwitchTimer);
  audioSwitchTimer = setTimeout(() => {
    audioStarting = false;
    if (audioNow !== want) return;
    const h = howlFor(want, url);
    // пауза в howler запоминает место, поэтому перематываем в начало сами
    if (!h.playing()) { h.volume(0); try { h.seek(0); } catch {} h.play(); }
    gainFor(h);                        // подключаем регулятор до первого звука
    fadeVol(h, volNow(h), AUDIO_VOL, FADE_IN);
    if (window.waveStart) waveStart();
    zenArm(true);
    paintSndBtn();
  }, anyPlaying() ? SETTLE_MS + FADE_OUT * 0.6 : 120);   // гасить нечего — стартуем почти сразу
}

/* ══════════ Волны под музыку ══════════
   Огибающая посчитана заранее и лежит в гисте: шесть каналов десять раз в секунду —
   три полосы громкости, ход музыки, тембр и атаки. Живой анализ звука не нужен,
   поэтому работает ровно на любом телефоне и ничего не может сломать. */
const ENV_FILE = "keiko-audio-envelopes.json";
const LS_ENV = "keiko-envelopes-v1";
let ENVEL = null;
try { ENVEL = JSON.parse(localStorage.getItem(LS_ENV) || "null"); } catch {}

const BG_PRESETS = [
  { id: "still", name: "Тихая вода", hint: "почти неподвижно", blur: 22,
    cfg: { gain:0.85, gamma:1.25, smooth:1.6, speed:0.42, amp:0.85, bright:1.05, tone:0.7, hit:0.25 },
    layers: [[0.34,0,0.030,1.5,2.6,0.060,1.10,0.50],[0.52,1,0.024,1.2,2.1,0.075,1.00,0.46],
             [0.70,2,0.036,1.9,3.0,0.050,0.88,0.36],[0.86,0,0.020,1.0,1.8,0.090,1.06,0.30]] },
  { id: "breath", name: "Дыхание", hint: "золотая середина", blur: 18,
    cfg: { gain:1.05, gamma:1.15, smooth:0.85, speed:0.75, amp:1.10, bright:1.20, tone:0.85, hit:0.55 },
    layers: [[0.30,0,0.055,2.1,3.7,0.055,1.18,0.55],[0.46,1,0.041,1.6,2.9,0.070,1.00,0.50],
             [0.62,2,0.068,2.7,4.3,0.048,0.84,0.42],[0.78,0,0.033,1.3,2.3,0.085,1.10,0.38]] },
  { id: "tide", name: "Прилив", hint: "крупные валы", blur: 16,
    cfg: { gain:1.25, gamma:1.0, smooth:0.55, speed:0.9, amp:1.55, bright:1.25, tone:0.8, hit:0.7 },
    layers: [[0.38,0,0.045,0.9,1.7,0.135,1.15,0.60],[0.58,1,0.033,0.7,1.4,0.160,1.02,0.54],
             [0.76,0,0.026,0.6,1.1,0.180,1.10,0.42]] },
  { id: "aurora", name: "Сияние", hint: "перелив цвета", blur: 26,
    cfg: { gain:1.15, gamma:1.35, smooth:1.1, speed:0.6, amp:1.0, bright:1.45, tone:1.6, hit:0.4 },
    layers: [[0.22,2,0.050,3.1,5.2,0.045,0.78,0.50],[0.36,1,0.038,2.4,4.0,0.058,0.95,0.52],
             [0.50,0,0.030,1.7,3.1,0.070,1.25,0.48],[0.66,2,0.062,3.6,5.8,0.038,0.80,0.38],
             [0.82,1,0.026,1.4,2.5,0.080,1.00,0.32]] },
  { id: "pulse", name: "Пульс", hint: "точно в ритм", blur: 14,
    cfg: { gain:1.2, gamma:1.0, smooth:0.28, speed:1.0, amp:1.15, bright:1.2, tone:0.7, hit:1.3 },
    layers: [[0.32,0,0.060,2.4,4.1,0.055,1.16,0.58],[0.48,1,0.048,1.9,3.3,0.068,1.00,0.54],
             [0.64,2,0.075,3.0,4.9,0.046,0.86,0.46],[0.80,0,0.038,1.5,2.7,0.080,1.08,0.40]] },
  { id: "mist", name: "Туман", hint: "движение угадывается", blur: 34,
    cfg: { gain:0.75, gamma:1.4, smooth:2.2, speed:0.30, amp:0.70, bright:1.0, tone:0.6, hit:0.15 },
    layers: [[0.40,0,0.018,0.8,1.5,0.075,1.08,0.44],[0.60,1,0.014,0.6,1.2,0.090,1.00,0.40],
             [0.80,2,0.022,1.1,1.9,0.065,0.90,0.32]] },
];
const bgPreset = () => BG_PRESETS.find(p => p.id === cfg.bgPreset) || BG_PRESETS[1];

async function pullEnvelopes() {
  if (!cfg.token || !cfg.catalogId || ENVEL) return;
  try {
    const r = await gh("/gists/" + cfg.catalogId);
    if (!r.ok) return;
    const f = (await r.json()).files[ENV_FILE];
    if (!f) return;
    let txt = f.content;
    if (f.truncated && f.raw_url) txt = await (await withTimeout(fetch(f.raw_url), 30000)).text();
    ENVEL = JSON.parse(txt);
    try { localStorage.setItem(LS_ENV, txt); } catch {}
    waveStart();
  } catch {}
}

(function () {
  const PHI = 1.6180339887, SQ2 = 1.4142135624, SQ3 = 1.7320508076;
  const LW = 160, LH = 340;
  let cv, ctx, layers = [], raf = 0, last = 0, flow = 0, beat = 0, waitFrom = 0;
  let paceSm = 0.5, toneSm = 0.5, hitSm = 0, bytes = null, curId = "";

  function build() {
    const P = bgPreset();
    layers = P.layers.map(([y, band, sp, k1, k2, amp, hue, a]) => ({
      y, band, sp, k1, k2, amp, hue, a, lvl: 0,
      ph: Math.random() * 6.283, d1: sp * PHI, d2: sp * SQ2 * 0.61, d3: sp * SQ3 * 0.37
    }));
    if (cv) cv.style.filter = `blur(${P.blur}px) saturate(1.25)`;
  }

  function envBytes(id) {
    const e = ENVEL && ENVEL.tracks && ENVEL.tracks[id];
    if (!e) return null;
    if (!e._b) {
      const raw = atob(e.d), a = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) a[i] = raw.charCodeAt(i);
      e._b = a;
    }
    return e;
  }
  function bandsAt(id, sec) {
    const e = envBytes(id);
    if (!e) return null;
    const i = Math.min(e.n - 1, Math.max(0, Math.floor(sec * e.hz)));
    const j = Math.min(e.n - 1, i + 1), f = sec * e.hz - i, d = e._b, out = [];
    for (let b = 0; b < 6; b++) {
      const a = d[i * 6 + b] / 255, c = d[j * 6 + b] / 255;
      out.push(a + (c - a) * f);
    }
    return out;
  }

  /* Цвет не вычисляем заново: берём ровно тот, которым покрашен верхний фон.
     Иначе сверху один тон, снизу другой — и экран разваливается надвое. */
  let toneNow = [110, 90, 160];
  const lifted = [0, 0, 0];
  function tone() {
    const want = bgTone || toneNow;
    // переползаем к новому цвету плавно, чтобы смена материала не щёлкала
    for (let i = 0; i < 3; i++) toneNow[i] += (want[i] - toneNow[i]) * 0.04;
    /* Цвет берётся с обложки, а обложки бывают почти чёрные — тогда и волны
       выходили чёрными на чёрном, то есть их просто не было видно.
       Поднимаем яркость до рабочей, оттенок при этом сохраняется. */
    const mx = Math.max(toneNow[0], toneNow[1], toneNow[2]);
    const k = mx < 120 ? 120 / Math.max(8, mx) : 1;
    for (let i = 0; i < 3; i++) lifted[i] = Math.min(255, toneNow[i] * k);
    return lifted;
  }

  function draw(bands) {
    const P = bgPreset(), C = P.cfg, [r, g, bl] = tone();
    ctx.clearRect(0, 0, LW, LH);
    ctx.globalCompositeOperation = "lighter";
    const warm = 1 + (0.5 - toneSm) * 0.9 * C.tone;
    const cool = 1 + (toneSm - 0.5) * 0.9 * C.tone;
    const B = C.bright * (1 + 0.22 * hitSm * C.hit);
    const dt = 0.016;
    for (const L of layers) {
      let t = bands ? bands[L.band] : 0.30;
      t = Math.min(1, Math.pow(t, C.gamma) * C.gain);
      L.lvl += (t - L.lvl) * (1 - Math.exp(-dt / Math.max(0.05, C.smooth)));
      const amp = LH * (L.amp * C.amp * (0.45 + 1.35 * L.lvl + 0.28 * hitSm * C.hit));
      const base = LH * L.y;
      const wave = (x) => {
        const u = x / LW;
        return base
          + amp * Math.sin(u * L.k1 * 6.283 + flow * L.d1 * 6.283 * C.speed + L.ph)
          + amp * 0.55 * Math.sin(u * L.k2 * 6.283 - flow * L.d2 * 6.283 * C.speed + L.ph * PHI)
          + amp * 0.30 * Math.sin(u * (L.k1 + L.k2) * 3.1 + flow * L.d3 * 6.283 * C.speed);
      };
      ctx.beginPath(); ctx.moveTo(-4, LH + 4);
      for (let x = -4; x <= LW + 4; x += 4) ctx.lineTo(x, wave(x));
      ctx.lineTo(LW + 4, LH + 4); ctx.closePath();
      const cr = Math.min(255, r * L.hue * B * warm * (0.9 + 1.5 * L.lvl));
      const cg = Math.min(255, g * B * (0.9 + 1.5 * L.lvl));
      const cb = Math.min(255, bl * B * cool * (0.9 + 1.5 * L.lvl));
      /* Заливка лежит под кривой, поэтому у самой кривой прозрачность обязана быть
         нулевой — иначе на тихой музыке волна выпрямляется и граница читается
         как резкий обрез. Свечение начинается ниже всех возможных гребней. */
      /* Растушёвка задаётся в пикселях, а не долей амплитуды: иначе на тихой
         музыке волна выпрямляется, переход схлопывается и виден резкий обрез.
         Всё выше yStart прозрачно — холст подставляет туда первую метку. */
      const yStart = base + amp * 2.0;         // ниже самых глубоких провалов кривой
      const yEnd = yStart + 260;               // свет живёт полосой, а не заливает низ целиком
      const span = yEnd - yStart;
      const fIn = 90 / span;                   // 90 пикселей мягкого входа
      const peak = (L.a * (0.34 + 0.80 * L.lvl)).toFixed(3);
      const grd = ctx.createLinearGradient(0, yStart, 0, yEnd);
      grd.addColorStop(0, `rgba(${cr|0},${cg|0},${cb|0},0)`);
      grd.addColorStop(fIn, `rgba(${cr|0},${cg|0},${cb|0},${peak})`);
      grd.addColorStop(1, `rgba(${cr|0},${cg|0},${cb|0},0)`);
      ctx.fillStyle = grd; ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function step(now) {
    raf = 0;
    beat = Date.now();                 // отметка живости: по ней видно, что цикл идёт
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const on = cfg.sound && cfg.bgWave !== false && tab === "home" && !settingsOpen
      && !document.hidden && audioNow && ENVEL;
    if (!on) { hide(); return; }                 // ушли с главной, выключили звук — цикл не нужен

    /* Звук поднимается не мгновенно: howler создаёт поток, iOS его буферизует,
       да и погружение зовёт волны раньше, чем музыка успевает вступить.
       Раньше первый же такой кадр убивал цикл насовсем — и волн не было
       всё погружение. Теперь ждём музыку, не выходя из цикла. */
    const h = howls.get(audioNow);
    if (!h || !h.playing()) {
      if (!waitFrom) waitFrom = Date.now();
      if (Date.now() - waitFrom > 30000) { hide(); return; }   // не дождались — не крутимся вхолостую
      if (cv) cv.classList.remove("on");
      raf = requestAnimationFrame(step);
      return;
    }
    waitFrom = 0;

    if (curId !== audioNow) { curId = audioNow; build(); }
    const bands = bandsAt(audioNow, h.seek() || 0);
    const ease = (tau) => 1 - Math.exp(-dt / tau);
    paceSm += ((bands ? bands[3] : 0.45) - paceSm) * ease(2.5);
    toneSm += ((bands ? bands[4] : 0.5) - toneSm) * ease(4.0);
    const hn = bands ? bands[5] : 0;
    hitSm += (hn > hitSm ? (hn - hitSm) * ease(0.22) : (hn - hitSm) * ease(1.6));
    flow += dt * (0.35 + 1.5 * paceSm);        // скорость волн идёт за темпом музыки
    draw(bands);
    cv.classList.add("on");
    raf = requestAnimationFrame(step);
  }

  function hide() {
    if (cv) cv.classList.remove("on");
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    waitFrom = 0;
  }

  window.waveStart = function () {
    if (!cv) {
      cv = document.getElementById("bgWave");
      if (!cv) return;
      ctx = cv.getContext("2d");
      cv.width = LW; cv.height = LH;
      build();
    }
    if (!ENVEL) { pullEnvelopes(); return; }
    /* Если экран погас или приложение уходило в фон, кадры перестают приходить,
       а флаг занятости остаётся выставленным — и цикл больше не оживает.
       Поэтому смотрим не на флаг, а на то, когда был последний кадр. */
    if (raf && Date.now() - beat < 1500) return;
    if (raf) { try { cancelAnimationFrame(raf); } catch {} raf = 0; }
    last = performance.now(); beat = Date.now();
    raf = requestAnimationFrame(step);
  };
  window.waveRebuild = function () { curId = ""; build(); };
})();

/* ══════════ Погружение ══════════
   Если человек просто слушает и ничего не трогает — интерфейс уходит, остаётся
   обложка и цвет. Любое касание возвращает всё обратно. Экран при этом держим
   включённым, но не блокируем: музыка играет и в фоне. */
const ZEN_AFTER = 10000;
let zenTimer = 0, zenOn = false, wakeLock = null;
let zenHold = 0;   // до этого времени в погружение не входим: человек вышел сам
let zenAt = 0;     // когда должен сработать текущий отсчёт

/* Не давать экрану гаснуть. Штатный Wake Lock есть не везде — на iOS он
   появился поздно и в приложении с домашнего экрана срабатывает не всегда.
   Запасной путь — играющее видео: пока оно идёт, система экран не тушит.
   Кадр берём с пустой канвы, поэтому никаких файлов не нужно. */
let wakeVideo = null, wakeStream = null;

async function keepAwake(on) {
  if (on) {
    try {
      if (!wakeLock && navigator.wakeLock) {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => { wakeLock = null; });
        return;                                  // штатный способ сработал
      }
      if (wakeLock) return;
    } catch {}
    startWakeVideo();                            // не дали — идём в обход
  } else {
    try { if (wakeLock) { await wakeLock.release(); wakeLock = null; } } catch {}
    stopWakeVideo();
  }
}

function startWakeVideo() {
  if (wakeVideo) { wakeVideo.play().catch(() => {}); return; }
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 2;
    const cx2 = c.getContext("2d");
    cx2.fillStyle = "#000"; cx2.fillRect(0, 0, 2, 2);
    // поток должен обновляться, иначе часть браузеров считает видео замершим
    setInterval(() => { cx2.fillRect(0, 0, 2, 2); }, 1000);
    wakeStream = c.captureStream(1);
    const v = document.createElement("video");
    v.srcObject = wakeStream;
    v.muted = true; v.loop = true; v.playsInline = true;
    v.setAttribute("playsinline", ""); v.setAttribute("muted", "");
    v.style.cssText = "position:fixed;width:2px;height:2px;opacity:0.01;pointer-events:none;bottom:0;left:0";
    document.body.appendChild(v);
    v.play().catch(() => {});
    wakeVideo = v;
  } catch {}
}

function stopWakeVideo() {
  try {
    if (wakeVideo) { wakeVideo.pause(); wakeVideo.remove(); wakeVideo = null; }
    if (wakeStream) { wakeStream.getTracks().forEach(t => t.stop()); wakeStream = null; }
  } catch {}
}

/* Пока обложка едет, на её месте была дыра, а у неприехавшей iOS рисует
   свой значок с вопросом — пустой alt его не убирает. Поэтому саму картинку
   прячем, а ожидание показываем на рамке: у неприехавшей картинки размера
   ещё нет, и полосе просто негде было бы рисоваться.
   Слушаем на перехвате: load и error у картинок не всплывают. */
const COVER_BOX = ".cover, .lib-cover, .th-cover, .shelf-cover, .km-cover";
function imgBox(el) {
  const box = el.parentElement;
  return box && box.matches && box.matches(COVER_BOX) ? box : null;
}
function imgSettle(el, ok) {
  el.classList.remove("img-off", "img-on");
  el.classList.add(ok ? "img-on" : "img-off");
  const box = imgBox(el);
  if (!box) return;
  box.classList.remove("img-wait", "img-ready", "img-fail");
  box.classList.add(ok ? "img-ready" : "img-fail");
}
function markImages() {
  document.querySelectorAll(".app img, .sheet img").forEach((el) => {
    if (el.complete) { imgSettle(el, !!el.naturalWidth); return; }
    const box = imgBox(el);
    if (box) { box.classList.remove("img-ready", "img-fail"); box.classList.add("img-wait"); }
  });
}
document.addEventListener("load", (e) => {
  if (e.target && e.target.tagName === "IMG") imgSettle(e.target, true);
}, true);
document.addEventListener("error", (e) => {
  if (e.target && e.target.tagName === "IMG") imgSettle(e.target, false);
}, true);

// вернулись в приложение — блокировку экрана надо запросить заново
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  /* iOS снимает замок экрана, когда приложение уходит в фон. Вернулись —
     просим заново, иначе посреди занятия экран начнёт гаснуть. */
  if (zenOn || prac) keepAwake(true);
  if (window.waveStart) waveStart();          // кадры могли встать, пока нас не было
});

function zenEnter() {
  if (zenOn) return;
  zenOn = true;
  document.body.classList.add("zen");
  keepAwake(true);
  audioSync();                      // вот теперь музыка вступает
  if (window.waveStart) waveStart();
}
function zenExit(manual) {
  if (zenOn) {
    zenOn = false;
    document.body.classList.remove("zen");
    keepAwake(false);
    /* Тапнул — значит музыка надоела. Гасим сразу и не возвращаемся сами:
       иначе через десять секунд она заиграла бы снова, поверх нежелания. */
    if (manual) zenHold = now() + 3 * 60 * 1000;
    audioSync();
  }
  zenArm();
}
// условия: главная, звук играет, ничего не открыто
/* keep = «не сбрасывай отсчёт, если он уже идёт». Отсчитываем бездействие
   человека, а догрузка музыки к этому отношения не имеет: раньше она
   перезапускала таймер, и вместо десяти секунд выходило под двадцать. */
function zenArm(keep) {
  const pending = !!zenTimer;
  clearTimeout(zenTimer);
  zenTimer = 0;                       // не только гасим таймер, но и признаём это состоянием
  const can = cfg.sound && cfg.zen !== false && tab === "home" && !settingsOpen
    && !document.hidden && hasMaterials() && !sheetOpen() && now() > zenHold && !prac;
  if (!can) { if (zenOn) zenExit(); return; }
  if (keep && pending && zenAt) {
    const left = Math.max(0, zenAt - now());
    zenTimer = setTimeout(zenEnter, left);
    return;
  }
  zenAt = now() + ZEN_AFTER;
  zenTimer = setTimeout(zenEnter, ZEN_AFTER);
}
const sheetOpen = () => !!document.querySelector(".sheet.show, .sheet-bg.show")
  || !(document.getElementById("kmap") || {}).hidden;

// первое касание разблокирует звук: iOS иначе не даёт играть
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  /* Звуковой движок поднимаем и будим ИМЕННО здесь — внутри первого касания.
     Музыка вступает по таймеру бездействия, а это уже не жест: разбудить
     движок тогда iOS не даст, и весь звук ушёл бы в тишину. */
  try {
    if (window.Howler) {
      // сама библиотека умеет усыплять движок для экономии — но мы теперь
      // ведём через него звук, и уснувший граф означал бы тишину
      Howler.autoSuspend = false;
      if (!Howler.ctx) Howler.volume(Howler.volume());
      if (Howler.ctx && Howler.ctx.state === "suspended") Howler.ctx.resume();
    }
  } catch {}
  audioSync();
}

/* ── Записи собственной игры ──
   Аудио — в Cache Storage и в отдельном приватном гисте (не в каталоге:
   каталог тянется целиком, а записей со временем станет много). */
const TAKE_CACHE = "keiko-takes-v1";
const takeKey = (id) => "keiko-take/" + encodeURIComponent(id);
const TAKE_FILE = (id) => `take-${id}.txt`;
const takeUrls = new Map();
const takePct = new Map();     // id → 0..1, чтобы было видно, сколько осталось
const takeBusy = new Set();
const takeFail = new Map();    // id → когда сорвалось: не долбим гист на каждой перерисовке
/* Пока вложение качается, обновляем ТОЛЬКО полоску, а не всю ленту.
   Раньше здесь стояла перерисовка: лента пересобиралась четыре раза в секунду,
   интерфейс дёргался, и в выпадающий список было не попасть — он закрывался
   вместе со старым узлом. */
function takeProgress(id, v) {
  const pct = Math.max(0, Math.min(1, v));
  takePct.set(id, pct);
  const box = document.querySelector(`[data-media="${id}"]`);
  if (!box) return;                       // не на экране — просто запомнили
  const bar = box.querySelector("i");
  const cap = box.querySelector("span");
  if (bar) bar.style.width = Math.max(4, Math.round(pct * 100)) + "%";
  if (cap) cap.textContent = cap.dataset.what + " загружается · " + Math.round(pct * 100) + "%";
}

async function takesBox() { return await caches.open(TAKE_CACHE); }

async function takeSave(id, blob) {
  const box = await takesBox();
  await box.put(takeKey(id), new Response(blob, { headers: { "Content-Type": blob.type || "audio/mp4" } }));
  takeUrls.set(id, URL.createObjectURL(blob));
}

async function takeLoadAll() {
  if (!window.caches) return;
  try {
    const box = await takesBox();
    for (const req of await box.keys()) {
      const id = decodeURIComponent(req.url.split("/").pop());
      if (takeUrls.get(id)) continue;
      const res = await box.match(req);
      if (res) takeUrls.set(id, URL.createObjectURL(await res.blob()));
    }
  } catch {}
}

// гист под записи заводим отдельный и только когда он реально понадобился
async function ensureTakesGist() {
  if (data && data.takesId) { cfg.takesId = data.takesId; return data.takesId; }
  if (cfg.takesId) { if (data) { data.takesId = cfg.takesId; saveData(); } return cfg.takesId; }
  if (!cfg.token) return "";
  const r = await gh("/gists", {
    method: "POST",
    body: JSON.stringify({
      description: "Кэйко — записи собственной игры",
      public: false,
      files: { "readme.txt": { content: "Записи из приложения Кэйко. Не удалять." } }
    })
  });
  if (!r.ok) return "";
  cfg.takesId = (await r.json()).id; saveCfg();
  if (data) { data.takesId = cfg.takesId; saveData(); schedulePush(); }
  return cfg.takesId;
}

async function takePush(id, blob) {
  const gid = await ensureTakesGist();
  if (!gid) return;
  const uri = await new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(blob); });
  await gh("/gists/" + gid, {
    method: "PATCH",
    body: JSON.stringify({ files: { [TAKE_FILE(id)]: { content: uri } } })
  });
}

async function takePull(id) {
  const gid = (data && data.takesId) || cfg.takesId;
  if (!cfg.token || !gid || takeUrls.has(id) || takeBusy.has(id)) return;
  const failedAt = takeFail.get(id) || 0;
  if (now() - failedAt < 20000) return;          // сорвалось только что — подождём
  takeBusy.add(id);
  takeProgress(id, 0);
  try {
    const r = await gh("/gists/" + gid);
    if (!r.ok) { takePct.delete(id); takeFail.set(id, now()); return; }
    const f = (await r.json()).files[TAKE_FILE(id)];
    if (!f) { takePct.delete(id); takeFail.set(id, now()); return; }
    let txt = f.content;
    if (f.truncated && f.raw_url) {
      const res = await withTimeout(fetch(f.raw_url), 90000);
      txt = await readWithProgress(res, id, takeProgress);
    }
    txt = txt.trim();
    if (!txt.startsWith("data:")) return;
    takeProgress(id, 1);
    await takeSave(id, await (await fetch(txt)).blob());
    takePct.delete(id);
    render();
    takeFail.delete(id);
  } catch {
    takePct.delete(id); takeFail.set(id, now());
  } finally { takeBusy.delete(id); }
}

const takesFor = (srcId) => (data.takes || [])
  .filter(t => !t.deleted && t.srcId === srcId)
  .sort((a, b) => a.at - b.at);

/* Запись с микрофона. Safari пишет в audio/mp4 — тот же формат, что у
   остальных звуков, поэтому ничего перекодировать не нужно. */
const TAKE_MAX = 5 * 60 * 1000;          // пять минут — дальше автостоп
let rec = null, recStop = null;
let takeMute = false;     // пока пишем — фон молчит, иначе он попадёт в микрофон

function recMime() {
  const want = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
  for (const m of want) if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
  return "";
}
const canRecord = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

async function startTake(onTick, onLevel) {
  /* Раньше здесь стояло autoGainControl: false — «чтобы не портить музыку».
     На деле рояль в комнате пишется еле слышно: у телефона крошечный микрофон,
     и без автоусиления уровень остаётся на уровне шума. Возвращаем. */
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true }
  });
  const mime = recMime();
  const mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 96000 } : undefined);

  /* Индикатор уровня — отдельной веткой, в запись не вмешивается.
     Если полоска молчит, значит микрофон не слышит, а не «плохо записалось». */
  let actx = null, meter = 0;
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    await actx.resume();
    const an = actx.createAnalyser(); an.fftSize = 512;
    actx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    meter = setInterval(() => {
      an.getByteTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
      onLevel && onLevel(Math.min(1, peak / 90));
    }, 90);
  } catch {}

  const parts = [];
  mr.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
  const t0 = Date.now();
  const tick = setInterval(() => onTick && onTick(Date.now() - t0), 200);

  const done = new Promise(res => {
    mr.onstop = () => {
      clearInterval(tick);
      clearInterval(meter);
      try { actx && actx.close(); } catch {}
      stream.getTracks().forEach(t => t.stop());
      res({ blob: new Blob(parts, { type: mime || "audio/mp4" }), ms: Date.now() - t0 });
    };
  });
  mr.start();
  const auto = setTimeout(() => { try { mr.stop(); } catch {} }, TAKE_MAX);
  rec = mr;
  recStop = () => { clearTimeout(auto); try { mr.stop(); } catch {} };
  return done;
}

/* Снимок работы. Телефон отдаёт 3–4 МБ, поэтому ужимаем на месте:
   длинная сторона 1400 px этого достаточно, чтобы разглядеть штрих. */
function shrinkPhoto(file, max = 1400, q = 0.82) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => b ? res(b) : rej(new Error("не вышло")), "image/jpeg", q);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => rej(new Error("не картинка"));
    img.src = URL.createObjectURL(file);
  });
}

// снимок делаем системной камерой: свой интерфейс тут только помешал бы
function pickPhoto() {
  return new Promise((res) => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*";   // без capture iOS предложит и снять, и выбрать
    inp.style.display = "none";
    document.body.appendChild(inp);
    inp.addEventListener("change", () => {
      const f = inp.files && inp.files[0];
      inp.remove();
      res(f || null);
    }, { once: true });
    inp.click();
  });
}

async function addPhotoTake() {
  const f = await pickPhoto();
  if (!f) return;
  toast("Готовлю снимок…");
  try {
    const blob = await shrinkPhoto(f);
    await saveTake(blob, 0, "photo");
    render();
    toast("Снимок в «Достижениях» у материала");
  } catch { toast("Не получилось прочитать снимок"); }
}

async function saveTake(blob, ms, kind) {
  const id = uid();
  const t = { id, srcId: curKey(), track: data.active, kind: kind || "audio",
    title: currentMaterial().title, at: now(), ms: Math.round(ms || 0),
    createdAt: now(), updatedAt: now() };
  await takeSave(id, blob);
  data.takes = data.takes || [];
  data.takes.push(t);
  saveData(); schedulePush();
  takePush(id, blob).catch(() => {});     // в гист — фоном, без ожидания
  return t;
}

const COVER_CACHE = "keiko-covers-v1";
const coverKey = (id) => "keiko-cover/" + encodeURIComponent(id);

async function coversBox() { return await caches.open(COVER_CACHE); }

async function coverSave(id, dataUri) {
  const blob = await (await fetch(dataUri)).blob();
  const box = await coversBox();
  await box.put(coverKey(id), new Response(blob, { headers: { "Content-Type": blob.type || "image/jpeg" } }));
  coverCache.set(id, URL.createObjectURL(blob));
}

async function coverSaveBlob(id, blob) {
  const box = await coversBox();
  await box.put(coverKey(id), new Response(blob, { headers: { "Content-Type": blob.type || "image/jpeg" } }));
  coverCache.set(id, URL.createObjectURL(blob));
}

async function coverLoadAll() {
  if (!window.caches) return;
  try {
    const box = await coversBox();
    const keys = await box.keys();
    let n = 0;
    for (const req of keys) {
      const id = decodeURIComponent(req.url.split("/").pop());
      if (coverCache.get(id)) continue;
      const res = await box.match(req);
      if (!res) continue;
      coverCache.set(id, URL.createObjectURL(await res.blob()));
      n++;
    }
    // разовый переезд со старого места хранения
    Object.keys(CATALOG).forEach(id => {
      let old = null;
      try { old = localStorage.getItem(LS_COVER(id)); } catch {}
      if (old) { coverSave(id, old).then(render).catch(() => {}); try { localStorage.removeItem(LS_COVER(id)); } catch {} }
    });
    if (n) render();
  } catch {}
}

function coverSrc(id, fallback) {
  if (!id) return fallback || "";
  const c = catOf(id);
  if (!c || !c.cover) return fallback || "";
  const have = coverCache.get(id);
  if (have) return have;
  if (!coverCache.has(id)) { coverCache.set(id, ""); pullCover(id); }   // пока качаем — запасной файл
  return fallback || "";
}

// обложка любого материала — не зависит от активного трека
function coverOf(item) {
  if (item.track === "book") {
    const b = item.book || book();
    const src = coverSrc(b.id, b.cover);
    if (src) return `
      <div class="cover photo" style="aspect-ratio:${esc(b.ratio || "3 / 4.4")}">
        <img src="${esc(src)}" alt="" width="465" height="720" decoding="async" fetchpriority="high">
      </div>`;
    return `
      <div class="cover book ${esc(b.tone || "sea")}">
        <div><div class="cv-author">${esc(b.author || "")}</div></div>
        ${b.art === "wave" ? SEA_ART : b.art === "pine" ? PINE_ART : b.art === "quill" ? QUILL_ART : b.art === "lamp" ? LAMP_ART : `<div class="cv-mark">🦔</div>`}
        <div>
          <div class="cv-title">${esc(b.title)}</div>
          <div class="cv-sub">${esc(b.volume || "")}</div>
        </div>
      </div>`;
  }
  if (item.track === "watch") {
    const v = item.video || video();
    const src = watchThumb(v);
    /* Названия на обложке нет намеренно: в кадре ютуба почти всегда уже есть
       свой крупный текст, и подпись поверх него читается кашей.
       Название — под кружком прогресса. */
    return `
      <div class="cover-fit">
        <div class="cover clip ${src ? "photo" : "watch"}">
          ${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async">` : `<div class="cv-mark">🎬</div>`}
        </div>
      </div>`;
  }
  if (item.track === "pastel") {
    const c = data.pastel.course;
    // у курса обложка тоже может лежать в каталоге — раньше эту ветку пропускали
    const csrc = coverSrc("pastel", c.cover || "");
    if (csrc) return `
      <div class="cover photo titled" style="aspect-ratio:${esc(c.ratio || "3 / 4.1")}">
        <img src="${esc(csrc)}" alt="" loading="lazy" decoding="async">
        <div class="cv-over">
          <div class="cv-author">${esc(c.author || "курс")}</div>
          <div class="cv-title">${esc(c.name)}</div>
        </div>
      </div>`;
    return `
      <div class="cover pastel">
        <div><div class="cv-author">${esc(c.author || "")}</div></div>
        <div class="smears"><i></i><i></i><i></i><i></i></div>
        <div>
          <div class="cv-title">${esc(c.name)}</div>
          <div class="cv-sub">${c.lessons.length} уроков</div>
        </div>
      </div>`;
  }
  const p = item.piece;
  const psrc = coverSrc(p.id, p.cover);
  if (psrc) return `
    <div class="cover photo" style="aspect-ratio:${esc(p.ratio || "3 / 4.4")}">
      <img src="${esc(psrc)}" alt="" width="509" height="720" decoding="async" fetchpriority="high">
    </div>`;
  return `
    <div class="cover piano ${esc(p.tone || "violet")}">
      <div><div class="cv-author">${esc(p.author || "")}</div></div>
      ${p.art === "wave" ? WAVE_ART : KEYS_ART}
      <div>
        <div class="cv-title">${esc(p.name)}</div>
        <div class="cv-sub">${p.bars} тактов</div>
      </div>
    </div>`;
}

/* ── Подложка под цвет обложки ── */
// два пятна света на каждый тон: то же семейство цветов, что и у обложек
const TONES = {
  violet: ["139, 124, 246", "255, 157, 63"],
  sea:    ["86, 160, 214", "120, 214, 196"],
  snow:   ["132, 156, 204", "170, 190, 224"],
  night:  ["108, 132, 186", "196, 168, 120"],
  wine:   ["214, 96, 116", "255, 170, 90"],
  forest: ["86, 190, 140", "72, 150, 186"],
  pastel: ["230, 140, 180", "255, 201, 77"]
};

function toneOf(item) {
  if (!item) return "violet";
  if (item.track === "pastel") return "pastel";
  if (item.track === "book") return (item.book || book()).tone || "sea";
  return (item.piece || piece()).tone || "violet";
}

let bgLayer = 0;
/* Цвет подложки берём из самой обложки: раскладываем картинку на 24×24,
   считаем корзины по цвету и выбираем самую заметную — частую и живую. */
const coverTones = new Map();

// подчищаем тона, посчитанные прошлой версией алгоритма
try { Object.keys(localStorage).forEach(k => { if (k.startsWith("keiko-tone-")) localStorage.removeItem(k); }); } catch {}

function readCoverTones(url) {
  if (coverTones.has(url)) return coverTones.get(url);
  coverTones.set(url, null);                       // чтобы не считать дважды

  try { const saved = JSON.parse(localStorage.getItem("keiko-tone2-" + url) || "null");
    if (saved) { coverTones.set(url, saved); return saved; } } catch {}

  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    try {
      const N = 24;
      const cv = document.createElement("canvas");
      cv.width = cv.height = N;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, N, N);
      const d = ctx.getImageData(0, 0, N, N).data;

      const box = new Map();
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        const cur = box.get(key) || { n: 0, r: 0, g: 0, b: 0 };
        cur.n++; cur.r += r; cur.g += g; cur.b += b;
        box.set(key, cur);
      }

      // оцениваем каждую корзину: частота, насыщенность и «не слишком тёмная»
      const score = (c) => {
        const r = c.r / c.n, g = c.g / c.n, b = c.b / c.n;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const sat = mx ? (mx - mn) / mx : 0;
        const lum = (mx + mn) / 510;
        const fit = lum > 0.12 && lum < 0.92 ? 1 : 0.25;
        return { s: c.n * (0.25 + sat * 1.6) * fit, r, g, b, sat, lum };
      };
      const ranked = [...box.values()].map(score).sort((a, b) => b.s - a.s);
      if (!ranked.length) return;

      // от обложки берём оттенок, а яркость и живость задаём сами:
      // тёмно-фиолетовый корешок сам по себе на тёмном фоне не виден
      const toHsl = (r, g, b) => {
        r /= 255; g /= 255; b /= 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
        let h = 0;
        if (d) h = 60 * (mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4);
        const l = (mx + mn) / 2;
        return { h, s: d ? d / (1 - Math.abs(2 * l - 1)) : 0, l };
      };
      const toRgb = (h, s, l) => {
        const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
        const v = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
                : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
        return v.map(n => Math.round((n + m) * 255)).join(", ");
      };
      const glow = (c, l) => {
        const t = toHsl(c.r, c.g, c.b);
        const s = t.s < 0.07 ? 0.06 : Math.min(0.72, Math.max(0.4, t.s));
        return toRgb(t.h, s, l);
      };

      const main = ranked[0];
      const hue = (c) => toHsl(c.r, c.g, c.b).h;
      const dh = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
      // второй цвет — заметно другого оттенка, иначе просто светлее первого
      const other = ranked.find(c => c.s > main.s * 0.12 && dh(hue(c), hue(main)) > 35);
      const pair = [glow(main, 0.58), other ? glow(other, 0.62) : glow(main, 0.72)];

      coverTones.set(url, pair);
      try { localStorage.setItem("keiko-tone2-" + url, JSON.stringify(pair)); } catch {}
      paintBackdrop(lastPainted);                  // перекрашиваем, когда цвет посчитан
    } catch {}
  };
  img.src = url;
  return null;
}

let lastPainted = null;
let bgTone = null;      // цвет верхнего фона — волны берут его же, чтобы не спорить

function paintBackdrop(item) {
  const layers = document.querySelectorAll(".bgfx i");
  if (layers.length < 2 || !item) return;
  lastPainted = item;

  const src = item.track === "book" ? (item.book || book()) : item.track === "piano" ? (item.piece || piece()) : null;
  const fromCover = src && src.cover ? readCoverTones(src.cover) : null;
  const [c1, c2] = fromCover || TONES[toneOf(item)] || TONES.violet;
  bgTone = String(c1).split(",").map(n => +n || 0);      // им же красим волны
  const css =
    `radial-gradient(980px 560px at 78% -12%, rgba(${c1}, 0.32), transparent 62%),` +
    `radial-gradient(760px 460px at -6% 4%, rgba(${c2}, 0.18), transparent 58%),` +
    `radial-gradient(760px 420px at 52% 110%, rgba(${c1}, 0.16), transparent 60%)`;

  if (layers[bgLayer].style.backgroundImage === css) return;   // тот же тон — не трогаем
  const next = layers[bgLayer ^ 1];
  next.style.backgroundImage = css;
  next.classList.add("on");
  layers[bgLayer].classList.remove("on");
  bgLayer ^= 1;
}

const RAIL_COPIES = 5;   // копии ленты для бесшовного цикла
const RAIL_MID = 2;      // рабочая копия — центральная

// лента бесконечная: рендерим несколько копий и незаметно возвращаемся в середину
// ключ материала карточки ленты — совпадает с ключом, по которому лежит звук
const railKey = (it) => it.track === "book" ? it.bookId
  : it.track === "pastel" ? "pastel" : it.pieceId;

function coverRailHTML() {
  const items = railItems();
  const n = items.length;
  const idx = activeRailIndex(items);
  let html = "";
  for (let copy = 0; copy < RAIL_COPIES; copy++) {
    items.forEach((it, i) => {
      const on = copy === RAIL_MID && i === idx;
      html += `<div class="slot ${on ? "on" : ""}" data-i="${i}" data-pos="${copy * n + i}">${coverOf(it)}`
        + `<span class="cov-snd" data-snd="${esc(railKey(it))}" role="button" aria-label="Музыка грузится">`
        + `<svg viewBox="0 0 36 36" aria-hidden="true">`
        + `<circle class="sn-track" cx="18" cy="18" r="15"></circle>`
        + `<circle class="sn-bar" cx="18" cy="18" r="15"></circle></svg><i>♪</i></span></div>`;
    });
  }
  return `<div class="rail" id="rail">${html}</div>`;
}

function ringHTML(pct) {
  const r = 52, c = 2 * Math.PI * r;
  const on = c * Math.min(1, pct / 100);
  return `
    <div class="ring-wrap">
      <svg class="ring" width="128" height="128" viewBox="0 0 128 128">
        <circle class="bg" cx="64" cy="64" r="${r}"></circle>
        ${pct > 0 ? `<circle class="fg" cx="64" cy="64" r="${r}" stroke-dasharray="${on.toFixed(1)} ${c.toFixed(1)}"></circle>` : ""}
      </svg>
      <div class="ring-txt"><b>${Math.round(pct)}%</b></div>
    </div>`;
}

/* Подпись под названием ломается по разделителю «·», а не посреди фразы:
   «осталось 464 страницы» уходит на новую строку целиком */
const subLine = (...parts) => parts.filter(Boolean)
  .map((p, i, a) => `<span class="sub-part">${p}${i < a.length - 1 ? " ·" : ""}</span>`)
  .join(" ");

function heroSub(s) {
  if (isBook()) return subLine(esc(s.chapter.name), `осталось ${stranic(s.pages - s.page)}`);
  if (isWatch()) return subLine(esc(video().author || "видео"), s.watched ? "посмотрено" : "ещё не смотрел");
  if (isCourse()) return subLine(`${s.done} из ${s.lessons} уроков`, `${s.minutes} мин пройдено`);
  return subLine(`𝄞 ${Math.round(s.pctR)}%`, `𝄢 ${Math.round(s.pctL)}%`);
}

function renderHome() {
  if (!hasMaterials()) { renderEmpty("Здесь появятся материалы", "Пока не добавлено ни одного: ни пьесы, ни книги, ни курса."); return; }
  const s = curStats();
  const g = goalProgress();
  const st = s.streakAll;
  const doneToday = !!entryFor(todayStr());
  const ach = achState();
  const open = ach.filter(a => a.done).length;

  const sub = heroSub(s);

  const freeze = activeFreeze();
  const nudge = freeze
    ? `🌴 Пауза до <b>${fmtRange(freeze.to, freeze.to)}</b> — серия сохранится`
    : "";

  $("#view").innerHTML = `
    <div class="hero">
      ${coverRailHTML()}
      ${ringHTML(shownPct(s))}
      <div class="hero-title">
        <h2>${isBook() ? esc(book().title) : isWatch() ? esc(video().title) : isCourse() ? esc(course().name) : esc(piece().name)}</h2>
        <p>${sub}</p>
        ${paceHTML()}
      </div>
      <div class="cta-row">
      <button class="cta ${!gistReady() ? "locked" : doneToday ? "done" : ""}" id="ctaBtn" type="button">
        ${!gistReady()
          ? "🔒 Подключить синхронизацию"
          : doneToday
            ? `<span class="cta-ok">${T("ctaDone")}</span><span class="cta-add">${isPiano() && piece().bars ? T("ctaAgain") : T("ctaAdd")}</span>`
            : (isBook() ? T("ctaBook") : isWatch() ? T("ctaWatch") : isPastel() && lessons().length ? T("ctaLesson") : isCourse() ? T("ctaPastel") : T("ctaPiano"))}
      </button>
      </div>
      <div class="nudge">${nudge}</div>
    </div>`;

  $("#ctaBtn").addEventListener("click", () => {
    if (!gistReady()) { openSettingsSheet(); return; }
    selectedDate = todayStr();
    /* У пьесы кнопка открывает занятие по плану: оно само поставит отметку
       в конце. Ручной путь остаётся на «дополнить», когда день уже отмечен. */
    /* У пьесы кнопка всегда ведёт в занятие — и когда день ещё не отмечен,
       и когда уже отмечен: второе занятие за день это нормально, отрезки
       допишутся в ту же запись. Ручная шторка остаётся у остальных треков. */
    if (isPiano() && piece().bars) { openPractice(); return; }
    if (isPastel() && lessons().length) { openLesson(); return; }
    openLogSheet();
  });

  paintBackdrop(railItems()[activeRailIndex(railItems())]);
  setupRail();
  bindRingTaps();
}

/* Спрятанный жест вместо кнопки: касание процента в центре кольца — и лента
   сама прокрутит, чем заняться. Ничего лишнего на экране.
   Ловим касание, а не клик: защита от зума гасит быстрые повторные тапы. */
let ringFired = 0;

function bindRingTaps() {
  const ring = $(".ring-wrap");
  if (!ring || railItems().length < 2) return;

  const tap = () => {
    const t = Date.now();
    if (t - ringFired < 4000) return;         // пока лента едет, повторное касание не считаем
    ringFired = t;
    if (navigator.vibrate) navigator.vibrate(20);
    rollDice();
  };

  // pointerdown ловит и палец, и мышь; touchstart — страховка для старых Safari
  if (window.PointerEvent) ring.addEventListener("pointerdown", tap);
  else { ring.addEventListener("touchstart", tap, { passive: true }); ring.addEventListener("click", tap); }
}

/* Карусель: центрируем активную обложку и слушаем свайп */
let railApi = null;   // доступ к прокрутке ленты извне (сегмент, кубик)

function setupRail() {
  const rail = $("#rail");
  if (!rail) return;
  const slots = [...rail.querySelectorAll(".slot")];
  if (!slots.length) return;

  const items = railItems();
  const n = items.length;

  const pad = Math.max(0, (rail.clientWidth - slots[0].offsetWidth) / 2);
  rail.style.paddingLeft = pad + "px";
  rail.style.paddingRight = pad + "px";

  const centerOfSlot = (el) => {
    const r = el.getBoundingClientRect(), rr = rail.getBoundingClientRect();
    return r.left - rr.left + rail.scrollLeft + r.width / 2;
  };
  const targetFor = (pos) => centerOfSlot(slots[pos]) - rail.clientWidth / 2;

  const nearestPos = () => {
    const mid = rail.scrollLeft + rail.clientWidth / 2;
    let best = 0, bestDist = Infinity;
    slots.forEach((el, i) => {
      const d = Math.abs(centerOfSlot(el) - mid);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    return best;
  };

  // переносимся в среднюю копию, только когда подошли к краю ленты:
  // каждый лишний перенос сдвигает scrollLeft и сбивает доводку свайпа
  const normalize = (pos) => {
    if (pos >= n && pos < slots.length - n) return pos;
    const target = RAIL_MID * n + ((pos % n) + n) % n;
    if (target !== pos) {
      const delta = targetFor(target) - targetFor(pos);
      const snap = rail.style.scrollSnapType;
      rail.style.scrollSnapType = "none";
      rail.scrollLeft += delta;
      rail.style.scrollSnapType = snap;
    }
    return target;
  };

  let spinning = false;
  let touching = false;   // палец на ленте — доводку не начинаем

  const settle = () => {
    if (spinning || touching) return;
    const pos = normalize(nearestPos());
    slots.forEach((el, i) => el.classList.toggle("on", i === pos));
    paintBackdrop(items[pos % n]);
    setActiveMaterial(items[pos % n]);
    releaseRail();
  };

  // ждём настоящей остановки: пока позиция меняется, ничего не трогаем
  let idleTimer = null;
  const settleWhenIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (spinning) return;
      const before = rail.scrollLeft;
      setTimeout(() => {
        if (spinning) return;
        if (touching || Math.abs(rail.scrollLeft - before) > 0.5) { settleWhenIdle(); return; }
        settle();
      }, 90);
    }, 110);
  };

  // программная центровка сразу применяет материал — не ждём событий скролла
  const centerOn = (pos, smooth) => {
    if (!slots[pos]) return;
    clearTimeout(idleTimer);
    rail.scrollTo({ left: targetFor(pos), behavior: smooth ? "smooth" : "auto" });
    slots.forEach((el, i) => el.classList.toggle("on", i === pos));
    paintBackdrop(items[pos % n]);
    setActiveMaterial(items[pos % n]);
  };

  // кубик: лента разгоняется, прокручивает несколько обложек и плавно тормозит
  const spinTo = (baseIdx, done) => {
    if (spinning) return;
    const cur = nearestPos();
    // цель — на пару оборотов вперёд, чтобы обложки успели промелькнуть
    let pos = baseIdx;
    while (pos < cur + n * 2) pos += n;
    while (pos >= slots.length) pos -= n;
    if (pos <= cur) pos += n;

    const from = rail.scrollLeft;
    const to = targetFor(pos);
    if (Math.abs(to - from) < 2) { settle(); done && done(); return; }

    spinning = true;
    clearTimeout(idleTimer);
    rail.style.scrollSnapType = "none";
    rail.style.scrollBehavior = "auto";

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(guard);
      rail.scrollLeft = to;                    // точная доводка без рывка
      rail.style.scrollSnapType = "x mandatory";
      rail.style.scrollBehavior = "";
      spinning = false;
      const fixed = normalize(pos);
      slots.forEach((el, i) => el.classList.toggle("on", i === fixed));
      setActiveMaterial(items[fixed % n]);
      releaseRail();
      done && done();
    };

    // страховка: если кадры не идут (вкладка в фоне), доводим результат сами
    const guard = setTimeout(finish, 3600);

    const t0 = performance.now(), dur = 2600;
    const ease = k => 1 - Math.pow(1 - k, 5);   // долгий разгон и мягкое торможение
    const step = (now) => {
      if (finished) return;
      const k = Math.min(1, (now - t0) / dur);
      rail.scrollLeft = from + (to - from) * ease(k);
      if (k < 1) requestAnimationFrame(step); else finish();
    };
    requestAnimationFrame(step);
  };

  railApi = {
    centerOn: (baseIdx, smooth) => centerOn(baseIdx + RAIL_MID * n, smooth),
    spinTo,
    indexOfTrack: (track) => items.findIndex(it => it.track === track),
    indexOf: (track, id) => items.findIndex(it =>
      it.track === track && (!id || it.pieceId === id || it.bookId === id))
  };

  centerOn(activeRailIndex(items) + RAIL_MID * n, false);
  if (n < 2) return;

  // фон догоняет обложку прямо в движении, но не чаще кадра и только при смене обложки —
  // иначе кроссфейд перезапускается десятки раз за свайп и экран мерцает
  let bgIdx = -1, bgTick = false, bgFallback = null;
  const followBackdrop = () => {
    if (bgTick) return;
    bgTick = true;
    const run = () => {
      if (!bgTick) return;
      bgTick = false;
      clearTimeout(bgFallback);
      const i = nearestPos() % n;
      if (i === bgIdx) return;
      bgIdx = i;
      paintBackdrop(items[i]);
    };
    requestAnimationFrame(run);
    bgFallback = setTimeout(run, 140);   // если кадры не идут (вкладка в фоне) — не залипаем
  };

  rail.addEventListener("touchstart", () => { touching = true; markRailBusy(); }, { passive: true });
  ["touchend", "touchcancel"].forEach(ev =>
    rail.addEventListener(ev, () => { touching = false; settleWhenIdle(); }, { passive: true }));

  rail.addEventListener("scroll", () => {
    if (!spinning) markRailBusy();
    followBackdrop();
    settleWhenIdle();
  }, { passive: true });
  if ("onscrollend" in rail) rail.addEventListener("scrollend", () => { if (!spinning) settle(); });

  slots.forEach((el, i) => el.addEventListener("click", () => {
    if (!el.classList.contains("on")) centerOn(i, true);
  }));
}

// смена материала без перерисовки ленты
function setActiveMaterial(item) {
  if (!item) return;
  const same = data.active === item.track &&
    (item.track !== "piano" || data.piano.activePiece === item.pieceId) &&
    (item.track !== "book" || data.book.activeBook === item.bookId) &&
    (item.track !== "watch" || data.watch.activeVideo === item.videoId);
  if (same) return;

  data.active = item.track;
  if (item.pieceId) data.piano.activePiece = item.pieceId;
  if (item.bookId) data.book.activeBook = item.bookId;
  if (item.videoId) data.watch.activeVideo = item.videoId;
  /* Пауза погружения держалась на всё приложение: тапнул один раз — и следующие
     три минуты музыка не включалась ни на одном материале. Но смена обложки —
     это новое намерение, поэтому пауза снимается вместе с ней. */
  zenHold = 0;
  zenArm();
  paintBackdrop(item);
  pending = []; pickLessons = []; pickSpans = [];
  selectedDate = todayStr();
  syncPickers();
  saveData();
  schedulePush();
  updateHeroInfo();
  updateAchBadge();   // таббар целиком не перерисовываем: он бы мигал на каждом свайпе
  audioSync();        // лента меняет материал мимо render(), иначе звук остался бы прежним
  paintSndBtn();      // нота держится угла активной обложки
}

// счётчик открытых наград в таббаре — меняем только цифру
function updateAchBadge() {
  const b = document.querySelector('#tabbar button[data-tab="ach"]');
  if (!b) return;
  const open = achMaterials().reduce((n, m) => n + m.open, 0);
  const txt = [...b.childNodes].find(x => x.nodeType === 3);
  if (txt) txt.nodeValue = `${T("tabAch")} ${open}`;
}

function updateHeroInfo() {
  const s = curStats();
  const doneToday = !!entryFor(todayStr());

  // содержимое кольца меняем внутри элемента: пересоздание запускало анимацию появления заново
  const ring = $(".ring-wrap");
  if (ring) {
    const tmp = document.createElement("div");
    tmp.innerHTML = ringHTML(shownPct(s));
    ring.innerHTML = tmp.firstElementChild.innerHTML;
  }

  const title = $(".hero-title");
  if (title) title.innerHTML = `
    <h2>${isBook() ? esc(book().title) : isWatch() ? esc(video().title) : isCourse() ? esc(course().name) : esc(piece().name)}</h2>
    <p>${heroSub(s)}</p>
    ${paceHTML()}`;

  const cta = $("#ctaBtn");
  if (cta) {
    cta.classList.toggle("locked", !gistReady());
    cta.classList.toggle("done", gistReady() && doneToday);
    cta.innerHTML = !gistReady()
      ? "🔒 Подключить синхронизацию"
      : doneToday
        ? `<span class="cta-ok">${T("ctaDone")}</span><span class="cta-add">${isPiano() && piece().bars ? T("ctaAgain") : T("ctaAdd")}</span>`
        : (isBook() ? T("ctaBook") : isWatch() ? T("ctaWatch") : isPastel() && lessons().length ? T("ctaLesson") : isCourse() ? T("ctaPastel") : T("ctaPiano"));
  }

  const nudge = $(".nudge");
  if (nudge) {
    const freeze = activeFreeze();
    nudge.innerHTML = freeze
      ? `🌴 Пауза до <b>${fmtRange(freeze.to, freeze.to)}</b> — серия сохранится`
      : "";
  }
}
function barMap(arr, cls) {
  const bars = piece().bars;
  let cells = "";
  for (let b = 1; b <= bars; b++) {
    const n = arr[b] || 0;
    const lvl = n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : 3;
    cells += `<i class="bar l${lvl} ${cls}${b % 10 === 0 && b !== bars ? " tick" : ""}" title="Такт ${b}: ${n} ${plural(n, "проход", "прохода", "проходов")}"></i>`;
  }
  return `<div class="bar-strip" style="--n:${bars}">${cells}</div>`;
}

// активность по дням недели: сколько занятий в каждый день (все хобби)
function weekDots() {
  const monday = mondayOf(new Date());
  const all = [...data.piano.entries, ...data.book.entries, ...data.pastel.entries, ...watchEntries()].filter(e => !e.deleted);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(d.getDate() + i);
    const ds = dateStr(d);
    const cnt = new Set(all.filter(e => e.date === ds).map(e => e.date + (e.pieceId || e.bookId || e.courseId || ""))).size;
    out.push({ ds, dow: DOW[i], count: cnt, future: ds > todayStr(), today: ds === todayStr(), frozen: isFrozen(ds) });
  }
  return out;
}

// всё сделанное за отрезок дат: дни, такты, страницы, уроки
function rangeStats(from, to) {
  const inRange = e => !e.deleted && e.date >= from && e.date <= to;

  const piano = data.piano.entries.filter(inRange);
  const barSet = new Set();          // разные такты, а не сумма повторов
  for (const e of piano)
    for (const sp of e.spans || [])
      for (let i = Math.max(1, sp.from); i <= sp.to; i++) barSet.add(i);
  const bars = barSet.size;

  const bookList = data.book.entries.filter(inRange);
  const pages = pagesRead(from, to);

  const pastel = data.pastel.entries.filter(inRange);
  let lessons = 0;
  for (const e of pastel) lessons += (e.lessons || []).length;

  const watchList = watchEntries().filter(inRange);
  const watched = watchList.length;

  const days = new Set([...piano, ...bookList, ...pastel, ...watchList].map(e => e.date)).size;
  const tracks = new Set([
    ...(piano.length ? ["piano"] : []),
    ...(bookList.length ? ["book"] : []),
    ...(pastel.length ? ["pastel"] : []),
    ...(watchList.length ? ["watch"] : [])
  ]);
  return { days, bars, pages, lessons, watched, tracks,
           entries: piano.length + bookList.length + pastel.length + watchList.length };
}

/* ── Сколько ещё занятий до конца материала ──
   Считаем по последним сессиям: сколько единиц (тактов, страниц, уроков)
   прибавлялось за раз, и делим на остаток. */
function paceForecast() {
  const list = entries().slice().sort((a, b) => a.date < b.date ? -1 : 1);
  if (!list.length) return null;

  // прогресс в единицах на конец каждой сессии
  let marks = [], unit = "", total = 0;

  if (isBook()) {
    const b = book();
    total = b.pages;
    unit = "page";
    let page = b.startPage || 0;
    for (const e of list) { page = Math.max(page, e.page || 0); marks.push(page); }
    marks.unshift(b.startPage || 0);
  } else if (isWatch()) {
    return null;
  } else if (isCourse()) {
    total = course().lessons.length;
    unit = "lesson";
    const seen = new Set();
    marks.push(0);
    for (const e of list) { for (const i of e.lessons || []) seen.add(i); marks.push(seen.size); }
  } else {
    /* Такт не выучивается с одного касания: к нему возвращаются. Поэтому цель —
       не «задеть все такты», а пройти каждый FIRM_AT раз. Иначе срок выходил
       втрое оптимистичнее правды. */
    const bars = piece().bars;
    total = bars * 2 * FIRM_AT;             // каждая рука отдельно, каждая — по FIRM_AT проходов
    unit = "bar";
    const r = new Array(bars + 1).fill(0), l = new Array(bars + 1).fill(0);
    marks.push(0);
    for (const e of list) {
      for (const sp of e.spans || []) {
        const arr = sp.hand === "left" ? l : r;
        for (let i = Math.max(1, sp.from); i <= Math.min(bars, sp.to); i++) arr[i]++;
      }
      let n = 0;
      for (let i = 1; i <= bars; i++) n += Math.min(r[i], FIRM_AT) + Math.min(l[i], FIRM_AT);
      marks.push(n);
    }
  }

  const done = marks[marks.length - 1];
  const left = Math.max(0, total - done);
  if (!left) return { left: 0, sessions: 0, pace: 0, unit, done: true };

  // средний прирост за последние сессии (берём до пяти, нули не считаем)
  const gains = [];
  for (let i = marks.length - 1; i > 0 && gains.length < 8; i--) {
    const g = marks[i] - marks[i - 1];
    if (g > 0) gains.push(g);
  }
  if (!gains.length) return null;

  // медиана устойчивее среднего: один марафон на полкниги не должен задирать прогноз
  const sorted = gains.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const pace = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { left, pace, sessions: Math.max(1, Math.ceil(left / pace)), unit, done: false };
}

/* Чем дальше срок, тем грубее формулировка: точная дата через два месяца —
   ложная точность, погрешность там всё равно в неделях. */
const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря"];

function humanWhen(d, days) {
  const gen = MONTHS_GEN[d.getMonth()];
  const year = d.getFullYear() !== new Date().getFullYear() ? " " + d.getFullYear() : "";

  if (days <= 7) return "закончишь на этой неделе";
  if (days <= 24) return `примерно к ${d.getDate()} ${gen}`;
  const part = d.getDate() <= 10 ? "началу" : d.getDate() <= 20 ? "середине" : "концу";
  return `примерно к ${part} ${gen}${year}`;
}

// короткая строка прогноза: «≈ 12 занятий · примерно до 5 октября»
function paceHTML() {
  const f = paceForecast();
  if (!f) return "";
  if (f.done) return `<span class="pace">Материал пройден 🎉</span>`;

  // прикидка от спокойного ритма: занимаешься через день — вот и срок.
  // Пропустил — назавтра дата сдвинется, и это нормально
  const days = f.sessions * 2;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `<span class="pace">${subLine(
    `≈ ${f.sessions} ${plural(f.sessions, "занятие", "занятия", "занятий")}`,
    `в таком темпе ${humanWhen(d, days)}`
  )}</span>`;
}

// границы текущего периода — вся неделя или весь месяц
function periodRange() {
  const d = new Date();
  if (period === "month") {
    return {
      from: dateStr(new Date(d.getFullYear(), d.getMonth(), 1)),
      to: dateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0))
    };
  }
  const monday = mondayOf(d);
  const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6);
  return { from: dateStr(monday), to: dateStr(sunday) };
}

// точки графика: вся текущая неделя или весь месяц, включая дни впереди
function periodSeries() {
  const out = [];
  const today = todayStr();

  if (period === "month") {
    const d = new Date();
    const total = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    for (let i = 1; i <= total; i++) {
      const ds = dateStr(new Date(d.getFullYear(), d.getMonth(), i));
      out.push({ ds, label: (i === 1 || i % 5 === 0) ? String(i) : "", value: rangeStats(ds, ds).entries,
        today: ds === today, frozen: isFrozen(ds), future: ds > today });
    }
    return out;
  }

  const monday = mondayOf(new Date());
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(d.getDate() + i);
    const ds = dateStr(d);
    out.push({ ds, label: DOW[i], value: rangeStats(ds, ds).entries,
      today: ds === today, frozen: isFrozen(ds), future: ds > today });
  }
  return out;
}

// плавная линия активности за выбранный период
function lineChartHTML(points) {
  const W = 320, H = 118, padX = 14, top = 16, bottom = 84;
  const max = Math.max(1, ...points.map(p => p.value));
  const n = points.length;
  const pts = points.map((p, i) => ({
    x: padX + (n > 1 ? i * (W - padX * 2) / (n - 1) : (W - padX * 2) / 2),
    y: bottom - (p.value / max) * (bottom - top),
    ...p
  }));

  let path = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i], p1 = pts[i + 1];
    const cx = (p0.x + p1.x) / 2;
    path += ` C ${cx.toFixed(1)} ${p0.y.toFixed(1)}, ${cx.toFixed(1)} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }
  const area = `${path} L ${pts[pts.length - 1].x.toFixed(1)} ${bottom + 2} L ${pts[0].x.toFixed(1)} ${bottom + 2} Z`;
  const dotEvery = n > 14 ? Math.ceil(n / 14) : 1;

  return `
    <div class="wline">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <defs>
          <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--gold)" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="var(--gold)" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <line x1="${padX}" y1="${bottom + 2}" x2="${W - padX}" y2="${bottom + 2}" stroke="rgba(255,255,255,0.08)"/>
        <path d="${area}" fill="url(#lineFill)"/>
        <path d="${path}" fill="none" stroke="var(--gold)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        ${pts.map((p, i) => (i % dotEvery === 0 || p.today) ? `
          <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.today ? 5 : 3.5}"
            fill="${p.value ? "var(--gold)" : "var(--bg)"}" stroke="${p.today ? "var(--ink)" : "var(--gold)"}" stroke-width="${p.today ? 2 : 1.4}"
            opacity="${p.future ? 0.35 : 1}"/>` : "").join("")}
      </svg>
      <div class="wl-days" style="grid-template-columns: repeat(${n}, 1fr)">
        ${pts.map(p => `<span class="${p.today ? "now" : ""} ${p.frozen ? "frz" : ""}">${esc(p.label || "")}</span>`).join("")}
      </div>
    </div>`;
}

// шапка «Прогресс»: неделя или месяц целиком
function summaryHTML() {
  const r = periodRange();
  const st = rangeStats(r.from, r.to);
  const g = goalProgress();
  const now = new Date();

  let ringVal, ringMax, cap, sub, hint;
  if (period === "month") {
    const total = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const left = total - now.getDate();
    const weeks = Math.round(total / 7);           // недель в месяце
    const monthGoal = (data.weekGoal || 4) * weeks; // цель месяца = недельная × недели
    ringVal = st.days; ringMax = monthGoal;
    cap = new Intl.DateTimeFormat("ru", { month: "long" }).format(now);
    sub = `из ${monthGoal} ${plural(monthGoal, "дня", "дней", "дней")} цели`;
    hint = ringVal >= monthGoal
      ? `Цель месяца взята! ${data.weekGoal} в неделю × ${weeks} ${plural(weeks, "неделя", "недели", "недель")}`
      : `Цель месяца: ${data.weekGoal} в неделю × ${weeks} ${plural(weeks, "неделя", "недели", "недель")} · впереди ${left} ${plural(left, "день", "дня", "дней")}`;
  } else {
    ringVal = g.days; ringMax = g.goal;
    cap = "Эта неделя";
    sub = `из ${g.goal} ${plural(g.goal, "дня", "дней", "дней")} цели`;
    hint = g.done
      ? "Цель недели закрыта — всё сверху в удовольствие"
      : `До цели ещё ${g.left} ${plural(g.left, "день", "дня", "дней")}`;
  }

  const R = 78, C = 2 * Math.PI * R;
  const on = C * Math.min(1, ringMax ? ringVal / ringMax : 0);
  const best = bestStreakAll();

  return `
    <div class="periods">
      ${[["week", "Неделя"], ["month", "Месяц"]].map(([k, t]) =>
        `<button class="pbtn ${period === k ? "on" : ""}" data-p="${k}" type="button">${t}</button>`).join("")}
    </div>

    <div class="summary">
      <div class="sum-ring">
        <svg viewBox="0 0 190 190">
          <circle class="bg" cx="95" cy="95" r="${R}"></circle>
          ${ringVal ? `<circle class="fg" cx="95" cy="95" r="${R}" stroke-dasharray="${on.toFixed(1)} ${C.toFixed(1)}"></circle>` : ""}
        </svg>
        <div class="sum-txt">
          <span class="sum-cap">${esc(cap)}</span>
          <b>${ringVal}</b>
          <span class="sum-sub">${esc(sub)}</span>
        </div>
      </div>

      <div class="sum-chips">
        <div class="sc ${best ? "hot" : ""}"><b>🔥 ${best}</b><span>${T("streak")}</span></div>
        <div class="sc"><b>${st.days}</b><span>${plural(st.days, "день", "дня", "дней")}</span></div>
        <div class="sc"><b>${st.bars}</b><span>${plural(st.bars, "такт", "такта", "тактов")}</span></div>
        <div class="sc"><b>${st.pages}</b><span>страниц</span></div>
        <div class="sc"><b>${st.lessons}</b><span>${plural(st.lessons, "урок", "урока", "уроков")}</span></div>
        ${st.watched ? `<div class="sc"><b>${st.watched}</b><span>${plural(st.watched, "ролик", "ролика", "роликов")}</span></div>` : ""}
      </div>

      ${lineChartHTML(periodSeries())}
      <div class="period-hint">${esc(hint)}</div>
    </div>`;
}

// серия одна на всё приложение: важно заниматься каждый день, а чем — не важно
const bestStreakAll = () => streakAll();

function renderEmpty(title, text) {
  $("#view").innerHTML = `
    <div class="empty-state">
      <div class="es-mark">稽古</div>
      <h2>${esc(title)}</h2>
      <p>${esc(text)}</p>
    </div>`;
}


/* ── Дни недели: сколько дел приходится на день в среднем ──
   Сумма по неделям обманывает: если в окне два воскресенья по одному делу,
   а суббота была одна, но насыщенная, воскресенье выходит «активнее».
   Поэтому делим на то, сколько раз этот день вообще случился. */
function weekProfileHTML() {
  const all = [...data.piano.entries, ...data.book.entries, ...data.pastel.entries, ...watchEntries()]
    .filter((e) => !e.deleted);
  if (all.length < 4) return "";

  const dates = [...new Set(all.map((e) => e.date))].sort();
  const first = dates[0], last = dates[dates.length - 1];

  const deeds = new Array(7).fill(0);
  for (const e of all) deeds[(fromStr(e.date).getDay() + 6) % 7]++;

  // сколько раз каждый день недели вообще выпал в окне наблюдения
  const times = new Array(7).fill(0);
  for (let d = fromStr(first); dateStr(d) <= last; d.setDate(d.getDate() + 1))
    times[(d.getDay() + 6) % 7]++;

  const avg = deeds.map((n, i) => times[i] ? n / times[i] : 0);
  const max = Math.max(...avg);
  if (!max) return "";
  const best = avg.indexOf(max);
  const days = daysBetween(first, last) + 1;
  const fmt = (v) => (Math.round(v * 10) / 10).toString().replace(".", ",");

  return `
    <div class="panel">
      <div class="sum-head">Дни недели</div>
      <div class="wk-prof">
        ${avg.map((v, i) => `
          <div class="wk-col ${i === best ? "top" : ""}">
            <span class="wk-bar" style="height:${Math.max(6, Math.round(v / max * 100))}%"></span>
            <b>${fmt(v)}</b>
            <em>${DOW[i]}</em>
          </div>`).join("")}
      </div>
      <p class="wk-note">Чаще всего — <b>${DOW_FULL[best]}</b>.
        <span style="color:var(--dim)">Сколько дел приходится на такой день в среднем.
        ${days < 21 ? "Данных пока мало — за " + days + " " + plural(days, "день", "дня", "дней") + ", картина ещё пляшет."
                    : "За " + days + " " + plural(days, "день", "дня", "дней") + "."}</span></p>
    </div>`;
}

/* ── Суточные циклы: когда в течение дня ты обычно занимаешься ──
   Берём время создания записи: отмечаешь обычно сразу после занятия,
   так что это лучший доступный слепок реального ритма. */
function dayCycleHTML() {
  const rows = [
    ["p", (data.piano.entries || [])],
    ["b", (data.book.entries || [])],
    ["c", (data.pastel.entries || [])],
    ["w", watchEntries()]
  ];
  const hours = Array.from({ length: 24 }, () => ({ p: 0, b: 0, c: 0, all: 0 }));
  let total = 0;
  for (const [key, list] of rows)
    for (const e of list) {
      if (!e || !e.createdAt || e.deleted) continue;
      const h = new Date(e.createdAt).getHours();
      hours[h][key]++; hours[h].all++; total++;
    }
  if (total < 3) return "";                       // пока не о чем говорить

  const max = Math.max(...hours.map(h => h.all)) || 1;
  // самое частое время — по трёхчасовому окну, одиночный час слишком капризен
  let bestH = 0, bestSum = -1;
  for (let h = 0; h < 24; h++) {
    const sum = hours[(h + 23) % 24].all + hours[h].all + hours[(h + 1) % 24].all;
    if (sum > bestSum) { bestSum = sum; bestH = h; }
  }
  const part = bestH < 5 ? "ночью" : bestH < 12 ? "утром" : bestH < 17 ? "днём" : bestH < 22 ? "вечером" : "поздним вечером";

  const bars = hours.map((h, i) => {
    const pct = h.all ? Math.max(9, h.all / max * 100) : 0;
    // цвет столбика — по тому треку, которого в этом часе больше
    const top = h.p >= h.b && h.p >= h.c ? "p" : h.b >= h.c ? "b" : "c";
    return `<i class="${h.all ? "on " + top : ""}" style="height:${pct}%"
      title="${i}:00 — ${h.all || 0}"></i>`;
  }).join("");

  return `
    <div class="panel">
      <div class="cal-head"><h3 style="margin:0">Сутки</h3>
        <span class="dc-note">чаще всего ${part}, около ${bestH}:00</span></div>
      <div class="dc-chart">${bars}</div>
      <div class="dc-axis"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>
      <div class="cal-legend">
        <span><i class="dot p"></i> пианино</span>
        <span><i class="dot b"></i> чтение</span>
        <span><i class="dot c"></i> пастель</span>
      </div>
    </div>`;
}

function renderProgress() {
  if (!hasMaterials()) { renderEmpty("Пока нечего показывать", "Как появятся материалы, здесь будет прогресс по неделям и месяцам."); return; }
  $("#view").innerHTML = `
    <div class="panel sum-panel">
      ${summaryHTML()}
    </div>

    ${weekProfileHTML()}
    ${dayCycleHTML()}

    <div class="panel">
      <div class="cal-head">
        <div class="cal-title" id="calTitle"></div>
        <div class="cal-nav">
          <button id="calPrev" type="button">‹</button>
          <button id="calNext" type="button">›</button>
        </div>
      </div>
      <div class="cal-grid" id="calGrid"></div>
      <div class="cal-legend">
        <span><i class="dot p"></i> пианино</span>
        <span><i class="dot b"></i> чтение</span>
        <span><i class="dot c"></i> пастель</span>
        <span><i class="dot f"></i> пауза</span>
      </div>
    </div>

    <div class="panel">
      <div class="cal-head">
        <h3 style="margin:0">День</h3>
        <div class="day-nav">
          <button id="dayPrev" type="button">‹</button>
          <button class="cur" id="dayCur" type="button"></button>
          <button id="dayNext" type="button">›</button>
        </div>
      </div>
      <div id="dayBox"></div>
    </div>`;

  renderCalendar();
  renderDayBox();

  document.querySelectorAll(".pbtn").forEach(b =>
    b.addEventListener("click", () => {
      period = b.dataset.p;
      cfg.period = period; saveCfg();
      renderProgress();
    }));

  $("#calPrev").addEventListener("click", () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); });
  $("#calNext").addEventListener("click", () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); });
  $("#dayPrev").addEventListener("click", () => shiftDay(-1));
  $("#dayNext").addEventListener("click", () => shiftDay(1));
  $("#dayCur").addEventListener("click", () => goToDate(todayStr()));
}

// все записи всех хобби за дату — календарь и день теперь общие
function allEntriesOn(ds) {
  const out = [];
  for (const e of data.piano.entries.filter(e => !e.deleted && e.date === ds)) {
    const p = data.piano.pieces.find(x => x.id === (e.pieceId || "bwv853"));
    out.push({ track: "piano", icon: "🎹", title: p ? p.name : "Пианино", entry: e,
      what: (e.spans || []).length ? e.spans.map(spanText).join(" · ") : "занимался" });
  }
  for (const e of data.book.entries.filter(e => !e.deleted && e.date === ds)) {
    /* Раньше здесь стояло book() — АКТИВНАЯ книга, а не та, к которой относится
       запись. В дне и календаре чтение подписывалось тем, что открыто сейчас. */
    const b = (data.book.books || []).find(x => x.id === (e.bookId || "snow-1"));
    out.push({ track: "book", icon: "📖", bookId: e.bookId || "snow-1", title: b ? b.title : "Книга", entry: e,
      what: e.page ? `до ${e.page}-й стр.` : "читал" });
  }
  for (const e of data.pastel.entries.filter(e => !e.deleted && e.date === ds)) {
    out.push({ track: "pastel", icon: "🎨", title: (data.pastel.course || {}).name || "Курс", entry: e,
      what: (e.lessons || []).length ? `урок${e.lessons.length > 1 ? "и" : ""} ${e.lessons.map(i => i + 1).join(", ")}` : "занимался" });
  }
  for (const e of watchEntries().filter(e => !e.deleted && e.date === ds)) {
    const v = videos().find(x => x.id === e.videoId);
    out.push({ track: "watch", icon: "🎬", title: v ? v.title : "Видео", entry: e, what: "посмотрел" });
  }
  return out;
}

function historyHTML() {
  const hist = weeklyHistory(12);
  const max = Math.max(1, ...hist.map(h => h.days));
  const fmt = new Intl.DateTimeFormat("ru", { day: "numeric", month: "short" });
  const total = hist.reduce((a, h) => a + h.days, 0);

  return `
    <div class="hist">
      ${hist.map((h, i) => `
        <div class="hb" title="${fmt.format(fromStr(h.start))}: ${h.days} ${plural(h.days, "день", "дня", "дней")}">
          <i style="height:${Math.round(h.days / max * 100)}%"></i>
          <span>${i % 3 === 0 ? fmt.format(fromStr(h.start)).replace(/\s.*/, "") : ""}</span>
        </div>`).join("")}
    </div>
    <div class="hist-note">За 12 недель — <b>${total}</b> ${plural(total, "занятие", "занятия", "занятий")} по этому материалу</div>`;
}

function renderCalendar() {
  const first = new Date(calYear, calMonth, 1);
  const total = new Date(calYear, calMonth + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const today = todayStr();

  $("#calTitle").textContent = new Intl.DateTimeFormat("ru", { month: "long", year: "numeric" })
    .format(first).replace(" г.", "");

  let html = DOW.map(d => `<div class="dow">${d}</div>`).join("");
  for (let i = 0; i < lead; i++) html += `<div class="day blank"></div>`;

  for (let d = 1; d <= total; d++) {
    const ds = dateStr(new Date(calYear, calMonth, d));
    const on = allEntriesOn(ds);
    const tracks = new Set(on.map(x => x.track));
    let cls = "day";
    if (on.length) cls += " has";
    if (isFrozen(ds)) cls += " frozen";
    if (ds === today) cls += " today";
    if (ds === selectedDate) cls += " sel";
    if (ds > today) cls += " future";
    const dots = [...tracks].map(t => `<i class="dot ${t === "piano" ? "p" : t === "book" ? "b" : "c"}"></i>`).join("");
    html += `<div class="${cls}" data-date="${ds}"><b>${d}</b><span class="dots-row">${dots}</span></div>`;
  }
  $("#calGrid").innerHTML = html;

  document.querySelectorAll(".day[data-date]").forEach(el =>
    el.addEventListener("click", () => goToDate(el.dataset.date)));
}

function renderDayBox() {
  $("#dayCur").textContent = fmtDay(selectedDate);
  $("#dayNext").disabled = selectedDate >= todayStr();

  const list = allEntriesOn(selectedDate);
  const frozen = isFrozen(selectedDate);

  $("#dayBox").innerHTML = `
    ${frozen ? `<div class="day-freeze">🌴 Этот день в паузе — серию не рвёт</div>` : ""}
    ${list.length
      ? `<div class="day-list">${list.map(x => `
          <div class="rec">
            <span class="what">${x.icon} ${x.what}</span>
            <span class="note">${x.entry.note ? esc(x.entry.note) : esc(x.title)}</span>
            <button class="del" data-del="${x.entry.id}" data-track="${x.track}" type="button">✕</button>
          </div>`).join("")}</div>`
      : `<div class="empty">В этот день ничего не отмечено</div>`}
`;

  document.querySelectorAll("[data-del]").forEach(b =>
    b.addEventListener("click", () => {
      const track = b.dataset.track;
      const e = data[track].entries.find(x => x.id === b.dataset.del);
      if (!e) return;
      if (!confirm(`Удалить запись за ${fmtDay(e.date)}?\n\nПрогресс по этому дню пропадёт.`)) return;
      dropEntry(e, track);
      render();
      toast("Запись удалена");
    }));

}

// все материалы с их наградами — для входного списка
function achMaterials() {
  if (!hasMaterials() && !videos().length) return [];
  const save = data.active, savePiece = data.piano.activePiece, saveBook = data.book.activeBook;
  const out = [];

  for (const p of data.piano.pieces.filter(x => !x.archived)) {
    data.active = "piano"; data.piano.activePiece = p.id;
    const list = achState(); let f = factsState();
    out.push({ track: "piano", pieceId: p.id, icon: "🎹", title: p.name, sub: p.author,
      cover: coverSrc(p.id, p.cover || ""), ratio: p.ratio || "",
      open: list.filter(a => a.done).length, total: list.length,
      fOpen: f.filter(x => x.open).length, fTotal: f.length });
  }
  data.active = "book";
  for (const b of data.book.books.filter(x => !x.archived)) {
    data.book.activeBook = b.id;
    const l = achState(), fx = factsState();
    out.push({ track: "book", bookId: b.id, icon: "📖", title: b.title, sub: b.author,
      cover: coverSrc(b.id, b.cover || ""), ratio: b.ratio || "",
      open: l.filter(a => a.done).length, total: l.length,
      fOpen: fx.filter(x => x.open).length, fTotal: fx.length });
  }

  data.active = "pastel";
  let list = course().lessons.length ? achState() : []; let f = course().lessons.length ? factsState() : [];
  if (course().lessons.length)
    out.push({ track: "pastel", icon: "🎨", title: course().name, sub: course().author,
      cover: coverSrc("pastel", course().cover || ""), ratio: course().ratio || "",
      open: list.filter(a => a.done).length, total: list.length,
      fOpen: f.filter(x => x.open).length, fTotal: f.length });

  /* Завершённые видео остаются здесь: мысль о фильме приходит и после того,
     как он досмотрен, — а с главной он уже ушёл. */
  const saveVideo = data.watch.activeVideo;
  data.active = "watch";
  for (const v of videos().filter(x => !x.archived)) {
    data.watch.activeVideo = v.id;
    const l = achState(), fx = factsState();
    out.push({ track: "watch", videoId: v.id, icon: "🎬", title: v.title, sub: v.author,
      cover: watchThumb(v), ratio: "16 / 9", done: v.done,
      open: l.filter(a => a.done).length, total: l.length,
      fOpen: fx.filter(x => x.open).length, fTotal: fx.length });
  }
  data.watch.activeVideo = saveVideo;

  data.active = save; data.piano.activePiece = savePiece; data.book.activeBook = saveBook;
  return out;
}

// выполняет функцию в контексте выбранного материала
function withMaterial(view, fn) {
  const save = data.active, savePiece = data.piano.activePiece, saveBook = data.book.activeBook;
  const saveVideo = data.watch.activeVideo;
  data.active = view.track;
  if (view.track === "piano" && view.pieceId) data.piano.activePiece = view.pieceId;
  if (view.track === "book" && view.bookId) data.book.activeBook = view.bookId;
  if (view.track === "watch" && view.videoId) data.watch.activeVideo = view.videoId;
  const res = fn();
  data.active = save; data.piano.activePiece = savePiece; data.book.activeBook = saveBook;
  data.watch.activeVideo = saveVideo;
  return res;
}

// материал из achView мог остаться от другого профиля — тогда его тут нет
function viewMaterialExists(v) {
  if (!v || !v.track) return false;
  if (v.track === "book") return (data.book.books || []).some(b => b.id === v.bookId);
  if (v.track === "pastel") return !!(data.pastel && data.pastel.course);
  if (v.track === "watch") return videos().some(x => x.id === v.videoId);
  return (data.piano.pieces || []).some(p => p.id === v.pieceId);
}

function renderAch() {
  if (achView && !viewMaterialExists(achView)) { achView = null; cfg.achView = null; saveCfg(); }
  if (!achView) { renderAchList(); return; }
  if (achTab !== "facts" && achTab !== "takes") achTab = "ach";
  renderAchMaterial(achView);
}

// входной экран: материалы и сколько наград по каждому
function renderAchList() {
  if (achTop === "shelf") { renderShelfInto(); return; }
  if (!hasMaterials()) { renderEmpty("Достижений пока нет", "Они появятся вместе с первым материалом."); return; }
  const mats = achMaterials();

  $("#view").innerHTML = `
    ${achTopHTML()}
    <div class="mat-list">
      ${mats.map(m => `
        <button class="mat-card" data-track="${m.track}" data-piece="${m.pieceId || ""}" data-book="${m.bookId || ""}" type="button">
          <span class="mc-tile t-${m.track}"><i>${m.icon}</i></span>
          <span class="mc-body">
            <span class="mc-title">${esc(m.title)}</span>
            ${m.sub ? `<span class="mc-sub">${esc(m.sub)}</span>` : ""}
            <span class="mc-bar"><i style="width:${m.total ? m.open / m.total * 100 : 0}%"></i></span>
            <span class="mc-tags"><em>✦ ${m.open}/${m.total}</em><em>💡 ${m.fOpen}/${m.fTotal}</em></span>
          </span>
          <span class="mc-go">›</span>
        </button>`).join("")}
    </div>`;

  bindAchTop();
  document.querySelectorAll(".mat-card").forEach(b =>
    b.addEventListener("click", () => {
      achView = { track: b.dataset.track, pieceId: b.dataset.piece || null, bookId: b.dataset.book || null };
      cfg.achView = achView; saveCfg();
      renderAch();
      $("#view").scrollTop = 0;
    }));
}

// карточки знаний по материалу
/* Список записей материала: сверху самая свежая, ниже — как звучало раньше. */
function takesBlockHTML(view) {
  const src = view.pieceId || view.bookId || (view.track === "pastel" ? "pastel" : "");
  const list = takesFor(src).slice().reverse();
  const photo = view.track === "pastel";
  if (!list.length) return `
    <div class="empty-note">${photo
      ? "Снимков пока нет.<br>После занятия нажми 📷 — и увидишь, как менялась рука."
      : "Записей пока нет.<br>После занятия нажми 🎙 — и через месяцы услышишь разницу."}</div>`;

  const fmt = new Intl.DateTimeFormat("ru", { day: "numeric", month: "short", year: "numeric" });
  const ago = (t, i) => {
    if (i === 0) return "последняя";
    const d = Math.max(1, Math.round((list[0].at - t.at) / 864e5));
    return d + " " + plural(d, "день назад", "дня назад", "дней назад");
  };

  if (photo) return `
    <div class="tk-grid">${list.map((t, i) => {
      const url = takeUrls.get(t.id);
      if (!url) takePull(t.id);
      return `
        <figure class="tk-shot" ${url ? `data-shot="${esc(t.id)}"` : ""}>
          ${url ? `<img src="${esc(url)}" alt="" loading="lazy" decoding="async">`
                : `<div class="tk-wait">качается…</div>`}
          <figcaption>${esc(fmt.format(new Date(t.at)).replace(" г.", ""))}</figcaption>
        </figure>`;
    }).join("")}</div>`;

  return `<div class="tk-list">${list.map((t, i) => {
    const url = takeUrls.get(t.id);
    if (!url) takePull(t.id);
    const mm = `${Math.floor(t.ms / 60000)}:${String(Math.round(t.ms / 1000) % 60).padStart(2, "0")}`;
    return `
      <div class="tk-row">
        <div class="tk-head"><b>${esc(fmt.format(new Date(t.at)).replace(" г.", ""))}</b>
          <em>${esc(ago(t, i))} · ${mm}</em></div>
        ${url ? `<audio controls preload="none" src="${esc(url)}"></audio>`
              : `<div class="tk-wait">качается…</div>`}
      </div>`;
  }).join("")}</div>`;
}

// снимок во весь экран: разглядеть штрих в сетке невозможно
function openShotFull(url, when) {
  sheetMode = "shot";
  openSheet(`
    <div class="ach-sheet">
      ${when ? `<h3>${esc(when)}</h3>` : ""}
      <div class="shot-box" id="shotBox">
        <img class="tk-full" id="shotImg" src="${esc(url)}" alt="" draggable="false">
      </div>
      <div class="shot-hint">Двумя пальцами — приблизить, двойное касание — вернуть</div>
    </div>
    <div class="sheet-actions">
      <button class="btn gold" id="shotSave" type="button">Сохранить</button>
      <button class="btn" id="shotClose" type="button">Закрыть</button>
    </div>`);

  bindShotZoom($("#shotBox"), $("#shotImg"));
  $("#shotClose").addEventListener("click", closeSheet);
  $("#shotSave").addEventListener("click", () => saveShot(url, when));
}

/* Приближение двумя пальцами и перетаскивание. Свой обработчик, а не системный
   зум страницы: шторка фиксированная, и страницу масштабировать нечего. */
function bindShotZoom(box, img) {
  if (!box || !img) return;
  let k = 1, x = 0, y = 0;          // масштаб и сдвиг
  let d0 = 0, k0 = 1, px = 0, py = 0, panning = false;
  const apply = () => {
    const lim = (v, m) => Math.max(-m, Math.min(m, v));
    const m = Math.max(0, (k - 1) * box.clientWidth / 2);
    x = lim(x, m); y = lim(y, m);
    img.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
    box.classList.toggle("zoomed", k > 1.02);
  };
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  box.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) { d0 = dist(e.touches); k0 = k; panning = false; }
    else if (e.touches.length === 1 && k > 1.02) {
      panning = true; px = e.touches[0].clientX - x; py = e.touches[0].clientY - y;
    }
  }, { passive: true });

  box.addEventListener("touchmove", (e) => {
    if (e.touches.length === 2 && d0) {
      e.preventDefault();
      k = Math.max(1, Math.min(5, k0 * (dist(e.touches) / d0)));
      apply();
    } else if (panning && e.touches.length === 1) {
      e.preventDefault();
      x = e.touches[0].clientX - px; y = e.touches[0].clientY - py;
      apply();
    }
  }, { passive: false });

  box.addEventListener("touchend", () => { d0 = 0; panning = false; if (k <= 1.02) { k = 1; x = y = 0; apply(); } });

  let tapAt = 0;
  box.addEventListener("click", () => {
    const t = Date.now();
    if (t - tapAt < 300) { k = k > 1.02 ? 1 : 2.5; x = y = 0; apply(); }
    tapAt = t;
  });
}

/* Сохранение на устройство. На iOS правильный путь — системный лист «Поделиться»:
   оттуда снимок кладётся в «Фото». Обычная ссылка на скачивание там просто
   открыла бы картинку в новой вкладке. */
async function saveShot(url, when) {
  const name = "keiko-" + (when || "снимок").replace(/[^\wа-яё0-9]+/gi, "-") + ".jpg";
  try {
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], name, { type: blob.type || "image/jpeg" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast("Снимок сохранён");
  } catch (e) {
    if (e && e.name === "AbortError") return;      // просто закрыл лист — не ошибка
    toast("Не получилось сохранить");
  }
}

function openShotSheet(id) {
  const t = (data.takes || []).find(x => x.id === id);
  const url = takeUrls.get(id);
  if (!t || !url) return;
  const when = new Intl.DateTimeFormat("ru", { day: "numeric", month: "long", year: "numeric" })
    .format(new Date(t.at)).replace(" г.", "");
  sheetMode = "shot";
  openSheet(`
    <div class="ach-sheet">
      <h3>${esc(when)}</h3>
      <div class="shot-box" id="shotBox">
        <img class="tk-full" id="shotImg" src="${esc(url)}" alt="" draggable="false">
      </div>
      <div class="shot-hint">Двумя пальцами — приблизить, двойное касание — вернуть</div>
    </div>
    <div class="sheet-actions">
      <button class="btn gold" id="shotSave" type="button">Сохранить</button>
      <button class="btn danger" id="shotDel" type="button">Удалить</button>
      <button class="btn" id="shotClose" type="button">Закрыть</button>
    </div>`);
  bindShotZoom($("#shotBox"), $("#shotImg"));
  $("#shotClose").addEventListener("click", closeSheet);
  $("#shotSave").addEventListener("click", () => saveShot(url, when));
  $("#shotDel").addEventListener("click", () => {
    if (!confirm("Удалить снимок?")) return;
    t.deleted = true; t.updatedAt = now();
    saveData(); schedulePush(); closeSheet(); render();
  });
}

function factsBlockHTML(view) {
  const list = withMaterial(view, () => factsState());
  if (!list.length) return `<div class="empty-note">Для этого материала карточек пока нет</div>`;

  const lessons = view.track === "pastel";
  const opened = list.filter(f => f.open).reverse();      // сверху — та, что открылась последней
  const locked = list.filter(f => !f.open);
  const next = locked[0];
  const label = (f) => f.unit === "page"
    ? `со страницы ${f.need}`
    : `после ${f.need} ${lessons ? plural(f.need, "урока", "уроков", "уроков") : plural(f.need, "занятия", "занятий", "занятий")}`;

  return `
    <div class="feed-head">${locked.length
      ? `Впереди ещё ${locked.length} ${plural(locked.length, "карточка", "карточки", "карточек")}${next ? ` · ближайшая ${label(next)}` : ""}`
      : "Все карточки открыты 🎉"}</div>

    ${opened.length ? `<div class="feed">
      ${opened.map(f => `
        <article class="post">
          <div class="post-top"><span class="fi">💡</span><h4>${esc(f.t)}</h4></div>
          <p class="post-text">${esc(f.x)}</p>
          ${(f.more || []).length ? `<div class="post-dig">
            ${f.more.map(m => `<div class="dig-item">${esc(m)}</div>`).join("")}
          </div>` : ""}
        </article>`).join("")}
    </div>` : ""}`;
}

// награды конкретного материала
function renderAchMaterial(view) {
  const ach = withMaterial(view, () => achState());
  const words = withMaterial(view, () => achWords());
  const title = withMaterial(view, () => isBook() ? book().title : isWatch() ? video().title : isCourse() ? course().name : piece().name);
  const icon = view.track === "book" ? "📖" : view.track === "pastel" ? "🎨" : "🎹";
  const open = ach.filter(a => a.done).length;
  const facts = withMaterial(view, () => factsState());
  let teased = 0;

  $("#view").innerHTML = `
    <button class="back" id="achBack" type="button">‹ Все материалы</button>

    <div class="ach-top">
      <div class="ach-hero">
        <span class="mc-tile big t-${view.track}"><i>${icon}</i></span>
        <span class="ach-hero-txt">
          <b>${esc(title)}</b>
          <em>${achTab === "facts" ? `${facts.filter(f => f.open).length} из ${facts.length} карточек знаний` : `${open} из ${ach.length} достижений открыто`}</em>
        </span>
      </div>
      <div class="ach-progress"><i style="width:${achTab === "facts"
        ? (facts.length ? facts.filter(f => f.open).length / facts.length * 100 : 0)
        : open / ach.length * 100}%"></i></div>
    </div>

    <div class="seg" id="achTabs">
      <button data-at="ach" class="${achTab === "ach" ? "on" : ""}" type="button">${T("segAch")}</button>
      <button data-at="facts" class="${achTab === "facts" ? "on" : ""}" type="button">${T("segFacts")}</button>
      ${view.track === "piano" || view.track === "pastel"
        ? `<button data-at="takes" class="${achTab === "takes" ? "on" : ""}" type="button">${view.track === "pastel" ? "📷 Работы" : "🎙 Записи"}</button>` : ""}
    </div>

    ${achTab === "takes" ? takesBlockHTML(view) : achTab === "facts" ? factsBlockHTML(view) : `
    <div class="ach-grid">
      ${ach.map(a => {
        if (a.done) return `
          <button class="ach open" data-id="${a.id}" type="button">
            <span class="ic">${a.icon}</span><span class="nm">${esc(a.name)}</span>
          </button>`;
        const tease = !a.secret && teased < 2;
        if (tease) teased++;
        return `
          <button class="ach locked ${tease ? "next" : ""}" data-id="${a.id}" type="button">
            <span class="ic">${tease ? a.icon : "🔒"}</span>
            <span class="nm">${tease ? esc(a.name) : "???"}</span>
          </button>`;
      }).join("")}
    </div>`}`;

  document.querySelectorAll("[data-shot]").forEach(el =>
    el.addEventListener("click", () => openShotSheet(el.dataset.shot)));
  document.querySelectorAll("#achTabs button").forEach(b =>
    b.addEventListener("click", () => {
      achTab = b.dataset.at; cfg.achTab = achTab; saveCfg();
      renderAch();
      $("#view").scrollTop = 0;
    }));

  $("#achBack").addEventListener("click", () => {
    achView = null; cfg.achView = null; saveCfg();
    renderAch();
    $("#view").scrollTop = 0;
  });

  document.querySelectorAll(".ach").forEach(b =>
    b.addEventListener("click", () => {
      const a = ach.find(x => x.id === b.dataset.id);
      openAchSheet(a, b.classList.contains("next"), words);
    }));

  document.querySelectorAll("[data-fact]").forEach(b =>
    b.addEventListener("click", () => {
      const f = facts.find(x => x.id === b.dataset.fact);
      if (f) openFactSheet(f);
    }));
}

// Шторка с карточкой знания
function openFactSheet(f) {
  sheetMode = "fact";
  openSheet(`
    <div class="ach-sheet">
      <div class="big open">💡</div>
      <h3>${esc(f.t)}</h3>
      <p style="max-width:340px">${esc(f.x)}</p>
      ${(f.more || []).length ? `
        <div class="dig">
          <div class="dig-head">Копнуть глубже</div>
          ${f.more.map(m => `<div class="dig-item">${esc(m)}</div>`).join("")}
        </div>` : ""}
    </div>
    <div class="sheet-actions">
      <button class="btn" id="factClose" type="button">Закрыть</button>
    </div>`);
  $("#factClose").addEventListener("click", closeSheet);
}

// Шторка с деталями награды
function openAchSheet(a, teased, words) {
  sheetMode = "ach";
  const known = a.done || teased;      // секретные закрытые не раскрываем
  const s = achView ? withMaterial(achView, () => curStats()) : curStats();
  const wordOfLocal = (x) => x.word || (words || achWords())[x.id] || x.hint;

  // подсказка «сколько осталось» для понятных числовых условий
  let progressLine = "";
  if (!a.done) {
    const m = { streak3: [s.streak, 3, "дн. с этим материалом"], streak7: [s.streak, 7, "дн. с этим материалом"],
                streak14: [s.streak, 14, "дн. с этим материалом"], streak30: [s.streak, 30, "дн. с этим материалом"], days10: [s.days, 10, "занятий"], days20: [s.days, 20, "занятий"],
                samovar: [s.days, 10, "вечеров"] }[a.id];
    if (m) progressLine = `Сейчас: <b>${m[0]}</b> из ${m[1]} ${m[2]}`;
    else if (isBook())
      progressLine = `Сейчас прочитано: <b>${s.page}</b> ${plural(s.page, "страница", "страницы", "страниц")} из ${s.pages} · ${Math.round(s.pct)}%`;
    else if (!isBook() && ["q1", "half", "q3", "all100"].includes(a.id))
      progressLine = `Сейчас разобрано: <b>${Math.round(s.pct)}%</b>`;
  }

  openSheet(`
    <div class="ach-sheet">
      <div class="big ${a.done ? "open" : known ? "" : "hidden"}">${known ? a.icon : "🔒"}</div>
      <h3>${known ? esc(a.name) : "Секретная награда"}</h3>
      <span class="status ${a.done ? "open" : "wait"}">${a.done ? "Открыто" : "Ещё не открыто"}</span>
      <p>${known ? esc(a.done ? wordOfLocal(a) : a.hint) : "Откроется сама, когда сделаешь что-то особенное. Подсказки не будет 🙂"}</p>
      ${progressLine ? `<div class="cond">${progressLine}</div>` : ""}
    </div>
    <div class="sheet-actions">
      <button class="btn" id="achClose" type="button">Закрыть</button>
    </div>`);

  $("#achClose").addEventListener("click", closeSheet);
}

/* ══════════ Профили ══════════ */

/* Самый первый экран: пока нет токена, показывать нечего — в приложении
   не зашито ни одного материала, всё живёт в гисте. */
function renderConnect(err) {
  document.body.classList.add("picking");
  $("#view").innerHTML = `
    <div class="pick-wrap">
      <div class="pick-head">
        <div class="logo big"><em>Кэйко</em><i>稽古</i></div>
        <p>Приложение пустое: материалы, профили и записи лежат в твоём гисте. Подключи его — и всё появится.</p>
      </div>
      <div class="conn-form">
        <input class="note-input" id="cnToken" type="password" placeholder="ghp_… — токен GitHub" autocomplete="off">
        <input class="note-input" id="cnGist" type="text" placeholder="id гиста (если знаешь)" autocomplete="off">
        <button class="btn gold" id="cnGo" type="button">Подключить</button>
      </div>
      <div class="pick-note">
        Нужен <a href="https://github.com/settings/tokens/new?description=%D0%9A%D1%8D%D0%B9%D0%BA%D0%BE&scopes=gist" target="_blank" rel="noopener">классический токен со scope gist</a>.
        Поле с id можно оставить пустым — приложение найдёт гист само.
        ${err ? `<br><b>${esc(err)}</b>` : ""}
      </div>
    </div>`;

  $("#cnGo").addEventListener("click", async () => {
    const token = ($("#cnToken").value || "").trim();
    const gid = ($("#cnGist").value || "").trim();
    if (!token) { renderConnect("Нужен токен"); return; }
    cfg.token = token;
    if (gid) cfg.gistId = gid;
    saveCfg();
    try {
      if (!cfg.gistId) {
        const r = await gh("/gists?per_page=100");
        if (r.status === 401) throw new Error("Токен не подошёл");
        if (!r.ok) throw new Error("GitHub ответил " + r.status);
        const found = (await r.json()).find(g => g.files && g.files[GIST_FILE]);
        if (!found) throw new Error("Гист с данными не нашёлся — впиши id вручную");
        cfg.gistId = found.id; saveCfg();
      }
      await catalogPull(true).catch(() => {});     // каталог: профили, награды, карточки
      const r = await gh("/gists/" + cfg.gistId);
      if (!r.ok) throw new Error("Гист не открылся");
      const f = (await r.json()).files[GIST_FILE];
      if (!f) throw new Error("В гисте нет файла " + GIST_FILE);
      let txt = f.content;
      if (f.truncated && f.raw_url) txt = await (await withTimeout(fetch(f.raw_url), 20000)).text();
      const box = JSON.parse(txt);
      cfg.profileIds = Object.keys(box.profiles || {}); saveCfg();
      profilesFromKeys(cfg.profileIds);
      document.body.classList.remove("picking");
      renderProfilePick();
    } catch (e) {
      cfg.token = ""; saveCfg();
      renderConnect(e.message || "Не получилось");
    }
  });
}

// первый запуск: кто занимается
function renderProfilePick() {
  document.body.classList.add("picking");
  $("#view").innerHTML = `
    <div class="pick-wrap">
      <div class="pick-head">
        <div class="logo big"><em>Кэйко</em><i>稽古</i></div>
        <p>У каждого свой прогресс и свои материалы. Гист при этом общий — один на двоих.</p>
      </div>
      <div class="pick-list">
        ${PROFILES.map(p => `
          <button class="pick-card" data-profile="${p.id}" type="button">
            <span class="pc-name">${esc(p.name)}</span>
            <span class="pc-hint">${esc(p.hint)}</span>
          </button>`).join("")}
      </div>
      <div class="pick-note">Профиль можно сменить в настройках — данные останутся у каждого свои.</div>
    </div>`;

  document.querySelectorAll("[data-profile]").forEach(b =>
    b.addEventListener("click", () => {
      localStorage.setItem(LS_PROFILE, b.dataset.profile);
      location.replace(location.origin + location.pathname + "?v=" + encodeURIComponent(APP_VERSION));
    }));
}

function switchProfile() {
  if (!confirm("Сменить профиль?\n\nЗаписи текущего останутся на месте.")) return;
  localStorage.removeItem(LS_PROFILE);
  location.replace(location.origin + location.pathname + "?v=" + encodeURIComponent(APP_VERSION));
}

/* ══════════ Мысли ══════════
   Свой раздел: мысль не отмечает занятие и не влияет на серию —
   это читательский дневник, привязанный к месту в материале. */

const thoughts = () => (data.thoughts || []).filter(t => !t.deleted);
const thoughtsOf = (key) => thoughts().filter(t => t.key === key)
  .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

// ключ материала — тот же, по которому лежат карточки знаний
function keyOf(m) {
  if (m.track === "book") return m.bookId || "";
  if (m.track === "pastel") return "pastel";
  if (m.track === "watch") return m.videoId || "";
  return m.pieceId || "";
}
const currentKey = () => isBook() ? book().id : isWatch() ? video().id : isCourse() ? "pastel" : (piece() ? piece().id : "");

/* Строка над лентой появляется, только когда лента чем-то сужена:
   фильтром любимых или случайной мыслью — и даёт путь обратно ко всей ленте. */
function thoughtHintHTML() {
  if (shuffleThought)
    return `<span>🎲 Одна наугад</span><button class="th-link" id="thAll" type="button">вся лента</button>`;
  if (notesFilter === "liked")
    return `<span>♥ Только любимые</span><button class="th-link" id="thAll" type="button">вся лента</button>`;
  return "";
}

// вытянуть случайную мысль: ту же дважды подряд не показываем
function shuffleRandomThought() {
  const pool = thoughts()
    .filter(t => !t.event)                       // события — не мысли, их не тянем наугад
    .filter(t => notesFilter !== "liked" || t.liked)
    .filter(t => t.id !== shuffleThought);
  if (!pool.length) { toast("Мыслей пока мало"); return false; }
  shuffleThought = pool[Math.floor(Math.random() * pool.length)].id;
  editingThought = null;
  renderNotes();
  $("#view").scrollTop = 0;
  return true;
}

/* Текст из книги приходит с типографскими переносами: слово разорвано дефисом,
   каждая строка — отдельный перевод, между ними попадаются номера страниц.
   Приводим это к нормальному абзацу. */

/* Скопированный из книги текст часто приходит уже без переводов строк, а дефис
   переноса остаётся прямо внутри слова: «чело-веческое», «на самом де-ле».
   Поэтому склеиваем по умолчанию, а настоящие дефисы бережём по спискам. */
const KEEP_TAIL = /^(то|либо|нибудь|ка|таки|же|с)$/i;
const KEEP_HEAD = new RegExp("^(из|по|во|кое|как|где|кто|что|чей|какой|когда|куда|откуда|зачем|почему|сколько|все|всё|пол|полу|экс|вице|мини|макси|супер|топ|интернет|бизнес|пресс|онлайн|офлайн|веб|фото|видео|аудио|кино|теле|радио|авиа|эко|арт|соц|гос|санкт|нью)$", "i");

function joinHyphen(head, tail) {
  if (/^\p{Lu}/u.test(tail)) return head + "-" + tail;    // Санкт-Петербург, Иваново-Вознесенск
  if (KEEP_TAIL.test(tail) || KEEP_HEAD.test(head)) return head + "-" + tail;
  return head + tail;
}

// склейка через перевод строки или пробел — безопасна даже для набранного руками текста
function fixHyphenBreaks(raw) {
  const join = (m, head, tail) => joinHyphen(head, tail);
  return String(raw || "")
    .replace(/\u00AD/g, "")
    .replace(/(\p{L}+)-[ \t]*[\r\n\u2028]+[ \t]*(\p{L}[\p{L}]*)/gu, join)
    .replace(/(\p{L}+)-[ \t]+(\p{L}[\p{L}]*)/gu, join);
}

// а это уже для вставленного из книги: дефис остался внутри слова
function fixInlineHyphens(raw) {
  return String(raw || "").replace(/(\p{Ll}{2,})-(\p{Ll}{2,})/gu, (m, head, tail) => joinHyphen(head, tail));
}

function cleanPastedText(raw) {
  let t = fixInlineHyphens(fixHyphenBreaks(raw)).replace(/\r\n?/g, "\n").replace(/\u2028|\u2029/g, "\n");

  // колонтитулы и номера страниц отдельной строкой
  t = t.split("\n").filter(line => !/^\s*\d{1,4}\s*$/.test(line)).join("\n");

  // строки одного абзаца склеиваем пробелом; пустая строка — граница абзаца,
  // строка с тире — реплика, её перенос сохраняем
  t = t.replace(/\n{2,}/g, "\u0000")
       .replace(/\n[ \t]*(?![—–-])/g, " ")
       .replace(/\u0000/g, "\n\n");

  return t.replace(/[ \t]{2,}/g, " ")
          .replace(/ ([,.;:!?»])/g, "$1")
          .replace(/(«) /g, "$1")
          .trim();
}

function bindPasteCleanup(area) {
  if (!area) return;

  const insert = (e, raw) => {
    if (!raw) return;
    const clean = cleanPastedText(raw);
    if (clean === raw) return;
    e.preventDefault();
    // insertText сохраняет отмену по Cmd+Z, поэтому пробуем сначала его
    if (!document.execCommand || !document.execCommand("insertText", false, clean)) {
      const at = area.selectionStart, to = area.selectionEnd;
      area.value = area.value.slice(0, at) + clean + area.value.slice(to);
      area.setSelectionRange(at + clean.length, at + clean.length);
    }
    toast("Переносы поправлены");
  };

  area.addEventListener("paste", (e) => {
    const dt = e.clipboardData || window.clipboardData;
    insert(e, dt && dt.getData ? dt.getData("text") : "");
  });

  // не всякая вставка на iOS шлёт paste — beforeinput ловит и остальные способы
  area.addEventListener("beforeinput", (e) => {
    if (e.inputType !== "insertFromPaste" || !e.dataTransfer) return;
    insert(e, e.dataTransfer.getData("text"));
  });
}

/* Вложение момента: снимок или запись. Файл лежит там же, где записи игры,
   момент хранит только ссылку на него. */
function mediaHTML(t) {
  if (!t.mediaId) return "";
  const url = takeUrls.get(t.mediaId);
  if (!url) {
    takePull(t.mediaId);
    const p = takePct.get(t.mediaId);
    const pct = p == null ? null : Math.round(p * 100);
    const what = t.mediaKind === "photo" ? "снимок" : "запись";
    return `
      <div class="tk-load" data-media="${esc(t.mediaId)}">
        <div class="tk-load-bar"><i style="width:${pct == null ? 8 : Math.max(4, pct)}%"></i></div>
        <span data-what="${what}">${what} загружается${pct == null ? "…" : " · " + pct + "%"}</span>
      </div>`;
  }
  return t.mediaKind === "photo"
    ? `<img class="th-shot" src="${esc(url)}" alt="" loading="lazy" decoding="async" data-shot-src="${esc(url)}" data-shot-when="${esc(t.date ? fmtDay(t.date) : "")}">`
    : `<audio class="th-audio" controls preload="none" src="${esc(url)}"></audio>`;
}

/* ══════════ «Захотелось» ══════════
   Книга или ролик почти всегда что-нибудь подкидывают: съездить туда,
   прочитать вот это, попробовать сделать так. В ленте моментов такое тонет —
   там мысли, их перечитывают, а не выполняют. Здесь у желания есть вид
   и одно-единственное состояние: пока хочется — или уже сбылось. */

const WISH_KINDS = [
  { id: "place",  icon: "🗺", name: "Съездить" },
  { id: "read",   icon: "📚", name: "Прочитать" },
  { id: "watch",  icon: "🎬", name: "Посмотреть" },
  { id: "listen", icon: "🎧", name: "Послушать" },
  { id: "buy",    icon: "🛒", name: "Купить" },
  { id: "make",   icon: "✍️", name: "Сделать" }
];
const wishKind = (id) => WISH_KINDS.find(k => k.id === id) || WISH_KINDS[WISH_KINDS.length - 1];
const wishes = () => (data.wishes || []).filter(w => !w.deleted);
const wishOpenCount = () => wishes().filter(w => !w.done).length;

let wishKindPick = "place";      // вид у нового желания
let wishFilter = "open";         // «хочется» | «сбылось»
let wishEditing = null;

function wishAdd(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  data.wishes = data.wishes || [];
  data.wishes.push({
    /* Источник не привязываем. Подставлялся активный материал, а желание
       приходит откуда угодно — и подпись «Бах, BWV 853» под «съездить на косу»
       не объясняла, а сбивала. Название и вид — всё, что нужно. */
    id: uid(), text: t, kind: wishKindPick,
    done: false, doneAt: 0, date: todayStr(), createdAt: now(), updatedAt: now()
  });
  saveData();
  schedulePush();
  return true;
}

function wishToggle(id) {
  const w = (data.wishes || []).find(x => x.id === id);
  if (!w) return;
  w.done = !w.done;
  w.doneAt = w.done ? now() : 0;
  w.updatedAt = now();
  saveData(); schedulePush(); renderWishes();
  if (w.done) toast("Сбылось");
}

function wishDrop(id) {
  const w = (data.wishes || []).find(x => x.id === id);
  if (!w) return;
  w.deleted = true; w.updatedAt = now();
  saveData(); schedulePush(); renderWishes();
}

function renderWishes() {
  const list = wishes().filter(w => (wishFilter === "done" ? w.done : !w.done))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const openN = wishOpenCount();
  const doneN = wishes().length - openN;

  const fmt = new Intl.DateTimeFormat("ru", { day: "numeric", month: "long" });
  const when = (w) => fmt.format(fromStr(w.date));

  const rowHTML = (w) => {
    const k = wishKind(w.kind);
    return `
      <article class="wish${w.done ? " done" : ""}">
        <button class="wi-check" data-wdone="${w.id}" type="button"
          aria-label="${w.done ? "Вернуть в список" : "Отметить сбывшимся"}">${w.done ? "✓" : ""}</button>
        <div class="wi-body">
          ${wishEditing === w.id
            ? `<textarea class="note-input wi-edit" id="wiEdit" rows="3">${esc(w.text)}</textarea>
               <div class="wi-edit-row">
                 <button class="btn gold" data-wsave="${w.id}" type="button">Сохранить</button>
                 <button class="btn" data-wcancel="1" type="button">Отмена</button>
               </div>`
            : `<p class="wi-text">${esc(w.text)}</p>
               <div class="wi-meta">
                 <span class="wi-kind">${k.icon} ${esc(k.name)}</span>
                 <span class="wi-when">${esc(w.done ? "сбылось " + fmt.format(new Date(w.doneAt || now())) : when(w))}</span>
               </div>`}
        </div>
        ${wishEditing === w.id ? "" : `
        <span class="wi-acts">
          <button class="th-act" data-wedit="${w.id}" type="button" aria-label="Изменить">✎</button>
          <button class="th-act" data-wdrop="${w.id}" type="button" aria-label="Удалить">✕</button>
        </span>`}
      </article>`;
  };

  /* Список сплошной: вид написан на самой карточке, и второй раз — заголовком
     группы — он только дробил экран на шесть кусков по одной строке. */
  const body = list.length
    ? `<div class="wish-list">${list.map(rowHTML).join("")}</div>`
    : wishFilter === "done"
      ? `<div class="empty-note">Сбывшегося пока нет.<br>Отмечай галочкой — здесь будет видно, что из задуманного дошло до дела.</div>`
      : `<div class="empty-note">Пока пусто.<br>Сюда — то, что захотелось по ходу: куда съездить, что прочитать, что попробовать сделать.</div>`;

  $("#view").innerHTML = `
    <div class="panel th-panel">
      <textarea class="note-input th-text" id="wiText" rows="2" placeholder="Чего захотелось?"></textarea>
      <div class="wi-kinds">
        ${WISH_KINDS.map(k => `
          <button class="wi-pick ${wishKindPick === k.id ? "on" : ""}" data-wkind="${k.id}" type="button">
            <i>${k.icon}</i><span>${esc(k.name)}</span>
          </button>`).join("")}
      </div>
      <button class="btn gold th-send" id="wiSave" type="button">Записать</button>
    </div>

    <div class="seg" id="wishSeg">
      <button data-wf="open" class="${wishFilter === "open" ? "on" : ""}" type="button">Хочется ${openN || ""}</button>
      <button data-wf="done" class="${wishFilter === "done" ? "on" : ""}" type="button">Сбылось ${doneN || ""}</button>
    </div>

    ${body}`;

  const area = $("#wiText");
  const save = () => { if (wishAdd(area.value)) { area.value = ""; renderWishes(); } };
  $("#wiSave").addEventListener("click", save);
  area.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); save(); }
  });

  document.querySelectorAll("[data-wkind]").forEach(b =>
    b.addEventListener("click", () => {
      wishKindPick = b.dataset.wkind;
      document.querySelectorAll("[data-wkind]").forEach(x => x.classList.toggle("on", x === b));
    }));
  document.querySelectorAll("#wishSeg button").forEach(b =>
    b.addEventListener("click", () => { wishFilter = b.dataset.wf; wishEditing = null; renderWishes(); }));
  document.querySelectorAll("[data-wdone]").forEach(b =>
    b.addEventListener("click", () => wishToggle(b.dataset.wdone)));
  document.querySelectorAll("[data-wedit]").forEach(b =>
    b.addEventListener("click", () => { wishEditing = b.dataset.wedit; renderWishes(); }));
  document.querySelectorAll("[data-wcancel]").forEach(b =>
    b.addEventListener("click", () => { wishEditing = null; renderWishes(); }));
  document.querySelectorAll("[data-wsave]").forEach(b =>
    b.addEventListener("click", () => {
      const w = (data.wishes || []).find(x => x.id === b.dataset.wsave);
      const t = ($("#wiEdit").value || "").trim();
      if (w && t) { w.text = t; w.updatedAt = now(); saveData(); schedulePush(); }
      wishEditing = null; renderWishes();
    }));
  document.querySelectorAll("[data-wdrop]").forEach(b =>
    b.addEventListener("click", () => {
      if (confirm("Убрать из списка?")) wishDrop(b.dataset.wdrop);
    }));
}

/* Что открылось в этот день по этому материалу.
   Карточка сессии несёт список наград и знаний с собой, но полагаться только
   на него нельзя: запись могла родиться на пути, где список не собрали, или
   карточка знания открылась во втором заходе того же дня. Достаём по времени
   получения — оно записано у каждой награды и каждой карточки. Единица
   означает «получено давно, время неизвестно» и в счёт не идёт. */
/* Времени получения у старого нет: его начали записывать поздно, и всё, что
   открылось раньше, помечено единицей — «когда-то». По одному времени карточки
   в ленте так и не появлялись. Поэтому день считаем ещё и разницей: подставляем
   записи по этот день и по предыдущий и смотрим, что прибавилось. Это не
   выдумка — условие открытия у награды и карточки жёсткое и целиком считается
   из записей, так что день выходит настоящий. */
function dayProgress(track, key, day) {
  const view = { track,
    pieceId: track === "piano" ? key : null,
    bookId: track === "book" ? key : null,
    videoId: track === "watch" ? key : null };
  if (!viewMaterialExists(view)) return { ach: [], facts: [] };

  /* Урезаем все треки сразу: серия и часть наград считаются по занятиям
     вообще, а не только по этому материалу. */
  const stores = [data.piano, data.book, data.pastel, data.watch];
  const snapshot = (upto) => {
    const save = stores.map(s => s.entries);
    stores.forEach(s => { s.entries = s.entries.filter(e => e.date <= upto); });
    try {
      return withMaterial(view, () => ({
        ach: achState().filter(a => a.done),
        facts: factsState().filter(f => f.open)
      }));
    } finally { stores.forEach((s, i) => { s.entries = save[i]; }); }
  };

  const after = snapshot(day);
  const before = snapshot(dateStr(new Date(fromStr(day).getTime() - 864e5)));
  const hadAch = new Set(before.ach.map(a => a.id));
  const hadFacts = new Set(before.facts.map(f => f.id));
  const sameDay = (at) => at > 1 && dateStr(new Date(at)) === day;

  return {
    ach: after.ach.filter(a => !hadAch.has(a.id) || sameDay((data.achAt || {})[key + ":" + a.id]))
      .map(a => ({ id: a.id, icon: a.icon, name: a.name })),
    facts: after.facts.filter(f => !hadFacts.has(f.id) || sameDay((data.factAt || {})[key + ":" + f.id]))
      .map(f => ({ id: f.id, t: f.t }))
  };
}

/* «Без материала»: мысль не обязана быть о книге или пьесе. Метка отдельная,
   а не пустая строка, — иначе её не отличить от «ещё не выбрано». */
const NO_MAT = "-";
const NO_MAT_ITEM = { icon: "✎", title: "Без материала", cover: "", ratio: "" };

function renderNotes() {
  /* У событий, записанных до появления поля, метки награды нет — достаём
     её из идентификатора: он собран как ev:ach:<метка>:<дата>. */
  const evTag = (t) => t.tag || (String(t.id).split(":")[2] || "");

  // один материал за день считаем один раз: событий в ленте много, а дней мало
  const dayCache = new Map();
  const progressOf = (t) => {
    if (t.event !== "session" || !t.key || !t.track) return { ach: t.awards || [], facts: t.facts || [] };
    const ck = t.track + "|" + t.key + "|" + t.date;
    if (!dayCache.has(ck)) dayCache.set(ck, dayProgress(t.track, t.key, t.date));
    const live = dayCache.get(ck);
    const join = (a, b) => {
      const seen = new Set((a || []).map(x => x.id));
      return (a || []).concat((b || []).filter(x => x && !seen.has(x.id)));
    };
    return { ach: join(t.awards, live.ach), facts: join(t.facts, live.facts) };
  };

  if (!hasMaterials()) { renderEmpty("Моментов пока нет", "Они появятся вместе с первым материалом."); return; }

  /* Завершённое из выбора убрано: по досмотренному ролику новых мыслей уже
     не пишут, а список он засорял. Старые записи по нему остаются на месте —
     здесь речь только о том, к чему привязать новую.
     И первым пунктом — ничего: мысль не обязана быть о материале. */
  const allMats = achMaterials();
  const mats = allMats.filter(m => !m.done);
  const key = cfg.thoughtKey === NO_MAT ? NO_MAT
    : (cfg.thoughtKey && mats.some(m => keyOf(m) === cfg.thoughtKey)) ? cfg.thoughtKey
    : (mats.some(m => keyOf(m) === currentKey()) ? currentKey() : NO_MAT);
  const cur = key === NO_MAT ? NO_MAT_ITEM : (mats.find(m => keyOf(m) === key) || mats[0] || NO_MAT_ITEM);

  const all = thoughts().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const liked = all.filter(t => t.liked);
  if (notesFilter === "liked" && !liked.length) notesFilter = "all";
  let list = notesFilter === "liked" ? liked : all;
  // «наугад» сворачивает ленту до одной записи — можно тянуть ещё и ещё
  if (shuffleThought) {
    const one = list.find(t => t.id === shuffleThought);
    if (one) list = [one]; else shuffleThought = null;
  }

  const fmt = new Intl.DateTimeFormat("ru", { day: "numeric", month: "long" });
  const clock = new Intl.DateTimeFormat("ru", { hour: "2-digit", minute: "2-digit" });
  const nowYear = new Date().getFullYear();
  const when = (t) => {
    const d = fromStr(t.date);
    const year = d.getFullYear() !== nowYear ? " " + d.getFullYear() : "";
    return fmt.format(d) + year + (t.createdAt ? ", " + clock.format(new Date(t.createdAt)) : "");
  };
  const arch = (data.archive || []).filter(a => !a.deleted);
  // у мысли своя обложка — по ней видно, откуда она, ещё до чтения текста
  const sourceOf = (t) => {
    if (!t.key) return NO_MAT_ITEM;            // мысль сама по себе
    const m = allMats.find(x => keyOf(x) === t.key);
    if (m) return { icon: m.icon, title: m.title, cover: m.cover, ratio: m.ratio };
    const a = arch.find(x => x.id === t.key);
    return a
      ? { icon: a.icon || "📖", title: a.title, cover: a.cover || "", ratio: a.ratio || "" }
      : { icon: "📎", title: "Архив", cover: "", ratio: "" };
  };
  const sourceHTML = (t) => {
    const s = sourceOf(t);
    return `
      <span class="th-cover">
        ${s.cover
          ? `<img src="${esc(s.cover)}" alt="" loading="lazy" decoding="async">`
          : `<i>${s.icon}</i>`}
      </span>
      <span class="th-name">${esc(s.title)}</span>`;
  };

  $("#view").innerHTML = `
    <div class="panel th-panel">
      <textarea class="note-input th-text" id="thText" rows="3" placeholder="Что подумалось? Можно приложить запись или снимок"></textarea>
      <div class="th-row">
        <span class="th-select">
          <span class="ts-label">${cur.icon} ${esc(cur.title)}</span>
          <span class="ts-arrow">▾</span>
          <select id="thMat" aria-label="Материал">
            <option value="${NO_MAT}" ${key === NO_MAT ? "selected" : ""}>${NO_MAT_ITEM.icon} ${esc(NO_MAT_ITEM.title)}</option>
            ${mats.map(m => `<option value="${esc(keyOf(m))}" ${keyOf(m) === key ? "selected" : ""}>${m.icon} ${esc(m.title)}</option>`).join("")}
          </select>
        </span>
        <span class="th-attach">
          ${canRecord() ? `<button class="th-clip" id="thMic" type="button" aria-label="Записать звук">🎙</button>` : ""}
          <button class="th-clip" id="thCam" type="button" aria-label="Приложить снимок">📷</button>
        </span>
      </div>
      <button class="btn gold th-send" id="thSave" type="button">Записать</button>
      ${pendingMedia ? `
        <div class="th-pending">
          ${pendingMedia.kind === "photo"
            ? `<img src="${esc(pendingMedia.url)}" alt="">`
            : `<audio controls src="${esc(pendingMedia.url)}"></audio>`}
          <button class="th-drop" id="thDrop" type="button" aria-label="Убрать вложение">✕</button>
        </div>` : ""}
    </div>

    ${thoughtHintHTML() ? `<div class="th-hint">${thoughtHintHTML()}</div>` : ""}

    ${list.length ? `<div class="feed notes-feed">
      ${list.map(t => t.id === editingThought ? `
        <article class="post thought editing">
          <div class="th-head">${sourceHTML(t)}<span class="th-when">${esc(when(t))}</span></div>
          <textarea class="note-input th-text" id="thEdit" rows="4">${esc(t.text)}</textarea>
          <div class="th-edit-row">
            <button class="btn gold" data-save="${t.id}" type="button">Сохранить</button>
            <button class="btn" data-cancel="1" type="button">Отмена</button>
          </div>
        </article>` : `
        <article class="post thought${t.event ? " ev ev-" + t.event : ""}">
          <div class="th-head">
            ${sourceHTML(t)}
            <span class="th-when">${esc(when(t))}${t.editedAt ? " · изменено" : ""}</span>
            <span class="th-acts">
              ${t.event ? "" : `
              <button class="th-act like ${t.liked ? "on" : ""}" data-like="${t.id}" type="button"
                aria-label="${t.liked ? "Убрать из любимых" : "В любимые"}">${t.liked ? "♥" : "♡"}</button>
              <button class="th-act" data-edit="${t.id}" type="button" aria-label="Изменить">✎</button>
              <button class="th-act" data-th="${t.id}" type="button" aria-label="Удалить">✕</button>`}
            </span>
          </div>
          ${t.text ? `<p class="post-text">${esc(t.text)}</p>` : ""}
          ${((p) => p.ach.length || p.facts.length ? `
            <div class="ev-awards">
              ${p.ach.map((a) => `
                <button class="ev-aw" type="button" data-ev-ach="${esc(a.id)}"
                  data-ev-key="${esc(t.key)}" data-ev-track="${esc(t.track)}">
                  <i>${esc(a.icon || "✦")}</i><span>${esc(a.name)}</span>
                </button>`).join("")}
              ${p.facts.map((f) => `
                <button class="ev-aw fact" type="button" data-ev-fact="${esc(f.id)}"
                  data-ev-key="${esc(t.key)}" data-ev-track="${esc(t.track)}">
                  <i>💡</i><span>${esc(f.t)}</span>
                </button>`).join("")}
            </div>` : "")(progressOf(t))}
          ${mediaHTML(t)}
        </article>`).join("")}
    </div>` : `<div class="empty-note">Здесь копятся моменты: мысль, запись, снимок.<br>Первый можно оставить прямо сейчас.</div>`}`;

  document.querySelectorAll("[data-shot-src]").forEach(el =>
    el.addEventListener("click", () => openShotFull(el.dataset.shotSrc, el.dataset.shotWhen)));

  /* Награда в ленте — не текст, а ссылка на саму награду: жмёшь и видишь,
     за что она и что там написано. */
  document.querySelectorAll("[data-ev-fact]").forEach(el =>
    el.addEventListener("click", () => {
      // у ролика свой ключ — без него карточка ролика не открывалась
      const view = { track: el.dataset.evTrack,
        pieceId: el.dataset.evTrack === "piano" ? el.dataset.evKey : null,
        bookId: el.dataset.evTrack === "book" ? el.dataset.evKey : null,
        videoId: el.dataset.evTrack === "watch" ? el.dataset.evKey : null };
      const f = withMaterial(view, () => factsState().find((x) => x.id === el.dataset.evFact));
      if (f) openFactSheet(f); else toast("Карточка не нашлась — материал изменился");
    }));

  document.querySelectorAll("[data-ev-ach]").forEach(el =>
    el.addEventListener("click", () => {
      // у ролика свой ключ — без него карточка ролика не открывалась
      const view = { track: el.dataset.evTrack,
        pieceId: el.dataset.evTrack === "piano" ? el.dataset.evKey : null,
        bookId: el.dataset.evTrack === "book" ? el.dataset.evKey : null,
        videoId: el.dataset.evTrack === "watch" ? el.dataset.evKey : null };
      const a = withMaterial(view, () => achState().find((x) => x.id === el.dataset.evAch));
      const words = withMaterial(view, () => achWords());
      if (a) openAchSheet(a, false, words);
      else toast("Награда не нашлась — материал изменился");
    }));

  const area = $("#thText");
  bindPasteCleanup(area);
  bindPasteCleanup($("#thEdit"));

  if (editingThought) {
    const ed = $("#thEdit");
    if (ed) setTimeout(() => { ed.focus(); ed.setSelectionRange(ed.value.length, ed.value.length); }, 60);
    notesFocus = false;
  } else if (notesFocus) {
    notesFocus = false;
    setTimeout(() => area.focus(), 60);
  }

  $("#thMat").addEventListener("change", (e) => {
    cfg.thoughtKey = e.target.value; saveCfg();
    const text = area.value;
    notesFocus = true;
    renderNotes();
    $("#thText").value = text;                  // не теряем начатую мысль при смене материала
  });

  $("#thSave").addEventListener("click", () => {
    // текст мог попасть в поле как угодно — склеиваем разорванные слова уже при записи,
    // но переводы строк не трогаем: они могут быть поставлены нарочно
    const text = fixHyphenBreaks($("#thText").value || "").trim();
    if (!text && !pendingMedia) { toast("Напиши пару слов или приложи что-нибудь"); return; }
    const rec = {
      id: uid(),
      key: key === NO_MAT ? "" : key,          // пусто — мысль сама по себе
      track: key === NO_MAT ? "" : cur.track,
      text: text.slice(0, 2000), date: todayStr(),
      createdAt: now(), updatedAt: now()
    };
    if (pendingMedia) {                 // вложение кладём в то же хранилище, что записи игры
      rec.mediaId = pendingMedia.id;
      rec.mediaKind = pendingMedia.kind;
      const mid = pendingMedia.id, mblob = pendingMedia.blob;
      takeSave(mid, mblob)
        .then(() => { if (tab === "notes") renderNotes(); return takePush(mid, mblob); })
        .catch(() => {});
      pendingMedia = null;
    }
    data.thoughts.push(rec);
    cfg.thoughtKey = key; saveCfg();
    saveData(); schedulePush();
    shuffleThought = null;              // новый момент — возвращаемся к ленте
    renderNotes();
    toast("Записано");
  });

  const mic = $("#thMic");
  if (mic) mic.addEventListener("click", () => openTakeSheet(true, (blob, ms) => {
    pendingMedia = { id: uid(), kind: "audio", blob, ms, url: URL.createObjectURL(blob) };
    renderNotes();
  }));
  const cam = $("#thCam");
  if (cam) cam.addEventListener("click", async () => {
    const f = await pickPhoto();
    if (!f) return;
    try {
      const blob = await shrinkPhoto(f);
      pendingMedia = { id: uid(), kind: "photo", blob, ms: 0, url: URL.createObjectURL(blob) };
      renderNotes();
    } catch { toast("Не получилось прочитать снимок"); }
  });
  const drop = $("#thDrop");
  if (drop) drop.addEventListener("click", () => { pendingMedia = null; renderNotes(); });

  const showAll = $("#thAll");
  if (showAll) showAll.addEventListener("click", () => {
    shuffleThought = null; notesFilter = "all";
    renderNotes();
  });

  document.querySelectorAll("[data-like]").forEach(b =>
    b.addEventListener("click", () => {
      const t = (data.thoughts || []).find(x => x.id === b.dataset.like);
      if (!t) return;
      t.liked = !t.liked;
      t.updatedAt = now();
      saveData(); schedulePush();
      // в общей ленте меняем только сердечко — иначе лента дёрнется и уедет к началу
      if (notesFilter === "liked") { renderNotes(); return; }
      b.classList.toggle("on", !!t.liked);
      b.textContent = t.liked ? "♥" : "♡";
      syncNotesFabs();
    }));

  document.querySelectorAll("[data-edit]").forEach(b =>
    b.addEventListener("click", () => { editingThought = b.dataset.edit; renderNotes(); }));

  document.querySelectorAll("[data-cancel]").forEach(b =>
    b.addEventListener("click", () => { editingThought = null; renderNotes(); }));

  document.querySelectorAll("[data-save]").forEach(b =>
    b.addEventListener("click", () => {
      const t = (data.thoughts || []).find(x => x.id === b.dataset.save);
      const text = fixHyphenBreaks($("#thEdit").value || "").trim();
      if (!t) return;
      if (!text) { toast("Мысль не может быть пустой"); return; }
      t.text = text.slice(0, 2000);
      t.updatedAt = now(); t.editedAt = now();
      editingThought = null;
      saveData(); schedulePush(); renderNotes();
      toast("Изменено");
    }));

  document.querySelectorAll("[data-th]").forEach(b =>
    b.addEventListener("click", () => {
      if (!confirm("Удалить эту мысль?")) return;
      const t = (data.thoughts || []).find(x => x.id === b.dataset.th);
      if (!t) return;
      t.deleted = true; t.updatedAt = now();
      saveData(); schedulePush(); renderNotes();
    }));

  syncNotesFabs();
}

/* ══════════ Мысль дня ══════════
   Раз в день показываем одну из записанных мыслей и не повторяемся,
   пока не покажем все. Состояние своё у каждого профиля. */

const LS_DAILY = () => "keiko-daily" + suffix();   // старое место хранения, читаем один раз при переезде

/* Отметка «сегодня уже показывали» лежит в данных профиля: она переживает
   обновление приложения и очистку кэшей, а заодно уезжает в гист —
   на втором устройстве мысль дня в тот же день не повторится. */
function dailyState() {
  if (!data) return {};
  if (!data.daily) {
    let old = {};
    try { old = JSON.parse(localStorage.getItem(LS_DAILY()) || "{}") || {}; } catch {}
    data.daily = { date: old.date || "", seen: Array.isArray(old.seen) ? old.seen : [], off: !!old.off };
    saveData();
  }
  return data.daily;
}

function saveDaily(st) {
  if (!data) return;
  data.daily = st;
  saveData();
  schedulePush();                                  // пусть отметка уедет в гист вместе с данными
  try { localStorage.removeItem(LS_DAILY()); } catch {}
}

function maybeDailyThought() {
  const st = dailyState();
  if (st.off || st.date === todayStr()) return;
  if (!data || !data.thoughts) return;
  if ($("#cheer")?.classList.contains("show")) return;   // не перебиваем награды
  if ($("#sheet")?.classList.contains("show")) return;

  const list = thoughts();
  if (!list.length) return;                              // нечего показывать — молчим

  const seen = Array.isArray(st.seen) ? st.seen : [];
  let pool = list.filter(t => !seen.includes(t.id));
  const fresh = pool.length ? seen : [];                 // круг пройден — начинаем заново
  if (!pool.length) {
    const last = seen[seen.length - 1];                  // но вчерашнюю мысль не повторяем
    pool = list.filter(t => t.id !== last);
    if (!pool.length) pool = list;
  }

  const pick = pool[Math.floor(Math.random() * pool.length)];
  saveDaily({ ...st, date: todayStr(), seen: [...fresh, pick.id].slice(-2000) });
  showDailyThought(pick);
}

function showDailyThought(t) {
  const mats = achMaterials();
  const m = mats.find(x => keyOf(x) === t.key);
  const a = (data.archive || []).find(x => x.id === t.key);
  const src = m || a || null;
  const icon = src ? (src.icon || "📖") : "📎";
  const title = src ? src.title : "Архив";
  const cover = src && src.cover ? src.cover : "";
  const fmt = new Intl.DateTimeFormat("ru", { day: "numeric", month: "long", year: "numeric" });

  $("#cheerStep").hidden = true;
  $("#cheerIc").textContent = "💭";
  $("#cheerTitle").textContent = "Мысль дня";
  $("#cheerText").innerHTML = `
    <span class="dt-src">
      <span class="th-cover">${cover ? `<img src="${esc(cover)}" alt="">` : `<i>${icon}</i>`}</span>
      <span class="dt-src-txt"><b>${esc(title)}</b><em>${esc(fmt.format(fromStr(t.date)))}</em></span>
    </span>
    <span class="dt-text">${esc(t.text)}</span>
    <button class="th-link dt-like ${t.liked ? "on" : ""}" id="dtLike" type="button">${t.liked ? "♥ В любимых" : "♡ Нравится"}</button>`;
  $("#cheerOk").textContent = "Спасибо";
  $("#cheer").classList.remove("fact");
  $("#cheer").classList.add("show", "daily");

  $("#dtLike").addEventListener("click", () => {
    const th = (data.thoughts || []).find(x => x.id === t.id);
    if (!th) return;
    th.liked = !th.liked;
    th.updatedAt = now();
    saveData(); schedulePush();
    const b = $("#dtLike");
    b.classList.toggle("on", !!th.liked);
    b.textContent = th.liked ? "♥ В любимых" : "♡ Нравится";
    if (navigator.vibrate) navigator.vibrate(12);
  });
}

function dailyUI() {
  const st = dailyState();
  return `
    <div class="freeze">
      <div class="fz-head">💭 <b>Мысль дня</b> — раз в день показываю одну из записанных мыслей, без повторов</div>
      <div class="pick-row">
        <button class="pick ${!st.off ? "on" : ""}" data-daily="on" type="button"><span class="pk-name">Показывать</span></button>
        <button class="pick ${st.off ? "on" : ""}" data-daily="off" type="button"><span class="pk-name">Не показывать</span></button>
      </div>
    </div>`;
}

/* Атмосфера: звук материала на главной. По умолчанию выключено —
   играть без спроса нельзя, да и iOS всё равно потребует касания. */
function soundUI() {
  const has = audioUrls.get(curKey());
  return `
    <div class="freeze">
      <div class="fz-head">🎧 <b>Атмосфера</b> — на главной тихо звучит материал, который сейчас открыт</div>
      <div class="pick-row">
        <button class="pick ${cfg.sound ? "on" : ""}" data-sound="on" type="button"><span class="pk-name">Включить</span></button>
        <button class="pick ${!cfg.sound ? "on" : ""}" data-sound="off" type="button"><span class="pk-name">Тишина</span></button>
      </div>
      ${cfg.sound ? `<div class="pick-row bg-row">${BG_PRESETS.map(p => `
        <button class="pick ${bgPreset().id === p.id ? "on" : ""}" data-bg="${p.id}" type="button">
          <span class="pk-name">${p.name}</span><span class="pk-hint">${p.hint}</span>
        </button>`).join("")}</div>` : ""}
      <div class="fz-note">${cfg.sound
        ? (has ? "У текущего материала звук есть" : "У текущего материала звука пока нет — тишина")
        : "Звук есть не у всех материалов"}</div>
    </div>`;
}

function bindSoundUI() {
  document.querySelectorAll("[data-sound]").forEach(b =>
    b.addEventListener("click", () => {
      cfg.sound = b.dataset.sound === "on";
      saveCfg();
      audioUnlocked = true;         // это и есть нужный жест
      render();
      toast(cfg.sound ? "Атмосфера включена" : "Тишина");
    }));
  document.querySelectorAll("[data-bg]").forEach(b =>
    b.addEventListener("click", () => {
      cfg.bgPreset = b.dataset.bg; saveCfg();
      if (window.waveRebuild) waveRebuild();
      render();
      toast("Фон: " + bgPreset().name);
    }));
}

function bindDailyUI() {
  document.querySelectorAll("[data-daily]").forEach(b =>
    b.addEventListener("click", () => {
      const st = dailyState();
      st.off = b.dataset.daily === "off";
      saveDaily(st);
      render();
      toast(st.off ? "Мысль дня выключена" : "Мысль дня включена");
    }));
}

// кнопки в углу ленты мыслей: счётчик любимых и кубик со случайной записью
function syncNotesFabs() {
  const like = $("#likeFab"), dice = $("#diceFab");
  if (!like || !dice) return;
  const here = tab === "notes" && !settingsOpen && data && data.thoughts;
  const total = here ? thoughts().length : 0;
  const n = here ? thoughts().filter(t => t.liked).length : 0;
  like.classList.toggle("show", n > 0);
  like.classList.toggle("on", notesFilter === "liked");
  like.innerHTML = `<i>${notesFilter === "liked" ? "♥" : "♡"}</i><b>${n}</b>`;
  dice.classList.toggle("show", total > 1);
}

// материал в том виде, в каком его понимает withMaterial
const viewOf = (m) => ({ track: m.track, pieceId: m.pieceId || null, bookId: m.bookId || null, videoId: m.videoId || null });


/* ══════════ Практика: занятие по плану ══════════
   Пьеса режется на части там, где меняется фактура, и каждая доводится
   до целого, прежде чем начнётся следующая: сорок тактов, разобранных
   вширь по одному, не складываются ни во что.

   Внутри части лесенка 1 → 2 → 4 → часть целиком, отрезок доигрывается
   до первой ноты следующего (иначе куски не склеиваются), руки порознь
   и затем вместе. Когда все части готовы — сращиваем их попарно.

   В конце занятие само пишет обычную отметку: такты и руки, над которыми
   работал. Ручной механизм не дублируется, а кормится. */

const PRAC_REST_AT = 20, PRAC_STOP_AT = 60, PRAC_ASK_AGAIN = 12, PRAC_REVIEW_N = 2;
const PRAC_HAND = { left: "левая рука", right: "правая рука", both: "две руки" };

let prac = null;          // состояние идущего занятия
let pracTimer = 0;

const pracDoc = () => PRACTICE_DATA[piece().id] || null;

/* Части: из разбора, а если его нет — механически по четыре такта. */
function pracParts() {
  const doc = pracDoc();
  const bars = piece().bars;
  if (doc && doc.parts && doc.parts.length) {
    /* Разбор мог делаться по другому изданию: подрезаем под то число тактов,
       которое стоит у пьесы, а хвост дописываем к последней части. */
    const out = [];
    for (const p of doc.parts) {
      if (p.from > bars) break;
      out.push({ i: out.length, from: p.from, to: Math.min(p.to, bars), why: p.why || "" });
    }
    if (out.length && out[out.length - 1].to < bars) out[out.length - 1].to = bars;
    if (out.length) return out;
  }
  const out = [];
  for (let f = 1; f <= bars; f += 4)
    out.push({ i: out.length, from: f, to: Math.min(bars, f + 3), why: "" });
  return out;
}

function pracAssembly(parts) {
  let cur = parts.map((p) => ({ from: p.from, to: p.to }));
  const out = [];
  while (cur.length > 1) {
    const next = [];
    for (let i = 0; i < cur.length; i += 2)
      next.push(cur[i + 1] ? { from: cur[i].from, to: cur[i + 1].to } : cur[i]);
    out.push(next);
    cur = next;
  }
  return out;
}

const pracStore = () => {
  data.practice = data.practice || {};
  const id = piece().id;
  data.practice[id] = data.practice[id] || { done: {}, session: 0 };
  return data.practice[id];
};

const pracKey = (u, hand) => u.size + ":" + u.from + "-" + u.to + ":" + hand;
/* Последнее окно сдвигается назад, а не обрезается. Часть из пяти тактов
   на этапе «по 4 такта» давала окна 1–4 и 5–5 — одинокий такт противоречил
   названию этапа. Теперь это 1–4 и 2–5: окно всегда той длины, что обещано,
   и каждый такт хоть раз оказывается внутри полного отрезка. */
const pracUnits = (from, to, size) => {
  const len = to - from + 1;
  if (size >= len) return [{ from, to, size: len }];
  const out = [];
  for (let f = from; f <= to; f += size) {
    let a = f, b = f + size - 1;
    if (b > to) { b = to; a = to - size + 1; }
    if (out.length && out[out.length - 1].from === a) break;
    out.push({ from: a, to: b, size });
    if (b === to) break;
  }
  return out;
};
const pracSteps = (p) => {
  const len = p.to - p.from + 1;
  return [1, 2, 4, len].filter((x, i, a) => x <= len && a.indexOf(x) === i);
};

/* Какие руки звучат на отрезке. В начале прелюдии левая молчит три такта —
   предлагать её разбор было бы бессмыслицей; а если звучит одна рука,
   то и соединять нечего. */
function pracHands(u) {
  const doc = pracDoc();
  if (!doc || !doc.hints) return u.size >= 4 ? ["both"] : ["left", "right", "both"];
  let r = false, l = false;
  for (let b = u.from; b <= u.to; b++) {
    const h = doc.hints[b];
    if (!h) { r = l = true; break; }
    if (h.r) r = true;
    if (h.l) l = true;
  }
  if (r && !l) return ["right"];
  if (l && !r) return ["left"];
  if (!r && !l) return [];
  return u.size >= 4 ? ["both"] : ["left", "right", "both"];
}

const pracIsDone = (u, h) => !!pracStore().done[pracKey(u, h)];
const pracUnitDone = (u) => pracHands(u).every((h) => pracIsDone(u, h));
const pracStepDone = (p, size) => pracUnits(p.from, p.to, size).every(pracUnitDone);
const pracPartDone = (p) => pracSteps(p).every((size) => pracStepDone(p, size));
const pracAsUnit = (sp) => ({ from: sp.from, to: sp.to, size: sp.to - sp.from + 1 });

/* Имя этапа словами. Кружки «1 · 2 · 4 · всё» читались как шифр: цифры
   не говорят, что от тебя хотят и почему именно так. */
function pracStepName(size, part) {
  if (part && size === part.to - part.from + 1) return "Часть целиком";
  if (size === 1) return "Каждый такт по отдельности";
  return "По " + size + " " + plural(size, "такту", "такта", "тактов") + " подряд";
}

const seamUnit = (a, b) => ({ from: a.from, to: b.to, size: b.to - a.from + 1 });

/* Шов сращивается сразу, как только готовы обе соседние части, а не в конце
   пьесы. Иначе выходило бы странно: первая часть звучит, вторая звучит,
   а вместе они впервые встречаются только когда выучено всё. */
function pracWhere() {
  const parts = pracParts();

  /* Выбранная руками часть идёт вперёд очереди: иногда нужно вернуться
     к старому куску, не дожидаясь, пока до него дойдёт порядок. */
  if (prac && prac.pick != null && parts[prac.pick]) {
    const p = parts[prac.pick];
    for (const size of pracSteps(p))
      if (!pracStepDone(p, size)) return { parts, part: p, size, picked: true };
    const whole = { from: p.from, to: p.to, size: p.to - p.from + 1 };
    return { parts, part: p, size: whole.size, picked: true, refresh: true };
  }

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!pracPartDone(p)) {
      for (const size of pracSteps(p)) if (!pracStepDone(p, size)) return { parts, part: p, size };
    }
    if (i > 0 && pracPartDone(parts[i - 1]) && pracPartDone(p)) {
      const seam = seamUnit(parts[i - 1], p);
      if (!pracUnitDone(seam)) return { parts, seam, a: parts[i - 1], b: p };
    }
  }
  /* Крупная сборка идёт дальше швов: пары соседних частей уже пройдены,
     поэтому первый уровень пропускаем. */
  const asm = pracAssembly(parts).slice(1);
  for (let i = 0; i < asm.length; i++)
    if (!asm[i].map(pracAsUnit).every(pracUnitDone)) return { parts, asm, assembly: i };
  return { parts, asm, assembly: Math.max(0, asm.length - 1), finished: true };
}

function pracQueue() {
  const w = pracWhere();
  const store = pracStore();
  const q = [];
  // освежаем давнее только в начале занятия
  (prac.reviewed.length >= PRAC_REVIEW_N ? [] : Object.entries(store.done))
    .filter(([k]) => !prac.reviewed.includes(k))
    .sort((a, b) => String(a[1]).localeCompare(String(b[1])))
    .slice(0, PRAC_REVIEW_N)
    .forEach(([k]) => {
      const [size, span, hand] = k.split(":");
      const [from, to] = span.split("-").map(Number);
      q.push({ from, to, size: +size, hand, review: true, k });
    });
  const us = w.seam ? [w.seam]
    : w.part ? pracUnits(w.part.from, w.part.to, w.size)
    : (w.asm[w.assembly] || []).map(pracAsUnit);
  for (const u of us)
    for (const h of pracHands(u))
      if (w.refresh) q.push({ from: u.from, to: u.to, size: u.size, hand: h, review: true, k: pracKey(u, h) });
      else if (!pracIsDone(u, h)) q.push({ from: u.from, to: u.to, size: u.size, hand: h });
  return q;
}

const pracMin = () => prac && prac.startedAt ? (Date.now() - prac.startedAt - prac.breakMs) / 60000 : 0;

function pracWatch() {
  if (!prac || !prac.startedAt) return;
  if (["break", "resting", "wrap"].includes(prac.screen)) return;
  const m = pracMin();
  if (m >= PRAC_STOP_AT && m - prac.askedAt >= PRAC_ASK_AGAIN) {
    prac.askedAt = m; prac.back = prac.screen; prac.screen = "wrap"; pracRender(); return;
  }
  if (m >= PRAC_REST_AT && m - prac.askedAt >= PRAC_ASK_AGAIN) {
    prac.askedAt = m; prac.back = prac.screen; prac.screen = "break"; pracRender();
  }
}

const pracSpan = (u) => u.from === u.to ? "такт " + u.from : "такты " + u.from + "–" + u.to;

function pracHintHTML(u) {
  const doc = pracDoc();
  if (!doc || !doc.hints) return "";
  const want = u.hand === "both" ? ["r", "l"] : u.hand === "left" ? ["l"] : ["r"];
  const rows = [];
  for (let b = u.from; b <= u.to; b++) {
    const h = doc.hints[b];
    if (!h) { rows.push(`<div class="pr-hb"><span class="pr-hn">Т${b}</span><span class="pr-hh">подсказки нет</span></div>`); continue; }
    const parts = want.filter((k) => h[k]).map((k) =>
      `<span class="pr-hh">${k === "r" ? "пр." : "лев."}</span> ${h[k]}`);
    rows.push(`<div class="pr-hb"><span class="pr-hn">Т${b}</span>${
      parts.length ? parts.join("<br>") : '<span class="pr-hh">молчит</span>'}</div>`);
  }
  if (!rows.length) return "";
  return `<div class="pr-hint">${rows.join("")}<p class="pr-leg">${esc(doc.legend || "")}</p></div>`;
}

/* Части списком, а не равными столбиками: столбики читались как сплошная
   размазанная полоса — не видно ни границ групп, ни того, что это за куски. */
function pracPartsHTML(w) {
  return '<div class="pr-plist">' + w.parts.map((p) => {
    const steps = pracSteps(p);
    let all = 0, ok = 0;
    for (const size of steps)
      for (const u of pracUnits(p.from, p.to, size)) {
        const hs = pracHands(u);
        all += hs.length;
        ok += hs.filter((h) => pracIsDone(u, h)).length;
      }
    const pct = all ? Math.round(ok / all * 100) : 0;
    const done = pracPartDone(p), now = w.part && w.part.i === p.i;
    return `<button class="pr-p ${done ? "done" : now ? "now" : ""}" data-part="${p.i}" type="button">
      <div class="pr-p-top">
        <b>${p.from}–${p.to}</b>
        <em>${esc(p.why || "часть " + (p.i + 1))}</em>
        <span>${done ? "готово" : pct ? pct + "%" : ""}</span>
      </div>
      <span class="pr-p-bar"><i style="width:${pct}%"></i></span>
    </button>`;
  }).join("") + "</div>";
}

function pracLadderHTML(w) {
  if (w.seam) {
    return `<div class="pr-ladder"><div class="pr-lvl now"><b>шов</b>
      <span class="tr"><i style="width:0%"></i></span><span>0/1</span></div></div>`;
  }
  if (!w.part) {
    return `<p class="pr-cap-line">Все части зазвучали — <b>собираем пьесу</b></p>`
      + '<div class="pr-ladder">' + w.asm.map((level, li) => {
        const us = level.map(pracAsUnit);
        const d = us.filter(pracUnitDone).length;
        const name = us.length === 1 ? "вся пьеса"
          : "по " + us.length + " " + plural(us.length, "куску", "куска", "кусков");
        return `<div class="pr-lvl ${li === w.assembly ? "now" : ""}"><b>${name}</b>
          <span class="tr"><i style="width:${Math.round(d / us.length * 100)}%"></i></span>
          <span>${d}/${us.length}</span></div>`;
      }).join("") + "</div>";
  }
  const p = w.part;
  return '<div class="pr-ladder">' + pracSteps(p).map((size) => {
      const us = pracUnits(p.from, p.to, size);
      const d = us.filter(pracUnitDone).length;
      const name = size === p.to - p.from + 1 ? "часть целиком"
        : size === 1 ? "по 1 такту" : "по " + size + " " + plural(size, "такту", "такта", "тактов");
      return `<div class="pr-lvl ${size === w.size ? "now" : ""}"><b>${name}</b>
        <span class="tr"><i style="width:${Math.round(d / us.length * 100)}%"></i></span>
        <span>${d}/${us.length}</span></div>`;
    }).join("") + "</div>";
}

/* Плеер с записью материала. Не стандартный: главное здесь — выделить кусок
   и гонять его по кругу, а не слушать запись подряд. По умолчанию выделено
   всё; двигаешь края — остаётся отрезок, который повторяется сам. */
let pracAudioEl = null, pracRaf = 0;
const PRAC_LOOP_LS = "keiko-practice-loop-v1";
const pracLoops = (() => { try { return JSON.parse(localStorage.getItem(PRAC_LOOP_LS)) || {}; } catch { return {}; } })();
const pracSaveLoops = () => { try { localStorage.setItem(PRAC_LOOP_LS, JSON.stringify(pracLoops)); } catch {} };

const plClock = (t) => {
  if (!isFinite(t)) return "0:00";
  const m = Math.floor(t / 60), sec = Math.floor(t % 60);
  return m + ":" + String(sec).padStart(2, "0");
};

function plSel(id, dur) {
  const l = pracLoops[id];
  if (l && isFinite(l.a) && isFinite(l.b) && l.b > l.a) return { a: l.a, b: Math.min(l.b, dur || l.b) };
  return { a: 0, b: dur || 0 };
}

function plPaint() {
  const el = pracAudioEl, box = $("#pracPlayer");
  if (!el || !box || box.hidden) return;
  const dur = el.duration || 0;
  const sel = plSel(el.dataset.for, dur);
  const pc = (t) => dur ? Math.max(0, Math.min(100, t / dur * 100)) : 0;
  const S = box.querySelector(".pl-sel"), A = box.querySelector('[data-h="a"]'),
        B = box.querySelector('[data-h="b"]'), P = box.querySelector(".pl-head"),
        T = box.querySelector(".pl-time");
  if (!S) return;
  S.style.left = pc(sel.a) + "%";
  S.style.width = Math.max(0, pc(sel.b) - pc(sel.a)) + "%";
  A.style.left = pc(sel.a) + "%";
  B.style.left = pc(sel.b) + "%";
  P.style.left = pc(el.currentTime) + "%";
  T.textContent = plClock(el.currentTime) + " · отрезок " + plClock(sel.a) + "–" + plClock(sel.b);
  const btn = box.querySelector('[data-pl="play"]');
  if (btn) btn.textContent = el.paused ? "▶︎ Слушать" : "❚❚ Пауза";
}

/* Петля: дошли до правого края — возвращаемся к левому, кусок повторяется
   сам. Проверка висит на двух источниках. Кадры анимации точнее, но замирают,
   когда экран гаснет или приложение уходит в фон, — а звук при этом играет
   дальше и уезжает за край. Событие самого аудио идёт всегда, просто реже. */
function plLoopCheck() {
  const el = pracAudioEl;
  if (!el || el.paused) return;
  const dur = el.duration || 0;
  const sel = plSel(el.dataset.for, dur);
  if (dur && el.currentTime >= sel.b - 0.03) {
    try { el.currentTime = sel.a; } catch {}
  }
}

function plTick() {
  cancelAnimationFrame(pracRaf);
  const step = () => {
    if (!pracAudioEl) return;
    plLoopCheck();
    plPaint();
    pracRaf = requestAnimationFrame(step);
  };
  pracRaf = requestAnimationFrame(step);
}

function pracPlayer() {
  const box = $("#pracPlayer");
  if (!box) return;
  const id = piece().id;
  const url = audioUrls.get(id);

  if (!url) {
    if (!audioUrls.has(id)) { pullAudio(id); box.hidden = false; box.innerHTML = '<p class="pl-wait">Запись загружается…</p>'; }
    else box.hidden = true;
    return;
  }
  if (pracAudioEl && pracAudioEl.dataset.for === id) { box.hidden = false; return; }

  box.hidden = false;
  box.innerHTML = `
    <div class="pl-top"><b>Как это звучит</b><span class="pl-time">0:00</span></div>
    <div class="pl-bar">
      <div class="pl-sel"></div>
      <div class="pl-head"></div>
      <div class="pl-h" data-h="a"></div>
      <div class="pl-h" data-h="b"></div>
    </div>
    <div class="pl-jump">
      <button data-pl="play">▶︎ Слушать</button>
      <button data-pl="all">Весь трек</button>
    </div>
    <audio preload="metadata" data-for="${esc(id)}" src="${esc(url)}"></audio>`;
  pracAudioEl = box.querySelector("audio");
  pracAudioEl.addEventListener("loadedmetadata", plPaint);
  pracAudioEl.addEventListener("play", plTick);
  pracAudioEl.addEventListener("pause", plPaint);
  pracAudioEl.addEventListener("timeupdate", () => { plLoopCheck(); plPaint(); });
  plPaint();
}

/* Тянем края выделения. Считаем по ширине дорожки, а не по времени: палец
   двигается по экрану, а не по секундам. */
function plDrag(e) {
  const box = $("#pracPlayer");
  const h = e.target.closest("[data-h]");
  const bar = box && box.querySelector(".pl-bar");
  if (!h || !bar || !pracAudioEl) return;
  const which = h.dataset.h;
  const id = pracAudioEl.dataset.for;
  const dur = pracAudioEl.duration || 0;
  if (!dur) return;
  e.preventDefault();

  const move = (ev) => {
    const r = bar.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
    const t = x * dur;
    const cur = plSel(id, dur);
    const next = which === "a"
      ? { a: Math.min(t, cur.b - 0.5), b: cur.b }
      : { a: cur.a, b: Math.max(t, cur.a + 0.5) };
    pracLoops[id] = next;
    if (pracAudioEl.currentTime < next.a || pracAudioEl.currentTime > next.b)
      try { pracAudioEl.currentTime = next.a; } catch {}
    plPaint();
  };
  const up = () => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    pracSaveLoops();
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
}

/* ══════════ Курс: урок = видео плюс задание ══════════
   У пьесы единица — такт, у курса — урок. Внутри урока два шага: посмотреть
   и сделать задание. Задание есть не всегда, поэтому про него спрашивают,
   а не заставляют. Час, проведённый над десятиминутным уроком, — это
   не провал, а честное число, и оно записывается как есть. */
const lessons = () => (course().lessons || []);
const lessonStore = () => {
  data.practice = data.practice || {};
  data.practice.pastel = data.practice.pastel || { done: {}, session: 0, log: [] };
  return data.practice.pastel;
};
const lessonDone = (i, step) => !!lessonStore().done["L" + i + ":" + step];

/* Первый урок, который ещё не закрыт. Закрыт — когда просмотрен и по нему
   решён вопрос с заданием. */
/* Ступени урока: посмотреть → повторить за автором → сделать своё.
   Повтор и своя работа — разные вещи: за автором рука идёт по проложенной
   колее, а своё начинается с чистого листа, и застреваешь обычно там. */
const LESSON_STEPS = [
  { k: "watch",  name: "Смотрим",            go: "Посмотрел" },
  { k: "repeat", name: "Повторяю за автором", go: "Повторил" },
  { k: "own",    name: "Делаю своё",          go: "Сделал" },
];

function lessonNext() {
  const ls = lessons();
  for (let i = 0; i < ls.length; i++) {
    if (!lessonDone(i, "watch")) return { i, phase: "watch" };
    if (!lessonDone(i, "task")) return { i, phase: "ask" };
    if (lessonStore().done["L" + i + ":task"] === "нет") continue;
    if (!lessonDone(i, "repeat")) return { i, phase: "repeat" };
    if (!lessonDone(i, "own")) return { i, phase: "own" };
  }
  return null;
}

function lessonRender(box) {
  const ls = lessons();
  const at = prac.at;
  if (!at) {
    box.innerHTML = `
      <div class="pr-mid">
        <p class="pr-kind">курс пройден</p>
        <div class="pr-big sm">Все уроки закрыты</div>
      </div>
      <div class="pr-bot"><button class="pr-main" data-prac="finish">Завершить</button></div>`;
    return;
  }
  const l = ls[at.i] || {};
  const mins = Math.round((l.dur || 0) / 60);

  if (at.phase === "watch") {
    box.innerHTML = `
      <div class="pr-mid">
        <p class="pr-kind">урок ${at.i + 1} из ${ls.length} · смотрим</p>
        <div class="pr-big sm">${esc(l.title || "Урок " + (at.i + 1))}</div>
        <p class="pr-hand">${mins ? mins + " " + plural(mins, "минута", "минуты", "минут") : "видео"}</p>
        <p class="pr-next">смотри у себя, здесь только отмечаешь</p>
      </div>
      <div class="pr-bot">
        <button class="pr-go" data-les="watched">Посмотрел</button>
        <div class="pr-row"><button class="pr-ghost" data-prac="finish">Закончить</button></div>
      </div>`;
    return;
  }

  if (at.phase === "ask") {
    box.innerHTML = `
      <div class="pr-mid">
        <p class="pr-kind">урок ${at.i + 1} из ${ls.length}</p>
        <div class="pr-big sm">Было практическое задание?</div>
        <p class="pr-hand">${esc(l.title || "Урок " + (at.i + 1))}</p>
      </div>
      <div class="pr-bot">
        <button class="pr-go" data-les="taskYes">Было, берусь</button>
        <div class="pr-row">
          <button class="pr-ghost" data-les="noTask">Задания не было</button>
          <button class="pr-ghost" data-prac="finish">Закончить</button>
        </div>
      </div>`;
    return;
  }

  if (prac.screen === "photo") {
    box.innerHTML = `
      <div class="pr-mid">
        <p class="pr-kind">урок ${prac.photoFor + 1} · работа готова</p>
        <div class="pr-big sm">Сфотографируем, что вышло?</div>
        <p class="pr-next">снимок ляжет в моменты — потом видно, как менялось</p>
      </div>
      <div class="pr-bot">
        <button class="pr-go" data-les="photoYes">Сфотографировать</button>
        <div class="pr-row"><button class="pr-ghost" data-les="photoNo">Не хочу</button></div>
      </div>`;
    return;
  }

  const step = LESSON_STEPS.find((x) => x.k === at.phase) || LESSON_STEPS[1];
  const sec = prac.taskAt ? Math.round((Date.now() - prac.taskAt) / 1000) : 0;
  const m = Math.floor(sec / 60);
  box.innerHTML = `
    <div class="pr-mid">
      <p class="pr-kind">урок ${at.i + 1} из ${ls.length} · ${esc(step.name.toLowerCase())}</p>
      <div class="pr-big">${m}:${String(sec % 60).padStart(2, "0")}</div>
      <p class="pr-hand">${esc(l.title || "Урок " + (at.i + 1))}</p>
      <p class="pr-next">${at.phase === "repeat"
        ? "идёшь за автором шаг в шаг"
        : "теперь своё — залипнуть тут надолго нормально, время считается"}</p>
    </div>
    <div class="pr-bot">
      <button class="pr-go" data-les="stepDone">${step.go}</button>
      <div class="pr-row">
        <button class="pr-ghost" data-les="stepLater">Не доделал</button>
        <button class="pr-ghost" data-prac="finish">Закончить</button>
      </div>
    </div>`;
}

/* ══════════ События в ленте ══════════
   Награда, завершённый материал, проведённое занятие — это не мысли, их
   не пишут руками. Но в ленте они на месте: получается таймлайн, по которому
   видно, что и когда случилось. В случайную выборку они не попадают —
   «одна наугад» должна вытаскивать твои слова, а не отчёт приложения. */
/* Что сделано в этот день — коротко, для карточки события. */
function sessionText(track, e) {
  if (track === "book") {
    const b = (data.book.books || []).find((x) => x.id === (e.bookId || "snow-1"));
    return "Читал: " + ((b && b.title) || "книга") + (e.page ? " · до " + e.page + "-й стр." : "");
  }
  if (track === "piano") {
    const p = (data.piano.pieces || []).find((x) => x.id === (e.pieceId || "bwv853"));
    return "Занимался: " + ((p && p.name) || "пьеса") + (e.mins ? " · " + e.mins + " мин" : "");
  }
  if (track === "pastel") return "Урок: " + (course().name || "курс")
    + (e.lessons && e.lessons.length ? " · " + e.lessons.length + " " + plural(e.lessons.length, "урок", "урока", "уроков") : "");
  return "Занимался";
}

function addEvent(kind, key, track, text, extra) {
  data.thoughts = data.thoughts || [];
  const date = (extra && extra.date) || todayStr();
  const id = "ev:" + kind + ":" + (extra && extra.tag ? extra.tag : key) + ":" + date;
  const fields = (extra && extra.fields) || {};

  /* Карточка дня одна, но заходов за день бывает несколько. Раньше второй
     заход просто отказывался писать — и всё, что открылось в нём, пропадало
     бесследно. Теперь он дополняет прежнюю карточку. */
  const was = data.thoughts.find((t) => t.id === id && !t.deleted);
  if (was) {
    const join = (a, b) => {
      const seen = new Set((a || []).map((x) => x.id));
      return (a || []).concat((b || []).filter((x) => x && !seen.has(x.id)));
    };
    if (fields.awards) was.awards = join(was.awards, fields.awards);
    if (fields.facts) was.facts = join(was.facts, fields.facts);
    if (text) was.text = text;                 // «18 мин» превращается в «41 мин»
    if (fields.mins) was.mins = fields.mins;
    was.updatedAt = now();
    return was;
  }

  const rec = Object.assign({
    id, key, track, event: kind, text,
    /* Полдень — только если о настоящем времени ничего не известно: у награды
       за прошлое его взять неоткуда, а врать точным часом хуже, чем округлить. */
    date, createdAt: fromStr(date).getTime() + 12 * 3600 * 1000, updatedAt: now(),
  }, extra && extra.fields);
  if (!rec.createdAt) rec.createdAt = fromStr(date).getTime() + 12 * 3600 * 1000;
  data.thoughts.push(rec);
  return rec;
}

/* Награды, полученные до того, как появилась лента, в ней отсутствуют.
   Проигрываем историю заново: подставляем записи по одной в хронологии
   и смотрим, на какой день награда впервые стала полученной. Это настоящая
   дата, а не «сегодня» — иначе таймлайн соврал бы. */
/* Раньше здесь была догрузка наград задним числом. Она давала неверную
   картину: награда, заработанная давно, привязывалась к первой попавшейся
   отметке того дня, когда её заметили. Убрана вместе с тем, что успела
   насочинять; дальше события пишутся только вживую, со своим временем.

   Ранее полученное при этом не теряется: приложение помечает его как уже
   учтённое, чтобы оно не всплыло «новым» на следующем занятии. */
function eventsReset() {
  if (data.eventsV === 4) return;
  /* Прошлая чистка сносила ВСЕ события разом — вместе с одиночными наградами
     под нож попал и след досмотренного видео. Возвращаем его: у ролика есть
     doneAt, настоящее время, когда он был отмечен, — врать не приходится. */
  for (const v of ((data.watch && data.watch.videos) || []))
    if (v.done && v.doneAt) addEvent("done", v.id, "watch", "Досмотрел: " + v.title,
      { tag: v.id, date: dateStr(new Date(v.doneAt)), fields: { createdAt: v.doneAt } });

  data.achAt = data.achAt || {};
  data.factAt = data.factAt || {};

  const mark = (view, key) => withMaterial(view, () => {
    for (const a of achState()) if (a.done && data.achAt[key + ":" + a.id] === undefined) data.achAt[key + ":" + a.id] = 1;
    for (const f of factsState()) if (f.open && data.factAt[key + ":" + f.id] === undefined) data.factAt[key + ":" + f.id] = 1;
  });
  for (const pc of (data.piano.pieces || [])) mark({ track: "piano", pieceId: pc.id }, pc.id);
  for (const b of (data.book.books || [])) mark({ track: "book", bookId: b.id }, b.id);
  if (course().lessons.length) mark({ track: "pastel" }, "pastel");

  data.eventsV = 4;
  saveData();
  schedulePush();
}

/* Снимок работы кладём обычным моментом: то же хранилище, тот же вид,
   просто заведён не руками. */
function lessonPhoto(i, blob) {
  const l = lessons()[i] || {};
  const mid = uid();
  data.thoughts.push({
    id: uid(), key: "pastel", track: "pastel",
    text: "Работа по уроку «" + (l.title || "Урок " + (i + 1)) + "»",
    date: todayStr(), mediaId: mid, mediaKind: "photo",
    createdAt: now(), updatedAt: now(),
  });
  takeSave(mid, blob).then(() => takePush(mid, blob)).catch(() => {});
  saveData();
  schedulePush();
}

/* Запись занятия по курсу — обычная отметка урока, как при ручной. */
function lessonEntry(make) {
  const ds = todayStr();
  let e = data.pastel.entries.find((x) => !x.deleted && x.date === ds);
  if (!e && make) {
    e = { id: uid(), date: ds, courseId: course().id, lessons: [], mins: 0, sessions: 0,
          note: "урок по плану", createdAt: now(), updatedAt: now() };
    data.pastel.entries.push(e);
  }
  return e || null;
}

function lessonCount() {
  const e = lessonEntry(true);
  if (!prac.sessionCounted) { e.sessions = (e.sessions || 0) + 1; prac.sessionCounted = true; }
  const cur = pracMin();
  e.mins = Math.round((e.mins || 0) + Math.max(0, cur - (prac.counted || 0)));
  prac.counted = cur;
  e.note = "урок по плану · " + e.mins + " мин"
    + (e.sessions > 1 ? " · " + e.sessions + " " + plural(e.sessions, "подход", "подхода", "подходов") : "");
  e.updatedAt = now();
  return e;
}

function lessonMark(i) {
  const e = lessonEntry(true);
  if (!e.lessons.includes(i)) e.lessons.push(i);
  lessonCount();
  saveData();
  schedulePush();
}

function lessonNote(i, step, sec) {
  if (!sec || sec > 6 * 3600) return;
  const st = lessonStore();
  st.log = st.log || [];
  st.log.push({ i, step, sec, d: todayStr() });
  if (st.log.length > 800) st.log.splice(0, st.log.length - 800);
}

function pracRender() {
  if (!prac) return;
  if (prac.kind === "lesson") {
    $("#pracWhere").textContent = course().name + (prac.startedAt ? " · " + Math.floor(pracMin()) + " мин" : "");
    const pl = $("#pracPlayer"); if (pl) pl.hidden = true;
    if (["break", "resting", "wrap"].includes(prac.screen)) { /* общие экраны ниже */ }
    else { lessonRender($("#pracStage")); return; }
  }
  const w = pracWhere();
  const m = Math.floor(pracMin());
  $("#pracWhere").textContent = piece().name + (prac.startedAt ? " · " + m + " мин" : "");
  const box = $("#pracStage");

  if (prac.screen !== "work") { const pl = $("#pracPlayer"); if (pl) pl.hidden = true; }

  if (prac.screen === "start") {
    const p = w.part;
    const named = w.parts.some((x) => x.why);
    box.innerHTML = `
      <div class="pr-mid">
        <p class="pr-kind">занятие ${pracStore().session + 1}</p>
        ${w.seam ? `
          <div class="pr-big sm">такты ${w.seam.from}–${w.seam.to}</div>
          <p class="pr-hand">шов · части ${w.a.i + 1} и ${w.b.i + 1}</p>
          <p class="pr-tail">обе части уже звучат порознь</p>`
          : p ? `
          <div class="pr-big sm">${esc(p.why || "такты " + p.from + "–" + p.to)}</div>
          <p class="pr-hand">часть ${p.i + 1} из ${w.parts.length} · такты ${p.from}–${p.to}</p>
          <p class="pr-next">сейчас: ${esc(pracStepName(w.size, p).toLowerCase())}</p>`
          : `<div class="pr-big sm">Собираем пьесу</div><p class="pr-hand">все части готовы</p>`}
        ${pracPartsHTML(w)}
        ${named ? "" : '<p class="pr-tail">разбор ещё не приехал — части поделены по четыре такта</p>'}
      </div>
      <div class="pr-bot">
        <button class="pr-main" data-prac="begin">${pracStore().session ? "Продолжить" : "Начать занятие"}</button>
        <div class="pr-row"><button class="pr-ghost" data-prac="reset">Начать пьесу заново</button></div>
      </div>`;
    return;
  }

  if (prac.screen === "break") {
    box.innerHTML = `
      <div class="pr-mid">
        <p class="pr-kind">передышка</p>
        <div class="pr-big">${m} мин</div>
        <p class="pr-tail">дальше занятие идёт вхолостую</p>
      </div>
      <div class="pr-bot">
        <button class="pr-main" data-rest="5">Перерыв 5 минут</button>
        <div class="pr-row">
          <button class="pr-ghost" data-rest="10">10 минут</button>
          <button class="pr-ghost" data-rest="0">Ещё поиграю</button>
        </div>
      </div>`;
    return;
  }

  if (prac.screen === "resting") {
    const left = Math.max(0, prac.restUntil - Date.now());
    box.innerHTML = `
      <div class="pr-mid">
        <p class="pr-kind">перерыв</p>
        <div class="pr-big">${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, "0")}</div>
        <p class="pr-tail">встань, разомни кисти</p>
      </div>
      <div class="pr-bot">
        <button class="pr-main" data-prac="restDone">Продолжаем</button>
      </div>`;
    return;
  }

  if (prac.screen === "wrap") {
    box.innerHTML = `
      <div class="pr-mid">
        <p class="pr-kind">пора закругляться</p>
        <div class="pr-big">${m} мин</div>
        <p class="pr-tail">незакрытое не пропадёт</p>
      </div>
      <div class="pr-bot">
        <button class="pr-main" data-prac="finish">Завершить занятие</button>
        <div class="pr-row"><button class="pr-ghost" data-rest="0">Ещё немного</button></div>
      </div>`;
    return;
  }

  pracPlayer();
  const u = prac.cur;
  if (!u) { pracFinish(); return; }

  /* Что за этап, который сейчас, и что будет следующим. */
  let top = "", stage = "", after = "";
  if (u.review) {
    top = "повторяем пройденное";
    stage = "Освежаем то, что делали раньше";
  } else if (w.seam) {
    top = (w.a.why || "часть " + (w.a.i + 1)) + " + " + (w.b.why || "часть " + (w.b.i + 1));
    stage = "Стык двух частей";
    after = "обе части уже звучат порознь — важно только место склейки";
  } else if (w.part) {
    const steps = pracSteps(w.part);
    const at = steps.indexOf(w.size);
    top = w.part.why || `часть ${w.part.i + 1} из ${w.parts.length}`;
    stage = pracStepName(w.size, w.part);
    after = at + 1 < steps.length
      ? "дальше: " + pracStepName(steps[at + 1], w.part).toLowerCase()
      : (w.part.i + 1 < w.parts.length ? "дальше: стык со следующей частью" : "дальше: сборка пьесы");
  } else {
    top = "все части готовы";
    stage = "Собираем пьесу целиком";
  }

  box.innerHTML = `
    <div class="pr-mid">
      <p class="pr-kind">${esc(top)}</p>
      <p class="pr-stage">${esc(stage)}</p>
      <div class="pr-big">${pracSpan(u)}</div>
      <p class="pr-hand">${PRAC_HAND[u.hand]}</p>
      ${after ? `<p class="pr-next">${esc(after)}</p>` : ""}
      ${prac.hintOpen ? pracHintHTML(u) : ""}
    </div>
    <div class="pr-bot">
      <button class="pr-go" data-prac="ok">Получилось</button>
      <div class="pr-row">
        ${pracDoc() ? `<button class="pr-ghost" data-prac="hint">${prac.hintOpen ? "Скрыть ноты" : "Ноты"}</button>` : ""}
        ${prac.undo ? '<button class="pr-ghost" data-prac="undo">Отменить</button>' : ""}
        <button class="pr-ghost" data-prac="finish">Закончить</button>
      </div>
    </div>`;
}

function pracNext() {
  if (!prac.queue.length) prac.queue = pracQueue();
  prac.cur = prac.queue.shift() || null;
  prac.unitAt = Date.now();          // с этого мгновения считаем время на отрезок
  prac.screen = prac.cur ? "work" : "done";
  if (!prac.cur) { pracFinish(); return; }
  pracRender();
}

function openLesson() {
  if (!isCourse() || !lessons().length) { toast("Уроков пока нет"); return; }
  const at = lessonNext();
  prac = {
    kind: "lesson", screen: "work", at, taskAt: 0, stepAt: Date.now(), counted: 0,
    achBefore: achDoneSet(), factsBefore: factsOpenSet(),
    startedAt: Date.now(), breakMs: 0, restFrom: 0, restUntil: 0, askedAt: 0, back: "",
    cur: null, queue: [], closed: [], reviewed: [], pick: null, undo: null, hintOpen: false,
  };
  /* Запись не заводим на открытии: нажал «Начать урок», передумал и вышел —
     занятия не было, и в истории его быть не должно. Подход засчитается
     на первом настоящем действии. */
  $("#prac").hidden = false;
  $("#prac").setAttribute("aria-hidden", "false");
  clearInterval(pracTimer);
  pracTimer = setInterval(() => {
    if (!prac) return;
    if (prac.screen === "resting") { pracRender(); if (Date.now() >= prac.restUntil) pracEndRest(); }
    else { if (prac.taskAt) pracRender(); pracWatch(); }
  }, 1000);
  keepAwake(true);
  pracRender();
}

function openPractice() {
  if (!isPiano() || !piece().bars) { toast("Практика пока только для пьес"); return; }
  // разбора может не быть на этом устройстве — просим каталог сразу
  if (!pracDoc() && cfg.token && cfg.catalogId)
    catalogPull(true).then(() => { if (prac) pracRender(); }).catch(() => {});
  prac = {
    screen: "start", cur: null, queue: [], closed: [], reviewed: [], pick: null, undo: null,
    achBefore: achDoneSet(), factsBefore: factsOpenSet(),
    startedAt: 0, breakMs: 0, restFrom: 0, restUntil: 0, askedAt: 0, back: "", hintOpen: false,
  };
  $("#prac").hidden = false;
  $("#prac").setAttribute("aria-hidden", "false");
  document.body.classList.add("prac-on");
  clearInterval(pracTimer);
  pracTimer = setInterval(() => {
    if (!prac) return;
    if (prac.screen === "resting") { pracRender(); if (Date.now() >= prac.restUntil) pracEndRest(); }
    else pracWatch();
  }, 1000);
  keepAwake(true);
  pracRender();
}

function closePractice() {
  clearInterval(pracTimer);
  cancelAnimationFrame(pracRaf);
  if (pracAudioEl) { try { pracAudioEl.pause(); } catch {} }
  pracAudioEl = null;
  const pl = $("#pracPlayer");
  if (pl) { pl.innerHTML = ""; pl.hidden = true; }
  prac = null;
  $("#prac").hidden = true;
  $("#prac").setAttribute("aria-hidden", "true");
  document.body.classList.remove("prac-on");
  if (!zenOn) keepAwake(false);
  render();
}

function pracEndRest() {
  if (prac.restFrom) prac.breakMs += Date.now() - prac.restFrom;
  prac.restFrom = 0; prac.restUntil = 0;
  prac.askedAt = pracMin();
  prac.screen = prac.back || "work";
  pracRender();
}

/* Время получения записывается в тот момент, когда награда открылась.
   Восстанавливать его задним числом было ошибкой: у наград, заработанных
   до появления этой записи, привязка выходила к случайной отметке. */
function stampProgress() {
  data.achAt = data.achAt || {};
  data.factAt = data.factAt || {};
  const k = curKey();
  const fresh = { ach: [], facts: [] };
  /* Проверяем именно отсутствие ключа: ранее полученное помечено единицей
     как «время неизвестно», и ноль здесь считался бы пустым местом. */
  for (const a of achState())
    if (a.done && data.achAt[k + ":" + a.id] === undefined) {
      data.achAt[k + ":" + a.id] = now();
      fresh.ach.push({ id: a.id, icon: a.icon, name: a.name });
    }
  for (const f of factsState())
    if (f.open && data.factAt[k + ":" + f.id] === undefined) {
      data.factAt[k + ":" + f.id] = now();
      fresh.facts.push({ id: f.id, t: f.t });
    }
  return fresh;
}

const achDoneSet = () => new Set(achState().filter((a) => a.done).map((a) => a.id));
const factsOpenSet = () => new Set(factsState().filter((f) => f.open).map((f) => f.id));

/* Занятие пишет записи мимо обычной отметки, а награды показывались только
   в ней. Поэтому за практику они открывались молча: в списке появлялись,
   а торжества не было. Собираем их сами и показываем теми же экранами. */
/* Считаем, что открылось за занятие, — но НЕ показываем. Показ раньше стоял
   прямо здесь, по таймеру: экран занятия в это время ещё закрывался, и
   торжество приходилось на смену экранов — иногда его просто не было видно.
   Теперь возвращаем добычу наверх, а показывает её тот, кто уже всё закрыл. */
function pracCelebrate() {
  if (!prac) return null;
  const freshAch = achState().filter((a) => a.done && !prac.achBefore.has(a.id));
  const freshFacts = factsState().filter((f) => f.open && !prac.factsBefore.has(f.id));
  if (!freshAch.length && !freshFacts.length) return null;

  const stamped = stampProgress();
  prac.wonAwards = (prac.wonAwards || []).concat(stamped.ach);
  prac.wonFacts = (prac.wonFacts || []).concat(stamped.facts);

  prac.achBefore = achDoneSet();
  prac.factsBefore = factsOpenSet();
  saveData();
  return { ach: freshAch, facts: freshFacts };
}

/* Торжество: сначала награды по одной, потом карточки знаний одним экраном. */
function showWon(won) {
  if (!won || (!won.ach.length && !won.facts.length)) return;
  overlayQueue = [];
  won.ach.forEach((a, i) => overlayQueue.push({ type: "ach", a, i: i + 1, n: won.ach.length }));
  if (won.facts.length) overlayQueue.push({ type: "facts", list: won.facts });
  showNextOverlay();
}

/* Сколько времени ушло на каждый отрезок. Показывать пока негде, но собирать
   надо сейчас: без этих чисел «где я застреваю» останется ощущением. Время —
   единственное, что здесь измеряется само, без веры на слово. */
const PRAC_LOG_MAX = 1500;
function pracNote(u, sec) {
  if (!sec || sec > 3600) return;                 // отошёл от инструмента — не считаем
  const st = pracStore();
  st.log = st.log || [];
  st.log.push({ b: u.from + "-" + u.to, h: u.hand, s: u.size, sec, d: todayStr(), r: u.review ? 1 : 0 });
  if (st.log.length > PRAC_LOG_MAX) st.log.splice(0, st.log.length - PRAC_LOG_MAX);
}

/* Сегодняшняя запись занятия: одна на день, как и при ручной отметке. */
function pracEntry(make) {
  const ds = todayStr();
  let e = data.piano.entries.find((x) => !x.deleted && x.date === ds && (x.pieceId || "bwv853") === piece().id);
  if (!e && make) {
    e = { id: uid(), date: ds, pieceId: piece().id, spans: [], mins: 0, sessions: 0,
          note: "занятие по плану", createdAt: now(), updatedAt: now() };
    data.piano.entries.push(e);
  }
  return e || null;
}

/* Минуты за день КОПЯТСЯ. Раньше запись перезаписывалась временем последнего
   захода: позанимался час в три подхода — в истории осталось двадцать минут
   от последнего. Дописываем только прирост с прошлой записи. */
function pracCount() {
  const e = pracEntry(true);
  if (!prac.sessionCounted) { e.sessions = (e.sessions || 0) + 1; prac.sessionCounted = true; }
  const cur = pracMin();
  const add = Math.max(0, cur - (prac.counted || 0));
  prac.counted = cur;
  e.mins = Math.round((e.mins || 0) + add);
  e.note = "занятие по плану · " + e.mins + " мин"
    + (e.sessions > 1 ? " · " + e.sessions + " " + plural(e.sessions, "подход", "подхода", "подходов") : "");
  e.updatedAt = now();
  return e;
}

/* Каждый закрытый отрезок уходит в запись сразу. Раньше запись собиралась
   только по кнопке «Завершить»: закроешь приложение посреди занятия — и всё,
   что успел, оставалось в разборе, но в прогресс приложения не попадало. */
function pracLog(u) {
  const e = pracEntry(true);
  const hands = u.hand === "both" ? ["right", "left"] : [u.hand];
  for (const h of hands) e.spans.push({ hand: h, from: u.from, to: u.to });
  /* Минуты пишем сразу, а не только по кнопке «Завершить»: экран гаснет,
     приложение уходит в фон, и до кнопки дело может не дойти. */
  pracCount();
  saveData();
  schedulePush();
  return hands.length;                        // сколько отрезков дописали — на случай отмены
}

/* Занятие само пишет обычную отметку. */
function pracFinish() {
  if (prac && prac.kind === "lesson") {
    const nothing = !lessonEntry(false) && !prac.taskAt;
    if (nothing) { toast("Занятие не записано — ничего не отметил"); closePractice(); return; }
    if (prac.taskAt) lessonNote(prac.at.i, prac.at.phase, Math.round((Date.now() - prac.taskAt) / 1000));
    const e = lessonCount();
    lessonStore().session++;
    const won = pracCelebrate();
    if (e.lessons && e.lessons.length) addEvent("session", "pastel", "pastel",
      "Занимался: " + course().name + " · " + e.mins + " мин, "
      + e.lessons.length + " " + plural(e.lessons.length, "урок", "урока", "уроков"),
      { fields: { mins: e.mins, createdAt: now(), awards: prac.wonAwards || [], facts: prac.wonFacts || [] } });
    saveData();
    schedulePush();
    toast("Записано: " + e.mins + " мин");
    closePractice();
    /* Показываем ПОСЛЕ закрытия: экран занятия лежит выше торжества, и пока
       он не убран, награду было не видно. */
    if (won) setTimeout(() => showWon(won), 380);
    return;
  }
  const closed = prac ? prac.closed.length : 0;
  let won = null;

  /* День отмечается, даже если ни один отрезок не дошёл до конца: сорок минут
     за инструментом — это занятие, а не пустое место, и серию оно рвать
     не должно. */
  if (prac && prac.startedAt && (prac.closed.length || pracEntry(false))) {
    const e = pracCount();
    pracStore().session++;
    saveData();
    schedulePush();
    won = pracCelebrate();
    if (closed) addEvent("session", piece().id, "piano",
      "Занимался: " + piece().name + " · " + e.mins + " мин, "
      + closed + " " + plural(closed, "отрезок", "отрезка", "отрезков"),
      { fields: { mins: e.mins, createdAt: now(), awards: prac.wonAwards || [], facts: prac.wonFacts || [] } });
    toast(closed
      ? "Занятие записано: " + e.mins + " мин за день"
      : "Занятие записано: " + e.mins + " мин, без закрытых отрезков");
  }
  closePractice();
  if (won) setTimeout(() => showWon(won), 380);
}

function bindPractice() {
  $("#pracClose").addEventListener("click", () => { if (prac) pracFinish(); });
  $("#pracPlayer").addEventListener("pointerdown", plDrag);

  $("#pracPlayer").addEventListener("click", (e) => {
    if (!pracAudioEl) return;
    const b = e.target.closest("[data-pl]");
    if (b) {
      if (b.dataset.pl === "play") {
        if (pracAudioEl.paused) {
          const sel = plSel(pracAudioEl.dataset.for, pracAudioEl.duration || 0);
          if (pracAudioEl.currentTime < sel.a || pracAudioEl.currentTime >= sel.b - 0.05)
            try { pracAudioEl.currentTime = sel.a; } catch {}
          pracAudioEl.play().catch(() => {});
        } else pracAudioEl.pause();
      } else {
        delete pracLoops[pracAudioEl.dataset.for];      // снова весь трек
        pracSaveLoops();
        plPaint();
      }
      return;
    }
    // тап по дорожке — перемотка внутри выделения
    const bar = e.target.closest(".pl-bar");
    if (!bar || e.target.closest("[data-h]")) return;
    const r = bar.getBoundingClientRect();
    const dur = pracAudioEl.duration || 0;
    if (!dur) return;
    const t = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur;
    const sel = plSel(pracAudioEl.dataset.for, dur);
    try { pracAudioEl.currentTime = Math.max(sel.a, Math.min(t, sel.b)); } catch {}
    plPaint();
  });

  $("#prac").addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b || !prac) return;

    if (b.dataset.part !== undefined) {
      prac.pick = +b.dataset.part;
      prac.queue = [];
      return pracRender();
    }

    if (b.dataset.rest !== undefined) {
      const min = +b.dataset.rest;
      if (min) { prac.restFrom = Date.now(); prac.restUntil = prac.restFrom + min * 60000; prac.screen = "resting"; }
      else prac.screen = prac.back || "work";
      return pracRender();
    }

    if (b.dataset.les) {
      const at = prac.at;
      const st = lessonStore();
      const sec = prac.stepAt ? Math.round((Date.now() - prac.stepAt) / 1000) : 0;

      const stepSec = () => prac.taskAt ? Math.round((Date.now() - prac.taskAt) / 1000) : 0;

      switch (b.dataset.les) {
        case "watched":
          st.done["L" + at.i + ":watch"] = todayStr();
          lessonNote(at.i, "watch", sec);
          lessonMark(at.i);
          prac.at = { i: at.i, phase: "ask" };
          prac.stepAt = Date.now();
          break;
        case "taskYes":
          st.done["L" + at.i + ":task"] = todayStr();
          prac.at = { i: at.i, phase: "repeat" };
          prac.taskAt = Date.now();
          break;
        case "noTask":
          st.done["L" + at.i + ":task"] = "нет";
          prac.at = lessonNext();
          prac.taskAt = 0;
          prac.stepAt = Date.now();
          break;
        case "stepDone":
          lessonNote(at.i, at.phase, stepSec());
          st.done["L" + at.i + ":" + at.phase] = todayStr();
          lessonMark(at.i);
          prac.taskAt = 0;
          /* Своя работа закончена — самое время её сфотографировать,
             пока лист ещё на мольберте. */
          if (at.phase === "own") { prac.photoFor = at.i; prac.screen = "photo"; }
          else { prac.at = lessonNext(); prac.taskAt = Date.now(); }
          break;
        case "stepLater":
          /* Не доделал — ступень остаётся открытой, но время уже записано:
             час над работой это час, доделал ты её или нет. */
          lessonNote(at.i, at.phase, stepSec());
          lessonCount();
          prac.taskAt = 0;
          prac.at = lessonNext();
          prac.stepAt = Date.now();
          break;
        case "photoYes": {
          const f = await pickPhoto();
          if (f) {
            try {
              const blob = await shrinkPhoto(f);
              lessonPhoto(prac.photoFor, blob);
              toast("Снимок в моментах");
            } catch { toast("Не получилось прочитать снимок"); }
          }
          prac.screen = "work"; prac.photoFor = null;
          prac.at = lessonNext(); prac.taskAt = Date.now();
          break;
        }
        case "photoNo":
          prac.screen = "work"; prac.photoFor = null;
          prac.at = lessonNext(); prac.taskAt = Date.now();
          break;
      }
      saveData();
      schedulePush();
      return pracRender();
    }

    switch (b.dataset.prac) {
      case "begin": {
        /* Запись заведётся на первом закрытом отрезке. Нажал «Начать» и вышел —
           занятия не было. */
        prac.startedAt = prac.startedAt || Date.now();
        prac.counted = 0;
        prac.queue = pracQueue();
        return pracNext();
      }
      case "ok": {
        const u = prac.cur;
        const sec = prac.unitAt ? Math.round((Date.now() - prac.unitAt) / 1000) : 0;
        pracNote(u, sec);            // копим, где сколько провозились
        if (u.review) { prac.reviewed.push(u.k); prac.undo = null; }
        else {
          pracStore().done[pracKey(u, u.hand)] = todayStr();
          prac.closed.push({ from: u.from, to: u.to, hand: u.hand });
          const added = pracLog(u);
          prac.undo = { u, key: pracKey(u, u.hand), added };   // на случай промаха
        }
        saveData();
        // ступень могла сомкнуться — очередь пересобираем под новое место
        const w = pracWhere();
        const nn = prac.queue.find((x) => !x.review);
        if (nn && nn.size !== w.size) prac.queue = pracQueue();
        return pracNext();
      }
      case "hint": prac.hintOpen = !prac.hintOpen; return pracRender();

      case "undo": {
        /* Промахнулся по «Получилось» — возвращаем отрезок и убираем его след
           и из разбора, и из сегодняшней записи. */
        const un = prac.undo;
        if (!un) return;
        delete pracStore().done[un.key];
        const e = pracEntry(false);
        if (e && un.added) { e.spans.splice(-un.added, un.added); e.updatedAt = now(); }
        prac.closed.pop();
        prac.undo = null;
        prac.queue.unshift(un.u);
        saveData();
        schedulePush();
        toast("Возвращено");
        return pracNext();
      }
      case "reset":
        if (!confirm("Забыть весь разбор этой пьесы и начать с первого такта?\n\nЗаписи занятий останутся.")) return;
        data.practice[piece().id] = { done: {}, session: pracStore().session };
        prac.pick = null;
        saveData(); schedulePush();
        return pracRender();

      case "restDone": return pracEndRest();
      case "finish": return pracFinish();
    }
  });
}

/* ══════════ Оформление ══════════
   Тема-цвет меняет палитру, тема-мир — ещё шрифт, надписи и иконки.
   Всё открыто сразу: экран магазина и монеты убраны, покупать было нечего. */
const THEMES = [
{ id: "dusk", name: "Сумерки", sub: "как было", kind: "color", dots: ["#8b7cf6", "#ffc94d", "#0d0b14"], vars: {} },
  { id: "rose", name: "Розовый рассвет", sub: "тёплая розовая", kind: "color",
    dots: ["#ff8fb8", "#ffb37a", "#170d14"],
    vars: { "--bg": "#160c13", "--ink": "#fdeef4", "--muted": "#c095a8", "--dim": "#8a6577",
            "--gold": "#ff8fb8", "--gold-2": "#ffb37a", "--violet": "#d98fe0",
            "--glass": "rgba(255, 143, 184, 0.07)", "--glass-2": "rgba(255, 143, 184, 0.13)",
            "--glass-line": "rgba(255, 143, 184, 0.2)", "--glass-hi": "rgba(255, 255, 255, 0.08)",
            "--track": "rgba(255, 255, 255, 0.1)",
            "--panel": "rgba(48, 24, 38, 0.55)", "--bar": "rgba(30, 15, 24, 0.74)",
            "--sheet": "rgba(40, 20, 32, 0.85)", "--sheet-solid": "rgba(40, 20, 32, 0.95)" } },
  { id: "ink", name: "Тушь и рис", sub: "монохром", kind: "color",
    dots: ["#e8e3d8", "#a8a29a", "#101012"],
    vars: { "--bg": "#0e0e10", "--ink": "#f0ede6", "--muted": "#9a958c", "--dim": "#66625c",
            "--gold": "#e8e3d8", "--gold-2": "#b9b3a8", "--violet": "#9a958c" } },
  { id: "baikal", name: "Байкальский лёд", sub: "холодная синева", kind: "color",
    dots: ["#7fd7e8", "#3f9fc4", "#07131c"],
    vars: { "--bg": "#07131b", "--ink": "#eaf6fb", "--muted": "#84a2b3", "--dim": "#546f7e",
            "--gold": "#8fdcee", "--gold-2": "#41a6c9", "--violet": "#6fb6d8",
            "--panel": "rgba(18, 38, 50, 0.55)", "--bar": "rgba(10, 26, 36, 0.72)",
            "--sheet": "rgba(14, 32, 44, 0.82)", "--sheet-solid": "rgba(14, 32, 44, 0.94)" } },
  { id: "amber", name: "Тёплый вечер", sub: "лампа и чай", kind: "color",
    dots: ["#ffb168", "#ff7a45", "#150f0b"],
    vars: { "--bg": "#150f0b", "--ink": "#faeee2", "--muted": "#b39a86", "--dim": "#7d6a5a",
            "--gold": "#ffb168", "--gold-2": "#ff7a45", "--violet": "#e08a5c",
            "--panel": "rgba(46, 32, 24, 0.55)", "--bar": "rgba(30, 21, 15, 0.72)",
            "--sheet": "rgba(38, 26, 19, 0.82)", "--sheet-solid": "rgba(38, 26, 19, 0.94)" } },
  { id: "moss", name: "Мох", sub: "хвоя и тишина", kind: "color",
    dots: ["#9ad9a2", "#4fae7a", "#0b130e"],
    vars: { "--bg": "#0a130d", "--ink": "#eaf6ec", "--muted": "#8aa892", "--dim": "#5a7263",
            "--gold": "#9ad9a2", "--gold-2": "#4fae7a", "--violet": "#78c2a4",
            "--panel": "rgba(20, 42, 30, 0.55)", "--bar": "rgba(12, 28, 19, 0.72)",
            "--sheet": "rgba(16, 34, 24, 0.82)", "--sheet-solid": "rgba(16, 34, 24, 0.94)" } },
  { id: "paper", name: "Бумага", sub: "светлая", kind: "color", light: true,
    dots: ["#c8862a", "#8a8478", "#f4f1ea"],
    vars: { "--bg": "#f2efe7", "--ink": "#221f1a", "--muted": "#6b6559", "--dim": "#9a9384",
            "--line": "rgba(0, 0, 0, 0.1)", "--track": "rgba(0, 0, 0, 0.14)",
            "--gold": "#c07d22", "--gold-2": "#e0a13d", "--violet": "#7a6bd0",
            "--glass": "rgba(255, 255, 255, 0.55)", "--glass-2": "rgba(255, 255, 255, 0.8)",
            "--glass-line": "rgba(0, 0, 0, 0.09)", "--glass-hi": "rgba(255, 255, 255, 0.9)",
            "--panel": "rgba(255, 255, 255, 0.62)", "--bar": "rgba(248, 245, 238, 0.78)",
            "--sheet": "rgba(250, 247, 240, 0.9)", "--sheet-solid": "rgba(250, 247, 240, 0.96)",
            "--shadow": "rgba(90, 78, 58, 0.16)" } },
{
    id: "orbit", name: "Орбита", sub: "бортовой интерфейс, 1968", kind: "world",
    dots: ["#ff7a2f", "#ffc04a", "#05060a"],
    vars: { "--bg": "#05070c", "--ink": "#f2f4f8", "--muted": "#8b93a4", "--dim": "#5a6273",
            "--gold": "#ff8a3d", "--gold-2": "#ffc04a", "--violet": "#5fa8ff",
            "--glass": "rgba(255, 255, 255, 0.045)", "--glass-2": "rgba(255, 255, 255, 0.08)",
            "--glass-line": "rgba(255, 138, 61, 0.22)", "--glass-hi": "rgba(255, 255, 255, 0.05)",
            "--panel": "rgba(10, 14, 22, 0.62)", "--bar": "rgba(6, 9, 15, 0.78)",
            "--sheet": "rgba(8, 12, 19, 0.88)", "--sheet-solid": "rgba(8, 12, 19, 0.96)" },
    icons: { home: "◎", progress: "≣", ach: "◆", wish: "◇", },
    words: { tabHome: "Пост", tabProgress: "Телеметрия", tabAch: "Допуски", tabWish: "Заявки",
             ctaPiano: "Зафиксировать сеанс", ctaBook: "Зафиксировать чтение", ctaPastel: "Зафиксировать урок",
             ctaDone: "Сеанс записан", ctaAdd: "дополнить", streak: "цикл",
             segAch: "◆ Допуски", segFacts: "◇ Данные" },
    css: `
      body, button, input { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
      .logo em { letter-spacing: 0.18em; text-transform: uppercase; font-size: 0.9em; }
      .panel, .theme, .mat-card, .fcard, .ach, .sc, .stat { border-radius: 6px; }
      .cover { border-radius: 10px; }
      .btn, .cta, .th-btn, .gbtn, .qbtn { border-radius: 999px; text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.82rem; }
      .seg { border-radius: 999px; }
      .seg button { border-radius: 999px; text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.74rem; }
      .tabbar button { text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.6rem; }
      .hero-title h2, .shop-head, .ach-hero-txt b { text-transform: uppercase; letter-spacing: 0.09em; }
      .ring .fg, .sum-ring .fg { filter: drop-shadow(0 0 8px rgba(255, 138, 61, 0.6)); }
      .panel::before {
        content: ""; position: absolute; left: 14px; right: 14px; top: 0; height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255,138,61,.5), transparent);
      }
      .panel { position: relative; }
    `
  },
{
    id: "terminal", name: "Терминал", sub: "зелёный фосфор, ЭЛТ", kind: "world",
    dots: ["#3dff88", "#12b45a", "#011106"],
    vars: { "--bg": "#010c05", "--ink": "#c9ffdc", "--muted": "#5fbf87", "--dim": "#38805a",
            "--gold": "#3dff88", "--gold-2": "#12b45a", "--violet": "#43e0a0",
            "--glass": "rgba(61, 255, 136, 0.05)", "--glass-2": "rgba(61, 255, 136, 0.1)",
            "--glass-line": "rgba(61, 255, 136, 0.28)", "--glass-hi": "rgba(61, 255, 136, 0.12)",
            "--panel": "rgba(2, 20, 10, 0.68)", "--bar": "rgba(1, 14, 7, 0.82)",
            "--sheet": "rgba(2, 18, 9, 0.9)", "--sheet-solid": "rgba(2, 18, 9, 0.97)" },
    icons: { home: "▮", progress: "▤", ach: "✚", wish: "◊", },
    words: { tabHome: "Пульт", tabProgress: "Статус", tabAch: "Метки", tabWish: "Очередь",
             ctaPiano: "> записать сеанс", ctaBook: "> записать чтение", ctaPastel: "> записать урок",
             ctaDone: "> запись принята", ctaAdd: "дополнить", streak: "цепочка",
             segAch: "[ метки ]", segFacts: "[ архив ]" },
    css: `
      body, button, input { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
      .logo em { letter-spacing: 0.16em; }
      .panel, .theme, .mat-card, .fcard, .ach, .sc, .stat, .btn, .cta, .th-btn, .seg, .seg button { border-radius: 3px; }
      .cover { border-radius: 6px; }
      .btn, .cta, .th-btn { text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.8rem; }
      .tabbar button { text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.6rem; }
      .hero-title h2, .shop-head { text-transform: uppercase; letter-spacing: 0.1em; }
      .ring .fg, .sum-ring .fg { filter: drop-shadow(0 0 7px rgba(61, 255, 136, 0.75)); }
      body::after {
        content: ""; position: fixed; inset: 0; z-index: 3; pointer-events: none;
        background: repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.22) 0 1px, transparent 1px 3px);
      }
    `
  }
];

/* Словарь интерфейса: тема-мир может переписать формулировки под себя */
const WORDS_BASE = {
  tabHome: "Главная", tabProgress: "Прогресс", tabAch: "Достижения", tabNotes: "Моменты", tabWish: "Захотелось",
  ctaPiano: "🎹 Начать занятие", ctaBook: "📖 Отметить чтение", ctaPastel: "🎨 Отметить урок",
  ctaWatch: "🎬 Отметить просмотр", ctaLesson: "🎨 Начать урок",
  ctaDone: "✅ Сегодня отмечено", ctaAdd: "дополнить", ctaAgain: "ещё занятие",
  streak: "серия",
  segAch: "✦ Достижения", segFacts: "💡 Знания"
};
const ICON = (k, def) => {
  const t = themeById(data.shop ? data.shop.theme : "dusk");
  return (t.icons && t.icons[k]) || def;
};
const T = (k) => {
  const t = themeById(data.shop ? data.shop.theme : "dusk");
  return (t.words && t.words[k]) || WORDS_BASE[k];
};


const themeById = (id) => THEMES.find(t => t.id === id) || THEMES[0];

function applyTheme(id) {
  const t = themeById(id);
  const root = document.documentElement;
  root.removeAttribute("style");
  for (const [k, v] of Object.entries(t.vars || {})) root.style.setProperty(k, v);
  root.style.colorScheme = t.light ? "light" : "dark";

  // тема-мир может менять шрифты, форму элементов и добавлять свои эффекты
  let sheet = document.getElementById("themeCss");
  if (!sheet) {
    sheet = document.createElement("style");
    sheet.id = "themeCss";
    document.head.appendChild(sheet);
  }
  sheet.textContent = t.css || "";

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", (t.vars && t.vars["--bg"]) || "#0d0b14");
  syncTabHeight();
  requestAnimationFrame(syncTabHeight);
}



// переключатель верхнего уровня «Достижений»: текущие материалы или полка
function achTopHTML() {
  return `
    <div class="seg" id="achTop">
      <button data-top="mats" class="${achTop === "mats" ? "on" : ""}" type="button">В работе</button>
      <button data-top="shelf" class="${achTop === "shelf" ? "on" : ""}" type="button">📚 Полка ${shelfItems().length || ""}</button>
    </div>`;
}
function bindAchTop() {
  document.querySelectorAll("#achTop button").forEach(b =>
    b.addEventListener("click", () => {
      achTop = b.dataset.top; cfg.achTop = achTop; saveCfg();
      renderAchList();
      $("#view").scrollTop = 0;
    }));
}
function renderShelfInto() {
  renderShelf();
  $("#view").insertAdjacentHTML("afterbegin", achTopHTML());
  bindAchTop();
  document.querySelectorAll("[data-shelf]").forEach(b =>
    b.addEventListener("click", () => openShelfSheet(b.dataset.shelf)));
}

/* ── Полка: всё, что доведено до конца ── */
const shelfItems = () => (data.archive || []).filter(a => !a.deleted)
  .sort((a, b) => a.finishedAt < b.finishedAt ? 1 : -1);

function shelfCoverHTML(a) {
  const own = [...data.book.books, ...(data.piano.pieces || [])].find(x => "bk_" + x.id === a.id || x.id === a.id);
  let ownSrc = own ? coverSrc(own.id, own.cover || "") : "";
  if (!ownSrc && a.track === "pastel") ownSrc = coverSrc("pastel", "");   // курс тоже с обложкой
  if (!ownSrc && a.track === "watch") ownSrc = watchThumb(videos().find(v => v.id === a.videoId) || {});
  if (ownSrc) return `
    <div class="cover photo shelf-cover" style="aspect-ratio:${esc(own.ratio || "3 / 4.4")}">
      <img src="${esc(ownSrc)}" alt="" loading="lazy" decoding="async">
    </div>`;
  const cls = a.track === "book" ? `book ${a.tone || "sea"}`
    : a.track === "pastel" ? "pastel"
    : `piano ${a.tone || "violet"}`;
  const art = a.track === "pastel" ? `<div class="smears"><i></i><i></i><i></i><i></i></div>`
    : a.art === "wave" ? SEA_ART
    : a.art === "pine" ? PINE_ART
    : a.track === "piano" ? KEYS_ART
    : `<div class="cv-mark">${a.icon || "📖"}</div>`;
  return `
    <div class="cover shelf-cover ${cls}">
      <div><div class="cv-author">${esc(a.sub || "")}</div></div>
      ${art}
      <div><div class="cv-title">${esc(a.title)}</div></div>
    </div>`;
}

const stars = (n, cls) => [1, 2, 3, 4, 5].map(i =>
  `<span class="${cls || ""} ${i <= n ? "on" : ""}" ${cls ? `data-star="${i}"` : ""}>★</span>`).join("");

function renderShelf() {
  const list = shelfItems();
  const fmt = new Intl.DateTimeFormat("ru", { day: "numeric", month: "short", year: "numeric" });
  const when = (ds) => fmt.format(fromStr(ds)).replace(" г.", "");

  $("#view").innerHTML = `
    <button class="btn km-open" id="shelfMap" type="button">◍ Карта знаний</button>
    <button class="btn add-book" id="shelfAdd" type="button">＋ Добавить прочитанную книгу</button>
    ` + (list.length ? `
    <div class="shelf">
      ${list.map(a => `
        <button class="leaf" data-shelf="${a.id}" type="button">
          ${shelfCoverHTML(a)}
          <span class="lf-body">
            <span class="lf-title">${esc(a.title)}</span>
            ${a.sub ? `<span class="lf-sub">${esc(a.sub)}</span>` : ""}
            <span class="lf-when">${a.startedAt ? when(a.startedAt) + " — " : ""}${when(a.finishedAt)}</span>
            <span class="lf-meta">${a.pct}%${a.days ? ` · ${a.days} ${plural(a.days, "день", "дня", "дней")}` : ""}</span>
            <span class="lf-stars">${stars(a.rating || 0)}</span>
            ${a.review ? `<span class="lf-review">${esc(a.review)}</span>` : `<span class="lf-empty">нажми, чтобы оценить</span>`}
          </span>
        </button>`).join("")}
    </div>` : `
    <div class="empty-note">Полка пока пуста.<br>Сюда попадает всё, что доведено до конца, — с оценкой и отзывом.</div>`);

  $("#shelfAdd").addEventListener("click", openAddBookSheet);
  const mapBtn = $("#shelfMap");
  if (mapBtn) mapBtn.addEventListener("click", openKnowledgeMap);
  document.querySelectorAll("[data-shelf]").forEach(b =>
    b.addEventListener("click", () => openShelfSheet(b.dataset.shelf)));
}

// книга, прочитанная когда-то давно: всё кроме названия можно не заполнять
function openAddBookSheet() {
  sheetMode = "addbook";
  openSheet(`
    <h3>Книга на полку</h3>
    <p class="sub">Обязательно только название — остальное как вспомнится</p>
    <div class="add-form">
      <input class="note-input" id="abTitle" placeholder="Название" maxlength="120">
      <input class="note-input" id="abAuthor" placeholder="Автор" maxlength="120">
      <input class="note-input" id="abPages" type="number" inputmode="numeric" min="1" max="9999" placeholder="Сколько страниц">
      <label class="ab-lab">Начал(а) — если помнишь
        <input class="note-input" id="abFrom" type="date" max="2100-01-01"></label>
      <label class="ab-lab">Закончил(а)
        <input class="note-input" id="abTo" type="date" max="2100-01-01" value="${todayStr()}"></label>
    </div>
    <div class="sheet-actions">
      <button class="btn gold" id="abSave" type="button">На полку</button>
      <button class="btn" id="abClose" type="button">Отмена</button>
    </div>`);

  $("#abClose").addEventListener("click", closeSheet);
  $("#abSave").addEventListener("click", () => {
    const title = ($("#abTitle").value || "").trim();
    if (!title) { toast("Как называется?"); return; }

    const from = $("#abFrom").value || "";
    const to = $("#abTo").value || todayStr();
    const pages = Math.round(Number($("#abPages").value) || 0);
    let days = 0;
    if (from && from <= to) days = daysBetween(from, to) + 1;

    const rec = {
      id: uid(), track: "book", icon: "📖",
      title, sub: ($("#abAuthor").value || "").trim(),
      pct: 100, days,
      pages: pages || 0,
      art: "", tone: "snow",
      startedAt: from || to, finishedAt: to,
      rating: 0, review: "",
      createdAt: now(), updatedAt: now()
    };
    data.archive.push(rec);
  addEvent("done", rec.srcId, rec.track, "Завершил: " + rec.title, { tag: rec.srcId });
    saveData(); schedulePush();
    closeSheet();
    render();
    openShelfSheet(rec.id);        // сразу предлагаем оценить и записать пару строк
  });
}

// шторка: звёзды и отзыв
function openShelfSheet(id) {
  const a = shelfItems().find(x => x.id === id) || (data.archive || []).find(x => x.id === id);
  if (!a) return;
  sheetMode = "shelf";
  let rating = a.rating || 0;

  openSheet(`
    <div class="shelf-sheet">
      ${shelfCoverHTML(a)}
      <h3>${esc(a.title)}</h3>
      <p class="shelf-meta">${a.pct}%${a.days ? ` · ${a.days} ${plural(a.days, "день", "дня", "дней")}` : ""}</p>
      <div class="star-pick" id="starPick">${stars(rating, "st")}</div>
      <textarea class="note-input shelf-review" id="shelfReview" rows="4"
        placeholder="Что осталось после этой вещи? Пара строк для себя">${esc(a.review || "")}</textarea>
    </div>
    <div class="sheet-actions">
      <button class="btn gold" id="shelfSave" type="button">Сохранить</button>
      <button class="btn" id="shelfClose" type="button">Закрыть</button>
      <button class="btn danger" id="shelfDel" type="button">Убрать с полки</button>
    </div>`);

  const paint = () => { $("#starPick").innerHTML = stars(rating, "st"); bindStars(); };
  const bindStars = () => document.querySelectorAll("#starPick .st").forEach(el =>
    el.addEventListener("click", () => { rating = +el.dataset.star; paint(); }));
  bindStars();

  const del = $("#shelfDel");
  if (del) del.addEventListener("click", () => {
    if (!confirm(`Убрать «${a.title}» с полки?\n\nОценка и отзыв пропадут.`)) return;
    a.deleted = true; a.updatedAt = now();
    saveData(); schedulePush();
    closeSheet(); render();
    toast("Убрано с полки");
  });

  $("#shelfSave").addEventListener("click", () => {
    a.rating = rating;
    a.review = ($("#shelfReview").value || "").trim().slice(0, 600);
    a.updatedAt = now();
    saveData(); schedulePush();
    closeSheet();
    if (tab === "ach") render();
    toast("Записано на полку");
  });
  $("#shelfClose").addEventListener("click", closeSheet);
}

/* ══════════ Шторка ══════════ */

function openSheet(html) {
  const sheet = $("#sheet");
  sheet.innerHTML = `<div class="grab-zone"><div class="grabber"></div></div>` +
    `<div class="sheet-body">${html}</div>`;
  sheet.classList.add("show");
  $("#sheetBg").classList.add("show");
  const body0 = sheet.querySelector('.sheet-body');
  if (body0) body0.scrollTop = 0;
  setupSheetDrag(sheet);
}

// шторку можно утянуть вниз: за полоску — всегда, за содержимое — когда оно уже прокручено наверх
function setupSheetDrag(sheet) {
  let startY = 0, dy = 0, dragging = false, fromGrab = false;

  const onDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    fromGrab = !!e.target.closest(".grab-zone");
    const body = sheet.querySelector('.sheet-body');
    if (!fromGrab && body && body.scrollTop > 0) return;   // внутри прокрутки — не мешаем
    dragging = true; startY = e.clientY; dy = 0;
    sheet.style.transition = "none";
  };

  const onMove = (e) => {
    if (!dragging) return;
    dy = e.clientY - startY;
    if (dy < 0) {                                    // тянут вверх — отдаём прокрутке
      if (!fromGrab) { reset(); return; }
      dy = 0;
    }
    if (dy > 0) {
      e.preventDefault();
      sheet.style.transform = `translateX(-50%) translateY(${dy}px)`;
      $("#sheetBg").style.opacity = String(Math.max(0, 1 - dy / 420));
    }
  };

  const reset = () => {
    dragging = false;
    sheet.style.transition = "";
    sheet.style.transform = "";
    $("#sheetBg").style.opacity = "";
  };

  const onUp = () => {
    if (!dragging) return;
    const far = dy > 110;
    reset();
    if (far) closeSheet();
  };

  sheet.addEventListener("pointerdown", onDown);
  sheet.addEventListener("pointermove", onMove, { passive: false });
  sheet.addEventListener("pointerup", onUp);
  sheet.addEventListener("pointercancel", onUp);
  sheet.addEventListener("pointerleave", onUp);
}
function closeSheet() {
  const sheet = $("#sheet");
  sheet.style.transition = "";
  sheet.style.transform = "";
  $("#sheetBg").style.opacity = "";
  sheet.classList.remove("show");
  $("#sheetBg").classList.remove("show");
  sheetMode = null;
}

/* Шторка записи: кнопка-кружок, отсчёт и прослушивание перед сохранением. */
function openTakeSheet(autoStart, onDone) {
  if (!canRecord()) { toast("Это устройство не даёт записывать звук"); return; }
  sheetMode = "take";
  const last = takesFor(curKey()).slice(-1)[0];
  openSheet(`
    <div class="ach-sheet">
      <h3>Как звучит сейчас</h3>
      <p style="max-width:320px">Сыграй, как играется сейчас. Через месяцы услышишь разницу — её не покажет ни один процент.</p>
      <button class="tk-btn" id="tkGo" type="button"><i>●</i></button>
      <div class="tk-level" id="tkLevel" hidden><i></i></div>
      <div class="tk-time" id="tkTime">${last ? "прошлая запись " + fmtDay(dateStr(new Date(last.at))) : "нажми, чтобы начать"}</div>
      <audio id="tkPlay" controls hidden style="width:100%;margin-top:12px"></audio>
    </div>
    <div class="sheet-actions">
      <button class="btn gold" id="tkSave" type="button" hidden>Сохранить</button>
      <button class="btn" id="tkClose" type="button">Закрыть</button>
    </div>`);

  const go = $("#tkGo"), tm = $("#tkTime"), pl = $("#tkPlay"), sv = $("#tkSave");
  let blob = null, ms = 0, busy = false;

  const mmss = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

  async function toggle() {
    if (busy) { recStop && recStop(); return; }     // второй тап — остановка
    busy = true; go.classList.add("rec"); sv.hidden = true; pl.hidden = true;
    takeMute = true; audioSync();                   // фон замолкает сразу
    // Пауза не отпускает звуковой тракт: пока проигрыватель жив, iOS держит
    // режим воспроизведения и отдаёт микрофон в заметно худшем качестве.
    try { howls.forEach(h => h.unload()); howls.clear(); audioNow = ""; } catch {}
    await new Promise(r => setTimeout(r, 260));      // даём системе переключиться
    tm.textContent = "0:00 · нажми, чтобы остановить";
    try {
      const lv = $("#tkLevel"), lvBar = lv && lv.firstElementChild;
      if (lv) lv.hidden = false;
      let heard = 0;
      const done = await startTake(
        t => { tm.textContent = mmss(Math.floor(t / 1000)) + " · нажми, чтобы остановить"; },
        v => { if (lvBar) lvBar.style.width = (v * 100).toFixed(0) + "%"; if (v > 0.08) heard++; }
      );
      const r = await done;
      blob = r.blob; ms = r.ms;
      if (lv) lv.hidden = true;
      pl.src = URL.createObjectURL(blob); pl.hidden = false;
      tm.textContent = heard
        ? `записано ${mmss(Math.round(ms / 1000))} — послушай и сохрани`
        : `записано ${mmss(Math.round(ms / 1000))}, но микрофон почти ничего не слышал`;
      sv.hidden = false;
    } catch (e) {
      tm.textContent = "не дали доступ к микрофону";
    }
    busy = false; go.classList.remove("rec");
  }

  go.addEventListener("click", toggle);
  // нажатие на микрофон и есть жест разрешения — начинаем сразу, без лишнего тапа
  if (autoStart) toggle();

  sv.addEventListener("click", async () => {
    if (!blob) return;
    sv.disabled = true;
    takeMute = false;
    if (onDone) { const b = blob, m = ms; closeSheet(); onDone(b, m); return; }
    await saveTake(blob, ms);
    closeSheet(); render();
    toast("Записано — теперь в «Достижениях» у материала");
  });
  $("#tkClose").addEventListener("click", () => {
    recStop && recStop();
    takeMute = false; closeSheet(); audioSync();
  });
}

function openLogSheet() {
  if (!gistReady()) {
    toast("Сначала подключи синхронизацию — иначе записи могут потеряться");
    openSettingsSheet();
    return;
  }
  sheetMode = "log";
  pickSpans = []; partOpen = null; partUpto = {};
  syncPickers();
  const existing = entryFor(selectedDate);
  const title = existing ? "Дополнить запись" : (isBook() ? "Что прочитал?" : isWatch() ? (video().done ? "Пересмотрел?" : "Отметить просмотр") : isCourse() ? "Какие уроки прошёл?" : "Что разбирал?");
  const sub = fmtDay(selectedDate) + (existing ? " · запись уже есть" : "");

  openSheet(`
    <h3>${title}</h3>
    <p class="sub">${sub}</p>
    <div id="sheetBody"></div>
    <input class="note-input" id="noteInput" type="text" maxlength="80" placeholder="Заметка (необязательно)" autocomplete="off">
    <div class="sheet-actions">
      <button class="btn gold" id="sheetSave" type="button">Подтвердить</button>
      <button class="btn" id="sheetCancel" type="button">Отмена</button>
    </div>`);

  renderSheetBody();
  $("#sheetSave").addEventListener("click", saveEntry);
  $("#sheetCancel").addEventListener("click", closeSheet);
}

function renderSheetBody() {
  const parts = isBook() && bookMode(book()) === "parts";
  $("#sheetBody").innerHTML = parts ? bookPartsUI()
    : isBook() ? bookSheetUI() : isWatch() ? watchSheetUI() : isCourse() ? pastelSheetUI() : pianoSheetUI();
  if (parts) bindBookPartsSheet();
  else if (isBook()) bindBookSheet();
  else if (isWatch()) { /* выбирать нечего: у ролика одно состояние */ }
  else if (isCourse()) bindPastelSheet();
  else bindPianoSheet();
}

function fmtDur(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ":" + String(s).padStart(2, "0");
}

function watchSheetUI() {
  const v = video();
  const src = watchThumb(v);
  return `
    <div class="wt-mark">
      <div class="wt-mark-thumb">${src ? `<img src="${esc(src)}" alt="">` : `<i>🎬</i>`}</div>
      <div class="wt-mark-body">
        <b>${esc(v.title)}</b>
        <em>${esc(v.author || "видео")}</em>
      </div>
    </div>
    <div class="lesson-hint">${v.done
      ? "Уже отмечено как посмотренное. Новая отметка — это пересмотр."
      : "Отметишь — видео станет завершённым и уйдёт с главной. В библиотеке и в моментах оно останется."}</div>`;
}

function pastelSheetUI() {
  const done = doneLessons();
  return `
    <div class="lessons">
      ${course().lessons.map((l, i) => {
        if (l.hidden) return "";
        const already = done.has(i);
        const picked = pickLessons.includes(i);
        return `
          <button class="lesson ${already ? "was" : picked ? "pick" : ""}" data-i="${i}" type="button" ${already ? "disabled" : ""}>
            <span class="ln">${i + 1}</span>
            <span class="lt">${esc(l.title)}<i>${l.dur ? fmtDur(l.dur) : esc(l.author || "")}</i></span>
            <span class="lc">${already ? "✓" : picked ? "●" : "○"}</span>
          </button>`;
      }).join("")}
    </div>
    <div class="lesson-hint">${pickLessons.length
      ? `Выбрано: ${pickLessons.length} ${isWatch()
          ? plural(pickLessons.length, "ролик", "ролика", "роликов")
          : plural(pickLessons.length, "урок", "урока", "уроков")}`
      : isWatch() ? "Отметь, что посмотрел" : "Отметь уроки, которые прошёл"}</div>`;
}

function bindPastelSheet() {
  document.querySelectorAll(".lesson:not([disabled])").forEach(b =>
    b.addEventListener("click", () => {
      const i = Number(b.dataset.i);
      const at = pickLessons.indexOf(i);
      if (at >= 0) pickLessons.splice(at, 1); else pickLessons.push(i);
      renderSheetBody();
    }));
}

/* Части книги с границами страниц: конец каждой — начало следующей минус один. */
function bookParts(b) {
  const bk = b || book();
  const ch = (bk.chapters || []).slice().sort((a, x) => (a.from || 0) - (x.from || 0));
  if (!ch.length) return [{ name: bk.title || "Книга", from: 1, to: bk.pages || 1 }];
  return ch.map((c, i) => ({
    name: c.name || `Часть ${i + 1}`,
    from: Math.max(1, c.from || 1),
    to: i + 1 < ch.length ? Math.max(1, (ch[i + 1].from || 1) - 1) : (bk.pages || c.from)
  }));
}

// сколько страниц части уже прочитано — по нему рисуется заливка
function partCovered(part, spans) {
  let n = 0;
  for (const sp of spans) {
    const a = Math.max(part.from, sp.from), z = Math.min(part.to, sp.to);
    if (z >= a) n += z - a + 1;
  }
  return n;
}

/* Шторка для сборника — два уровня, чтобы не мешать всё в одном экране:
   сначала оглавление, потом одна часть с кнопкой назад. */
function bookPartsUI() {
  const b = book();
  const done = mergeSpans(bookSpans(b));
  const all = mergeSpans(done.concat(pickSpans));
  const parts = bookParts(b);

  // ── уровень 2: одна часть
  if (partOpen != null && parts[partOpen]) {
    const i = partOpen, p = parts[i];
    const total = p.to - p.from + 1;
    const now2 = partCovered(p, all);
    const pct = total ? Math.round(now2 / total * 100) : 0;
    const upto = partUpto[i] != null
      ? partUpto[i]
      : Math.max(p.from, Math.min(p.to, p.from + Math.max(0, now2) - 1));
    return `
      <div class="pt-one">
        <button class="back pt-back" id="ptBack" type="button">‹ Всё содержание</button>
        <div class="pt-title">${esc(p.name)}</div>
        <div class="pt-sub">страницы ${p.from}–${p.to}${pct ? ` · прочитано ${pct}%` : ""}</div>
        <div class="page-pick">
          <span class="pp-label">Дочитал<br><i>до страницы</i></span>
          <div class="stepper">
            <button class="st-btn" data-pd="-1" type="button">−</button>
            <button class="st-val" id="ptVal" type="button">${upto}</button>
            <button class="st-btn" data-pd="1" type="button">＋</button>
          </div>
        </div>
        <div class="quick">${[1, 5, 10].map(n => `<button class="qbtn" data-padd="${n}" type="button">+${n}</button>`).join("")}
          <button class="qbtn" data-padd="end" type="button">до конца</button></div>
        <div class="pt-acts">
          <button class="btn gold" data-ptok="${i}" type="button">Отметить до ${upto}</button>
          <button class="btn" data-ptall="${i}" type="button">Прочитан целиком</button>
        </div>
      </div>`;
  }

  // ── уровень 1: оглавление
  return `
    <div class="parts">
      ${parts.map((p, i) => {
        const total = p.to - p.from + 1;
        const was = partCovered(p, done), now2 = partCovered(p, all);
        const pct = total ? Math.round(now2 / total * 100) : 0;
        const cls = pct >= 100 ? "full" : now2 > was ? "pick" : pct > 0 ? "part" : "";
        return `
          <button class="pt-main ${cls}" data-part="${i}" type="button">
            <span class="pt-fill" style="width:${pct}%"></span>
            <span class="pt-name">${esc(p.name)}</span>
            <span class="pt-meta">${pct >= 100 ? "прочитан" : pct > 0 ? pct + "%" : `${p.from}–${p.to}`}</span>
            <span class="pt-go">›</span>
          </button>`;
      }).join("")}
    </div>
    <div class="pt-hint">Выбери рассказ и укажи, докуда дочитал.</div>`;
}

function bindBookPartsSheet() {
  const parts = bookParts(book());

  document.querySelectorAll("[data-part]").forEach(btn =>
    btn.addEventListener("click", () => { partOpen = +btn.dataset.part; renderSheetBody(); }));

  const back = $("#ptBack");
  if (back) back.addEventListener("click", () => { partOpen = null; renderSheetBody(); });

  const p = partOpen != null ? parts[partOpen] : null;
  const setUpto = (v) => {
    partUpto[partOpen] = Math.max(p.from, Math.min(p.to, v));
    renderSheetBody();
  };
  const cur = () => partUpto[partOpen] != null ? partUpto[partOpen] : p.from;

  document.querySelectorAll("[data-pd]").forEach(btn =>
    btn.addEventListener("click", () => setUpto(cur() + Number(btn.dataset.pd))));
  document.querySelectorAll("[data-padd]").forEach(btn =>
    btn.addEventListener("click", () => {
      setUpto(btn.dataset.padd === "end" ? p.to : cur() + Number(btn.dataset.padd));
    }));

  const val = $("#ptVal");
  if (val) val.addEventListener("click", () => {
    const v = prompt(`«${p.name}» — докуда дочитал?\nСтраницы части: ${p.from}–${p.to}`, String(cur()));
    if (v === null) return;
    const n = Math.round(Number(String(v).replace(",", ".")));
    if (n) setUpto(n);
  });

  document.querySelectorAll("[data-ptok]").forEach(btn =>
    btn.addEventListener("click", () => {
      pickSpans = pickSpans.filter(sp => sp.from !== p.from);
      pickSpans.push({ from: p.from, to: cur() });
      partOpen = null; renderSheetBody();
    }));
  document.querySelectorAll("[data-ptall]").forEach(btn =>
    btn.addEventListener("click", () => {
      pickSpans = pickSpans.filter(sp => sp.from !== p.from);
      pickSpans.push({ from: p.from, to: p.to });
      partUpto[parts.indexOf(p)] = p.to;
      partOpen = null; renderSheetBody();
    }));
}

function bookSheetUI() {
  const cur = bookProgress();
  const delta = pickPage - cur;
  return `
    <div class="page-pick">
      <span class="pp-label">Дочитал<br><i>до страницы${delta > 0 ? ` · <b style="color:var(--green)">+${delta}</b>` : ""}</i></span>
      <div class="stepper">
        <button class="st-btn" data-d="-1" type="button">−</button>
        <button class="st-val" id="pageVal" type="button">${pickPage}</button>
        <button class="st-btn" data-d="1" type="button">＋</button>
      </div>
    </div>
    <div class="quick">${[5, 10, 20, 50].map(n => `<button class="qbtn" data-add="${n}" type="button">+${n}</button>`).join("")}</div>
    <div style="margin-top:12px;font-size:0.85rem;color:var(--muted)">Это глава: <b style="color:var(--ink)">${esc(chapterAt(pickPage).name)}</b></div>`;
}

function bindBookSheet() {
  const pages = book().pages;
  document.querySelectorAll(".st-btn").forEach(b =>
    b.addEventListener("click", () => { pickPage = Math.min(pages, Math.max(0, pickPage + Number(b.dataset.d))); renderSheetBody(); }));
  document.querySelectorAll(".qbtn").forEach(b =>
    b.addEventListener("click", () => { pickPage = Math.min(pages, pickPage + Number(b.dataset.add)); renderSheetBody(); }));
  $("#pageVal").addEventListener("click", () => {
    const v = prompt("До какой страницы дочитал?", String(pickPage));
    if (v === null) return;
    const n = Math.round(Number(v.replace(",", ".")));
    if (isNaN(n) || n < 0 || n > pages) { toast(`Страница от 0 до ${pages}`); return; }
    pickPage = n; renderSheetBody();
  });
}

function pianoSheetUI() {
  return `
    <div class="hand-pick">
      ${[["right", "𝄞 Правая"], ["left", "𝄢 Левая"], ["both", "🤲 Обе"]].map(([h, l]) =>
        `<button class="hp ${pickHand === h ? "on" : ""}" data-hand="${h}" type="button">${l}</button>`).join("")}
    </div>
    <div class="range">
      <div class="range-part">
        <span class="rp-label">с такта</span>
        <div class="stepper">
          <button class="st-btn" data-edge="from" data-d="-1" type="button">−</button>
          <button class="st-val" data-edge="from" type="button">${pickFrom}</button>
          <button class="st-btn" data-edge="from" data-d="1" type="button">＋</button>
        </div>
      </div>
      <div class="range-part">
        <span class="rp-label">по такт</span>
        <div class="stepper">
          <button class="st-btn" data-edge="to" data-d="-1" type="button">−</button>
          <button class="st-val" data-edge="to" type="button">${pickTo}</button>
          <button class="st-btn" data-edge="to" data-d="1" type="button">＋</button>
        </div>
      </div>
    </div>
    ${pending.length ? `<div class="pending">${pending.map((s, i) => `<button class="pchip" data-i="${i}" type="button">${spanText(s)} ✕</button>`).join("")}</div>` : ""}
    <button class="link-btn" id="addSpan" type="button">＋ Добавить ещё фрагмент</button>`;
}

function bindPianoSheet() {
  const bars = piece().bars;
  document.querySelectorAll(".hp").forEach(b =>
    b.addEventListener("click", () => { pickHand = b.dataset.hand; renderSheetBody(); }));
  document.querySelectorAll(".st-btn").forEach(b =>
    b.addEventListener("click", () => {
      const d = Number(b.dataset.d);
      if (b.dataset.edge === "from") { pickFrom = Math.min(bars, Math.max(1, pickFrom + d)); if (pickTo < pickFrom) pickTo = pickFrom; }
      else { pickTo = Math.min(bars, Math.max(1, pickTo + d)); if (pickFrom > pickTo) pickFrom = pickTo; }
      renderSheetBody();
    }));
  document.querySelectorAll(".st-val").forEach(b =>
    b.addEventListener("click", () => {
      const v = prompt(b.dataset.edge === "from" ? "С какого такта?" : "По какой такт?", b.textContent);
      if (v === null) return;
      const n = Math.round(Number(v.replace(",", ".")));
      if (isNaN(n) || n < 1 || n > bars) { toast(`Такт от 1 до ${bars}`); return; }
      if (b.dataset.edge === "from") { pickFrom = n; if (pickTo < n) pickTo = n; }
      else { pickTo = n; if (pickFrom > n) pickFrom = n; }
      renderSheetBody();
    }));
  document.querySelectorAll(".pchip").forEach(b =>
    b.addEventListener("click", () => { pending.splice(Number(b.dataset.i), 1); renderSheetBody(); }));
  $("#addSpan").addEventListener("click", () => {
    pending.push(...(pickHand === "both"
      ? [normSpan("right", pickFrom, pickTo), normSpan("left", pickFrom, pickTo)]
      : [normSpan(pickHand, pickFrom, pickTo)]));
    renderSheetBody();
  });
}

/* ══════════ Кубик: чем заняться сегодня ══════════ */

// все материалы одним списком, с текущим состоянием
// кого предлагать кубику: ровно то, что лежит в ленте — ни курса, которого нет,
// ни единственной книги вместо всех
function candidates() {
  const save = data.active, savePiece = data.piano.activePiece, saveBook = data.book.activeBook;
  const list = [];

  const saveVideo = data.watch.activeVideo;
  for (const it of railItems()) {
    data.active = it.track;
    if (it.pieceId) data.piano.activePiece = it.pieceId;
    if (it.bookId) data.book.activeBook = it.bookId;
    if (it.videoId) data.watch.activeVideo = it.videoId;
    const s = curStats();
    list.push({
      track: it.track, pieceId: it.pieceId || null, bookId: it.bookId || null, videoId: it.videoId || null,
      icon: it.track === "piano" ? "🎹" : it.track === "book" ? "📖" : it.track === "watch" ? "🎬" : "🎨",
      name: it.track === "piano" ? piece().name : it.track === "book" ? book().title
        : it.track === "watch" ? video().title : course().name,
      pct: s.pct, streak: s.streakAll || s.streak || 0,
      doneToday: !!entryFor(todayStr())
    });
  }

  data.active = save; data.piano.activePiece = savePiece; data.book.activeBook = saveBook;
  data.watch.activeVideo = saveVideo;
  return list;
}

function rollCandidate(exceptName) {
  const all = candidates();
  let pool = all.filter(c => !c.doneToday);
  if (!pool.length) pool = all;
  if (pool.length > 1 && exceptName) {
    const other = pool.filter(c => c.name !== exceptName);
    if (other.length) pool = other;
  }
  const weights = pool.map(c => 1 + (100 - Math.min(100, c.pct)) / 40 + (c.streak > 0 ? 0.6 : 0));
  const total = weights.reduce((a, w) => a + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return { pick: pool[i], all };
  }
  return { pick: pool[pool.length - 1], all };
}

/* ── Встряхивание телефона = бросок кубика ── */

// кубик: просто прокручивает ленту и останавливается на выбранном материале
function rollDice() {
  const { pick } = rollCandidate();
  if (!pick) return;

  if (tab !== "home") { tab = "home"; cfg.tab = tab; saveCfg(); render(); }
  if (!railApi) return;

  const i = railApi.indexOf(pick.track, pick.pieceId || pick.bookId || null);
  if (i < 0) return;
  railApi.spinTo(i, () => toast(`Сегодня — ${pick.name}`));
}

// сверяем свою версию с той, что лежит на сервере — мимо всех кэшей
async function checkForUpdate() {
  if (!navigator.onLine) return;
  try {
    const r = await withTimeout(fetch("version.json?ts=" + Date.now(), { cache: "no-store" }), 5000);
    if (!r.ok) return;
    const j = await r.json();
    // если ради этой версии уже обновлялись, а номер не сошёлся — значит дело не в кэше,
    // и мозолить баннером бессмысленно
    if (j.version && j.version !== APP_VERSION && j.version !== cfg.triedVersion) {
      newVersion = j.version;
      renderBanner();
      maybeAutoUpdate();
    } else if (newVersion) {
      newVersion = null;            // обновились или пробовали — баннер убираем
      renderBanner();
    }
  } catch {}
}

// полная переустановка: снимаем service worker, чистим кэши, грузим заново
async function forceUpdate() {
  const btn = $("#sUpdate");
  if (btn) { btn.textContent = "Обновляю…"; btn.disabled = true; }
  toast("Обновляю приложение…");
  if (newVersion) { cfg.triedVersion = newVersion; saveCfg(); }   // отметка на случай, если не поможет

  const cleanup = (async () => {
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      // главное для iOS: заставить браузер перекачать сами файлы, а не отдать их из своего кэша
      await Promise.all(["index.html", "app.js", "sw.js", "manifest.webmanifest"].map(
        f => fetch(f, { cache: "reload" }).catch(() => {})
      ));
    } catch {}
  })();

  // если что-то из этого зависнет — на iOS такое бывает, — всё равно перезагружаемся
  await Promise.race([cleanup, new Promise(r => setTimeout(r, 2500))]);

  // метка версии уходит и в адрес страницы, и в адрес скрипта — тогда старый app.js подхватить неоткуда
  const url = location.origin + location.pathname + "?v=" + encodeURIComponent(newVersion || Date.now());
  location.replace(url);
  // страховка: если standalone проигнорировал replace, пробуем обычным переходом
  setTimeout(() => { location.href = url; }, 1200);
}

// новая версия при запуске ставится сама: одна попытка за сессию, дальше остаётся баннер
function maybeAutoUpdate() {
  if (!newVersion || sheetMode) return;
  try {
    if (sessionStorage.getItem("keiko-autoupd") === newVersion) return;
    sessionStorage.setItem("keiko-autoupd", newVersion);
  } catch { return; }
  forceUpdate();
}

function openAboutSheet() {
  sheetMode = "about";
  openSheet(`
    <div class="ach-sheet">
      <div class="big open" style="font-size:2rem">稽古</div>
      <h3>Кэйко</h3>
      <p style="max-width:340px">
        В Японии так называют регулярную практику в традиционных искусствах — музыке, каллиграфии,
        чайной церемонии, боевых искусствах. Иероглифы 稽古 буквально значат «размышлять о старом»:
        учиться, вглядываясь в то, что сделали до тебя.
      </p>

      <div class="dig">
        <div class="dig-head">Зачем повторять чужое</div>
        <div class="dig-item">Разбирая Баха, ты не переписываешь его — ты влезаешь в его способ думать. Своё появляется потом, из накопленного чужого: язык сначала перенимают, а уже затем говорят на нём своё</div>
        <div class="dig-item">В японской традиции это описано как сюхари: сначала точно следуй форме, потом отклоняйся от неё, и лишь затем отпускай — но пропустить первую ступень нельзя</div>
        <div class="dig-item">Мастера говорят: не ты осваиваешь форму, а форма меняет тебя. Руки, слух, внимание перестраиваются незаметно, пока ты просто повторяешь</div>
      </div>

      <div class="dig">
        <div class="dig-head">Что это даёт человеку</div>
        <div class="dig-item">Занятие без цели «стать лучше всех» снимает тревогу: сегодня достаточно трёх тактов, и этого уже хватает</div>
        <div class="dig-item">Повторение с полным вниманием работает как медитация в действии — мозг отдыхает от многозадачности, а тело успокаивается</div>
        <div class="dig-item">Медленный видимый прогресс — редкое в современной жизни ощущение, что время потрачено не впустую</div>
        <div class="dig-item">Практика даёт устойчивость: у тебя есть дело, которое никуда не денется в плохой день и не зависит от чужой оценки</div>
      </div>

      <p style="max-width:340px;color:var(--dim);font-size:0.86rem">
        Поэтому здесь нет соревнования и рейтингов: только ты, материал и отметка о том,
        что сегодня ты к нему возвращался.
      </p>
    </div>
    <div class="sheet-actions">
      <button class="btn" id="aboutClose" type="button">Закрыть</button>
    </div>`);
  $("#aboutClose").addEventListener("click", closeSheet);
}

// оформление живёт в настройках: цвета и «миры», меняющие интерфейс целиком
function themeUI() {
  const cur = data.shop.theme || "dusk";
  const row = (t) => `
    <button class="pick ${cur === t.id ? "on" : ""}" data-theme="${t.id}" type="button">
      <span class="pk-dots">${t.dots.map(c => `<i style="background:${c}"></i>`).join("")}</span>
      <span class="pk-name">${esc(t.name)}</span>
    </button>`;

  return `
    <div class="freeze">
      <div class="fz-head">🎨 <b>Оформление</b> — цвета и целые миры со своим шрифтом и словами</div>
      <div class="pick-row">${THEMES.filter(t => t.kind !== "world").map(row).join("")}</div>
      <div class="fz-head" style="margin-top:2px">Миры</div>
      <div class="pick-row">${THEMES.filter(t => t.kind === "world").map(row).join("")}</div>
    </div>`;
}

function bindThemeUI() {
  document.querySelectorAll("[data-theme]").forEach(b =>
    b.addEventListener("click", () => {
      data.shop.theme = b.dataset.theme;
      saveData(); schedulePush();
      applyTheme(data.shop.theme);
      closeSheet();
      render();
      toast(`Тема «${themeById(data.shop.theme).name}»`);
    }));
}

function backupBlob() {
  const pack = {
    app: "keiko", v: 1, savedAt: now(),
    version: APP_VERSION, profile: profileId,
    data: exportData()
  };
  return new Blob([JSON.stringify(pack, null, 1)], { type: "application/json" });
}

async function exportBackup() {
  const name = `keiko-${profileId}-${todayStr()}.json`;
  const blob = backupBlob();
  try {
    const file = new File([blob], name, { type: "application/json" });
    // на телефоне удобнее системное «Поделиться»: можно сохранить в Файлы или отправить себе
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "Кэйко — копия данных" });
      return;
    }
  } catch { return; }        // пользователь закрыл окно — это не ошибка

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast("Копия сохранена");
}

// восстановление сливает копию с тем, что есть: ничего не затирается
function restoreBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let pack;
    try { pack = JSON.parse(reader.result); } catch { toast("Файл не читается"); return; }
    const d = pack && (pack.data || pack);
    if (!d || !d.piano) { toast("Это не копия Кэйко"); return; }

    if (pack.profile && pack.profile !== profileId &&
        !confirm(`Копия сделана в профиле «${pack.profile}», а сейчас открыт «${profileId}».\n\nВсё равно восстановить сюда?`)) return;

    const before = dataStamp();
    data.piano.entries = mergeLists(data.piano.entries, d.piano.entries || []);
    data.book.entries = mergeLists(data.book.entries, (d.book && d.book.entries) || []);
    data.pastel.entries = mergeLists(data.pastel.entries, (d.pastel && d.pastel.entries) || []);
    data.watch.videos = mergeLists(data.watch.videos, (d.watch && d.watch.videos) || []);
    data.watch.entries = mergeLists(data.watch.entries, (d.watch && d.watch.entries) || []);
    data.thoughts = mergeLists(data.thoughts || [], d.thoughts || []);
    data.wishes = mergeLists(data.wishes || [], d.wishes || []);
    data.archive = mergeLists(data.archive || [], d.archive || []);
    data.freezes = mergeLists(data.freezes || [], d.freezes || []);

    // материалы, которых у нас нет, тоже возвращаем
    for (const p of (d.piano.pieces || [])) if (!data.piano.pieces.some(x => x.id === p.id)) data.piano.pieces.push(p);
    for (const b of ((d.book && d.book.books) || [])) if (!data.book.books.some(x => x.id === b.id)) data.book.books.push(b);

    normalizeActive();
    saveData(); schedulePush();
    closeSheet(); render();
    toast(before === dataStamp() ? "Всё это уже было" : "Данные восстановлены");
  };
  reader.readAsText(file);
}

/* ══════════ Каталог: обмен с гистом ══════════
   Отдельный гист, чтобы не тащить его при каждой синхронизации данных.
   Тексты — одним файлом, обложки — по файлу на материал, чтобы ни один не разросся. */

const CAT_FILE = "keiko-catalog.json";   // имя своё: catalog.json бывает у других приложений
const CAT_COVER_FILE = (id) => `cover-${id}.txt`;
const CAT_EVERY = 24 * 3600e3;

async function ensureCatalogGist(create) {
  if (cfg.catalogId) {
    // проверяем, что это по-прежнему наш гист, а не чужой с похожим файлом
    const cur = await gh("/gists/" + cfg.catalogId);
    if (cur.ok && ((await cur.json()).files || {})[CAT_FILE]) return cfg.catalogId;
    cfg.catalogId = ""; saveCfg();
  }
  const r = await gh("/gists?per_page=100");
  if (!r.ok) throw new Error("список гистов недоступен");
  const found = (await r.json()).find(g => g.files && g.files[CAT_FILE]);
  if (found) { cfg.catalogId = found.id; saveCfg(); return found.id; }
  if (!create) return "";

  const cr = await gh("/gists", {
    method: "POST",
    body: JSON.stringify({
      description: "Кэйко — каталог материалов (награды, карточки, обложки)",
      public: false,
      files: { [CAT_FILE]: { content: JSON.stringify({ v: 1, savedAt: now(), materials: {} }) } }
    })
  });
  if (!cr.ok) throw new Error("каталог не создался");
  cfg.catalogId = (await cr.json()).id; saveCfg();
  return cfg.catalogId;
}

function applyCatalog(pack) {
  if (!pack || !pack.materials) return 0;
  CATALOG = pack.materials;
  if (Array.isArray(pack.profiles) && pack.profiles.length) PROFILES = pack.profiles;
  achCache.clear(); coverCache.clear();
  try { localStorage.setItem(LS_CAT, JSON.stringify({ materials: CATALOG, profiles: PROFILES })); } catch {}
  cfg.catalogAt = now(); saveCfg();
  return Object.keys(CATALOG).length;
}

// профили, о которых знает гист: если каталога ещё нет, имена возьмём из ключей
function profilesFromKeys(keys) {
  if (PROFILES.length) return;
  PROFILES = (keys || []).map(id => ({ id, name: id, hint: "из гиста" }));
}

async function catalogPull(force) {
  if (!cfg.token) return;
  if (!force && now() - (cfg.catalogAt || 0) < CAT_EVERY) return;
  const id = await ensureCatalogGist(false);
  if (!id) return;
  const r = await gh("/gists/" + id);
  if (!r.ok) throw new Error("каталог недоступен");
  const files = (await r.json()).files || {};
  const f = files[CAT_FILE];
  if (!f) return;
  let txt = f.content;
  if (f.truncated && f.raw_url) txt = await (await withTimeout(fetch(f.raw_url), 20000)).text();
  const n = applyCatalog(JSON.parse(txt));
  await applyTaxonomy(files);
  return n;
}

// taxonomy + categories из того же гиста; если файлов нет — карта просто не покажет данные
async function applyTaxonomy(files) {
  try {
    const readFile = async (name) => {
      const f = files[name]; if (!f) return null;
      let t = f.content;
      if (f.truncated && f.raw_url) t = await (await withTimeout(fetch(f.raw_url), 20000)).text();
      return JSON.parse(t);
    };
    const tax = await readFile(TAX_FILE);
    const cats = await readFile(CATS_FILE);
    if (tax) TAXONOMY = tax;
    if (cats && cats.byId) CATEGORIES = cats.byId;
    if (tax || cats) localStorage.setItem(LS_TAX, JSON.stringify({ taxonomy: TAXONOMY, categories: CATEGORIES }));

    const prac = await readFile(PRAC_FILE);
    if (prac && typeof prac === "object") {
      PRACTICE_DATA = prac;
      localStorage.setItem(LS_PRAC, JSON.stringify(prac));
    }
  } catch {}
}

// обложки качаем по одной и только когда материал реально показан
const coverPulling = new Set();
async function pullCover(id) {
  if (!cfg.token || !cfg.catalogId || coverPulling.has(id)) return;
  coverPulling.add(id);
  try {
    const r = await gh("/gists/" + cfg.catalogId);
    if (!r.ok) return;
    const f = (await r.json()).files[CAT_COVER_FILE(id)];
    if (!f) return;
    let txt = f.content;
    if (f.truncated && f.raw_url) txt = await (await withTimeout(fetch(f.raw_url), 25000)).text();
    txt = txt.trim();
    if (!txt.startsWith("data:")) return;
    await coverSave(id, txt);
    coversArrived();
  } catch {} finally { coverPulling.delete(id); }
}

/* Обложки приезжают по одной. Раньше каждая дёргала полную громкую перерисовку —
   на полке это давало серию рывков. Теперь копим и перерисовываем один раз, тихо. */
let coversTimer = 0;
function coversArrived() {
  clearTimeout(coversTimer);
  coversTimer = setTimeout(() => {
    render(true);
    const ov = document.getElementById("kmap");
    if (ov && !ov.hidden && window.refreshKnowledgeMap) window.refreshKnowledgeMap();
  }, 260);
}

/* Наполнение каталога: файл, собранный из первой версии приложения.
   Внутри { catalog: {...}, covers: { <id>: "data:image/jpeg;base64,…" } }. */
async function catalogUpload(file) {
  const txt = await file.text();
  let pack;
  try { pack = JSON.parse(txt); } catch { throw new Error("файл не читается"); }
  const cat = pack.catalog || pack;
  const covers = pack.covers || {};
  if (!cat.materials) throw new Error("в файле нет материалов");

  const id = await ensureCatalogGist(true);
  const files = { [CAT_FILE]: { content: JSON.stringify({ ...cat, savedAt: now() }) } };
  for (const [mid, uri] of Object.entries(covers)) {
    if (typeof uri === "string" && uri.startsWith("data:")) files[CAT_COVER_FILE(mid)] = { content: uri };
  }
  const up = await gh("/gists/" + id, { method: "PATCH", body: JSON.stringify({ files }) });
  if (!up.ok) throw new Error("каталог не записался (" + up.status + ")");

  applyCatalog(cat);
  for (const [mid, uri] of Object.entries(covers)) {
    if (typeof uri === "string" && uri.startsWith("data:")) await coverSave(mid, uri).catch(() => {});
  }
  return Object.keys(cat.materials).length;
}

/* Как читается книга. Роман идёт подряд, сборник — вразнобой:
   там отмечают рассказы, а не «докуда дошёл». */
const bookMode = (b) => (b && b.mode === "parts") ? "parts" : "linear";

/* ── Библиотека: все материалы, у каждого своя страница со всем, что известно ── */
function libraryUI() {
  const books  = (data.book.books || []).filter(b => !b.archived);
  const pieces = (data.piano.pieces || []).filter(p => !p.archived);
  const hasPastel = course().lessons.length > 0;
  if (libBook) {
    const [kind, id] = libBook.split(":");
    if (kind === "bk") {
      const b = (data.book.books || []).find(x => x.id === id);
      if (b) return bookPageUI(b);
    }
    if (kind === "pf") {
      const pc = (data.piano.pieces || []).find(x => x.id === id);
      if (pc) return piecePageUI(pc);
    }
    if (kind === "ps" && hasPastel) return pastelPageUI();
    if (kind === "wt") { const v = videos().find(x => x.id === id); if (v) return watchPageUI(v); libBook = null; }
    libBook = null;
  }

  const row = (key, cover, fallback, title, sub, pct, meta, wide) => `
    <button class="lib-row" data-lib="${esc(key)}" type="button">
      <span class="lib-cover ${wide ? "wide" : ""}">${cover ? `<img src="${esc(cover)}" alt="" loading="lazy">` : `<i>${fallback}</i>`}</span>
      <span class="lib-body">
        <b>${esc(title)}</b>
        <em>${esc(sub || "")}</em>
        <span class="lib-bar"><i style="width:${pct}%"></i></span>
        <span class="lib-meta">${meta}</span>
      </span>
      <span class="mc-go">›</span>
    </button>`;

  const group = (name, rows) => rows.length
    ? `<div class="lib-group">${esc(name)}</div><div class="lib-list">${rows.join("")}</div>` : "";

  const bookRows = books.map(b => {
    const ent = bookEntriesOf(b.id);
    const cov = Math.min(b.pages || 0, bookCovered(b));
    const pct = b.pages ? Math.round(cov / b.pages * 100) : 0;
    return row("bk:" + b.id, coverSrc(b.id, b.cover || ""), "📖", b.title, b.author, pct,
      `${pct}% · ${cov} из ${b.pages} стр · ${ent.length} ${plural(ent.length, "запись", "записи", "записей")}`);
  });

  const pieceRows = pieces.map(pc => {
    const st = withMaterial({ track: "piano", pieceId: pc.id }, pianoStats);
    const pct = Math.round(shownPct(st) || 0);
    const ent = pieceEntriesOf(pc.id);
    return row("pf:" + pc.id, coverSrc(pc.id, pc.cover || ""), "🎹", pc.name, pc.author, pct,
      `${pct}% · ${pc.bars} ${plural(pc.bars, "такт", "такта", "тактов")} · ${ent.length} ${plural(ent.length, "запись", "записи", "записей")}`);
  });

  const watchRows = videos().filter(v => !v.archived).slice().reverse().map(v => {
    const ent = watchEntriesOf(v.id);
    const last = ent.length ? fmtDay(ent[ent.length - 1].date) : "";
    return row("wt:" + v.id, watchThumb(v), "🎬", v.title, v.author, v.done ? 100 : 0,
      v.done ? `посмотрено${last ? " · " + last : ""}` : "в очереди", true);
  });

  const pastelRows = hasPastel ? (() => {
    const st = withMaterial({ track: "pastel" }, pastelStats);
    const pct = Math.round(st.pct);
    return [row("ps:pastel", coverSrc("pastel", ""), "🎨", course().name, course().author, pct,
      `${pct}% · ${st.done} из ${st.lessons} уроков · ${st.minutes} мин`)];
  })() : [];

  /* Полка переехала сюда из «Достижений»: прочитанное — такая же часть
     библиотеки, как то, что сейчас в работе, и искать его на другом экране
     было незачем. */
  const shelf = shelfItems();
  const fmtY = new Intl.DateTimeFormat("ru", { day: "numeric", month: "short", year: "numeric" });
  const shelfThumb = (a) => {
    const own = [...data.book.books, ...(data.piano.pieces || [])].find(x => "bk_" + x.id === a.id || x.id === a.id);
    let src = own ? coverSrc(own.id, own.cover || "") : "";
    if (!src && a.track === "pastel") src = coverSrc("pastel", "");
    if (!src && a.track === "watch") src = watchThumb(videos().find(v => v.id === a.videoId) || {});
    return src;
  };
  const shelfRows = shelf.map(a => `
    <button class="lib-row" data-shelf="${esc(a.id)}" type="button">
      <span class="lib-cover">${shelfThumb(a)
        ? `<img src="${esc(shelfThumb(a))}" alt="" loading="lazy">` : `<i>${esc(a.icon || "📖")}</i>`}</span>
      <span class="lib-body">
        <b>${esc(a.title)}</b>
        <em>${esc(a.sub || "")}</em>
        <span class="lib-meta">${esc(fmtY.format(fromStr(a.finishedAt)).replace(" г.", ""))}
          ${a.rating ? " · " + "★".repeat(a.rating) : ""}${a.review ? "" : " · без отзыва"}</span>
      </span>
      <span class="mc-go">›</span>
    </button>`);

  /* Две секции вместо шести: что в работе и что пройдено. Деление по трекам
     ничего не давало — книга, пьеса и ролик и так различимы по обложке,
     а шесть заголовков превращали список в лестницу. */
  const work = [...bookRows, ...pieceRows, ...pastelRows, ...watchRows];

  return `
    <div class="lib-group">В работе · ${work.length}</div>`
    + (work.length ? `<div class="lib-list">${work.join("")}</div>`
        : `<div class="empty-note">Пока ничего не добавлено.</div>`)
    + `<div class="lib-group">Архив · ${shelf.length}</div>`
    + (shelfRows.length ? `<div class="lib-list">${shelfRows.join("")}</div>`
        : `<div class="empty-note">Здесь будет пройденное — с оценкой и отзывом.</div>`)
    + `<div class="lib-group">Добавить</div>`
    + watchAddUI()
    + `<button class="btn add-book" id="libAddBook" type="button">＋ Прочитанную книгу</button>`;
}

function bookPageUI(b) {
  const ent = bookEntriesOf(b.id).slice().sort((x, y) => x.date < y.date ? -1 : 1);
  const spans = mergeSpans(bookSpans(b));
  const cov = Math.min(b.pages || 0, bookCovered(b));
  const pct = b.pages ? Math.round(cov / b.pages * 100) : 0;
  const parts = bookParts(b);
  const notes = ent.filter(e => e.note).length;
  const thoughts = (data.thoughts || []).filter(t => !t.deleted && t.key === b.id).length;
  const first = ent[0] ? fmtDay(ent[0].date) : "—";
  const last = ent.length ? fmtDay(ent[ent.length - 1].date) : "—";
  const days = new Set(ent.map(e => e.date)).size;

  // карта книги: закрашены прочитанные страницы
  const cells = 60;
  const per = Math.max(1, (b.pages || cells) / cells);
  const map = Array.from({ length: cells }, (_, i) => {
    const from = Math.floor(i * per) + 1, to = Math.floor((i + 1) * per);
    let n = 0;
    for (const sp of spans) {
      const a2 = Math.max(from, sp.from), z = Math.min(to, sp.to);
      if (z >= a2) n += z - a2 + 1;
    }
    const k = Math.min(1, n / Math.max(1, to - from + 1));
    return `<i style="opacity:${(0.10 + 0.9 * k).toFixed(2)}"></i>`;
  }).join("");

  return `
    <button class="back" id="libBack" type="button">‹ Все материалы</button>

    <div class="panel lib-head">
      <div class="lib-cover big">${coverSrc(b.id, b.cover || "")
        ? `<img src="${esc(coverSrc(b.id, b.cover || ""))}" alt="">` : `<i>📖</i>`}</div>
      <div class="lib-title"><b>${esc(b.title)}</b><em>${esc(b.author || "")}</em></div>
    </div>

    <div class="freeze">
      <div class="fz-head">📐 <b>Формат содержания</b> — как эту книгу читают</div>
      <div class="pick-row">
        <button class="pick ${bookMode(b) === "linear" ? "on" : ""}" data-bm="${esc(b.id)}" data-mode="linear" type="button">
          <span class="pk-name">Подряд</span><span class="pk-hint">роман, читается линейно</span></button>
        <button class="pick ${bookMode(b) === "parts" ? "on" : ""}" data-bm="${esc(b.id)}" data-mode="parts" type="button">
          <span class="pk-name">Вразнобой</span><span class="pk-hint">сборник, части в любом порядке</span></button>
      </div>
    </div>

    <div class="panel">
      <div class="lib-map">${map}</div>
      <div class="lib-num">
        <div><b>${pct}%</b><span>прочитано</span></div>
        <div><b>${cov}</b><span>из ${b.pages} стр</span></div>
        <div><b>${days}</b><span>${plural(days, "день", "дня", "дней")}</span></div>
        <div><b>${parts.length}</b><span>${plural(parts.length, "часть", "части", "частей")}</span></div>
      </div>
      <div class="lib-rows">
        <div><span>Первая запись</span><b>${esc(first)}</b></div>
        <div><span>Последняя</span><b>${esc(last)}</b></div>
        <div><span>Заметок при отметке</span><b>${notes}</b></div>
        <div><span>Моментов о книге</span><b>${thoughts}</b></div>
        ${b.startPage ? `<div><span>Начал со страницы</span><b>${b.startPage}</b></div>` : ""}
      </div>
    </div>

    <div class="freeze">
      <div class="fz-head">📑 <b>Содержание</b> — ${parts.length} ${plural(parts.length, "часть", "части", "частей")}</div>
      <div class="parts">
        ${parts.map(p => {
          const total = p.to - p.from + 1;
          const n = partCovered(p, spans);
          const k = total ? Math.round(n / total * 100) : 0;
          return `
            <div class="pt-main ${k >= 100 ? "full" : k > 0 ? "part" : ""}" style="cursor:default">
              <span class="pt-fill" style="width:${k}%"></span>
              <span class="pt-name">${esc(p.name)}</span>
              <span class="pt-meta">${k >= 100 ? "прочитан" : k > 0 ? k + "%" : `${p.from}–${p.to}`}</span>
            </div>`;
        }).join("")}
      </div>
    </div>

    <button class="btn lib-arch" data-libarch="bk:${esc(b.id)}" type="button">Завершить и убрать в архив</button>`;
}

/* Видео — единственный материал, который заводится руками. */
function watchAddUI() {
  return `
    <div class="freeze">
      <div class="fz-head">🔗 <b>Добавить видео</b> — вставь ссылку с YouTube</div>
      <div class="wt-add">
        <input id="wtUrl" type="url" inputmode="url" autocomplete="off"
               placeholder="https://youtu.be/…" ${watchBusy ? "disabled" : ""}>
        <button class="btn" id="wtAdd" type="button" ${watchBusy ? "disabled" : ""}>${watchBusy ? "Гружу…" : "Добавить"}</button>
      </div>
      <div class="wt-hint">Название, автора и обложку возьмём с самого ютуба. Каждое видео — отдельный материал на главной.</div>
    </div>`;
}

function watchPageUI(v) {
  const st = withMaterial({ track: "watch", videoId: v.id }, watchStats);
  const ent = watchEntriesOf(v.id).slice().sort((x, y) => x.date < y.date ? -1 : 1);
  const thoughts = (data.thoughts || []).filter(t => !t.deleted && t.key === v.id).length;
  const src = watchThumb(v);

  return `
    <button class="back" id="libBack" type="button">‹ Все материалы</button>

    <div class="panel lib-head">
      <div class="lib-cover big wide">${src ? `<img src="${esc(src)}" alt="">` : `<i>🎬</i>`}</div>
      <div class="lib-title"><b>${esc(v.title)}</b><em>${esc(v.author || "видео")}</em></div>
    </div>

    <div class="panel">
      <div class="lib-rows">
        <div><span>Состояние</span><b>${v.done ? "посмотрено" : "в очереди"}</b></div>
        ${v.done && v.doneAt ? `<div><span>Когда посмотрел</span><b>${esc(fmtDay(dateStr(new Date(v.doneAt))))}</b></div>` : ""}
        <div><span>Добавлено</span><b>${v.addedAt ? esc(fmtDay(dateStr(new Date(v.addedAt)))) : "—"}</b></div>
        <div><span>Просмотров</span><b>${ent.length}</b></div>
        <div><span>Последний</span><b>${ent.length ? esc(fmtDay(ent[ent.length - 1].date)) : "—"}</b></div>
        <div><span>Заметок при отметке</span><b>${st.notes}</b></div>
        <div><span>Моментов о видео</span><b>${thoughts}</b></div>
      </div>
    </div>

    <div class="freeze">
      <div class="fz-head">🎬 <b>Видео</b></div>
      <div class="wt-page-acts">
        <a class="btn" href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">Открыть на YouTube</a>
        <button class="btn" data-wtcopy="${esc(v.title)}" type="button">Скопировать название</button>
      </div>
      ${v.done
        ? `<button class="btn" data-wtback="${esc(v.id)}" type="button" style="margin-top:10px">Вернуть на главную</button>`
        : `<button class="btn" data-wtdone="${esc(v.id)}" type="button" style="margin-top:10px">Отметить посмотренным</button>`}
      <button class="btn" data-wtdel="${esc(v.id)}" type="button" style="margin-top:10px">Убрать из библиотеки</button>
    </div>`;
}
/* Где застреваешь: сколько времени уходило на отрезки. Это единственное,
   что измеряется само, без веры на слово, — потому по нему и судим. */
function pracStuckHTML(pieceId) {
  const st = (data.practice || {})[pieceId];
  const log = (st && st.log) || [];
  if (log.length < 5) return "";

  const byBar = new Map();
  for (const r of log) {
    const [from, to] = String(r.b).split("-").map(Number);
    for (let b = from; b <= to; b++) {
      const cur = byBar.get(b) || { sec: 0, n: 0 };
      cur.sec += r.sec / (to - from + 1);        // время делим на такты отрезка
      cur.n++;
      byBar.set(b, cur);
    }
  }
  const rows = [...byBar.entries()]
    .map(([bar, v]) => ({ bar, sec: Math.round(v.sec), n: v.n }))
    .sort((a, b) => b.sec - a.sec)
    .slice(0, 8);
  if (!rows.length) return "";

  const max = rows[0].sec || 1;
  const total = Math.round([...byBar.values()].reduce((a, v) => a + v.sec, 0) / 60);
  const mm = (sec) => sec >= 60 ? Math.round(sec / 60) + " мин" : sec + " с";

  return `
    <div class="freeze">
      <div class="fz-head">⏱ <b>Где застреваешь</b> — сколько времени ушло на такт</div>
      <div class="stuck">
        ${rows.map((r) => `
          <div class="stuck-row">
            <b>такт ${r.bar}</b>
            <span class="stuck-bar"><i style="width:${Math.round(r.sec / max * 100)}%"></i></span>
            <span class="stuck-v">${mm(r.sec)}</span>
          </div>`).join("")}
      </div>
      <p class="stuck-note">Всего за разбором — ${total} ${plural(total, "минута", "минуты", "минут")}.
        Считается время от появления отрезка до «Получилось».</p>
    </div>`;
}

// страница композиции — только чтение, всё собранное в одном месте
function piecePageUI(pc) {
  const st  = withMaterial({ track: "piano", pieceId: pc.id }, pianoStats);
  const ent = pieceEntriesOf(pc.id).slice().sort((x, y) => x.date < y.date ? -1 : 1);
  const notes = ent.filter(e => e.note).length;
  const thoughts = (data.thoughts || []).filter(t => !t.deleted && t.key === pc.id).length;
  const days = new Set(ent.map(e => e.date)).size;

  // карта тактов: по строке на руку, насыщенность — число проходов
  const strip = (arr) => Array.from({ length: pc.bars }, (_, i) => {
    const n = arr[i + 1] || 0;
    return `<i style="opacity:${(0.10 + 0.9 * Math.min(1, n / FIRM_AT)).toFixed(2)}"></i>`;
  }).join("");

  return `
    <button class="back" id="libBack" type="button">‹ Все материалы</button>

    <div class="panel lib-head">
      <div class="lib-cover big">${coverSrc(pc.id, pc.cover || "")
        ? `<img src="${esc(coverSrc(pc.id, pc.cover || ""))}" alt="">` : `<i>🎹</i>`}</div>
      <div class="lib-title"><b>${esc(pc.name)}</b><em>${esc(pc.author || "")}</em></div>
    </div>

    <div class="panel">
      <div class="lib-hand">правая</div>
      <div class="lib-map bars">${strip(st.passes.right)}</div>
      <div class="lib-hand">левая</div>
      <div class="lib-map bars">${strip(st.passes.left)}</div>
      <div class="lib-num">
        <div><b>${Math.round(shownPct(st) || 0)}%</b><span>выучено</span></div>
        <div><b>${pc.bars}</b><span>${plural(pc.bars, "такт", "такта", "тактов")}</span></div>
        <div><b>${days}</b><span>${plural(days, "день", "дня", "дней")}</span></div>
        <div><b>${st.maxPass}</b><span>${plural(st.maxPass, "проход", "прохода", "проходов")}</span></div>
      </div>
      <div class="lib-rows">
        <div><span>Первая запись</span><b>${ent[0] ? esc(fmtDay(ent[0].date)) : "—"}</b></div>
        <div><span>Последняя</span><b>${ent.length ? esc(fmtDay(ent[ent.length - 1].date)) : "—"}</b></div>
        <div><span>Задето тактов</span><b>${st.touchedR} пр · ${st.touchedL} лев</b></div>
        <div><span>Выучено крепко</span><b>${st.firmR} пр · ${st.firmL} лев</b></div>
        <div><span>Заметок при отметке</span><b>${notes}</b></div>
        <div><span>Моментов о композиции</span><b>${thoughts}</b></div>
      </div>
    </div>

    ${pracStuckHTML(pc.id)}

    <div class="freeze"><div class="fz-head">🎹 <b>Как считается</b> — такт считается выученным после ${FIRM_AT} проходов, поэтому процент строже, чем «задет»</div></div>

    <button class="btn lib-arch" data-libarch="pf:${esc(pc.id)}" type="button">Завершить и убрать в архив</button>`;
}

// страница курса — тоже только чтение
function pastelPageUI() {
  const c  = course();
  const st = withMaterial({ track: "pastel" }, pastelStats);
  const ent = data.pastel.entries.filter(e => !e.deleted).slice().sort((x, y) => x.date < y.date ? -1 : 1);
  const notes = ent.filter(e => e.note).length;
  const thoughts = (data.thoughts || []).filter(t => !t.deleted && t.key === "pastel").length;
  const days = new Set(ent.map(e => e.date)).size;

  return `
    <button class="back" id="libBack" type="button">‹ Все материалы</button>

    <div class="panel lib-head">
      <div class="lib-cover big">${coverSrc("pastel", "")
        ? `<img src="${esc(coverSrc("pastel", ""))}" alt="">` : `<i>🎨</i>`}</div>
      <div class="lib-title"><b>${esc(c.name)}</b><em>${esc(c.author || "")}</em></div>
    </div>

    <div class="panel">
      <div class="lib-map">${c.lessons.map((_, i) =>
        `<i style="opacity:${st.doneSet.has(i) ? 1 : 0.10}"></i>`).join("")}</div>
      <div class="lib-num">
        <div><b>${Math.round(st.pct)}%</b><span>пройдено</span></div>
        <div><b>${st.done}</b><span>из ${st.lessons} уроков</span></div>
        <div><b>${days}</b><span>${plural(days, "день", "дня", "дней")}</span></div>
        <div><b>${st.minutes}</b><span>мин</span></div>
      </div>
      <div class="lib-rows">
        <div><span>Первая запись</span><b>${ent[0] ? esc(fmtDay(ent[0].date)) : "—"}</b></div>
        <div><span>Последняя</span><b>${ent.length ? esc(fmtDay(ent[ent.length - 1].date)) : "—"}</b></div>
        <div><span>Заметок при отметке</span><b>${notes}</b></div>
        <div><span>Моментов о курсе</span><b>${thoughts}</b></div>
      </div>
    </div>

    <div class="freeze">
      <div class="fz-head">🎨 <b>Уроки</b> — ${st.lessons} ${plural(st.lessons, "урок", "урока", "уроков")}</div>
      <div class="parts">
        ${c.lessons.map((l, i) => `
          <div class="pt-main ${st.doneSet.has(i) ? "full" : ""}" style="cursor:default">
            <span class="pt-fill" style="width:${st.doneSet.has(i) ? 100 : 0}%"></span>
            <span class="pt-name">${esc(l.name || "Урок " + (i + 1))}</span>
            <span class="pt-meta">${st.doneSet.has(i) ? "пройден" : Math.round(l.dur / 60) + " мин"}</span>
          </div>`).join("")}
      </div>
    </div>

    <button class="btn lib-arch" data-libarch="ps:pastel" type="button">Завершить и убрать в архив</button>`;
}

function bindLibraryUI() {
  document.querySelectorAll("[data-lib]").forEach(btn =>
    btn.addEventListener("click", () => { libBook = btn.dataset.lib; render(); $("#view").scrollTop = 0; }));
  const addBook = $("#libAddBook");
  if (addBook) addBook.addEventListener("click", openAddBookSheet);
  document.querySelectorAll("[data-shelf]").forEach(btn =>
    btn.addEventListener("click", () => openShelfSheet(btn.dataset.shelf)));
  /* Карта знаний уехала отдельным разделом настроек, экран наград скрыт:
     награды и карточки видны в «Моментах», внутри своей сессии. Код обоих
     цел — вернуть их значит вернуть строку в список разделов. */
  /* Кнопка «в архив» переехала со страницы настроек на страницу самого
     материала: там понятно, что именно завершаешь. Раньше она стояла в общем
     блоке и завершала «текущий», а какой текущий — приходилось помнить. */
  document.querySelectorAll("[data-libarch]").forEach(btn =>
    btn.addEventListener("click", () => {
      const [kind, id] = btn.dataset.libarch.split(":");
      if (kind === "bk") { data.active = "book"; data.book.activeBook = id; }
      else if (kind === "pf") { data.active = "piano"; data.piano.activePiece = id; }
      else if (kind === "ps") data.active = "pastel";
      libBook = null;
      archiveCurrent();
    }));
  const back = $("#libBack");
  if (back) back.addEventListener("click", () => { libBook = null; render(); $("#view").scrollTop = 0; });
  const wtAdd = $("#wtAdd"), wtUrl = $("#wtUrl");
  if (wtAdd && wtUrl) {
    const go = async () => {
      const v = wtUrl.value.trim();
      if (!v) { toast("Вставь ссылку"); return; }
      if (await watchAdd(v)) { wtUrl.value = ""; render(); }
    };
    wtAdd.addEventListener("click", go);
    wtUrl.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); go(); } });
  }
  document.querySelectorAll("[data-wtcopy]").forEach(btn =>
    btn.addEventListener("click", () => copyText(btn.dataset.wtcopy)));
  document.querySelectorAll("[data-wtdone]").forEach(btn =>
    btn.addEventListener("click", () => {
      /* Прямой путь на случай, если отметка с главной почему-то не прошла:
         видео уходит с ленты и остаётся в библиотеке. */
      const v = videos().find(x => x.id === btn.dataset.wtdone);
      if (!v) return;
      v.done = true; v.doneAt = now(); v.updatedAt = now();
      addEvent("done", v.id, "watch", "Досмотрел: " + v.title,
        { tag: v.id, fields: { createdAt: now() } });
      saveData(); schedulePush(); render();
      toast("Посмотрено");
    }));
  document.querySelectorAll("[data-wtback]").forEach(btn =>
    btn.addEventListener("click", () => {
      const v = videos().find(x => x.id === btn.dataset.wtback);
      if (!v) return;
      v.done = false; v.doneAt = 0; v.updatedAt = now();
      data.watch.activeVideo = v.id;
      saveData(); schedulePush(); render(); toast("Вернулось на главную");
    }));
  document.querySelectorAll("[data-wtdel]").forEach(btn =>
    btn.addEventListener("click", () => {
      const v = videos().find(x => x.id === btn.dataset.wtdel);
      /* Убираем пометкой, а не вырезанием: записи и мысли ссылаются на этот материал. */
      if (!v || !confirm(`Убрать «${v.title}» из библиотеки?\n\nЗаписи и моменты о нём останутся.`)) return;
      v.archived = true; v.updatedAt = now();
      saveData(); schedulePush(); libBook = null; render(); toast("Убрано");
    }));
  document.querySelectorAll("[data-bm]").forEach(btn =>
    btn.addEventListener("click", () => {
      const b = (data.book.books || []).find(x => x.id === btn.dataset.bm);
      if (!b) return;
      b.mode = btn.dataset.mode; b.updatedAt = now();
      saveData(); schedulePush(); render();
      toast(b.mode === "parts" ? "Читается вразнобой" : "Читается подряд");
    }));
}

function catalogUI() {
  if (!cfg.token || !cfg.gistId)
    return `<div class="freeze"><div class="fz-head">📚 <b>Каталог</b> — появится, когда подключишь синхронизацию</div></div>`;

  const inCat = Object.keys(CATALOG);
  const mats = achMaterials();
  const when = cfg.catalogAt ? fmtDay(dateStr(new Date(cfg.catalogAt))) : "не загружался";

  return `
    <div class="freeze">
      <div class="fz-head">📚 <b>Каталог</b> — награды, карточки знаний и обложки могут жить в гисте, а не в коде приложения</div>
      <div class="fz-empty">В каталоге: ${inCat.length ? esc(inCat.join(", ")) : "пусто"} · сверка ${esc(when)}</div>
      <div class="fz-form2">
        <button class="btn" id="catPull" type="button">Обновить из гиста</button>
        <button class="btn" id="catDrop" type="button">Забыть каталог</button>
      </div>
      <div class="fz-head" style="margin-top:10px">Первое наполнение — файлом с компьютера</div>
      <button class="btn" id="catUp" type="button">Залить каталог из файла</button>
      <input type="file" id="catFile" accept="application/json,.json" style="display:none">
      <div class="fz-empty">Файл кладётся в отдельный гист: тексты одним файлом, обложки — по одной на материал.</div>
    </div>`;
}

function bindCatalogUI() {
  const pull = $("#catPull");
  if (pull) pull.addEventListener("click", async () => {
    toast("Смотрю каталог…");
    try {
      const n = await catalogPull(true);
      toast(n ? `Загружено материалов: ${n}` : "Каталог пуст");
      render();
    } catch (e) { toast(e.message || "Не получилось"); }
  });

  const drop = $("#catDrop");
  if (drop) drop.addEventListener("click", () => {
    if (!confirm("Забыть загруженный каталог?\n\nПриложение вернётся к зашитым текстам и обложкам. Гист останется на месте.")) return;
    Object.keys(CATALOG).forEach(id => { try { localStorage.removeItem(LS_COVER(id)); } catch {} });
    if (window.caches) caches.delete(COVER_CACHE).catch(() => {});
    CATALOG = {}; achCache.clear(); coverCache.clear();
    try { localStorage.removeItem(LS_CAT); } catch {}
    cfg.catalogAt = 0; saveCfg(); render();
    toast("Каталог забыт");
  });

  const up = $("#catUp"), file = $("#catFile");
  if (up && file) {
    up.addEventListener("click", () => file.click());
    file.addEventListener("change", async () => {
      if (!file.files[0]) return;
      toast("Заливаю…");
      try {
        const n = await catalogUpload(file.files[0]);
        toast(`В каталоге материалов: ${n}`);
        render();
      } catch (e) { toast(e.message || "Не получилось"); }
    });
  }
}

/* ══════════ Автокопия ══════════
   Раз в неделю кладём снимок всех данных в отдельный гист-архив: файл на месяц,
   двенадцать последних месяцев. Основной гист может испортиться или пропасть —
   архив живёт отдельно и не требует ни одного нажатия. */

const ARCH_FILE = (d = new Date()) =>
  `keiko-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}.json`;
const ARCH_KEEP = 12;
const ARCH_EVERY = 7 * 864e5;

async function ensureArchiveGist() {
  if (cfg.archiveId) return cfg.archiveId;
  const r = await gh("/gists?per_page=100");
  if (!r.ok) throw new Error("список гистов недоступен");
  const found = (await r.json()).find(g => (g.description || "").startsWith("Кэйко — архив"));
  if (found) { cfg.archiveId = found.id; saveCfg(); return found.id; }

  const cr = await gh("/gists", {
    method: "POST",
    body: JSON.stringify({
      description: "Кэйко — архив копий (создаётся приложением)",
      public: false,
      files: { "readme.md": { content: "Снимки данных Кэйко. По файлу на месяц, последние 12." } }
    })
  });
  if (!cr.ok) throw new Error("архив не создался");
  cfg.archiveId = (await cr.json()).id; saveCfg();
  return cfg.archiveId;
}

// box — то, что сейчас лежит в основном гисте: конверт с обоими профилями
async function archiveNow(box, manual) {
  const id = await ensureArchiveGist();
  const files = { [ARCH_FILE()]: { content: JSON.stringify({ ...box, archivedAt: now(), by: profileId }) } };

  // ротация: держим только последние снимки, лишние удаляем (значение null)
  const r = await gh("/gists/" + id);
  if (r.ok) {
    const names = Object.keys((await r.json()).files || {})
      .filter(n => n.startsWith("keiko-") && n !== ARCH_FILE())
      .sort();
    const extra = names.length - (ARCH_KEEP - 1);
    for (let i = 0; i < extra; i++) files[names[i]] = null;
  }

  const up = await gh("/gists/" + id, { method: "PATCH", body: JSON.stringify({ files }) });
  if (!up.ok) throw new Error("копия не записалась");
  cfg.lastArchive = now(); saveCfg();
  if (manual) toast("Копия сохранена в архив");
}

// вызывается после удачной синхронизации: раз в неделю и молча
function maybeArchive(box) {
  if (!cfg.token || !cfg.gistId || cfg.archiveOff) return;   // по умолчанию включена
  if (now() - (cfg.lastArchive || 0) < ARCH_EVERY) return;
  archiveNow(box, false).catch(() => {});   // не получилось — попробуем в следующий раз
}

// список снимков в архиве: для восстановления
async function archiveList() {
  if (!cfg.archiveId) return [];
  const r = await gh("/gists/" + cfg.archiveId);
  if (!r.ok) throw new Error("архив недоступен");
  const g = await r.json();
  return Object.values(g.files || {})
    .filter(f => f.filename.startsWith("keiko-"))
    .sort((a, b) => b.filename.localeCompare(a.filename));
}

// восстановление из снимка: то же слияние, что и у файла с устройства
async function restoreArchive(file) {
  let txt = file.content;
  if (file.truncated && file.raw_url) txt = await (await withTimeout(fetch(file.raw_url), 15000)).text();
  let box;
  try { box = JSON.parse(txt); } catch { toast("Снимок не читается"); return; }
  const d = migrate((box.profiles && box.profiles[profileId]) || null);
  if (!d || !d.piano) { toast("В снимке нет этого профиля"); return; }

  const before = dataStamp();
  data.piano.entries = mergeLists(data.piano.entries, d.piano.entries || []);
  data.book.entries = mergeLists(data.book.entries, d.book.entries || []);
  data.pastel.entries = mergeLists(data.pastel.entries, d.pastel.entries || []);
  data.watch.videos = mergeLists(data.watch.videos, (d.watch && d.watch.videos) || []);
  data.watch.entries = mergeLists(data.watch.entries, (d.watch && d.watch.entries) || []);
  data.thoughts = mergeLists(data.thoughts || [], d.thoughts || []);
  data.wishes = mergeLists(data.wishes || [], d.wishes || []);
  data.archive = mergeLists(data.archive || [], d.archive || []);
  data.freezes = mergeLists(data.freezes || [], d.freezes || []);
  for (const p of (d.piano.pieces || [])) if (!data.piano.pieces.some(x => x.id === p.id)) data.piano.pieces.push(p);
  for (const b of (d.book.books || [])) if (!data.book.books.some(x => x.id === b.id)) data.book.books.push(b);

  normalizeActive();
  saveData(); schedulePush(); render();
  toast(before === dataStamp() ? "Всё это уже было" : "Данные восстановлены");
}

function archiveBackupUI() {
  if (!cfg.token || !cfg.gistId)
    return `<div class="freeze"><div class="fz-head">☁️ <b>Автокопия</b> — появится, когда подключишь синхронизацию</div></div>`;

  const when = cfg.lastArchive ? fmtDay(dateStr(new Date(cfg.lastArchive))) : "ещё не делалась";
  return `
    <div class="freeze">
      <div class="fz-head">☁️ <b>Автокопия</b> — раз в неделю снимок всех данных уезжает в отдельный гист-архив, ${ARCH_KEEP} последних месяцев</div>
      <div class="fz-empty">Последняя: ${esc(when)}${cfg.archiveOff ? " · выключена" : ""}</div>
      <div class="fz-form2">
        <button class="btn" id="arcNow" type="button">Сделать копию сейчас</button>
        <button class="btn" id="arcList" type="button">Копии в архиве</button>
      </div>
      <div id="arcBox"></div>
      <div class="pick-row" style="margin-top:8px">
        <button class="pick ${!cfg.archiveOff ? "on" : ""}" data-arc="on" type="button"><span class="pk-name">Включена</span></button>
        <button class="pick ${cfg.archiveOff ? "on" : ""}" data-arc="off" type="button"><span class="pk-name">Выключена</span></button>
      </div>
    </div>`;
}

function bindArchiveBackupUI() {
  const now_ = $("#arcNow"), list = $("#arcList"), box = $("#arcBox");

  if (now_) now_.addEventListener("click", async () => {
    now_.disabled = true; toast("Сохраняю…");
    try {
      const r = await gh("/gists/" + cfg.gistId);
      if (!r.ok) throw new Error("основной гист недоступен");
      const f = (await r.json()).files[GIST_FILE];
      let txt = f.content;
      if (f.truncated && f.raw_url) txt = await (await withTimeout(fetch(f.raw_url), 15000)).text();
      await archiveNow(JSON.parse(txt), true);
      render();
    } catch (e) { toast(e.message || "Не получилось"); now_.disabled = false; }
  });

  if (list && box) list.addEventListener("click", async () => {
    box.innerHTML = `<div class="fz-empty">Смотрю…</div>`;
    try {
      const files = await archiveList();
      if (!files.length) { box.innerHTML = `<div class="fz-empty">Пока пусто</div>`; return; }
      box.innerHTML = files.map(f => `
        <button class="arc-row" data-arcfile="${esc(f.filename)}" type="button">
          <b>${esc(f.filename.replace("keiko-", "").replace(".json", ""))}</b>
          <em>${Math.round((f.size || 0) / 1024)} КБ · восстановить</em>
        </button>`).join("");
      box.querySelectorAll("[data-arcfile]").forEach(b =>
        b.addEventListener("click", () => {
          const f = files.find(x => x.filename === b.dataset.arcfile);
          if (!f) return;
          if (!confirm(`Восстановить из снимка «${f.filename}»?\n\nНичего не сотрётся: записи сольются с нынешними.`)) return;
          restoreArchive(f).catch(() => toast("Не получилось"));
        }));
    } catch (e) { box.innerHTML = `<div class="fz-empty">${esc(e.message || "не вышло")}</div>`; }
  });

  document.querySelectorAll("[data-arc]").forEach(b =>
    b.addEventListener("click", () => {
      cfg.archiveOff = b.dataset.arc === "off";
      saveCfg(); render();
      toast(cfg.archiveOff ? "Автокопия выключена" : "Автокопия включена");
    }));
}

function backupUI() {
  const counts = [
    [data.piano.entries.length + data.book.entries.length + data.pastel.entries.length + watchEntries().length, "занятие", "занятия", "занятий"],
    [(data.thoughts || []).filter(t => !t.deleted).length, "мысль", "мысли", "мыслей"],
    [(data.archive || []).filter(a => !a.deleted).length, "книга на полке", "книги на полке", "книг на полке"]
  ].map(([n, a, b, c]) => `${n} ${plural(n, a, b, c)}`).join(" · ");

  return `
    <div class="freeze">
      <div class="fz-head">💾 <b>Копия данных</b> — файл со всем, что накопилось: ${counts}</div>
      <div class="fz-form2">
        <button class="btn" id="bkSave" type="button">Сохранить копию</button>
        <button class="btn" id="bkLoad" type="button">Восстановить из копии</button>
      </div>
      <input type="file" id="bkFile" accept="application/json,.json" style="display:none">
      <div class="fz-empty">Восстановление ничего не затирает: записи сливаются по времени изменения.</div>
    </div>`;
}

function bindBackupUI() {
  const save = $("#bkSave"), load = $("#bkLoad"), file = $("#bkFile");
  if (save) save.addEventListener("click", exportBackup);
  if (load && file) {
    load.addEventListener("click", () => file.click());
    file.addEventListener("change", () => { if (file.files[0]) restoreBackup(file.files[0]); });
  }
}

/* ══════════ Настройки: отдельный экран с разделами ══════════ */

const SETTINGS_SECTIONS = [
  { id: "profile",   icon: "👤", name: "Профиль",       hint: () => profile().name },
  { id: "sync",      icon: "🔄", name: "Синхронизация", hint: () => (cfg.token && cfg.gistId) ? "подключена" : "не подключена" },
  { id: "goal",      icon: "🎯", name: "Цель на неделю", hint: () => `${data.weekGoal} ${plural(data.weekGoal, "день", "дня", "дней")}` },
  { id: "look",      icon: "🎨", name: "Оформление",    hint: () => themeById(data.shop.theme).name },
  /* Материалы, полка и карта знаний собраны в одном месте: раньше они были
     раскиданы по трём экранам, и «где посмотреть прочитанное» каждый раз
     приходилось вспоминать. */
  { id: "library",   icon: "📚", name: "Библиотека",   hint: () => {
      const n = railItems().length, sh = shelfItems().length;
      return (n ? `${n} в работе` : "пусто") + (sh ? ` · ${sh} в архиве` : ""); } },
  { id: "kmap",      icon: "◍", name: "Карта знаний", hint: () => "что уже узнал" },
  { id: "pause",     icon: "🌴", name: "Пауза",         hint: () => {
      const n = (data.freezes || []).filter(f => !f.deleted).length;
      return n ? `${n} ${plural(n, "период", "периода", "периодов")}` : "нет"; } },
  { id: "data",      icon: "💾", name: "Данные",        hint: () => "копия и перенос" },
  { id: "about",     icon: "稽", name: "О приложении",  hint: () => APP_VERSION }
];

function openSettingsSheet() {   // старое имя оставлено: на него завязаны баннеры и пустые состояния
  settingsOpen = true; settingsView = null;
  closeSheet();
  render();
}

function renderSettings() {
  if (settingsView) { renderSettingsSection(settingsView); return; }

  $("#view").innerHTML = `
    <h2 class="set-title">Настройки</h2>
    <div class="set-list">
      ${SETTINGS_SECTIONS.map(sec => `
        <button class="set-row" data-sec="${sec.id}" type="button">
          <span class="set-ic">${sec.icon}</span>
          <span class="set-txt"><b>${sec.name}</b><em>${esc(String(sec.hint()))}</em></span>
          <span class="mc-go">›</span>
        </button>`).join("")}
    </div>
    <button class="btn set-back" id="setDone" type="button">Готово</button>`;

  document.querySelectorAll("[data-sec]").forEach(b =>
    b.addEventListener("click", () => {
      // карта знаний — оверлей, отдельный экран ей не нужен
      if (b.dataset.sec === "kmap") { openKnowledgeMap(); return; }
      settingsView = b.dataset.sec;
      render();
      $("#view").scrollTop = 0;
    }));
  $("#setDone").addEventListener("click", () => { settingsOpen = false; settingsView = null; render(); });
}

function renderSettingsSection(id) {
  const sec = SETTINGS_SECTIONS.find(x => x.id === id) || SETTINGS_SECTIONS[0];
  const connected = cfg.token && cfg.gistId;
  let body = "";

  if (id === "profile") {
    body = `
      <div class="info-note prof-note">
        Сейчас: <b>${esc(profile().name)}</b>. У каждого профиля свои материалы и прогресс, гист общий.
        <button class="btn" id="sProfile" type="button">Сменить профиль</button>
      </div>`;
  } else if (id === "sync") {
    body = connected ? `
      <div class="info-note">Гист <b>${esc(cfg.gistId)}</b>${cfg.lastSync ? ` · последняя сверка ${fmtDay(dateStr(new Date(cfg.lastSync)))}` : ""}</div>
      <div class="sheet-actions">
        <button class="btn gold" id="sSync" type="button">Синхронизировать сейчас</button>
        <button class="btn danger" id="sOff" type="button">Отключить</button>
      </div>
      <div class="diag">${diagLine()}</div>` : `
      <div class="info-note">
        Подключи <b>GitHub Gist</b>, чтобы прогресс жил на всех устройствах.<br>
        Токен: <a href="https://github.com/settings/tokens/new?description=%D0%9A%D1%8D%D0%B9%D0%BA%D0%BE&scopes=gist" target="_blank" rel="noopener">classic со scope gist</a>
      </div>
      <input class="note-input" id="sToken" type="password" placeholder="ghp_…" autocomplete="off">
      <div class="sheet-actions"><button class="btn gold" id="sConnect" type="button">Подключить</button></div>`;
  } else if (id === "goal") {
    body = goalUI();
  } else if (id === "look") {
    body = themeUI() + soundUI() + dailyUI();
  } else if (id === "library") {
    /* Каталог уехал в «Данные»: он про обмен файлами, а не про материалы,
       и сверяется сам при каждой синхронизации. Блок «отправить в архив
       и начать новое» убран — теперь это кнопка на странице материала. */
    body = libraryUI();
  } else if (id === "pause") {
    body = freezeUI();
  } else if (id === "data") {
    body = archiveBackupUI() + backupUI() + catalogUI();
  } else {
    body = `
      <div class="info-note">Кэйко · версия ${APP_VERSION}</div>
      <div class="sheet-actions">
        <button class="btn" id="sAbout" type="button">Что такое кэйко</button>
        <button class="btn" id="sUpdate" type="button">Обновить приложение</button>
      </div>
      <div class="diag">${diagLine()}</div>`;
  }

  $("#view").innerHTML = `
    <button class="back" id="setBack" type="button">‹ Настройки</button>
    <h2 class="set-title">${sec.icon} ${sec.name}</h2>
    ${body}`;

  $("#setBack").addEventListener("click", () => { settingsView = null; render(); $("#view").scrollTop = 0; });

  const pr = $("#sProfile");
  if (pr) pr.addEventListener("click", switchProfile);
  const up = $("#sUpdate");
  if (up) up.addEventListener("click", forceUpdate);
  const ab = $("#sAbout");
  if (ab) ab.addEventListener("click", openAboutSheet);
  const sy = $("#sSync");
  if (sy) sy.addEventListener("click", () => syncNow(true));
  const off = $("#sOff");
  if (off) off.addEventListener("click", () => {
    if (!confirm("Отключить синхронизацию?\n\nЗаписи останутся на устройстве, но перестанут уходить в гист — и записывать новые будет нельзя, пока не подключишь снова.")) return;
    cfg.token = ""; cfg.gistId = ""; saveCfg(); setSyncDot(""); render(); toast("Отключено");
  });
  const conn = $("#sConnect");
  if (conn) conn.addEventListener("click", () => connectGitHub($("#sToken").value.trim()));

  bindFreezeUI();
  bindGoalUI();
  bindThemeUI();
  bindSoundUI();
  bindDailyUI();
  bindBackupUI();
  bindArchiveBackupUI();
  bindLibraryUI();
  bindCatalogUI();
  bindArchiveUI();
}

/* ══════════ Gist ══════════ */

function setSyncDot(state) { $("#syncDot").className = "sync-dot" + (state ? " " + state : ""); }

function gh(path, opts = {}) {
  return withTimeout(fetch("https://api.github.com" + path, Object.assign({
    headers: { "Authorization": "Bearer " + cfg.token, "Accept": "application/vnd.github+json" }
  }, opts)), 12000);
}

// без потолка по времени запрос в самолёте висит до системного таймаута — и всё приложение ждёт
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error("нет связи")), ms))
  ]);
}

async function connectGitHub(token) {
  if (!token) { toast("Вставь токен"); return; }
  cfg.token = token; saveCfg();
  setSyncDot("busy");
  try {
    const r = await gh("/gists?per_page=100");
    if (r.status === 401) throw new Error("Токен не подошёл");
    if (!r.ok) throw new Error("GitHub ответил " + r.status);
    const found = (await r.json()).find(g => g.files && g.files[GIST_FILE]);
    if (found) { cfg.gistId = found.id; saveCfg(); await syncNow(false); toast("Подключено"); }
    else {
      const cr = await gh("/gists", {
        method: "POST",
        body: JSON.stringify({ description: "Кэйко — данные профилей", public: false,
          files: { [GIST_FILE]: { content: JSON.stringify({ v: 8, savedAt: now(), profiles: { [profileId]: exportData() } }) } } })
      });
      if (!cr.ok) throw new Error("Не создался гист");
      cfg.gistId = (await cr.json()).id; cfg.lastSync = now(); saveCfg();
      setSyncDot("ok"); toast("Гист создан");
    }
    closeSheet();
    syncError = "";
    render();
  } catch (e) {
    cfg.token = ""; saveCfg(); setSyncDot("err");
    render();
    toast(e.message || "Не получилось");
  }
}

const exportData = () => ({ v: 7, savedAt: now(), active: data.active, weekGoal: data.weekGoal, shop: data.shop, thoughts: data.thoughts, wishes: data.wishes, piano: data.piano, book: data.book, pastel: data.pastel, watch: data.watch, practice: data.practice, achAt: data.achAt, factAt: data.factAt, eventsV: data.eventsV, freezes: data.freezes, archive: data.archive, daily: data.daily, takes: data.takes, takesId: data.takesId });

function mergeLists(local, remote) {
  const map = new Map();
  for (const i of remote || []) map.set(i.id, i);
  for (const i of local || []) {
    const o = map.get(i.id);
    if (!o || (i.updatedAt || 0) >= (o.updatedAt || 0)) map.set(i.id, i);
  }
  return [...map.values()];
}

async function syncNow(manual) {
  if (!cfg.token || !cfg.gistId || syncing) { if (manual && !cfg.token) openSettingsSheet(); return; }
  if (!navigator.onLine) { online = false; setSyncDot("off"); renderBanner(); return; }
  syncing = true; setSyncDot("busy");
  const stampBefore = dataStamp();
  try {
    const r = await gh("/gists/" + cfg.gistId);
    if (!r.ok) throw new Error("Ошибка сети (" + r.status + ")");
    const g = await r.json();
    const f = g.files && g.files[GIST_FILE];
    let box = {};                       // содержимое файла целиком: { profiles: {...} }
    let remote = emptyData();
    if (f) {
      let txt = f.content;
      if (f.truncated && f.raw_url) txt = await (await fetch(f.raw_url)).text();
      try {
        const parsed = JSON.parse(txt);
        // старый файл был плоским — считаем его данными первого профиля
        box = parsed && parsed.profiles ? parsed : { profiles: { anton: parsed } };
        remote = migrate(box.profiles[profileId] || null);
      } catch {}
    }
    if (!box.profiles) box = { profiles: {} };
    cfg.profileIds = Object.keys(box.profiles); saveCfg();
    profilesFromKeys(cfg.profileIds);
    // определения материалов живут в гисте наравне с записями
    data.piano.pieces = mergeLists(data.piano.pieces, remote.piano.pieces);
    data.book.books = mergeLists(data.book.books, remote.book.books);
    if (remote.pastel.course && (!data.pastel.course ||
        (remote.pastel.course.updatedAt || 0) >= (data.pastel.course.updatedAt || 0))) {
      data.pastel.course = remote.pastel.course;
    }
    if (!data.piano.activePiece && data.piano.pieces[0]) data.piano.activePiece = data.piano.pieces[0].id;
    if (!data.book.activeBook && data.book.books[0]) data.book.activeBook = data.book.books[0].id;

    data.piano.entries = mergeLists(data.piano.entries, remote.piano.entries);
    data.book.entries = mergeLists(data.book.entries, remote.book.entries);
    data.pastel.entries = mergeLists(data.pastel.entries, remote.pastel.entries);

    data.watch.videos = mergeLists(data.watch.videos, remote.watch.videos);
    data.watch.entries = mergeLists(data.watch.entries, remote.watch.entries);
    if (!data.watch.activeVideo && data.watch.videos[0]) data.watch.activeVideo = data.watch.videos[0].id;
    if (remote.weekGoal && (remote.savedAt || 0) > (cfg.lastSync || 0)) data.weekGoal = remote.weekGoal;
    data.freezes = mergeLists(data.freezes, remote.freezes);
    data.thoughts = mergeLists(data.thoughts, remote.thoughts || []);
    data.wishes = mergeLists(data.wishes || [], remote.wishes || []);
    if (remote.shop) {
      if ((remote.savedAt || 0) > (cfg.lastSync || 0)) {
        if (remote.shop.theme) data.shop.theme = remote.shop.theme;
      }
    }
    data.archive = mergeLists(data.archive, remote.archive);
    data.takes = mergeLists(data.takes || [], remote.takes || []);
    // адрес гиста с файлами обязан жить в данных, а не в настройках устройства,
    // иначе на втором телефоне вложения просто неоткуда взять
    if (!data.takesId && remote.takesId) data.takesId = remote.takesId;
    if (data.takesId) { cfg.takesId = data.takesId; saveCfg(); }
    if (remote.daily && (!data.daily || String(remote.daily.date || "") > String(data.daily.date || ""))) {
      data.daily = remote.daily;                   // где-то уже показали сегодня — не повторяем
    }
    normalizeActive();
    saveData();
    // сравниваем профиль целиком: раньше смотрели только занятия, и новые мысли,
    // книги на полке, паузы или цель могли навсегда остаться на одном устройстве
    const norm = (o) => JSON.stringify(migrate(o));
    const changed = norm(box.profiles[profileId]) !== norm(exportData());
    if (changed) {
      box.profiles[profileId] = exportData();     // чужой профиль в файле остаётся нетронутым
      box.v = 8; box.savedAt = now();
      const pr = await gh("/gists/" + cfg.gistId, {
        method: "PATCH",
        body: JSON.stringify({ files: { [GIST_FILE]: { content: JSON.stringify(box) } } })
      });
      if (!pr.ok) throw new Error("Не сохранилось");
    }
    cfg.lastSync = now(); saveCfg(); setSyncDot("ok");
    maybeArchive(box);                  // раз в неделю снимок уезжает в архив, молча
    catalogPull(false).catch(() => {});  // каталог сверяем не чаще раза в сутки
    syncError = "";
    syncPickers();
    if (stampBefore !== dataStamp()) render(true);   // тихо и только если данные правда изменились
    else renderBanner();
    maybeDailyThought();               // мысли могли приехать из гиста только что
    if (manual) toast("Синхронизировано");
  } catch (e) {
    if (!navigator.onLine) { online = false; setSyncDot("off"); renderBanner(); return; }
    setSyncDot("err");
    syncError = e.message || "нет связи с GitHub";
    renderBanner();
    if (manual) toast(syncError);
  } finally { syncing = false; }
}

function schedulePush() {
  if (!cfg.token || !cfg.gistId) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => syncNow(false), 1500);
}

/* ══════════ Запуск ══════════ */

function init() {
  try {
    boot();
  } catch (e) { console.error(e); crashScreen(e); }
}

function boot() {
  profileId = localStorage.getItem(LS_PROFILE);
  try { cfg = Object.assign(cfg, JSON.parse(localStorage.getItem(LS.cfg)) || {}); } catch {}
  if (!cfg.token || !cfg.gistId) { renderConnect(); return; }   // пока нет гиста — показывать нечего
  if (!PROFILES.length) profilesFromKeys(cfg.profileIds);
  if (!profileId) { renderProfilePick(); return; }               // кто занимается

  load();
  normalizeActive();
  saveData();   // закрепляем данные в актуальной схеме сразу после миграции
  if (["home", "progress", "ach", "notes", "wish"].includes(cfg.tab)) tab = cfg.tab;
  applyTheme(data.shop.theme);
  if (["week", "month"].includes(cfg.period)) period = cfg.period;
  if (cfg.achView && cfg.achView.track) achView = cfg.achView;
  if (cfg.achTab === "facts") achTab = "facts";
  if (cfg.achTop === "shelf") achTop = "shelf";
  const t = new Date();
  calYear = t.getFullYear(); calMonth = t.getMonth();
  syncPickers();

  // без него приложение не открывается офлайн: sw.js кэширует оболочку.
  // Ставим с задержкой и только если запуск прошёл без сбоев
  if ("serviceWorker" in navigator) {
    setTimeout(() => {
      let broken = "";
      try { broken = sessionStorage.getItem("keiko-selfheal") || ""; } catch {}
      if (broken === "1") return;
      navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(() => {});
    }, 2500);
  }

  // длинные ленты: кнопка возврата к началу
  const view = $("#view"), top = $("#toTop");
  if (view && top) {
    view.addEventListener("scroll", () => {
      top.classList.toggle("show", view.scrollTop > 420);
    }, { passive: true });
    top.addEventListener("click", () => {
      view.scrollTo({ top: 0, behavior: "smooth" });
      // если плавная прокрутка не поддержана — доводим сами
      setTimeout(() => { if (view.scrollTop > 0) view.scrollTop = 0; }, 600);
    });
  }

  const fab = $("#likeFab");
  if (fab) fab.addEventListener("click", () => {
    notesFilter = notesFilter === "liked" ? "all" : "liked";
    shuffleThought = null;
    renderNotes();
    if (view) view.scrollTop = 0;
  });

  const diceFab = $("#diceFab");
  if (diceFab) diceFab.addEventListener("click", () => {
    if (navigator.vibrate) navigator.vibrate(15);
    shuffleRandomThought();
  });

  window.addEventListener("online", () => {
    online = true; setSyncDot(""); renderBanner();
    if (gistReady()) syncNow(false);        // догоняем всё, что накопилось офлайн
  });
  window.addEventListener("offline", () => { online = false; setSyncDot("off"); renderBanner(); });
  if (!online) setSyncDot("off");

  $("#gearBtn").addEventListener("click", openSettingsSheet);
  document.querySelector(".logo").addEventListener("click", openAboutSheet);
  // если доступ к движению уже разрешён — просто подписываемся

  bindPractice();
  $("#sheetBg").addEventListener("click", closeSheet);
  $("#cheerOk").addEventListener("click", () => {
    $("#cheer").classList.remove("show", "daily");
    if (overlayQueue.length) setTimeout(showNextOverlay, 220);
  });
  $("#cheer").addEventListener("click", e => {
    if (e.target !== e.currentTarget) return;
    $("#cheer").classList.remove("show", "daily");
    if (overlayQueue.length) setTimeout(showNextOverlay, 220);
  });

  window.addEventListener("resize", syncTabHeight);
  window.addEventListener("orientationchange", () => setTimeout(syncTabHeight, 200));

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      checkForUpdate(); if (selectedDate > todayStr()) selectedDate = todayStr(); syncNow(false); render(); }
  });

  render();
  coverLoadAll();                     // обложки из кэша — сразу, ещё до сети
  takeLoadAll();                      // записи собственной игры
  audioLoadAll().then(() => {
    audioSync();
    // не ждём касания, чтобы начать качать: к моменту жеста звук уже готов
    if (cfg.sound && hasMaterials()) pullAudio(curKey());
    paintSndBtn();
  });
  pullEnvelopes();                    // огибающие нужны сразу, иначе волны запаздывают

  // iOS не даёт играть до жеста — ловим самое первое касание, дальше не мешаем
  ["pointerdown", "keydown"].forEach(ev =>
    document.addEventListener(ev, unlockAudio, { once: true, passive: true }));

  /* Выход из погружения: первое касание только возвращает интерфейс и никуда
     не нажимает — иначе легко случайно отметить занятие. */
  document.addEventListener("pointerdown", (e) => {
    if (!zenOn) { zenArm(); return; }
    e.preventDefault(); e.stopPropagation();
    zenExit(true);
  }, true);
  ["keydown", "wheel", "touchmove"].forEach(ev =>
    document.addEventListener(ev, () => { zenOn ? zenExit(true) : zenArm(); }, { passive: true, capture: true }));
  document.addEventListener("visibilitychange", () => { if (document.hidden) zenExit(); else zenArm(); });
  // ушли из приложения — глушим, чтобы не играло в кармане
  document.addEventListener("visibilitychange", () => { audioSync(); paintSndBtn(); });

  document.addEventListener("click", (e) => {
    const el = e.target.closest && e.target.closest("[data-snd]");
    if (!el || !el.classList.contains("show")) return;
    e.stopPropagation();
    cfg.sound = !cfg.sound; saveCfg();
    audioUnlocked = true;              // нажатие и есть нужный жест
    if (!cfg.sound) { stopAllExcept(null); audioNow = ""; }
    audioSync(); paintSndBtn();
    toast(cfg.sound ? "Атмосфера включена" : "Тишина");
  }, true);
  setTimeout(maybeDailyThought, 900);
  checkForUpdate();
  if (cfg.token && cfg.gistId && navigator.onLine) { setSyncDot("ok"); syncNow(false); }


}

init();

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
