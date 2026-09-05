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
const GIST_FILE = "prokachka.json";                // общий файл первой версии — только на чтение
/* Свой файл на профиль. Раньше оба профиля лежали в одном, и каждая отметка
   отправляла их вместе — чужие записи ездили через твой телефон при каждом
   касании. Теперь пишется только своё. Общий файл остаётся нетронутым: из него
   читают, пока не переехали, и он же годится как замороженная копия. */
const PROF_FILE = (id) => "keiko-" + id + ".json";
const APP_VERSION = "Кэйко 453";

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
// «чаще по вторникам» — падеж списком, а не цепочкой замен
const DOW_BY = ["понедельникам", "вторникам", "средам", "четвергам", "пятницам", "субботам", "воскресеньям"];

/* ── Состояние ── */
let data = null;
let cfg = { token: "", gistId: "", lastSync: 0, tab: "home", period: "week", achView: null, shake: false, shakeAsked: false, sound: false, bgPreset: "breath", bgWave: true, zen: true, fixPaste: true };
let period = "week";   // week | month — что показываем на «Прогрессе»
/* На сколько периодов назад отошли от текущего: 0 — эта неделя (или этот
   месяц), −1 — прошлая, и так далее. Вперёд дальше нуля не пускаем: будущего
   ещё нет. Смена недели на месяц возвращает к текущему периоду — иначе
   «четыре недели назад» превращалось бы в «четыре месяца назад». */
let shift = 0;
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
let pickDone = false;    // нажата ли «Прочитана» в открытой шторке
let pickLessons = [];
let pickDrawDone = false;                   // «рисунок завершён» в простой отметке
let drawSince = 0;                          // с какого момента открыта шторка рисования
let pickSpans = [];    // отмеченные в этой сессии куски книги
let partOpen = null;   // какая часть сейчас раскрыта
let libBook = null;    // открытый материал в «Библиотеке»: "bk:id" | "pf:id" | "ps:pastel"
let partUpto = {};     // выбранная страница внутри части             // выбранные уроки курса
let sheetMode = null;             // log | settings
let pushTimer = null, syncing = false, syncAgain = false;
let syncError = "";               // текст последней ошибки синхронизации
let newVersion = "";              // версия на сервере, если она свежее установленной

// без подключённого гиста данные жили бы только на телефоне — ввод запрещаем
const gistReady = () => !!(cfg.token && cfg.gistId);

const $ = (s) => document.querySelector(s);

/* ── Утилиты ── */
const uid = () => crypto.randomUUID();
const now = () => Date.now();
function todayStr() { return dateStr(new Date()); }

function copyText(text, word) {
  const ok_ = (word || "Название") + " скопировано";
  return copyRaw(text).then((ok) => {
    toast(ok ? ok_ : "Не вышло скопировать");
    return ok;
  });
}

/* Копия без отклика: кто зовёт, тот и решает, как подтвердить — тостом или
   надписью на самой кнопке. */
function copyRaw(text) {
  const t = String(text || "");
  if (!t) return Promise.resolve(false);
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
    if (ok) return Promise.resolve(true);
  } catch {}
  if (navigator.clipboard) return navigator.clipboard.writeText(t).then(() => true, () => false);
  return Promise.resolve(false);
}

/* Подтверждение прямо на кнопке: нажал — надпись сменилась на «✓ Готово» и
   через пару секунд вернулась. Тост для этого лишний: глаз уже на кнопке,
   а всплывающая полоска уводит внимание в другой угол экрана. */
function btnSay(кнопка, слово, мс) {
  if (!кнопка) return;
  const было = кнопка.dataset.was || кнопка.textContent;
  кнопка.dataset.was = было;
  кнопка.textContent = слово;
  кнопка.classList.add("said");
  clearTimeout(Number(кнопка.dataset.timer));
  кнопка.dataset.timer = String(setTimeout(() => {
    кнопка.textContent = кнопка.dataset.was || было;
    кнопка.classList.remove("said");
    delete кнопка.dataset.was;
  }, мс || 1900));
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
/* Единица разбора рисунка — шаг, как такт у пьесы. Слово «шаг» само по себе
   слишком общее, поэтому в статистике оно всегда с уточнением: «шаги рисунка».
   Второй вариант — для позиции после «из», там нужен родительный падеж:
   «12 из 24 шагов рисунка», а не «24 шага». */
const shagi  = n => `${n} ${plural(n, "шаг", "шага", "шагов")} рисунка`;
const shagov = n => `${n} ${plural(n, "шага", "шагов", "шагов")} рисунка`;
const stranic = n => `${n} ${plural(n, "страница", "страницы", "страниц")}`;
const handIcon = h => h === "left" ? "𝄢" : "𝄞";
const spanText = s => `${handIcon(s.hand)} ${s.from === s.to ? s.from + "-й" : s.from + "–" + s.to}`;
const rnd = l => l[Math.floor(Math.random() * l.length)];

function toast(text) {
  const el = $("#toast");
  if (!el) return;      // без экрана (тесты) сообщать некуда
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
    usage: {},     // счётчики заходов в разделы — чтобы решать о вырезании по фактам
    musAt: {},     // когда открылся предмет музея: по этому и сортируем список
    musLike: {},   // отмеченные сердцем артефакты: id → когда, со знаком минус — снято
    piano: { pieces: [], activePiece: "", entries: [] },
    book: { books: [], activeBook: "", entries: [], asks: [] },
    pastel: { course: null, courses: [], activeCourse: "", entries: [] },
    watch:  { videos: [], activeVideo: "", entries: [] },
    practice: {},   // ход разбора по пьесам: { pieceId: { done, session } }
    hidden: {},     // материалы, убранные с главной: { «bk:id»: 1 }
    shop: { theme: "dusk" },   // только оформление: покупать давно нечего
    thoughts: [],  // мысли по ходу материала — отдельно от отметок занятий
    wishes: [],    // «захотелось»: куда съездить, что прочитать, купить, сделать
    gut: [],       // отметки самочувствия — только в том профиле, где включено
    gutAt: {},     // когда открылась наградка Какули: нужно для порядка выдачи
    kanyeAt: 0,    // когда Канье заходил впервые: первый визит гарантирован
    weekGoal: 4,   // общая цель: сколько дней в неделю заниматься чем угодно
    goalAt: 0,     // когда её меняли: без этого чужая цель молча затирала свою
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
    if (Array.isArray(obj.pastel.courses)) base.pastel.courses = obj.pastel.courses;
    if (obj.pastel.activeCourse) base.pastel.activeCourse = obj.pastel.activeCourse;
  }

  if (obj.practice && typeof obj.practice === "object") base.practice = obj.practice;
  // след недолгой «ровной сетки» видео: идея не прижилась, поле вычищаем
  for (const k of Object.keys(base.practice || {}))
    if (base.practice[k] && base.practice[k].vmap !== undefined) delete base.practice[k].vmap;
  if (obj.hidden && typeof obj.hidden === "object") base.hidden = obj.hidden;
  if (obj.usage && typeof obj.usage === "object") base.usage = obj.usage;
  if (obj.achAt && typeof obj.achAt === "object") base.achAt = obj.achAt;
  if (obj.musAt && typeof obj.musAt === "object") base.musAt = obj.musAt;
  if (obj.musLike && typeof obj.musLike === "object") base.musLike = obj.musLike;
  if (obj.factAt && typeof obj.factAt === "object") base.factAt = obj.factAt;
  if (obj.eventsV) base.eventsV = obj.eventsV;
  if (obj.pracTrimV) base.pracTrimV = obj.pracTrimV;

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

  if (Number(obj.weekGoal) > 0) base.weekGoal = Math.min(7, Math.round(obj.weekGoal));
  if (Number(obj.goalAt) > 0) base.goalAt = Number(obj.goalAt);
  /* Одиночные записи о наградах и карточках убраны навсегда: награда живёт
     внутри сессии, в которую открылась. Отсеиваем их прямо на входе — и то,
     что лежит в телефоне, и то, что приезжает из гиста. Иначе достаточно
     одной синхронизации со старым устройством, чтобы они вернулись. */
  if (Array.isArray(obj.thoughts)) base.thoughts = obj.thoughts.filter((t) => !EV_GONE.has(t && t.event));
  if (Array.isArray(obj.wishes)) base.wishes = obj.wishes;
  if (Array.isArray(obj.gut)) base.gut = obj.gut;
  if (obj.gutAt && typeof obj.gutAt === "object") base.gutAt = obj.gutAt;
  if (Number(obj.kanyeAt) > 0) base.kanyeAt = Number(obj.kanyeAt);
  if (Array.isArray(obj.archive)) base.archive = obj.archive;
  if (Array.isArray(obj.takes)) base.takes = obj.takes;
  if (typeof obj.takesId === "string") base.takesId = obj.takesId;
  /* Палитру сюда забыли добавить сразу, и она пропадала на ровном месте: при
     загрузке профиля поле отбрасывалось, а первая же отправка затирала его в
     гисте. Любое новое поле обязано появиться и здесь — экспорт без миграции
     означает «уедет и не вернётся». */
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
  try { pracStamp(false); } catch {}   // отпечатки на старте, без пометок
  try { eventsReset(); } catch {}      // разовая чистка выдуманных событий
  try { shortPracReset(); } catch {}   // и заходов короче двух минут
  try { cfg = Object.assign(cfg, JSON.parse(localStorage.getItem(LS.cfg)) || {}); } catch {}
}
/* Отметка обязана пережить что угодно, поэтому запись на устройство
   перечитывается: место в хранилище кончается молча, и «сохранённое» могло
   не дожить до перезапуска. Сеть тут ни при чём — гист получит своё позже,
   а на устройстве всё уже лежит. */
function saveData() {
  pracStamp(true);            // разбор изменился — запоминаем когда
  const txt = JSON.stringify(data);
  try {
    localStorage.setItem(LS.data, txt);
    if (localStorage.getItem(LS.data) !== txt) throw new Error("запись не перечиталась");
    return true;
  } catch (e) {
    console.error("сохранение:", e);
    toast("Не сохранилось на устройстве — кончилось место");
    return false;
  }
}
const saveCfg = () => localStorage.setItem(LS.cfg, JSON.stringify(cfg));

/* ── Выборки ── */
const isBook = () => data.active === "book";
const isPastel = () => data.active === "pastel";
const isWatch  = () => data.active === "watch";
const isCourse = () => isPastel();
const curCourseId = () => (courseTrack().activeCourse || (courses()[0] || {}).id || "");
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
/* У пастели, как у книг и пьес, может быть несколько материалов. Старое поле
   course — единственный курс из времён, когда он был один; оно осталось для
   данных, которые ещё не переехали. */
const courses = () => {
  // трека может не быть вовсе — у нового профиля или в старом файле
  const t = courseTrack() || {};
  const list = Array.isArray(t.courses) ? t.courses.filter((c) => c && !c.archived) : [];
  if (list.length) return list;
  return t.course ? [t.course] : [];
};
const course = () => {
  const list = courses();
  return list.find((c) => c.id === courseTrack().activeCourse) || list[0] ||
    { id: "", name: "", author: "", lessons: [] };
};
/* Материал без подготовки и без сетки занятий: открыл — и сразу шаг, как у
   пианино. Нужен там, где занятие одно и выбирать не из чего. */
const plainCourse = () => !!course().plain;
/* Курс по его id, с запасным вариантом на первый: артефакты, названия в ленте
   дня и музей помнят курс по имени, а курс мог уехать в архив. */
const courseById = (id) => courses().find((c) => c.id === id)
  || courses()[0] || courseTrack().course || { lessons: [] };
/* Первый курс — тот, что был заведён раньше всех, включая уехавшие в архив.
   Считать его по живому списку нельзя: отправили пастель в архив, и «первым»
   стал «Аргус» — вместе с чужим ключом «pastel», чужой пометкой «спрятан»
   и подписью «Архив» в ленте. */
/* Наследный ключ «pastel» остался от времён единственного курса. Курс, который
   его носил, удалён вместе со своими записями, и наследовать его теперь некому:
   ключ курса — это его id. Пустой id (совсем старые данные) по-прежнему
   отвечает «pastel», чтобы такие записи нашли свой материал. */
const keyOfCourse = (c) => {
  if (!c || !c.id) return "pastel";
  const t = courseTrack() || {};
  // совсем старая форма — один курс в поле course: он и живёт под «pastel»
  if (!Array.isArray(t.courses) || !t.courses.length) return "pastel";
  return c.id;
};
/* Курс, которому принадлежат записи без courseId, — заведённый первым.
   Старую форму (один курс в поле course) учитываем тоже. */
const firstCourseId = () => {
  const t = courseTrack() || {};
  const все = (Array.isArray(t.courses) && t.courses.length) ? t.courses : (t.course ? [t.course] : []);
  return (все[0] || {}).id || "";
};
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
      : courseEntries();
const entryFor = d => entries().find(e => e.date === d);



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
  if (!days.has(dateStr(d))) d.setDate(d.getDate() - 1);
  while (steps++ < 4000) {
    const ds = dateStr(d);
    if (days.has(ds)) n++;
    else break;
    if (n + skipped > 3650) break;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
function mondayOf(d) { const r = new Date(d); r.setDate(r.getDate() - ((r.getDay() + 6) % 7)); return r; }

/* Проходы по тактам считаются из заходов занятия, а не из отрезков в записях
   дня. Отрезки копились ещё по старой схеме и мешали новой статистике: цифры
   вроде «25% скрипичный» приходили из прошлой жизни пьесы. Теперь один заход —
   один проход, и всё, что показано, набрано в нынешней системе. */
function passes() {
  const bars = piece().bars;
  const right = new Array(bars + 1).fill(0), left = new Array(bars + 1).fill(0);
  for (let b = 1; b <= bars; b++) {
    const both = repsOf(b, "both").length;
    right[b] = repsOf(b, "right").length + both;
    left[b] = repsOf(b, "left").length + both;
  }
  return { right, left };
}

/* Насколько пройден каждый ключ: доля набранных заходов среди тех, что этому
   ключу вообще положены. Чтение ключа сюда входит — это тоже работа с ним. */
function handProgress() {
  const bars = piece().bars;
  let needR = 0, gotR = 0, needL = 0, gotL = 0;
  for (let b = 1; b <= bars; b++)
    for (const st of barSteps(b)) {
      const goal = stepGoal(b, st), got = Math.min(repsOf(b, st).length, goal);
      if (st === "readR" || st === "right" || st === "both") { needR += goal; gotR += got; }
      if (st === "readL" || st === "left" || st === "both") { needL += goal; gotL += got; }
    }
  return { pctR: needR ? gotR / needR * 100 : 0, pctL: needL ? gotL / needL * 100 : 0 };
}

/* ── Обстоятельства ──
   Не счётчики, а то, при каких обстоятельствах ты занимался: во сколько
   отметил, совпал ли день с чем-нибудь. Награды за это выдаются один раз и
   ничего не требуют — тем и хороши: «Филин следит» за выходной приятнее, чем
   «двадцать дней позади». Всё считается по тому, что уже лежит в записи. */
function moments(list) {
  let night = false, dawn = false, daytime = false, sameDay = false;
  const мои = new Set(), дни = new Set(), субботы = new Set();
  for (const e of list) {
    if (e.createdAt) {
      const h = new Date(Number(e.createdAt)).getHours();
      if (h >= 23 || h < 4) night = true;
      if (h >= 5 && h < 8) dawn = true;
      if (h >= 11 && h < 17) daytime = true;
    }
    мои.add(e.date);
    const d = fromStr(e.date), dw = d.getDay();
    дни.add(dw);
    /* Суббота и воскресенье одних выходных. Ключом берём субботу: у
       воскресенья это вчерашний день, у субботы — сам день. */
    if (dw === 6 || dw === 0) {
      const сб = new Date(d); сб.setDate(сб.getDate() - (dw === 0 ? 1 : 0));
      субботы.add(сб.toISOString().slice(0, 10) + (dw === 0 ? "в" : "с"));
    }
  }
  /* Целые выходные: и суббота, и воскресенье одной пары. */
  let wholeWeekend = false;
  for (const k of субботы) if (k.endsWith("с") && субботы.has(k.slice(0, -1) + "в")) wholeWeekend = true;
  /* Один день на два разных занятия: книга и рояль в одни сутки. Две книги —
     не в счёт, это то же самое занятие. */
  const мой = isBook() ? "book" : isWatch() ? "watch" : isCourse() ? "pastel" : "piano";
  for (const t of ["piano", "book", "pastel", "watch"]) {
    if (t === мой || sameDay) continue;
    for (const e of ((data[t] || {}).entries) || [])
      if (мои.has(e.date)) { sameDay = true; break; }
  }
  /* Все семь дней недели — не подряд, а когда-нибудь. Это не серия: пропуск
     ничего не отнимает, набирается само собой за месяц-другой. */
  return { night, dawn, daytime, sameDay, wholeWeekend, weekdays: дни.size };
}

function pianoStats() {
  const bars = piece().bars;
  const p = passes();
  const list = entries().slice().sort((a, b) => a.date < b.date ? -1 : 1);
  const cnt = (arr, min) => arr.slice(1).filter(v => v >= min).length;
  const touchedR = cnt(p.right, 1), touchedL = cnt(p.left, 1);
  const firmR = cnt(p.right, FIRM_AT), firmL = cnt(p.left, FIRM_AT);
  const maxPass = Math.max(0, ...p.right.slice(1), ...p.left.slice(1));
  const руки = handProgress();

  /* Самый длинный кусок, сыгранный за раз, — это сшивка блока: отдельные такты
     всегда по одному. Считаем по блокам, к которым уже подходили. */
  let maxRun = 0, bothInOne = false;
  for (const bl of pracBlocks()) {
    if (finalOf(bl).length) maxRun = Math.max(maxRun, bl.to - bl.from + 1);
    for (let b = bl.from; b <= bl.to; b++) if (repsOf(b, "both").length) { bothInOne = true; break; }
  }
  if (!maxRun && (touchedR || touchedL)) maxRun = 1;

  let weekend = false, comeback = false, prev = null;
  for (const e of list) {
    const dw = fromStr(e.date).getDay();
    if (dw === 0 || dw === 6) weekend = true;
    if (prev && daysBetween(prev, e.date) >= 7) comeback = true;
    prev = e.date;
  }
  const путь = pctRoute();
  return {
    bars, passes: p, days: list.length, streak: streak(), streakAll: streakAll(),
    touchedR, touchedL, firmR, firmL, maxPass,
    pctR: руки.pctR, pctL: руки.pctL,
    // общий процент — доля пройденного пути: те же заходы, только все разом
    pct: путь, pctLearn: путь,
    pctFirm: bars ? (firmR + firmL) / (bars * 2) * 100 : 0,
    bothInOne, maxRun, weekend, comeback,
    /* Закрытых блоков и дней с первого захода. Проценты говорят «шестнадцать
       процентов пути», а блок — «первая фраза разобрана»: у пьесы это разные
       вещи, и вторая понятнее. Имя блоку даёт разбор, поэтому награда на
       блоках у каждой пьесы значит своё. */
    blocks: pracBlocks().filter(blockDone).length,
    since: list.length ? daysBetween(list[0].date, todayStr()) : 0,
    ...moments(list)
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

/* Дочитана ли книга по страницам. Не путать с отметкой «Прочитана»: уйти с
   главной книга должна по решению, а не по вычисленному проценту — иначе
   исчезала бы сама, стоило доотметить последнюю страницу. */
function bookDone(b) {
  const bk = b || book();
  if (!bk || !bk.pages) return false;
  if (bookMode(bk) === "parts") return bookCovered(bk) >= bk.pages;
  let page = bk.startPage || 0;
  for (const e of bookEntriesOf(bk.id)) {
    page = Math.max(page, e.page || 0);
    for (const sp of e.spans || []) page = Math.max(page, sp.to || 0);
  }
  return page >= bk.pages;
}

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

/* Докуда дошёл в любой книге, не обязательно в открытой: музею нужно знать
   прогресс по каждой, чтобы понять, какие предметы уже открыты. */
function bookProgressOf(b) {
  if (!b) return 0;
  let page = b.startPage || 0;
  for (const e of bookEntriesOf(b.id)) {
    page = Math.max(page, e.page || 0);
    for (const sp of e.spans || []) page = Math.max(page, sp.to || 0);
  }
  return Math.min(page, b.pages || page);
}

/* Предмет открывается, когда дочитана его глава: до этого он виден силуэтом.
   Смысл тот же, что у разборов, — не показывать то, до чего человек ещё не
   дошёл. Предмет без главы (ch = 0) открыт сразу: он про книгу целиком. */
/* Курс — не книга: глав у него нет, есть уроки, и «дочитал до страницы» тут
   не работает. Считаем урок начатым, как только закрыт хотя бы один его шаг:
   мелок берёшь в руки в начале урока, а не в конце, и карточка про жжёную
   сиену должна прийти тогда же. Ждать конца стодесятиминутного урока значило
   бы придержать её на несколько недель. */
const COURSE_MUS = "pastel";
/* Курс, которому принадлежит предмет. «pastel» — имя первого курса с тех пор,
   когда курс был один; остальные зовутся своим id. Раньше музей знал ровно
   одно это имя, и предметы второго курса не открывались никогда. */
const courseByBook = (book) => {
  const list = courses();
  if (book === COURSE_MUS) return list[0] || (data.pastel && data.pastel.course) || null;
  return list.find((c) => c.id === book) || null;
};
const isCourseBook = (book) => !!courseByBook(book);
/* «37:30» → 2250 секунд. Часы бывают у длинных лекций. */
function stepSec(at) {
  const m = String(at || "").trim().match(/^(?:(\d+):)?(\d+):(\d+)$/);
  return m ? (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]) : NaN;
}

/* Просмотренное занятие конкретного курса, а не открытого сейчас: музей
   спрашивает про первый курс, даже когда на экране другой материал. */
function seenIn(c, i) {
  const k = keyOfCourse(c);
  const st = (data.practice || {})[k === "pastel" ? "pastel" : "pastel:" + k] || {};
  return (st.seen || {})["L" + i] || { at: 0, dur: 0 };
}

function musOpenCourse(x) {
  const c = courseByBook(x.book);
  if (!c) return false;
  /* У рисунка ни уроков, ни содержания: конца нет, есть только заходы за лист.
     Открываем по их числу — ch говорит, сколько занятий должно быть позади.
     Так за каждый лист приходит одна вещь: сперва то, что держишь в руках,
     потом то, как этим пользуются, и только потом пигменты. */
  if (!(c.lessons || []).length) {
    const n = Number(x.ch);
    if (!n) return true;
    const первый = firstCourseId();
    return courseTrack().entries
      .filter((e) => !e.deleted && (e.courseId || первый) === c.id).length >= n;
  }
  const n = Number(x.ch);
  if (!n) return true;                       // без урока — открыт сразу, но только владельцу курса
  /* Курс мог стать лекцией: шаги уехали в архив, а предметы по-прежнему
     привязаны к ним. Открываем по тайм-коду того же шага — предмет приходит
     ровно на той минуте, что и раньше. */
  if (c.mode === "watch") {
    const l = c.lessons[n - 1] || {};
    const ш = Number(x.step);
    /* Минута, на которой предмет берут в руки. Раньше её доставали из архива
       прежних шагов — ради десяти чисел в профиле лежало полсотни килобайт.
       Теперь эти числа хранятся отдельным списком cues, а архив уехал из
       профиля целиком. Ветка с архивом оставлена для старых данных. */
    const cues = l.cues || {};
    let t = Number.isFinite(ш) ? Number(cues[ш]) : NaN;
    if (!isFinite(t)) {
      const arch = (l.archive || {}).steps || [];
      t = Number.isFinite(ш) ? stepSec((arch[ш] || {}).at) : NaN;
    }
    const было = seenIn(c, n - 1).at || 0;
    return isFinite(t) ? было >= t : было > 0;
  }
  const steps = (c.lessons[n - 1] || {}).steps || [];
  if (!steps.length) return false;
  /* У предмета может быть свой шаг — тогда он открывается ровно там, где курс
     велит взять его в руки. Без шага открываем по первому закрытому шагу
     урока; после того как четыре урока склеили в один, такой предмет открылся
     бы вместе с одиннадцатью соседями, и весь смысл «по мере чтения» пропал. */
  const ш = Number(x.step);
  if (Number.isFinite(ш) && ш >= 0) return lessonDone(n - 1, "s" + ш);
  return steps.some((_, m) => lessonDone(n - 1, "s" + m));
}

function musOpen(x) {
  if (!x) return false;
  if (isCourseBook(x.book)) return musOpenCourse(x);
  /* Сначала книга, потом глава. Раньше проверка шла в обратном порядке, и
     предмет без главы — пролог «Одиссеи», образ Пенелопы — открывался всем,
     включая тех, у кого этой книги нет вовсе. Артефакт принадлежит книге:
     нет книги — нет и артефакта. */
  const b = (data.book.books || []).find((y) => y.id === x.book);
  if (!b) return false;
  if (!Number(x.ch)) return true;      // без главы — открыт сразу, но только своей книге
  return bookProgressOf(b) >= chapterEnd(b, Number(x.ch) - 1);
}
const musOpenSet = () => new Set(musItems().filter(musOpen).map((x) => x.id));

/* Время открытия предмета. Нужно для порядка в списке: сверху то, что открылось
   последним. Открытому раньше, чем завели эту запись, ставим единицу — «когда-то»:
   соврать точным временем хуже, чем расписаться в незнании. Тот же приём, что
   у наград. */
function musStamp(свежие) {
  data.musAt = data.musAt || {};
  const сейчас = new Set((свежие || []).map((x) => x.id));
  for (const x of musItems())
    if (musOpen(x) && data.musAt[x.id] === undefined)
      data.musAt[x.id] = сейчас.has(x.id) ? now() : 1;
}
const musWhen = (x) => (data.musAt || {})[x.id] || 0;

/* Вид артефакта. «Вещь» — музейный предмет с залом и инвентарным номером,
   как в «Одиссее». «Живое» — зверь или растение: витрины нет, есть места, где
   его встречают. «Книга» — том, который герой читал: идти никуда не надо,
   надо взять и прочесть. От вида зависят подписи, кнопки и вопрос поиску. */
const musKind = (x) => x.kind || "вещь";

const musLiked = (x) => ((data.musLike || {})[x.id] || 0) > 0;
function musLike(x) {
  data.musLike = data.musLike || {};
  data.musLike[x.id] = musLiked(x) ? -now() : now();   // минус — снято, и это тоже действие
  saveData();
  schedulePush();
}

/* Значок предмета: по типу вещи, а не по книге. Список короткий и правится
   руками — эмодзи в интерфейсе должен читаться с одного взгляда, а не быть
   «чем-то древним вообще». Своё значение из данных (поле icon) главнее. */
const MUS_ICONS = [
  /* Живое и книги: у Тессона артефакт — не вещь в витрине, а зверь, растение
     или том из его ящика. Значок должен отличать их с одного взгляда. */
  [/книга|роман|повесть|стихи|дневник|«.+»\s*—?\s*книг/i, "📖"],
  [/нерп|тюлен/i, "🦭"],
  [/медвед/i, "🐻"],
  [/волк/i, "🐺"],
  [/лис[аиы]|лисиц/i, "🦊"],
  [/олен|изюбр|кабарг|лос[ья]/i, "🦌"],
  [/белк|бурундук/i, "🐿"],
  [/хариус|омул|налим|сиг\b|щук|рыб/i, "🐟"],
  [/заповедник|национальн\w+ парк|музей|обсерватори/i, "🏞"],
  [/фильм|кино|росселлини/i, "🎬"],
  [/кит\b|кито|дельфин/i, "🐋"],
  [/утк|гус[ья]|чайк|синиц|трясогузк|орёл|орлан|олуш|кайр|буревестник|тупик|птиц/i, "🐦"],
  [/муравь|комар|мошк|клещ|насеком/i, "🐜"],
  [/долерит|базальт|песчаник|гранит|известняк|кварцит|сланец|порода|^мел$|мелов/i, "🪨"],
  [/кедр|сосн|лиственниц|стланик|дерев|тайг/i, "🌲"],
  [/багульник|рододендрон|ветрениц|черемш|брусник|цвет|трав/i, "🌿"],
  [/картин|пейзаж|портрет|живопис|галере/i, "🖼"],
  /* Моаи с острова Пасхи для греческой статуи не годится — берём классический
     портик: он читается как «античная скульптура», а не как чужой идол. */
  [/статуя|голова|бюст|скульптур|торс/i, "🏛"],
  [/кратер|гидрия|килик|псиктер|лекиф|амфор|ваз|сосуд|чаш/i, "🏺"],
  [/инталия|инталья|камея|гемма|скарабей|сердолик|сардер/i, "💎"],
  [/перстень|кольцо|серьг|браслет|подвес/i, "💍"],
  [/рельеф|саркофаг|стела|фриз/i, "🪨"],
  [/светильник|лампа/i, "🪔"],
  [/грузило|ткац|пряслиц|веретен/i, "🧵"],
  [/монет|медал/i, "🪙"],
  [/лук|стрел|копь|меч|щит|оруж/i, "🏹"],
  [/маск|шлем/i, "🎭"],
];
const musIcon = (x) => x.icon
  /* У книги значок один на всех: иначе «Листья травы» получают травинку,
     а «Уход в лес» — ёлку. Вид предмета важнее слов в названии. */
  || (musKind(x) === "книга" ? "📖" : "")
  /* Материал и приём — тоже виды, а не слова в названии: «жжёная сиена» иначе
     получила бы значок по слову «жжёная», а «тон важнее цвета» — по «тону». */
  || (musKind(x) === "материал" ? "🖍" : "")
  || (musKind(x) === "приём" ? "📐" : "")
  /* Музей тоже смотрим: у картинной галереи всё живопись, даже когда в имени
     предмета об этом ни слова — «Валентин Серов, „Одиссей и Навзикая“». */
  || (MUS_ICONS.find(([re]) => re.test(`${x.name} ${x.q || ""} ${x.museum || ""}`)) || [])[1] || "⚱️";

// в какой главе страница — по порядковому номеру, а не по названию
function chapterIndexAt(b, page) {
  const list = (b || book()).chapters || [];
  let idx = -1;
  list.forEach((c, i) => { if (page >= c.from) idx = i; });
  return idx;
}

/* ══════════ Разговор о главе ══════════
   Не сноски: сноска отвечает, что написано, а здесь вопросы, у которых
   больше одного обоснованного ответа. Варианты — не тест с правильной
   клеточкой, а версии: выбираешь ближнюю и читаешь, чем она сильна и что
   упускает. Ответ сохраняется, чтобы через месяц увидеть, что думал. */
/* Статья о главе: не тест и не сноски, а рассказ — как если бы кто-то
   понимающий сел рядом и объяснил, что тут происходит и почему это красиво.
   Блоки трёх видов: заголовок, абзац, иллюстрация с подписью. */
/* ── Разборы лежат отдельно ──
   Каталог тянется целиком при каждой правке содержимого, а разборы читают
   редко и по одному материалу. Поэтому они живут своим файлом на материал и
   грузятся, только когда открываешь раздел; на устройстве остаются в
   хранилище, так что дальше открываются и без сети. */
const LS_ART = (id) => "keiko-art-" + id;
let ARTS = {};
const artsOf = (id) => {
  if (ARTS[id]) return ARTS[id];
  try {
    const saved = JSON.parse(localStorage.getItem(LS_ART(id)) || "null");
    if (saved) { ARTS[id] = saved; return saved; }
  } catch {}
  return null;
};
/* Старые записи каталога тоже читаем: пока файл не приехал, показываем то,
   что уже есть, — и ничего не пропадает при переезде. */
/* Есть ли у материала разбор — знает сам каталог: он маленький и всегда под
   рукой. Иначе кнопку было бы видно только после загрузки тяжёлого файла. */
const hasArts = (id) => !!(catOf(id) || {}).arts;
/* Часть разбора можно выключить, не стирая её: в каталоге у материала стоит
   off: ["article"]. Понадобилось для «Одиссеи» — разбор песен читается на
   стороне, а вопросы, примечания и карта остаются на месте. Выключаем
   показом, а не удалением: файл разбора большой и собирался долго. */
const artsOff = (id, поле) => ((catOf(id) || {}).off || []).includes(поле);   // off: ["map"]
const artsPart = (b, поле) => {
  const id = (b || book()).id;
  if (artsOff(id, поле)) return [];
  const own = artsOf(id);
  if (own && Array.isArray(own[поле])) return own[поле];
  const c = catOf(id);
  return (c && Array.isArray(c[поле])) ? c[поле] : [];
};

/* Вопросы и ответы к песне — второй этап разбора: не рассуждение, а короткие
   ответы на «кто это вообще» и «почему так». Лежат в каталоге рядом со статьёй
   и открываются по тому же правилу — только когда песнь дочитана. */

/* ── Промт для разбора главы ──
   Разбор человек ведёт сам в нейронке, и приложение делает одно: собирает
   готовый запрос — какая книга, чей перевод, какая глава — и кладёт в буфер.
   Скелет один на все книги: шесть пунктов, от «зачем эта глава» до итога.
   Подстройка под книгу лежит в каталоге строкой ask: там свои слова для
   единицы деления, для героя и для понятий, которые надо объяснять по ходу.
   Подстановки: {книга} {автор} {глава} {n} {всего}. */
const ASK_DEFAULT =
`Разбери главу «{глава}» ({n}-я из {всего}) книги «{книга}» ({автор}) — коротко и по существу. Не пересказывай содержание.
Структура ответа:

1. Зачем нужна эта глава — 2–3 предложения о её роли в книге целиком.
2. Главные смыслы — 3–5 самых важных идей.
3. Главное противоречие — где герой или автор сам себе мешает.
4. Контекст и странные детали — объясни только то, без чего глава непонятна.
5. Что легко пропустить — 2–4 небольшие, но важные детали.
6. Главная мысль — один короткий итоговый абзац.

Каждое названное лицо — писателя, поэта, художника, философа, историческую фигуру — поясняй на месте одной-двумя строками: кто это, когда жил и зачем он здесь, что именно автор им подпирает. Только тех, без кого глава не читается; списков не разводи.
Отделяй то, что прямо сказано в тексте, от интерпретаций. Не перечисляй много версий. Пиши простым русским языком, лаконично, но содержательно. Главное — отвечать на вопросы: «зачем это здесь?», «что это говорит о герое?» и «какой в этом смысл?»`;

/* Книга целиком одним markdown-файлом: его прикладывают к запросу, чтобы
   нейросеть разбирала по тексту, а не по памяти. Лежит в каталоге рядом с
   обложками; в описи материала стоит только флажок, что файл есть. */
const CAT_BOOK_FILE = (id) => `book-${id}.md`;
const hasBookFile = (b) => !!(catOf((b || book()).id) || {}).md;

const askTpl = (b) => {
  const c = catOf((b || book()).id);
  return (c && typeof c.ask === "string" && c.ask.trim()) ? c.ask : ASK_DEFAULT;
};
function askText(b, i) {
  const bk = b || book();
  const главы = bk.chapters || [];
  const c = главы[i] || главы[0] || { name: "" };
  return askTpl(bk)
    .split("{книга}").join(bk.title || "")
    .split("{автор}").join(bk.author || "")
    .split("{глава}").join(c.name || "")
    .split("{n}").join(String(i + 1))
    .split("{всего}").join(String(главы.length));
}
/* ── Карта мест ──
   Третий этап разбора: где всё это происходит. Карта — обычная современная,
   картинкой, а точки расставлены по координатам; у каждой короткий рассказ.
   Читая про Пилос, полезно увидеть, что это юго-запад Пелопоннеса, а Троя —
   на другом берегу моря. */
/* Понятие объясняем один раз — в той главе, где оно встретилось впервые.
   «Стек» и «дюльфер» повторялись у Тессона из главы в главу: в каждой то же
   самое, ничего нового, а счётчики слоёв от этого пухли. Места — исключение:
   увидеть Итаку в каждой песне и есть смысл карты, поэтому география
   повторяется по-прежнему. */
const bookMap = (b) => {
  const все = artsPart(b, "map");
  const первое = new Map();
  for (const p of все) {
    const k = слойТочки(p) + "|" + p.name;
    const гл = частьТочки(p);
    if (!первое.has(k) || гл < первое.get(k)) первое.set(k, гл);
  }
  const было = new Set();
  return все.filter((p) => {
    if (слойТочки(p) === "place") return true;
    const k = слойТочки(p) + "|" + p.name;
    if (было.has(k) || частьТочки(p) !== первое.get(k)) return false;
    было.add(k);
    return true;
  });
};
/* Глава точки — то же самое, что в фильтре карты: part, а если его нет — ch.
   Раньше здесь сравнивался только ch, и у книг вроде «Столпов моря», где точки
   размечены полем part, глава не находилась никогда. */
const mapOfChapter = (b, i) => bookMap(b).filter((x) => (Number(x.part) || Number(x.ch) || 0) === i + 1);
/* Карта на всю книгу — это все точки разом: по главам их разводит содержание
   внутри карты, а те, что без главы, лежат отдельным пунктом «Вокруг книги».
   Раньше здесь стояла догадка: «если есть точки без главы — показываем только
   их». На «Одиссее» она развалилась. Места там размечены полем ch, а слои —
   полем part, и все справки прочитались как «точки без главы»: география
   пропала с карты целиком, а вкладка справок осталась в одиночестве и потому
   не показывалась. Угадывать тут нечего — отдаём всё. */
const mapWhole = (b) => bookMap(b);
const mapPoints = (b, i) => i < 0 ? mapWhole(b) : mapOfChapter(b, i);

/* Номер главы, которую читаешь сейчас, — с ней карта и открывается: в её
   содержании глава уже выбрана, показаны только её места. Вернуться ко всем
   можно там же, пунктом «Все места».
   Книга не начата или в её главе точек нет — открывается вся карта. */
function mapHereChapter(b) {
  const bk = b || mapMaterial() || book();
  const главы = bk.chapters || [];
  if (!главы.length) return 0;
  /* У пьесы «докуда дошёл» считается не страницами, а разбором: открываем
     блок, над которым идёшь сейчас. Проверять «позвали без материала» нельзя —
     карта как раз передаёт его явно, и ветка не срабатывала никогда. */
  if (isPiano() && piece().id === bk.id) {
    const w = pracWhere();
    const n = w && w.bl ? w.bl.i + 1 : (w && w.finished ? главы.length : 1);
    return Math.min(Math.max(1, n), главы.length);
  }
  const стр = bookProgressOf(bk);
  /* Книга не начата — открываем первую главу, а не всю карту: пустая карта
     со всеми точками сразу — это список, а не место, куда пришёл читать. */
  if (!стр || стр <= (bk.startPage || 0)) return главы.length ? 1 : 0;
  let i = -1;
  главы.forEach((c, n) => { if (стр >= c.from) i = n; });
  /* Если в этой главе ничего нет, открываем ближайшую, где есть: пустая карта
     на входе выглядит поломкой, а не «здесь пусто». */
  const есть = (n) => mapPoints(bk, -1).some((p) => (Number(p.part) || Number(p.ch) || 0) === n);
  const хочу = i >= 0 ? i + 1 : 1;
  if (есть(хочу)) return хочу;
  for (let n = хочу; n >= 1; n--) if (есть(n)) return n;          // назад, к прочитанному
  for (let n = хочу + 1; n <= главы.length; n++) if (есть(n)) return n;
  return главы.length ? 1 : 0;
}
const mapBox = (b) => {
  const a = artsOf((b || book()).id);
  return (a && a.mapBox) ? a.mapBox : null;
};
/* Версия картинки карты: меняется вместе с самой картинкой, и по ней же
   строится ключ хранения — старая копия на устройстве больше не переживает
   замену. */
const mapKey = (id) => "map-" + id + "-v" + (((artsOf(id) || {}).mapVer) || 1);
/* Годы, за которые у места стоит искать старые снимки. Есть не у всякой книги:
   у «Одиссеи» фотографий той эпохи нет по понятным причинам, а у книги про
   стеки места разбросаны по миру, где архив пуст. */
const pastvuYears = (b) => (artsOf((b || book()).id) || {}).pastvu || null;
/* Содержание карты: у точки может стоять номер главы (part) — тогда карту
   можно отфильтровать и показать только места из выбранной главы. Это
   отдельное поле, а не ch: по ch собирается карта одной главы, и обнулять
   его нельзя — карта всей книги живёт как раз на точках без главы.
   Названия глав берём из самой книги, из её содержания: свой список завёл бы
   вторую версию оглавления, и она разошлась бы с тем, что видно в материале. */
const mapPartsOf = (b) => {
  const bk = b || book();
  const главы = (bk.chapters || []).map((c, i) => ({ n: i + 1, name: c.name || `Глава ${i + 1}` }));
  return главы.length ? главы : ((artsOf(bk.id) || {}).parts || []);
};
const mapFile = (id) => CAT_ART_FILE("map-" + id);
/* Меркатор: карта нарисована им, значит и точки надо ставить по нему, иначе
   к северу всё поедет. */
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
function mapXY(box, p) {
  const x = (p.lon - box.west) / (box.east - box.west) * 100;
  const yn = mercY(box.north), ys = mercY(box.south);
  const y = (yn - mercY(p.lat)) / (yn - ys) * 100;
  return { x, y };
}


// главы, к которым есть комментарии — по ним и ходим в шторке



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
  let running = b.startPage || 0, prev = null, chapterInOne = false;
  /* Границы глав: закрыть главу за один присест — это событие, а не процент.
     Ловим прыжок, накрывший главу целиком, от её начала до конца. */
  const гр = (b.chapters || []).map((c) => Number(c.from) || 0).sort((x, y) => x - y);
  for (const e of list) {
    const jump = (e.page || 0) - running;
    if (jump > maxJump) maxJump = jump;
    for (let i = 0; i < гр.length; i++) {
      const конец = i + 1 < гр.length ? гр[i + 1] : (b.pages || 0);
      if (гр[i] && running <= гр[i] && (e.page || 0) >= конец) { chapterInOne = true; break; }
    }
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
    maxJump, weekend, comeback, notes, reread, chapterInOne,
    chapter: chapterAt(page), ...moments(list)
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

/* Запись без courseId — из времён единственного курса, и принадлежит она
   первому. Без этого правила старые занятия засчитывались бы любому новому
   материалу, и он открывался бы уже наполовину пройденным. */
function courseEntries() {
  const id = course().id, first = firstCourseId();
  return courseTrack().entries.filter((e) => !e.deleted && (e.courseId || first) === id);
}

function doneLessons() {
  const set = new Set();
  for (const e of courseEntries())
    for (const i of e.lessons || []) set.add(i);
  return set;
}

/* ── Сколько курса пройдено: время, а не уроки ──
   У курса уроки несопоставимой длины: два первых по три минуты, два последних
   по два часа. Считать их поштучно значит показывать четверть курса там, где
   сделана двадцатая часть, и обещать конец через пару заходов. Поэтому мера —
   секунды, а внутри длинного урока ещё и доля закрытых шагов: без неё полоска
   стояла бы неподвижно неделями, пока идёт стодесятиминутный урок.

   Заодно собираем прирост по дням — из него считается срок, и считаться он
   должен по тому же, что показывает полоска. */
function courseTime() {
  const c = course();
  const done = doneLessons();
  const st = lessonStore().done || {};
  // когда урок отметили целиком: берём самую раннюю запись с ним
  const датаОтметки = {};
  for (const e of courseEntries())
    for (const i of e.lessons || [])
      if (!датаОтметки[i] || e.date < датаОтметки[i]) датаОтметки[i] = e.date;

  let totalSec = 0, doneSec = 0;
  const поДням = {};
  const плюс = (d, sec) => { if (d && sec > 0) поДням[d] = (поДням[d] || 0) + sec; };

  c.lessons.forEach((l, i) => {
    if (l.hidden) return;
    const dur = Number(l.dur) || 0;
    totalSec += dur;
    const steps = Array.isArray(l.steps) ? l.steps : [];
    let сек = 0;
    if (courseWatch()) {
      const s = seenOf(i);
      сек = Math.min(s.at || 0, dur || s.dur || 0);
      for (const [d, v] of Object.entries(s.byDay || {})) плюс(d, v);
    } else if (steps.length && dur) {
      const доля = dur / steps.length;
      steps.forEach((_, n) => {
        const когда = st["L" + i + ":s" + n];
        if (!когда) return;
        сек += доля;
        // в старых записях вместо даты стоит единица — тогда относим ко дню отметки
        плюс(typeof когда === "string" ? когда : датаОтметки[i], доля);
      });
    }
    /* Урок, отмеченный целиком, засчитываем полностью: остаток относим на день
       отметки. Шаги и отметка — два разных способа сказать «сделано», и один
       не отменяет другого. */
    /* Лекция считается только по отмеченным минутам: старая отметка «урок
       пройден» осталась от прежнего устройства курса и досматривать за тебя
       не должна. */
    if (!courseWatch() && done.has(i) && сек < dur) { плюс(датаОтметки[i], dur - сек); сек = dur; }
    doneSec += Math.min(сек, dur);
  });
  return { totalSec, doneSec, поДням };
}

function pastelStats() {
  const c = course();
  const done = doneLessons();
  /* Записи только своего курса: раньше брались все записи трека, и дни,
     заметки и «возвращения» одного курса засчитывались другому. */
  const list = courseEntries().slice().sort((a, b) => a.date < b.date ? -1 : 1);
  const { totalSec, doneSec } = courseTime();

  let weekend = false, comeback = false, notes = 0, maxAtOnce = 0, prev = null;
  for (const e of list) {
    maxAtOnce = Math.max(maxAtOnce, (e.lessons || []).length);
    if (e.note) notes++;
    const dw = fromStr(e.date).getDay();
    if (dw === 0 || dw === 6) weekend = true;
    if (prev && daysBetween(prev, e.date) >= 7) comeback = true;
    prev = e.date;
  }

  if (plainDraw()) {
    const c2 = course(), готов = !!c2.done;
    return {
      lessons: 1, done: готов ? 1 : 0, doneSet: new Set(), spentSec: 0,
      stepsDone: готов ? 1 : 0, steps: 1, stages: 0, stageSet: new Set(), lessonSet: new Set(),
      pct: готов ? 100 : 0, totalSec: 0, doneSec: 0, minutes: 0, minutesAll: 0, minutesLeft: 0,
      days: list.length, streak: streak(), streakAll: streakAll(),
      weekend, comeback, notes, maxAtOnce, nextLesson: null, drawDone: готов,
      shots: takesFor(curKey()).filter((t) => t.kind === "photo").length,
      /* Сколько дней прошло с первого листа. У рисунка нет ни уроков, ни
         процента, и подбодрить его можно только временем: не «сколько
         сделано», а «сколько ты с этим». */
      since: list.length ? daysBetween(list[0].date, todayStr()) : 0,
      /* Отдельных дней, а не заходов: за вечер бывает два подхода, и день от
         этого не удваивается. */
      dates: new Set(list.map((e) => e.date)).size,
      ...moments(list),
    };
  }

  /* Шаги и этапы — чтобы награда могла цепляться не только за урок целиком.
     Этап считается пройденным, когда закрыты все его шаги. */
  const st = lessonStore().done || {};
  const isDone = (i, n) => !!st["L" + i + ":s" + n];
  let stepsDone = 0;
  const stageSet = new Set(), lessonSet = new Set();
  c.lessons.forEach((l, i) => {
    const steps = Array.isArray(l.steps) ? l.steps : [];
    const byStage = new Map();
    steps.forEach((x, n) => {
      if (isDone(i, n)) stepsDone++;
      const g = x.g || "";
      if (!g) return;
      const cur = byStage.get(g) || { all: 0, ok: 0 };
      cur.all++; if (isDone(i, n)) cur.ok++;
      byStage.set(g, cur);
    });
    for (const [g, v] of byStage) if (v.all && v.ok >= v.all) stageSet.add(g);
    if (steps.length && steps.every((_, n) => isDone(i, n))) lessonSet.add(i);
  });

  const next = c.lessons.findIndex((l, i) => !l.hidden && !done.has(i));
  const shown = c.lessons.reduce((n, l) => n + (l.hidden ? 0 : 1), 0);
  const doneShown = c.lessons.reduce((n, l, i) => n + (!l.hidden && done.has(i) ? 1 : 0), 0);
  /* Сколько времени реально просидел за пастелью: лог занятия пишет секунды на
     каждый шаг, и это единственная честная мера — не хронометраж автора. */
  const spentSec = (lessonStore().log || [])
    .reduce((n, x) => n + (Number(x.sec) || 0), 0);

  return {
    lessons: shown, done: doneShown, doneSet: done, spentSec,
    stepsDone, steps: c.lessons.reduce((n, l) => n + (Array.isArray(l.steps) ? l.steps.length : 0), 0),
    stages: stageSet.size, stageSet, lessonSet,
    /* Процент — по времени. Курс без проставленных длительностей считаем
       по-старому, поштучно: лучше грубо, чем ноль навсегда. */
    pct: totalSec ? Math.min(100, doneSec / totalSec * 100) : (shown ? doneShown / shown * 100 : 0),
    totalSec, doneSec, minutes: Math.round(doneSec / 60),
    minutesAll: Math.round(totalSec / 60),
    minutesLeft: Math.max(0, Math.round((totalSec - doneSec) / 60)),
    days: list.length, streak: streak(), streakAll: streakAll(),
    weekend, comeback, notes, maxAtOnce,
    nextLesson: next < 0 ? null : next,
    ...moments(list)
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
/* Процент у пьесы — доля набранных заходов, а не доля тронутых тактов.
   Каждый такт должен набрать по десять, каждый блок — ещё и сшивку; из этого
   и складывается целое. Начни кто-нибудь с сорокового такта — процент честно
   покажет, что сделана одна сороковая, а не «почти всё». */
let pctRouteCache = { key: "", val: 0 };
function pctRoute() {
  const st = repsStore();
  const ck = piece().id + "|" + (st.at || 0) + "|" + (piece().bars || 0);
  if (pctRouteCache.key === ck) return pctRouteCache.val;
  let всего = 0, сделано = 0;
  for (const bl of pracBlocks()) {
    for (let b = bl.from; b <= bl.to; b++)
      for (const st of barSteps(b)) { всего += stepGoal(b, st); сделано += repCount(b, st); }
    всего += REP_GOAL;                                  // сшивка блока весит как такт
    сделано += finalPassed(bl) ? REP_GOAL : 0;
    if (runNeeded(bl)) {                                // и прогон с начала — тоже
      всего += REP_GOAL;
      сделано += runPassed(bl) ? REP_GOAL : 0;
    }
  }
  const val = всего ? сделано / всего * 100 : 0;
  pctRouteCache = { key: ck, val };
  return val;
}

/* Что показывает кольцо. У курса это НЕ доля всего курса: четыре с половиной
   часа видео делают её неподвижной неделями, а неподвижное кольцо говорит
   «ты не сдвинулся», хотя ты сидел и рисовал. Показываем долю текущего урока —
   она растёт за вечер. Внутренний процент (s.pct) остаётся прежним: на нём
   держатся награды и карточки. */
function courseRingPct() {
  const at = lessonNext();
  if (!at) return 100;
  const п = lessonProgress(at.i);
  return п.всего ? п.pct : 0;
}
const shownPct = (s) => isPiano() && piece() && piece().bars ? pctRoute()
  : isCourse() && lessons().length ? courseRingPct() : s.pct;
/* У рисунка мерить нечего: он или идёт, или закончен. Процент тут — ложная
   точность, поэтому в кольце прочерк, пока лист не закрыт. */
const noPct = () => isCourse() && plainDraw() && !course().done;

/* Размер материала словами: столько-то шагов у занятия по шагам, столько-то
   минут у лекции. Стоит в подписи под названием вместо доли пройденного:
   процент уже нарисован кольцом, а размер отвечает на другой вопрос — во что
   вообще ввязываешься. */
function courseSize() {
  if (!isCourse() || !lessons().length) return "";
  const ls = lessons();
  if (courseWatch()) {
    const n = ls.filter((l) => !l.hidden).length;
    return n ? n + " " + plural(n, "урок", "урока", "уроков") : "";
  }
  const n = ls.reduce((a, _, i) => a + (lessonSteps(i) || []).length, 0);
  return n ? shagi(n) : "";
}

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

const PRAC_FILE = "keiko-practice.json";
const LS_PRAC = "keiko-practice-data-v1";
/* Разбор пьес для «Практики» — данные, а не код: лежит в приватном гисте
   рядом с наградами и карточками. В репозитории его нет намеренно —
   это по-нотный разбор чужих произведений, и публиковать его незачем. */
let PRACTICE_DATA = {};
try { PRACTICE_DATA = JSON.parse(localStorage.getItem(LS_PRAC)) || {}; } catch {}
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

/* Ключ материала у курса: первый остаётся «pastel» — под этим именем лежат
   его награды, артефакты и записи занятий. Остальные зовутся своим id. */
/* Ключ открытого курса. Раньше здесь стояло ещё и «курс всего один — значит
   он первый»: пока курс правда был один, это совпадало. Стоило отправить
   пастель в архив, и единственным остался «Аргус» — он забрал себе чужой
   ключ, а с ним чужую пометку «спрятан» и подпись «Архив» в ленте. */
const courseKey = () => keyOfCourse(course());
const curKey = () => isBook() ? book().id : isWatch() ? video().id : isCourse() ? courseKey() : (piece() ? piece().id : "");
const catOf = (id) => CATALOG[id] || null;

const achCache = new Map();
function achFromCatalog(id) {
  const c = catOf(id);
  if (!c || !Array.isArray(c.ach)) return null;
  if (!achCache.has(id)) achCache.set(id, c.ach.map(a => ({ ...a, test: testFromWhen(a.when) })));
  return achCache.get(id);
}

/* Общие награды — те, что есть у каждого материала: накопленные дни. Лежат в
   каталоге отдельной записью, чтобы не расходиться в десяти местах. Серии
   отсюда убраны намеренно: пропуск не отменяет сделанного, и наказывать за
   него нечем. Считаются все дни подряд и вразбивку. */
const COMMON_ACH = "__common__";
function achCommon() {
  const c = CATALOG[COMMON_ACH];
  if (!c || !Array.isArray(c.ach)) return [];
  if (!achCache.has(COMMON_ACH))
    achCache.set(COMMON_ACH, c.ach.map(a => ({ ...a, test: testFromWhen(a.when) })));
  /* Лестница у всех одна, но обрезается под материал: книга читается за
     три-четыре недели, и ступени на полгода висели бы у неё мёртвыми. Не
     растягиваем по размеру материала, а именно обрезаем — растянутая лестница
     стала бы вторым процентом и открывалась бы одновременно с наградами за
     прогресс, а время должно отвечать на свой вопрос: сколько ты с этим живёшь. */
  const предел = Number((catOf(curKey()) || {}).maxDays) || 0;
  const все = achCache.get(COMMON_ACH);
  return предел ? все.filter((a) => Number((a.when[0] || [])[2]) <= предел) : все;
}

const achList = () => {
  /* Материал может попросить обойтись без наград вовсе: noAch в каталоге.
     Нужно, пока устройство материала ещё меняется — награда за то, что
     завтра перепишут, это шум. */
  if ((catOf(curKey()) || {}).noAch) return [];
  const свои = achFromCatalog(curKey()) ||
    (isBook() ? (BOOK_ACH[book().id] || ACH_BOOK) : isCourse() ? ACH_PASTEL : ACH_PIANO);
  return свои.concat(achCommon());
};
const achWords = () => (catOf(curKey()) || {}).words ||
  (isBook() ? (BOOK_WORDS[book().id] || WORDS_BOOK) : isCourse() ? WORDS_PASTEL : WORDS_PIANO);
/* Своё имя награды у материала. Общие награды считаются одинаково — по
   накопленным дням, — но называются в мире своего материала: у пьесы это
   вечера за клавиром, у книги про зимовье — поленница и прорубь. Лежит в
   каталоге рядом с наградами: { d5: { name, icon } }. Старая форма массивом
   осталась для пьес, у которых так уже записано. */
const flavor = () => (catOf(curKey()) || {}).flavor
  || ((!isBook() && !isCourse() && PIECE_FLAVOR[piece().id]) || {});
const lastName = (author) => String(author || "").trim().split(/\s+/).pop();

function achState() {
  if (!hasMaterials()) return [];
  const s = curStats();
  const fl = flavor();
  return achList().map(a => {
    const item = { ...a, done: !!a.test(s) };
    const f = fl[a.id];
    if (Array.isArray(f)) { item.name = f[0]; item.word = f[1]; }
    else if (f && typeof f === "object") {
      if (f.name) item.name = f.name;
      if (f.icon) item.icon = f.icon;
      if (f.word) item.word = f.word;
    }
    // финальная награда носит имя автора текущей композиции
    if (isPiano() && a.id === "bach") item.name = `${lastName(piece().author)} доволен`;
    return item;
  });
}

// текст награды с учётом контекста материала
const wordOf = (a) => a.word || achWords()[a.id] || a.hint;

/* ── Счётчики использования ──
   Отметка «этим разделом воспользовались»: через месяц-другой по этим числам
   решается, что из функционала мёртво и подлежит вырезанию. Никакой аналитики
   наружу — числа лежат в твоём же гисте рядом с записями. Каждое устройство
   пишет только в свою ветку, поэтому слияние — поимённый максимум, и ничего
   не теряется. В гист счётчики не толкаются сами: уедут со следующей
   настоящей записью. */
function useMark(key) {
  try {
    if (!data) return;
    if (!cfg.deviceId) { cfg.deviceId = Math.random().toString(36).slice(2, 7); saveCfg(); }
    const dev = (data.usage = data.usage || {})[cfg.deviceId] || (data.usage[cfg.deviceId] = {});
    const u = dev[key] || (dev[key] = { n: 0, at: 0 });
    u.n++; u.at = now();
    saveData();
  } catch {}
}

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

/* ── Живые названия в ленте ──
   В событии сохранён заголовок на тот день, когда карточка открылась. Но
   карточки и награды переписывают, и в ленте оставались имена, которых уже
   нет. Ищем по тому же id, что и при нажатии, а сохранённое держим запасом —
   на случай, когда материала больше нет вовсе. */
const evNameCache = new Map();
function evList(t, вид) {
  const ключ = вид + ":" + t.track + ":" + t.key;
  if (!evNameCache.has(ключ)) {
    let list = [];
    try {
      list = withMaterial({ track: t.track,
        pieceId: t.track === "piano" ? t.key : null,
        bookId: t.track === "book" ? t.key : null,
        videoId: t.track === "watch" ? t.key : null },
        () => (вид === "fact" ? factsState() : achState())) || [];
    } catch {}
    evNameCache.set(ключ, new Map(list.map((x) => [x.id, x])));
  }
  return evNameCache.get(ключ);
}
function evName(t, id, вид, запас) {
  const x = evList(t, вид).get(id);
  return (x && (вид === "fact" ? x.t : x.name)) || запас || "";
}
const evIcon = (t, id) => (evList(t, "ach").get(id) || {}).icon || "";

/* Совсем простой материал: ни уроков, ни этапов. Отметка значит «сегодня
   рисовал», к ней можно приложить снимок, а когда рисунок готов — одна
   кнопка «завершён». Больше в этом ничего нет и не должно быть. */
const plainDraw = () => isCourse() && !lessons().length;

// карточки текущего материала: сколько открыто по числу дней занятий
/* Карточка открывается за занятие: одно занятие — одна карточка.
   У курса занятий мало (уроки), поэтому там за раз открывается несколько.
   Когда материал пройден до конца — открывается всё, что осталось. */
function factsState() {
  // ключ материала общий для всех: у второго курса свои карточки, а не чужие
  const key = curKey();
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
    /* Считаем не долю пройденного, а сколько раз садился и сколько минут
       просидел: у рисования награда не в проценте, и провалить «порисовал
       двенадцать минут» нельзя. */
    /* Минуты с глаз убраны: если курс увлекает, хронометраж только мешает.
       Остаётся имя урока, за который сейчас садишься, и общий процент. */
    const at = lessonNext();
    const сейчас = at ? (lessons()[at.i] || {}).title : "";
    return { icon: "🎨", title: c.name, pct: s.pct,
      sub: сейчас ? `${сейчас} · ${Math.round(s.pct)}%` : "курс пройден" };
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
  /* Раньше запись в ленту шла прямо здесь, до вопросов про следующий материал.
     Откажешься от них — архив откатывался, флаг снимался, а карточка
     «Завершил» оставалась в «Моментах» навсегда. Выходов с отказом пять, и ни
     один её не убирал. Теперь она пишется только там, где завершение и правда
     состоялось. */
  const вЛенту = () => addEvent("done", rec.srcId, rec.track, "Завершил: " + rec.title, { tag: rec.srcId });

  if (isBook()) {
    const cur = book();
    cur.archived = true; cur.updatedAt = now();
    const next = data.book.books.find(b => !b.archived);
    if (next) { data.book.activeBook = next.id; вЛенту(); saveData(); schedulePush(); render(); openShelfSheet(rec.id); return; }

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
    /* Новый курс уходит в список courses, а не в старое одиночное поле:
       список — то, что читает приложение, и запись мимо него просто пропадала
       из виду. Прежний курс помечаем архивным, иначе он остался бы на ленте. */
    const прежний = course();
    data.pastel.courses = Array.isArray(data.pastel.courses) ? data.pastel.courses : [];
    if (!data.pastel.courses.length && data.pastel.course) data.pastel.courses.push(data.pastel.course);
    const старый = data.pastel.courses.find((x) => x.id === прежний.id);
    if (старый) { старый.archived = true; старый.updatedAt = now(); }
    const свежий = {
      id: uid(), name: name.trim(), author: "",
      lessons: Array.from({ length: cnt }, (_, i) => ({ title: `Урок ${i + 1}`, dur: 600 })),
      updatedAt: now()
    };
    data.pastel.courses.push(свежий);
    data.pastel.activeCourse = свежий.id;
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

  вЛенту();
  saveData(); schedulePush(); syncPickers(); render();
  openShelfSheet(rec.id);      // сразу предлагаем поставить оценку и написать отзыв
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
      data.goalAt = now();
      saveData(); schedulePush();
      openSettingsSheet();
      render();
      toast(`Цель: ${data.weekGoal} ${plural(data.weekGoal, "день", "дня", "дней")} в неделю`);
    }));
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
  /* У рисунка каждая отметка — своя сессия, а не дописка к дню: за день
     можно сесть за лист дважды, и это два разных подхода со своим снимком.
     У остальных материалов день по-прежнему один. */
  const existing = (isCourse() && plainDraw()) ? null : entryFor(selectedDate);
  /* Отметку записываем всегда, даже когда прогресс не сдвинулся: день за
     инструментом или над книгой — это день, а перечитывать и возвращаться
     назад — нормальная часть чтения. */
  const beforeDone = new Set(achState().filter(a => a.done).map(a => a.id));
  const beforeFacts = new Set(factsState().filter(f => f.open).map(f => f.id));
  const beforeMus = musOpenSet();
  const before = curStats();
  const note = ($("#noteInput") && $("#noteInput").value.trim()) || "";

  if (existing) {
    if (isWatch()) { /* пересмотр: новых единиц нет, важна только сама дата */ }
    else if (isBook() && bookMode(book()) === "parts") {
      existing.spans = mergeSpans((existing.spans || []).concat(pickSpans));
    /* Максимум отсюда убран: он не пускал исправить опечатку в тот же день.
       Отметил 250 вместо 205 — и до полуночи с этим ничего не сделать.
       Возвращаться к прочитанному и перебирать страницы — нормальная часть
       чтения, и запрещать это на полсуток незачем. Ноль по-прежнему не
       принимаем: это не выбор, а неоткрытый выбор страницы. */
    } else if (isBook()) existing.page = pickPage > 0 ? pickPage : (existing.page || 0);
    else if (isCourse() && plainDraw()) markDraw(existing);
    else if (isCourse()) existing.lessons = [...new Set([...(existing.lessons || []), ...pickLessons])];
    else existing.spans = (existing.spans || []).concat(currentSpans());
    if (note) existing.note = existing.note ? existing.note + "; " + note : note;
    existing.updatedAt = now();
  } else {
    trackOf().entries.push(Object.assign(
      { id: uid(), date: selectedDate, note, createdAt: now(), updatedAt: now() },
      isWatch() ? { videoId: video().id } :
      isBook() ? Object.assign({ bookId: book().id },
        bookMode(book()) === "parts" ? { spans: pickSpans.slice() } : { page: pickPage })
      : isCourse() ? (plainDraw()
          ? { courseId: course().id, lessons: [] }
          : { lessons: pickLessons.slice() })
      : { pieceId: piece().id, spans: currentSpans() }
    ));
    if (isCourse() && plainDraw()) markDraw(null);
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

  /* Решение «книга завершена» применяем к самой книге: она уйдёт с главной,
     но останется в библиотеке, в наградах и в истории. Снятие возвращает её
     на ленту. */
  let justClosed = null;
  if (isBook()) {
    const bk = book();
    if (pickDone && !bk.done) {
      bk.done = true; bk.doneAt = todayStr(); bk.updatedAt = now();
      justClosed = bk;
    } else if (!pickDone && bk.done) { bk.done = false; bk.doneAt = ""; bk.updatedAt = now(); }
  }

  /* Запись и материал запоминаем СЕЙЧАС, пока активен тот, что отмечали.
     Ниже идут schedulePush и render: закрытая книга уходит с ленты, активным
     становится сосед — и карточка дня писалась бы уже про него, а чаще не
     писалась вовсе, потому что записи за этот день у соседа нет. */
  const entNow = entries().filter((x) => x.date === selectedDate).slice(-1)[0];
  const keyNow = curKey();
  const trackNow = data.active;

  pending = [];
  pickLessons = [];
  pickSpans = [];
  saveData();
  schedulePush();
  closeSheet();

  const after = curStats();
  const fresh = achState().filter(a => a.done && !beforeDone.has(a.id));
  /* Что за эту отметку открылось в музее: сравниваем с тем, что было открыто
     до неё. Снимок «до» снят там же, где для наград, — иначе сюда попали бы
     предметы, открытые давно или на другом устройстве. */
  const freshMus = musItems().filter((x) => musOpen(x) && !beforeMus.has(x.id));
  const freshFacts = factsState().filter(f => f.open && !beforeFacts.has(f.id));
  /* Снимок вида материала ДО перерисовки: досмотренное видео уходит из ленты,
     активным становится соседний материал — и итог рассказал бы про него. */
  const ctx = { watch: isWatch(), book: isBook(), course: isCourse(),
                title: isWatch() ? video().title : "" };
  /* Штамп времени — ДО перерисовки. renderMuseum сам зовёт musStamp() без
     аргументов, и на открытой вкладке артефактов рисунок успевал пометить
     только что открытый предмет единицей «когда-то». Настоящего времени он
     после этого уже не получал и уезжал в сетке вниз, к давно открытым. */
  musStamp(freshMus);
  render();

  overlayQueue = [];
  // итог по книге идёт первым: он про саму книгу, награды и карточки — после
  if (justClosed) overlayQueue.push({ type: "bookDone", book: justClosed });
  // каждая награда — свой экран: раньше показывалась только последняя,
  // а промежуточные пропадали, хотя открылись честно
  fresh.forEach((a, i) => overlayQueue.push({ type: "ach", a, i: i + 1, n: fresh.length }));
  /* Предмет музея — такая же награда за чтение, тем же экраном и с тем же
     счётчиком «2 из 5»: без него подряд идущие карточки не отличить одну от
     другой. Когда открылось сразу много — например, отметили десяток глав за
     раз, — по одной их не листают: первые три показываем, остальные одним
     списком, как карточки знаний. */
  musOverlays(freshMus).forEach((o) => overlayQueue.push(o));

  const stamped = stampProgress(fresh, freshFacts);
  /* Карточка дня пишется на каждую отметку, а не только когда что-то открылось.
     Раньше addEvent стоял внутри проверки на награды — и день чтения не
     оставлял в ленте следа вовсе, хотя у пианино карточка появлялась всегда.
     Из-за этого промежуток «страницы 200–208» был виден по большим праздникам.
     У ролика своя карточка «Досмотрел», второй такой же ни к чему. */
  /* Через entries(), а не по всему треку: фильтр по одной дате брал последнюю
     добавленную запись — чью угодно. Отметил за день две книги, и в карточке
     одной оказывался пробег другой. На экране это не всплывало, лента
     пересобирает текст по своему материалу, но в данных и в гисте лежал чужой. */
  if (entNow && !ctx.watch) {
    /* Закрыл книгу в этот заход — карточка дня и есть след: отдельный пост
       «закрыл книгу» рядом с «читал» дублировал бы одно и то же. Меняем
       глагол и кладём итог внутрь, к нему ведёт кнопка в ленте. */
    const текст = justClosed
      ? sessionText(trackNow, entNow).replace(/^Читал:/, "Дочитал:")
      : sessionText(trackNow, entNow);
    /* У рисунка метка своя на каждую сессию: общая «ключ+дата» склеивала бы
       два подхода за день в одну карточку. Снимок, сделанный в этой шторке,
       уходит с ней же — в ленте сессия видна вместе с листом. */
    const рисунок = trackNow === "pastel" && plainDraw();
    /* Снимок ищем по времени, а не по списку из шторки: сфотографировать
       можно и не из неё, а список легко потерять между перерисовками. Берём
       первый снимок этого материала, сделанный после открытия шторки. */
    const снимок = рисунок
      ? takesFor(keyNow).find((t) => t.kind === "photo" && !t.deleted && t.at >= drawSince)
      : null;
    addEvent("session", keyNow, trackNow, текст, {
      tag: рисунок ? keyNow + ":" + entNow.id : keyNow, date: selectedDate,
      fields: Object.assign({ createdAt: now(), awards: stamped.ach, facts: stamped.facts,
          arts: freshMus.map((x) => ({ id: x.id, name: x.name, icon: musIcon(x) })) },
        justClosed ? { farewell: bookFarewell(justClosed) } : {},
        снимок ? { mediaId: снимок.id, mediaKind: "photo" } : {}),
    });
  }
  if (freshFacts.length) overlayQueue.push({ type: "facts", list: freshFacts });

  /* Второе сохранение — не лишнее. Выше по функции saveData уже был, но после
     него данные меняли ещё трижды: musStamp, stampProgress и addEvent. Ни один
     из них не пишет сам, и карточка дня, время наград и время открытия
     предметов оставались только в памяти. До сих пор их спасал гист — push
     читает живые данные, — но офлайн или при закрытии раньше полутора секунд
     они пропадали молча. */
  saveData();
  schedulePush();

  if (overlayQueue.length) { showNextOverlay(); return; }
  showDone(before, after, !!existing, ctx);
}

let overlayQueue = [];
/* Сколько предметов показываем поодиночке, прежде чем свести остальные в один
   список. Три — потолок, за которым листание перестаёт быть подарком. */
const MUS_ONE_BY_ONE = 3;

/* Экраны для открывшихся предметов. Отдельно от показа — чтобы правило
   «сколько поодиночке, а сколько списком» можно было проверить тестом. */
function musOverlays(свежие) {
  const n = (свежие || []).length;
  if (!n) return [];
  const по_одному = свежие.slice(0, MUS_ONE_BY_ONE)
    .map((x, i) => ({ type: "mus", x, i: i + 1, n }));
  return n <= MUS_ONE_BY_ONE ? по_одному
    : по_одному.concat([{ type: "musMany", list: свежие.slice(MUS_ONE_BY_ONE), n }]);
}

function showNextOverlay() {
  const item = overlayQueue.shift();
  if (!item) return;
  /* Мысль дня рисуется в том же окне и оставляет за собой класс daily. Снимаем
     его здесь, у всех сразу: иначе награда, пришедшая следом, показывалась в
     чужих стилях. */
  $("#cheer").classList.remove("daily");
  if (item.type === "ach") showCheer(item.a, item.i, item.n);
  else if (item.type === "mus") showMus(item.x, item.i, item.n);
  else if (item.type === "musMany") showMusMany(item.list, item.n);
  else if (item.type === "bookDone") showBookDone(item.book);
  else showFacts(item.list);
}

/* Переход между экранами очереди. Кнопка прячет окно сразу, а следующий экран
   приходит через 220 мс — и всё это время по кнопке можно ударить второй раз.
   Раньше каждый удар ставил свой таймер: два shift подряд, и одна награда
   мелькала и тут же заменялась следующей. Теперь переход один. */
let overlayHop = 0;
function nextOverlaySoon() {
  if (overlayHop || !overlayQueue.length) return;
  overlayHop = setTimeout(() => { overlayHop = 0; showNextOverlay(); }, 220);
}

/* Открывшийся предмет музея. Отдельный экран, а не строчка в списке наград:
   вещь, которую можно пойти и увидеть, — это событие, а не галочка. */
function showMus(x, i, n) {
  const step = $("#cheerStep");
  step.hidden = !(n > 1);
  step.textContent = n > 1 ? `Артефакт ${i} из ${n}` : "";
  $("#cheerIc").textContent = "🏺";
  $("#cheerTitle").textContent = x.name;
  const где = [x.museum, x.place].filter(Boolean).join(" · ");
  $("#cheerText").textContent = [x.why, где].filter(Boolean).join(" ");
  $("#cheerOk").textContent = overlayQueue.length ? "Дальше" : "Красота!";
  $("#cheer").classList.remove("fact");
  $("#cheer").classList.add("show");
}

/* Хвост открывшихся предметов — одним списком. Показывать двадцатую карточку
   подряд бессмысленно: человек уже не читает, а жмёт «Дальше». Имена и залы
   остаются, каждый предмет всё равно ждёт в разделе артефактов. */
function showMusMany(list, n) {
  $("#cheerStep").hidden = true;
  $("#cheerIc").textContent = "🏺";
  $("#cheerTitle").textContent = `Ещё ${list.length} ${plural(list.length, "предмет", "предмета", "предметов")}`;
  $("#cheerText").innerHTML = `<span class="cheer-list">${list.map((x) => `
      <span class="cheer-item">
        <b>${esc(x.name)}</b>
        <i>${esc([x.museum, x.place].filter(Boolean).join(" · ") || x.why || "")}</i>
      </span>`).join("")}</span>`
    + `<span class="cheer-dig"><b>Всего открылось ${n}</b><i>Все они лежат в артефактах — значок рядом с настройками</i></span>`;
  $("#cheerOk").textContent = overlayQueue.length ? "Дальше" : "Красота!";
  $("#cheer").classList.add("show", "fact");
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

/* Итог по завершённой книге: не оценка и не поздравление с процентом, а
   след, который она оставила — сколько дней, вечеров, страниц и заметок.
   Считаем только то, что действительно записано: выдумывать цифры нельзя. */
function bookFarewell(bk) {
  const es = bookEntriesOf(bk.id).slice().sort((a, b) => a.date < b.date ? -1 : 1);
  const days = new Set(es.map(e => e.date)).size;
  const mins = es.reduce((n, e) => n + (e.mins || 0), 0);
  const first = es.length ? es[0].date : "";
  const last = es.length ? es[es.length - 1].date : "";
  const span = first && last ? daysBetween(first, last) + 1 : 0;
  const pages = bookMode(bk) === "parts" ? bookCovered(bk) : (() => {
    let p = bk.startPage || 0;
    for (const e of es) { p = Math.max(p, e.page || 0);
      for (const sp of e.spans || []) p = Math.max(p, sp.to || 0); }
    return Math.max(0, Math.min(p, bk.pages) - (bk.startPage || 0));
  })();
  const notes = thoughtsOf(bk.id).filter(t => !t.event);
  const words = notes.reduce((n, t) => n + String(t.text || "").trim().split(/\s+/).filter(Boolean).length, 0);
  // самый частый день недели — «чаще всего садился за неё по средам»
  const byDow = new Array(7).fill(0);
  for (const d of new Set(es.map(e => e.date))) byDow[(fromStr(d).getDay() + 6) % 7]++;
  const top = byDow.indexOf(Math.max(...byDow));
  const dow = byDow[top] >= 2 ? DOW_BY[top] : "";
  return { days, mins, first, last, span, pages, notes: notes.length, words, dow, dowN: byDow[top] };
}

function showBookDone(bk, ready) {
  const f = ready || bookFarewell(bk);
  const hours = Math.floor(f.mins / 60), rest = f.mins % 60;
  const время = f.mins >= 60
    ? hours + " " + plural(hours, "час", "часа", "часов") + (rest ? " " + rest + " мин" : "")
    : f.mins + " " + plural(f.mins, "минута", "минуты", "минут");
  const строки = [];
  if (f.days) строки.push([f.days + " " + plural(f.days, "вечер", "вечера", "вечеров"),
    f.span > f.days ? "растянулись на " + f.span + " " + plural(f.span, "день", "дня", "дней") : "подряд"]);
  if (f.mins) строки.push([время, "чистого чтения"]);
  if (f.pages) строки.push([f.pages + " " + plural(f.pages, "страница", "страницы", "страниц"), "позади"]);
  if (f.notes) строки.push([f.notes + " " + plural(f.notes, "заметка", "заметки", "заметок"),
    f.words ? f.words + " " + plural(f.words, "слово", "слова", "слов") + " своими руками" : "на полях"]);
  if (f.dow) строки.push(["Чаще по " + f.dow, "так сложилось"]);

  $("#cheerStep").hidden = true;
  $("#cheerIc").textContent = "📕";
  $("#cheerTitle").textContent = "«" + (bk.title || "Книга") + "» закрыта";
  $("#cheerText").innerHTML = `<span class="cheer-list">${строки.map(([a, b]) => `
      <span class="cheer-item"><b>${esc(a)}</b><i>${esc(b)}</i></span>`).join("")}</span>`
    + (f.first ? `<span class="cheer-dig"><b>${
        f.last === todayStr() ? "Началась " + fmtDay(f.first)
        : f.first === f.last ? "Всё за один день, " + fmtDay(f.first)
        : "С " + fmtDay(f.first) + " по " + fmtDay(f.last)
      }</b><i>Книга осталась в библиотеке — вместе с наградами и заметками</i></span>` : "");
  $("#cheerOk").textContent = overlayQueue.length ? "Дальше" : "Спасибо ей";
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
  $("#cheerIc").textContent = "🎉";
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
  /* Про серию — ни слова. Она превращает пропуск в потерю: пропустил день —
     и вместо занятия думаешь о сгоревшем счётчике. На экране прогресса её
     убрали давно, а здесь она оставалась и подмешивалась в каждую отметку. */
  $("#cheerText").textContent = text;
  $("#cheer").classList.add("show");
}

/* Удалили запись за день — из разбора уходит и то, что в этот день закрылось.
   Иначе выходило вранье: в прогрессе пусто, а практика уверена, что такты
   пройдены, и предлагает следующие. */
function pracForgetDay(pieceId, ds) {
  const st = data.practice && data.practice[pieceId];
  if (!st) return 0;
  let n = 0;
  /* Заход не вырезаем, а помечаем — по той же причине, что и при отмене:
     вырезанное воскресает при слиянии, а пометка едет как обычное значение. */
  const гасим = (arr) => {
    for (const r of arr || []) if (r && r.d === ds && !r.off) { r.off = 1; n++; }
  };
  for (const такт of Object.keys(st.reps || {})) {
    const box = st.reps[такт];
    if (Array.isArray(box)) гасим(box);
    else for (const шаг of Object.keys(box || {})) гасим(box[шаг]);
  }
  for (const k of Object.keys(st.final || {})) гасим(st.final[k]);
  // старый формат: ключи «размер:от-до:рука» со днём в значении
  for (const [k, v] of Object.entries(st.done || {})) if (v === ds) { st.done[k] = 0; n++; }
  if (n) st.at = now();
  return n;
}

/* Карточка дня в «Моментах» — отдельная запись с ключом ev:session:<материал>:
   <дата>, и удаление отметки её не касалось: в ленте оставался пробег за день,
   которого больше нет. Пока карточка появлялась только в день награды, это
   почти не всплывало; теперь она есть у каждого дня, и призрак — у каждого
   удаления. Убираем только если за этот день у материала не осталось живых
   записей: заходов за день бывает несколько, а карточка одна. */
function dropDayCard(track, key, ds) {
  if (!key) return;
  const id = "ev:session:" + key + ":" + ds;
  const card = (data.thoughts || []).find((t) => t.id === id && !t.deleted);
  if (!card) return;
  card.deleted = true;
  card.updatedAt = now();
}

function dayKeyOf(e, track) {
  if (track === "piano") return e.pieceId || "bwv853";
  if (track === "book") return e.bookId || "snow-1";
  if (track === "pastel") return "pastel";
  return "";                                   // у ролика своей карточки дня нет
}

function stillHasDay(track, key, ds) {
  const list = track === "piano" ? data.piano.entries
    : track === "book" ? data.book.entries
    : track === "pastel" ? data.pastel.entries : [];
  return (list || []).some((x) => !x.deleted && x.date === ds && dayKeyOf(x, track) === key);
}

function dropEntry(e, track) {
  e.deleted = true;
  e.updatedAt = now();
  if (track === "piano") pracForgetDay(e.pieceId || "bwv853", e.date);
  /* У курса откат был забыт: удалишь день — записи нет, а уроки этого дня
     по-прежнему числятся пройденными. Ровно то враньё, от которого пианино
     защитили с самого начала. Ключи «нет» это не трогает: они значат
     «задания в уроке не было», а не дату. */
  /* Ключ курса, а не строка «pastel»: курсов стало несколько, и удаление дня
     у одного гасило шаги другого, а свои оставляло пройденными. */
  if (track === "pastel") pracForgetDay(pracCourseKey(), e.date);
  const key = dayKeyOf(e, track);
  if (key && !stillHasDay(track, key, e.date)) dropDayCard(track, key, e.date);
  saveData();
  schedulePush();
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


function syncPickers() {
  if (!hasMaterials()) return;
  /* Пока открыт лист отметки — не трогаем набранное. Синхронизация приходит
     в любой момент, в том числе посреди возни со степпером, и раньше она
     сбрасывала страницу обратно к прочитанному. Со стороны это выглядело так,
     что «Подтвердить» ничего не записало: день отмечался, награда за серию
     выпадала, а прогресс стоял на месте. */
  if (sheetMode === "log" && sheetOpen()) return;
  if (isBook()) { pickPage = bookProgress(); pickDone = !!book().done; }
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
          /* Только оболочка (keiko-v*): в остальных хранилищах живут видео,
             звук, обложки и записи — обновление их не касается. Раньше
             стиралось всё подряд, и каждое обновление уносило выбранный
             видеофайл: приходилось выбирать заново. */
          const keys = await caches.keys();
          await Promise.all(keys.filter(k => /^keiko-v\d/.test(k)).map(k => caches.delete(k)));
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
  data.thoughts || [], data.archive || [], data.takes || [],
  data.wishes || [], data.gut || []
].map(list => list.length + ":" + list.reduce((m, e) => Math.max(m, e.updatedAt || 0), 0)).join("|")
  + "|";
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

/* Набирают текст — экран не пересобираем. Перерисовка прилетает в любой
   момент: доехал снимок, ответил гист, подтянулась обложка. Вместе с ней
   исчезает поле ввода, и клавиатура закрывается прямо под руками. Держим
   очередь и доигрываем её, когда из поля ушли. */
function typingInView() {
  const el = document.activeElement;
  if (!el || !el.closest) return false;
  const t = (el.tagName || "").toLowerCase();
  if (t !== "textarea" && t !== "input" && !el.isContentEditable) return false;
  return !!el.closest("#view");
}
function flushRender() {
  if (typingInView() || !pendingRender) return;
  const q = pendingRender === "quiet";
  pendingRender = null;
  render(q);
}

function render(quiet) {
  if (railBusy && tab === "home" && !settingsOpen) {
    if (pendingRender !== "loud") pendingRender = quiet ? "quiet" : "loud";
    return;
  }
  if (typingInView()) {
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
    else if (tab === "mus") renderMuseum();
    else if (tab === "diary") { tab = "home"; cfg.tab = "home"; saveCfg(); renderTabbar(); renderHome(); }
    else if (tab === "wish") renderWishes();
    // раздел убран, но вкладка могла остаться сохранённой — уводим на главную
    // профиль сменили — вкладки уже нет, уводим на главную
    else if (tab === "gut") { if (gutOn()) renderGut(); else { tab = "home"; cfg.tab = "home"; saveCfg(); renderTabbar(); renderHome(); } }
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

/* Артефакты живут кнопкой в шапке, рядом с настройками: внизу шесть вкладок
   не помещаются по-человечески, а сюда раздел просится — его открывают реже,
   чем прогресс, но чаще, чем настройки. */
function renderMusBtn() {
  const b = $("#musBtn");
  if (!b) return;
  b.hidden = !musItems().some(musOpen);
  b.classList.toggle("on", tab === "mus");
}

function renderTabbar() {
  $("#tabbar").innerHTML = [
    [ "home", ICON("home", "◉"), T("tabHome")],
    ["progress", ICON("progress", "▤"), T("tabProgress")],
    /* Дневник спрятан: раздел не прижился. Код и записи остаются — уже
       написанные дни по-прежнему всплывают в «мысли дня», а вернуть вкладку
       можно одной строкой. */
    ["notes", ICON("notes", "✎"), T("tabNotes")],
    /* «Достижения» с нижней панели убраны: награды и карточки знаний теперь
       видно в «Моментах», внутри той сессии, где они открылись, а полку
       и карту знаний перенесли в Библиотеку. Экран остался — просто без
       постоянной кнопки. */
    ["wish", ICON("wish", "✧"), `${T("tabWish")} ${wishOpenCount() || ""}${wishesToday().length ? '<i class="tb-dot"></i>' : ""}`],
    ...(gutOn() ? [["gut", "💩", "Какуля"]] : [])
  ].map(([id, ic, nm]) =>
    `<button data-tab="${id}" class="${tab === id ? "on" : ""}" type="button"><i>${ic}</i>${nm}</button>`).join("");
  renderMusBtn();
  syncTabHeight();
  requestAnimationFrame(syncTabHeight);
  document.querySelectorAll("#tabbar button").forEach(b =>
    b.addEventListener("click", () => {
      tab = b.dataset.tab;
      useMark("вкладка-" + tab);
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
  /* Курс попадает на ленту, если в нём есть чем заняться: уроки, этапы или
     просто лист, который рисуешь. Раньше условие было только про уроки, и
     курс без них — а такой теперь «Аргус» — пропадал с главной совсем. */
  for (const c of courses())
    if ((c.lessons || []).length || c.name)
      out.push({ track: "pastel", courseId: c.id, course: c });
  for (const v of videos().filter(v => !v.archived && !v.done)) out.push({ track: "watch", videoId: v.id, video: v });
  /* Завершённая книга уходит с ленты: место тем, что читаешь сейчас. Но если
     завершено вообще всё, показывать пустоту хуже, чем показать закрытое. */
  const live = out.filter((i) => !(i.track === "book" && i.book.done));
  const base = live.length ? live : out;
  /* Материал можно убрать с главной, не отправляя в архив: читаю три книги,
     а на ленте хочу одну. Если спрятать всё, лента опустела бы и приложению
     нечего было бы показать — тогда прячем ничего. */
  const shown = base.filter((i) => !matHidden(libKey(i)));
  return shown.length ? shown : base;
}

/* Ключ материала — тот же, что у строки в библиотеке: «bk:id», «pf:id»,
   «ps», «wt:id». Одно имя на оба места, чтобы глазик и лента говорили
   об одном и том же. (Не путать с railKey — тот про звук.) */
function libKey(i) {
  if (i.track === "piano") return "pf:" + i.pieceId;
  if (i.track === "book") return "bk:" + i.bookId;
  if (i.track === "watch") return "wt:" + i.videoId;
  /* Первый курс жил под ключом «ps» ещё до того, как курсов стало несколько.
     Оставляем его как есть, иначе спрятанный материал вернётся на главную. */
  return i.courseId ? "ps:" + i.courseId : "ps";
}
const matHidden = (key) => !!(data.hidden || {})[key];
function matToggle(key) {
  data.hidden = data.hidden || {};
  if (data.hidden[key]) delete data.hidden[key]; else data.hidden[key] = 1;
  saveData(); schedulePush();
  normalizeActive();
  render();
  toast(matHidden(key) ? "Убрано с главной" : "Вернулось на главную");
}
const hasMaterials = () => railItems().length > 0;

// активным может остаться трек, материалов которого у профиля нет — переставляем на первый доступный
function normalizeActive() {
  const items = railItems();
  if (!items.length) return;
  const ok = items.some(i => i.track === data.active
    && (i.track !== "piano" || i.pieceId === data.piano.activePiece)
    && (i.track !== "book" || i.bookId === data.book.activeBook)
    && (i.track !== "watch" || i.videoId === data.watch.activeVideo)
    && (i.track !== "pastel" || i.courseId === curCourseId()));
  if (ok) return;
  const first = items[0];
  data.active = first.track;
  if (first.pieceId) data.piano.activePiece = first.pieceId;
  if (first.bookId) data.book.activeBook = first.bookId;
  if (first.videoId) data.watch.activeVideo = first.videoId;
  if (first.courseId) data.pastel.activeCourse = first.courseId;
}

function activeRailIndex(items) {
  const i = items.findIndex(it => it.track === data.active &&
    (it.track !== "piano" || it.pieceId === data.piano.activePiece) &&
    (it.track !== "book" || it.bookId === data.book.activeBook) &&
    (it.track !== "watch" || it.videoId === data.watch.activeVideo) &&
    (it.track !== "pastel" || it.courseId === curCourseId()));
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

/* Почему запись не приехала. Раньше срыв проходил молча: в занятии навсегда
   оставалась строка «Запись загружается…», и было не понять, идёт дело
   или встало. */
const audioFail = new Map();
let audioRecheck = false;   // опись уже переспрашивали ради пропавшего звука

async function pullAudio(id, force) {
  if (!cfg.token || !cfg.catalogId || audioPulling.has(id) || audioUrls.has(id)) return;
  /* Срыв больше не навсегда. Раньше одна неудача запрещала повтор до
     перезапуска: у одной вещи звук был, у другой нет, и почему — не сказать.
     Ждём полминуты и пробуем снова, как только до звука снова дойдёт дело. */
  const failedAt = audioFail.get(id) && audioFail.get(id).at;
  if (!force && failedAt && now() - failedAt < 30000) return;
  audioPulling.add(id);
  audioFail.delete(id);
  audioProgress(id, 0);
  try {
    let files = await catalogFiles(false);
    if (!files) throw new Error("каталог недоступен");
    let f = files[CAT_AUDIO_FILE(id)];
    /* Описи бывает столько же лет, сколько сессии: звук, добавленный после её
       чтения, в ней отсутствует, и материал навсегда помечался «без звука».
       Один раз за сессию переспрашиваем опись заново. */
    if (!f && !audioRecheck) {
      audioRecheck = true;
      files = await catalogFiles(true);
      f = files && files[CAT_AUDIO_FILE(id)];
    }
    if (!f) { audioUrls.set(id, ""); return; }        // звука у материала правда нет
    let txt = f.content;
    if ((f.truncated || !txt) && f.raw_url) {
      /* Большое качаем отдельно и с полосой. Гист отдаёт raw неторопливо —
         мегабайт на хорошей сети идёт секунд пять, на мобильной кратно
         дольше, и девяноста секунд файлам в пару мегабайт не хватало: загрузка
         срывалась у самого конца, а звук выглядел «то есть, то нет». */
      const res = await withTimeout(fetch(f.raw_url), 300000);
      txt = await readWithProgress(res, id);
    }
    txt = String(txt || "").trim();
    if (!txt.startsWith("data:")) throw new Error("файл не похож на звук");
    await audioSave(id, txt);
    audioNow = "";                                    // пусть audioSync подхватит заново
    audioSync();
  } catch (e) {
    audioFail.set(id, { why: (e && e.message) || (navigator.onLine ? "не получилось" : "нет сети"), at: now() });
  } finally {
    audioPulling.delete(id);
    audioProgress(id, 1);
    plWait();
  }
}

/* ── Нота в шапке ── */
let audioPct = { id: "", v: 0 };
function audioProgress(id, v) {
  audioPct = { id, v: Math.max(0, Math.min(1, v)) };
  paintSndBtn();
  plWait();                    // в занятии та же полоса, что и на ноте в шапке
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

/* Фон главной — одна настройка на всё: раньше их было четыре, и разница
   между «тихой водой» и «дыханием» ловилась разве что рядом. */
const BG_PRESETS = [
  { id: "breath", name: "Дыхание", hint: "золотая середина", blur: 18,
    cfg: { gain:1.05, gamma:1.15, smooth:0.85, speed:0.75, amp:1.10, bright:1.20, tone:0.85, hit:0.55 },
    layers: [[0.30,0,0.055,2.1,3.7,0.055,1.18,0.55],[0.46,1,0.041,1.6,2.9,0.070,1.00,0.50],
             [0.62,2,0.068,2.7,4.3,0.048,0.84,0.42],[0.78,0,0.033,1.3,2.3,0.085,1.10,0.38]] }
];
const bgPreset = () => BG_PRESETS[0];

async function pullEnvelopes() {
  if (!cfg.token || !cfg.catalogId || ENVEL) return;
  try {
    const files = await catalogFiles(false);
    const txt = await catText(files, ENV_FILE, 30000);
    if (!txt) return;
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
const COVER_BOX = ".cover, .lib-cover, .th-cover, .shelf-cover";
function imgBox(el) {
  const box = el.parentElement;
  return box && box.matches && box.matches(COVER_BOX) ? box : null;
}
function imgSettle(el, ok) {
  el.classList.remove("img-off", "img-on");
  el.classList.add(ok ? "img-on" : "img-off");
  /* У снимков, сделанных до того, как размер стали записывать, узнаём его
     здесь — один раз, тихо, без перерисовки. В следующий раз место под
     картинку будет отведено сразу. */
  if (ok && el.dataset && el.dataset.take && el.naturalWidth) {
    const t = (data.takes || []).find((x) => x.id === el.dataset.take);
    if (t && (!t.w || !t.h)) {
      t.w = el.naturalWidth; t.h = el.naturalHeight; t.updatedAt = now();
      saveData();
    }
  }
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
  /* Карта и справочник — оверлей поверх главной: вкладка при этом остаётся
     «home», и музыка вступала прямо посреди чтения справки. Читают там молча,
     как книгу, и фоновое погружение туда не зовут. */
  const can = cfg.sound && cfg.zen !== false && tab === "home" && !settingsOpen
    && !document.hidden && hasMaterials() && !sheetOpen() && now() > zenHold
    && !prac && !gm;
  if (!can) { if (zenOn) zenExit(); return; }
  if (keep && pending && zenAt) {
    const left = Math.max(0, zenAt - now());
    zenTimer = setTimeout(zenEnter, left);
    return;
  }
  zenAt = now() + ZEN_AFTER;
  zenTimer = setTimeout(zenEnter, ZEN_AFTER);
}
const sheetOpen = () => !!document.querySelector(".sheet.show, .sheet-bg.show");

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

/* Вложение доехало. Раньше здесь стояла полная перерисовка — и не тихая,
   а с анимациями входа: открыл «Моменты», начали подгружаться снимки, и лента
   на каждом из них дёргалась и уезжала к началу. Меняем на месте ровно то,
   что этого вложения и ждало. */
function takeArrived(id) {
  let swapped = 0;
  document.querySelectorAll("[data-media]").forEach((el) => {
    if (el.dataset.media !== id) return;
    const t = (data.thoughts || []).find((x) => !x.deleted && x.mediaId === id);
    if (!t) return;
    el.outerHTML = mediaHTML(t);
    swapped++;
  });
  if (!swapped) { render(true); return; }      // ждали не в ленте — обновим тихо
  // у подменённого снимка обработчика ещё нет: вешаем заново
  document.querySelectorAll("[data-shot-src]").forEach((el) => {
    if (el.dataset.bound) return;
    el.dataset.bound = "1";
    el.addEventListener("click", () => openShotFull(el.dataset.shotSrc, el.dataset.shotWhen));
  });
}

/* Место кончается обязательно: ролик под тридцать мегабайт, записи игры,
   обложки и звук лежат в одном хранилище, и никто ничего не вычищает.
   Отличаем эту беду от прочих, иначе она выдаёт себя за что попало. */
const noRoom = (e) => !!e && (e.name === "QuotaExceededError"
  || e.name === "NS_ERROR_DOM_QUOTA_REACHED"
  || /quota|exceeded|storage/i.test(String(e.message || "")));

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
  takeEtag = "";                                 // опись устарела: в гисте прибавилось
}

/* Опись вложений читаем один раз за сессию. Гист-апи на запрос одного файла
   присылает содержимое всех разом — всё, что меньше мегабайта, а записи игры
   в base64 как раз обычно меньше. Открыл «Моменты», где не хватает пяти
   записей, — и это было пять полных скачиваний всей коллекции. Каталог давно
   ходит правильно, сюда приём просто не доехал.

   Содержимое из описи выбрасываем, как только файл лёг в хранилище: держать
   мегабайты base64 в памяти незачем. */
let takeFiles = null, takeEtag = "";

async function takesIndex(force) {
  const gid = (data && data.takesId) || cfg.takesId;
  if (!cfg.token || !gid) return null;
  if (takeFiles && !force) return takeFiles;
  const cond = takeEtag && takeFiles ? { headers: { "If-None-Match": takeEtag } } : {};
  const r = await gh("/gists/" + gid, cond);
  if (r.status === 304) return takeFiles;
  if (!r.ok) return takeFiles;                   // связи нет — работаем тем, что было
  takeEtag = r.headers.get("etag") || "";
  takeFiles = (await r.json()).files || {};
  return takeFiles;
}

async function takePull(id) {
  const gid = (data && data.takesId) || cfg.takesId;
  if (!cfg.token || !gid || takeUrls.has(id) || takeBusy.has(id)) return;
  const failedAt = takeFail.get(id) || 0;
  if (now() - failedAt < 20000) return;          // сорвалось только что — подождём
  takeBusy.add(id);
  takeProgress(id, 0);
  try {
    let files = await takesIndex(false);
    let f = files && files[TAKE_FILE(id)];
    // нет в описи — могли положить с другого устройства уже после того, как мы её взяли
    if (!f) { files = await takesIndex(true); f = files && files[TAKE_FILE(id)]; }
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
    if (takeFiles && takeFiles[TAKE_FILE(id)]) takeFiles[TAKE_FILE(id)].content = "";
    takePct.delete(id);
    takeArrived(id);
    takeFail.delete(id);
  } catch {
    takePct.delete(id); takeFail.set(id, now());
  } finally { takeBusy.delete(id); }
}

/* Удаление вложения раньше не удаляло ничего: запись пропадала из ленты, а
   файл оставался и на телефоне, и в гисте — навсегда. И за его содержимое
   приходилось платить трафиком при каждом первом чтении описи. */
async function takeDrop(id) {
  if (!id) return;
  try { (await takesBox()).delete(takeKey(id)); } catch {}
  const u = takeUrls.get(id);
  if (u) URL.revokeObjectURL(u);
  takeUrls.delete(id); takePct.delete(id); takeFail.delete(id);

  const gid = (data && data.takesId) || cfg.takesId;
  if (!cfg.token || !gid) return;
  try {
    // гист удаляет файл, если прислать ему null вместо содержимого
    await gh("/gists/" + gid, { method: "PATCH",
      body: JSON.stringify({ files: { [TAKE_FILE(id)]: null } }) });
    if (takeFiles) delete takeFiles[TAKE_FILE(id)];
    takeEtag = "";
  } catch {}
}

/* Разовая уборка сирот: файлы, на которые уже никто не ссылается. Копились они
   всё время, пока удаление ничего не удаляло. Трогаем только хранилище на
   телефоне — в гисте файл может быть нужен второму устройству, чьи записи сюда
   ещё не доехали, и стирать его по здешнему неведению нельзя. */
async function takesSweep() {
  if (!window.caches || !data) return;
  try {
    const живые = new Set();
    for (const t of (data.thoughts || [])) if (!t.deleted && t.mediaId) живые.add(t.mediaId);
    for (const t of (data.takes || [])) if (!t.deleted) живые.add(t.id);
    const box = await takesBox();
    for (const req of await box.keys()) {
      const id = decodeURIComponent(req.url.split("/").pop());
      if (живые.has(id)) continue;
      await box.delete(req);
      const u = takeUrls.get(id);
      if (u) URL.revokeObjectURL(u);
      takeUrls.delete(id);
    }
  } catch {}
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
  useMark("запись-игры");
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


/* Размер снимка узнаём сразу и держим при записи: по нему лента отводит
   место под картинку заранее, и её приезд ничего не двигает. */
function imgSize(blob) {
  return new Promise((res) => {
    const url = URL.createObjectURL(blob);
    const im = new Image();
    im.onload = () => { res({ w: im.naturalWidth, h: im.naturalHeight }); URL.revokeObjectURL(url); };
    im.onerror = () => { res(null); URL.revokeObjectURL(url); };
    im.src = url;
  });
}

async function saveTake(blob, ms, kind) {
  const id = uid();
  const t = { id, srcId: curKey(), track: data.active, kind: kind || "audio",
    title: currentMaterial().title, at: now(), ms: Math.round(ms || 0),
    createdAt: now(), updatedAt: now() };
  if ((kind || "") === "photo") {
    const d = await imgSize(blob).catch(() => null);
    if (d && d.w && d.h) { t.w = d.w; t.h = d.h; }
  }
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
  const have = coverCache.get(id);
  if (have) return have;
  const c = catOf(id);
  /* Пробуем достать обложку и тогда, когда материала ещё нет в описи: файл в
     каталоге появляется раньше записи о нём, а промах стоит одного запроса.
     Раньше здесь стоял ранний выход, и новый материал оставался без картинки,
     пока опись не обновят руками. */
  if (!coverCache.has(id) && (!c || c.cover)) { coverCache.set(id, ""); coverAsk(id); }
  return fallback || "";
}

// обложка любого материала — не зависит от активного трека
function coverOf(item) {
  if (item.track === "book") {
    const b = item.book || book();
    const src = coverSrc(b.id, b.cover);
    if (src) return `
      <div class="cover photo" style="aspect-ratio:${esc(b.ratio || "3 / 4.4")}">
        <img src="${esc(src)}" data-cov="${esc(b.id)}" alt="" width="465" height="720" decoding="async" fetchpriority="high">
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
          ${src ? `<img src="${esc(src)}" data-cov="${esc((item.video || video() || {}).id || "")}" alt="" loading="lazy" decoding="async">` : `<div class="cv-mark">🎬</div>`}
        </div>
      </div>`;
  }
  if (item.track === "pastel") {
    const c = item.course || course();
    /* На обложке вместо слова «курс» — сколько всего уроков: материал один и
       пополняется, и полезнее видеть его размер, а не подпись «Первый курс».
       Но материал может сказать про себя иначе: у «Аргоса» сверху стоит
       «рисую», потому что урок там один и считать нечего. */
    const n = (c.lessons || []).filter(l => !l.hidden).length;
    const sub = c.top || (n ? n + " " + plural(n, "урок", "урока", "уроков") : "");
    // у курса обложка тоже может лежать в каталоге — раньше эту ветку пропускали
    const ck = keyOfCourse(c);
    const csrc = coverSrc(ck, c.cover || "");
    if (csrc) return `
      <div class="cover photo titled" style="aspect-ratio:${esc(c.ratio || "3 / 4.1")}">
        <img src="${esc(csrc)}" data-cov="${esc(ck)}" alt="" loading="lazy" decoding="async">
        <div class="cv-over">
          <div class="cv-author">${esc(sub)}</div>
          <div>
            <div class="cv-title">${esc(c.name)}</div>
            ${c.note ? `<div class="cv-sub">${esc(c.note)}</div>` : ""}
          </div>
        </div>
      </div>`;
    return `
      <div class="cover pastel">
        <div><div class="cv-author">${esc(sub)}</div></div>
        <div class="smears"><i></i><i></i><i></i><i></i></div>
        <div>
          <div class="cv-title">${esc(c.name)}</div>
          <div class="cv-sub">${esc(c.note || c.lessons.length + " уроков")}</div>
        </div>
      </div>`;
  }
  const p = item.piece;
  const psrc = coverSrc(p.id, p.cover);
  if (psrc) return `
    <div class="cover photo" style="aspect-ratio:${esc(p.ratio || "3 / 4.4")}">
      <img src="${esc(psrc)}" data-cov="${esc(p.id)}" alt="" width="509" height="720" decoding="async" fetchpriority="high">
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
  : it.track === "pastel" ? keyOfCourse(it.course || course()) : it.pieceId;

function coverRailHTML() {
  const items = railItems();
  const n = items.length;
  const idx = activeRailIndex(items);
  /* Копии нужны только для бесшовного цикла, а цикл имеет смысл от трёх
     материалов. При одном листать нечего, при двух это просто «туда-сюда»:
     копии там показывали одни и те же обложки по кругу и сбивали с толку. */
  const copies = n > 2 ? RAIL_COPIES : 1;
  const mid = n > 2 ? RAIL_MID : 0;
  let html = "";
  for (let copy = 0; copy < copies; copy++) {
    items.forEach((it, i) => {
      const on = copy === mid && i === idx;
      html += `<div class="slot ${on ? "on" : ""}" data-i="${i}" data-pos="${copy * n + i}">${coverOf(it)}`
        + `<span class="cov-snd" data-snd="${esc(railKey(it))}" role="button" aria-label="Музыка грузится">`
        + `<svg viewBox="0 0 36 36" aria-hidden="true">`
        + `<circle class="sn-track" cx="18" cy="18" r="15"></circle>`
        + `<circle class="sn-bar" cx="18" cy="18" r="15"></circle></svg><i>♪</i></span></div>`;
    });
  }
  return `<div class="rail${n > 1 ? "" : " one"}" id="rail">${html}</div>`;
}

function ringHTML(pct, знак) {
  const r = 52, c = 2 * Math.PI * r;
  const on = c * Math.min(1, pct / 100);
  return `
    <div class="ring-wrap">
      <svg class="ring" width="128" height="128" viewBox="0 0 128 128">
        <circle class="bg" cx="64" cy="64" r="${r}"></circle>
        ${pct > 0 ? `<circle class="fg" cx="64" cy="64" r="${r}" stroke-dasharray="${on.toFixed(1)} ${c.toFixed(1)}"></circle>` : ""}
      </svg>
      <div class="ring-txt"><b>${знак || Math.round(pct) + "%"}</b></div>
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
  if (isCourse() && plainDraw()) {
    const n = s.days;
    return subLine(course().done ? "Рисунок закончен" : "Рисую",
      n ? `${n} ${plural(n, "день", "дня", "дней")} за листом` : "ещё ни одного дня");
  }
  if (isCourse()) {
    const at = lessonNext();
    return subLine(at ? (lessons()[at.i] || {}).title || "" : "Курс пройден",
      courseSize());
  }
  return subLine(`𝄞 ${Math.round(s.pctR)}%`, `𝄢 ${Math.round(s.pctL)}%`);
}

function renderHome() {
  if (!hasMaterials()) { renderEmpty("Здесь появятся материалы", "Пока не добавлено ни одного: ни пьесы, ни книги, ни курса."); return; }
  const s = curStats();
  const g = goalProgress();
  const doneToday = !!entryFor(todayStr());
  const ach = achState();
  const open = ach.filter(a => a.done).length;

  const sub = heroSub(s);

  const nudge = "";

  const wt = wishesToday();
    const кнопки = bookBtnState();   // обе кнопки — из одного снимка
$("#view").innerHTML = `
    ${wt.length ? `
      <button class="wish-banner" id="wishTodayGo" type="button">
        <i>✧</i><span><b>${esc(wt[0].text)}${wt.length > 1 ? " · ещё " + (wt.length - 1) : ""}</b>
        <em>хотел сегодня</em></span><span class="go">›</span>
      </button>` : ""}
    <div class="hero">
      ${coverRailHTML()}
      ${ringHTML(shownPct(s), noPct() ? "—" : "")}
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
            : (isBook() ? T("ctaBook") : isWatch() ? T("ctaWatch") : isPastel() && lessons().length ? T(courseWatch() ? "ctaLessonSeen" : "ctaLessonGo") : isPastel() && plainDraw() ? T("ctaDraw") : isCourse() ? T("ctaPastel") : T("ctaPiano"))}
      </button>
        <button class="cta-side" id="bookMapBtn" type="button" ${кнопки.map.on ? "" : "hidden"}
          aria-label="${isPiano() ? "Справочник по тактам" : "Карта мест"}"
          title="${isPiano() ? "Справочник по тактам" : "Карта мест"}">${isPiano() ? "📖" : "🗺"}</button>
        <button class="cta-side" id="askBtn" type="button" ${isBook() && hasBookFile(book()) ? "" : "hidden"}
          aria-label="Непонятное слово" title="Непонятное слово">❓</button>
      </div>
      <div class="nudge">${nudge}</div>
    </div>`;

  syncBookBtns();        // состояние кнопок — из живых данных, а не из момента сборки строки
  artsPeek();            // на первом же показе книги проверяем, есть ли разбор
  const bm = $("#bookMapBtn");
  if (bm) bm.addEventListener("click", () => openPlaceMap(mapMaterial() || book(), -1));
  const ab = $("#askBtn");
  if (ab) ab.addEventListener("click", openAskSheet);

  const wtGo = $("#wishTodayGo");
  if (wtGo) wtGo.addEventListener("click", () => {
    tab = "wish"; cfg.tab = "wish"; saveCfg();
    wishFilter = "open";
    render();
  });
  $("#ctaBtn").addEventListener("click", () => {
    if (!gistReady()) { openSettingsSheet(); return; }
    selectedDate = todayStr();
    /* У пьесы кнопка открывает занятие по плану: оно само поставит отметку
       в конце. Ручной путь остаётся на «дополнить», когда день уже отмечен. */
    /* У пьесы кнопка всегда ведёт в занятие — и когда день ещё не отмечен,
       и когда уже отмечен: второе занятие за день это нормально, отрезки
       допишутся в ту же запись. Ручная шторка остаётся у остальных треков. */
    if (isPiano() && piece().bars) { openPractice(); return; }
    if (isPastel() && plainDraw()) { openLogSheet(); return; }
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
  const loop = n > 2;   // цикл с копиями — только от трёх материалов

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
    if (!loop) return pos;                       // без копий переносить некуда
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
    centerOn: (baseIdx, smooth) => centerOn(baseIdx + (loop ? RAIL_MID * n : 0), smooth),
    spinTo,
    indexOfTrack: (track) => items.findIndex(it => it.track === track),
    indexOf: (track, id) => items.findIndex(it =>
      it.track === track && (!id || it.pieceId === id || it.bookId === id))
  };

  centerOn(activeRailIndex(items) + (loop ? RAIL_MID * n : 0), false);
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
    (item.track !== "watch" || data.watch.activeVideo === item.videoId) &&
    (item.track !== "pastel" || curCourseId() === item.courseId);
  if (same) return;

  data.active = item.track;
  if (item.pieceId) data.piano.activePiece = item.pieceId;
  if (item.bookId) data.book.activeBook = item.bookId;
  if (item.videoId) data.watch.activeVideo = item.videoId;
  if (item.courseId) data.pastel.activeCourse = item.courseId;
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

/* Кнопка карты живёт в разметке всегда и только прячется: лента свайпается без
   полной перерисовки, и созданная на лету кнопка оставалась бы от прошлой
   обложки — «то появляется, то исчезает». Состояние считается одним снимком,
   потому что файл с местами доезжает когда придётся. */
/* Подложка нужна только под метки: без неё точку некуда поставить. Если же у
   книги одни справки и ни одного географического места, карта — это список, и
   требовать под него картинку мира незачем. */
const mapHasPlaces = (b) => mapWhole(b).some((p) => !p.kind || p.kind === "place");
/* Карта умеет книгу: у той есть id, главы и название. Пьесе это подаётся в том
   же виде — главами становятся блоки по четыре такта, которые и так посчитаны
   для разбора. Так справочник едет вместе с разбором: дошёл до тактов 5–8 —
   открылось то, что в них встретилось. */
function mapMaterial() {
  if (isBook()) return book();
  if (isPiano() && piece().bars) {
    const p = piece();
    return { id: p.id, title: p.name,
             chapters: pracBlocks().map((bl) => ({ name: `Такты ${bl.from}–${bl.to}`, from: bl.from })) };
  }
  return null;
}
const mapBtnOn = () => {
  const m = mapMaterial();
  return !!m && mapWhole(m).length > 0 && (!!mapBox(m) || !mapHasPlaces(m));
};

function bookBtnState() {
  return { map: { on: mapBtnOn() } };
}

function syncBookBtns() {
  const map = document.getElementById("bookMapBtn");
  if (map) map.hidden = !bookBtnState().map.on;
}

/* Разбор материала спрашиваем сами, не дожидаясь каталога. Каталог носит лишь
   флажок «файл есть», и пока он не доехал, кнопки не было — а узнать правду
   можно прямым запросом за один заход. Спрашиваем раз на материал за сессию и
   только если файла ещё нет на устройстве. */
const GM_MAX = 60;                    // докуда пускаем увеличение карты
const artsAsked = new Map();          // материал → когда спрашивали в последний раз
function artsPeek() {
  /* Спрашиваем для любого материала, у которого бывает карта, а не только для
     книги: у пьесы файл разбора не скачивался вовсе, и кнопка справочника не
     появлялась — данных для неё просто не было. */
  const м = mapMaterial();
  const id = м && м.id;
  if (!id || artsOf(id)) return;
  /* На запуске адрес гиста ещё не известен, и первый заход всегда пустой.
     Поэтому неудача не запоминается навсегда: пробуем снова, но не чаще
     чем раз в двадцать секунд. */
  const было = artsAsked.get(id) || 0;
  if (now() - было < 20000) return;
  artsAsked.set(id, now());
  pullArts(id).then((новое) => {
    if (!новое) { artsAsked.set(id, 0); return; }   // не приехало — можно пробовать снова
    const где = mapMaterial();
    if (!где || где.id !== id) return;              // пока ехало, ушли на другой материал
    syncBookBtns();
  }).catch(() => artsAsked.set(id, 0));
}

function updateHeroInfo() {
  const s = curStats();
  const doneToday = !!entryFor(todayStr());

  // содержимое кольца меняем внутри элемента: пересоздание запускало анимацию появления заново
  const ring = $(".ring-wrap");
  if (ring) {
    const tmp = document.createElement("div");
    tmp.innerHTML = ringHTML(shownPct(s), noPct() ? "—" : "");
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
        : (isBook() ? T("ctaBook") : isWatch() ? T("ctaWatch") : isPastel() && lessons().length ? T(courseWatch() ? "ctaLessonSeen" : "ctaLessonGo") : isPastel() && plainDraw() ? T("ctaDraw") : isCourse() ? T("ctaPastel") : T("ctaPiano"));
  }

  /* Обе кнопки разом. Здесь и была та самая нестабильность: лента свайпается
     без полной перерисовки, и эта функция правила только кнопку разбора.
     Перелистнул с «Одиссеи» на «В лесах Сибири» — разбор превращался в карту,
     а отдельная кнопка карты оставалась висеть от «Одиссеи», и карт делалось
     две. В обратную сторону выходило зеркально: у «Одиссеи» карта не
     появлялась, потому что от прошлой книги осталось «скрыта». */
  syncBookBtns();
  artsPeek();          // вдруг разбор есть, а каталог об этом ещё не сказал

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
  /* Рисование считается сессиями: у курса без уроков и этапов каждая отметка
     и есть подход за листом, и складывать там нечего, кроме них самих. */
  const первый = firstCourseId();
  const простой = (id) => {
    const c = courses().find((x) => x.id === (id || первый));
    return !!c && !(c.lessons || []).length;
  };
  const draws = pastel.filter((e) => простой(e.courseId)).length;

  const watchList = watchEntries().filter(inRange);
  const watched = watchList.length;

  const days = new Set([...piano, ...bookList, ...pastel, ...watchList].map(e => e.date)).size;
  const tracks = new Set([
    ...(piano.length ? ["piano"] : []),
    ...(bookList.length ? ["book"] : []),
    ...(pastel.length ? ["pastel"] : []),
    ...(watchList.length ? ["watch"] : [])
  ]);
  return { days, bars, pages, lessons, draws, watched, tracks,
           entries: piano.length + bookList.length + pastel.length + watchList.length };
}

/* ── Когда материал кончится ──
   Считаем одно число: сколько единиц выходит в день. Раньше считались два —
   «сколько за заход» и «раз в сколько дней заходишь» — и брались они из
   разных окон: прирост по последним восьми заходам, ритм по последнему
   двадцать первому дню. Две оценки перемножались, и ошибка перемножалась
   тоже. На дочитанной книге такой прогноз промахивался в среднем на 2,4 дня,
   на скорости в день — на 1,75, и устойчивое ускорение замечал на день
   позже.

   Главное же не в точности: прогноз здесь — не отчёт, а обратная связь.
   Хорошо почитал вечером — дата должна заметно придвинуться сегодня же, а не
   через неделю. Медиана прироста, стоявшая тут раньше, для этого не годится:
   ей нужно большинство новых заходов, чтобы шелохнуться, и на больших вечерах
   дата не двигалась вовсе. */
// медиана устойчивее среднего: один марафон на полкниги не должен задирать прогноз
const median = (a) => {
  const q = a.slice().sort((x, y) => x - y), m = Math.floor(q.length / 2);
  return q.length % 2 ? q[m] : (q[m - 1] + q[m]) / 2;
};

/* Окно — последние пять заходов, а не последние N дней: так оно само
   подстраивается под ритм. Кто читает каждый вечер, у того окно недельное,
   кто садится по выходным — почти месячное, и меряются оба честно. */
const RECENT = 5;
/* Один рывок не выдаёт себя за новый темп: заход, обогнавший обычный больше
   чем втрое, засчитывается за три обычных. Прочитал полкниги за вечер — дата
   заметно придвинется, но не станет «завтра закончишь». */
const BURST = 3;

/* Сколько единиц в день выходит по последним заходам. С «всю» — по всей
   истории: это запасной ход, когда в окне не прибавилось ничего. */
function paceRate(ряд, старт, всю) {
  if (!ряд.length) return 0;
  const i = всю ? 0 : Math.max(0, ряд.length - RECENT);
  const база = i > 0 ? ряд[i - 1].n : старт;
  const откуда = i > 0 ? ряд[i - 1].d : ряд[0].d;
  /* Срок меряем до сегодня, а не до последнего захода. Пока не открываешь
     материал, дни идут, скорость падает и дата честно уезжает; вернёшься —
     подтянется обратно. Ничего не надо ни объявлять, ни сбрасывать.
     Когда окно достало до самого начала, первый день тоже входит в срок:
     иначе два вечера подряд читались бы как «сорок страниц за один день». */
  const дни = Math.max(1, daysBetween(откуда, todayStr()) + (i > 0 ? 0 : 1));
  const шаги = [];
  let было = база;
  for (const r of ряд.slice(i)) { if (r.n > было) шаги.push(r.n - было); было = r.n; }
  if (!шаги.length) return 0;
  const потолок = шаги.length >= 3 ? median(шаги) * BURST : Infinity;
  return шаги.reduce((s, x) => s + Math.min(x, потолок), 0) / дни;
}

function paceForecast() {
  const list = entries().slice().sort((a, b) => a.date < b.date ? -1 : 1);
  if (!list.length) return null;

  // ряд: на какую дату сколько всего сделано
  let ряд = [], старт = 0, unit = "", total = 0;

  if (isBook()) {
    const b = book();
    total = b.pages;
    unit = "page";
    старт = b.startPage || 0;
    let page = старт;
    for (const e of list) { page = Math.max(page, e.page || 0); ряд.push({ d: e.date, n: page }); }
  } else if (isWatch()) {
    return null;
  } else if (isCourse()) {
    /* Курс меряем минутами, а не уроками. Прирост берём по дням из courseTime —
       из того же, что рисует полоску: иначе срок и процент говорили бы разное.
       Раньше здесь считались уроки штуками, и после двух трёхминутных роликов
       приложение обещало конец курса через шесть заходов, хотя впереди лежало
       три с половиной часа из четырёх. */
    const t = courseTime();
    if (t.totalSec) {
      unit = "minute";
      total = Math.round(t.totalSec / 60);
      let сумма = 0;
      for (const d of Object.keys(t.поДням).sort()) { сумма += t.поДням[d]; ряд.push({ d, n: Math.round(сумма / 60) }); }
      // длительностей нет ни у одного дня, а пройденное есть — хотя бы одна точка
      if (!ряд.length && t.doneSec > 0) ряд.push({ d: list[list.length - 1].date, n: Math.round(t.doneSec / 60) });
    } else {
      total = course().lessons.length;
      unit = "lesson";
      const seen = new Set();
      for (const e of list) { for (const i of e.lessons || []) seen.add(i); ряд.push({ d: e.date, n: seen.size }); }
    }
  } else {
    /* Цель — не «задеть все такты», а закрыть все шаги: чтение и игру каждым
       ключом, потом вместе, и сшивку блока. Считаем по заходам занятия, а не
       по отрезкам в записях: отрезки остались от прошлой схемы и врали. */
    const bars = piece().bars;
    total = 0;
    for (const bl of pracBlocks()) {
      for (let b = bl.from; b <= bl.to; b++)
        for (const st of barSteps(b)) total += stepGoal(b, st);
      total += REP_GOAL;                            // сшивка блока весит как шаг
      if (runNeeded(bl)) total += REP_GOAL;         // и прогон с начала
    }
    unit = "bar";
    // когда какой заход был — по дням; финал блока считается только зачтённый
    const поДням = {};
    for (let b = 1; b <= bars; b++)
      for (const st of barSteps(b)) {
        let n = 0;
        for (const r of repsOf(b, st)) {
          if (n++ >= stepGoal(b, st)) break;
          if (r.d) поДням[r.d] = (поДням[r.d] || 0) + 1;
        }
      }
    for (const bl of pracBlocks()) {
      if (finalPassed(bl)) {
        const посл = finalOf(bl)[finalOf(bl).length - 1];
        if (посл && посл.d) поДням[посл.d] = (поДням[посл.d] || 0) + REP_GOAL;
      }
      if (runNeeded(bl) && runPassed(bl)) {
        const посл = runOf(bl)[runOf(bl).length - 1];
        if (посл && посл.d) поДням[посл.d] = (поДням[посл.d] || 0) + REP_GOAL;
      }
    }
    let сумма = 0;
    for (const d of Object.keys(поДням).sort()) { сумма += поДням[d]; ряд.push({ d, n: сумма }); }
  }

  const done = ряд.length ? ряд[ряд.length - 1].n : старт;
  const left = Math.max(0, total - done);
  if (!left) return { left: 0, rate: 0, days: 0, unit, done: true };
  if (!ряд.length) return null;

  /* Если в окне не прибавилось ничего — последние заходы были повторением, —
     меряем по всей истории: показать хоть какой-то срок честнее, чем молчать. */
  const темп = paceRate(ряд, старт) || paceRate(ряд, старт, true);
  if (!темп) return null;

  return { left, rate: темп, days: Math.max(1, Math.ceil(left / темп)), unit, done: false };
}

// последний день материала заслуживает своего слова, а не общего «закрыт»
const FINISH_WORD = { page: "книга дочитана", lesson: "курс пройден",
  minute: "курс пройден", bar: "пьеса разобрана" };

/* Сколько ещё идти. Дата отвечает «когда», а хочется знать «долго ли» — это
   разные вопросы, и на второй числом не ответишь: «осталось 34 дня» надо
   переводить в голове. Говорим так, как сказал бы человек, и нарочно
   приблизительно: точность тут всё равно мнимая. */
const MONTHS_WORD = ["", "один", "два", "три", "четыре", "пять", "шесть",
  "семь", "восемь", "девять", "десять", "одиннадцать"];

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн",
                      "июл", "авг", "сен", "окт", "ноя", "дек"];
const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/* Сколько осталось — на глазок, а не датой. Точное число через два месяца
   всё равно неправда: темп меняется, и завтра прогноз будет другим. Дальше
   срок — грубее слова. */
function humanLeft(days) {
  if (days <= 2)   return "остался день-другой";
  if (days <= 5)   return "осталось несколько дней";
  if (days <= 10)  return "ещё неделя";
  if (days <= 18)  return "ещё пара недель";
  if (days <= 25)  return "ещё недели три";
  if (days <= 45)  return "ещё примерно месяц";
  if (days <= 75)  return "ещё месяца два";
  if (days <= 110) return "ещё месяца три";
  if (days <= 200) return "ещё месяцев пять";
  return "ещё больше года";
}

/* Срок словами. Чем он дальше, тем грубее формулировка: точная дата через два
   месяца — ложная точность. */
function humanWhen(d, days) {
  const gen = MONTHS_GEN[d.getMonth()];
  const year = d.getFullYear() !== new Date().getFullYear() ? " " + d.getFullYear() : "";

  if (days <= 7) return "закончишь на этой неделе";
  if (days <= 24) return `примерно к ${d.getDate()} ${gen}`;
  const part = d.getDate() <= 10 ? "началу" : d.getDate() <= 20 ? "середине" : "концу";
  return `примерно к ${part} ${gen}${year}`;
}

/* Близкий срок понятнее словами, далёкий — месяцем. «Ещё месяца два» не даёт
   представить дату, а «примерно к концу октября» — даёт: видно, куда это
   попадает в жизни. Точный день на таком расстоянии всё равно ложная
   точность, поэтому месяц делится на начало, середину и конец. */
const paceText = (w) => w.days <= 14 ? humanLeft(w.days) : humanWhen(w.when, w.days);

/* Единственное место, где прогноз превращается в дату. Пропустил день —
   назавтра дата сдвинется, и это нормально. */
function paceWhen(f) {
  if (!f || f.done) return null;
  const days = f.days;
  const when = new Date();
  when.setDate(when.getDate() + days);
  return { days, when, text: humanWhen(when, days) };
}

function paceHTML() {
  /* У рисунка нет срока: конца, к которому он идёт, никто не назначал. Дни же
     стоят строкой выше — «Рисую · 1 день за листом», — и повторять их под ней
     незачем. Молчим. */
  if (isCourse() && plainDraw()) return "";
  const f = paceForecast();
  if (!f) return "";
  if (f.done) return `<span class="pace">Материал пройден 🎉</span>`;
  /* Не «сколько осталось занятий» — это цифра, с которой нечего делать, — а
     сколько уже позади и сколько примерно ещё. Число занятий впереди меняется
     от каждого захода и потому только раздражает; день, который идёт сейчас,
     наоборот, растёт и никуда не девается. */
  const w = paceWhen(f);
  /* «7 дн. из 12»: сколько дней занимался и сколько прошло с первого захода.
     Порознь эти числа мало что говорят, а вместе объясняют скорость: пять
     дней книга просто лежала — оттого за вечер и выходит девятнадцать
     страниц, а в день одиннадцать. Пропуски в первое число не идут, они и не
     считаются занятием. */
  return `<span class="pace">${subLine(paceDays(), paceText(w))}</span>`;
}

/* «7 дней с книгой» — сколько дней ты к ней возвращался. Число одно и только
   растёт: сел — стало восемь, и так после любого перерыва. Это и есть то,
   что приятно видеть, — не «как быстро», а что возвращаешься.

   Знаменатель тут стоял («7 из 12») и убран. Отношение к календарю нельзя
   отыграть назад: пропустил неделю — доля просела навсегда, потому что в
   прошлое не вернёшься, и дальше она только падает, как ни занимайся. Счёт
   же дней растёт с каждым возвращением, в том числе после месяца тишины.
   А что материал стоит, скажет соседнее слово, и скажет прямо. */
function paceDays() {
  const n = curStats().days || 0;
  return n ? `${n} ${plural(n, "день", "дня", "дней")}` : "";
}


/* Опорная дата выбранного периода: понедельник его недели или первое число
   его месяца. Всё остальное — границы, точки графика, прошлый период —
   считается от неё, а не от «сегодня». */
function periodAnchor(сдвиг = shift) {
  const d = new Date();
  if (period === "year") return new Date(d.getFullYear() + сдвиг, 0, 1);
  if (period === "month") return new Date(d.getFullYear(), d.getMonth() + сдвиг, 1);
  const monday = mondayOf(d);
  monday.setDate(monday.getDate() + сдвиг * 7);
  return monday;
}

// границы выбранного периода — вся неделя или весь месяц
function periodRange() {
  const a = periodAnchor();
  if (period === "year") {
    return { from: dateStr(new Date(a.getFullYear(), 0, 1)),
             to: dateStr(new Date(a.getFullYear(), 11, 31)) };
  }
  if (period === "month") {
    return {
      from: dateStr(new Date(a.getFullYear(), a.getMonth(), 1)),
      to: dateStr(new Date(a.getFullYear(), a.getMonth() + 1, 0))
    };
  }
  const sunday = new Date(a); sunday.setDate(sunday.getDate() + 6);
  return { from: dateStr(a), to: dateStr(sunday) };
}

/* Чем меряем график. «Занятия» — сколько раз садился, остальное — сколько
   сделано: страницы, такты, сессии за листом. Показатель хранится в настройках
   и переживает перезаход. */
const METRICS = [
  { id: "entries", name: "Занятия", word: (n) => plural(n, "занятие", "занятия", "занятий") },
  { id: "pages",   name: "Страницы", word: (n) => plural(n, "страница", "страницы", "страниц") },
  { id: "bars",    name: "Такты",   word: (n) => plural(n, "такт", "такта", "тактов") },
  { id: "draws",   name: "Рисунок", word: (n) => plural(n, "сессия", "сессии", "сессий") },
];
const metricNow = () => METRICS.find((m) => m.id === cfg.metric) || METRICS[0];

/* Точки графика: дни недели, дни месяца или месяцы года — включая те, что
   ещё впереди. Значение берём по выбранному показателю. */
function periodSeries() {
  const out = [];
  const today = todayStr();
  const поле = metricNow().id;
  const мера = (a, b) => rangeStats(a, b)[поле] || 0;

  if (period === "year") {
    const y = periodAnchor().getFullYear();
    for (let m = 0; m < 12; m++) {
      const от = dateStr(new Date(y, m, 1)), до = dateStr(new Date(y, m + 1, 0));
      out.push({ ds: от, label: m % 2 === 0 ? MONTHS_SHORT[m] : "", value: мера(от, до),
        today: до >= today && от <= today, future: от > today });
    }
    return out;
  }

  if (period === "month") {
    const d = periodAnchor();
    const total = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    for (let i = 1; i <= total; i++) {
      const ds = dateStr(new Date(d.getFullYear(), d.getMonth(), i));
      out.push({ ds, label: (i === 1 || i % 5 === 0) ? String(i) : "", value: мера(ds, ds),
        today: ds === today, future: ds > today });
    }
    return out;
  }

  const monday = periodAnchor();
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(d.getDate() + i);
    const ds = dateStr(d);
    out.push({ ds, label: DOW[i], value: мера(ds, ds), today: ds === today, future: ds > today });
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

/* ── Весь прошлый период ──
   Сравниваем неделю с неделей целиком, а месяц — с месяцем целиком. Так и
   читается: «на прошлой неделе 59 страниц, на этой пока 0». Плата за это —
   в начале недели показатель всегда в минусе, пока не догонишь прошлый
   результат; зато число рядом то самое, которое ты помнишь. */
function prevSlice(r) {
  const a = periodAnchor(shift - 1);
  if (period === "year") {
    return { from: dateStr(new Date(a.getFullYear(), 0, 1)),
             to: dateStr(new Date(a.getFullYear(), 11, 31)) };
  }
  if (period === "month") {
    return { from: dateStr(new Date(a.getFullYear(), a.getMonth(), 1)),
             to: dateStr(new Date(a.getFullYear(), a.getMonth() + 1, 0)) };
  }
  const to = new Date(a); to.setDate(to.getDate() + 6);
  return { from: dateStr(a), to: dateStr(to) };
}

/* Подпись недели датами: «11–17 августа». Месяц пишем один раз, если неделя
   в него укладывается, — «28 июля — 3 августа» иначе. */
function weekCap(monday) {
  const вс = new Date(monday); вс.setDate(вс.getDate() + 6);
  const мес = (d) => MONTHS_GEN[d.getMonth()];   // «11–17 августа», а не «август»
  const год = вс.getFullYear() !== new Date().getFullYear() ? " " + вс.getFullYear() : "";
  return monday.getMonth() === вс.getMonth()
    ? `${monday.getDate()}–${вс.getDate()} ${мес(вс)}${год}`
    : `${monday.getDate()} ${мес(monday)} — ${вс.getDate()} ${мес(вс)}${год}`;
}

/* Куда можно шагнуть. Вперёд — не дальше текущего периода, назад — не дальше
   первой записи: пустые недели до начала занятий листать незачем. */
function canShift(куда) {
  if (куда > 0) return shift < 0;
  /* Все записи всех занятий, а не entries(): та функция отдаёт только
     активный материал, и с новой книгой стрелка назад гасла, хотя записи
     по другим занятиям есть за месяцы. */
  const все = [...data.piano.entries, ...data.book.entries, ...data.pastel.entries, ...watchEntries()]
    .filter((e) => !e.deleted).map((e) => e.date).sort();
  if (!все.length) return false;
  const a = periodAnchor(shift - 1);
  const конец = period === "year"
    ? dateStr(new Date(a.getFullYear(), 11, 31))
    : period === "month"
    ? dateStr(new Date(a.getFullYear(), a.getMonth() + 1, 0))
    : dateStr(new Date(a.getFullYear(), a.getMonth(), a.getDate() + 6));
  return конец >= все[0];
}

/* С чем сравниваем. Без этой строки «0 страниц ↓ 59» читается как поломка:
   непонятно, откуда взялось число, если на этой неделе ещё ничего не было. */
function chipsNote() {
  return period === "month"
    ? "в сравнении со всем прошлым месяцем"
    : "в сравнении со всей прошлой неделей";
}

/* Цифра сама по себе ни о чём: тридцать девять страниц — это много или мало?
   Смысл появляется рядом с прошлым разом. Вверх — оранжевым, вниз — серым:
   ни красного, ни зелёного тут не нужно, меньше прошлой недели не провинность. */
function chipHTML(val, prev, word) {
  const d = (val || 0) - (prev || 0);
  /* Ровно столько же — это тоже результат сравнения, и молчать о нём нельзя:
     пустое место читается как «тренд не работает», а не как «без изменений».
     Отдельно отмечаем случай, когда сравнивать ещё не с чем. */
  const tail = d > 0 ? `<i class="up">↑ ${d}</i>`
    : d < 0 ? `<i class="down">↓ ${-d}</i>`
    : (prev || 0) ? `<i class="same">= столько же</i>`
    : `<i class="same">впервые</i>`;
  return `<div class="sc"><b>${val || 0}</b><span>${esc(word)}</span>${tail}</div>`;
}

function summaryHTML() {
  const r = periodRange();
  const st = rangeStats(r.from, r.to);
  const pv = prevSlice(r);
  const was = rangeStats(pv.from, pv.to);
  const g = goalProgress();
  const now = new Date();

  const a = periodAnchor();
  const прошлое = shift < 0;          // смотрим назад: «впереди столько-то дней» уже неуместно
  let ringVal, ringMax, cap, sub, hint;
  if (period === "year") {
    const цель = (data.weekGoal || 4) * 52;
    ringVal = st.days; ringMax = цель;
    cap = String(a.getFullYear());
    sub = `${plural(ringVal, "день", "дня", "дней")} из ${цель} по цели`;
    hint = `${st.days} ${plural(st.days, "день", "дня", "дней")} за год · `
      + `${st.entries} ${plural(st.entries, "запись", "записи", "записей")}`;
  } else if (period === "month") {
    const total = new Date(a.getFullYear(), a.getMonth() + 1, 0).getDate();
    const left = total - now.getDate();
    const weeks = Math.round(total / 7);           // недель в месяце
    const monthGoal = (data.weekGoal || 4) * weeks; // цель месяца = недельная × недели
    ringVal = st.days; ringMax = monthGoal;
    cap = new Intl.DateTimeFormat("ru", { month: "long" }).format(a)
      + (a.getFullYear() !== now.getFullYear() ? " " + a.getFullYear() : "");
    sub = `${plural(ringVal, "день", "дня", "дней")} из ${monthGoal} по цели`;
    hint = ringVal >= monthGoal
      ? `Цель месяца взята: ${data.weekGoal} в неделю × ${weeks} ${plural(weeks, "неделя", "недели", "недель")}`
      : прошлое
        ? `${ringVal} из ${monthGoal} ${plural(monthGoal, "дня", "дней", "дней")} цели · ${monthGoal - ringVal} не хватило`
        : `Цель месяца: ${data.weekGoal} в неделю × ${weeks} ${plural(weeks, "неделя", "недели", "недель")} · впереди ${left} ${plural(left, "день", "дня", "дней")}`;
  } else {
    const цель = data.weekGoal || 4;
    ringVal = прошлое ? st.days : g.days;
    ringMax = цель;
    cap = shift === 0 ? "Эта неделя" : shift === -1 ? "Прошлая неделя" : weekCap(a);
    sub = `${plural(ringVal, "день", "дня", "дней")} из ${цель} по цели`;
    hint = ringVal >= цель
      ? (прошлое ? "Цель недели была взята" : "Цель недели закрыта — всё сверху в удовольствие")
      : прошлое
        ? `${ringVal} из ${цель} ${plural(цель, "дня", "дней", "дней")} цели · ${цель - ringVal} не хватило`
        : `До цели ещё ${g.left} ${plural(g.left, "день", "дня", "дней")}`;
  }

  const R = 78, C = 2 * Math.PI * R;
  const on = C * Math.min(1, ringMax ? ringVal / ringMax : 0);

  return `
    <div class="periods">
      <button class="parr" data-shift="-1" type="button" aria-label="Назад"
        ${canShift(-1) ? "" : "disabled"}>‹</button>
      ${[["week", "Неделя"], ["month", "Месяц"], ["year", "Год"]].map(([k, t]) =>
        `<button class="pbtn ${period === k ? "on" : ""}" data-p="${k}" type="button">${t}</button>`).join("")}
      <button class="parr" data-shift="1" type="button" aria-label="Вперёд"
        ${canShift(1) ? "" : "disabled"}>›</button>
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

      <!-- Ни серии, ни числа дней: серия превращает пропуск в потерю, а дни
           уже написаны крупно в кольце — «5 из 4 дней цели». -->
      ${(() => {
        /* Нулевые плашки не показываются вовсе: у Дианы нет ни тактов, ни
           уроков — ей достаточно страниц, а нули только занимали строку. */
        const chips = [
          /* Первым — число занятий. В кольце стоят ДНИ (по ним цель), и это
             сбивало: за сентябрь два дня, а сел за инструмент, за книгу и за
             лист пять раз. Теперь оба числа на экране и не спорят. */
          (st.entries || was.entries) ? chipHTML(st.entries, was.entries,
            plural(st.entries || was.entries, "занятие", "занятия", "занятий")) : "",
          /* Показатель остаётся на месте, если он был в прошлом периоде: иначе
             в понедельник неделя выглядела пустой, будто раздел сломался, —
             а падение до нуля само по себе новость и должно быть видно. */
          (st.bars || was.bars) ? chipHTML(st.bars, was.bars, plural(st.bars || was.bars, "такт", "такта", "тактов")) : "",
          (st.pages || was.pages) ? chipHTML(st.pages, was.pages, "страниц") : "",
          /* Уроков в плашках больше нет: курсов по урокам не осталось, а
             стоял вечный ноль. Само число ещё считается — им пользуется
             страница курса-лекции. */
          (st.draws || was.draws) ? chipHTML(st.draws, was.draws, plural(st.draws || was.draws, "сессия рисунка", "сессии рисунка", "сессий рисунка")) : "",
        ].filter(Boolean).join("");
        return chips ? `<div class="sum-chips">${chips}</div>
          <p class="sum-vs">${esc(chipsNote())}</p>` : "";
      })()}

      ${lineChartHTML(periodSeries())}
      ${(() => {
        /* Показатель предлагаем только тот, по которому что-то есть: у Дианы
           нет ни тактов, ни рисунка, и пустые кнопки ей ни к чему. */
        const живые = METRICS.filter((m) => m.id === "entries" || st[m.id] || was[m.id]);
        return живые.length > 1 ? `<div class="mtr">${живые.map((m) =>
          `<button class="mtr-b ${metricNow().id === m.id ? "on" : ""}" data-metric="${m.id}"
            type="button">${m.name}</button>`).join("")}</div>` : "";
      })()}
      <div class="period-hint">${esc(hint)}</div>
    </div>`;
}

// серия одна на всё приложение: важно заниматься каждый день, а чем — не важно
function renderEmpty(title, text) {
  $("#view").innerHTML = `
    <div class="empty-state">
      <div class="es-mark">稽古</div>
      <h2>${esc(title)}</h2>
      <p>${esc(text)}</p>
    </div>`;
}


function renderProgress() {
  if (!hasMaterials()) { renderEmpty("Пока нечего показывать", "Как появятся материалы, здесь будет прогресс по неделям и месяцам."); return; }
  $("#view").innerHTML = `
    <div class="panel sum-panel">
      ${summaryHTML()}
    </div>


    <div class="panel">
      <div class="cal-head">
        <div class="cal-title" id="calTitle"></div>
        <div class="cal-nav">
          <button id="calPrev" type="button">‹</button>
          <button id="calNext" type="button">›</button>
        </div>
      </div>
      <div class="cal-grid" id="calGrid"></div>
      <div class="cal-legend" id="calLegend"></div>
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

  document.querySelectorAll("[data-metric]").forEach(b =>
    b.addEventListener("click", () => {
      cfg.metric = b.dataset.metric; saveCfg();
      renderProgress();
    }));

  document.querySelectorAll(".pbtn").forEach(b =>
    b.addEventListener("click", () => {
      period = b.dataset.p;
      shift = 0;                       // недели и месяцы считаются по-разному
      cfg.period = period; saveCfg();
      renderProgress();
    }));

  document.querySelectorAll(".parr").forEach(b =>
    b.addEventListener("click", () => {
      const куда = Number(b.dataset.shift);
      if (!canShift(куда)) return;
      shift = Math.min(0, shift + куда);
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
    out.push({ track: "pastel", icon: "🎨", title: courseById(e.courseId).name || "Курс", entry: e,
      what: (e.lessons || []).length
        ? `урок${e.lessons.length > 1 ? "и" : ""} ${e.lessons.map(i => i + 1).join(", ")}`
        : "рисовал" });
  }
  for (const e of watchEntries().filter(e => !e.deleted && e.date === ds)) {
    const v = videos().find(x => x.id === e.videoId);
    out.push({ track: "watch", icon: "🎬", title: v ? v.title : "Видео", entry: e, what: "посмотрел" });
  }
  return out;
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

  const monthTracks = new Set();
  for (let d = 1; d <= total; d++) {
    const ds = dateStr(new Date(calYear, calMonth, d));
    const on = allEntriesOn(ds);
    const tracks = new Set(on.map(x => x.track));
    tracks.forEach(t => monthTracks.add(t));
    let cls = "day";
    if (on.length) cls += " has";
    if (ds === today) cls += " today";
    if (ds === selectedDate) cls += " sel";
    if (ds > today) cls += " future";
    const dots = [...tracks].map(t => `<i class="cal-dot ${t === "piano" ? "p" : t === "book" ? "b" : "c"}"></i>`).join("");
    html += `<div class="${cls}" data-date="${ds}"><b>${d}</b><span class="dots-row">${dots}</span></div>`;
  }
  $("#calGrid").innerHTML = html;
  /* Легенда — только про то, что в этом месяце правда есть. Полный список
     на пустом месяце выглядел инструкцией, а «пауза» не объясняла ничего. */
  /* «Пастель» — имя трека внутри данных, а не то, чем занимаются. Курсы
     пастели ушли, остался рисунок — так его и подписываем. */
  const L = { piano: ["p", "пианино"], book: ["b", "чтение"], pastel: ["c", "рисование"] };
  const leg = $("#calLegend");
  if (leg) leg.innerHTML = [...monthTracks].filter(t => L[t])
    .map(t => `<span><i class="cal-dot ${L[t][0]}"></i> ${L[t][1]}</span>`).join("");

  document.querySelectorAll(".day[data-date]").forEach(el =>
    el.addEventListener("click", () => goToDate(el.dataset.date)));
}

function renderDayBox() {
  $("#dayCur").textContent = fmtDay(selectedDate);
  $("#dayNext").disabled = selectedDate >= todayStr();

  const list = allEntriesOn(selectedDate);

  $("#dayBox").innerHTML = `
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
      done: false, hidden: matHidden("pf:" + p.id),
      open: list.filter(a => a.done).length, total: list.length,
      fOpen: f.filter(x => x.open).length, fTotal: f.length });
  }
  data.active = "book";
  for (const b of data.book.books.filter(x => !x.archived)) {
    data.book.activeBook = b.id;
    const l = achState(), fx = factsState();
    out.push({ track: "book", bookId: b.id, icon: "📖", title: b.title, sub: b.author,
      cover: coverSrc(b.id, b.cover || ""), ratio: b.ratio || "",
      done: !!b.done, hidden: matHidden("bk:" + b.id),
      open: l.filter(a => a.done).length, total: l.length,
      fOpen: fx.filter(x => x.open).length, fTotal: fx.length });
  }

  /* Курсов может быть несколько: раньше сюда попадал только открытый сейчас,
     и о втором нельзя было даже написать заметку. */
  data.active = "pastel";
  const saveCourse = data.pastel.activeCourse;
  for (const c of courses()) {
    /* Курс без уроков — это рисунок: занятий у него нет, а материал есть.
       Раньше он сюда не попадал, и лента подписывала его карточки «Архивом». */
    if (!(c.lessons || []).length && !c.name) continue;
    data.pastel.activeCourse = c.id;
    const list = achState(), f = factsState();
    const ck = keyOfCourse(c);
    out.push({ track: "pastel", courseId: c.id, icon: "🎨", title: c.name, sub: c.author,
      cover: coverSrc(ck, c.cover || ""), ratio: c.ratio || "",
      done: false, hidden: matHidden(ck === "pastel" ? "ps" : "ps:" + c.id),
      open: list.filter(a => a.done).length, total: list.length,
      fOpen: f.filter(x => x.open).length, fTotal: f.length });
  }
  data.pastel.activeCourse = saveCourse;

  /* Завершённые видео остаются здесь: мысль о фильме приходит и после того,
     как он досмотрен, — а с главной он уже ушёл. */
  const saveVideo = data.watch.activeVideo;
  data.active = "watch";
  for (const v of videos().filter(x => !x.archived)) {
    data.watch.activeVideo = v.id;
    const l = achState(), fx = factsState();
    out.push({ track: "watch", videoId: v.id, icon: "🎬", title: v.title, sub: v.author,
      cover: watchThumb(v), ratio: "16 / 9", done: !!v.done, hidden: matHidden("wt:" + v.id),
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
  const saveVideo = data.watch.activeVideo, saveCourse = data.pastel.activeCourse;
  data.active = view.track;
  if (view.track === "pastel" && view.courseId) data.pastel.activeCourse = view.courseId;
  if (view.track === "piano" && view.pieceId) data.piano.activePiece = view.pieceId;
  if (view.track === "book" && view.bookId) data.book.activeBook = view.bookId;
  if (view.track === "watch" && view.videoId) data.watch.activeVideo = view.videoId;
  /* Через finally: без него исключение внутри оставляло приложение на чужом
     материале молча. Соседний dayProgress свою подмену так и возвращает. */
  try {
    return fn();
  } finally {
    data.active = save; data.piano.activePiece = savePiece; data.book.activeBook = saveBook;
    data.watch.activeVideo = saveVideo; data.pastel.activeCourse = saveCourse;
  }
}

/* ── Путь: дни, когда занимался чем угодно ──
   Отдельно от материалов и намеренно. У материала лестница дней короткая: книга
   живёт три недели, и сотня дней ей не по росту. А привычка сама по себе живёт
   годами — и мерить её надо не книгой, а всем сразу. Конфликтовать этому счёту
   не с чем: он не привязан ни к одному материалу и не спорит ни с одним
   процентом. То самое «правило десяти тысяч часов», переведённое в дни. */
function pathDays() {
  const дни = new Set();
  const собрать = (список) => {
    for (const e of список || []) if (e && !e.deleted && e.date) дни.add(e.date);
  };
  собрать(data.piano && data.piano.entries);
  собрать(data.book && data.book.entries);
  собрать(data.pastel && data.pastel.entries);
  собрать(data.watch && data.watch.entries);
  return дни.size;
}

const PATH_ACH = "__path__";
function pathState() {
  const c = CATALOG[PATH_ACH];
  const список = (c && Array.isArray(c.ach)) ? c.ach : [];
  const дней = pathDays();
  return список.map((a) => ({ ...a, need: Number((a.when[0] || [])[2]) || 0,
    done: дней >= (Number((a.when[0] || [])[2]) || 0) }));
}

function pathHTML() {
  const все = pathState();
  if (!все.length) return "";
  const дней = pathDays();
  const взято = все.filter((a) => a.done);
  const дальше = все.find((a) => !a.done);
  return `
    <div class="path">
      <div class="path-head">
        <b>${дней}</b><span>${plural(дней, "день", "дня", "дней")} занятий — всего, по всем материалам</span>
      </div>
      <div class="path-row">
        ${все.map((a) => `
          <span class="path-step${a.done ? " on" : ""}" title="${esc(a.name)} · ${a.need} ${plural(a.need, "день", "дня", "дней")}">
            ${a.done ? a.icon : "·"}
          </span>`).join("")}
      </div>
      <p class="path-note">${дальше
        ? `${esc(дальше.name)} — через ${дальше.need - дней} ${plural(дальше.need - дней, "день", "дня", "дней")}`
        : "Пройдено до конца"}${взято.length ? ` · взято ${взято.length} из ${все.length}` : ""}</p>
    </div>`;
}

// материал из achView мог остаться от другого профиля — тогда его тут нет
function viewMaterialExists(v) {
  if (!v || !v.track) return false;
  if (v.track === "book") return (data.book.books || []).some(b => b.id === v.bookId);
  if (v.track === "pastel") return !!courses().length;
  if (v.track === "watch") return videos().some(x => x.id === v.videoId);
  return (data.piano.pieces || []).some(p => p.id === v.pieceId);
}

function renderAch() {
  if (achView && !viewMaterialExists(achView)) { achView = null; cfg.achView = null; saveCfg(); }
  if (!achView) { renderAchList(); return; }
  if (achTab !== "facts" && achTab !== "takes") achTab = "ach";
  /* Карточки знаний переехали в карту, и у материала их, как правило, ноль.
     Вкладка, за которой пусто, — это «0 из 0» вместо содержания, а если она
     ещё и запомнена как открытая, экран наград встречает пустотой. */
  if (achTab === "facts" && !withMaterial(achView, () => factsState()).length) {
    achTab = "ach"; cfg.achTab = achTab; saveCfg();
  }
  renderAchMaterial(achView);
}

// входной экран: материалы и сколько наград по каждому
function renderAchList() {
  if (achTop === "shelf") { renderShelfInto(); return; }
  if (!hasMaterials()) { renderEmpty("Достижений пока нет", "Они появятся вместе с первым материалом."); return; }
  const mats = achMaterials();

  $("#view").innerHTML = `
    ${achTopHTML()}
    ${achTop === "mats" ? pathHTML() : ""}
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
  const src = view.pieceId || view.bookId
    || (view.track === "pastel" ? withMaterial(view, () => courseKey()) : "");
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
    if (t.mediaId) takeDrop(t.mediaId);
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
      ${facts.length ? `<button data-at="facts" class="${achTab === "facts" ? "on" : ""}" type="button">${T("segFacts")}</button>` : ""}
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
/* Докуда идёт глава: до начала следующей, последняя — до конца книги. */
function chapterEnd(bk, i) {
  const list = bk.chapters || [];
  const сл = list[i + 1];
  return сл ? сл.from - 1 : (bk.pages || 0);
}
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
    /* Награды по серии сняты — подсказок к ним тоже быть не должно. */
    const m = { days10: [s.days, 10, "занятий"], days20: [s.days, 20, "занятий"],
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
        const found = (await r.json()).find(g => g.files &&
          (g.files[GIST_FILE] || Object.keys(g.files).some((n) => /^keiko-.+\.json$/.test(n))));
        if (!found) throw new Error("Гист с данными не нашёлся — впиши id вручную");
        cfg.gistId = found.id; saveCfg();
      }
      await catalogPull(true).catch(() => {});     // каталог: профили, награды, карточки
      const r = await gh("/gists/" + cfg.gistId);
      if (!r.ok) throw new Error("Гист не открылся");
      const files = (await r.json()).files || {};
      /* Профили ищем и в переехавших файлах, и в общем: на первом подключении
         гист может быть в любом из двух состояний. */
      const ids = Object.keys(files)
        .map((n) => /^keiko-(.+)\.json$/.exec(n)).filter(Boolean).map((m) => m[1]);
      const f = files[GIST_FILE];
      if (f) {
        let txt = f.content;
        if (f.truncated && f.raw_url) txt = await (await withTimeout(fetch(f.raw_url), 20000)).text();
        try {
          const box = JSON.parse(txt);
          for (const id of Object.keys((box && box.profiles) || {}))
            if (!ids.includes(id)) ids.push(id);
        } catch {}
      }
      if (!ids.length) throw new Error("В гисте нет данных Кэйко");
      cfg.profileIds = ids; saveCfg();
      profilesFromKeys(ids);
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
  if (m.track === "pastel") return m.courseId ? keyOfCourse({ id: m.courseId }) : "pastel";
  if (m.track === "watch") return m.videoId || "";
  return m.pieceId || "";
}
const currentKey = () => isBook() ? book().id : isWatch() ? video().id : isCourse() ? courseKey() : (piece() ? piece().id : "");

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

  /* Пустая строка — явная граница абзаца, её держим всегда. Сложнее, когда
     абзацы разделены одиночным переносом: раньше они сшивались в один кусок.
     Отличаем по вёрстке. Если строки длинные, перенос стоит редко — значит
     каждая строка и есть абзац. Если строки короткие и ровные, это перенос
     вёрстки, и склеивать надо — кроме тех мест, где строка кончается точкой
     и заметно не дотягивает до общей ширины: так выглядит последняя строка
     абзаца. */
  const строки = t.split("\n").filter((x) => x.trim());
  const длины = строки.map((x) => x.trim().length);
  const ширина = длины.length ? Math.max(...длины) : 0;
  const средняя = длины.length ? длины.reduce((a2, b2) => a2 + b2, 0) / длины.length : 0;
  const вёрстка = строки.length > 2 && ширина <= 200 && средняя >= ширина * 0.6;

  t = t.replace(/\n{2,}/g, "\u0000");
  if (вёрстка) {
    const части = t.split("\n");
    t = части.reduce((acc, line, i) => {
      if (!i) return line;
      const пред = части[i - 1].trim();
      const кончилась = /[.!?…»"”)]$/.test(пред) && пред.length < ширина * 0.85;
      const реплика = /^[ \t]*[—–-]/.test(line);
      return acc + (кончилась || реплика ? "\u0000" : " ") + line.replace(/^[ \t]+/, "");
    }, "");
  } else {
    // строки длинные: перенос сам по себе и есть граница абзаца
    t = t.replace(/\n/g, "\u0000");
  }
  t = t.replace(/\u0000+/g, "\n\n");

  return t.replace(/[ \t]{2,}/g, " ")
          .replace(/ ([,.;:!?»])/g, "$1")
          .replace(/(«) /g, "$1")
          .trim();
}

/* Переключатель правки переносов — прямо под полем, где вставляют текст.
   Жёстко привязать его к материалу нельзя: в поэтическом сборнике попадается
   проза, а в прозе — стихотворная вставка. Решает человек в момент вставки,
   и решение запоминается. */
const fixPasteOn = () => cfg.fixPaste !== false;
const fmtToggleHTML = (id) => `
  <label class="fmt-tog">
    <input type="checkbox" id="${id}" ${fixPasteOn() ? "checked" : ""}>
    <span>Править переносы</span>
  </label>`;
function bindFmtToggle(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("change", () => {
    cfg.fixPaste = el.checked;
    saveCfg();
    /* Остальные такие же галочки на экране держим в том же положении: настройка
       одна на всё приложение, и две разные птички означали бы разное. */
    document.querySelectorAll(".fmt-tog input").forEach((x) => { x.checked = el.checked; });
    toast(el.checked ? "Переносы будут поправлены" : "Текст вставится как есть");
  });
}

function bindPasteCleanup(area) {
  if (!area) return;

  const insert = (e, raw) => {
    if (!raw || !fixPasteOn()) return;
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
      <div class="tk-load" data-media="${esc(t.mediaId)}"${(() => {
        const x = (data.takes || []).find((y) => y.id === t.mediaId) || {};
        return (x.w && x.h) ? ` style="aspect-ratio:${x.w}/${x.h}"` : "";
      })()}>
        <div class="tk-load-bar"><i style="width:${pct == null ? 8 : Math.max(4, pct)}%"></i></div>
        <span data-what="${what}">${what} загружается${pct == null ? "…" : " · " + pct + "%"}</span>
      </div>`;
  }
  /* Ширина и высота — не украшение: по ним браузер держит место под снимок
     ещё до того, как тот раскодирован, и лента не прыгает под пальцем. */
  const сн = (data.takes || []).find((x) => x.id === t.mediaId) || {};
  const размер = (сн.w && сн.h) ? ` width="${сн.w}" height="${сн.h}"` : "";
  return t.mediaKind === "photo"
    ? `<img class="th-shot" src="${esc(url)}"${размер} alt="" loading="lazy" decoding="async" data-take="${esc(t.mediaId)}" data-shot-src="${esc(url)}" data-shot-when="${esc(t.date ? fmtDay(t.date) : "")}">`
    : `<audio class="th-audio" controls preload="none" src="${esc(url)}"></audio>`;
}

/* ══════════ «Захотелось» ══════════
   Книга или ролик почти всегда что-нибудь подкидывают: съездить туда,
   прочитать вот это, попробовать сделать так. В ленте моментов такое тонет —
   там мысли, их перечитывают, а не выполняют. Здесь у желания есть вид
   и одно-единственное состояние: пока хочется — или уже сбылось. */

const wishes = () => (data.wishes || []).filter(w => !w.deleted);
const wishOpenCount = () => wishes().filter(w => !w.done).length;

let wishFilter = "open";         // «хочется» | «сбылось»
let wishEditing = null;
/* Новое желание по умолчанию на сегодня: почти всё, что записывают, хотят
   сделать сейчас, а «когда-нибудь» — редкий случай и выбирается вручную. */
let wishDuePick = todayStr();
let wishEditDue = "";            // срок в открытой правке
let wishKindPick = "";           // категория нового: пусто — без полки
let wishEditKind = "";           // категория в правке
let wishTriage = null;           // раскладка по одной: { ids, at }

/* У желания может быть срок, а может и не быть: «съездить в Выборг» живёт
   без даты годами, и это нормально. Дата не обязанность, а полочка:
   по ней список сам раскладывается на сегодня, завтра, позже и когда-нибудь. */
const tomorrowStr = () => dateStr(new Date(Date.now() + 864e5));

/* Категории вернулись — но по-новому: необязательные. По умолчанию желание
   без полки, и это нормальное его состояние; полка добавляется селектом,
   когда сама просится, или скопом в «Раскидать». */
const WISH_KINDS = [
  { id: "watch", icon: "🎬", name: "Посмотреть" },
  { id: "read",  icon: "📚", name: "Прочитать" },
  { id: "buy",   icon: "🛒", name: "Купить" },
  { id: "dog",   icon: "🐕", name: "Титу" },
  { id: "trip",  icon: "🗺", name: "Съездить" },
  { id: "go",    icon: "🍴", name: "Сходить" },
  { id: "gift",  icon: "🎁", name: "Подарить" },
  { id: "make",  icon: "✍️", name: "Сделать" },
];
const wishKind = (id) => WISH_KINDS.find((k) => k.id === id) || null;

function wishKindSelectHTML(cur, boxId) {
  const k = wishKind(cur);
  return `
    <span class="th-select wi-kind-sel">
      <span class="ts-label">${k ? k.icon + " " + esc(k.name) : "Без категории"}</span>
      <span class="ts-arrow">▾</span>
      <select id="${boxId}" aria-label="Категория">
        <option value="" ${!k ? "selected" : ""}>Без категории</option>
        ${WISH_KINDS.map((x) => `<option value="${x.id}" ${cur === x.id ? "selected" : ""}>${x.icon} ${esc(x.name)}</option>`).join("")}
      </select>
    </span>`;
}
const wishesToday = () => wishes().filter((w) => !w.done && w.due && w.due <= todayStr());

function wishAdd(text, due, kind) {
  const t = String(text || "").trim();
  if (!t) return false;
  data.wishes = data.wishes || [];
  data.wishes.push({
    id: uid(), text: t, due: due || "", kind: kind || "",
    done: false, doneAt: 0, date: todayStr(), createdAt: now(), updatedAt: now()
  });
  saveData();
  schedulePush();
  return true;
}

/* Быстрый выбор срока: когда-нибудь · сегодня · завтра · календарь.
   Одна и та же полоска в создании и в правке. */
/* Чип «Дата…» — это НЕ кнопка, открывающая календарь: айфон не даёт открыть
   скрытый ввод даты из кода — showPicker() там не работает, click() по
   спрятанному полю нем. Поэтому сам системный ввод лежит прозрачным прямо
   на чипе: палец попадает в него, и календарь открывает система. */
function dueChipsHTML(cur, pref) {
  const fmtD = new Intl.DateTimeFormat("ru", { day: "numeric", month: "short" });
  const custom = cur && cur !== todayStr() && cur !== tomorrowStr();
  return `
    <div class="wi-due" data-duebox="${pref}">
      <button class="wi-pick ${!cur ? "on" : ""}" data-due="" type="button">Когда-нибудь</button>
      <button class="wi-pick ${cur === todayStr() ? "on" : ""}" data-due="${todayStr()}" type="button">Сегодня</button>
      <button class="wi-pick ${cur === tomorrowStr() ? "on" : ""}" data-due="${tomorrowStr()}" type="button">Завтра</button>
      <span class="wi-pick date ${custom ? "on" : ""}">${
        custom ? esc(fmtD.format(fromStr(cur)).replace(".", "")) : "Дата…"}<input
        type="date" data-dueinput="1" value="${esc(custom ? cur : "")}"></span>
    </div>`;
}

function bindDueChips(box, get, set) {
  box.querySelectorAll("[data-due]").forEach((b) =>
    b.addEventListener("click", () => { set(b.dataset.due); }));
  const inp = box.querySelector("[data-dueinput]");
  if (!inp) return;
  /* Выбор применяется по закрытию календаря, а не по change: айфон шлёт
     change в момент открытия колеса — и перерисовка по нему убивала ввод
     вместе с только что открытым календарём. Пока колесо крутится, меняется
     только подпись на чипе. */
  let picked = "";
  inp.addEventListener("change", () => {
    picked = inp.value || "";
    const chip = inp.closest(".wi-pick");
    if (picked && chip) chip.childNodes[0].nodeValue =
      new Intl.DateTimeFormat("ru", { day: "numeric", month: "short" })
        .format(fromStr(picked)).replace(".", "");
  });
  inp.addEventListener("blur", () => { if (picked) set(picked); });
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

/* ══════════ «Какуля» — опыт для одного профиля ══════════
   Тем, у кого с этим бывает трудно, важно видеть не отдельный случай, а ход
   дела за месяц: когда было в прошлый раз и не затянулось ли. Отметка — одно
   касание, без подробностей и оценок: спрашивать больше значит превращать
   это в анкету, а анкету бросают. Другим профилям вкладки нет вовсе. */
let gutAll = false;          // развёрнут ли полный список наградок
const gutOn = () => {
  const p = profile();
  return /diana|диан/i.test(String(p.id || "") + " " + String(p.name || ""));
};
const gutList = () => (data.gut || []).filter((g) => !g.deleted)
  .sort((a, b) => (b.at || 0) - (a.at || 0));

/* ── Награды раздела ──
   Считаются из самих отметок, ничего не хранится: удалил отметку — награда
   честно закрывается обратно. Условия только на «сделала», ни одного на
   «пропустила»: пропуск здесь не провинность, и напоминать о нём наградой —
   последнее дело. */
function gutStats(чем) {
  const list = чем || gutList();
  const dates = [...new Set(list.map((g) => g.date).filter(Boolean))].sort();

  const perDay = {};
  for (const g of list) perDay[g.date] = (perDay[g.date] || 0) + 1;

  const hours = list.map((g) => new Date(g.at).getHours());
  const wd = new Set(dates.map((d) => (fromStr(d).getDay() + 6) % 7));

  // три записи подряд примерно в один и тот же час
  const byTime = list.slice().sort((a, b) => (a.at || 0) - (b.at || 0));
  let clock = false;
  for (let i = 2; i < byTime.length; i++) {
    const h = [byTime[i - 2], byTime[i - 1], byTime[i]].map((g) => new Date(g.at).getHours());
    if (Math.max(...h) - Math.min(...h) <= 1) { clock = true; break; }
  }

  // две записи близко друг к другу
  let fast = false, fast15 = false;
  for (let i = 1; i < byTime.length; i++) {
    const d = byTime[i].at - byTime[i - 1].at;
    if (d <= 3600e3) fast = true;
    if (d <= 15 * 60e3) fast15 = true;
  }

  const part = (h) => h < 5 ? "ночь" : h < 12 ? "утро" : h < 18 ? "день" : "вечер";
  const parts = new Set(hours.map(part));

  const months = new Set(dates.map((d) => d.slice(0, 7)));
  const since = dates.length ? daysBetween(dates[0], todayStr()) : 0;

  // самый полный календарный месяц — сколько в нём было дней с записями
  const byMonth = {};
  for (const d of dates) byMonth[d.slice(0, 7)] = (byMonth[d.slice(0, 7)] || 0) + 1;
  const fullest = Math.max(0, ...Object.values(byMonth));

  /* Возвращение после перерыва. Все прочие условия растут только вверх, и
     после паузы не срабатывает ничего — а это ровно тот момент, когда отметка
     далась труднее всего. Считаем разрыв больше недели между соседними днями. */
  let comeback = false;
  for (let i = 1; i < dates.length; i++)
    if (daysBetween(dates[i - 1], dates[i]) > 7) { comeback = true; break; }
  // запись под самый Новый год — её нельзя выслужить, можно только оказаться
  const newYear = dates.some((d) => /-12-31$|-01-01$/.test(d));

  return {
    // билет от Антона: засчитывается первая же отметка после того, как он его выписал
    ticket: list.some((g) => (g.at || 0) > TICKET_FROM),
    comeback, newYear,
    /* Второй заход Антона: сначала весточка от Тита, следующей отметкой —
       завтрак. По одной за раз, чтобы не сыпалось всё сразу. */
    after2: list.filter((g) => (g.at || 0) > TICKET2_FROM).length,
    total: list.length, days: dates.length, since, fullest,
    months: months.size, parts: parts.size, clock, fast, fast15,
    thrice: Object.values(perDay).some((n) => n >= 3),
    lates: hours.filter((h) => h >= 22).length,
    twice: Object.values(perDay).some((n) => n >= 2),
    twiceDays: Object.values(perDay).filter((n) => n >= 2).length,
    early: hours.some((h) => h < 8),
    night: hours.some((h) => h < 5),
    nights: hours.filter((h) => h < 5).length,
    noons: hours.filter((h) => h >= 12 && h < 14).length,
    noon: hours.some((h) => h >= 12 && h < 14),
    weekend: dates.some((d) => [5, 6].includes((fromStr(d).getDay() + 6) % 7)),
    week: wd.size === 7,
    halves: (() => {
      const v = {};
      for (const g of list) {
        const h = new Date(g.at).getHours(), o = v[g.date] || (v[g.date] = {});
        if (h < 12) o.am = true; else if (h >= 18) o.pm = true;
      }
      return Object.values(v).some((o) => o.am && o.pm);
    })()
  };
}

/* Ни одна награда не считает дни подряд. Тело — не метроном, пропуск здесь
   ничего не значит и провинностью не является; награда за «череду» превратила
   бы обычный день в срыв серии. Считаем только накопленное: сколько записей,
   сколько разных дней, как давно ведётся, в какое время суток. Пропустила
   неделю — ни одна не закроется обратно. */
/* Билет выписан 24 августа 2026 года в десять вечера — засчитывается первый
   поход после этой минуты. Награда настоящая: её выдаёт Антон, а не
   приложение. */
const TICKET_FROM = 1787598358040;
// 25 августа 2026 года: привет от Тита и талон на завтрак
const TICKET2_FROM = 1787722175796;

const GUT_ACH = [
  { id: "gtit", icon: "🐕", name: "Привет от Тита", hint: "от собаки лично",
    word: "Тит передаёт: так держать! Спинку рекомендую закруглять — на прогулках проверено, "
        + "с ровной спиной дело идёт хуже.",
    test: (s) => s.after2 >= 1 },
  /* ── Тит ──
     Он единственный персонаж в приложении, и до сих пор говорил дважды: на
     первой отметке и на десятой. Дальше шли одни талоны и счётчики. Теперь у
     него есть и лесенка, и отдельные реплики на то, что и так считается, —
     утреннюю запись, ночную, поздний вечер. Новых условий он не заводит,
     только говорит своим голосом о том, что уже случилось. */
  { id: "gtit3", icon: "🐕‍🦺", name: "Тит на выходных", hint: "от собаки лично",
    word: "Тит отмечает: в выходные гуляют дольше, и это напрямую влияет на дело. "
        + "Сокращать маршрут категорически не советует.",
    test: (s) => s.weekend && s.after2 >= 20 },
  { id: "gtit4", icon: "🦴", name: "Тит впечатлён", hint: "от собаки лично",
    word: "Две за час. Тит признаёт: у него так выходит только после чужой еды со стола, "
        + "и то не всегда.",
    test: (s) => s.fast && s.after2 >= 28 },
  { id: "gtit5", icon: "🌅", name: "Тит про утро", hint: "от собаки лично",
    word: "До восьми утра — Тит одобряет. В это время его самого выводит папа, "
        + "и он подтверждает: на свежую голову дело идёт лучше всего.",
    test: (s) => s.early && s.lates >= 5 },
  { id: "gtit7", icon: "🐕", name: "Тит подвёл итог", hint: "от собаки лично",
    word: "Тит подсчитал: за то же время он сходил примерно тысячу двести раз. "
        + "Талонов ему за это не полагается, и он не в обиде — он вообще не понимает, "
        + "из-за чего люди делают из этого событие.",
    test: (s) => s.after2 >= 60 },
  { id: "gtit6", icon: "🌙", name: "Тит про ночь", hint: "от собаки лично",
    word: "Тит проснулся, посмотрел, снова лёг. Говорит, ночью тоже считается — "
        + "он сам так делает регулярно и никому не докладывает.",
    test: (s) => s.nights >= 5 },

  /* ── СМС от Тита ──
     Счётчики «полсотни, сотня, двести» отличались друг от друга только цифрой.
     Те же числа, но открывается не число, а следующая эсэмэска — и к последней
     выясняется, что он всё это время куда-то шёл. */
  { id: "gsms1", icon: "📱", name: "СМС от Тита", hint: "первая",
    word: "«дошёл до угла. там всё по-прежнему. завтра пойду дальше»",
    test: (s) => s.after2 >= 16 },
  { id: "gsms2", icon: "📲", name: "СМС от Тита", hint: "вторая",
    word: "«обнаружил новый куст. осмотрел со всех сторон. отметил. продвигаюсь»",
    test: (s) => s.after2 >= 24 },
  { id: "gsms3", icon: "📵", name: "СМС от Тита", hint: "третья",
    word: "«встретил соседского кота. переговоры зашли в тупик. держу оборону»",
    test: (s) => s.after2 >= 36 },
  { id: "gsms4", icon: "📶", name: "СМС от Тита", hint: "четвёртая",
    word: "«папа думает, что это он меня ведёт. я его не разубеждаю»",
    test: (s) => s.after2 >= 50 },
  { id: "gsms5", icon: "📩", name: "СМС от Тита", hint: "пятая",
    word: "«сегодня повели новым маршрутом. пока молчу, надо изучить»",
    test: (s) => s.after2 >= 70 },
  { id: "gsms6", icon: "📬", name: "СМС от Тита", hint: "последняя",
    word: "«дошёл до конца улицы. там оказалась ещё улица. возвращаюсь»",
    test: (s) => s.after2 >= 85 },

  /* ── Возвращение ──
     Единственная награда, которая срабатывает от паузы, а не от серии. */
  { id: "gback", icon: "🔁", name: "Снова здесь", hint: "после перерыва",
    word: "Неделю тебя тут не было. Ничего не сгорело, счёт на месте, "
        + "продолжаем с того же места.",
    test: (s) => s.comeback },
  { id: "gny", icon: "🎄", name: "Под бой курантов", hint: "31 декабря или 1 января",
    word: "Запись под самый Новый год. Её нельзя было выслужить — можно было только оказаться "
        + "здесь в этот день.",
    test: (s) => s.newYear },
  { id: "gbreakfast", icon: "🍳", name: "Бесплатный завтрак", hint: "предъявителю",
    word: "Талон на один завтрак: готовит и подаёт Антон, меню на выбор предъявителя. "
        + "Покажите ему этот талон — и завтрак ваш.",
    test: (s) => s.after2 >= 2 },

  /* ── Талоны и весточки ──
     Награды, которые выдаёт не приложение, а Антон: их предъявляют вживую.
     Идут лесенкой, по одной за раз, чтобы не сыпались пачкой. */
  { id: "gtea", icon: "🫖", name: "Чай в постель", hint: "талон, один раз",
    word: "Талон на чай в постель. Приносит Антон, чашку выбирает предъявитель. "
        + "Вставать при этом не обязательно.",
    test: (s) => s.after2 >= 3 },
  { id: "gdishes", icon: "🍽", name: "Посуда не твоя", hint: "талон на один вечер",
    word: "Талон: один вечер посуду моет Антон, независимо от того, чья очередь. "
        + "Спорить с талоном бесполезно, он предъявлен.",
    test: (s) => s.after2 >= 5 },
  { id: "gremote", icon: "📺", name: "Право на пульт", hint: "талон на один вечер",
    word: "Талон: вечер, в котором фильм выбирает предъявитель. Антон смотрит и молчит, "
        + "даже если это третья серия подряд.",
    test: (s) => s.after2 >= 7 },
  { id: "gtit2", icon: "🐾", name: "Тит снова на связи", hint: "от собаки лично",
    word: "Тит докладывает: он сегодня тоже сходил, и не один раз. Считает вас напарниками "
        + "и предлагает обмениваться опытом.",
    test: (s) => s.after2 >= 10 },
  /* ── Талоны ──
     Между ними теперь стоят весточки Тита и эсэмэски: раньше пять талонов
     подряд открывались один за другим, и разницы между ними не чувствовалось.
     Пороги подобраны так, чтобы соседние награды были разного сорта. */
  { id: "gsilence", icon: "🤐", name: "Жалоба без совета", hint: "талон на один разговор",
    word: "Талон: один разговор, где Антон слушает и не предлагает решений. "
        + "Даже если решение очевидно. Особенно если очевидно.",
    test: (s) => s.after2 >= 18 },
  { id: "gquiet", icon: "🚪", name: "Полчаса тишины", hint: "талон, один раз",
    word: "Талон: Антон с телефоном уходит в другую комнату и не возвращается, пока не позовут. "
        + "Полчаса минимум, дольше по желанию предъявителя.",
    test: (s) => s.after2 >= 45 },
  { id: "gdecide", icon: "🤷", name: "Реши за меня", hint: "талон на один вечер",
    word: "Талон на вечер, в котором Антон решает всё сам: куда идти, что есть, во сколько выходить. "
        + "Вопросов предъявителю не задаёт.",
    test: (s) => s.after2 >= 55 },
  { id: "gguilty", icon: "🙋", name: "Виноват заранее", hint: "талон на одну ссору",
    word: "Талон: одна ссора, в которой Антон признаёт вину сразу и без разбирательства. "
        + "Кто был прав, выясняется потом и необязательно.",
    test: (s) => s.after2 >= 65 },
  { id: "gerrand", icon: "🏃", name: "Схожу вместо тебя", hint: "талон, один раз",
    word: "Талон на одно место, куда не хочется: аптека, почта, МФЦ, поликлиника. "
        + "Антон идёт, предъявитель остаётся.",
    test: (s) => s.after2 >= 75 },

  { id: "gflowers", icon: "💐", name: "Букет по требованию", hint: "талон, один раз",
    word: "Талон на один букет. Повод не нужен, дата не важна: предъявили — Антон идёт за цветами.",
    test: (s) => s.after2 >= 13 },
  { id: "gbath", icon: "🛁", name: "Ванна с пеной", hint: "талон на вечер",
    word: "Талон: Антон набирает ванну, приносит полотенце и следит, чтобы никто не стучал в дверь.",
    test: (s) => s.after2 >= 22 },
  { id: "gpizza", icon: "🍕", name: "Пицца без обсуждений", hint: "талон на один заказ",
    word: "Талон на пиццу. Начинку выбирает предъявитель, и обсуждению это не подлежит — "
        + "даже ананасы.",
    test: (s) => s.after2 >= 33 },
  { id: "gtaxi", icon: "🚕", name: "Такси вместо метро", hint: "талон, один раз",
    word: "Талон на одну поездку на такси там, где вообще-то планировалось метро. "
        + "Оплачивает Антон, маршрут выбирает предъявитель.",
    test: (s) => s.after2 >= 26 },
  { id: "gcup", icon: "🏆", name: "Кубок регулярности", hint: "тридцать походов",
    word: "Тридцать отметок после выдачи первого билета. Кубок вручается лично, "
        + "речь произносит Антон, аплодирует Тит.",
    test: (s) => s.after2 >= 30 },
  { id: "gqueen", icon: "👑", name: "Королева регулярности", hint: "сорок походов",
    word: "Сорок отметок. Прилагается талон на один любой каприз — Антон обязуется не уточнять, "
        + "какой именно, до момента предъявления.",
    test: (s) => s.after2 >= 40 },
  { id: "gticket", icon: "🎟", name: "Билет от Антона", hint: "предъявителю",
    word: "Билет на 100 ₽ или один поцелуйчик — на выбор предъявителя. "
        + "Выдаёт Антон, по первому требованию. Покажите ему этот билет — и получите награду.",
    test: (s) => s.ticket },
  { id: "g1", icon: "🌱", name: "Почин", hint: "первая запись",
    word: "Первая запись. Дальше — само собой.", test: (s) => s.total >= 1 },
  { id: "g2", icon: "✌️", name: "Дубль", hint: "дважды за день",
    word: "Два раза за один день. Бывает и так — и это тоже записано.", test: (s) => s.twice },
  { id: "g3", icon: "🧅", name: "Слоями", hint: "три дня с двумя записями",
    word: "Три дня, и в каждом не по одному разу. Как у лука: слой за слоем.",
    test: (s) => s.twiceDays >= 3 },
  { id: "g4", icon: "🌗", name: "И утром, и вечером", hint: "утром и вечером одного дня",
    word: "Утром и вечером одного дня. День удался с обеих сторон.", test: (s) => s.halves },

  { id: "g5", icon: "🌅", name: "Ранняя пташка", hint: "до восьми утра",
    word: "До восьми утра. Весь день впереди — и налегке.", test: (s) => s.early },
  { id: "g6", icon: "🦉", name: "Совушка", hint: "между полуночью и пятью",
    word: "Глубокой ночью. У организма своё расписание, и спорить с ним бесполезно.",
    test: (s) => s.night },
  { id: "g7", icon: "🌞", name: "Обеденный перерыв", hint: "между полуднем и двумя",
    word: "Ровно в обед. Всё по распорядку.", test: (s) => s.noon },
  { id: "g8", icon: "🌤", name: "Выходной тоже день", hint: "запись в субботу или воскресенье",
    word: "Записано в выходной. Отдых отдыхом, а дневник дневником.", test: (s) => s.weekend },
  { id: "g9", icon: "🧠", name: "Все чувства сразу", hint: "ночь, утро, день и вечер",
    word: "Ночь, утро, день и вечер — весь пульт управления освоен.", test: (s) => s.parts >= 4 },
  { id: "g10", icon: "🗓", name: "Полный комплект", hint: "все семь дней недели",
    word: "От понедельника до воскресенья — каждый день недели хоть раз да был.",
    test: (s) => s.week },
  { id: "g11", icon: "⏰", name: "По будильнику", hint: "три записи в один и тот же час",
    word: "Три раза примерно в одно время. Внутренние часы идут точно.", test: (s) => s.clock },
  { id: "g12", icon: "🏎", name: "Молния", hint: "две записи за час",
    word: "Две записи в пределах часа. Бывают дни поживее.", test: (s) => s.fast },
  { id: "g13", icon: "👁", name: "Ночная смена", hint: "пять ночных записей",
    word: "Пять раз посреди ночи. Смена сдана, дверь закрыта.", test: (s) => s.nights >= 5 },
  { id: "g14", icon: "🐀", name: "Высокая кухня", hint: "пять записей в обеденный час",
    word: "Пять раз в обеденный час. Расписание как в хорошем ресторане.",
    test: (s) => s.noons >= 5 },

  { id: "g15", icon: "🔟", name: "Десятка", hint: "десять записей",
    word: "Десять записей. Уже есть на что посмотреть в календаре.", test: (s) => s.total >= 10 },
  { id: "g16", icon: "🧭", name: "Двадцать пять", hint: "двадцать пять записей",
    word: "Двадцать пять записей. Четверть сотни, если считать красиво.",
    test: (s) => s.total >= 25 },
  { id: "g17", icon: "🎪", name: "Полсотни", hint: "пятьдесят записей",
    word: "Пятьдесят записей. Половина пути до сотни пройдена.", test: (s) => s.total >= 50 },
  { id: "g18", icon: "🏚", name: "Своё болото", hint: "шестьдесят записей",
    word: "Шестьдесят записей. Обжитое место, чужие не ходят.", test: (s) => s.total >= 60 },
  { id: "g19", icon: "💯", name: "Сотня", hint: "сто записей",
    word: "Сто записей. Целая летопись.", test: (s) => s.total >= 100 },
  { id: "g20", icon: "🐜", name: "Муравьиная работа", hint: "сто пятьдесят записей",
    word: "Сто пятьдесят записей. По одной, по одной — и вот целый муравейник.",
    test: (s) => s.total >= 150 },
  { id: "g21", icon: "🐠", name: "Найдётся всё", hint: "двести записей",
    word: "Двести записей. Даже в самом большом океане ничего не потеряется.",
    test: (s) => s.total >= 200 },

  { id: "g22", icon: "📔", name: "Неделя наблюдений", hint: "семь разных дней",
    word: "Семь разных дней в тетради. Картина начинает складываться.",
    test: (s) => s.days >= 7 },
  { id: "g23", icon: "📗", name: "Месяц наблюдений", hint: "тридцать разных дней",
    word: "Тридцать разных дней. Это уже не заметки, а наблюдение.",
    test: (s) => s.days >= 30 },
  { id: "g24", icon: "📚", name: "Сто дней в тетради", hint: "сто разных дней",
    word: "Сто разных дней. Такую тетрадь и врачу показать не стыдно.",
    test: (s) => s.days >= 100 },
  { id: "g25", icon: "🎈", name: "Дом на шариках", hint: "десять дней за один месяц",
    word: "Десять дней в одном месяце. Ещё немного — и дом оторвётся от земли.",
    test: (s) => s.fullest >= 10 },
  /* Было двадцать дней за месяц, и промах в один день закрывал награду
     навсегда: месяц не переиграть. Восемнадцать — тот же смысл без наказания
     за прошлое. */
  { id: "g26", icon: "🤖", name: "Уборщик года", hint: "двадцать дней за один месяц",
    word: "Двадцать дней в одном месяце. Планета прибрана, можно и на свидание.",
    test: (s) => s.fullest >= 20 },

  { id: "g27", icon: "🎂", name: "Месяц вместе", hint: "месяц с первой записи",
    word: "Месяц с первой записи. С днём рождения, дневничок.",
    test: (s) => s.total >= 1 && s.since >= 30 },
  { id: "g28", icon: "🌸", name: "Сто дней истории", hint: "сто дней с первой записи",
    word: "Сто дней наблюдений. Есть что показать врачу и чем себя порадовать.",
    test: (s) => s.total >= 1 && s.since >= 100 },
  { id: "g29", icon: "🗺", name: "Три месяца на карте", hint: "записи в трёх разных месяцах",
    word: "Записи в трёх разных месяцах. Календарь заполняется.", test: (s) => s.months >= 3 },

  /* Круглая компания: свои кивки, к тем же спокойным условиям. */
  { id: "g30", icon: "🐰", name: "Прыг-скок", hint: "три записи за один день",
    word: "Три раза за один день. Кто-то сегодня совсем не сидит на месте.",
    test: (s) => s.thrice },
  { id: "g31", icon: "🦔", name: "Всё по полочкам", hint: "сорок разных дней",
    word: "Сорок разных дней разложено по датам. Аккуратность — тоже талант.",
    test: (s) => s.days >= 40 },
  { id: "g32", icon: "🐷", name: "Красота требует", hint: "тридцать записей",
    word: "Тридцать записей. Уход за собой начинается с внимания к мелочам.",
    test: (s) => s.total >= 30 },
  { id: "g33", icon: "🐻", name: "Огородный сезон", hint: "записи в четырёх разных месяцах",
    word: "Четыре месяца наблюдений. Урожай собирают терпеливые.",
    test: (s) => s.months >= 4 },
  { id: "g34", icon: "🦌", name: "Научный подход", hint: "пятьдесят разных дней",
    word: "Пятьдесят разных дней. С такой выборкой уже можно делать выводы.",
    test: (s) => s.days >= 50 },
  { id: "g35", icon: "🐑", name: "Поздний вечер", hint: "пять записей после десяти вечера",
    word: "Пять раз перед сном. Вечера бывают задумчивые.",
    test: (s) => s.lates >= 5 },
  { id: "g36", icon: "🦅", name: "Кругосветка", hint: "записи в шести разных месяцах",
    word: "Шесть месяцев в дневнике. Полмира объехать — и то быстрее.",
    test: (s) => s.months >= 6 },
  { id: "g37", icon: "🐧", name: "Изобретатель", hint: "две записи за четверть часа",
    word: "Две записи за пятнадцать минут. Механизм отлажен и работает.",
    test: (s) => s.fast15 },
];

function renderGut() {
  const list = gutList();
  const t = new Date();
  const monFirst = (d) => (d.getDay() + 6) % 7;          // неделя с понедельника
  const weekFrom = new Date(t); weekFrom.setDate(t.getDate() - monFirst(t)); weekFrom.setHours(0, 0, 0, 0);
  const monthFrom = new Date(t.getFullYear(), t.getMonth(), 1);

  const week = list.filter((g) => g.at >= weekFrom.getTime()).length;
  const month = list.filter((g) => g.at >= monthFrom.getTime()).length;
  const last = list[0];

  const ago = (ms) => {
    const h = Math.floor((now() - ms) / 3600e3);
    if (h < 1) return "только что";
    if (h < 24) return h + " " + plural(h, "час", "часа", "часов") + " назад";
    const d = Math.floor(h / 24);
    return d + " " + plural(d, "день", "дня", "дней") + " назад";
  };
  const clock = new Intl.DateTimeFormat("ru", { hour: "2-digit", minute: "2-digit" });
  const dayFmt = new Intl.DateTimeFormat("ru", { day: "numeric", month: "long" });

  // месяц сеткой: чем чаще в этот день, тем плотнее пятно
  const days = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  const byDay = {};
  for (const g of list) if (g.date) byDay[g.date] = (byDay[g.date] || 0) + 1;
  const pad = monFirst(monthFrom);
  const cells = Array.from({ length: pad }, () => `<i class="gc-pad"></i>`).concat(
    Array.from({ length: days }, (_, i) => {
      const ds = dateStr(new Date(t.getFullYear(), t.getMonth(), i + 1));
      const n = byDay[ds] || 0;
      const future = ds > todayStr();
      return `<i class="gc-day${n ? " on" : ""}${future ? " fut" : ""}${ds === todayStr() ? " now" : ""}"
        style="${n ? `--k:${Math.min(1, 0.35 + n * 0.3)}` : ""}" title="${esc(ds)}">${i + 1}</i>`;
    })).join("");

  const today = list.filter((g) => g.date === todayStr());
  // восстанавливаем порядок выдачи по истории отметок, потом добираем остальное
  if ([gutBackfill(), gutStamp()].some(Boolean)) saveData();

  $("#view").innerHTML = `
    <div class="gut-hero">
      <button class="gut-btn" id="gutGo" type="button" aria-label="Отметить">💩</button>
      <p class="gut-hint">Получилось — жми. Больше ничего заполнять не надо.</p>
    </div>

    <div class="gut-sum">
      <div class="gut-card">
        <b>${last ? ago(last.at) : "—"}</b>
        <em>${last ? dayFmt.format(new Date(last.at)) + ", " + clock.format(new Date(last.at)) : "пока пусто"}</em>
      </div>
      <div class="gut-card"><b>${week}</b><em>на этой неделе</em></div>
      <div class="gut-card"><b>${month}</b><em>в этом месяце</em></div>
    </div>

    <div class="lib-group">${esc(new Intl.DateTimeFormat("ru", { month: "long", year: "numeric" }).format(t).replace(" г.", ""))}</div>
    <div class="gut-cal">
      ${["пн", "вт", "ср", "чт", "пт", "сб", "вс"].map((d) => `<i class="gc-h">${d}</i>`).join("")}
      ${cells}
    </div>

    ${(() => {
      const ach = gutAchState();
      /* Порядок — по выдаче, сверху та, что пришла последней: свежее интереснее
         старого, а старое уже прочитано. У одинаковой отметки времени (всё, что
         открылось до того, как мы начали её ставить) порядок объявления. */
      const open = ach.filter((a) => a.done)
        .map((a, i) => [a, i])
        .sort((x, y) => (gutWhen(y[0]) - gutWhen(x[0])) || (x[1] - y[1]))
        .map(([a]) => a);
      const shut = ach.length - open.length;
      /* Показываем три последние: список из тридцати штук перестаёт читаться,
         и свежая наградка тонет среди давно известных. Остальные — по кнопке. */
      const видно = gutAll ? open : open.slice(0, 3);
      /* Закрытые не показываем вовсе: ни названия, ни условия. Список условий
         превращает раздел в задание, которое надо выполнить, а тут не то место.
         Пусть будет просто известно, что впереди ещё что-то есть. */
      return `
        <div class="lib-group">Наградки · ${open.length} из ${ach.length}</div>
        <div class="gut-ach">
          ${видно.map((a) => `
            <span class="ga on">
              <i>${a.icon}</i>
              <b>${esc(a.name)}</b>
              <em>${esc(wordOf(a))}</em>
            </span>`).join("")}
          ${open.length > 3 ? `<button class="ga-more" id="gutMore" type="button">${
            gutAll ? "Свернуть" : `Показать все · ${open.length}`}</button>` : ""}
          ${open.length ? "" : `<div class="ga-none">Первая появится с первой отметкой.</div>`}
          ${shut ? `
            <div class="ga-shut">
              ${Array.from({ length: Math.min(shut, 12) }, () => `<i>🔒</i>`).join("")}
              <span>Ещё ${shut} ${plural(shut, "наградка", "наградки", "наградок")} —
                что за ними, узнаешь, когда откроются</span>
            </div>` : ""}
        </div>`;
    })()}

    ${today.length ? `
      <div class="lib-group">Сегодня · ${today.length}</div>
      <div class="gut-today">
        ${today.map((g) => `
          <span class="gut-chip">${clock.format(new Date(g.at))}
            <button data-gutdrop="${g.id}" type="button" aria-label="Убрать">✕</button>
          </span>`).join("")}
      </div>` : ""}`;

  /* Спрятанная игра на долгом нажатии снята — осталось обычное касание. */
  const go = $("#gutGo");
  let held = false;
  go.addEventListener("click", () => { if (held) { held = false; return; } gutAdd(); });
  const more = $("#gutMore");
  if (more) more.addEventListener("click", () => { gutAll = !gutAll; renderGut(); });
  document.querySelectorAll("[data-gutdrop]").forEach((b) =>
    b.addEventListener("click", () => gutDrop(b.dataset.gutdrop)));
}

const gutAchState = () => { const st = gutStats(); return GUT_ACH.map((a) => ({ ...a, done: a.test(st) })); };
/* Когда наградка открылась. Нужно для порядка: сверху та, что пришла
   последней. Открытым раньше, чем завели эту запись, ставим единицу —
   «когда-то»: соврать точным временем хуже, чем расписаться в незнании.
   Тот же приём, что у наград материалов и у предметов. */
/* Порядок выдачи задним числом. Отметки хранятся со временем, а условия
   наградок — чистые функции от них: значит, историю можно прокрутить с начала
   и увидеть, какая отметка какую наградку открыла. Без этого всё полученное
   до появления записи сваливалось в одну кучу со временем «когда-то», и
   список стоял в порядке объявления в коде — сверху «Привет от Тита»,
   полученный первым. */
function gutBackfill() {
  const list = gutList().slice().sort((a, b) => (a.at || 0) - (b.at || 0));
  if (!list.length) return false;
  data.gutAt = data.gutAt || {};
  const было = new Set();
  let ново = false;
  for (let i = 0; i < list.length; i++) {
    const st = gutStats(list.slice(0, i + 1));
    for (const a of GUT_ACH) {
      if (было.has(a.id) || !a.test(st)) continue;
      было.add(a.id);
      // уже проставленное настоящим временем не трогаем, «когда-то» — уточняем
      if (!(data.gutAt[a.id] > 1)) { data.gutAt[a.id] = list[i].at || 1; ново = true; }
    }
  }
  return ново;
}

function gutStamp(свежие) {
  data.gutAt = data.gutAt || {};
  const сейчас = new Set((свежие || []).map((a) => a.id));
  let ново = false;
  for (const a of gutAchState())
    if (a.done && data.gutAt[a.id] === undefined) {
      data.gutAt[a.id] = сейчас.has(a.id) ? now() : 1; ново = true;
    }
  return ново;
}
const gutWhen = (a) => (data.gutAt || {})[a.id] || 0;
const gutOpenSet = () => new Set(gutAchState().filter((a) => a.done).map((a) => a.id));

function gutAdd() {
  useMark("какуля");
  data.gut = data.gut || [];
  const was = gutOpenSet();          // что было открыто до этой отметки
  const t = now();
  data.gut.push({ id: uid(), at: t, date: todayStr(), createdAt: t, updatedAt: t });
  saveData();
  schedulePush();
  // короткий отклик в палец: подтверждение, которое чувствуешь, а не читаешь
  try { if (navigator.vibrate) navigator.vibrate([18, 40, 26]); } catch {}
  gutCheer();
  renderGut();
  /* Что открылось этой отметкой — считаем от снимка ДО неё, а не «всё, что
     открыто». Показываем после фейерверка: он и так секунда, перебивать его
     экраном жалко. */
  const fresh = gutAchState().filter((a) => a.done && !was.has(a.id));
  gutStamp(fresh);
  if (fresh.length) setTimeout(() => showWon({ ach: fresh, facts: [] }), 900);
  /* Пасхалка: в дни без наград иногда заглядывает сам Канье. Первый визит
     гарантирован — пасхалка, которую можно никогда не встретить, не пасхалка.
     Дальше не каждый раз: иначе через неделю перестанет смешить. */
  else if (!data.kanyeAt || Math.random() < 0.35) {
    data.kanyeAt = now(); saveData();
    setTimeout(showKanye, 900);
  }
}

/* Строчки свои, в его духе — настоящий текст песни сюда нельзя,
   да и «Скути-пуп» по-русски смешнее. */
const KANYE_LINES = [
  "Скути-пуп! Так держать.",
  "Скути-пуп. Величие не ждёт.",
  "Скути-пуп! Я бы поставил это в альбом.",
  "Ты только что сделала то, о чём другие лишь мечтают. Скути-пуп.",
  "Скути-пуп. Гений — это ежедневная практика.",
  "Скути-пуп! Даже мои кроссовки не настолько регулярны.",
];

function showKanye() {
  if ($("#cheer").classList.contains("show")) return;   // награду не перебиваем
  $("#cheerStep").hidden = true;
  $("#cheerIc").textContent = "🕶";
  $("#cheerTitle").textContent = "Канье Уэст";
  $("#cheerText").textContent = rnd(KANYE_LINES);
  $("#cheerOk").textContent = "Скути-пуп!";
  $("#cheer").classList.remove("fact");
  $("#cheer").classList.add("show");
}

function gutDrop(id) {
  const g = (data.gut || []).find((x) => x.id === id);
  if (!g) return;
  g.deleted = true; g.updatedAt = now();
  saveData(); schedulePush(); renderGut();
}

/* Фейерверк. Рисуем на канве поверх всего: это праздник на секунду,
   в разметке ему делать нечего. */
function gutCheer() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const cv = document.createElement("canvas");
  cv.className = "gut-fx";
  const w = innerWidth, h = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = w * dpr; cv.height = h * dpr;
  cv.style.width = w + "px"; cv.style.height = h + "px";
  document.body.appendChild(cv);
  const ctx = cv.getContext("2d");
  ctx.scale(dpr, dpr);

  const colors = ["#ffc94d", "#8b7cf6", "#6ee7a8", "#ff8fb8", "#7fd7e8"];
  const parts = [];
  const burst = (x, y) => {
    for (let i = 0; i < 34; i++) {
      const a = (Math.PI * 2 * i) / 34 + Math.random() * 0.2;
      const v = 2.6 + Math.random() * 3.4;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
                   c: colors[(Math.random() * colors.length) | 0], life: 1, r: 1.6 + Math.random() * 2.2 });
    }
  };
  burst(w / 2, h * 0.42);
  setTimeout(() => burst(w * 0.26, h * 0.34), 160);
  setTimeout(() => burst(w * 0.74, h * 0.36), 300);

  /* Если экран погас или приложение ушло в фон, кадры перестают приходить,
     и канва осталась бы висеть до возвращения. Убираем её по часам. */
  const bail = setTimeout(() => cv.remove(), 3200);
  const t0 = performance.now();
  const step = (t) => {
    const dt = Math.min(0.05, (t - (step.last || t0)) / 1000); step.last = t;
    ctx.clearRect(0, 0, w, h);
    let alive = 0;
    for (const p of parts) {
      if (p.life <= 0) continue;
      alive++;
      p.vy += 9 * dt;                       // притяжение: искры оседают, а не улетают
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.985; p.vy *= 0.985;
      p.life -= dt * 0.85;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.29); ctx.fill();
    }
    if (alive && t - t0 < 2600) requestAnimationFrame(step);
    else { clearTimeout(bail); cv.remove(); }
  };
  requestAnimationFrame(step);
}

/* ── Раскидать ──
   Отдельный проход по всем открытым желаниям, по одному: сегодня, завтра,
   дата, когда-нибудь или оставить как есть. Запускается сколько угодно раз —
   это пересборка полочек, а не разовая настройка. */
function renderWishTriage() {
  useMark("раскидать");
  const today = todayStr(), tomo = tomorrowStr();
  // список зафиксирован на старте: пока раскладываешь, полочки под руками не ездят
  const w = wishes().find((x) => x.id === wishTriage.ids[wishTriage.at] && !x.done);
  if (!w) {
    wishTriage.at++;
    if (wishTriage.at >= wishTriage.ids.length) { wishTriage = null; toast("Разложено"); }
    renderWishes();
    return;
  }
  const fmt = new Intl.DateTimeFormat("ru", { day: "numeric", month: "long" });
  const cur = !w.due ? "когда-нибудь"
    : w.due < today ? "с " + fmt.format(fromStr(w.due))
    : w.due === today ? "сегодня"
    : w.due === tomo ? "завтра"
    : "к " + fmt.format(fromStr(w.due));

  $("#view").innerHTML = `
    <div class="panel wt-card">
      <div class="wt-head">
        <span>${wishTriage.at + 1} из ${wishTriage.ids.length}</span>
        <button class="th-act" id="wtClose" type="button" aria-label="Закончить">✕</button>
      </div>
      <p class="wt-text">${esc(w.text)}</p>
      <p class="wt-cur">сейчас: ${esc(cur)}${wishKind(w.kind) ? " · " + wishKind(w.kind).icon + " " + esc(wishKind(w.kind).name) : ""}</p>
      <div class="wi-due wt-kinds">
        ${WISH_KINDS.map((k) => `
          <button class="wi-pick kind ${w.kind === k.id ? "on" : ""}" data-wtkind="${k.id}"
            type="button" title="${esc(k.name)}"><i>${k.icon}</i></button>`).join("")}
      </div>
      <div class="wi-due">
        <button class="wi-pick ${w.due === today ? "on" : ""}" data-wt="${today}" type="button">Сегодня</button>
        <button class="wi-pick ${w.due === tomo ? "on" : ""}" data-wt="${tomo}" type="button">Завтра</button>
        <span class="wi-pick date">Дата…<input type="date" id="wtDate"
          value="${esc(w.due || "")}"></span>
        <button class="wi-pick ${!w.due ? "on" : ""}" data-wt="" type="button">Когда-нибудь</button>
      </div>
      <button class="btn wt-skip" id="wtSkip" type="button">Оставить как есть</button>
    </div>
    <div class="empty-note">Полочки пересобираются на месте — пройди хоть весь список, хоть половину.</div>`;

  const next = () => {
    wishTriage.at++;
    if (wishTriage.at >= wishTriage.ids.length) { wishTriage = null; toast("Разложено"); }
    renderWishes();
  };
  const setDue = (v) => { w.due = v || ""; w.updatedAt = now(); saveData(); schedulePush(); next(); };
  /* Категория не листает дальше: часто хочется поставить и полку, и срок
     одной карточке. Полка — щёлк, осталась; срок — щёлк, поехали дальше. */
  document.querySelectorAll("[data-wtkind]").forEach((b) =>
    b.addEventListener("click", () => {
      w.kind = w.kind === b.dataset.wtkind ? "" : b.dataset.wtkind;
      w.updatedAt = now();
      saveData(); schedulePush();
      renderWishes();
    }));
  document.querySelectorAll("[data-wt]").forEach((b) =>
    b.addEventListener("click", () => setDue(b.dataset.wt)));
  const inp = $("#wtDate");
  let picked = "";
  inp.addEventListener("change", () => { picked = inp.value || ""; });
  inp.addEventListener("blur", () => { if (picked) setDue(picked); });
  $("#wtSkip").addEventListener("click", next);
  $("#wtClose").addEventListener("click", () => { wishTriage = null; renderWishes(); });
}

function renderWishes() {
  if (wishTriage) { renderWishTriage(); return; }
  const list = wishes().filter(w => (wishFilter === "done" ? w.done : !w.done));
  const openN = wishOpenCount();
  const doneN = wishes().length - openN;
  const today = todayStr(), tomo = tomorrowStr();

  const fmt = new Intl.DateTimeFormat("ru", { day: "numeric", month: "long" });
  const fmtD = new Intl.DateTimeFormat("ru", { day: "numeric", month: "short" });

  const rowHTML = (w) => {
    /* Срок на карточке: просрочка не краснеет, а тихо говорит «с 12 августа» —
       это желание, а не дедлайн на работе. */
    const dueTxt = w.done ? "сбылось " + fmt.format(new Date(w.doneAt || now()))
      : !w.due ? ""
      : w.due < today ? "с " + fmt.format(fromStr(w.due))
      : w.due === today ? "сегодня"
      : w.due === tomo ? "завтра"
      : "к " + fmt.format(fromStr(w.due));
    const kd = wishKind(w.kind);
    return `
      <article class="wish${w.done ? " done" : ""}">
        <button class="wi-check" data-wdone="${w.id}" type="button"
          aria-label="${w.done ? "Вернуть в список" : "Отметить сбывшимся"}">${w.done ? "✓" : ""}</button>
        <div class="wi-body">
          ${wishEditing === w.id
            ? `<textarea class="note-input wi-edit" id="wiEdit" rows="3">${esc(w.text)}</textarea>
               ${wishKindSelectHTML(wishEditKind, "wiEditKind")}
               ${dueChipsHTML(wishEditDue, "edit")}
               <div class="wi-edit-row">
                 <button class="btn gold" data-wsave="${w.id}" type="button">Сохранить</button>
                 <button class="btn" data-wcancel="1" type="button">Отмена</button>
               </div>`
            : `<p class="wi-text">${esc(w.text)}</p>
               ${dueTxt || kd ? `<div class="wi-meta">
                 ${kd ? `<span class="wi-kind">${kd.icon} ${esc(kd.name)}</span>` : ""}
                 ${dueTxt ? `<span class="wi-when${!w.done && w.due && w.due < today ? " late" : ""}">${esc(dueTxt)}</span>` : ""}
               </div>` : ""}`}
        </div>
        ${wishEditing === w.id ? "" : `
        <span class="wi-acts">
          <button class="th-act" data-wedit="${w.id}" type="button" aria-label="Изменить">✎</button>
          <button class="th-act" data-wdrop="${w.id}" type="button" aria-label="Удалить">✕</button>
        </span>`}
      </article>`;
  };

  /* Открытые раскладываются по сроку сами: сегодня (и всё просроченное),
     завтра, позже — по датам, и когда-нибудь — без даты. Никакой кнопки
     сортировки не нужно: полочки и есть сортировка. */
  let body;
  if (wishFilter === "done") {
    const done = list.slice().sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    body = done.length
      ? `<div class="wish-list">${done.map(rowHTML).join("")}</div>`
      : `<div class="empty-note">Сбывшегося пока нет.<br>Отмечай галочкой — здесь будет видно, что из задуманного дошло до дела.</div>`;
  } else if (!list.length) {
    body = `<div class="empty-note">Пока пусто.<br>Сюда — то, что захотелось по ходу: куда съездить, что прочитать, что попробовать сделать.</div>`;
  } else {
    const bag = { today: [], tomo: [], later: [], some: [] };
    for (const w of list) {
      if (!w.due) bag.some.push(w);
      else if (w.due <= today) bag.today.push(w);
      else if (w.due === tomo) bag.tomo.push(w);
      else bag.later.push(w);
    }
    bag.today.sort((a, b) => (a.due < b.due ? -1 : 1));
    bag.later.sort((a, b) => (a.due < b.due ? -1 : 1));
    bag.some.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const grp = (name, arr) => arr.length
      ? `<div class="lib-group">${name} · ${arr.length}</div><div class="wish-list">${arr.map(rowHTML).join("")}</div>` : "";
    body = grp("Сегодня", bag.today) + grp("Завтра", bag.tomo)
      + grp("Позже", bag.later) + grp("Когда-нибудь", bag.some);
  }

  $("#view").innerHTML = `
    <div class="panel th-panel">
      <textarea class="note-input th-text" id="wiText" rows="2" placeholder="Чего захотелось?"></textarea>
      ${wishKindSelectHTML(wishKindPick, "wiKind")}
      ${dueChipsHTML(wishDuePick, "new")}
      <button class="btn gold th-send" id="wiSave" type="button">Записать</button>
    </div>

    <div class="seg" id="wishSeg">
      <button data-wf="open" class="${wishFilter === "open" ? "on" : ""}" type="button">Хочется ${openN || ""}</button>
      <button data-wf="done" class="${wishFilter === "done" ? "on" : ""}" type="button">Сбылось ${doneN || ""}</button>
    </div>

    ${body}`;

  const area = $("#wiText");
  const save = () => {
    if (wishAdd(area.value, wishDuePick, wishKindPick)) {
      area.value = ""; wishDuePick = todayStr(); wishKindPick = "";
      renderWishes();
    } else toast("Напиши пару слов");
  };
  $("#wiSave").addEventListener("click", save);
  const kindSel = $("#wiKind");
  if (kindSel) kindSel.addEventListener("change", () => {
    wishKindPick = kindSel.value;
    const t = area.value; renderWishes(); $("#wiText").value = t;
  });
  const editKindSel = $("#wiEditKind");
  if (editKindSel) editKindSel.addEventListener("change", () => {
    wishEditKind = editKindSel.value;
    const t = ($("#wiEdit") || {}).value; renderWishes();
    if ($("#wiEdit") && t != null) $("#wiEdit").value = t;
  });
  const newBox = document.querySelector('[data-duebox="new"]');
  if (newBox) bindDueChips(newBox,
    () => wishDuePick,
    (v) => { wishDuePick = v; const t = area.value; renderWishes(); $("#wiText").value = t; });
  const editBox = document.querySelector('[data-duebox="edit"]');
  if (editBox) bindDueChips(editBox,
    () => wishEditDue,
    (v) => { wishEditDue = v; const t = ($("#wiEdit") || {}).value; renderWishes(); if ($("#wiEdit") && t != null) $("#wiEdit").value = t; });
  area.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); save(); }
  });

  document.querySelectorAll("#wishSeg button").forEach(b =>
    b.addEventListener("click", () => { wishFilter = b.dataset.wf; wishEditing = null; renderWishes(); }));
  document.querySelectorAll("[data-wdone]").forEach(b =>
    b.addEventListener("click", () => wishToggle(b.dataset.wdone)));
  document.querySelectorAll("[data-wedit]").forEach(b =>
    b.addEventListener("click", () => {
      wishEditing = b.dataset.wedit;
      const w = (data.wishes || []).find(x => x.id === wishEditing);
      wishEditDue = (w && w.due) || "";
      wishEditKind = (w && w.kind) || "";
      renderWishes();
    }));
  document.querySelectorAll("[data-wcancel]").forEach(b =>
    b.addEventListener("click", () => { wishEditing = null; renderWishes(); }));
  document.querySelectorAll("[data-wsave]").forEach(b =>
    b.addEventListener("click", () => {
      const w = (data.wishes || []).find(x => x.id === b.dataset.wsave);
      const t = ($("#wiEdit").value || "").trim();
      if (w && t) { w.text = t; w.due = wishEditDue || ""; w.kind = wishEditKind || ""; w.updatedAt = now(); saveData(); schedulePush(); }
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
  /* Артефакты этой книги, открывшиеся в этот день. Снимок по главам тут не
     нужен: у предмета есть время открытия, и оно точнее любого пересчёта —
     предмет мог открыться и на другом устройстве, и после синхронизации. */
  const arts = musItems().filter((x) => x.book === key && sameDay((data.musAt || {})[x.id]))
    .map((x) => ({ id: x.id, name: x.name, icon: musIcon(x) }));

  return {
    arts,
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

/* ══════════ Дневник: дни ══════════
   Личные записи живут в том же списке, что и мысли, — с пометкой diary.
   Хранилище одно (то же слияние, те же вложения, та же «мысль дня»),
   а читаются они отдельной лентой: за мыслью о книге не хочется видеть
   «сегодня был дождь», и наоборот. */
const diaryList = () => (data.thoughts || []).filter((t) => !t.deleted && t.diary);

const WMO = { 0: "ясно", 1: "почти ясно", 2: "переменная облачность", 3: "пасмурно",
  45: "туман", 48: "туман", 51: "морось", 53: "морось", 55: "морось",
  56: "ледяная морось", 57: "ледяная морось", 61: "небольшой дождь", 63: "дождь",
  65: "сильный дождь", 66: "ледяной дождь", 67: "ледяной дождь", 71: "лёгкий снег",
  73: "снег", 75: "сильный снег", 77: "снежная крупа", 80: "ливень", 81: "ливень",
  82: "сильный ливень", 85: "снегопад", 86: "снегопад", 95: "гроза", 96: "гроза с градом", 99: "гроза с градом" };
const wmoText = (c) => WMO[c] || "";
const tempText = (t) => (t > 0 ? "+" : "") + Math.round(t) + "°";

/* Координаты спрашиваются только когда открыт дневник, и округляются до
   четырёх знаков — этого хватает на адрес до дома, но не на слежку за
   точкой. В гист уезжает готовый текст места, а не маршрут. */
let geoLast = null;
function geoNow() {
  if (geoLast && now() - geoLast.at < 600e3) return Promise.resolve(geoLast);
  if (!navigator.geolocation) return Promise.resolve(null);
  return new Promise((res) => {
    navigator.geolocation.getCurrentPosition(
      (p) => { geoLast = { lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4), at: now() }; res(geoLast); },
      () => res(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600e3 });
  });
}

/* Адрес — улица и город, а не просто «Волжский»: контекст записи в том,
   где именно ты сидел. Номенклатура ОСМ отвечает по-русски и без ключей;
   если она молчит, спасает второй сервис — там хотя бы город. */
async function placeOf(lat, lon) {
  try {
    const r = await withTimeout(fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2"
      + "&lat=" + lat + "&lon=" + lon + "&zoom=17&accept-language=ru"), 12000);
    const a = (await r.json()).address || {};
    const road = a.road || a.pedestrian || a.footway || a.suburb || "";
    const num = a.house_number || "";
    const city = a.city || a.town || a.village || a.municipality || "";
    const street = road ? road + (num ? ", " + num : "") : "";
    const out = [city, street].filter(Boolean).join(" · ");
    if (out) return out;
  } catch {}
  try {
    const r = await withTimeout(fetch("https://api.bigdatacloud.net/data/reverse-geocode-client"
      + "?latitude=" + lat + "&longitude=" + lon + "&localityLanguage=ru"), 12000);
    const j = await r.json();
    return [j.city || j.locality || "", j.principalSubdivision || ""].filter(Boolean)[0] || "";
  } catch { return ""; }
}

/* Погода за нужный час. Сегодняшняя — текущая; вчерашняя и до недели назад
   достаётся из того же прогноза с прошедшими днями: запись, сделанная без
   сети, дозаполнится при следующем выходе в неё. */
async function weatherFor(rec) {
  const base = "https://api.open-meteo.com/v1/forecast?latitude=" + rec.lat
    + "&longitude=" + rec.lon + "&timezone=auto";
  if (rec.date === todayStr()) {
    const j = await (await withTimeout(fetch(base + "&current=temperature_2m,weather_code"), 12000)).json();
    return j && j.current ? { t: j.current.temperature_2m, c: j.current.weather_code } : null;
  }
  const j = await (await withTimeout(fetch(base + "&past_days=7&hourly=temperature_2m,weather_code"), 15000)).json();
  const h = new Date(rec.createdAt || fromStr(rec.date).getTime() + 12 * 3600e3);
  const key = rec.date + "T" + String(h.getHours()).padStart(2, "0") + ":00";
  const i = j && j.hourly ? j.hourly.time.indexOf(key) : -1;
  return i >= 0 ? { t: j.hourly.temperature_2m[i], c: j.hourly.weather_code[i] } : null;
}

async function diaryEnrich(rec) {
  let ch = false;
  if (rec.lat == null && rec.date === todayStr()) {
    const g = await geoNow();
    if (g) { rec.lat = g.lat; rec.lon = g.lon; ch = true; }
  }
  if (rec.lat != null && !rec.place) {
    const p = await placeOf(rec.lat, rec.lon);
    if (p) { rec.place = p; ch = true; }
  }
  if (rec.lat != null && rec.temp == null) {
    const w = await weatherFor(rec).catch(() => null);
    if (w && w.t != null) { rec.temp = w.t; rec.wc = w.c; ch = true; }
  }
  if (ch) {
    rec.updatedAt = now();
    saveData(); schedulePush();
    /* Не вся лента, а одна строка: полная перерисовка на каждом дозаполнении
       заметно дёргала экран и делала раздел «медленным» на ощупь. */
    if (tab === "diary" && !dyEditing && !cfg.diaryCal) {
      const el = document.querySelector('[data-dyid="' + rec.id + '"] .dy-when');
      if (el) { el.textContent = dyFootText(rec); return; }
      renderDays();
    }
  }
}

/* Дозаполнение задним числом: писал без сети — место и погода приедут при
   следующем открытии. Дальше недели назад погоду уже не достать, а место
   без сохранённых координат восстанавливать нечестно — пропускаем. */
let diaryFillBusy = false;
async function diaryFill() {
  if (diaryFillBusy || !data) return;
  diaryFillBusy = true;
  try {
    const cut = dateStr(new Date(Date.now() - 7 * 864e5));
    for (const t of diaryList()) {
      if (t.date < cut) continue;
      if (t.lat == null && t.date !== todayStr()) continue;
      if (t.lat != null && t.place && t.temp != null) continue;
      await diaryEnrich(t);
    }
  } finally { diaryFillBusy = false; }
}

/* Предпросмотр «что прикрепится»: место и погода готовятся заранее —
   к моменту, когда запись сохраняют, они уже лежат готовыми. */
let dyPreview = null;
async function dyPreviewLoad() {
  const paint = () => {
    const el = document.getElementById("deTags");
    if (el && !dyEditing) el.innerHTML = deTagsHTML(null);
  };
  if (dyPreview && now() - dyPreview.at < 300e3) { paint(); return; }
  const g = await geoNow();
  if (!g) { paint(); return; }
  const [pl, w] = await Promise.all([
    placeOf(g.lat, g.lon),
    weatherFor({ lat: g.lat, lon: g.lon, date: todayStr(), createdAt: now() }).catch(() => null),
  ]);
  dyPreview = { at: now(), lat: g.lat, lon: g.lon, place: pl, w };
  paint();
}

function diaryAdd(text) {
  const rec = {
    id: uid(), diary: true, key: "", track: "",
    text: (text || "").slice(0, 4000), date: todayStr(),
    createdAt: now(), updatedAt: now(),
  };
  if (pendingMedia) {
    rec.mediaId = pendingMedia.id; rec.mediaKind = pendingMedia.kind;
    const mid = pendingMedia.id, mblob = pendingMedia.blob;
    takeSave(mid, mblob)
      .then(() => { if (tab === "notes") renderNotes(); return takePush(mid, mblob); })
      .catch((e) => { if (noRoom(e)) toast("Не хватило места — вложение не сохранилось"); });
    pendingMedia = null;
  }
  if (dyPreview && now() - dyPreview.at < 600e3) {
    rec.lat = dyPreview.lat; rec.lon = dyPreview.lon;
    if (dyPreview.place) rec.place = dyPreview.place;
    if (dyPreview.w && dyPreview.w.t != null) { rec.temp = dyPreview.w.t; rec.wc = dyPreview.w.c; }
  }
  data.thoughts = data.thoughts || [];
  data.thoughts.push(rec);
  saveData(); schedulePush();
  if (tab === "diary") renderDays();
  toast("День записан");
  diaryEnrich(rec);
}

let diaryCalShift = 0;   // на сколько месяцев назад смотрит календарь дневника

function diaryCalHTML(list) {
  const t0 = new Date();
  const m = new Date(t0.getFullYear(), t0.getMonth() + diaryCalShift, 1);
  const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const pad = (m.getDay() + 6) % 7;
  const by = {};
  for (const g of list) if (g.date) by[g.date] = (by[g.date] || 0) + 1;
  const monthKey = dateStr(m).slice(0, 7);
  const filled = Object.keys(by).filter((d) => d.startsWith(monthKey)).length;
  const cells = Array.from({ length: pad }, () => `<i class="gc-pad"></i>`).concat(
    Array.from({ length: days }, (_, i) => {
      const ds = dateStr(new Date(m.getFullYear(), m.getMonth(), i + 1));
      const n = by[ds] || 0;
      return `<i class="gc-day${n ? " on" : ""}${ds > todayStr() ? " fut" : ""}${ds === todayStr() ? " now" : ""}"
        style="${n ? `--k:${Math.min(1, 0.35 + n * 0.3)}` : ""}">${i + 1}</i>`;
    })).join("");
  return `
    <div class="panel">
      <div class="cal-head">
        <div class="cal-title">${esc(new Intl.DateTimeFormat("ru", { month: "long", year: "numeric" }).format(m).replace(" г.", ""))}</div>
        <div class="cal-nav">
          <button data-dycal="-1" type="button">‹</button>
          <button data-dycal="1" type="button" ${diaryCalShift >= 0 ? "disabled" : ""}>›</button>
        </div>
      </div>
      <div class="gut-cal">
        ${["пн", "вт", "ср", "чт", "пт", "сб", "вс"].map((d) => `<i class="gc-h">${d}</i>`).join("")}
        ${cells}
      </div>
      <div class="empty-note">${filled
        ? `Записано ${filled} ${plural(filled, "день", "дня", "дней")} — пустые клетки и есть пропуски.`
        : "В этом месяце записей не было."}</div>
    </div>`;
}

/* Короткое место для подписи под записью: улица, если она известна,
   иначе город. Полный адрес живёт в самой записи и виден в редакторе. */
const spot = (t) => {
  if (!t.place) return "";
  const parts = String(t.place).split(" · ");
  return parts[1] || parts[0];
};

/* ── Полноэкранная запись ──
   Нажал на поле — и не осталось ничего, кроме текста: сверху тонкие теги
   с датой, местом и погодой, снизу одна кнопка. Тот же лист открывается
   для правки — и дневника, и заметок: править в окошке в три строки
   посреди ленты было негде развернуться. */
let dyEditing = null;   // что правим (null — новая запись дня)
let dyDraft = "";       // закрыл лист не сохранив — черновик ждёт возвращения

/* Дата живёт в шапке листа; здесь — только место и погода, простым тихим
   текстом без плашек: это фон записи, а не кнопки. */
function deTagsHTML(rec) {
  const bits = [];
  if (rec) {
    if (rec.diary && rec.place) bits.push("📍 " + rec.place);
    if (rec.diary && rec.temp != null) bits.push(tempText(rec.temp) + (wmoText(rec.wc) ? ", " + wmoText(rec.wc) : ""));
  } else if (dyPreview) {
    if (dyPreview.place) bits.push("📍 " + dyPreview.place);
    if (dyPreview.w && dyPreview.w.t != null)
      bits.push(tempText(dyPreview.w.t) + (wmoText(dyPreview.w.c) ? ", " + wmoText(dyPreview.w.c) : ""));
  } else bits.push("📍 …");
  return esc(bits.join("  ·  "));
}

function openDayEditor(rec) {
  dyEditing = rec || null;
  const was = document.getElementById("dyEd");
  if (was) was.remove();
  const isNew = !rec;
  const clock = new Intl.DateTimeFormat("ru", { hour: "2-digit", minute: "2-digit" });
  const dayTitle = rec
    ? fmtDay(rec.date) + ", " + clock.format(new Date(rec.createdAt || fromStr(rec.date)))
    : "Сегодня, " + clock.format(new Date());
  const box = document.createElement("div");
  box.id = "dyEd";
  box.innerHTML = `
    <div class="de-nav">
      <button class="de-close" id="deClose" type="button" aria-label="Закрыть">✕</button>
      <span class="de-day">${esc(dayTitle)}</span>
      <button class="de-ok" id="deSave" type="button" aria-label="${isNew ? "Добавить" : "Сохранить"}">✓</button>
    </div>
    <div class="de-tags" id="deTags">${deTagsHTML(rec)}</div>
    ${isNew && pendingMedia ? `
      <div class="th-pending de-pending">
        ${pendingMedia.kind === "photo"
          ? `<img src="${esc(pendingMedia.url)}" alt="">`
          : `<audio controls src="${esc(pendingMedia.url)}"></audio>`}
        <button class="th-drop" id="deDrop" type="button" aria-label="Убрать вложение">✕</button>
      </div>` : ""}
    <textarea class="de-area" id="deArea" placeholder="Пиши…"></textarea>
    <div class="de-kb" id="deKb">
      ${fmtToggleHTML("deFmt")}
      ${isNew ? `
        ${canRecord() ? `<button class="th-clip" id="deMic" type="button" aria-label="Записать звук">🎙</button>` : ""}
        <button class="th-clip" id="deCam" type="button" aria-label="Приложить снимок">📷</button>` : ""}
    </div>`;
  document.body.appendChild(box);
  /* Позади листа живёт прокручиваемая страница, и айфон тянул её резинкой
     сквозь лист. Всё, что не текст, прокрутку не получает. */
  box.addEventListener("touchmove", (e) => {
    if (!e.target.closest(".de-area, .de-kb")) e.preventDefault();
  }, { passive: false });

  const area = $("#deArea");
  const kb = document.getElementById("deKb");
  /* Лист не ужимается — он всегда во весь экран, чтобы за клавиатурой и
     системной плашкой айфона был его тёмный фон, а не лента с фотографиями.
     К клавиатуре поднимается только маленькая панель вложений; тексту
     добавляется нижний отступ, чтобы строка не ныряла под клавиатуру. */
  const vv = window.visualViewport;
  const fit = vv ? () => {
    const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    if (kb) kb.style.transform = "translateY(-" + inset + "px)";
    area.style.paddingBottom = (inset + (kb ? 60 : 14)) + "px";
  } : null;
  if (fit) { fit(); vv.addEventListener("resize", fit); vv.addEventListener("scroll", fit); }
  const gone = () => {
    if (fit) { vv.removeEventListener("resize", fit); vv.removeEventListener("scroll", fit); }
    box.remove();
  };

  area.value = rec ? (rec.text || "") : dyDraft;
  bindPasteCleanup(area);
  bindFmtToggle("deFmt");
  /* Фокус — сразу и в том же жесте, которым открыли лист: отложенный фокус
     айфон не считает продолжением нажатия и клавиатуру не выдвигает. */
  area.focus();
  try { area.setSelectionRange(area.value.length, area.value.length); } catch {}
  if (isNew) dyPreviewLoad();

  $("#deClose").addEventListener("click", () => {
    if (isNew) dyDraft = area.value;      // не выбрасываем начатое
    dyEditing = null;
    gone();
  });
  $("#deSave").addEventListener("click", () => {
    const text = fixHyphenBreaks(area.value || "").trim();
    if (isNew) {
      if (!text && !pendingMedia) { toast("Пока пусто"); return; }
      dyDraft = ""; dyEditing = null;
      gone();
      diaryAdd(text);
      return;
    }
    rec.text = text.slice(0, 4000);
    rec.editedAt = now(); rec.updatedAt = now();
    dyEditing = null;
    saveData(); schedulePush();
    gone();
    if (tab === "diary") renderDays(); else if (tab === "notes") renderNotes();
    toast("Сохранено");
  });

  // вложение перерисовывает лист; текст при этом бережём в черновике
  const reopen = () => { dyDraft = area.value; openDayEditor(); };
  const mic = $("#deMic");
  if (mic) mic.addEventListener("click", () => openTakeSheet(true, (blob, ms) => {
    pendingMedia = { id: uid(), kind: "audio", blob, ms, url: URL.createObjectURL(blob) };
    reopen();
  }));
  const cam = $("#deCam");
  if (cam) cam.addEventListener("click", async () => {
    const f = await pickPhoto();
    if (!f) return;
    try {
      const blob = await shrinkPhoto(f);
      pendingMedia = { id: uid(), kind: "photo", blob, ms: 0, url: URL.createObjectURL(blob) };
      reopen();
    } catch { toast("Не получилось прочитать снимок"); }
  });
  const dr = $("#deDrop");
  if (dr) dr.addEventListener("click", () => { pendingMedia = null; reopen(); });
}

let dyMenu = null;   // запись, у которой раскрыты действия

/* Подпись под записью — одна тихая строка: время, улица, градусы. */
function dyFootText(t) {
  const clock = new Intl.DateTimeFormat("ru", { hour: "2-digit", minute: "2-digit" });
  const bits = [clock.format(new Date(t.createdAt || fromStr(t.date)))];
  const sp = spot(t);
  if (sp) bits.push(sp);
  if (t.temp != null) bits.push(tempText(t.temp));
  return bits.join(" · ") + (t.editedAt ? " · изм." : "") + (t.liked ? " · ♥" : "");
}

function renderDays() {
  const list = diaryList().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const clock = new Intl.DateTimeFormat("ru", { hour: "2-digit", minute: "2-digit" });
  const dfmt = new Intl.DateTimeFormat("ru", { weekday: "long", day: "numeric", month: "long" });
  const nowYear = new Date().getFullYear();
  const dayName = (ds) => {
    if (ds === todayStr()) return "Сегодня";
    const d = fromStr(ds);
    return dfmt.format(d) + (d.getFullYear() !== nowYear ? " " + d.getFullYear() : "");
  };
  const foot = dyFootText;

  let feed = "", lastD = "";
  if (!cfg.diaryCal) feed = list.map((t) => {
    const head = t.date !== lastD ? `<div class="lib-group">${esc(dayName(t.date))}</div>` : "";
    lastD = t.date;
    return head + `
      <article class="dy-card" data-dyid="${t.id}">
        ${t.text ? `<p class="dy-text">${esc(t.text)}</p>` : ""}
        ${mediaHTML(t)}
        <div class="dy-foot">
          <span class="dy-when">${esc(foot(t))}</span>
          ${dyMenu === t.id ? `
            <span class="dy-acts">
              <button class="th-act" data-copy="${t.id}" type="button" aria-label="Скопировать">⧉</button>
              <button class="th-act like ${t.liked ? "on" : ""}" data-dylike="${t.id}" type="button"
                aria-label="${t.liked ? "Убрать из любимых" : "В любимые"}">${t.liked ? "♥" : "♡"}</button>
              <button class="th-act" data-dyedit="${t.id}" type="button" aria-label="Изменить">✎</button>
              <button class="th-act" data-dydrop="${t.id}" type="button" aria-label="Удалить">✕</button>
            </span>`
          : `<button class="dy-more" data-dymenu="${t.id}" type="button" aria-label="Действия">⋯</button>`}
        </div>
      </article>`;
  }).join("");

  $("#view").innerHTML = `
    <button class="dy-open" id="dyOpen" type="button">Записать…</button>
    <div class="seg" id="dyMode">
      <button data-dymode="feed" class="${!cfg.diaryCal ? "on" : ""}" type="button">Лента</button>
      <button data-dymode="cal" class="${cfg.diaryCal ? "on" : ""}" type="button">Календарь</button>
    </div>
    ${cfg.diaryCal
      ? diaryCalHTML(list)
      : (feed || `<div class="empty-note">Пока пусто. Нажми на поле выше —<br>дата, место и погода прикрепятся сами.</div>`)}`;

  /* Сети в отрисовке нет вовсе: место и погода спрашиваются только когда
     открыт лист записи. Вкладка листается мгновенно, а не после гео-опроса. */

  $("#dyOpen").addEventListener("click", () => openDayEditor());
  document.querySelectorAll("[data-dymode]").forEach((b) =>
    b.addEventListener("click", () => { cfg.diaryCal = b.dataset.dymode === "cal"; saveCfg(); dyMenu = null; renderDays(); }));
  document.querySelectorAll("[data-dycal]").forEach((b) =>
    b.addEventListener("click", () => {
      const next = diaryCalShift + Number(b.dataset.dycal);
      if (next > 0) return;
      diaryCalShift = next; renderDays();
    }));
  document.querySelectorAll("[data-dymenu]").forEach((b) =>
    b.addEventListener("click", () => { dyMenu = dyMenu === b.dataset.dymenu ? null : b.dataset.dymenu; renderDays(); }));
  document.querySelectorAll("[data-copy]").forEach((b) =>
    b.addEventListener("click", () => {
      const t = (data.thoughts || []).find((x) => x.id === b.dataset.copy);
      if (t) copyText(t.text || "");
    }));
  document.querySelectorAll("[data-dylike]").forEach((b) =>
    b.addEventListener("click", () => {
      const t = (data.thoughts || []).find((x) => x.id === b.dataset.dylike);
      if (!t) return;
      t.liked = !t.liked; t.updatedAt = now();
      dyMenu = null;
      saveData(); schedulePush(); renderDays();
    }));
  document.querySelectorAll("[data-dyedit]").forEach((b) =>
    b.addEventListener("click", () => {
      const t = (data.thoughts || []).find((x) => x.id === b.dataset.dyedit);
      dyMenu = null;
      if (t) openDayEditor(t);
    }));
  document.querySelectorAll("[data-dydrop]").forEach((b) =>
    b.addEventListener("click", () => {
      if (!confirm("Удалить эту запись дня?")) return;
      const t = (data.thoughts || []).find((x) => x.id === b.dataset.dydrop);
      if (!t) return;
      t.deleted = true; t.updatedAt = now();
      if (t.mediaId) takeDrop(t.mediaId);
      dyMenu = null;
      saveData(); schedulePush(); renderDays();
    }));
  document.querySelectorAll("[data-shot-src]").forEach((el) => {
    el.dataset.bound = "1";
    el.addEventListener("click", () => openShotFull(el.dataset.shotSrc, el.dataset.shotWhen));
  });
}

function renderNotes() {
  /* У событий, записанных до появления поля, метки награды нет — достаём
     её из идентификатора: он собран как ev:ach:<метка>:<дата>. */
  const evTag = (t) => t.tag || (String(t.id).split(":")[2] || "");

  /* Имя на фишке режем по длине. Одного многоточия из CSS мало: фишка стоит
     во флексе рядом с иконкой и отступами, и «Ослепление Полифема — группа из
     Сперлонги» вылезало за край. Режем по слову, чтобы обрыв не приходился на
     середину. */
  const ЧИП = 28;
  const чип = (имя) => {
    const s2 = String(имя || "");
    if (s2.length <= ЧИП) return s2;
    const край = s2.slice(0, ЧИП);
    const пробел = край.lastIndexOf(" ");
    return (пробел > ЧИП * 0.6 ? край.slice(0, пробел) : край).replace(/[\s—–-]+$/, "") + "…";
  };

  /* Текст карточки сессии по книге пересобираем на месте. Он записывался
     один раз, при отметке, — и старые карточки навсегда остались бы без
     промежутка. Данные для него всё равно лежат в самой записи дня. */
  const dayEntry = (t) => {
    if (t.track === "book") return (data.book.entries || []).find(
      (x) => !x.deleted && (x.bookId || "snow-1") === t.key && x.date === t.date);
    if (t.track === "piano") return (data.piano.entries || []).find(
      (x) => !x.deleted && (x.pieceId || "bwv853") === t.key && x.date === t.date);
    if (t.track === "pastel") return (data.pastel.entries || []).find(
      (x) => !x.deleted && x.date === t.date);
    return null;
  };
  const textOf = (t) => {
    if (t.event !== "session" || !t.key) return t.text;
    const e = dayEntry(t);
    const текст = e ? sessionText(t.track, e) : t.text;
    /* Текст пересобирается по живой записи дня — иначе он врал бы после
       правки страницы. Но глагол закрытия в записи не хранится, и «Дочитал»
       превращалось обратно в «Читал»: держим его по сохранённому итогу. */
    return t.farewell ? String(текст).replace(/^Читал:/, "Дочитал:") : текст;
  };

  // один материал за день считаем один раз: событий в ленте много, а дней мало
  const dayCache = new Map();
  const progressOf = (t) => {
    if (t.event !== "session" || !t.key || !t.track) return { ach: t.awards || [], arts: t.arts || [] };
    const ck = t.track + "|" + t.key + "|" + t.date;
    if (!dayCache.has(ck)) dayCache.set(ck, dayProgress(t.track, t.key, t.date));
    const live = dayCache.get(ck);
    const join = (a, b) => {
      const seen = new Set((a || []).map(x => x.id));
      return (a || []).concat((b || []).filter(x => x && !seen.has(x.id)));
    };
    /* Карточек знаний в ленте больше нет: они сняты, и фишка вела в никуда.
       Вместо них — артефакты, открывшиеся этой отметкой: у них есть куда
       вести. */
    return { ach: join(t.awards, live.ach), arts: join(t.arts, live.arts) };
  };

  if (!hasMaterials()) { renderEmpty("Моментов пока нет", "Они появятся вместе с первым материалом."); return; }

  /* Завершённое из выбора убрано: по досмотренному ролику новых мыслей уже
     не пишут, а список он засорял. Старые записи по нему остаются на месте —
     здесь речь только о том, к чему привязать новую.
     И первым пунктом — ничего: мысль не обязана быть о материале. */
  const allMats = achMaterials();
  /* Пройденное и спрятанное сюда не попадает: книга дочитана — писать о ней
     заметку из этого списка незачем, материал убран с главной — тем более.
     Ролики остаются: мысль о фильме приходит и после того, как он досмотрен. */
  const mats = allMats.filter(m => (m.track === "watch" || !m.done) && !m.hidden);
  const key = cfg.thoughtKey === NO_MAT ? NO_MAT
    : (cfg.thoughtKey && mats.some(m => keyOf(m) === cfg.thoughtKey)) ? cfg.thoughtKey
    : (mats.some(m => keyOf(m) === currentKey()) ? currentKey() : NO_MAT);
  const cur = key === NO_MAT ? NO_MAT_ITEM : (mats.find(m => keyOf(m) === key) || mats[0] || NO_MAT_ITEM);

  const all = thoughts().filter((t) => !t.diary).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
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
      ${fmtToggleHTML("thFmt")}
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
          ${fmtToggleHTML("thFmtEdit")}
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
              <button class="th-act" data-copy="${t.id}" type="button" aria-label="Скопировать">⧉</button>
              ${t.event ? "" : `
              <button class="th-act like ${t.liked ? "on" : ""}" data-like="${t.id}" type="button"
                aria-label="${t.liked ? "Убрать из любимых" : "В любимые"}">${t.liked ? "♥" : "♡"}</button>
              <button class="th-act" data-edit="${t.id}" type="button" aria-label="Изменить">✎</button>
              <button class="th-act" data-th="${t.id}" type="button" aria-label="Удалить">✕</button>`}
            </span>
          </div>
          ${((x) => x ? `<p class="post-text">${esc(x)}</p>` : "")(textOf(t))}
          ${t.farewell ? `
            <div class="ev-awards">
              <button class="ev-aw" type="button" data-ev-book="${esc(t.key)}"><i>📕</i><span>Показать итог</span></button>
            </div>` : ""}
          ${((p) => p.ach.length || p.arts.length ? `
            <div class="ev-awards">
              ${p.ach.map((a) => `
                <button class="ev-aw" type="button" data-ev-ach="${esc(a.id)}"
                  data-ev-key="${esc(t.key)}" data-ev-track="${esc(t.track)}">
                  <i>${esc(evIcon(t, a.id) || a.icon || "✦")}</i><span>${esc(чип(evName(t, a.id, "ach", a.name)))}</span>
                </button>`).join("")}
              ${p.arts.map((x) => `
                <button class="ev-aw art" type="button" data-ev-art="${esc(x.id)}" data-ev-key="${esc(t.key)}">
                  <i>${esc(x.icon || "🏺")}</i><span>${esc(чип(x.name))}</span>
                </button>`).join("")}
            </div>` : "")(progressOf(t))}
          ${mediaHTML(t)}
        </article>`).join("")}
    </div>` : `<div class="empty-note">Здесь копятся моменты: мысль, запись, снимок.<br>Первый можно оставить прямо сейчас.</div>`}`;

  document.querySelectorAll("[data-shot-src]").forEach((el) => {
    el.dataset.bound = "1";           // тот же признак, что и у подменённых на лету
    el.addEventListener("click", () => openShotFull(el.dataset.shotSrc, el.dataset.shotWhen));
  });

  /* Награда в ленте — не текст, а ссылка на саму награду: жмёшь и видишь,
     за что она и что там написано. */
  evNameCache.clear();     // лента перерисована — заголовки считаем заново

  /* Артефакт в ленте ведёт к самому предмету на вкладке артефактов: там его
     справка, музей и ссылки. Если предмет с тех пор сняли — говорим об этом. */
  document.querySelectorAll("[data-ev-art]").forEach(el =>
    el.addEventListener("click", () => {
      const x = musItems().find((y) => y.id === el.dataset.evArt);
      if (!x) { toast("Предмет не нашёлся — его уже нет в собрании"); return; }
      mus.book = x.book; mus.at = x.id;
      tab = "mus"; cfg.tab = "mus"; saveCfg();
      render(); window.scrollTo(0, 0);
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

  /* Итог по закрытой книге можно открыть из ленты ещё раз: пересчитываем по
     живым данным, а если книги уже нет — показываем то, что сохранилось в
     самом событии. */
  document.querySelectorAll("[data-ev-book]").forEach(el =>
    el.addEventListener("click", () => {
      const id = el.dataset.evBook;
      const bk = (data.book.books || []).find((b) => b.id === id);
      const ev = thoughts().find((t) => t.farewell && t.key === id);
      if (bk) { overlayQueue = []; showBookDone(bk); }
      else if (ev && ev.farewell) { overlayQueue = []; showBookDone({ title: (ev.text || "").replace(/^\S+:\s*/, "").split(" · ")[0] }, ev.farewell); }
      else toast("Итог не нашёлся — книги уже нет");
    }));

  const area = $("#thText");
  bindPasteCleanup(area);
  bindPasteCleanup($("#thEdit"));
  bindFmtToggle("thFmt");
  bindFmtToggle("thFmtEdit");

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
        .catch((e) => { if (noRoom(e)) toast("Не хватило места — вложение не сохранилось"); });
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

  /* Править в маленьком окошке посреди ленты неудобно — правка открывает
     тот же полноэкранный лист, что у дневника. */
  document.querySelectorAll("[data-edit]").forEach(b =>
    b.addEventListener("click", () => {
      const t = (data.thoughts || []).find(x => x.id === b.dataset.edit);
      if (t) openDayEditor(t);
    }));

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

  document.querySelectorAll("[data-copy]").forEach(b =>
    b.addEventListener("click", () => {
      const t = (data.thoughts || []).find(x => x.id === b.dataset.copy);
      if (t) copyText(textOf(t) || t.text || "");
    }));
  document.querySelectorAll("[data-th]").forEach(b =>
    b.addEventListener("click", () => {
      if (!confirm("Удалить эту мысль?")) return;
      const t = (data.thoughts || []).find(x => x.id === b.dataset.th);
      if (!t) return;
      t.deleted = true; t.updatedAt = now();
      if (t.mediaId) takeDrop(t.mediaId);
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
  /* Один показ в день. Второй заводился под дневник — утром мысль, вечером
     день, — но дневник спрятан, а мысль, выпрыгивающая второй раз при
     переходе по вкладкам, ощущается сбоем, не подарком. */
  if (st.off || st.date === todayStr()) return;
  if (!data || !data.thoughts) return;
  if ($("#cheer")?.classList.contains("show")) return;   // не перебиваем награды
  /* И в зазор между экранами очереди тоже не лезем: там класс show уже снят,
     а через 220 мс придёт следующая награда и затрёт мысль — показанной она
     при этом успевала записаться, то есть пропадала не прочитанной. */
  if (overlayQueue.length || overlayHop) return;
  if ($("#sheet")?.classList.contains("show")) return;

  /* События — не мысли. «Занимался: Бах — Прелюдия es-moll» в качестве мысли
     дня выглядит как сбой: перечитывать там нечего. Заодно отсеиваем записи
     без текста — одно вложение показывать этим экраном нечем.
     Наугад из ленты такие уже не тянулись, а сюда фильтр не доехал. */
  const list = thoughts().filter((t) => !t.event && String(t.text || "").trim());
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
  const dayMeta = t.diary ? [t.place || "", t.temp != null ? tempText(t.temp) : ""].filter(Boolean).join(" · ") : "";
  const mats = achMaterials();
  const m = t.key ? mats.find(x => keyOf(x) === t.key) : null;
  const a = t.key ? (data.archive || []).find(x => x.id === t.key) : null;
  const src = m || a || null;
  // мысль сама по себе — подписываем так же, как в ленте, а не «Архивом»
  const icon = t.diary ? "🗓" : src ? (src.icon || "📖") : (t.key ? "📎" : NO_MAT_ITEM.icon);
  const title = t.diary ? "Дневник" : src ? src.title : (t.key ? "Архив" : NO_MAT_ITEM.title);
  const cover = src && src.cover ? src.cover : "";
  const fmt = new Intl.DateTimeFormat("ru", { day: "numeric", month: "long", year: "numeric" });

  $("#cheerStep").hidden = true;
  $("#cheerIc").textContent = "💭";
  $("#cheerTitle").textContent = "Мысль дня";
  $("#cheerText").innerHTML = `
    <span class="dt-src">
      <span class="th-cover">${cover ? `<img src="${esc(cover)}" alt="">` : `<i>${icon}</i>`}</span>
      <span class="dt-src-txt"><b>${esc(title)}</b><em>${esc(fmt.format(fromStr(t.date)))}${dayMeta ? " · " + esc(dayMeta) : ""}</em></span>
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
      <div class="fz-note">${cfg.sound
        ? (has ? "У текущего материала звук есть" : "У текущего материала звука пока нет — тишина")
        : "Звук есть не у всех материалов"}</div>
    </div>`;
}

function bindSoundUI() {
  document.querySelectorAll("[data-sound]").forEach(b =>
    b.addEventListener("click", () => {
      cfg.sound = b.dataset.sound === "on";
      if (cfg.sound) useMark("звук");
      saveCfg();
      audioUnlocked = true;         // это и есть нужный жест
      render();
      toast(cfg.sound ? "Атмосфера включена" : "Тишина");
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
  const like = $("#likeFab"), dice = $("#diceFab"), srt = $("#sortFab");
  if (!like || !dice) return;
  const here = tab === "notes" && !settingsOpen && data && data.thoughts;
  const total = here ? thoughts().length : 0;
  const n = here ? thoughts().filter(t => t.liked).length : 0;
  like.classList.toggle("show", n > 0);
  like.classList.toggle("on", notesFilter === "liked");
  like.innerHTML = `<i>${notesFilter === "liked" ? "♥" : "♡"}</i><b>${n}</b>`;
  dice.classList.toggle("show", total > 1);
  /* Раскладка по датам — той же породы: закреплена в левом нижнем углу
     на «Захотелось», пока есть что раскладывать. */
  if (srt) srt.classList.toggle("show",
    tab === "wish" && !settingsOpen && !wishTriage && wishFilter === "open"
    && !!data && wishes().filter((w) => !w.done).length > 1);
}



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

let prac = null;          // состояние идущего занятия
let pracTimer = 0;

const pracDoc = () => PRACTICE_DATA[piece().id] || null;



const pracStore = () => {
  data.practice = data.practice || {};
  const id = piece().id;
  data.practice[id] = data.practice[id] || { done: {}, session: 0 };
  return data.practice[id];
};

/* Разбор — единственное, что живёт не списком, а свёрткой по пьесам, поэтому
   общего слияния по updatedAt ему не досталось. Чтобы оно стало возможным,
   нужна отметка времени. Ставить её в каждом месте, где разбор меняется, —
   значит однажды забыть; смотрим на сохранение, оно и есть общее горлышко. */
let pracSeen = Object.create(null);
const pracPrint = (st) => {
  const { at, ...rest } = st;      // сама отметка в отпечаток не входит
  return JSON.stringify(rest);
};

function pracStamp(mark) {
  const all = (data && data.practice) || null;
  if (!all || typeof all !== "object") return;
  for (const id of Object.keys(all)) {
    const st = all[id];
    if (!st || typeof st !== "object") continue;
    const print = pracPrint(st);
    const seen = pracSeen[id];
    pracSeen[id] = print;
    /* Первую встречу не помечаем: данные могли пролежать на устройстве неделю,
       и выдавать их за свежие нечестно — на другом телефоне они бы победили. */
    if (mark && seen !== undefined && seen !== print) st.at = now();
  }
}

const VID_KEYS = ["url", "ya", "yt", "vk"];

function mergePrac(mine, theirs) {
  const out = {};
  const ids = new Set([...Object.keys(mine || {}), ...Object.keys(theirs || {})]);
  for (const id of ids) {
    const a = (mine || {})[id], b = (theirs || {})[id];
    if (!a || typeof a !== "object") { out[id] = b; continue; }
    if (!b || typeof b !== "object") { out[id] = a; continue; }
    // при равенстве отметок своё главнее: чужое тогда только заполняет пустоты
    const fresh = (b.at || 0) > (a.at || 0) ? b : a;
    const old = fresh === a ? b : a;
    out[id] = { ...old, ...fresh };
    /* Пройденное не выбирают, его складывают: иначе такты, закрытые на втором
       телефоне, пропадут молча. */
    out[id].done = Object.assign({}, old.done || {}, fresh.done || {});
    /* Просмотренные минуты лекций — тоже свёртка по занятиям, и брать её
       целиком со свежей стороны нельзя: занятие, которое смотрели только на
       втором телефоне, пропало бы молча. Сравниваем каждое занятие отдельно. */
    if (old.seen || fresh.seen) {
      const seen = {};
      for (const k of new Set([...Object.keys(old.seen || {}), ...Object.keys(fresh.seen || {})])) {
        const a = (old.seen || {})[k], b = (fresh.seen || {})[k];
        if (!a) { seen[k] = b; continue; }
        if (!b) { seen[k] = a; continue; }
        // дальше досмотрели — та запись и главная; при равенстве складываем дни
        const дальше = (b.at || 0) > (a.at || 0) ? b : a;
        const другой = дальше === a ? b : a;
        seen[k] = { ...дальше };
        if ((a.at || 0) === (b.at || 0)) {
          const дни = { ...(другой.byDay || {}) };
          for (const [d, v] of Object.entries(дальше.byDay || {}))
            дни[d] = Math.max(дни[d] || 0, v);
          seen[k].byDay = дни;
        }
      }
      out[id].seen = seen;
    }
    /* Заходы — списки, и складывать их надо по-своему: берём тот список, где
       заходов больше. Они дописываются только в конец, так что длинный
       включает короткий; выбрать «свежий целиком» значило бы потерять то, что
       набрано на другом телефоне.
       У тактов заходы разложены по шагам (чтение, ключи, вместе) — сравниваем
       каждый шаг отдельно, иначе один общий выбор терял бы чужую работу
       целиком. Сшивки блоков лежат простыми списками. */
    const гашеных = (x) => (x || []).filter((r) => r && r.off).length;
    const длиннее = (a, b) => {
      a = a || []; b = b || [];
      if (a.length !== b.length) return a.length > b.length ? a : b;
      return гашеных(b) > гашеных(a) ? b : a;      // отмена — знание более свежее
    };
    {
      const свод = {};
      for (const src of [old.reps || {}, fresh.reps || {}])
        for (const такт of Object.keys(src)) {
          const box = Array.isArray(src[такт]) ? { both: src[такт] } : (src[такт] || {});
          свод[такт] = свод[такт] || {};
          for (const шаг of Object.keys(box)) свод[такт][шаг] = длиннее(свод[такт][шаг], box[шаг]);
        }
      out[id].reps = свод;
    }
    {
      const свод = {};
      for (const src of [old.final || {}, fresh.final || {}])
        for (const k of Object.keys(src)) свод[k] = длиннее(свод[k], src[k]);
      out[id].final = свод;
    }
    out[id].session = Math.max(a.session || 0, b.session || 0);
    out[id].at = Math.max(a.at || 0, b.at || 0);
    /* Источник видео всегда один: если свежая запись его сменила, прежние
       адреса воскресать не должны. */
    if (VID_KEYS.some((k) => fresh[k]))
      for (const k of VID_KEYS) if (!fresh[k]) delete out[id][k];
  }
  return out;
}

/* ── Круги и заходы ──
   Пьеса режется на блоки не длиннее четырёх тактов. Внутри блока такты идут
   по кругу: сыграл первый — отметил, второй — отметил, и так до конца блока,
   потом сначала. Каждому такту нужно набрать десять заходов; когда набрали
   все, блок сшивается целиком.

   Отметка не одна: «легко», «с усилием», «сложно». Это не оценка себе, а
   способ увидеть, где именно тяжело, — и условие для сшивки: пока блок
   целиком идёт «сложно», он повторяется. */
/* Три захода на шаг, а не пять. Пять было взято на глаз и оказалось долгим:
   четыре такта в блоке при пяти этапах — это сотня повторений на блок, и до
   сшивки приходилось идти неделю. Три держат тот же смысл — «сыграл несколько
   раз подряд, а не один», — но блок закрывается за вечер-другой.
   Уже набранное не пропадает: шаги, где заходов три и больше, просто
   становятся закрытыми, и разбор сдвигается вперёд. */
const REP_GOAL = 3;                  // сколько заходов набирает каждый шаг такта
const BLOCK_MAX = 4;                 // максимум тактов в блоке
const LVLS = [
  { k: 1, name: "Легко",     hint: "пальцы сами" },
  { k: 2, name: "С усилием", hint: "вышло, но пришлось собраться" },
  { k: 3, name: "Сложно",    hint: "спотыкался" },
];

function pracBlocks() {
  const bars = piece().bars || 0;
  const out = [];
  for (let f = 1; f <= bars; f += BLOCK_MAX)
    out.push({ i: out.length, from: f, to: Math.min(bars, f + BLOCK_MAX - 1) });
  return out;
}
const blockKey = (bl) => bl.from + "-" + bl.to;
const blockOfBar = (b) => pracBlocks().find((x) => b >= x.from && b <= x.to) || null;
/* Название блока берём из разбора, если его границы совпали с частью: там оно
   написано словами музыканта — «период I, фраза 2». */
const blockWhy = (bl) => {
  const p = (pracDoc() && pracDoc().parts || []).find((x) => x.from === bl.from && x.to === bl.to);
  return p ? { why: p.why || "", note: p.note || "" } : { why: "", note: "" };
};

/* ── Шаги внутри такта ──
   Такт не «сыгран» одной кнопкой. Сначала его читают глазами, потом играют
   каждым ключом порознь, и только потом двумя руками — и у каждого шага свой
   счёт, потому что трудность у них разная: ноты могут читаться легко, а
   вместе не складываться.

   На такте с одной звучащей рукой шагов меньше: разделять там нечего. */
/* Заходов у каждого шага поровну: чтение ключа — такая же работа, как игра, и
   двух раз ему не хватает. Один шаг — один счёт до десяти. */
const STEP_GOALS = { readR: REP_GOAL, readL: REP_GOAL, right: REP_GOAL, left: REP_GOAL, both: REP_GOAL };
const STEP_NAME = {
  readR: "Читаю скрипичный ключ",
  readL: "Читаю басовый ключ",
  right: "Играю скрипичный ключ",
  left: "Играю басовый ключ",
  both: "Играю двумя руками",
};
// какой ключ у шага: по нему пишется отрезок в запись дня
const STEP_HAND = { readR: "right", readL: "left", right: "right", left: "left" };

/* Какие шаги есть у этого такта. Ключи разбираются порознь и подряд: сначала
   прочитал скрипичный — сразу его и сыграл, потом то же с басовым, и лишь
   после этого вместе. Читать оба ключа сразу, а играть их через три шага —
   значит забыть прочитанное по дороге. */
function barSteps(b) {
  const doc = pracDoc();
  const h = doc && doc.hints && doc.hints[b];
  if (!h) return ["readR", "readL", "right", "left", "both"];
  const r = !!h.r, l = !!h.l;
  if (r && l) return ["readR", "right", "readL", "left", "both"];
  return r ? ["readR", "right"] : ["readL", "left"];
}
const barMain = (b) => barSteps(b)[barSteps(b).length - 1];

const repsStore = () => {
  const st = pracStore();
  st.reps = st.reps || {};      // такт → { шаг: список заходов }
  st.final = st.final || {};    // блок → список сшивок
  return st;
};
/* Первая версия держала у такта один список. Читаем её как заходы «двумя
   руками» — терять набранное из-за смены формы незачем. */
function barBox(b, make) {
  const st = repsStore();
  const cur = st.reps[b];
  if (Array.isArray(cur)) { st.reps[b] = { both: cur }; return st.reps[b]; }
  if (cur && typeof cur === "object") {
    /* Раньше чтение было одно на такт, без ключа. Переселяем его в тот ключ,
       который на этом такте читают первым: набранное не должно пропадать. */
    if (cur.read) {
      const первый = barSteps(b)[0];
      cur[первый] = (cur[первый] || []).concat(cur.read);
      delete cur.read;
    }
    return cur;
  }
  /* На чтении пустых тактов не заводим: иначе один взгляд в список пишет в
     данные сорок пустых записей и гонит их в гист. */
  if (!make) return {};
  st.reps[b] = {};
  return st.reps[b];
}
/* Главный шаг такта всегда набирает полные десять заходов: на такте, где
   звучит одна рука, именно он и есть игра — сокращать ему счёт не за что.
   Подготовительные шаги короче: их дело — довести до главного. */
/* Блок можно попросить пройти ещё раз: тогда каждому его шагу добавляется по
   три захода, и занятие само возвращается от сшивки к тактам. Столько раз,
   сколько нужно, — пока кусок не начнёт звучать так, как хочется. */
const EXTRA_STEP = 3;
const extraOf = (b) => {
  const bl = blockOfBar(b);
  return bl ? ((repsStore().extra || {})[blockKey(bl)] || 0) : 0;
};
function extraAdd(bl) {
  const st = repsStore();
  st.extra = st.extra || {};
  st.extra[blockKey(bl)] = (st.extra[blockKey(bl)] || 0) + EXTRA_STEP;
  st.at = now();
}
const stepGoal = (b, step) =>
  (step === barMain(b) ? REP_GOAL : (STEP_GOALS[step] || REP_GOAL)) + extraOf(b);
/* Отменённый заход не вырезаем, а гасим пометкой: вырезанный воскресал при
   слиянии с гистом — там из двух списков побеждает более длинный, и удаление
   выглядело как «на этом устройстве ещё не доехало». */
const repsRaw = (b, step) => barBox(b)[step || barMain(b)] || [];
const repsOf = (b, step) => repsRaw(b, step).filter((r) => !r.off);
const stepDone = (b, step) => repsOf(b, step).length >= stepGoal(b, step);
const repCount = (b, step) => Math.min(stepGoal(b, step || barMain(b)), repsOf(b, step).length);
// такт готов, когда закрыты все его шаги
const barReady = (b) => barSteps(b).every((st) => stepDone(b, st));
// сколько заходов набрано по такту всего — по этому и идёт круг
const barMarks = (b) => barSteps(b).reduce((n, st) => n + repsOf(b, st).length, 0);

const finalRaw = (bl) => repsStore().final[blockKey(bl)] || [];
const finalOf = (bl) => finalRaw(bl).filter((r) => !r.off);
/* Сшивка засчитана, когда последний заход был не «сложно»: сложный повторяется
   до тех пор, пока блок не пойдёт хотя бы с усилием. */
const finalPassed = (bl) => {
  const list = finalOf(bl);
  return list.length > 0 && (list[list.length - 1].lvl || 3) <= 2;
};

/* ── Прогон с начала ──
   Сшивка соединяет четыре такта между собой, но пьеса от этого не становится
   пьесой: блоки остаются отдельными островами. Поэтому после каждой сшивки
   идёт ещё один заход — с первого такта до конца этого блока. Сшил 5–8 —
   играешь 1–8, сшил 9–12 — играешь 1–12, и так до последнего такта.

   Отдельного хранилища не нужно: прогон — это та же сшивка, только на более
   длинном отрезке, и ключ у него выходит сам собой — «1-8». У первого блока
   прогон совпадает со сшивкой («1-4»), поэтому там его нет. */
const runOf = (bl) => finalOf({ from: 1, to: bl.to });
const runNeeded = (bl) => bl.from > 1;
const runPassed = (bl) => {
  if (!runNeeded(bl)) return true;
  const list = runOf(bl);
  return list.length > 0 && (list[list.length - 1].lvl || 3) <= 2;
};
function blockReady(bl) {
  for (let b = bl.from; b <= bl.to; b++) if (!barReady(b)) return false;
  return true;
}
const blockDone = (bl) => blockReady(bl) && finalPassed(bl) && runPassed(bl);

function repAdd(u, lvl) {
  const st = repsStore();
  const rec = { lvl, d: todayStr(), at: now() };
  if (u.final) (st.final[blockKey(u)] = st.final[blockKey(u)] || []).push(rec);
  else {
    const box = barBox(u.from, true);
    (box[u.step] = box[u.step] || []).push(rec);
  }
  st.at = now();
  return rec;
}
function repDrop(u) {
  const st = repsStore();
  const arr = u.final ? st.final[blockKey(u)] : barBox(u.from)[u.step];
  if (arr) for (let i = arr.length - 1; i >= 0; i--) if (!arr[i].off) { arr[i].off = 1; break; }
  st.at = now();
}

/* Какие руки звучат на такте. В начале прелюдии левая молчит три такта —
   писать под ними «оба ключа» было бы неправдой. */
function pracHands(u) {
  const doc = pracDoc();
  if (!doc || !doc.hints) return "both";
  let r = false, l = false;
  for (let b = u.from; b <= u.to; b++) {
    const h = doc.hints[b];
    if (!h) return "both";
    if (h.r) r = true;
    if (h.l) l = true;
  }
  return r && l ? "both" : r ? "right" : l ? "left" : "both";
}

/* ── Где мы сейчас ──
   Идём по блокам подряд. Внутри блока берём такт, у которого заходов меньше
   всех, при равенстве — самый левый: получается ровный круг. Внутри такта
   шаги идут по порядку — сначала чтение, потом ключи порознь, потом вместе, —
   поэтому первый заход на такт выглядит как «прочитал и сыграл», а следующие
   круги уже только игра двумя руками.

   Когда у всех тактов блока закрыты все шаги — сшивка блока целиком, и только
   после неё следующий блок. */
function pracWhere() {
  const blocks = pracBlocks();
  for (const bl of blocks) {
    if (!blockReady(bl)) {
      /* Круг считается по главному шагу — игре двумя руками. Пока такт впервые
         разбирают, он держит очередь за собой: прочитал, сыграл каждым ключом,
         сыграл вместе — и только теперь переходим к следующему. Иначе выходило
         бы «прочитал все четыре, потом сыграл все четыре», а он просил
         разучивать такт целиком и идти дальше. */
      let bar = bl.from, best = Infinity;
      for (let b = bl.from; b <= bl.to; b++) {
        if (barReady(b)) continue;
        const n = repsOf(b, barMain(b)).length;
        if (n < best) { best = n; bar = b; }
      }
      /* Внутри такта тоже круг: прочитал ключ — сразу его сыграл, потом второй
         ключ, потом вместе. Берём шаг с наименьшим числом заходов, при
         равенстве — тот, что раньше по порядку. Если брать первый незакрытый,
         выйдет десять чтений подряд, а потом десять игр: прочитанное к тому
         времени успевает забыться. */
      const шаги = barSteps(bar).filter((st) => !stepDone(bar, st));
      let step = шаги[0] || barMain(bar), мало = Infinity;
      for (const st of шаги) {
        const n = repsOf(bar, st).length;
        if (n < мало) { мало = n; step = st; }
      }
      return { blocks, bl, bar, step, round: repsOf(bar, step).length + 1 };
    }
    if (!finalPassed(bl)) return { blocks, bl, final: true, tries: finalOf(bl).length };
    if (!runPassed(bl)) return { blocks, bl, final: true, run: true, tries: runOf(bl).length };
  }
  return { blocks, finished: true };
}

/* Что показывать сейчас: шаг такта или сшивку блока. */
function pracUnitNow() {
  const w = pracWhere();
  if (w.finished) return null;
  if (!w.final) return { from: w.bar, to: w.bar, step: w.step, bl: w.bl, round: w.round };
  /* Прогон хранится и отменяется тем же кодом, что сшивка: ключ строится из
     from-to, и «1-8» получается сам. */
  return w.run
    ? { from: 1, to: w.bl.to, final: true, run: true, bl: w.bl }
    : { from: w.bl.from, to: w.bl.to, final: true, bl: w.bl };
}

/* ── Список тактов ──
   Весь путь одним экраном: блоки, в каждом такты с кружками заходов и сшивка.
   Видно, где стоишь, сколько осталось до перехода и как оно шло — по цвету. */
function pracBarInfo() {
  const bars = piece().bars;
  const p = passes();
  const seen = new Array(bars + 1).fill("");     // когда трогали в последний раз
  for (const e of entries()) {
    for (const sp of e.spans || [])
      for (let b = Math.max(1, sp.from); b <= Math.min(bars, sp.to); b++)
        if (e.date > seen[b]) seen[b] = e.date;
  }
  return { right: p.right, left: p.left, seen };
}

/* Пустые кружки — пунктиром, а тот, который сейчас закрываешь, выделен: без
   этого непонятно, какой заход идёт, — все незакрытые выглядят одинаково. */
const dotsHTML = (list, goal, свой) => {
  let out = "";
  const сейчас = свой === false ? -1 : list.length;
  for (let i = 0; i < goal; i++) {
    const r = list[i];
    out += `<i class="dot${r ? " l" + r.lvl : ""}${i === сейчас ? " now" : ""}"></i>`;
  }
  return out;
};

function pracListHTML() {
  const w = pracWhere();
  const blocks = w.blocks;
  const info = pracBarInfo();
  const today = todayStr();
  const ago = (ds) => {
    if (!ds) return "не трогал";
    const d = daysBetween(ds, today);
    return d <= 0 ? "сегодня" : d + " " + plural(d, "день", "дня", "дней") + " назад";
  };
  const готовых = blocks.filter(blockDone).length;

  return `
    <div class="pl-head-row">
      <b>Такты</b>
      <button class="th-link" data-prac="listClose" type="button">закрыть</button>
    </div>
    <div class="rt-head">Блоков пройдено ${готовых} из ${blocks.length} · у такта свои шаги: чтение, ключи, вместе</div>
    <div class="bl-list">
      ${blocks.map((bl) => {
        const тут = w.bl && w.bl.from === bl.from;
        const имя = blockWhy(bl).why;
        const rows = [];
        for (let b = bl.from; b <= bl.to; b++) {
          const мой = тут && !w.final && w.bar === b;
          rows.push(`
            <div class="rp-row${мой ? " now" : ""}${barReady(b) ? " done" : ""}">
              <b>такт ${b}</b>
              <span class="dots">${barSteps(b).map((st) =>
                `<span class="dgrp" title="${esc(STEP_NAME[st])}">${dotsHTML(repsOf(b, st), stepGoal(b, st),
                  тут && !w.final && w.bar === b && w.step === st)}</span>`).join("")}</span>
              <em>${barMarks(b)}/${barSteps(b).reduce((n, st) => n + stepGoal(b, st), 0)}</em>
            </div>`);
        }
        const f = finalOf(bl);
        rows.push(`
          <div class="rp-row fin${тут && w.final && !w.run ? " now" : ""}${finalPassed(bl) ? " done" : ""}">
            <b>вместе ${bl.from}–${bl.to}</b>
            <span class="dots">${f.length ? dotsHTML(f.slice(-5), Math.max(1, Math.min(5, f.length))) : '<i class="dot"></i>'}</span>
            <em>${finalPassed(bl) ? "сшит" : blockReady(bl) ? "пора сшивать" : "после кругов"}</em>
          </div>`);
        /* Прогон с начала — своя строка под сшивкой: видно, что блок сшит, но
           пьеса до этого места ещё не собрана. */
        if (runNeeded(bl)) {
          const r = runOf(bl);
          rows.push(`
            <div class="rp-row fin${тут && w.run ? " now" : ""}${runPassed(bl) ? " done" : ""}">
              <b>с начала 1–${bl.to}</b>
              <span class="dots">${r.length ? dotsHTML(r.slice(-5), Math.max(1, Math.min(5, r.length))) : '<i class="dot"></i>'}</span>
              <em>${runPassed(bl) ? "пройден" : finalPassed(bl) ? "пора с начала" : "после сшивки"}</em>
            </div>`);
        }
        return `
          <div class="bl-part${тут ? " now" : ""}${blockDone(bl) ? " done" : ""}">
            <div class="bl-head as-text">
              <span class="bl-name">${esc(имя || "Такты " + bl.from + "–" + bl.to)}</span>
              <span class="bl-sub">такты ${bl.from}–${bl.to} · ${blockDone(bl) ? "готов" : тут ? "здесь сейчас" : "впереди"}
                · ${esc(ago(info.seen[bl.from]))}</span>
            </div>
            ${rows.join("")}
          </div>`;
      }).join("")}
    </div>
    <p class="bl-note">Кружок — один заход: мятный «легко», золотой «с усилием», фиолетовый «сложно». Группы через чёрточку — чтение, скрипичный, басовый, обе руки. Блок сшивается, когда все шаги закрыты.</p>`;
}

const pracMin = () => prac && prac.startedAt ? (Date.now() - prac.startedAt - prac.breakMs) / 60000 : 0;

/* Раньше на двадцатой минуте занятие перебивалось экраном «передышка»
   с кнопками, а на шестидесятой — «пора закругляться». Решать за играющего,
   когда ему отдыхать, — не дело приложения: он и так чувствует руки. Осталась
   короткая строчка снизу, которая сама уходит. */
function pracWatch() {
  if (!prac || !prac.startedAt) return;
  const m = Math.floor(pracMin());
  if (m < PRAC_REST_AT) return;
  if (m % PRAC_REST_AT !== 0) return;             // отмечаем каждые двадцать минут
  if (prac.saidAt === m) return;
  prac.saidAt = m;
  toast(m >= 60 ? "Уже час за инструментом" : "Уже " + m + " минут");
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

let pracAudioEl = null, pracRaf = 0;
const PRAC_LOOP_LS = "keiko-practice-loop-v1";
const pracLoops = (() => { try { return JSON.parse(localStorage.getItem(PRAC_LOOP_LS)) || {}; } catch { return {}; } })();
const pracSaveLoops = () => { try { localStorage.setItem(PRAC_LOOP_LS, JSON.stringify(pracLoops)); } catch {} };

const plClock = (t) => {
  if (!isFinite(t)) return "0:00";
  const m = Math.floor(t / 60), sec = Math.floor(t % 60);
  return m + ":" + String(sec).padStart(2, "0");
};

/* ── Разметка записи по тактам ──
   В разборе может лежать marks: такт → секунда, где он начинается. Тогда плеер
   сам выделяет то место, которое сейчас разучиваешь, — не надо ловить пальцем
   границы на дорожке. Записи без разметки работают как раньше. */
const pracMarks = () => (pracDoc() || {}).marks || null;
function markSpan(u) {
  const m = pracMarks();
  if (!m || !u) return null;
  const a = m[u.from];
  if (!(a >= 0)) return null;
  let b = m[u.to + 1];
  if (!(b > a)) {
    const дальше = Object.keys(m).map(Number).filter((k) => k > u.to).sort((x, y) => x - y)[0];
    b = дальше ? m[дальше] : 0;
  }
  return b > a ? { a, b } : null;
}
/* Отрезок под текущий такт выставляется один раз на такт: дальше края можно
   двигать руками, и приложение их не перебивает. */
function plFollow(u) {
  if (!pracAudioEl || !u) return;
  const id = pracAudioEl.dataset.for;
  const sp = markSpan(u);
  const метка = u.from + "-" + u.to;
  const o = plOpt(id);
  if (o.followed === метка) return;
  if (!sp) {
    /* Дальше размеченных тактов выделение из прошлого места только мешает:
       нажмёшь «слушать» — заиграет чужой такт. Возвращаем весь трек. */
    if (o.followed) { delete o.a; delete o.b; o.followed = метка; pracSaveLoops(); plPaint(); }
    return;
  }
  o.followed = метка; o.a = sp.a; o.b = sp.b;
  pracSaveLoops();
  try { if (pracAudioEl.currentTime < sp.a || pracAudioEl.currentTime > sp.b) pracAudioEl.currentTime = sp.a; } catch {}
  plPaint();
}

function plSel(id, dur) {
  const l = pracLoops[id];
  if (l && isFinite(l.a) && isFinite(l.b) && l.b > l.a) return { a: l.a, b: Math.min(l.b, dur || l.b) };
  return { a: 0, b: dur || 0 };
}

/* Настройки прослушивания живут рядом с выделением, в той же записи: скорость,
   увеличение и шаг сетки. У каждой вещи свои. */
/* Совсем медленно — чтобы успевать разбирать по нотам. Прежние значения
   оставлены как были: у кого что выбрано, то и останется. */
/* И медленнее, и быстрее: медленно — чтобы успевать разбирать, быстро —
   чтобы прослушать кусок целиком, не тратя на него полного времени. */
const PL_RATES = [0.25, 0.5, 0.75, 0.9, 1, 1.25, 1.5];
const PL_GRIDS = [1, 2, 5];
const plOpt = (id) => (pracLoops[id] = pracLoops[id] || {});
const plRate = (id) => PL_RATES.includes(plOpt(id).rate) ? plOpt(id).rate : 1;
const plGrid = (id) => PL_GRIDS.includes(plOpt(id).grid) ? plOpt(id).grid : 2;

/* Края примагничиваются к сетке. Разметку по тактам делать не стали: она
   требует ручной привязки к каждой записи, а играют их всякий раз иначе.
   Равномерный шаг по времени грубее, зато работает сразу и без вранья. */
const plSnap = (t, id, dur) => {
  const g = plGrid(id);
  return Math.max(0, Math.min(dur || t, Math.round(t / g) * g));
};

function plApplyRate() {
  const el = pracAudioEl;
  if (!el) return;
  const r = plRate(el.dataset.for);
  /* Высоту сохраняем: замедленная запись должна звучать той же музыкой,
     просто медленнее. Safari просит своё имя того же свойства. */
  try { el.preservesPitch = true; } catch {}
  try { el.webkitPreservesPitch = true; } catch {}
  try { el.playbackRate = r; } catch {}
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
  T.textContent = plClock(el.currentTime) + " · отрезок " + plClock(sel.a) + "–" + plClock(sel.b)
    + " · " + plClock(sel.b - sel.a);
  const btn = box.querySelector('[data-pl="play"]');
  if (btn) btn.textContent = el.paused ? "▶︎ Слушать" : "❚❚ Пауза";

  const id = el.dataset.for;
  const bar = box.querySelector(".pl-bar");

  // отбивки рисуем шагом сетки — так видно, к чему притянется край
  const grid = box.querySelector(".pl-grid");
  if (grid && dur) {
    const step = (plGrid(id) / dur) * (bar ? bar.offsetWidth : 0);
    grid.style.backgroundSize = (step > 3 ? step : 0) + "px 100%";
  }

  box.querySelectorAll("[data-rate]").forEach((b) =>
    b.classList.toggle("on", Number(b.dataset.rate) === plRate(id)));
  box.querySelectorAll("[data-grid]").forEach((b) =>
    b.classList.toggle("on", Number(b.dataset.grid) === plGrid(id)));
  const va = box.querySelector('[data-set="a"]'), vb = box.querySelector('[data-set="b"]');
  if (va) va.textContent = plClock(sel.a);
  if (vb) vb.textContent = plClock(sel.b);
  const rs = box.querySelector('[data-pl="reset"]');
  if (rs) rs.hidden = !plMoved();
}

/* Случайно сдвинутый край иначе оставался навсегда: «Слушать» играло не тот
   такт, а вернуть отрезок было нечем — новая разметка ставится только при
   переходе на другой такт. Кнопка появляется, лишь когда отрезок и правда
   разъехался с размеченным. */
function plMarked() {
  const u = prac && prac.cur;
  return u ? markSpan(u) : null;
}
function plMoved() {
  const m = plMarked();
  if (!m || !pracAudioEl) return false;
  const o = plOpt(pracAudioEl.dataset.for);
  if (!isFinite(o.a) || !isFinite(o.b)) return false;
  return Math.abs(o.a - m.a) > 0.05 || Math.abs(o.b - m.b) > 0.05;
}
function plResetSpan() {
  const u = prac && prac.cur;
  if (!pracAudioEl || !u) return;
  const o = plOpt(pracAudioEl.dataset.for);
  delete o.a; delete o.b; o.followed = "";
  pracSaveLoops();
  plFollow(u);            // поставит отрезок заново по разметке такта
  plPaint();
  toast("Отрезок вернулся к такту");
}

/* Края двигаются не только пальцем. Тянуть по тридцатипиксельной полоске
   точно — мучение, поэтому у начала и конца есть плюс и минус, а сколько
   они прибавляют, задаёт тот же шаг, что и у сетки. */
function plEdge(which, dir) {
  const el = pracAudioEl;
  if (!el) return;
  const id = el.dataset.for, dur = el.duration || 0;
  if (!dur) return;              // длительность ещё не приехала — двигать нечего
  const g = plGrid(id), cur = plSel(id, dur);
  const next = which === "a"
    ? { a: Math.max(0, Math.min(cur.a + dir * g, cur.b - g)), b: cur.b }
    : { a: cur.a, b: Math.min(dur, Math.max(cur.b + dir * g, cur.a + g)) };
  plSetSel(next);
}

/* Ввод точного времени: принимаем и «1:20», и просто секунды. */
function plAsk(which) {
  const el = pracAudioEl;
  if (!el) return;
  const id = el.dataset.for, dur = el.duration || 0;
  if (!dur) { toast("Запись ещё грузится"); return; }
  const cur = plSel(id, dur);
  const was = which === "a" ? cur.a : cur.b;
  const v = prompt(which === "a" ? "Начало отрезка (мин:сек)" : "Конец отрезка (мин:сек)", plClock(was));
  if (v === null) return;
  const parts = String(v).trim().split(":");
  const t = parts.length > 1
    ? Number(parts[0]) * 60 + Number(parts[1])
    : Number(String(v).replace(",", "."));
  if (!isFinite(t) || t < 0 || (dur && t > dur)) { toast("Время от 0:00 до " + plClock(dur)); return; }
  plSetSel(which === "a"
    ? { a: Math.min(t, cur.b - 0.5), b: cur.b }
    : { a: cur.a, b: Math.max(t, cur.a + 0.5) });
}

function plSetSel(next) {
  const el = pracAudioEl;
  if (!el) return;
  /* Схлопнутый отрезок не сохраняем: он остался бы в памяти нулём, и запись
     после этого не игралась бы вовсе. */
  if (!isFinite(next.a) || !isFinite(next.b) || next.b - next.a < 0.2) return;
  const id = el.dataset.for;
  Object.assign(plOpt(id), next);
  pracSaveLoops();
  if (el.currentTime < next.a || el.currentTime > next.b)
    try { el.currentTime = next.a; } catch {}
  plPaint();
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
    // записи у этой вещи нет вовсе — плеер просто не показываем
    if (audioUrls.get(id) === "") { box.hidden = true; return; }
    if (!audioUrls.has(id) && !audioPulling.has(id)) pullAudio(id);
    pracAudioEl = null;
    box.hidden = false;
    box.innerHTML = `<div class="pl-wait">${plWaitHTML(id)}</div>`;
    return;
  }
  if (pracAudioEl && pracAudioEl.dataset.for === id) { box.hidden = false; return; }

  box.hidden = false;
  box.innerHTML = `
    <button class="pl-fold" data-pl="fold" type="button">
      <span>♪ Как это звучит</span><i>${pracStore().plOpen ? "свернуть" : "развернуть"}</i>
    </button>
    <div class="pl-body">
    <div class="pl-top"><b>Как это звучит</b><span class="pl-time">0:00</span></div>
    <div class="pl-bar">
      <div class="pl-sel"></div>
      <div class="pl-grid"></div>
      <div class="pl-head"></div>
      <div class="pl-h" data-h="a"></div>
      <div class="pl-h" data-h="b"></div>
    </div>
    <div class="pl-jump">
      <button data-pl="play">▶︎ Слушать</button>
      <button data-pl="replay">↺ Сначала</button>
      <button data-pl="all">Весь трек</button>
      <button data-pl="reset" hidden>↩︎ Вернуть отрезок</button>
    </div>
    <div class="pl-tools">
      <span class="pl-set">
        <em>Скорость</em>
        ${PL_RATES.map((r) => `<button data-rate="${r}">${String(r).replace(".", ",")}</button>`).join("")}
      </span>
      <span class="pl-set pl-edge">
        <em>Начало</em>
        <button data-edge="a" data-step="-">−</button>
        <button class="pl-val" data-set="a">0:00</button>
        <button data-edge="a" data-step="+">＋</button>
      </span>
      <span class="pl-set pl-edge">
        <em>Конец</em>
        <button data-edge="b" data-step="-">−</button>
        <button class="pl-val" data-set="b">0:00</button>
        <button data-edge="b" data-step="+">＋</button>
      </span>
      <span class="pl-set">
        <em>Шаг</em>
        ${PL_GRIDS.map((g) => `<button data-grid="${g}">${g}с</button>`).join("")}
      </span>
    </div>
    </div>
    <audio preload="metadata" data-for="${esc(id)}" src="${esc(url)}"></audio>`;
  const st0 = pracStore();
  if (st0.plOpen === undefined) st0.plOpen = true;   // по умолчанию открыт
  box.classList.toggle("folded", !st0.plOpen);
  pracAudioEl = box.querySelector("audio");
  pracAudioEl.addEventListener("loadedmetadata", () => { plApplyRate(); plPaint(); });
  pracAudioEl.addEventListener("play", plTick);
  pracAudioEl.addEventListener("pause", plPaint);
  pracAudioEl.addEventListener("timeupdate", () => { plLoopCheck(); plPaint(); });
  plApplyRate();
  plPaint();
}

/* Пока запись едет — видно, сколько уже приехало; если сорвалось — видно,
   почему, и есть чем повторить. Раньше здесь висела строка, которая не
   менялась ни при успехе, ни при срыве. */
function plWaitHTML(id) {
  if (audioFail.has(id)) return `
    <span class="pl-wait-t">Запись не приехала — ${esc((audioFail.get(id) || {}).why || "")}</span>
    <button class="pl-retry" data-pl="retry" type="button">Повторить</button>`;
  const pct = (audioPulling.has(id) && audioPct.id === id && audioPct.v > 0)
    ? Math.round(audioPct.v * 100) : null;
  return `
    <span class="pl-wait-t">Запись загружается${pct == null ? "…" : " · " + pct + "%"}</span>
    <span class="pl-wait-bar"><i style="width:${pct == null ? 8 : Math.max(4, pct)}%"></i></span>`;
}

/* Перерисовываем только строку ожидания. Перерисовка всего занятия здесь была
   бы некстати: карточка шага пересобралась бы посреди работы. */
function plWait() {
  const box = $("#pracPlayer");
  if (!box || !prac) return;
  const id = piece().id;
  if (audioUrls.get(id)) { pracPlayer(); return; }     // приехало — собираем плеер
  if (box.hidden) return;
  const w = box.querySelector(".pl-wait");
  if (w) w.innerHTML = plWaitHTML(id);
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
    const t = plSnap(x * dur, id, dur);
    const cur = plSel(id, dur);
    const g = plGrid(id);
    const next = which === "a"
      ? { a: Math.min(t, cur.b - g), b: cur.b }
      : { a: cur.a, b: Math.max(t, cur.a + g) };
    pracLoops[id] = Object.assign(plOpt(id), next);
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

/* ══════════ Разбор по видео ══════════
   Ролик, где вещь разбирают медленно и видно руки, объясняет больше, чем
   запись целиком. Файл выбирается один раз и живёт в хранилище браузера
   этого устройства: никуда не отправляется, в гист не попадает и синхронизацию
   не трогает. Синхронизируется только разметка — числа, где какой такт. */
const VIDEO_CACHE = "keiko-video-v1";
const videoKey = (id) => "keiko-video/" + encodeURIComponent(id);
const videoUrls = new Map();
let vidBusy = false;

async function videoBox() { return await caches.open(VIDEO_CACHE); }

async function videoSave(id, blob) {
  const box = await videoBox();
  await box.put(videoKey(id), new Response(blob, { headers: { "Content-Type": blob.type || "video/mp4" } }));
  const old = videoUrls.get(id);
  if (old) URL.revokeObjectURL(old);
  videoUrls.set(id, URL.createObjectURL(blob));
}

async function videoLoad(id) {
  if (videoUrls.has(id)) return videoUrls.get(id);
  try {
    const box = await videoBox();
    const res = await box.match(videoKey(id));
    if (!res) { videoUrls.set(id, ""); return ""; }
    videoUrls.set(id, URL.createObjectURL(await res.blob()));
  } catch { videoUrls.set(id, ""); }
  return videoUrls.get(id);
}

async function videoDrop(id) {
  try { (await videoBox()).delete(videoKey(id)); } catch {}
  const old = videoUrls.get(id);
  if (old) URL.revokeObjectURL(old);
  videoUrls.delete(id);
}

/* Разметка: какому такту какой кусок видео соответствует. Живёт рядом с ходом
   разбора, значит уезжает в гист и приезжает на второй телефон — в отличие от
   самого файла. Это просто числа. */
const vmarks = () => {
  const st = pracStore();
  st.vmarks = st.vmarks || [];
  return st.vmarks;
};
// нужный кусок: сперва тот, что накрывает весь отрезок, иначе — тот же зачин
const vmarkFor = (from, to) =>
  vmarks().find((m) => m.from <= from && m.to >= to)
  || vmarks().find((m) => m.from === from) || null;

/* ── Плеер разбора ──
   Ролик, где вещь разбирают медленно и видно руки, объясняет больше записи
   целиком. Источника два, и оба ничего не публикуют: ссылка на ютуб — играет
   официальный плеер, я лишь управляю им и рисую свою дорожку поверх; файл
   с устройства — лежит в хранилище браузера этого телефона, выбирается один
   раз и дальше открывается сам. В гист не уходит ни то ни другое; уезжает
   только разметка — числа, где какой такт.

   Задание всё время на виду: ради него всё и затевалось. Отметил «получилось» —
   видео не закрывается и не перематывается, меняется только строка сверху.
   Полный экран берём у обёртки, а не у самого видео: иначе задание и петля
   остались бы под ним. */
let pracVidEl = null, ytPlayer = null, vidKind = "", vidTimer = 0;
/* ВК своего «который час» не отдаёт — только шлёт timeupdate. Держим последнее
   услышанное у себя, иначе петле не на что опереться. */
let vkPlayer = null, vkTime = 0, vkDur = 0, vkPlaying = false;
let vidWant = null;                    // перемотка, которая ждёт готовности

/* Из вставки или ссылки достаём три числа, которыми ВК опознаёт ролик. */
function vkParse(raw) {
  const t = String(raw || "");
  const oid = (/[?&]oid=(-?\d+)/.exec(t) || [])[1];
  const id = (/[?&]id=(\d+)/.exec(t) || [])[1];
  const hash = (/[?&]hash=([0-9a-f]+)/.exec(t) || [])[1];
  if (oid && id) return { oid, id, hash: hash || "" };
  // короткая ссылка вида vkvideo.ru/video-1_2
  const m = /video(-?\d+)_(\d+)/.exec(t);
  return m ? { oid: m[1], id: m[2], hash: "" } : null;
}
const vkSrc = (v) => "https://vkvideo.ru/video_ext.php?oid=" + encodeURIComponent(v.oid)
  + "&id=" + encodeURIComponent(v.id) + (v.hash ? "&hash=" + encodeURIComponent(v.hash) : "")
  + "&hd=1&js_api=1";

const vloop = () => pracStore().vloop || null;

function vidSel(dur) {
  const l = vloop();
  if (l && isFinite(l.a) && isFinite(l.b) && l.b > l.a) return { a: l.a, b: Math.min(l.b, dur || l.b) };
  return { a: 0, b: dur || 0 };
}

/* Один и тот же набор действий поверх двух разных плееров: дальше коду
   всё равно, ютуб там или файл. */
const V = {
  ready: () => vidKind === "yt" ? !!(ytPlayer && ytPlayer.getDuration)
             : vidKind === "vk" ? !!(vkPlayer && vkDur)
             : !!pracVidEl,
  dur: () => { try {
    return (vidKind === "yt" ? ytPlayer.getDuration() : vidKind === "vk" ? vkDur : pracVidEl.duration) || 0;
  } catch { return 0; } },
  now: () => { try {
    return (vidKind === "yt" ? ytPlayer.getCurrentTime() : vidKind === "vk" ? vkTime : pracVidEl.currentTime) || 0;
  } catch { return 0; } },
  paused: () => { try {
    return vidKind === "yt" ? ytPlayer.getPlayerState() !== 1 : vidKind === "vk" ? !vkPlaying : pracVidEl.paused;
  } catch { return true; } },
  seek: (t) => { try {
    if (vidKind === "yt") ytPlayer.seekTo(t, true);
    else if (vidKind === "vk") { vkTime = t; vkPlayer.seek(t); }
    else if (pracVidEl.readyState >= 1) pracVidEl.currentTime = t;
    /* По ссылке файл ещё качается, и перемотка в непрочитанное место молча
       не срабатывает. Запоминаем, куда хотели, и доводим, когда станет можно. */
    else vidWant = t;
  } catch {} },
  play: () => { try {
    if (vidKind === "yt") ytPlayer.playVideo();
    else if (vidKind === "vk") vkPlayer.play();
    else pracVidEl.play().catch(() => {});
  } catch {} },
  pause: () => { try {
    if (vidKind === "yt") ytPlayer.pauseVideo();
    else if (vidKind === "vk") vkPlayer.pause();
    else pracVidEl.pause();
  } catch {} },
  rate: (r) => {
    try {
      if (vidKind === "yt") ytPlayer.setPlaybackRate(r);
      else if (vidKind === "vk") { /* нечем: у ВК скорости в API нет */ }
      else { pracVidEl.preservesPitch = true; pracVidEl.webkitPreservesPitch = true; pracVidEl.playbackRate = r; }
    } catch {}
  },
  /* Ютуб отдаёт свой набор скоростей и молча округляет чужие вниз — спрашиваем
     у него. ВК замедлять не умеет вовсе, и пустой ряд кнопок врал бы. */
  rates: () => {
    if (vidKind === "vk") return [];
    if (vidKind !== "yt") return PL_RATES;
    try {
      const list = (ytPlayer.getAvailablePlaybackRates() || []).filter((r) => r <= 1.5);
      return list.length ? list : [0.25, 0.5, 0.75, 1, 1.25, 1.5];
    } catch { return [0.25, 0.5, 0.75, 1]; }
  }
};

/* Что именно сейчас играет. Раньше это было ниоткуда не видно, и сменить
   источник предлагалось безымянным «⋯» — найти его было нельзя. */
function vidWhat() {
  const st = pracStore();
  if (st.ya) return "Яндекс.Диск";
  if (st.url) return "ссылка на файл";
  if (st.vk) return "ВК";
  if (st.yt) return "YouTube";
  return "файл на этом телефоне";
}

/* Края двигаются и числами: попасть пальцем в секунду на узкой дорожке
   невозможно, а такт длится пару секунд. Шаг тот же, что у звука. */
function vidEdge(which, dir) {
  if (!V.ready()) return;
  const dur = V.dur();
  if (!dur) return;
  const g = plGrid(piece().id), cur = vidSel(dur);
  vidSetSel(which === "a"
    ? { a: Math.max(0, Math.min(cur.a + dir * g, cur.b - g)), b: cur.b }
    : { a: cur.a, b: Math.min(dur, Math.max(cur.b + dir * g, cur.a + g)) });
}

function vidAsk(which) {
  if (!V.ready()) return;
  const dur = V.dur(), cur = vidSel(dur);
  const was = which === "a" ? cur.a : cur.b;
  const v = prompt(which === "a" ? "Начало куска (мин:сек)" : "Конец куска (мин:сек)", plClock(was));
  if (v === null) return;
  const parts = String(v).trim().split(":");
  const t = parts.length > 1 ? Number(parts[0]) * 60 + Number(parts[1]) : Number(String(v).replace(",", "."));
  if (!isFinite(t) || t < 0 || t > dur) { toast("Время от 0:00 до " + plClock(dur)); return; }
  vidSetSel(which === "a" ? { a: Math.min(t, cur.b - 0.3), b: cur.b }
                          : { a: cur.a, b: Math.max(t, cur.a + 0.3) });
}

/* Свой полный экран, а не системный. iOS Safari разворачивать произвольный
   элемент не умеет вовсе: у него есть только полный экран для самого <video>
   с родными кнопками Apple — а там ни петли, ни щипка, ни задания. Поэтому
   растягиваем блок сами, обычным классом. Разметку при этом не трогаем:
   пересоздать плеер значило бы прервать воспроизведение.
   Системный полный экран всё же просим там, где он есть, — ради лишних
   пикселей под строкой состояния; но раскладка от него не зависит. */
function vidFull(on) {
  const box = $("#pracVideo");
  if (!box) return;
  box.classList.toggle("full", on);
  document.body.classList.toggle("vd-full", on);
  const b = box.querySelector('[data-vd="full"]');
  if (b) { b.textContent = on ? "✕" : "⤢"; b.setAttribute("aria-label", on ? "Свернуть" : "Во весь экран"); }
  try {
    if (on && box.requestFullscreen) box.requestFullscreen().catch(() => {});
    else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  } catch {}
  requestAnimationFrame(() => vidPaint());
}

/* Щипок двумя пальцами — то, как приближают везде. Кнопка остаётся для тех
   случаев, когда рука одна занята инструментом. */
const vidPinch = { two: false, d0: 0, z0: 1 };
function vidPinchStart(box) {
  const frame = box.querySelector(".vd-frame");
  if (!frame || frame.dataset.pinch) return;
  frame.dataset.pinch = "1";
  const pts = new Map();
  const dist = () => {
    const [a, b] = [...pts.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  frame.addEventListener("pointerdown", (e) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { vidPinch.two = true; vidPinch.d0 = dist(); vidPinch.z0 = pracStore().vzoom || 1; }
  });
  frame.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size !== 2 || !vidPinch.d0) return;
    e.preventDefault();
    const z = Math.max(1, Math.min(4, vidPinch.z0 * (dist() / vidPinch.d0)));
    const st = pracStore();
    st.vzoom = Math.round(z * 20) / 20;
    if (st.vzoom <= 1.02) { st.vzoom = 1; st.vpan = 0; st.vpanY = 0; }
    vidApplyZoom(box);
  });
  const drop = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2 && vidPinch.two) {
      vidPinch.two = false; vidPinch.d0 = 0;
      saveData(); schedulePush();
    }
  };
  frame.addEventListener("pointerup", drop);
  frame.addEventListener("pointercancel", drop);
  frame.addEventListener("pointerleave", drop);
}

/* Приближение: руки крупным планом. Тянем картинку внутри рамки, поэтому
   двигать её можно и пальцем — при увеличении она больше рамки. */
function vidZoom(box, step) {
  const st = pracStore();
  const z = Math.max(1, Math.min(3, (st.vzoom || 1) + step));   // −99 возвращает к единице
  st.vzoom = z;
  if (z === 1) { st.vpan = 0; st.vpanY = 0; }
  saveData(); schedulePush();
  vidApplyZoom(box);
}

function vidApplyZoom(box) {
  vidPinchStart(box);
  const st = pracStore();
  const z = st.vzoom || 1, pan = st.vpan || 0;
  const wrap = box.querySelector(".vd-yt, video");
  if (!wrap) return;
  const panY = st.vpanY || 0;
  wrap.style.transform = `scale(${z}) translate(${pan}%, ${panY}%)`;
  wrap.style.transformOrigin = "center center";
  const frame = box.querySelector(".vd-frame");
  if (frame) frame.classList.toggle("zoomed", z > 1);
  const btn = box.querySelector('[data-vd="zoom"]');
  if (btn) btn.textContent = z > 1 ? "×" + (Math.round(z * 10) / 10) : "🔍";
}

// набор скоростей известен только после готовности плеера — перерисовываем ряд
function vidRates(box) {
  const row = box.querySelector(".vd-row.rates");
  if (!row) return;
  row.innerHTML = V.rates()
    .map((r) => `<button data-vrate="${r}" type="button">${String(r).replace(".", ",")}</button>`).join("");
}

/* Что сейчас показывает дорожка: целый ролик или растянутое окно вокруг
   ручки, которую держат. */
let vidMag = null;
function vidView(dur) {
  if (!vidMag || !dur) return { from: 0, to: dur || 0 };
  const half = Math.max(1.5, Math.min(dur, vidMag.span) / 2);
  let from = vidMag.at - half, to = vidMag.at + half;
  if (from < 0) { to -= from; from = 0; }
  if (to > dur) { from -= to - dur; to = dur; }
  return { from: Math.max(0, from), to: Math.min(dur, to) };
}

function vidPaint() {
  const box = $("#pracVideo");
  if (!box || box.hidden || !V.ready()) return;
  const dur = V.dur(), cur = V.now();
  const sel = vidSel(dur);
  const view = vidView(dur);
  const span = Math.max(0.001, view.to - view.from);
  const pc = (t) => Math.max(-5, Math.min(105, ((t - view.from) / span) * 100));
  const q = (c) => box.querySelector(c);

  const S = q(".tl-sel"), A = q('[data-vh="a"]'), B = q('[data-vh="b"]'), P = q(".tl-head");
  if (!S) return;
  const a = pc(sel.a), b = pc(sel.b);
  S.style.left = Math.max(0, a) + "%";
  S.style.width = Math.max(0, Math.min(100, b) - Math.max(0, a)) + "%";
  A.style.left = a + "%";
  B.style.left = b + "%";
  P.style.left = pc(cur) + "%";

  const mag = q(".tl-mag");
  if (mag) mag.textContent = vidMag ? plClock(view.from) + " … " + plClock(view.to) : "";
  box.querySelector(".tl").classList.toggle("mag", !!vidMag);

  const T = q(".vd-time");
  if (T) T.textContent = plClock(cur) + " / " + plClock(dur);
  const L = q(".tl-loop");
  if (L) L.textContent = sel.b - sel.a >= dur - 0.5
    ? "весь ролик"
    : "кусок " + plClock(sel.a) + "–" + plClock(sel.b) + " · " + plClock(sel.b - sel.a);

  const play = q('[data-vd="play"]');
  if (play) play.textContent = V.paused() ? "▶︎" : "❚❚";
  const va = q('[data-vset="a"]'), vb = q('[data-vset="b"]');
  if (va) va.textContent = plClock(sel.a);
  if (vb) vb.textContent = plClock(sel.b);
  const rate = pracStore().vrate || 1;
  box.querySelectorAll("[data-vrate]").forEach((x) => x.classList.toggle("on", Number(x.dataset.vrate) === rate));
}

/* Петля. У ютуба своего «доиграл до сих пор» нет, поэтому просто спрашиваем
   время по часам — этого хватает и работает одинаково для обоих плееров. */
function vidTick() {
  clearInterval(vidTimer);
  vidTimer = setInterval(() => {
    if (!V.ready()) return;
    if (!V.paused()) {
      const dur = V.dur(), sel = vidSel(dur), t = V.now();
      /* Держим окно с обеих сторон. Только правый край мало: если начало
         не догналось, ролик спокойно играл бы всё, что до куска. */
      if (dur && (t >= sel.b - 0.15 || t < sel.a - 0.4)) V.seek(sel.a);
    }
    vidPaint();
  }, 120);
}

function vidSetSel(next) {
  if (!next || !isFinite(next.a) || !isFinite(next.b) || next.b - next.a < 0.2) return;
  pracStore().vloop = next;
  saveData(); schedulePush();
  const cur = V.now();
  if (cur < next.a || cur > next.b) V.seek(next.a);
  vidPaint();
}

/* Одна дорожка — три жеста. Тянешь за ручку — двигаешь край куска, и на
   время удержания дорожка растягивается вокруг этой ручки: попасть в секунду
   на десятиминутном ролике иначе нельзя. Тянешь за пустое место — перематываешь.
   Отпустил ручку — масштаб вернулся к целому ролику. */
function vidDrag(e) {
  const box = $("#pracVideo");

  const frame = e.target.closest(".vd-frame.zoomed");
  if (frame && !vidPinch.two) {
    const st = pracStore();
    const z = st.vzoom || 1;
    const lim = (z - 1) * 50;
    const x0 = e.clientX, y0 = e.clientY;
    const p0 = st.vpan || 0, q0 = st.vpanY || 0;
    e.preventDefault();
    const move = (ev) => {
      const dx = (ev.clientX - x0) / frame.clientWidth * 100 / z;
      const dy = (ev.clientY - y0) / frame.clientHeight * 100 / z;
      st.vpan = Math.max(-lim, Math.min(lim, p0 + dx));
      st.vpanY = Math.max(-lim, Math.min(lim, q0 + dy));
      vidApplyZoom(box);
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      saveData(); schedulePush();
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    return;
  }

  const tl = e.target.closest(".tl");
  if (!tl || !V.ready()) return;
  const dur = V.dur();
  if (!dur) return;
  e.preventDefault();

  const at = (ev) => {
    const view = vidView(dur);
    const r = tl.getBoundingClientRect();
    const k = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
    return view.from + k * (view.to - view.from);
  };

  const h = e.target.closest("[data-vh]");
  if (h) {
    const which = h.dataset.vh;
    /* Растягивание — по долгому удержанию, а не сразу. Обычное перетаскивание
       занимает секунду-другую, и дорожка, прыгающая в масштаб на каждое
       движение, только мешала бы. Держишь пять секунд — значит целишься. */
    const magAt = setTimeout(() => {
      const cur = vidSel(dur);
      vidMag = { at: which === "a" ? cur.a : cur.b, span: Math.max(6, Math.min(dur, dur / 12)) };
      if (navigator.vibrate) try { navigator.vibrate(12); } catch {}
      vidPaint();
    }, 5000);

    const move = (ev) => {
      const t = at(ev);
      const cur = vidSel(dur);
      if (vidMag) vidMag.at = t;
      vidSetSel(which === "a"
        ? { a: Math.max(0, Math.min(t, cur.b - 0.3)), b: cur.b }
        : { a: cur.a, b: Math.min(dur, Math.max(t, cur.a + 0.3)) });
    };
    const up = () => {
      clearTimeout(magAt);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      vidMag = null;                 // отпустил — дорожка снова про весь ролик
      vidPaint();
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    return;
  }

  /* Само выделение тянется целиком: длина куска сохраняется, едет только
     место. Раньше приходилось двигать оба края по очереди, и кусок при этом
     то растягивался, то сжимался. */
  if (e.target.closest(".tl-sel")) {
    const cur0 = vidSel(dur);
    const len = cur0.b - cur0.a;
    const grabAt = at(e) - cur0.a;
    const move = (ev) => {
      let a2 = at(ev) - grabAt;
      a2 = Math.max(0, Math.min(a2, dur - len));
      vidSetSel({ a: a2, b: a2 + len });
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    return;
  }

  // пустое место дорожки — перемотка
  const seek = (ev) => { V.seek(at(ev)); vidPaint(); };
  seek(e);
  const up = () => {
    document.removeEventListener("pointermove", seek);
    document.removeEventListener("pointerup", up);
  };
  document.addEventListener("pointermove", seek);
  document.addEventListener("pointerup", up);
}

// у этих тактов уже есть запомненный кусок — подставляем его
function vidJump(u) {
  if (!u || !V.ready()) return;
  /* Ручные метки по одному такту склеиваются в диапазон: задание «такты 6–7»
     берёт начало шестой метки и конец седьмой. */
  let sel = null;
  const m = vmarkFor(u.from, u.to);
  if (m && m.to >= u.to) sel = { a: m.a, b: m.b };
  else {
    const mA = vmarkFor(u.from, u.from), mB = vmarkFor(u.to, u.to);
    if (mA && mB) sel = { a: mA.a, b: mB.b };
    else if (mA) sel = { a: mA.a, b: mA.b };
  }
  if (!sel) return;
  vidSetSel(sel);
  /* Кусок не просто выделен — бегунок уже стоит на его начале: сменился такт,
     и видео готово показывать именно его. */
  try { V.seek(sel.a); } catch {}
}

/* Библиотека ютуба грузится один раз и только когда понадобилась: офлайн она
   не приедет, и это нормально — тогда работает файл с устройства. */
let ytApi = null;
function ytReady() {
  if (ytApi) return ytApi;
  ytApi = new Promise((ok, fail) => {
    if (window.YT && window.YT.Player) return ok(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) try { prev(); } catch {} ok(window.YT); };
    const t = document.createElement("script");
    t.src = "https://www.youtube.com/iframe_api";
    t.onerror = () => fail(new Error("нет сети"));
    document.head.appendChild(t);
    setTimeout(() => fail(new Error("ютуб не ответил")), 15000);
  }).catch((e) => { ytApi = null; throw e; });
  return ytApi;
}

/* Один таймлайн вместо двух. Раньше их было два — «где я в ролике» и «какой
   кусок повторяю», — и глазу приходилось сопоставлять их между собой. Теперь
   это одна дорожка: на ней и бегунок, и выделение с двумя ручками.

   Ручку можно зажать — дорожка растянется вокруг неё, и край ставится точно.
   Отпустил — вернулась к целому ролику. Это заменяет возню с числами, хотя
   числа тоже остались. */
function vidControlsHTML(task) {
  const rates = V.rates();
  return `
    <div class="tl" data-tl>
      <div class="tl-sel"></div>
      <div class="tl-h" data-vh="a"><i></i></div>
      <div class="tl-h" data-vh="b"><i></i></div>
      <div class="tl-head"></div>
      <div class="tl-mag"></div>
    </div>
    <div class="tl-info">
      <span class="vd-time">0:00</span>
      <span class="tl-loop">кусок 0:00–0:00</span>
    </div>

    <div class="vd-row">
      <button class="vd-btn" data-vd="play" type="button">▶︎</button>
      <button class="vd-btn" data-vd="back" type="button" aria-label="Начать кусок сначала">↺</button>
      <button class="vd-btn" data-vd="all" type="button" aria-label="Весь ролик">⤾</button>
      <span class="vd-gap"></span>
      <button class="vd-btn" data-vd="zoom" type="button" aria-label="Приблизить">🔍</button>
      <button class="vd-btn" data-vd="full" type="button" aria-label="Во весь экран">⤢</button>
    </div>

    <details class="vd-more">
      <summary>Точнее</summary>
      <div class="vd-row edges">
        <em>Начало</em>
        <button data-vedge="a" data-vstep="-1" type="button">−</button>
        <button class="vd-val" data-vset="a" type="button">0:00</button>
        <button data-vedge="a" data-vstep="1" type="button">＋</button>
      </div>
      <div class="vd-row edges">
        <em>Конец</em>
        <button data-vedge="b" data-vstep="-1" type="button">−</button>
        <button class="vd-val" data-vset="b" type="button">0:00</button>
        <button data-vedge="b" data-vstep="1" type="button">＋</button>
      </div>
      <div class="vd-row marks">
        <button class="btn" data-vd="bind" type="button">Это ${esc(task || "текущий такт")}</button>
      </div>
      ${rates.length ? `
      <div class="vd-row rates">
        ${rates.map((r) => `<button data-vrate="${r}" type="button">${String(r).replace(".", ",")}</button>`).join("")}
      </div>` : `<p class="vd-slow">Замедлять ВК не умеет — для медленного разбора возьми файл.</p>`}
      <div class="vd-src">
        Источник: <b>${esc(vidWhat())}</b>
        <button class="th-link" data-vd="src" type="button">сменить</button>
      </div>
    </details>`;
}

function pracVideo(u) {
  const box = $("#pracVideo");
  if (!box) return;
  const id = piece().id;
  const st = pracStore();
  const task = u ? `такты ${u.from}–${u.to}` : "";

  // уже собран для этой пьесы — меняем строку задания и подставляем его кусок
  if (box.dataset.mode === "play" && box.dataset.for === id) {
    const t = box.querySelector(".vd-task b");
    if (t) t.textContent = task;
    if (u) vidJump(u);
    vidPaint();
    return;
  }

  /* Прямая ссылка на файл — самый простой случай и самый полный: это обычное
     видео, значит доступно всё, что умеет браузер. Ничего никуда не копируем,
     просто играем по адресу, который дали. */
  /* Ссылку с Диска прошлая версия принимала за прямую и пыталась играть
     страницу. Переселяем молча — иначе останется вечное «не открылось». */
  if (st.url && /disk\.yandex\.[a-z]+\//i.test(st.url)) {
    st.ya = st.url; delete st.url; saveData(); schedulePush();
  }
  if (st.ya) { vidMountYa(box, id, st.ya, task, u); return; }
  /* Обычная ссылка играется потоком — ничего не скачивая. Если местная копия
     уже завелась (браузер отказался играть и мы её забрали), она главнее:
     открывается сразу и без сети. */
  if (st.url) {
    const have = videoUrls.get(id);
    if (have === undefined) { videoLoad(id).then(() => { if (prac) pracVideo(u); }); return; }
    vidMountFile(box, id, have || dbxUrl(st.url), task, u);
    return;
  }
  if (st.vk) { vidMountVK(box, id, st.vk, task, u); return; }
  if (st.yt) { vidMountYT(box, id, st.yt, task, u); return; }

  const url = videoUrls.get(id);
  if (url === undefined) { videoLoad(id).then(() => { if (prac) pracVideo(u); }); return; }
  if (url) { vidMountFile(box, id, url, task, u); return; }

  box.hidden = false;
  if (box.dataset.mode === "pick") return;
  box.dataset.mode = "pick"; box.dataset.for = "";
  /* Главное действие одно — выбрать файл. Ссылка убрана под раскладушку: она
     нужна, чтобы не носить один и тот же ролик по телефонам руками, но с неё
     начинать разговор незачем. */
  box.innerHTML = `
    <div class="vd-empty">
      <b>Разбор по видео</b>
      <span>Выбери файл — он останется на этом телефоне и дальше будет открываться сам.</span>
      <button class="btn gold" data-vd="pick" type="button">Выбрать видео</button>
      <input type="file" accept="video/*" hidden>
      <details class="vd-more">
        <summary>Или по ссылке</summary>
        <input id="vdUrl" class="note-input" type="url" inputmode="url" autocapitalize="off"
          autocorrect="off" spellcheck="false" placeholder="Dropbox, Яндекс.Диск, YouTube, ВК">
        <button class="btn" data-vd="link" type="button">Взять по ссылке</button>
      </details>
    </div>`;
}

function vidMountFile(box, id, url, task, u) {
  vidKind = "file"; ytPlayer = null;
  box.dataset.mode = "play"; box.dataset.for = id;
  box.hidden = false;
  box.innerHTML = `
    <div class="vd-wrap">
      <div class="vd-task">Сейчас: <b>${esc(task)}</b></div>
      <div class="vd-frame"><video playsinline preload="metadata" src="${esc(url)}"></video></div>
      ${vidControlsHTML(task)}
    </div>`;
  pracVidEl = box.querySelector("video");
  pracVidEl.addEventListener("loadedmetadata", () => {
    V.rate(pracStore().vrate || 1);
    vidJump(u);
    vidRates(box);
    vidPaint();
    /* Заиграло по ссылке — значит файл достижим прямо сейчас. Забираем копию
       себе, не мешая просмотру. Ссылка на чужом хранилище может кончиться
       когда угодно: у Dropbox публичная ссылка отключается за трафик, у
       Яндекса подпись протухает. Разбор к этому времени уже привычка, и
       оставаться без него из-за чужого лимита незачем. */
    if (/^https?:/i.test(url)) vidKeep(id, url);
  });
  pracVidEl.addEventListener("play", vidTick);
  /* Играть по ссылке выходит не везде: файл могут отдать с пометкой «это
     загрузка» или вовсе не пустить с чужой страницы. Тогда молча забираем его
     один раз к себе — дальше это обычное местное видео. */
  pracVidEl.addEventListener("error", () => {
    const link = pracStore().url;
    if (link && /^https?:/i.test(url)) { linkFetch(box, id, link, task, u); return; }
    vidFail(box, -2);
  });
  pracVidEl.addEventListener("loadeddata", () => {
    if (vidWant == null) return;
    try { pracVidEl.currentTime = vidWant; } catch {}
    vidWant = null;
  });
  V.rate(pracStore().vrate || 1);
  vidApplyZoom(box);
  vidTick();
  vidPaint();
}

/* Яндекс.Диск: у них есть публичный API, который по ссылке на файл отдаёт
   прямую. Она временная, поэтому храним именно ту ссылку, что дали, а прямую
   спрашиваем при каждом открытии. Дальше это обычное видео — со всем, что
   умеет браузер: любая скорость, петля по кадрам, полный экран. */
const yaHref = new Map();

/* Dropbox по ссылке «поделиться» открывает страницу с их плеером, а с dl=1
   отдаёт файл как загрузку — Safari на айфоне такое не играет. Просишь raw —
   и приходит обычное видео, потоком и с перемоткой. Хвост st опускаем: это
   отметка времени, ключ доступа лежит в rlkey и не стареет. */
function dbxUrl(u) {
  if (!/\bdropbox\.com\//i.test(u)) return u;
  try {
    const a = new URL(u);
    a.searchParams.delete("dl");
    a.searchParams.delete("st");
    a.searchParams.set("raw", "1");
    return a.toString();
  } catch { return u; }
}

async function yaResolve(share) {
  // не Диск — значит ссылка и есть прямая, спрашивать не у кого
  if (!/disk\.yandex\.[a-z]+\//i.test(share)) return dbxUrl(share);
  if (yaHref.has(share)) return yaHref.get(share);
  const api = "https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key="
    + encodeURIComponent(share);
  const r = await withTimeout(fetch(api), 15000);
  if (!r.ok) throw new Error("диск ответил " + r.status);
  const href = (await r.json()).href;
  if (!href) throw new Error("нет ссылки на файл");
  yaHref.set(share, href);
  return href;
}

/* Играть прямо по ссылке Диска нельзя: файл приходит с пометкой «это
   загрузка, а не воспроизведение» (Content-Disposition: attachment). Chrome
   на неё закрывает глаза, Safari на айфоне отказывается наотрез, а попросить
   иначе не выйдет — подпись в ссылке этого не разрешает, приходит 403.

   Поэтому забираем файл один раз и кладём в то же хранилище, где лежат
   выбранные вручную. Дальше он открывается мгновенно, работает офлайн и без
   Диска вообще. Ссылку храним, чтобы на втором телефоне повторить это самому,
   а не переносить файл руками. */
function vidMountYa(box, id, share, task, u) {
  box.hidden = false;
  videoLoad(id).then((have) => {
    if (have) { box.dataset.mode = ""; vidMountFile(box, id, have, task, u); return; }
    linkFetch(box, id, share, task, u);
  });
}

/* Тихая копия: без полосы и без вопросов — картинка уже идёт, ждать нечего.
   Если хранилище не пускает чужую страницу забирать файл (нет CORS), просто
   ничего не выйдет, и всё останется как было. */
const vidKept = new Set();

async function vidKeep(id, url) {
  if (vidKept.has(id) || vidBusy) return;
  vidKept.add(id);
  try {
    if (await videoLoad(id)) return;                 // копия уже есть
    const res = await withTimeout(fetch(url), 180000);
    if (!res.ok) return;
    if (/text\/html/i.test(res.headers.get("content-type") || "")) return;
    const blob = await res.blob();
    if (!blob || blob.size < 100000) return;         // пришла страница, а не ролик
    await videoSave(id, blob);
    toast("Ролик сохранён — дальше откроется и без сети");
  } catch (e) {
    // молчать тут нельзя: человек будет думать, что копия есть, а её нет
    if (noRoom(e)) toast("Не хватило места сохранить ролик — останется по ссылке");
  }
}

async function linkFetch(box, id, share, task, u) {
  if (vidBusy) return;
  vidBusy = true;
  box.dataset.mode = "loading"; box.dataset.for = "";
  const paint = (pct) => {
    box.innerHTML = `
      <div class="vd-empty">
        <b>Забираю ролик к себе</b>
        <span>${pct == null ? "начинаю…" : pct + "%"} · потом он будет открываться сразу и без сети</span>
        <span class="pl-wait-bar"><i style="width:${pct == null ? 6 : Math.max(4, pct)}%"></i></span>
      </div>`;
  };
  paint(null);
  try {
    const href = await yaResolve(share);
    const res = await withTimeout(fetch(href), 60000);
    if (!res.ok) throw new Error("файл не отдался");
    /* Хранилище отвечает бодрым «200 ОК» и присылает страницу с извинениями:
       так Dropbox гасит ссылку, перебравшую трафик. Отличить это от файла
       можно только по типу — иначе в хранилище легла бы веб-страница под
       видом ролика, и он «переставал открываться» уже навсегда. */
    if (/text\/html/i.test(res.headers.get("content-type") || "")) { vidFail(box, -4); return; }
    const len = +(res.headers.get("content-length") || 0);
    let blob;
    if (!res.body || !len) blob = await res.blob();
    else {
      const rd = res.body.getReader(), parts = [];
      let got = 0;
      for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        parts.push(value); got += value.length;
        paint(Math.round((got / len) * 100));
      }
      blob = new Blob(parts, { type: res.headers.get("content-type") || "video/mp4" });
    }
    await videoSave(id, blob);
    // пока качали, пьесу могли сменить или ссылку переписать — тогда молчим
    const st2 = prac && pracStore();
    if (!st2 || (st2.ya !== share && st2.url !== share)) return;
    box.dataset.mode = "";
    pracVideo(u);
  } catch (e) {
    vidFail(box, noRoom(e) ? -5 : -3);
  } finally { vidBusy = false; }
}

/* ВК: официальный плеер во вставке плюс их же скрипт управления. Прямую
   ссылку на файл не трогаем — работаем через то, что они сами предлагают.
   Времени плеер не отдаёт по запросу, только шлёт его событиями, поэтому
   последнее услышанное держим у себя. */
function vidMountVK(box, id, v, task, u) {
  box.hidden = false;
  if (box.dataset.mode !== "loading") {
    box.dataset.mode = "loading"; box.dataset.for = "";
    box.innerHTML = `<div class="vd-empty"><span>Ролик загружается…</span></div>`;
  }
  vkApi().then((VKapi) => {
    const st = pracStore();
    if (!prac || !st.vk || st.vk.id !== v.id) return;
    vidKind = "vk"; pracVidEl = null; ytPlayer = null;
    vkTime = 0; vkDur = 0; vkPlaying = false;
    box.dataset.mode = "play"; box.dataset.for = id;
    box.innerHTML = `
      <div class="vd-wrap">
        <div class="vd-task">Сейчас: <b>${esc(task)}</b></div>
        <div class="vd-frame"><div class="vd-yt"><iframe src="${esc(vkSrc(v))}" frameborder="0"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"></iframe></div></div>
        ${vidControlsHTML(task)}
      </div>`;
    const frame = box.querySelector("iframe");
    try { vkPlayer = new VKapi.VideoPlayer(frame); } catch { vidFail(box, -1); return; }
    const E = VKapi.VideoPlayer.Events;
    vkPlayer.on(E.INITED, (s2) => { vkDur = (s2 && s2.duration) || 0; vidRates(box); vidJump(u); vidApplyZoom(box); vidPaint(); });
    vkPlayer.on(E.TIMEUPDATE, (s2) => {
      if (!s2) return;
      vkTime = s2.time || 0;
      if (s2.duration) vkDur = s2.duration;
      vidPaint();
    });
    vkPlayer.on(E.STARTED, () => { vkPlaying = true; vidTick(); });
    vkPlayer.on(E.RESUMED, () => { vkPlaying = true; vidTick(); });
    vkPlayer.on(E.PAUSED, () => { vkPlaying = false; vidPaint(); });
    vkPlayer.on(E.ENDED, () => { vkPlaying = false; vidPaint(); });
    vkPlayer.on(E.ERROR, () => vidFail(box, -1));
    vidTick();
  }).catch(() => vidFail(box, 0));
}

let vkApiP = null;
function vkApi() {
  if (vkApiP) return vkApiP;
  vkApiP = new Promise((ok, fail) => {
    if (window.VK && window.VK.VideoPlayer) return ok(window.VK);
    const t = document.createElement("script");
    t.src = "https://vk.com/js/api/videoplayer.js";
    t.onload = () => (window.VK && window.VK.VideoPlayer) ? ok(window.VK) : fail(new Error("нет плеера"));
    t.onerror = () => fail(new Error("нет сети"));
    document.head.appendChild(t);
    setTimeout(() => fail(new Error("ВК не ответил")), 15000);
  }).catch((e) => { vkApiP = null; throw e; });
  return vkApiP;
}

function vidMountYT(box, id, vid, task, u) {
  box.hidden = false;
  if (box.dataset.mode !== "loading") {
    box.dataset.mode = "loading"; box.dataset.for = "";
    box.innerHTML = `<div class="vd-empty"><span>Ролик загружается…</span></div>`;
  }
  ytReady().then((YT) => {
    if (!prac || pracStore().yt !== vid) return;
    vidKind = "yt"; pracVidEl = null;
    box.dataset.mode = "play"; box.dataset.for = id;
    box.innerHTML = `
      <div class="vd-wrap">
        <div class="vd-task">Сейчас: <b>${esc(task)}</b></div>
        <div class="vd-frame"><div class="vd-yt"><div id="ytHost"></div></div></div>
        ${vidControlsHTML(task)}
      </div>`;
    ytPlayer = new YT.Player("ytHost", {
      videoId: vid,
      playerVars: { controls: 0, rel: 0, modestbranding: 1, playsinline: 1, disablekb: 1, fs: 0 },
      events: {
        onReady: () => {
          V.rate(pracStore().vrate || 1);
          vidJump(u);
          vidRates(box);
          vidApplyZoom(box);
          vidTick();
          vidPaint();
        },
        /* Ролик может не открыться и при живой сети. Чаще всего — автор запретил
           встраивание: у разборов это обычное дело. Молчать тут нельзя, иначе
           остаётся чёрный прямоугольник и непонятно, что делать. */
        onError: (ev) => vidFail(box, Number(ev && ev.data))
      }
    });
  }).catch(() => vidFail(box, 0));
}

const YT_WHY = {
  "-5": "на телефоне кончилось место — освободи немного и попробуй снова",
  "-4": "по ссылке пришла страница, а не файл — ссылка закрылась или хранилище отключило её за трафик",
  "-3": "файл по ссылке не забрать — проверь, что доступ по ней открыт",
  "-2": "файл по ссылке не открылся — проверь адрес и что он отдаёт само видео",
  2: "ссылка не похожа на ролик",
  5: "этот ролик не играет во встроенном плеере",
  100: "ролик удалён или закрыт автором",
  101: "автор запретил встраивание — открыть можно только на ютубе",
  150: "автор запретил встраивание — открыть можно только на ютубе"
};

function vidFail(box, code) {
  clearInterval(vidTimer);
  ytPlayer = null; vkPlayer = null; vidKind = "";
  box.dataset.mode = "off"; box.dataset.for = "";
  const why = YT_WHY[code] || (navigator.onLine ? "ютуб не ответил" : "нет сети");
  const st = pracStore();
  const link = st.yt ? "https://www.youtube.com/watch?v=" + st.yt
    : st.vk ? "https://vkvideo.ru/video" + st.vk.oid + "_" + st.vk.id
    : (st.ya || st.url || "");
  box.innerHTML = `
    <div class="vd-empty">
      <b>Ролик не открылся</b>
      <span>${esc(why)}.</span>
      ${link ? `<a class="btn" href="${esc(link)}" target="_blank" rel="noopener">Открыть у них</a>` : ""}
      <button class="btn" data-vd="src" type="button">Взять другое видео</button>
    </div>`;
}

/* ══════════ Курс: урок = видео плюс задание ══════════
   У пьесы единица — такт, у курса — урок. Внутри урока два шага: посмотреть
   и сделать задание. Задание есть не всегда, поэтому про него спрашивают,
   а не заставляют. Час, проведённый над десятиминутным уроком, — это
   не провал, а честное число, и оно записывается как есть. */
const lessons = () => (course().lessons || []);
/* Ход разбора хранится отдельно по курсам: у двух материалов свои занятия,
   и номера шагов у них совпадают. Первый курс остаётся под старым ключом
   «pastel», иначе его прогресс потерялся бы при переезде. */
const pracCourseKey = () => {
  const k = courseKey();
  return k === "pastel" ? "pastel" : "pastel:" + k;
};
const lessonStore = () => {
  data.practice = data.practice || {};
  const k = pracCourseKey();
  data.practice[k] = data.practice[k] || { done: {}, session: 0, log: [] };
  return data.practice[k];
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

const lessonSteps = (i) => { const l = lessons()[i]; return (l && Array.isArray(l.steps)) ? l.steps : null; };

/* ── Занятие ──
   Урок целиком — обещание, под которое трудно сесть: сто десять минут и
   пятьдесят три шага. Но пугает не длина ролика, а число движений руками:
   восемь минут видео на «Морде» — это час рисования. Поэтому занятие меряется
   действиями, а не хронометражом: не больше трёх «повтори» или «сделай»
   подряд. Смотрение в счёт не идёт — оно ничего не стоит и не требует стола.

   Границы этапов, размеченные в самом курсе, не ломаем: занятие начинается
   вместе с новым этапом. Получается то же, что четыре такта у пианино —
   ограниченный кусочек, про который заранее известно, что он кончится. */
const BLOCK_DOING = 3;
const lessonDoing = (st) => st && (st.k === "pause" || st.k === "do");

function lessonBlocks(i) {
  const steps = lessonSteps(i) || [];
  const out = [];
  let cur = null;
  steps.forEach((st, n) => {
    const g = st.g || "";
    const дело = lessonDoing(st);
    if (!cur || cur.g !== g || (дело && cur.doing >= BLOCK_DOING)) {
      cur = { i, g, from: n, to: n, doing: 0 };
      out.push(cur);
    }
    cur.to = n;
    if (дело) cur.doing++;
  });
  return out;
}
const blockOfStep = (i, n) => lessonBlocks(i).find((b) => n >= b.from && n <= b.to) || null;

/* Что достать перед куском. Список не выдуман: «Приготовь» уже размечены в
   самом курсе шагами вида read — просто лежали посреди урока, и про уголь с
   клячкой узнаёшь, уже сев за стол. Собираем их наперёд.
   Базовый набор добавляем только там, где придётся рисовать: перед занятием,
   где надо просто смотреть, стол разгребать незачем. */
const BASE_KIT = [
  "Убери со стола лишнее",
  "Материалы под руку",
  "Ноутбук так, чтобы смотреть не наклоняясь",
  "Тряпку или салфетку рядом",
];

function lessonPrep(i, bl) {
  const steps = lessonSteps(i) || [];
  const надо = !plainCourse() && (bl && bl.doing) > 0;
  const свои = steps.filter((st) => st.k === "read")
    .map((st) => String(st.t || "").replace(/^Приготовь:\s*/i, "").trim())
    .filter(Boolean);
  return { надо, список: надо ? BASE_KIT.concat(свои) : [] };
}

function lessonNext() {
  const ls = lessons();
  /* У лекции шагов нет, и старые ступени «посмотрел → повторил → сделал» к ней
     не применяются: следующее — первое недосмотренное занятие. Без этой ветки
     на главной вечно висело первое, сколько его ни смотри. */
  if (courseWatch()) {
    for (let i = 0; i < ls.length; i++)
      if (!ls[i].hidden && lessonProgress(i).pct < 98) return { i, phase: "watch" };
    return null;
  }
  for (let i = 0; i < ls.length; i++) {
    const steps = lessonSteps(i);
    if (steps) {
      // урок-лестница: идём по шагам, старые фазы для него не применяются
      for (let n = 0; n < steps.length; n++)
        if (!lessonDone(i, "s" + n)) return { i, phase: "step", step: n };
      continue;
    }
    if (!lessonDone(i, "watch")) return { i, phase: "watch" };
    if (!lessonDone(i, "task")) return { i, phase: "ask" };
    if (lessonStore().done["L" + i + ":task"] === "нет") continue;
    if (!lessonDone(i, "repeat")) return { i, phase: "repeat" };
    if (!lessonDone(i, "own")) return { i, phase: "own" };
  }
  return null;
}

/* Именованные рамки «зачем это в жизни»: имя и абзац. Одним кодом и на курсе,
   и на уроке — часть рамок общая для всего курса, часть только своя. */
function рамкиHTML(заголовок, список) {
  if (!Array.isArray(список) || !список.length) return "";
  return `<p class="ls-h">${esc(заголовок)}</p>
    <div class="ls-life">${список.map((x) => `
      <div class="ls-life-i"><b>${esc(x.n || "")}</b><p>${esc(x.t || "")}</p></div>`).join("")}</div>`;
}


/* ── Просмотр лекции ──
   Курс может быть не занятием по шагам, а видео, которое досматриваешь с того
   места, где бросил. Плеер разбора сюда не тащим: там петли, метки по тактам и
   скорость — всё из работы над пьесой. Лекцию просто смотрят, поэтому здесь
   родной плеер браузера со своей дорожкой и одна запомненная секунда. */
const courseWatch = () => course().mode === "watch";

const seenStore = () => {
  const st = lessonStore();
  st.seen = st.seen || {};
  return st.seen;
};
const seenOf = (i) => seenStore()["L" + i] || { at: 0, dur: 0 };
/* Отмечаем не «сколько посмотрел за раз», а «докуда дошёл» — как страницу в
   книге: так не надо помнить, где остановился в прошлый раз. Прирост считается
   сам и ложится на сегодняшний день, иначе весь просмотр каждый раз падал бы
   в один день и портил график. */
function seenSet(i, at, dur) {
  const было = seenOf(i);
  const предел = Math.round(dur || было.dur || 0);
  const стало = Math.max(0, предел ? Math.min(Math.round(at || 0), предел) : Math.round(at || 0));
  const поДням = { ...(было.byDay || {}) };
  const прирост = стало - (было.at || 0);
  if (прирост > 0) {
    const d = todayStr();
    поДням[d] = (поДням[d] || 0) + прирост;
  }
  seenStore()["L" + i] = { at: стало, dur: предел, byDay: поДням };
  saveData(); schedulePush();
}


/* Тело шага. Текст приходит как есть, вместе со схемами в тройных кавычках:
   схема держится только пробелами, поэтому идёт в моноширинный блок без
   переносов, а всё остальное — обычными абзацами и списком. Разметки тут
   ровно столько, сколько встретилось в исходном тексте. */
/* ── Слова, которые можно посмотреть глазами ──
   В тексте шага встречаются вещи, которых человек не видел: надбровный валик,
   мочка, брыли. Объяснять их словами можно бесконечно, а показать — одно
   касание. Слово подчёркивается, по нажатию открывается шторка со ссылками:
   фотография, рисунки, разбор.

   Совпадение ищется по основе: «валик», «валика», «валиком» — одно слово.
   Основа берётся из самого термина, поэтому короткие слова (меньше четырёх
   букв) в словарь не годятся: «нос» поймал бы «носить». Отмечается только
   первое вхождение в шаге — подчёркнутый текст читать тяжело. */
const courseTerms = () => (course() || {}).terms || {};

function termStem(слово) {
  const w = String(слово).toLowerCase();
  return w.length > 6 ? w.slice(0, -2) : w.length > 4 ? w.slice(0, -1) : w;
}

let termSeen = null;      // какие слова уже отмечены в этом шаге

function markTerms(html) {
  const словарь = courseTerms();
  const слова = Object.keys(словарь);
  if (!слова.length || !termSeen) return html;
  for (const слово of слова) {
    if (termSeen.has(слово)) continue;
    const основа = termStem(слово);
    if (основа.length < 4) continue;
    /* Ищем только в тексте, мимо тегов: (?![^<]*>) отсекает совпадения внутри
       атрибутов, иначе слово из data-term подчеркнулось бы само в себе. */
    // «>» в начале — слово сразу за тегом: в словаре термины набраны жирным
    const re = new RegExp("(^|[>\\s(«„\"—-])(" + основа + "[а-яё]{0,3})(?![^<]*>)", "iu");
    const m = re.exec(html);
    if (!m) continue;
    termSeen.add(слово);
    html = html.slice(0, m.index) + m[1]
      + `<button type="button" class="term" data-term="${esc(слово)}">${m[2]}</button>`
      + html.slice(m.index + m[0].length);
  }
  return html;
}

function stepBody(txt) {
  termSeen = new Set();
  return String(txt).split(/```[a-z]*\n?/).map((кусок, i) => {
    if (i % 2) return `<pre class="ls-pre">${esc(кусок.replace(/\n$/, ""))}</pre>`;
    const строки = кусок.split("\n");
    let out = "", список = false, таблица = [], абзац = [], цитата = [];
    /* Жирное и строчный код — единственная разметка внутри строки. Экранируем
       сначала, размечаем потом: иначе чужая угловая скобка уехала бы в разметку. */
    const внутри = (t) => esc(t)
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");

    /* В исходнике строки переносятся посреди предложения — это вёрстка файла,
       а не содержание. Абзац собираем целиком и разрываем только пустой
       строкой, иначе текст читается рваной лесенкой. */
    const сдайАбзац = () => {
      if (!абзац.length) return;
      const t = абзац.join(" ");
      абзац = [];
      const один = t.match(/^\*\*([^*]+)\*\*$/);
      if (один) { out += `<p class="ls-h3">${esc(один[1])}</p>`; return; }
      out += t.startsWith("**Зачем:**")
        ? `<p class="ls-why">${markTerms(внутри(t))}</p>`
        : `<p>${markTerms(внутри(t))}</p>`;
    };
    const сдайЦитату = () => {
      if (!цитата.length) return;
      out += `<p class="ls-note">${внутри(цитата.join(" "))}</p>`;
      цитата = [];
    };
    const сдайТаблицу = () => {
      if (!таблица.length) return;
      out += `<table class="ls-tab"><tbody>${таблица.map((r) =>
        `<tr>${r.map((c) => `<td>${внутри(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
      таблица = [];
    };
    const сдайСписок = () => { if (список) { out += "</ul>"; список = false; } };
    const всёСдать = () => { сдайАбзац(); сдайЦитату(); сдайСписок(); сдайТаблицу(); };

    for (const raw of строки) {
      const t = raw.trim();
      if (!t) { всёСдать(); continue; }
      if (t.startsWith("|") && t.endsWith("|")) {
        сдайАбзац(); сдайЦитату(); сдайСписок();
        const ячейки = t.slice(1, -1).split("|").map((x) => x.trim());
        // строка-разделитель заголовка ничего не значит: таблицы здесь без шапки
        if (!ячейки.every((c) => /^:?-{2,}:?$/.test(c))) таблица.push(ячейки);
        continue;
      }
      if (t.startsWith("- ")) {
        сдайАбзац(); сдайЦитату(); сдайТаблицу();
        if (!список) { out += "<ul>"; список = true; }
        out += `<li>${внутри(t.slice(2))}</li>`;
        continue;
      }
      if (t.startsWith("> ")) {
        сдайАбзац(); сдайСписок(); сдайТаблицу();
        цитата.push(t.slice(2));
        continue;
      }
      сдайЦитату(); сдайСписок(); сдайТаблицу();
      абзац.push(t);
    }
    всёСдать();
    return out;
  }).join("");
}

/* Три места, где смотрят вещь: как она выглядит, как её рисуют, что это такое.
   Яндекс для русских запросов даёт более близкое, Pinterest — единственное
   место, где ищутся именно учебные рисунки, а не фотографии. */
function termOpen(слово) {
  const т = courseTerms()[слово];
  if (!т) return;
  /* Ищем по-английски. У анатомии и учебных рисунков английские запросы дают
     в разы больше: русские выдачи забиты стоками и готовыми работами.
     Русский запрос остаётся третьей ссылкой — на случай, когда английский
     термин уводит не туда. */
  const en = encodeURIComponent(т.en || т.q || слово);
  const draw = encodeURIComponent(т.enDraw || ((т.en || слово) + " pencil drawing tutorial"));
  const q = encodeURIComponent(т.q || слово);
  /* Вопрос один и тот же для обоих: что это, где искать на натуре и как
     строится в рисунке. Длину задаём жёстко — иначе ответ разрастается на
     две страницы, а нужно понять за полминуты и вернуться к листу. */
  const вопрос = encodeURIComponent(
    `${слово} у собаки — что это такое.${т.t ? " Коротко: " + т.t : ""} `
    + `Ответь тремя абзацами: `
    + `1) что это анатомически и где находится; `
    + `2) как это выглядит и по какому признаку найти на фотографии живой собаки; `
    + `3) как это строят в карандашном рисунке головы и какую ошибку делают чаще всего. `
    + `Пиши коротко и конкретно, без вступлений. Покажи изображения.`);
  /* В ChatGPT уходит не вопрос, а задание нарисовать схему: словами объясняют
     Perplexity и книги, а тут нужна картинка, которой нигде нет — «где именно
     это место на голове и как оно строится линиями».
     Если у курса есть референс, схему просят строить по нему: общая собачья
     голова и голова с картины — разной формы, и объяснение «по вообще собаке»
     на своём листе не сходится. Сама картинка уходит через буфер: адресной
     строкой вложение в ChatGPT не передать, такого параметра нет. */
  const реф = (course() || {}).ref || "";
  if (реф) coverSrc(реф);           // просим заранее, пока шторка открыта
  const схема = encodeURIComponent(termPrompt(слово, т, реф));
  /* Установленная с домашнего экрана Кэйко открывает target="_blank" во
     встроенном мини-браузере — из него приложения не запускаются. */
  const мимо = (navigator.standalone === true) ? "" : ` target="_blank" rel="noopener"`;
  openSheet(`
    <h3>${esc(слово[0].toUpperCase() + слово.slice(1))}</h3>
    ${т.t ? `<p class="sub">${esc(т.t)}</p>` : ""}
    <div class="term-links">
      <a href="https://www.google.com/search?tbm=isch&q=${en}"${мимо}>Как выглядит</a>
      <a href="https://ru.pinterest.com/search/pins/?q=${draw}"${мимо}>Как рисуют</a>
      <a href="https://chatgpt.com/?q=${вопрос}"${мимо}>ChatGPT</a>
      <a href="https://chatgpt.com/?q=${схема}"${мимо} data-gptref="${esc(реф)}">${реф ? "Схема по картине" : "Нарисовать схему"}</a>
    </div>
    ${реф ? `<p class="term-note">Фрагмент головы уйдёт в буфер — вставьте его в ChatGPT перед отправкой.</p>` : ""}`);
  /* Копию кладём в том же касании, не дожидаясь её: если ждать, Safari
     теряет жест и вкладка не откроется. Переходу не мешаем — страница
     остаётся жить в соседней вкладке, и запись успевает дойти. */
  const ссылка = $("#sheet").querySelector("a[data-gptref]");
  if (ссылка && реф) ссылка.addEventListener("click", () => {
    const src = coverSrc(реф);
    if (!src) { toast("Фрагмент ещё качается — вставьте картинку сами"); return; }
    try {
      navigator.clipboard.write([new ClipboardItem({ "image/png": toPNG(src) })]);
      toast("Фрагмент в буфере — вставьте его в ChatGPT");
    } catch { toast("Скопировать не вышло — вставьте картинку сами"); }
  });
}

/* Задание для ChatGPT. С референсом просим разобрать место на самой картине
   и объяснить порядок линий: общая собачья голова и голова с картины разной
   формы, и объяснение «по вообще собаке» на своём листе не сходится. */
function termPrompt(слово, т, реф) {
  if (т.gen) return т.gen;
  const что = `${слово}.${т.t ? " " + т.t : ""}`;
  if (реф) return (
    `Я вставил фрагмент картины: голова собаки, по ней я рисую карандашом на А4. `
    + `(Если картинки рядом нет — разбирай по голове борзой в три четверти.) `
    + `Разбери ${что} `
    + `1. Где это на моём фрагменте: назови место через соседние ориентиры — глаз, скулу, угол рта, край уха. `
    + `2. Нарисуй схему по этому же фрагменту: слева голова целиком в том же повороте с отметкой места, `
    + `справа увеличенный кусок. Простой чертёж линиями, без тона, без цвета, без фона, короткие подписи по-русски. `
    + `3. Как нарисовать это место шаг за шагом: четыре-шесть коротких шагов, `
    + `с какой линии начать, чем проверять себя, и одна частая ошибка в конце. `
    + `Пиши коротко, без вступлений.`);
  return (
    `Нарисуй пояснительную схему для того, кто рисует собаку карандашом. `
    + `Покажи, что такое ${что} `
    + `Сделай два кадра рядом: голова собаки в три четверти целиком с отметкой этого места `
    + `и увеличенный фрагмент, где видно его форму. `
    + `Стиль — простой чертёж линиями, без тона, без цвета, без фона. `
    + `Короткие подписи по-русски. Ничего лишнего в кадре.`);
}

/* Буфер принимает только png: webp в него кладут не все браузеры, а blob-ссылка
   своя же, поэтому холст не портится и картинку из него отдают целиком. */
async function toPNG(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext("2d").drawImage(img, 0, 0);
  return await new Promise(r => c.toBlob(r, "image/png"));
}

/* ── Отдать файл книги ──
   На телефоне «скачать» — это лист «Поделиться»: оттуда файл кладут в Файлы
   или сразу отправляют в приложение нейросети, ради чего всё и затевалось.
   Где листа нет (настольный браузер) — обычная ссылка на скачивание. */
async function giveBookFile(b, кнопка) {
  const bk = b || book();
  let готово = "";
  const было = кнопка ? кнопка.textContent : "";
  if (кнопка) { кнопка.disabled = true; кнопка.textContent = "Качаю…"; }
  try {
    let текст = await catRaw(CAT_BOOK_FILE(bk.id), 60000);
    if (!текст) {
      const files = await catalogFiles(false);
      текст = await catText(files, CAT_BOOK_FILE(bk.id), 60000);
    }
    if (!текст) { toast("Файл книги не приехал"); return; }
    const имя = (bk.title || "Книга").replace(/[\/:*?"<>|]/g, "") + ".md";
    const blob = new Blob([текст], { type: "text/markdown" });
    const файл = (typeof File === "function") ? new File([blob], имя, { type: "text/markdown" }) : null;
    if (файл && navigator.canShare && navigator.canShare({ files: [файл] })) {
      await navigator.share({ files: [файл], title: bk.title || "Книга" });
      готово = "✓ Отдано";
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = имя;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    готово = "✓ Скачано";
  } catch (e) {
    // отмена листа «Поделиться» — не ошибка, ругаться тут не на что
    if (!(e && e.name === "AbortError")) toast("Не вышло отдать файл");
  } finally {
    if (кнопка) {
      кнопка.disabled = false;
      кнопка.textContent = было;
      delete кнопка.dataset.was;
      if (готово) btnSay(кнопка, готово);
    }
  }
}

/* ── Картинка шага ──
   Лежит в каталоге рядом с обложками и тянется тем же путём: файл с data-URI,
   копия в Cache Storage, показ по готовности. Открывается на весь экран с
   тем же щипком, что и снимки работ. */
function picOpen(src) {
  if (!src) { toast("Картинка ещё качается"); return; }
  const box = $("#picBox");
  const img = box.querySelector("img");
  img.src = src;
  img.style.transform = "";
  box.hidden = false;
  box.setAttribute("aria-hidden", "false");
  /* Рамка здесь во весь экран, а не по размеру картинки: иначе увеличение
     упиралось в её же формат, и на большом приближении оставалось маленькое
     окошко посреди чёрного. Предел выше обычного — разглядывать штрихи. */
  shZoom(box.querySelector(".sh-zoom"), 12);
}

function picClose() {
  const box = $("#picBox");
  if (!box || box.hidden) return false;
  box.hidden = true;
  box.setAttribute("aria-hidden", "true");
  box.querySelector("img").src = "";
  return true;
}

/* Сколько шагов урока закрыто — для полоски в сетке и на странице занятия. */
function lessonProgress(i) {
  if (courseWatch()) {
    const s = seenOf(i);
    const pct = s.dur ? Math.min(100, s.at / s.dur * 100) : 0;
    return { всего: s.dur ? 1 : 0, было: pct >= 98 ? 1 : 0, pct, seen: s };
  }
  const шаги = lessonSteps(i) || [];
  const было = шаги.filter((_, n) => lessonDone(i, "s" + n)).length;
  return { всего: шаги.length, было, pct: шаги.length ? было / шаги.length * 100 : 0 };
}

function lessonRender(box) {
  const ls = lessons();
  const at = prac.at;

  /* ── Сетка занятий ──
     Курс открывается не с того места, где бросил, а целиком: видно, что уже
     сделано, что впереди и сколько это займёт. Выбор — за тобой, а не за
     очередью: иногда хочется досмотреть лекцию, а не рисовать. */
  if (prac.screen === "pick") {
    box.innerHTML = `
      <div class="wk">
        <div class="ls-grid">
          ${ls.map((l, i) => {
            const п = lessonProgress(i);
            const всё = п.всего && п.было >= п.всего;
            return `
              <button class="ls-card${всё ? " done" : ""}" data-lgo="${i}" type="button">
                <i>${esc(l.icon || "🎨")}</i>
                <b>${esc(l.title || "Урок " + (i + 1))}</b>
                <em>${courseWatch()
                  ? (п.seen && п.seen.at ? "до " + Math.round(п.seen.at / 60) + " мин" : "не начинал")
                  : всё ? "пройдено" : п.было ? Math.round(п.pct) + "%" : "не начато"}</em>
                <span class="ls-bar"><u style="width:${п.pct.toFixed(0)}%"></u></span>
              </button>`;
          }).join("")}
        </div>
        <div class="ls-col">${рамкиHTML("Зачем это в жизни", (course() || {}).life)}</div>
        <div class="wk-row">
          <button class="pr-ghost" data-prac="finish">Закрыть</button>
        </div>
      </div>`;
    return;
  }

  if (prac.screen === "watch" && at) {
    const l = ls[at.i] || {};
    const s = seenOf(at.i);
    const всего = Math.round((l.dur || s.dur || 0) / 60);
    const мин = Math.round((s.at || 0) / 60);
    const pct = всего ? Math.min(100, мин / всего * 100) : 0;
    box.innerHTML = `
      <div class="wk">
        <div class="wk-task lc">
          <h3>${esc(l.title || "Занятие " + (at.i + 1))}</h3>
          <p class="lc-cap">досмотрел до</p>
          <div class="lc-big">
            <input class="lc-num" id="lcNum" type="number" inputmode="numeric"
              min="0" ${всего ? `max="${всего}"` : ""} value="${мин}">
            <em>мин</em>
          </div>
          <p class="lc-when">${всего ? "из " + всего + " " + plural(всего, "минута", "минуты", "минут")
            + " · " + Math.round(pct) + "%" : "длительность не задана"}</p>
          ${всего ? `<span class="ls-bar wide"><u style="width:${pct.toFixed(0)}%"></u></span>` : ""}
          <div class="lc-row">
            ${[-10, -5, 5, 10, 15].map((n) =>
              `<button data-lcadd="${n}" type="button">${n > 0 ? "+" + n : n}</button>`).join("")}
          </div>
          <div class="wk-row">
            <button class="pr-ghost" data-les="toPick">К занятиям</button>
            <button class="pr-ghost" data-prac="finish">Закрыть</button>
          </div>
        </div>
      </div>`;

    const пиши = (мин2) => { seenSet(at.i, Math.max(0, мин2) * 60, l.dur || s.dur || 0); pracRender(); };
    const num = $("#lcNum");
    if (num) {
      num.addEventListener("change", () => пиши(+num.value || 0));
      num.addEventListener("keydown", (e) => { if (e.key === "Enter") num.blur(); });
    }
    box.querySelectorAll("[data-lcadd]").forEach((b) =>
      b.addEventListener("click", () => пиши(мин + (+b.dataset.lcadd))));
    return;
  }

  /* ── Страница задания ──
     Сверху — зачем это вообще и что начнёшь замечать. Ниже список этапов, а не
     шагов: сколько внутри движений и минут, знать незачем, если курс интересен,
     а вот зачем этот этап — знать надо. Деление на заходы живёт внутри этапа,
     наружу его не выносим. Пройденное открыто для перечитывания, следующее
     подсвечено, дальнее пригашено. */

  if (prac.screen === "prep" && at) {
    const l = ls[at.i] || {};
    const bl = blockOfStep(at.i, at.step || 0);
    const p = lessonPrep(at.i, bl);
    box.innerHTML = `
      <div class="wk">
        <div class="wk-task">
          <p class="wk-kind">${esc(l.title || "\u0443\u0440\u043e\u043a")}</p>
          <p class="ls-stage">${esc((bl && bl.g) || "")}</p>
          <div class="ls-kind">\u{1F4CB} \u041f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u043a\u0430</div>
          ${p.надо
            ? `<ul class="ls-kit">${p.список.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`
            : `<p class="ls-text">\u0421\u0435\u0439\u0447\u0430\u0441 \u0442\u043e\u043b\u044c\u043a\u043e \u0441\u043c\u043e\u0442\u0440\u0435\u0442\u044c \u2014 \u0434\u043e\u0441\u0442\u0430\u0432\u0430\u0442\u044c \u043d\u0438\u0447\u0435\u0433\u043e \u043d\u0435 \u043d\u0430\u0434\u043e.</p>`}
          <p class="ls-slow">\u041d\u0435 \u0442\u043e\u0440\u043e\u043f\u0438\u0441\u044c \u2014 \u044d\u0442\u043e \u0442\u043e\u0436\u0435 \u0447\u0430\u0441\u0442\u044c \u0437\u0430\u043d\u044f\u0442\u0438\u044f.</p>
          <button class="pr-go" data-les="prepOk">\u0413\u043e\u0442\u043e\u0432\u043e, \u043d\u0430\u0447\u0430\u043b\u0438</button>
          <div class="wk-row">
            <button class="pr-ghost" data-prac="finish">\u0417\u0430\u043a\u043e\u043d\u0447\u0438\u0442\u044c</button>
          </div>
        </div>
      </div>`;
    return;
  }

  /* Конец занятия. Главное здесь — не поздравление, а разрешение встать: пока
     конца не видно, занятие превращается в задание, а этого мы не хотим. */
  if (prac.screen === "blockDone" && at) {
    const bl = prac.lastBlock || {};
    box.innerHTML = `
      <div class="wk">
        <div class="wk-task">
          <p class="wk-kind">\u0417\u0430\u043d\u044f\u0442\u0438\u0435 \u0437\u0430\u043a\u0440\u044b\u0442\u043e</p>
          <p class="ls-stage">${esc(bl.g || "")}</p>
          <p class="ls-text">\u041c\u043e\u0436\u043d\u043e \u0432\u0441\u0442\u0430\u0442\u044c. \u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c \u043c\u043e\u0436\u043d\u043e \u0441 \u044d\u0442\u043e\u0433\u043e \u0436\u0435 \u043c\u0435\u0441\u0442\u0430 \u043a\u043e\u0433\u0434\u0430 \u0443\u0433\u043e\u0434\u043d\u043e.</p>
          <button class="pr-go" data-les="blockNext">\u0414\u0430\u043b\u044c\u0448\u0435</button>
          <div class="wk-row">
            <button class="pr-ghost" data-prac="finish">\u041d\u0430 \u0441\u0435\u0433\u043e\u0434\u043d\u044f \u0445\u0432\u0430\u0442\u0438\u0442</button>
          </div>
        </div>
      </div>`;
    return;
  }

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

  if (at.phase === "step") {
    const steps = l.steps || [];
    const st = steps[at.step] || {};
    const done = steps.filter((_, n) => lessonDone(at.i, "s" + n)).length;
    const nextAt = (() => {
      for (let n = at.step + 1; n < steps.length; n++) if (steps[n].at) return steps[n].at;
      return "";
    })();
    const span = (st.k === "read" || !st.at) ? ""
      : (nextAt && nextAt !== st.at) ? st.at + "\u2013" + nextAt : "\u0441 " + st.at;
    const KIND = {
      watch: ["\u{1F440}", "\u0421\u043c\u043e\u0442\u0440\u0438", false],
      pause: ["\u{1F590}", "\u041f\u043e\u0432\u0442\u043e\u0440\u0438 \u0437\u0430 \u0430\u0432\u0442\u043e\u0440\u043e\u043c", true],
      do:    ["\u270D\uFE0F", "\u0421\u0434\u0435\u043b\u0430\u0439 \u0441\u0430\u043c", true],
      read:  ["\u{1F4CB}", "\u041f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u044c", false],
      note:  ["\u{1F4D6}", "\u041f\u0440\u043e\u0447\u0442\u0438", false],
    };
    const kind = KIND[st.k] || KIND.pause;
    const doing = kind[2];
    const last = at.step + 1 >= steps.length;
    const goLabel = st.k === "read"
      ? (last ? "\u0413\u043e\u0442\u043e\u0432\u043e \u2014 \u0443\u0440\u043e\u043a \u043f\u0440\u043e\u0439\u0434\u0435\u043d" : "\u0413\u043e\u0442\u043e\u0432\u043e, \u0434\u0430\u043b\u044c\u0448\u0435")
      : doing ? (last ? "\u041f\u043e\u043b\u0443\u0447\u0438\u043b\u043e\u0441\u044c \u2014 \u0443\u0440\u043e\u043a \u043f\u0440\u043e\u0439\u0434\u0435\u043d" : "\u041f\u043e\u043b\u0443\u0447\u0438\u043b\u043e\u0441\u044c")
              : (last ? "\u041f\u043e\u0441\u043c\u043e\u0442\u0440\u0435\u043b \u2014 \u0443\u0440\u043e\u043a \u043f\u0440\u043e\u0439\u0434\u0435\u043d" : "\u041f\u043e\u0441\u043c\u043e\u0442\u0440\u0435\u043b, \u0434\u0430\u043b\u044c\u0448\u0435");
    /* Конспект этапа виден всегда, без кнопки, но стоит под кнопками: сверху
       должно быть само действие, а объяснение — фоном под ним, для тех минут,
       когда захочется понять, зачем этот кусок. Ходить между шагами можно
       свободно — стрелки и списки ничего не отмечают, отметку ставит только
       большая кнопка. */
    const stage = st.g || "";
    /* Не «шаг 34 из 53» — цифра, от которой опускаются руки, — а где ты внутри
       занятия. Движения считаем отдельно от смотрения: рука устаёт от них, а
       не от минут ролика. */
    const блоки = lessonBlocks(at.i);
    const бл = блоки.find((x) => at.step >= x.from && at.step <= x.to);
    const номер = бл ? блоки.indexOf(бл) + 1 : 0;
    const движНомер = бл ? steps.slice(бл.from, at.step + 1).filter(lessonDoing).length : 0;
    /* У материала, где занятие одно, счётчик «занятие 3 из 14» только повторяет
       слово и сбивает: там не занятия, а один процесс от начала до конца. */
    const blockLabel = (бл && !plainCourse())
      ? ` \u00b7 \u0437\u0430\u043d\u044f\u0442\u0438\u0435 ${номер} \u0438\u0437 ${блоки.length}`
        + (бл.doing ? ` \u00b7 \u0434\u0432\u0438\u0436\u0435\u043d\u0438\u0435 ${Math.max(1, движНомер)} \u0438\u0437 ${бл.doing}` : "")
      : "";
    const stageSum = (l.stages && l.stages[stage]) || (stage ? "" : l.summary || "");
    const stepDone = lessonDone(at.i, "s" + at.step);
    const sumHTML = (txt) => txt.split("\n").map((line) => {
      const t = line.trim();
      if (!t) return "";
      return t.startsWith("\u2022") ? `<li>${esc(t.slice(1).trim())}</li>` : `<p>${esc(t)}</p>`;
    }).join("");
    box.innerHTML = `
      <div class="wk">
        <div class="wk-task">
          <p class="wk-kind">${esc(l.title || "\u0443\u0440\u043e\u043a " + (at.i + 1))}${blockLabel}</p>
          ${stage ? `<p class="ls-stage">${esc(stage)}</p>` : ""}
          <div class="ls-kind">${kind[0]} ${esc(kind[1])}${span ? ` \u00b7 ${esc(span)}` : ""}</div>
          <p class="ls-text">${esc(st.t || "")}</p>
          ${(() => {
            if (!st.img) return "";
            const src = coverSrc(st.img, "");
            /* Пропорция известна заранее и стоит на самой кнопке: пока картинка
               качается, место под неё уже отведено ровно то, какое нужно, и
               текст под ней не прыгает, когда она приезжает. Картинки разные:
               фотографии узкие, схемы широкие. */
            const rat = st.iw && st.ih ? `aspect-ratio:${st.iw} / ${st.ih}` : "";
            return `<button class="ls-shot${src ? "" : " wait"}" type="button"
              data-lspic="${esc(st.img)}" aria-label="Открыть картинку"
              ${rat ? `style="${rat}"` : ""}>
              ${src ? `<img src="${esc(src)}" data-cov="${esc(st.img)}" alt="" loading="lazy" decoding="async">` : ""}
            </button>`;
          })()}
          ${st.d ? `<div class="ls-body">${stepBody(st.d)}</div>` : ""}
          ${stepDone ? `<p class="wk-passed">\u2713 \u0443\u0436\u0435 \u043f\u0440\u043e\u0439\u0434\u0435\u043d\u043e \u2014 \u043c\u043e\u0436\u043d\u043e \u043f\u0440\u043e\u0441\u0442\u043e \u043f\u0435\u0440\u0435\u0447\u0438\u0442\u0430\u0442\u044c</p>` : ""}
          ${doing && !stepDone && st.at ? `<p class="ls-slow">\u041f\u043e\u0441\u043c\u043e\u0442\u0440\u0438 \u043a\u0443\u0441\u043e\u043a, \u043e\u0441\u0442\u0430\u043d\u043e\u0432\u0438 \u0440\u043e\u043b\u0438\u043a \u0438 \u043f\u043e\u0432\u0442\u043e\u0440\u0438 \u043c\u0435\u0434\u043b\u0435\u043d\u043d\u043e. \u041e\u0442\u043c\u0435\u0442\u044c, \u043a\u043e\u0433\u0434\u0430 \u043f\u043e\u043b\u0443\u0447\u0438\u043b\u043e\u0441\u044c \u2014 \u0441\u043f\u0435\u0448\u0438\u0442\u044c \u043d\u0435\u043a\u0443\u0434\u0430.</p>` : ""}
          <button class="pr-go" data-les="stepOk">${esc(goLabel)}</button>
          <div class="wk-row">
            <button class="pr-ghost" data-les="stepBack" aria-label="\u0428\u0430\u0433 \u043d\u0430\u0437\u0430\u0434"${at.step ? "" : " disabled"}>\u2039</button>
            <button class="pr-ghost" data-les="stepFwd" aria-label="\u0428\u0430\u0433 \u0432\u043f\u0435\u0440\u0451\u0434"${last ? " disabled" : ""}>\u203A</button>
            <button class="pr-ghost" data-les="stepList">\u0428\u0430\u0433\u0438</button>
            <button class="pr-ghost" data-les="stepPick">\u0423\u0440\u043e\u043a\u0438</button>
            <button class="pr-ghost" data-prac="finish">\u0417\u0430\u043a\u043e\u043d\u0447\u0438\u0442\u044c</button>
          </div>
          ${stageSum ? `<div class="ls-sum">${sumHTML(stageSum)}</div>` : ""}
          ${prac.pickOpen ? `<div class="ls-list">${ls.map((x, n) => {
            const total = (x.steps || []).length;
            const d = total ? (x.steps || []).filter((_, m) => lessonDone(n, "s" + m)).length : 0;
            return `<button class="ls-li${n === at.i ? " now" : ""}${total && d >= total ? " done" : ""}" data-lpick="${n}" type="button">
              <span>${total && d >= total ? "\u2713" : "\u2022"}</span><b>${esc(x.title || "\u0443\u0440\u043e\u043a " + (n + 1))}</b>${total ? `<em>${d}/${total}</em>` : ""}</button>`;
          }).join("")}</div>` : ""}
          ${prac.listOpen ? `<div class="ls-list">${steps.map((x, n) => {
            const d = lessonDone(at.i, "s" + n), now = n === at.step;
            const ic = { watch: "\u{1F440}", pause: "\u{1F590}", do: "\u270D\uFE0F", read: "\u{1F4CB}" }[x.k] || "\u2022";
            let e = "";
            for (let m = n + 1; m < steps.length; m++) if (steps[m].at) { e = steps[m].at; break; }
            const rng = (x.k === "read" || !x.at) ? "" : (e && e !== x.at) ? x.at + "\u2013" + e : x.at;
            return `<button class="ls-li${now ? " now" : ""}${d ? " done" : ""}" data-lstep="${n}" type="button">
              <span>${d ? "\u2713" : ic}</span><b>${esc((x.t || "").slice(0, 60))}</b>${rng ? `<em>${esc(rng)}</em>` : ""}</button>`;
          }).join("")}</div>` : ""}
        </div>
      </div>`;
    return;
  }

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
/* Сколько прочитано за этот заход и откуда докуда. Запись хранит только
   страницу, на которой остановился, — начало берём там, где кончился
   предыдущий заход по этой книге. «До 210-й» само по себе не говорит
   ничего: то ли двадцать страниц, то ли две. */
function bookRunOf(e) {
  const b = (data.book.books || []).find((x) => x.id === (e.bookId || "snow-1"));
  if (!b) return "";

  if ((e.spans || []).length) {                       // книга-сборник: части вразнобой
    const sp = mergeSpans(e.spans);
    const n = sp.reduce((s, x) => s + (x.to - x.from + 1), 0);
    return sp.map((x) => x.from + "–" + x.to).join(", ") + " стр."
      + (n ? " · " + n + " " + plural(n, "страница", "страницы", "страниц") : "");
  }
  if (!e.page) return "";

  let prev = b.startPage || 0;
  for (const x of bookEntriesOf(b.id)) {
    const earlier = x.date < e.date
      || (x.date === e.date && (x.createdAt || 0) < (e.createdAt || 0));
    if (!earlier) continue;
    prev = Math.max(prev, x.page || 0);
    for (const s of x.spans || []) prev = Math.max(prev, s.to || 0);
  }
  const gain = e.page - prev;
  if (gain <= 0) return "перечитывал, до " + e.page + "-й стр.";
  if (gain === 1) return e.page + "-я стр.";        // «241–241 · 1 страница» — лишнее
  return (prev + 1) + "–" + e.page + " стр. · "
    + gain + " " + plural(gain, "страница", "страницы", "страниц");
}

/* Объём захода одной строкой: что именно трогал и сколько этого было.
   «18 мин» не говорит, разобрал ты четыре такта или весь лист. */
const runRanges = (list) => {
  const sp = mergeSpans(list);
  const n = sp.reduce((a, x) => a + (x.to - x.from + 1), 0);
  // одиночку пишем числом: «8–8» выглядит как опечатка
  return { text: sp.map((x) => x.from === x.to ? String(x.from) : x.from + "–" + x.to).join(", "), n };
};

function pianoRunOf(e) {
  // руки складываем в один диапазон: важно, какое место игралось, а не чем
  if (!(e.spans || []).length) return "";
  const r = runRanges(e.spans.map((x) => ({ from: x.from, to: x.to })));
  return "такты " + r.text + " · " + r.n + " " + plural(r.n, "такт", "такта", "тактов");
}

function courseRunOf(e) {
  const list = (e.lessons || []).slice().sort((a, b) => a - b);
  if (!list.length) return "";
  // уроки хранятся номерами позиций, человеку показываем счёт с единицы
  const r = runRanges(list.map((i) => ({ from: i + 1, to: i + 1 })));
  return "уроки " + r.text + " · " + r.n + " " + plural(r.n, "урок", "урока", "уроков");
}

function sessionText(track, e) {
  if (track === "book") {
    const b = (data.book.books || []).find((x) => x.id === (e.bookId || "snow-1"));
    const run = bookRunOf(e);
    return "Читал: " + ((b && b.title) || "книга") + (run ? " · " + run : "");
  }
  if (track === "piano") {
    const p = (data.piano.pieces || []).find((x) => x.id === (e.pieceId || "bwv853"));
    const run = pianoRunOf(e);
    return "Занимался: " + ((p && p.name) || "пьеса")
      + (run ? " · " + run : "") + (e.mins ? " · " + e.mins + " мин" : "");
  }
  if (track === "pastel") {
    if (plainDraw()) {
      const свои = courseEntries().slice().sort((x, y) => x.date < y.date ? -1 : x.createdAt - y.createdAt);
      const дни = [...new Set(свои.map((x) => x.date))];
      const день = дни.indexOf(e.date) + 1;
      const сессия = свои.filter((x) => x.date === e.date).findIndex((x) => x.id === e.id) + 1;
      return "Рисовал: " + (course().name || "рисунок")
        + " · день " + (день || 1) + ", сессия " + (сессия || 1);
    }
    const run = courseRunOf(e);
    return "Урок: " + (course().name || "курс")
      + (run ? " · " + run : "") + (e.mins ? " · " + e.mins + " мин" : "");
  }
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
/* Разовая уборка: заходы короче двух минут занятиями не считаются, и те,
   что успели записаться раньше, из истории убираются. Трогаем только записи
   самого занятия по плану — ручные отметки, где минут просто нет, остаются
   как есть. Разбор пьесы не трогаем: это пройденные такты, а не время. */
function shortPracReset() {
  if (data.pracTrimV === 1) return;
  let n = 0;
  for (const e of (data.piano.entries || [])) {
    if (e.deleted) continue;
    if (typeof e.mins !== "number" || e.mins >= 2) continue;
    if (!String(e.note || "").startsWith("занятие по плану")) continue;
    e.deleted = true; e.updatedAt = now(); n++;
  }
  data.pracTrimV = 1;
  saveData();
  if (n) schedulePush();
}

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
  /* Запись ищем по дню И по курсу: без курса два курса, отмеченные в один
     день, писались в одну запись — минуты одного уходили в статистику
     другого. Старые записи без courseId считаем принадлежащими первому. */
  const первый = firstCourseId();
  const мой = course().id;
  let e = data.pastel.entries.find((x) => !x.deleted && x.date === ds
    && (x.courseId || первый) === мой);
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
    /* Урок — не пьеса: прячем плеер и видео и рисуем свою лестницу. Раньше
       здесь была опечатка (else цеплялся к видео, а не к kind), и урок
       проваливался в код пианино, где падал на piece(). */
    const pl = $("#pracPlayer"); if (pl) pl.hidden = true;
    const vd = $("#pracVideo"); if (vd) vd.hidden = true;
    lessonRender($("#pracStage"));
    return;
  }
  const m = Math.floor(pracMin());
  $("#pracWhere").textContent = piece().name + (prac.startedAt ? " · " + m + " мин" : "");
  const box = $("#pracStage");

  const u = pracUnitNow();
  if (!u) { pracFinish(); return; }
  prac.cur = u;
  pracPlayer();
  plFollow(u);
  pracVideo(u);

  const w = pracWhere();
  const имя = blockWhy(w.bl).why;
  const блоков = w.blocks.length;
  const готово = w.blocks.filter(blockDone).length;

  const кнопки = LVLS.map((l) => `
    <button class="rep l${l.k}" data-lvl="${l.k}" type="button">
      <b>${l.name}</b><span>${l.hint}</span>
    </button>`).join("");

  /* Кружки — того шага, который сейчас: у чтения свой счёт, у каждого ключа
     свой, у игры двумя руками свой. Трудность у них разная, и мешать их в
     одну кучу значит не увидеть, где именно тяжело. */
  const свои = u.run ? runOf(w.bl) : u.final ? finalOf(w.bl) : repsOf(u.from, u.step);
  const сколько = u.final ? Math.max(3, свои.length + 1) : stepGoal(u.from, u.step);
  const шаг = u.run ? "Играю с начала до этого места"
    : u.final ? "Играю блок целиком" : STEP_NAME[u.step];

  box.innerHTML = `
    <div class="wk">
      <div class="wk-task">
        <p class="wk-kind">${esc(имя || "такты " + w.bl.from + "–" + w.bl.to)}</p>
        <div class="wk-big">${pracSpan(u)}</div>
        <p class="wk-hand">${esc(шаг)}</p>
        <div class="dots big">${dotsHTML(свои, сколько)}</div>
        ${u.final ? `<p class="wk-next">пока идёт «сложно» — повторяем; «с усилием» или «легко» ${
          u.run ? "закрывают прогон" : "закрывают блок"}</p>` : ""}
        <div class="rep-btns">${кнопки}</div>
        <div class="wk-row">
          ${u.final ? `<button class="pr-ghost" data-prac="again">${
            u.run ? "Пройти ещё раз" : "Пройти блок ещё раз"}</button>` : ""}
          <button class="pr-ghost" data-prac="list">Такты</button>
          ${pracDoc() ? `<button class="pr-ghost" data-prac="hint">${prac.hintOpen ? "Скрыть ноты" : "Ноты"}</button>` : ""}
          ${prac.undo ? '<button class="pr-ghost" data-prac="undo">Отменить</button>' : ""}
        </div>
        <p class="wk-tail">пройдено блоков: ${готово} из ${блоков}</p>
        ${prac.hintOpen ? pracHintHTML(u) : ""}
      </div>
    </div>
    ${prac.listOpen ? `<div class="bl-wrap" id="pracList">${pracListHTML()}</div>` : ""}`;
}

/* Очереди больше нет: где мы находимся, целиком следует из отметок. Сыграл
   такт — счётчик вырос, и следующий шаг вычисляется заново. Так занятие не
   может разъехаться с данными, что бы ни случилось между заходами. */
function pracNext() {
  const u = pracUnitNow();
  prac.cur = u;
  prac.unitAt = Date.now();          // с этого мгновения считаем время на отрезок
  prac.screen = u ? "work" : "done";
  if (!u) { pracFinish(); return; }
  pracRender();
}

function openLesson() {
  if (!isCourse() || !lessons().length) { toast("Уроков пока нет"); return; }
  const at = lessonNext();
  /* Входим в сетку занятий, а не в шаг. Правило «Открыл — играешь» снято с
     пианино, где готовить нечего и выбирать не из чего: там одна пьеса и одно
     место, с которого продолжаешь. Курс устроен иначе — восемь разных занятий,
     и половина из них смотрится, а не рисуется. Пусть выбор будет виден. */
  prac = {
    kind: "lesson", screen: plainCourse() ? "work" : "pick", at, taskAt: 0, stepAt: Date.now(), counted: 0,
    lastBlock: null,
    achBefore: achDoneSet(), factsBefore: factsOpenSet(),
    startedAt: Date.now(), breakMs: 0, restFrom: 0, restUntil: 0, askedAt: 0, back: "",
    cur: null, queue: [], closed: [], reviewed: [], pick: null, undo: null, hintOpen: false, listOpen: false,
  };
  /* Запись не заводим на открытии: нажал «Начать урок», передумал и вышел —
     занятия не было, и в истории его быть не должно. Подход засчитается
     на первом настоящем действии. */
  $("#prac").hidden = false;
  $("#prac").setAttribute("aria-hidden", "false");
  clearInterval(pracTimer);
  pracTimer = setInterval(() => {
    if (!prac) return;
    pracClock();
    if (pracTicking()) pracRender();
    pracWatch();
  }, 1000);
  keepAwake(true);
  pracRender();
}

function openPractice() {
  if (!isPiano() || !piece().bars) { toast("Практика пока только для пьес"); return; }
  // разбора может не быть на этом устройстве — просим каталог сразу
  if (!pracDoc() && cfg.token && cfg.catalogId)
    catalogPull(true).then(() => { if (prac) pracRender(); }).catch(() => {});
  /* Промежуточного экрана «занятие такое-то · продолжить» больше нет: он
     ничего не решал, а вставал между тобой и первым тактом. Открыл — играешь. */
  prac = {
    screen: "work", cur: null, queue: [], closed: [], reviewed: [], pick: null, undo: null, listOpen: false,
    achBefore: achDoneSet(), factsBefore: factsOpenSet(),
    startedAt: Date.now(), counted: 0,
    breakMs: 0, restFrom: 0, restUntil: 0, askedAt: 0, back: "", hintOpen: false,
  };
  $("#prac").hidden = false;
  $("#prac").setAttribute("aria-hidden", "false");
  document.body.classList.add("prac-on");
  clearInterval(pracTimer);
  pracTimer = setInterval(() => {
    if (!prac) return;
    pracClock();
    pracWatch();
  }, 1000);
  keepAwake(true);
  pracNext();
}

/* Минуты в шапке идут сами. Раньше строка обновлялась только вместе со всем
   экраном — то есть на переходе к следующему такту: сидишь над одним местом
   двадцать минут, а вверху всё те же «0 мин». Перерисовывать целиком раз в
   секунду нельзя — схлопнутся раскрытые списки и собьётся прокрутка, поэтому
   трогаем ровно одну строку. */
/* Раз в секунду перерисовывается только тот экран, где бегут секунды: старые
   фазы урока, у которых время стоит цифрами во весь экран. У шага и у лекции
   секунд нет, а перерисовка пересоздаёт разметку целиком — из-за неё картинка
   шага мигала каждую секунду, заново подставляясь в новый <img>. */
const pracTicking = () => !!(prac && prac.taskAt && prac.at
  && prac.screen !== "watch" && prac.at.phase !== "step");

function pracClock() {
  const el = $("#pracWhere");
  if (!el || !prac) return;
  const имя = prac.kind === "lesson" ? course().name : (piece() ? piece().name : "");
  el.textContent = имя + (prac.startedAt ? " · " + Math.floor(pracMin()) + " мин" : "");
}

function closePractice() {
  clearInterval(pracTimer);
  cancelAnimationFrame(pracRaf);
  if (pracAudioEl) { try { pracAudioEl.pause(); } catch {} }
  pracAudioEl = null;
  const pl = $("#pracPlayer");
  if (pl) { pl.innerHTML = ""; pl.hidden = true; }
  clearInterval(vidTimer);
  try { V.pause(); } catch {}
  pracVidEl = null; ytPlayer = null; vkPlayer = null; vidKind = "";
  const vd = $("#pracVideo");
  if (vd) { vd.classList.remove("full"); vd.innerHTML = ""; vd.hidden = true; vd.dataset.mode = ""; vd.dataset.for = ""; }
  document.body.classList.remove("vd-full");
  prac = null;
  $("#prac").hidden = true;
  $("#prac").setAttribute("aria-hidden", "true");
  document.body.classList.remove("prac-on");
  if (!zenOn) keepAwake(false);
  render();
}

/* Время получения записывается в тот момент, когда награда открылась.
   Восстанавливать его задним числом было ошибкой: у наград, заработанных
   до появления этой записи, привязка выходила к случайной отметке. */
/* Что открылось прямо сейчас, знает только тот, кто снял состояние до отметки,
   — поэтому эти списки приходят снаружи. Без них здесь было «всё, у чего ещё
   нет времени», а это совсем другое множество: награда могла открыться на
   прошлой неделе, на другом устройстве или в другом материале и просто не
   попасть под запись времени. Такая награда получала время нынешней отметки и
   ехала в карточку сегодняшней сессии — хотя заработана была раньше.

   Остальному ставим единицу — «получено когда-то». Соврать точным временем
   хуже, чем честно расписаться в незнании: по единице лента ничего никуда не
   привяжет, а по выдуманному «сейчас» привязала бы к последней сессии. */
function stampProgress(justAch, justFacts) {
  data.achAt = data.achAt || {};
  data.factAt = data.factAt || {};
  const k = curKey();
  const nowAch = new Set((justAch || []).map((a) => a.id));
  const nowFacts = new Set((justFacts || []).map((f) => f.id));
  const fresh = { ach: [], facts: [] };
  /* Проверяем именно отсутствие ключа: ранее полученное помечено единицей
     как «время неизвестно», и ноль здесь считался бы пустым местом. */
  for (const a of achState())
    if (a.done && data.achAt[k + ":" + a.id] === undefined) {
      const сейчас = nowAch.has(a.id);
      data.achAt[k + ":" + a.id] = сейчас ? now() : 1;
      if (сейчас) fresh.ach.push({ id: a.id, icon: a.icon, name: a.name });
    }
  for (const f of factsState())
    if (f.open && data.factAt[k + ":" + f.id] === undefined) {
      const сейчас = nowFacts.has(f.id);
      data.factAt[k + ":" + f.id] = сейчас ? now() : 1;
      if (сейчас) fresh.facts.push({ id: f.id, t: f.t });
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

  const stamped = stampProgress(freshAch, freshFacts);
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
const PRAC_MIN_ENTRY = 2;             // минут: короче — это не занятие, а взгляд одним глазом

function pracEntry(make) {
  const ds = todayStr();
  let e = data.piano.entries.find((x) => !x.deleted && x.date === ds && (x.pieceId || "bwv853") === piece().id);
  /* Заглянул на секунду — записи не будет. Раньше в истории заводились
     занятия по одной секунде: формально правда, а по смыслу мусор. */
  if (!e && make && prac && pracMin() < PRAC_MIN_ENTRY) return null;
  if (!e && make) {
    e = { id: uid(), date: ds, pieceId: piece().id, spans: [], mins: 0, sessions: 0,
          note: "занятие по плану", createdAt: now(), updatedAt: now() };
    /* Отрезки, закрытые до того, как минута набралась, не пропадают:
       они дожидались здесь и уходят в запись целиком. */
    if (prac && prac.pending && prac.pending.length) {
      e.spans.push(...prac.pending);
      prac.pending = [];
    }
    data.piano.entries.push(e);
  }
  return e || null;
}

/* Минуты за день КОПЯТСЯ. Раньше запись перезаписывалась временем последнего
   захода: позанимался час в три подхода — в истории осталось двадцать минут
   от последнего. Дописываем только прирост с прошлой записи. */
function pracCount() {
  const e = pracEntry(true);
  if (!e) return null;                 // ещё не минута — записи пока нет
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
  const hands = u.hand === "both" ? ["right", "left"] : [u.hand];
  const e = pracEntry(true);
  if (!e) {
    // минуты ещё нет: придерживаем отрезки до того, как запись появится
    prac.pending = (prac.pending || []).concat(hands.map((h) => ({ hand: h, from: u.from, to: u.to })));
    saveData();
    return hands.length;
  }
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
    /* Раньше запись в ленту шла только если закрыт целый урок. У курса по
       шагам урок один на сорок ходов, и день рисования не попадал в ленту
       вовсе: «порисовал, а в статистике пусто». Пишем, если сделано хоть
       что-нибудь — ход, минуты или урок. И ключ берём живой: у второго курса
       он свой, а жёстко вписанный «pastel» вешал его дни на первый курс. */
    const шагов = Object.values(lessonStore().done || {})
      .filter((d) => d === todayStr()).length;
    const части = [];
    if (e.mins) части.push(e.mins + " мин");
    if (шагов) части.push(шагов + " " + plural(шагов, "шаг", "шага", "шагов"));
    if (e.lessons && e.lessons.length)
      части.push(e.lessons.length + " " + plural(e.lessons.length, "урок", "урока", "уроков"));
    if (части.length) addEvent("session", curKey(), "pastel",
      (course().mode === "watch" ? "Смотрел: " : "Рисовал: ") + course().name + " · " + части.join(", "),
      { fields: { mins: e.mins, steps: шагов, createdAt: now(),
                  awards: prac.wonAwards || [], facts: prac.wonFacts || [] } });
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
  // короткий заход занятием не считается: ни записи, ни серии, ни минут
  /* Час над нотами без единой сыгранной ноты — это занятие. Раньше запись
     заводилась только от закрытого отрезка, и разбор глазами пропадал. */
  /* Условие «был закрытый отрезок или уже есть запись за день» противоречило
     тому, что обещано строкой выше, и съедало занятия целиком: сел, разбирал
     пятнадцать минут, ничего не отметил, закрыл крестиком — и ни минут, ни
     записи, ни серии. Время за инструментом — уже занятие; отметки решают
     только, что писать в тексте. */
  if (prac && prac.startedAt && pracMin() >= PRAC_MIN_ENTRY) {
    const e = pracCount();
    if (!e) { closePractice(); return; }
    pracStore().session++;
    saveData();
    schedulePush();
    won = pracCelebrate();
    // след в ленте остаётся и без закрытых отрезков — иначе занятия будто не было
    addEvent("session", piece().id, "piano",
      "Занимался: " + piece().name + " · " + e.mins + " мин"
      + (closed ? ", " + closed + " " + plural(closed, "заход", "захода", "заходов") : ""),
      { fields: { mins: e.mins, createdAt: now(), awards: prac.wonAwards || [], facts: prac.wonFacts || [] } });
    toast("Занятие записано: " + e.mins + " мин"
      + (closed ? " · " + closed + " " + plural(closed, "заход", "захода", "заходов") : ""));
  }
  closePractice();
  if (won) setTimeout(() => showWon(won), 380);
}


/* ══════════ Карта мест во весь экран ══════════
   Маленькая карта в разборе — только повод открыть большую: там точки
   приближаются пальцами, а нажатие поднимает карточку снизу. Ссылка ведёт на
   обычные карты — посмотреть, как место выглядит сегодня. */
let gm = null;      // {места, рамка, at, scale, tx, ty}

function openPlaceMap(bk, i, выбрать) {
  useMark("карта");
  const места = mapPoints(bk, i);
  // рамка нужна метке; списку справок — нет, и подложку он не ждёт
  const рамка = mapBox(bk) || { west: -180, east: 180, north: 85, south: -85 };
  if (!места.length || (!mapBox(bk) && mapHasPlaces(bk))) { toast("Карты пока нет"); return; }
  const box = $("#gmap");
  if (!box) return;
  /* Какая глава выбрана при открытии: та, которую читаешь. Выбранная точка
     важнее — если пришли из разбора к месту, глава не подставляется. */
  const часть = (i < 0 && !выбрать) ? mapHereChapter(bk) : 0;
  gm = { места, рамка, at: выбрать || null, часть, слой: "", scale: 1, tx: 0, ty: 0, id: bk.id, i,
         чтение: null, чтениеГл: null, метка: null, поиск: "",
         части: mapPartsOf(bk),
         name: i >= 0 && (bk.chapters || [])[i] ? (bk.chapters[i].name || "") : (bk.title || "") };
  gmTitle();
  gmTocBtn();
  /* Полоса «Объясни» живёт внутри карты и переживала её закрытие: с прошлой
     книгой, прошлой фразой и прошлым обработчиком. Открыли карту другой книги,
     нажали — и в ChatGPT уезжал фрагмент из «Одиссеи». Гасим на входе. */
  gmAskHide();
  /* Файл с местами мог обновиться в гисте — спрашиваем при каждом открытии
     карты. Раньше это делал экран разбора; его сняли, и файл перестал
     обновляться совсем: на телефоне навсегда оставалась первая версия. */
  mapFresh(bk);
  const img = $("#gmImg");
  const ключ = mapKey(bk.id);
  const src = artSrc(ключ, mapFile(bk.id));
  if (src) img.src = src;
  else {
    /* Картинки ещё нет на устройстве: показываем ожидание и ставим её, как
       только приедет, — сама карта об этом не узнает, перерисовка приложения
       её не касается. */
    img.removeAttribute("src");
    gmWait(true);
    pullArt(ключ, mapFile(bk.id));
    /* Ждём картинку, а не одно завершение запроса: её мог тянуть кто-то другой
       раньше нас — тогда наш вызов вернётся сразу и ни о чём не скажет. */
    let попыток = 0;
    const ждать = setInterval(() => {
      if (!gm) { clearInterval(ждать); return; }
      const s2 = coverCache.get("art:" + ключ);
      if (s2) {
        clearInterval(ждать);
        img.src = s2;
        gmWait(false);
        gmFit();
      } else if (++попыток > 40) {              // двадцать секунд — и хватит
        clearInterval(ждать);
        gmWait(false);
        toast("Карта не загрузилась — попробуй ещё раз");
      }
    }, 500);
  }
  box.hidden = false;
  box.setAttribute("aria-hidden", "false");
  document.body.classList.add("prac-on");
  gmPins();
  gmList();
  gmFit();
  gmCard();
  keepAwake(true);
  /* Точки и запросы для поиска живут в том же файле, что разбор: спрашиваем
     свежий — на устройстве мог лежать старый, ещё с русскими запросами. */
  pullArts(bk.id).then((новое) => {
    if (!новое || !gm || gm.id !== bk.id) return;
    gm.места = mapPoints(bk, i);
    gm.рамка = mapBox(bk) || gm.рамка;
    gm.части = mapPartsOf(bk);
    gmTocBtn();
    gmPins();
    gmCard();
  }).catch(() => {});
}

function gmWait(on) {
  const stage = $("#gmStage");
  if (!stage) return;
  let el = $("#gmWait");
  if (on) {
    if (!el) {
      el = document.createElement("div");
      el.id = "gmWait";
      el.className = "ar-wait";
      el.style.cssText = "position:absolute;inset:0;display:grid;place-items:center;background:transparent";
      el.textContent = "карта загружается…";
      stage.appendChild(el);
    }
  } else if (el) el.remove();
}

/* ══════════ Артефакты ══════════
   Вещи из музеев, привязанные к книгам. Раздел живёт своей вкладкой: смотреть,
   что открылось, ходят так же часто, как проверять цифры прогресса.
   Сетка плиток, а не список: музей — это витрина, вещи должно быть видно разом.
   Изображения не показываем: они лежат в чужих базах, весят и грузятся по сети,
   а карточка музея открывается по ссылке и так. */
let mus = { book: "", at: null };     // выбранная книга и открытый предмет

/* Короткое имя главы: «Песнь XVII», «Февраль», «Часть первая». Берём из
   оглавления книги и обрезаем по точке — полное название в плитку не влезет. */
const musChName = (x) => {
  const n = Number(x.ch);
  if (!n) return "";
  if (x.book === COURSE_MUS) {
    const c = courses()[0] || (data.pastel && data.pastel.course) || {};
    const l = (c.lessons || [])[n - 1];
    return (l && l.title) ? l.title : "урок " + n;
  }
  const b = (data.book.books || []).find((y) => y.id === x.book);
  const c = b && (b.chapters || [])[n - 1];
  return c && c.name ? String(c.name).split(".")[0].trim() : "глава " + n;
};

/* Название книги по её id: предмет знает только id, а человеку нужно имя. */
const musBookName = (id) => {
  const c = courseByBook(id);
  if (c) return c.name || "Курс";
  const b = (data.book.books || []).find((x) => x.id === id);
  return b ? b.title : id;
};

/* Один предмет во весь экран: всё, что о нём известно, и переходы к соседям
   по списку — чтобы листать находки, не возвращаясь в сетку каждый раз. */
function предметHTML(x, список) {
  const i = список.findIndex((y) => y.id === x.id);
  const пред = список[i - 1], след = список[i + 1];

  const имяQ = (x.q || `${x.name} ${x.museum || ""}`).trim();
  const кадр = (ш) => x.img ? x.img + (x.img.includes("?") ? "&" : "?") + `w=${ш}&h=${ш}` : "";
  const фото = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(имяQ)}`;
  /* Вопрос поиску: короткий ответ с картинками, опора на карточку музея и на
     снимок предмета из его базы — без них подставляются чужие изображения. */
  const вид = musKind(x);
  const вопрос = encodeURIComponent(
    вид === "живое"
      /* Про живое интереснее не справка, а происхождение: откуда имя, от кого
         произошло, почему живёт именно здесь. И простым языком — сложность
         тут не добавляет точности, только отбивает желание дочитать. */
      ? `Расскажи про ${имяQ} простым и ясным языком — так, чтобы понял ребёнок, `
        + `но без сюсюканья и без латыни. Шесть-семь коротких предложений: откуда взялось `
        + `название; кто ближайшая родня и от кого этот вид произошёл; где обитает и почему `
        + `именно там — что в этом месте подошло ему, а другим нет; чем живёт и чем удивителен. `
        + `Без общих фраз и перечней. Покажи фотографии.`
      /* Место — не сцена из книги, а цель поездки: интересно, почему его
         охраняют, что там смотреть и как туда попасть. */
      : вид === "место"
      ? `Расскажи про ${имяQ} простым и ясным языком. Шесть-семь коротких предложений: `
        + `когда и зачем это место взяли под охрану или основали, что там охраняют или показывают, `
        + `чем оно отличается от соседних, что там можно увидеть своими глазами `
        + `и как туда вообще попадают. Без общих фраз. Покажи фотографии.`
      : вид === "порода"
      ? `Расскажи коротко про ${имяQ}. Не больше пяти-шести предложений: как эта порода `
        + `образуется, чем отличается на ощупь и на вид, почему из неё получаются отвесные `
        + `скалы и где в мире такие берега. Только конкретное. Покажи фотографии породы и скал из неё.`
      : вид === "книга"
      ? `Расскажи коротко о книге ${имяQ}. Не больше пяти-шести предложений: о чём она, `
        + `когда написана, чем известна и кому её стоит читать. Сюжет не пересказывай `
        + `и концовку не выдавай. Покажи обложку или портрет автора.`
      /* Вещь, названная в книге, но не музейный экспонат: спрашивать про зал и
         инвентарный номер бессмысленно — спрашиваем про саму вещь и эпоху. */
      : вид === "отсылка"
      ? `Расскажи коротко про ${имяQ}. Не больше пяти-шести предложений: откуда это, `
        + `чем известно, какой в этом сюжет и где это сегодня можно увидеть, прочитать `
        + `или послушать. Только конкретное. Покажи изображения.`
      : вид !== "вещь"
      ? `Расскажи коротко про ${имяQ}. Не больше пяти-шести предложений: что это такое, `
        + `как выглядело, зачем служило и что значило в быту своего времени. `
        + `Только конкретное. Покажи фотографии таких вещей.`
      : `Расскажи коротко о музейном предмете: ${имяQ}${
          x.inv ? `, инвентарный номер ${x.inv}` : ""}${x.museum ? `, ${x.museum}` : ""}. `
        + (x.url ? `Опирайся прежде всего на карточку музея: ${x.url} — оттуда возьми `
                 + `датировку, материал и происхождение. ` : "")
        + (x.img ? `Изображение самого предмета: ${кадр(1200)} — описывай именно его. ` : "")
        + `Не больше пяти-шести предложений: что это за вещь, когда и где сделана, `
        + `что на ней изображено и что этот сюжет значил, как она попала в музей. `
        + `Только конкретное, без общих фраз и перечислений дат. `
        + `Покажи изображения самого предмета.`);
  const история = `https://chatgpt.com/?q=${вопрос}`;
  const мимоМуз = (navigator.standalone === true) ? "" : ` target="_blank" rel="noopener"`;
  /* Подпись о доступности читается по-разному: у вещи это витрина, у зверя —
     насколько часто он попадается, у книги её нет вовсе. */
  const метка = (st) => {
    const вид = musKind(x);
    if (вид === "книга") return "";
    if (вид !== "вещь") return st ? `<i class="ms-store">${esc(st)}</i>` : "";
    const s2 = String(st || "").toLowerCase();
    if (s2.startsWith("вживую")) return `<i class="ms-live">в зале</i>`;
    if (s2.startsWith("проверить")) return `<i class="ms-check">уточнить показ</i>`;
    return `<i class="ms-store">не в экспозиции</i>`;
  };

  return `
    <div class="ms-top">
      <button class="back" data-msgo="" type="button">‹ Все артефакты</button>
      <button class="ms-heart${musLiked(x) ? " on" : ""}" data-mslike="${esc(x.id)}" type="button"
        aria-label="${musLiked(x) ? "Убрать из понравившихся" : "Нравится"}">${musLiked(x) ? "♥" : "♡"}</button>
    </div>
    <div id="msOne">
      <div class="ms-big">${musIcon(x)}</div>
      <h3>${esc(x.name)}</h3>
      <div class="ms-from">${esc(musBookName(x.book))}${
        x.ch ? (x.book === COURSE_MUS ? ", урок " + x.ch : ", глава " + x.ch) : ""}</div>
      ${x.why ? `<p>${esc(x.why)}</p>` : ""}
      ${x.about ? `<p class="ms-about">${esc(x.about)}</p>` : ""}
      <div class="ms-meta">
        <span>${esc(x.museum || "")}${x.place ? " · " + esc(x.place) : ""}</span>
        ${x.inv && вид === "вещь" ? `<span class="ms-inv">${esc(x.inv)}</span>` : ""}
        ${метка(x.status)}
      </div>
      <div class="ms-links">
        ${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${
          вид === "книга" ? "О книге" : вид === "живое" ? "Описание" : "Карточка музея"}</a>` : ""}
        <a href="${esc(история)}"${мимоМуз}>ChatGPT</a>
        <a href="${esc(фото)}" target="_blank" rel="noopener">Картинки</a>
      </div>
      <div class="ms-nav">
        <button data-msgo="${esc(пред ? пред.id : "")}" type="button"
          ${пред ? "" : "disabled"}>‹ ${esc(пред ? пред.name : "")}</button>
        <button data-msgo="${esc(след ? след.id : "")}" type="button"
          ${след ? "" : "disabled"}>${esc(след ? след.name : "")} ›</button>
      </div>
    </div>`;
}



/* Музейные картинки без параметров отдают миниатюру: Эрмитаж на голый адрес
   присылает 2,9 КБ вместо 170 КБ, и в раме оказывается марка вместо картины.
   Размер надо спрашивать явно, причём обе стороны сразу — по одной ширине
   сервер отвечает той же миниатюрой. */
const МУЗЕЙНЫЕ = /collections\.hermitage\.ru|collection\.pushkinmuseum\.art/;




function renderMuseum() {
  musStamp();                     // могло открыться без отметки — например, после синхронизации
  /* Показываем только открытое. Закрытые силуэты в сетке были бы рядом серых
     замков: сколько их впереди, видно по счётчику в шапке. */
  const все = musItems().filter(musOpen);
  const книги = [...new Set(все.map((x) => x.book))]
    .map((id) => ({ id, n: все.filter((x) => x.book === id).length }));
  if (mus.book && !книги.some((k) => k.id === mus.book)) mus.book = "";
  const любимых = все.filter(musLiked).length;
  if (mus.liked && !любимых) mus.liked = false;      // сняли последнее сердце — фильтр не залипает
  const список = (все
    .filter((x) => !mus.book || x.book === mus.book)
    .filter((x) => !mus.liked || musLiked(x)))
    /* Сверху то, что открылось последним: раздел читается как лента находок,
       а не как оглавление книги. */
    .slice().sort((a, b) => (musWhen(b) - musWhen(a)) || (Number(b.ch) - Number(a.ch)));
  const всего = musItems().filter((x) => !mus.book || x.book === mus.book).length;

  const открытый = mus.at ? список.find((x) => x.id === mus.at) : null;
  if (mus.at && !открытый) mus.at = null;

  const вкладки = (книги.length > 1 || любимых) ? `<div class="ms-tabs">
      ${книги.length > 1 ? `<button class="${mus.book ? "" : "on"}" data-msb="" type="button">Все · ${все.length}</button>
      ${книги.map((k) => `<button class="${mus.book === k.id ? "on" : ""}" data-msb="${esc(k.id)}"
        type="button">${esc(musBookName(k.id))} · ${k.n}</button>`).join("")}` : ""}
      ${любимых ? `<button class="${mus.liked ? "on" : ""}" data-msl="1" type="button">♥ ${любимых}</button>` : ""}
    </div>` : "";

  $("#view").innerHTML = открытый ? предметHTML(открытый, список) : `
    <div class="ms-head">Открыто ${список.length} из ${всего}</div>
    ${вкладки}
    ${список.length ? `<div id="msGrid">
      ${список.map((x) => `<button class="ms-tile" data-msi="${esc(x.id)}" type="button">
        <i>${musIcon(x)}</i>
        <b>${esc(x.name)}</b>
        <em>${esc([musChName(x), x.museum].filter(Boolean).join(" · "))}</em>
        ${musLiked(x) ? `<u>♥</u>` : ""}
      </button>`).join("")}
    </div>` : `<div class="empty-note">Артефакты откроются по мере чтения.</div>`}`;

  document.querySelectorAll("[data-msb]").forEach((b) =>
    b.addEventListener("click", () => { mus.book = b.dataset.msb; mus.at = null; renderMuseum(); }));
  document.querySelectorAll("[data-msl]").forEach((b) =>
    b.addEventListener("click", () => { mus.liked = !mus.liked; mus.at = null; renderMuseum(); }));
  document.querySelectorAll("[data-mslike]").forEach((b) =>
    b.addEventListener("click", () => {
      const x = musItems().find((y) => y.id === b.dataset.mslike);
      if (!x) return;
      musLike(x);
      renderMuseum();
    }));
  document.querySelectorAll("[data-msi]").forEach((b) =>
    b.addEventListener("click", () => { mus.at = b.dataset.msi; renderMuseum(); window.scrollTo(0, 0); }));
  document.querySelectorAll("[data-msgo]").forEach((b) =>
    b.addEventListener("click", () => { mus.at = b.dataset.msgo || null; renderMuseum(); window.scrollTo(0, 0); }));

  /* Спрашиваем свежий список при каждом заходе: предметы дописываются в гист
     чаще, чем выходит новая версия приложения. */
  pullMuseum().then((новое) => { if (новое && tab === "mus") renderMuseum(); }).catch(() => {});
}

function closePlaceMap() {
  closeShots();
  gmAskHide();
  /* Абзацы прошлой книги не должны дожидаться следующего открытия: пока
     новый текст качается, на экране висел бы чужой. */
  const чт = $("#gmRead"); if (чт) { чт.hidden = true; чт.innerHTML = ""; }
  gmAskHide();
  const поле = $("#gmFind"); if (поле) поле.value = "";
  const хиты = $("#gmHits"); if (хиты) { хиты.hidden = true; хиты.innerHTML = ""; }
  const box = $("#gmap");
  if (box) { box.hidden = true; box.setAttribute("aria-hidden", "true"); }
  document.body.classList.remove("prac-on");
  gm = null;
  keepAwake(false);
}

/* Сколько точек приходится на каждую главу — пустые главы в содержание не
   попадают: листать список, где половина строк ни к чему не ведёт, незачем. */
/* Глава точки: у одних книг она проставлена отдельным полем part, у «Одиссеи»
   роль главы играет ch — по нему же собирается карта одной песни. */
const частьТочки = (p) => Number(p.part) || Number(p.ch) || 0;

/* Слой точки: география, книга или человек. Отсутствие поля — география:
   так размечены все старые точки, и переписывать их незачем. */
const слойТочки = (p) => (p && p.kind) || "place";
/* «Текст» — про саму книгу, а не про то, что внутри неё: как складывалась,
   как дошла, как переводили. Такие записи не привязаны к главе и лежат в
   «Вокруг книги»: раскидывать их по главам было бы враньём — Жуковский с его
   подстрочником не имеет отношения к четырнадцатой песни, — а ждать главы им
   незачем, читать их хочется в первый день. */
const СЛОИ = [["place", "Места"], ["book", "Книги"], ["person", "Люди"],
              ["art", "Искусство"], ["thing", "Вещи"], ["animal", "Живность"],
              ["rock", "Камень"], ["word", "Слова"], ["text", "Текст"]];
/* Значок у записи в списке. Слои — не места: у них нет метки на карте, и
   список из одних названий читается как оглавление, а не как содержимое.
   Своё значение из данных (поле icon) главнее: контекст знает тот, кто писал
   справку. Таблица ниже — запасная, чтобы у нового материала список не был
   голым, пока значки не проставлены. */
const GM_ICONS = { book: "📖", person: "👤", art: "🖼", thing: "🏺",
                   animal: "🐾", rock: "🪨", word: "🔤", text: "📜", place: "📍" };
const gmIcon = (p) => (p && p.icon) || GM_ICONS[слойТочки(p)] || "•";

/* Вкладки на карте — две: места и всё остальное. Слоёв восемь, в строку они
   не влезали, и чтобы узнать, есть ли в главе искусство, приходилось тыкать в
   каждую вкладку по очереди. Теперь всё, кроме мест, лежит одним списком с
   секциями: в главе таких записей от трёх до двух десятков — это прокрутка,
   а не восемь нажатий. Места остаются отдельно: у них карта, а не список. */
const ВКЛАДКИ = [["place", "Места"], ["all", "Справки"], ["read", "Текст"]];
/* Какая вкладка открыта. По умолчанию — первая из имеющихся, а не «Места»:
   у книги без географии («Письма Баламута», «Снег на траве») мест нет вовсе,
   и открываться она должна сразу списком, а не пустой картой. */
const gmВкладка = () => (gm && gm.слой) || (gmLayersOf()[0] || ["place"])[0];
const вкладкаТочки = (p) => (слойТочки(p) === "place" ? "place" : "all");
function gmLayersOf() {
  if (!gm) return [];
  const есть = new Set(gm.места.map(вкладкаТочки));
  /* Третья вкладка — сам текст книги. Он уже лежит в каталоге: тем же файлом,
     что уходит в нейросеть по кнопке «Книга .md». Показываем её только там,
     где файл есть. */
  if (gmBookFile()) есть.add("read");
  return ВКЛАДКИ.filter(([k]) => есть.has(k));
}
/* Файл книги для этой карты — только у книг, и только если он залит. */
const gmBookFile = () => {
  if (!gm || !gm.id) return "";
  const b = (data.book.books || []).find((x) => x.id === gm.id);
  return b && hasBookFile(b) ? gm.id : "";
};

/* Сколько всего в главе — по всем слоям сразу, с разбивкой. В содержании
   человек ищет «где про это почитать», а не «где точки на карте»: глава с
   одними словами и людьми не должна выглядеть пустой. */
function gmParts() {
  if (!gm) return [];
  const счёт = new Map();
  for (const p of gm.места) {
    const n = частьТочки(p);
    const c = счёт.get(n) || { k: 0, по: {} };
    c.k++; c.по[слойТочки(p)] = (c.по[слойТочки(p)] || 0) + 1;
    счёт.set(n, c);
  }
  return (gm.части || []).map((c) => ({ ...c, ...(счёт.get(Number(c.n)) || { k: 0, по: {} }) }))
    .filter((c) => c.k > 0);
}
/* Разбивка словами: «3 места · 2 книги · 7 слов». Нули не пишем. */
function gmРазбивка(по) {
  const слова = { place: ["место", "места", "мест"], book: ["книга", "книги", "книг"],
                  person: ["человек", "человека", "человек"],
                  animal: ["животное", "животных", "животных"],
                  rock: ["порода", "породы", "пород"], word: ["слово", "слова", "слов"],
                  art: ["работа", "работы", "работ"],
                  thing: ["вещь", "вещи", "вещей"],
                  text: ["заметка", "заметки", "заметок"] };
  return СЛОИ.map(([k]) => k)
    .filter((k, i, a) => a.indexOf(k) === i && (по || {})[k])
    .map((k) => `${по[k]} ${plural(по[k], ...слова[k])}`).join(" · ");
}
const gmВидимые = () => {
  if (!gm) return [];
  const вкладка = gmВкладка();
  const свои = gm.места.filter((p) => вкладкаТочки(p) === вкладка);
  /* В списке справок записи идут секциями в порядке СЛОИ, внутри секции — как
     лежат в файле. Сортировка устойчивая: без второго ключа порядок внутри
     секции в разных браузерах разный. */
  const порядок = (p) => СЛОИ.findIndex(([k]) => k === слойТочки(p));
  const разложить = (сп) => вкладка === "place" ? сп
    : сп.map((p, i) => [p, i]).sort((a, b) => порядок(a[0]) - порядок(b[0]) || a[1] - b[1])
        .map(([p]) => p);
  if (gm.часть === -1) return разложить(свои.filter((p) => !частьТочки(p)));   // вне частей
  if (gm.часть) return разложить(свои.filter((p) => частьТочки(p) === gm.часть));
  /* «Все места»: Итака, Троя и Огигия встречаются в разных песнях со своим
     описанием в каждой. На общей карте это одно место, а не стопка из трёх
     точек в одной координате. Оставляем первое вхождение, остальные прячем;
     в карточке перечислены главы, где оно встречается. Ключ со слоем: Аргус
     есть и человек, и пёс, и по одному имени они схлопнулись бы в одного. */
  const было = new Set();
  return разложить(свои.filter((p) => {
    const ключ = слойТочки(p) + "|" + p.name;
    if (было.has(ключ)) return false;
    было.add(ключ);
    return true;
  }));
};

/* В каких главах встречается место — для карточки на общей карте. */
function gmГлавы(имя) {
  if (!gm) return [];
  const номера = [...new Set(gm.места.filter((p) => p.name === имя).map(частьТочки).filter(Boolean))]
    .sort((a, b) => a - b);
  return номера.map((n) => {
    const c = (gm.части || []).find((x) => Number(x.n) === n);
    return c ? String(c.name).split(".")[0].trim() : "";
  }).filter(Boolean);
}

/* Тихое обновление карты: если в гисте появились новые места, подставляем их
   на месте, не закрывая карту и не сбивая приближение. Не чаще раза в минуту —
   карту открывают и закрывают часто. */
const mapAsked = new Map();
function mapFresh(bk) {
  const id = bk.id;
  if (now() - (mapAsked.get(id) || 0) < 60000) return;
  mapAsked.set(id, now());
  pullArts(id).then((новое) => {
    if (!новое || !gm || gm.id !== id) return;
    gm.места = mapPoints(bk, gm.i);
    gm.части = mapPartsOf(bk);
    gm.рамка = mapBox(bk) || gm.рамка;
    if (gm.at && !gm.места.some((p) => p.name === gm.at)) gm.at = null;
    gmLayersRow(); gmTocBtn(); gmTitle(); gmPins(); gmList(); gmCard();
    toast("Карта обновилась");
  }).catch(() => mapAsked.set(id, 0));
}

/* Куда сходить за подробностями по записи из списка. Вопрос у каждого вида
   свой: у книги спрашивают, о чём она и стоит ли читать, у слова — что это на
   деле, у зверя — как он выглядит. Один и тот же общий «расскажи про» отвечал
   бы обо всём одинаково никак. */
function gmSpravki(p) {
  const вид = слойТочки(p);
  const кн = (data.book.books || []).find((b) => b.id === gm.id);
  const книга = кн ? ` Встретилось в книге «${кн.title}»${
    кн.author ? `, ${String(кн.author).split("·")[0].trim()}` : ""}.` : "";
  /* В поиск уходит q — это запрос, а не название. «Капот» без уточнения даёт
     автомобиль, «тупик» — переулок, «морской котик» — спецназ. Если запроса у
     записи нет, склеиваем название с подписью: она для того и написана, чтобы
     объяснить, о чём вообще речь. */
  const имя = p.q || [p.name, вид === "place" ? "" : (p.t || "").split(" · ")[0]]
    .filter(Boolean).join(" ");
  /* Запрет на спойлеры — в каждом промте, а не в трёх из восьми. Спрашивают про
     вещь или слово, а нейросеть охотно добавляет «в конце книги эта шинель…» —
     и человек узнаёт финал, пока выясняет, что такое картуз. Книгу называем
     прямо: без имени запрет ни к чему не привязан. */
  const молчок = кн
    ? ` Сюжет книги «${кн.title}» не пересказывай и ничем не выдавай, чем она кончается и что случится с героями дальше.`
    : ` Не пересказывай сюжет книги, из которой это взято, и не говори, чем она кончается.`;
  const вопрос =
    вид === "book" ? `Расскажи коротко про книгу ${имя}.${книга} Ответь по пунктам, каждый в одно-два предложения: 1) о чём она; 2) чем известна и почему её помнят; 3) кому её стоит читать, а кому нет; 4) есть ли русский перевод и какой считается лучшим.${молчок}`
  : вид === "person" ? `Расскажи коротко про ${имя}.${книга} Ответь по пунктам, каждый в одно-два предложения: 1) кто это и когда жил; 2) чем известен; 3) какая одна история про него стоит того, чтобы её знать; 4) с чего начать знакомство — что прочитать, посмотреть или послушать. Покажи фотографии.${молчок}`
  : вид === "animal" ? `Расскажи коротко про ${имя}.${книга} Ответь по пунктам, каждый в одно-два предложения: 1) кто это и как выглядит; 2) где живёт и что делает; 3) чем интересна — одна особенность, которую не ожидаешь; 4) где в природе её можно увидеть. Покажи фотографии.${молчок}`
  : вид === "art" ? `Расскажи коротко про ${имя}.${книга} Ответь по пунктам, каждый в одно-два предложения: 1) кто и когда это сделал; 2) что на этой работе происходит и на что смотреть; 3) чем она известна; 4) где её можно увидеть сегодня. Покажи изображения в хорошем качестве.${молчок}`
  : вид === "thing" ? `Расскажи про ${имя}.${книга} Ответь по пунктам, каждый в одно-два предложения: 1) что это за вещь и как она устроена; 2) как её делали и из чего; 3) какое место она занимала в быту; 4) сохранились ли такие вещи и где на них посмотреть. Покажи изображения находок.${молчок}`
  : вид === "text" ? `${имя}.${книга} Расскажи об этом коротко и по существу: 1) как это устроено на самом деле; 2) откуда это известно — кто и как выяснил; 3) в чём с этим до сих пор спорят. Пиши конкретно, без общих фраз.${молчок}`
  : вид === "rock" ? `Расскажи про породу ${имя}.${книга} Ответь по пунктам, каждый в одно-два предложения: 1) как она образуется; 2) как выглядит и чем отличается на вид от соседних; 3) где её больше всего; 4) какие известные скалы и здания из неё сложены. Покажи фотографии образцов и скал.${молчок}`
  : `Что такое «${имя}»?${книга} Ответь по пунктам, каждый в одно-два предложения: 1) что это простыми словами; 2) откуда взялось слово; 3) как это выглядит и работает на деле; 4) с чем это чаще всего путают. Покажи фотографии или схемы.${молчок}`;
  const q = encodeURIComponent(вопрос);
  /* Приписка «что это фото» была костылём, пока в поиск уходило одно слово.
     Теперь запрос и так конкретный, а лишние слова только сбивают выдачу. */
  const фото = encodeURIComponent(имя);
  const мимо = (navigator.standalone === true) ? "" : ` target="_blank" rel="noopener"`;
  /* Отвечающих движков было четыре, остался один. Perplexity упирался в счётчик
     бесплатных ответов, Яндекс с Алисой отвечали заметно хуже, и выбирать между
     ними на ходу не хотелось: четыре кнопки — это не выбор, а лишний вопрос
     себе. Осталось то, что и правда отвечает, и картинки. */
  return `<span class="gm-links">
    <a href="https://chatgpt.com/?q=${q}"${мимо}>ChatGPT</a>
    <a href="https://www.google.com/search?tbm=isch&q=${фото}" target="_blank" rel="noopener">Картинки</a>
  </span>`;
}

/* Слой книг и людей показываем списком: точка на глобусе ничего о книге не
   говорит, а прочитать про неё хочется. Карта остаётся у мест. */
function gmList() {
  const box = $("#gmList"), сцена = $("#gmStage"), чтение = $("#gmRead");
  if (!box || !gm) return;
  const вкладка = gmВкладка();
  const списком = вкладка === "all";
  box.hidden = !списком;
  if (сцена) сцена.hidden = вкладка !== "place";
  if (чтение) чтение.hidden = вкладка !== "read";
  if (вкладка === "read") { box.innerHTML = ""; gmRead(); return; }
  gmAskHide();
  if (!списком) { box.innerHTML = ""; return; }
  const список = gmВидимые();
  if (!список.length) {
    box.innerHTML = `<div class="gl-none">В этой главе ничего нет — выбери другую или «Все».</div>`;
    return;
  }
  /* Строка — не кнопка целиком: внутри ссылки, а ссылка в кнопке не работает.
     Нажимаемая только шапка, остальное раскрывается под ней. */
  /* Секции: «Люди · 4», «Вещи · 3». Заголовок нужен не для красоты — без него
     список слипается в одну ленту, и непонятно, где кончились люди. */
  const поВиду = {};
  список.forEach((p) => { поВиду[слойТочки(p)] = (поВиду[слойТочки(p)] || 0) + 1; });
  let вид = "";
  box.innerHTML = список.map((p) => {
    const м = /^(.+?) \((.+)\)$/.exec(p.name);
    const открыт = gm.at === p.name;
    const мой = слойТочки(p);
    const имяВида = (СЛОИ.find(([k]) => k === мой) || [0, мой])[1];
    const шапка = мой === вид ? "" : `<div class="gl-sec">${esc(имяВида)} · ${поВиду[мой]}</div>`;
    вид = мой;
    return шапка + `<div class="gl-it${открыт ? " on" : ""}">
      <button class="gl-head" data-gm="${esc(p.name)}" type="button">
        <span class="gl-ic">${esc(gmIcon(p))}</span>
        <span class="gl-txt">
          <b>${esc(м ? м[1] : p.name)}${м ? `<em>${esc(м[2])}</em>` : ""}</b>
          <i>${esc((p.t || "").split(" · ")[0])}</i>
        </span>
      </button>
      ${открыт && p.about ? `<p>${esc(p.about)}</p>` : ""}
      ${открыт ? gmSpravki(p) : ""}
    </div>`;
  }).join("");
}

/* ── Текст книги ──
   Третья вкладка карты. Задача одна: наткнулся на непонятную фразу — выделил
   её пальцем и одной кнопкой отправил в нейросеть вместе с тем, из какой она
   книги и главы. До этого приходилось фотографировать страницу, распознавать
   и объяснять руками, из чего это вообще.

   Файл берём тот же, что уходит по кнопке «Книга .md»: он уже лежит в
   каталоге, и второй копии заводить незачем. Мегабайт качаем один раз за
   сессию и держим в памяти — в localStorage такому не место, там обложки. */
let gmText = null;          // { id, разделы: [{имя, абзацы}], грузим }
let gmAskTimer = 0;         // выделение дёргается пальцем — ждём, пока устоится

function gmParseBook(текст) {
  const разделы = [];
  let тек = null;
  for (const строка of String(текст || "").split("\n")) {
    const s2 = строка.trim();
    if (!s2) continue;
    const h = /^#{1,3}\s+(.+)$/.exec(s2);
    if (h) { тек = { имя: h[1].trim(), абзацы: [] }; разделы.push(тек); continue; }
    if (!тек) { тек = { имя: "", абзацы: [] }; разделы.push(тек); }
    тек.абзацы.push(s2);
  }
  /* Служебные куски конвертера в чтении только мешают: содержание дублирует
     наше собственное, выходные данные читать незачем. */
  const мусор = /^(оглавление|перед текстом|выходные данные|сноски)$/i;
  return разделы.filter((r) => r.абзацы.length && !мусор.test(r.имя));
}

async function gmLoadBook(id0) {
  const id = id0 || gmBookFile();
  if (!id) return null;
  if (gmText && gmText.id === id && !gmText.грузим) return gmText;
  if (gmText && gmText.грузим === id) return null;      // уже качается
  gmText = { id, разделы: [], грузим: id };
  const сырое = await catRaw(CAT_BOOK_FILE(id), 60000);
  if (!сырое) { gmText = null; return null; }
  gmText = { id, разделы: gmParseBook(сырое), грузим: "" };
  return gmText;
}

/* Какой раздел файла отвечает выбранной главе. Разделов и глав почти никогда
   не поровну: у Достоевского пять частей против сорока шести глав в файле, у
   «Одиссеи» — двадцать четыре песни против двадцати девяти разделов, из
   которых первые два про самого Гомера. Поэтому сначала ищем по названию, и
   только если не нашли — по доле. */
/* Номер, спрятанный в названии раздела. У «Одиссеи» содержание нумерует песни
   римскими («Песнь XII»), а файл — словами («ПЕСНЬ ДВЕНАДЦАТАЯ»), и по буквам
   они не сходятся никогда. Разбираем и то и другое к числу. */
const ЕДИНИЦЫ = ["", "перв", "втор", "трет", "четверт", "пят", "шест", "седьм", "восьм",
  "девят", "десят", "одиннадцат", "двенадцат", "тринадцат", "четырнадцат", "пятнадцат",
  "шестнадцат", "семнадцат", "восемнадцат", "девятнадцат"];
const ДЕСЯТКИ = [["двадцат", 20], ["тридцат", 30], ["сороков", 40], ["пятидесят", 50]];
const РИМ = { i: 1, v: 5, x: 10, l: 50 };
function gmNum(имя) {
  const s2 = String(имя || "").toLowerCase().replace(/ё/g, "е");
  /* Числительное ищем целым словом. По вхождению подстроки «путешественник»
     считался шестой главой, а «глава I» — первой частью. */
  const слово = (корень) => new RegExp("(?:^|[^а-я])" + корень + "[а-я]{0,4}(?:$|[^а-я])").test(s2);
  let дес = 0;
  for (const [сл, v] of ДЕСЯТКИ) if (слово(сл)) { дес = v; break; }
  for (let i = ЕДИНИЦЫ.length - 1; i > 0; i--)
    if (слово(ЕДИНИЦЫ[i])) return дес && i < 10 ? дес + i : (дес > 0 && i >= 10 ? дес : i);
  if (дес) return дес;
  // римским: «песнь xii»
  const r = /(?:^|\s)([ivxl]{1,6})(?=[\s.,:;]|$)/.exec(s2);
  if (r) {
    const c = r[1];
    let сумма = 0;
    for (let i = 0; i < c.length; i++) {
      const v = РИМ[c[i]], сл = РИМ[c[i + 1]] || 0;
      сумма += v < сл ? -v : v;
    }
    if (сумма > 0) return сумма;
  }
  const d = /(?:^|\s)(\d{1,3})(?=[\s.,:;]|$)/.exec(s2);
  return d ? Number(d[1]) : 0;
}

function gmSectionFor(разделы, n, части0) {
  const части = части0 || gmParts();
  const чисто = (x) => String(x || "").toLowerCase().replace(/ё/g, "е")
    .replace(/^\s*(глава|песнь|часть|письмо)\s+[^.]{1,20}\.\s*/i, "")
    .replace(/[^0-9a-zа-я ]+/gi, " ").replace(/\s+/g, " ").trim();
  // какого рода единица у главы: песнь, часть, письмо
  const род = (x) => (/(песн|част|письм|глав)/.exec(String(x || "").toLowerCase()) || [""])[0];
  const c = части.find((x) => Number(x.n) === Number(n));
  const имя = чисто(c && c.name);
  if (имя.length >= 4) {
    const i = разделы.findIndex((r) => {
      const s2 = чисто(r.имя);
      return s2.length >= 4 && (s2.includes(имя) || имя.includes(s2));
    });
    if (i >= 0) return i;
  }
  /* По номеру внутри названия. Собственная нумерация файла («Глава 3.») тут не
     годится — она сквозная и к песням отношения не имеет, поэтому её сперва
     срезаем. */
  const хочу = gmNum(c && c.name) || Number(n);
  const мой = род(c && c.name);
  if (хочу) {
    const i = разделы.findIndex((r) => {
      const голый = чисто(r.имя);
      if (!голый || gmNum(голый) !== хочу) return false;
      /* Если глава называет свою единицу — песнь, часть, письмо, — раздел
         должен называть ту же. Иначе «Часть первая» цеплялась за «ГЛАВА I». */
      return !мой || род(r.имя).startsWith(мой) || голый.includes(мой);
    });
    if (i >= 0) return i;
  }
  const всего = части.length || 1;
  let i = Math.max(0, Math.min(разделы.length - 1,
    Math.floor((Number(n) - 1) / всего * разделы.length)));
  /* Титул и прочая мелочь в начале — не то, ради чего открывают текст. Если
     попали в кусок в пару абзацев, шагаем к первому настоящему. Только в самом
     начале книги: дальше короткий раздел — это короткий раздел, а не титул. */
  while (i < разделы.length - 1 && i < 3 && разделы[i].абзацы.length < 3) i++;
  return i;
}

/* Куда открывать текст, когда глава не выбрана: примерно туда, докуда дочитал.
   Точного соответствия страниц и знаков нет и быть не может, поэтому берём
   долю прочитанного и ту же долю разделов. Дальше поиском. */
function gmReadStart(разделы) {
  const b = (data.book.books || []).find((x) => x.id === gm.id);
  if (!b || !b.pages) return 0;
  const стр = bookProgressOf(b);
  if (!стр) return 0;
  return Math.min(разделы.length - 1, Math.floor(стр / b.pages * разделы.length));
}

const gmEsc = (s2) => s2.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function gmMark(текст, что) {
  if (!что) return esc(текст);
  return esc(текст).replace(new RegExp(gmEsc(esc(что)), "gi"), (m) => `<mark>${m}</mark>`);
}

/* Собственная нумерация файла в заголовке раздела спорит с содержанием, по
   которому человек и выбирал главу: «Глава 14. ПЕСНЬ ДВЕНАДЦАТАЯ» при
   выбранной двенадцатой песни, «Глава 35» первой строкой четвёртой части.
   Оставляем только то, что заголовок говорит словами. */
function gmЗаголовок(имя) {
  return String(имя || "").trim()
    .replace(/^\s*глава\s+\d+\.?\s*/i, "")
    .replace(/^\s*(часть|песнь|письмо)\s+[^.]{1,20}\.?\s*$/i, "")
    .trim();
}

/* Глава содержания и разделы файла — не одно и то же. У «Униженных» содержание
   знает четыре части, а в файле сорок шесть глав: часть — это диапазон, а не
   один раздел. Раньше показывался только первый, и до тридцать шестой главы
   было не добраться вовсе. */
function gmSectionRange(разделы, n, части0) {
  const части = части0 || gmParts();
  const i = части.findIndex((c) => Number(c.n) === Number(n));
  const от = gmSectionFor(разделы, n, части);
  let до = разделы.length;
  if (i >= 0 && i + 1 < части.length) {
    const след = gmSectionFor(разделы, части[i + 1].n, части);
    if (след > от) до = след;
  }
  return [от, Math.max(от + 1, до)];
}

function gmRead() {
  const box = $("#gmRead");
  if (!box || !gm) return;
  if (!gmText || gmText.id !== gmBookFile() || gmText.грузим) {
    box.innerHTML = `<div class="rd-load">Текст книги загружается…</div>`;
    gmLoadBook().then((t) => { if (t && gmВкладка() === "read") gmRead(); })
      .catch(() => { box.innerHTML = `<div class="rd-load">Текст не приехал — попробуй ещё раз</div>`; });
    return;
  }
  const разделы = gmText.разделы;
  if (!разделы.length) { box.innerHTML = `<div class="rd-load">В файле книги пусто</div>`; return; }
  /* Пересчитываем при каждой смене главы. Раньше раздел вычислялся один раз:
     человек переключал главу сверху, а текст оставался тот же. Свой выбор —
     «дальше» или переход из поиска — при этом не сбрасывается: глава-то не
     менялась. */
  if (gm.чтение == null || gm.чтениеГл !== gm.часть) {
    gm.чтение = gm.часть > 0 ? gmSectionFor(разделы, gm.часть) : gmReadStart(разделы);
    gm.чтениеГл = gm.часть;
    gm.метка = null;
  }

  /* Ищем внутри открытой главы, а не по всей книге. Глава выбирается сверху,
     содержанием, и поиск по всему тому выдавал бы совпадения из мест, до
     которых человек ещё не дошёл, — а это ровно те спойлеры, от которых мы
     бережём всё остальное. Да и искать обычно хотят в том, что сейчас перед
     глазами. */
  const q = (gm.поиск || "").trim();
  /* Выбрана глава — показываем её целиком. Не выбрана («вся книга») —
     по одному разделу с кнопкой «дальше»: полтора мегабайта Достоевского
     телефон в разметке не удержит. */
  const с = Math.max(0, Math.min(gm.чтение || 0, разделы.length - 1));
  const [от, до] = gm.часть > 0 ? gmSectionRange(разделы, gm.часть) : [с, с + 1];
  if (q.length >= 2) {
    const найдено = [];
    let счёт = 0;
    for (let i = от; i < до; i++) {
      const r0 = разделы[i];
      const слова = gmЗаголовок(r0.имя);
      r0.абзацы.forEach((p) => {
        const j = счёт++;
        const at = p.toLowerCase().indexOf(q.toLowerCase());
        if (at < 0 || найдено.length >= 60) return;
        найдено.push({ j, имя: слова,
          кусок: (at > 40 ? "…" : "") + p.slice(Math.max(0, at - 40), at + q.length + 90)
            + (at + q.length + 90 < p.length ? "…" : "") });
      });
    }
    box.innerHTML = найдено.length
      ? найдено.map((h) => `
          <button class="rd-hit" data-rdp="${h.j}" type="button">
            ${h.имя ? `<b>${esc(h.имя)}</b>` : ""}${gmMark(h.кусок, q)}
          </button>`).join("")
        + (найдено.length >= 60 ? `<div class="rd-more">Показаны первые 60 — уточни запрос</div>` : "")
      : `<div class="rd-load">В этой главе ничего не нашлось.<br>Другая глава выбирается содержанием сверху.</div>`;
    box.scrollTop = 0;
    document.querySelectorAll("#gmRead [data-rdp]").forEach((el) =>
      el.addEventListener("click", () => {
        gm.метка = Number(el.dataset.rdp);
        gm.поиск = "";
        const поле = $("#gmFind"); if (поле) поле.value = "";
        gmRead();
      }));
    return;
  }

  /* Глава показывается целиком. Делить её на куски с кнопкой «дальше» было
     нечестно вдвойне: у «Униженных» часть — это дюжина глав файла, и счётчик
     «11 из 12» говорил о нумерации, которой человек нигде не видел. */
  let абз = 0;
  const тело = разделы.slice(от, до).map((r0, k) => {
    const слова = gmЗаголовок(r0.имя);
    // между главами файла — либо их собственные слова, либо просто разделитель
    const шапка = k === 0 && !слова ? ""
      : слова ? `<div class="rd-h">${esc(слова)}</div>`
      : `<div class="rd-br">✦</div>`;
    return шапка + r0.абзацы.map((p) => `<p class="rd-p" data-p="${абз++}">${esc(p)}</p>`).join("");
  }).join("");
  const ещё = gm.часть === 0 && до < разделы.length;
  box.innerHTML = тело
    + (ещё ? `<button class="rd-hit" data-rdnext="1" type="button"><b>дальше</b>${
        esc(gmЗаголовок(разделы[до].имя) || "следующий кусок")}</button>` : "");
  const дальше = box.querySelector("[data-rdnext]");
  if (дальше) дальше.addEventListener("click", () => { gm.чтение = до; gm.метка = null; gmRead(); });
  /* Пришли из поиска — подводим к тому самому абзацу, а не к началу главы. */
  if (gm.метка != null) {
    const el = box.querySelector(`[data-p="${gm.метка}"]`);
    if (el) { el.scrollIntoView({ block: "center" }); el.style.background = "rgba(255,201,77,.12)"; }
    gm.метка = null;
  } else box.scrollTop = 0;
  gmAskHide();
}

/* ── Непонятные слова ──
   Читают бумажную книгу, и лезть в телефон за каждой строкой — значит из книги
   выпасть. Поэтому отметка стоит копейки: одно слово, без страницы и без
   поиска нужного предложения. Страницу не спрашиваем сознательно — издания
   расходятся, а плотность текста на странице у стиха и прозы отличается втрое,
   так что от неё всё равно нет толку. Само место находится потом, по слову, и
   человек его подтверждает. */
const asksAll = () => (data.book.asks = data.book.asks || []);
const asksOpen = (id) => asksAll().filter((a) =>
  !a.deleted && !a.done && a.bookId === (id || (book() || {}).id));
function askAdd(слово) {
  const w = String(слово || "").trim();
  if (!w || !book()) return null;
  const a = { id: uid(), bookId: book().id, word: w, createdAt: now(), updatedAt: now() };
  asksAll().push(a);
  saveData(); schedulePush();
  return a;
}
/* Удаление — пометкой: иначе телефон вернёт слово первой же синхронизацией. */
function askDrop(id, разобрано) {
  const a = asksAll().find((x) => x.id === id);
  if (!a) return;
  if (разобрано) a.done = true; else a.deleted = true;
  a.updatedAt = now();
  saveData(); schedulePush();
}

/* Предложение, в котором стоит найденное слово. Границы — по точке с пробелом,
   а не по любой точке: сокращения вроде «т. е.» резать нечего. */
function askSentence(абзац, at) {
  const s = String(абзац || "");
  let от = 0;
  for (let i = at; i > 0; i--)
    if (/[.!?…]/.test(s[i - 1]) && /\s/.test(s[i]) && /[А-ЯЁA-Z«—]/.test(s[i + 1] || "")) { от = i + 1; break; }
  let до = s.length;
  for (let i = at; i < s.length; i++)
    if (/[.!?…]/.test(s[i]) && (!s[i + 1] || /\s/.test(s[i + 1]))) { до = i + 1; break; }
  return s.slice(от, до).trim();
}

/* Кандидаты на «то самое место». Сначала точное вхождение, потом по основе:
   набирают «фальшфейер», а в книге стоит «фальшфейера». Ищем только до
   прочитанной главы включительно — дальше по книге то же слово встретится в
   сцене, до которой человек ещё не дошёл. */
/* Как называется раздел файла на языке содержания. Собственные заголовки
   файла бывают голым номером — «Глава 35.», — и подтверждать по ним нечего;
   человек выбирал главу по своему оглавлению, его и показываем. */
function askМетки(разделы, b) {
  const метки = new Array(разделы.length).fill("");
  const главы = b.chapters || [];
  const части = главы.map((c, i) => ({ n: i + 1, name: c.name || "" }));
  for (let n = 1; n <= части.length; n++) {
    const [от, до] = gmSectionRange(разделы, n, части);
    for (let i = от; i < до && i < метки.length; i++) метки[i] = части[n - 1].name;
  }
  for (let i = 0; i < метки.length; i++)
    if (!метки[i]) метки[i] = gmЗаголовок(разделы[i].имя);
  return метки;
}

function askCandidates(разделы, слово, окно, метки) {
  const w = String(слово || "").toLowerCase().replace(/ё/g, "е").trim();
  if (w.length < 3) return [];
  const основы = [w];
  for (const n of [1, 2, 3]) if (w.length - n >= 4) основы.push(w.slice(0, w.length - n));
  const о = typeof окно === "number" ? { от: 0, до: окно } : (окно || {});
  const до = о.до == null ? разделы.length : Math.min(о.до, разделы.length);
  const от = Number(о.от) || 0;
  for (const основа of основы) {
    const найдено = [];
    for (let i = 0; i < до && найдено.length < 8; i++) {
      const абз = разделы[i].абзацы;
      абз.forEach((п, j) => {
        const низ = п.toLowerCase().replace(/ё/g, "е");
        let at = низ.indexOf(основа);
        while (at >= 0 && найдено.length < 8) {
          let фраза = askSentence(п, at);
          /* У стиха каждая строка — свой абзац, и одна строка обрывается на
             запятой: по ней не понять, то ли это место. Добираем соседние. */
          if (фраза.length < 80)
            фраза = [абз[j - 1], фраза, абз[j + 1]].filter(Boolean).join(" ").trim().slice(0, 260);
          if (фраза.length > 10 && !найдено.some((x) => x.фраза === фраза))
            найдено.push({ i, фраза, раздел: (метки && метки[i]) || gmЗаголовок(разделы[i].имя) });
          at = низ.indexOf(основа, at + основа.length);
        }
      });
    }
    /* Ближайшее к текущей главе — первым. Раньше выдача шла от начала книги,
       и на тринадцатой песни первым кандидатом показывалась первая: слово
       почти всегда встретилось там, где ты сейчас, а не там, где оно впервые
       появилось в книге. */
    if (найдено.length) return найдено.sort((a, b) => {
      const своя = (x) => (x.i >= от && x.i < до ? 0 : 1);
      return своя(a) - своя(b) || b.i - a.i;
    });
  }
  return [];
}

/* Где человек сейчас и докуда вообще искать. Два числа, и оба важны: «до» —
   граница прочитанного, дальше нельзя (там сцены, до которых он не дошёл),
   «от» — начало текущей главы. Слово почти всегда встретилось в ней, и
   показывать его надо оттуда, а не с начала книги. */
function askОкно(разделы, b) {
  const главы = b.chapters || [];
  if (!главы.length) return { от: 0, до: разделы.length };
  const стр = bookProgress();
  let n = 1;
  главы.forEach((c, i) => { if (стр >= (Number(c.from) || 0)) n = i + 1; });
  const части = главы.map((c, i) => ({ n: i + 1, name: c.name || "" }));
  const [от, до] = gmSectionRange(разделы, n, части);
  return { от, до };
}

/* Словарь книги для подсказок. Набирать «фальшфейер» целиком с телефона в
   руках, когда в другой руке книга, — долго; три буквы и тычок в подсказку
   быстрее. Заодно слово гарантированно есть в тексте, и место потом найдётся.
   Словарь строим только по прочитанному: иначе подсказка выдаст имя из главы,
   до которой человек не дошёл. */
let askIndex = null;
function askBuildIndex(id, разделы, окно) {
  const о = typeof окно === "number" ? { от: 0, до: окно } : (окно || {});
  const до = Math.min(о.до == null ? разделы.length : о.до, разделы.length);
  const от = Number(о.от) || 0;
  if (askIndex && askIndex.id === id && askIndex.до === до && askIndex.от === от) return askIndex;
  /* Только текущая глава. Слова из прочитанного раньше в подсказках лишние:
     отмечают то, что попалось сейчас, а чужая глава засоряет короткий список
     и подсовывает не то. Искать место при этом можно и глубже — набранное
     руками слово из вчерашней главы всё равно найдётся. */
  const счёт = new Map();
  for (let i = от; i < до; i++)
    for (const п of разделы[i].абзацы)
      for (const m of String(п).toLowerCase().replace(/ё/g, "е").match(/[а-яa-z][а-яa-z-]{3,}/g) || [])
        счёт.set(m, (счёт.get(m) || 0) + 1);
  askIndex = { id, от, до, слова: [...счёт.entries()].map(([w, n]) => ({ w, n })) };
  return askIndex;
}
/* Редкое выше частого: непонятным оказывается встретившееся раз-другой, а не
   «который» и «сказал». */
function askSuggest(начало, сколько) {
  const p = String(начало || "").toLowerCase().replace(/ё/g, "е").trim();
  if (!askIndex || p.length < 2) return [];
  return askIndex.слова.filter((x) => x.w.startsWith(p))
    .sort((a, b) => a.n - b.n || a.w.length - b.w.length)
    .slice(0, сколько || 6).map((x) => x.w);
}

/* Один промт на весь разбор. Семь отдельных походов в нейросеть — это семь
   выходов из книги; здесь выход один, и контекст переносится между вопросами. */
function askPrompt(готовые, b) {
  const автор = String(b.author || "").split("·")[0].trim();
  const главы = b.chapters || [];
  let гл = "";
  const стр = bookProgress();
  главы.forEach((c) => { if (стр >= (Number(c.from) || 0)) гл = c.name || ""; });
  const список = готовые.map((x, i) =>
    `${i + 1}. «${x.word}»${x.фраза ? `\n   В книге: «${x.фраза}»` : " — места в тексте не нашлось"}`).join("\n");
  /* Спрашивают не «что значит слово», а «объясни это место целиком»: что за
     вещь, как выглядит, что за событие, что за книга. Поэтому промт задаёт
     порядок ответа — иначе выходит пересказ цитаты своими словами и ничего
     больше. Картинки просим отдельной строкой: вещь, которую нельзя
     представить, словами не объяснишь. */
  return `Читаю книгу «${b.title}»${автор ? `, ${автор}` : ""}.`
    + ` Вот ${готовые.length} ${plural(готовые.length, "место", "места", "мест")}, ${
        готовые.length === 1 ? "которое я не понял" : "которых я не понял"}.\n\n${список}\n\n`
    + `По каждому ответь по порядку и коротко, одно-два предложения на пункт:\n`
    + `1) что это — вещь, событие, человек, книга, обычай или понятие, и что это значит простыми словами;\n`
    + `2) подробность по существу: как выглядит и как устроена вещь; когда и с кем было событие; о чём книга и чем известна; чем занимался человек;\n`
    + `3) что происходит в самой цитате и зачем это слово там стоит;\n`
    + `4) одна деталь, которую не ожидаешь, — если она есть.\n`
    + `Покажи изображения или фотографии всего, что можно увидеть: вещей, мест, картин, людей.\n`
    + `Пиши плотно, без вступлений и общих фраз. Если слово в разных местах книги значит разное — скажи об этом.`
    + (гл ? ` Я сейчас на месте «${гл}» — не рассказывай, что будет дальше.` : ` Не рассказывай, чем книга кончается.`);
}

/* ── Экран: собрать слова, потом подтвердить места ── */
let askRunState = null;
function askChips() {
  const box = $("#askList");
  if (!box) return;
  const список = asksOpen();
  box.innerHTML = список.length
    ? список.map((a) => `<button class="ask-chip" data-ask="${a.id}" type="button">${esc(a.word)}<span>×</span></button>`).join("")
    : `<div class="ask-none">Пока пусто</div>`;
  const кн = $("#askGo");
  if (кн) { кн.hidden = !список.length; кн.textContent = `Разобрать ${список.length}`; }
  box.querySelectorAll("[data-ask]").forEach((el) =>
    el.addEventListener("click", () => { askDrop(el.dataset.ask); askChips(); }));
}
function askSugRender() {
  const box = $("#askSug"), поле = $("#askIn");
  if (!box || !поле) return;
  const список = askSuggest(поле.value, 6);
  box.innerHTML = список.map((w) => `<button class="ask-sug-b" data-sug="${esc(w)}" type="button">${esc(w)}</button>`).join("");
  box.querySelectorAll("[data-sug]").forEach((el) =>
    el.addEventListener("click", () => {
      askAdd(el.dataset.sug);
      поле.value = ""; askSugRender(); askChips(); поле.focus();
    }));
}
function openAskSheet() {
  const b = book();
  if (!b) return;
  sheetMode = "ask";
  openSheet(`
    <div class="ask-sheet">
      <h3>Что непонятно</h3>
      <p class="ask-hint">Слово — и дальше читай. Место в книге найдём потом и покажем на подтверждение.</p>
      <input id="askIn" type="text" inputmode="text" autocomplete="off" autocorrect="off"
             spellcheck="false" placeholder="слово из книги">
      <div class="ask-sug" id="askSug"></div>
      <div class="ask-list" id="askList"></div>
    </div>
    <div class="sheet-actions">
      <button class="btn gold" id="askGo" type="button" hidden>Разобрать</button>
      <button class="btn" id="askClose" type="button">Закрыть</button>
    </div>`);
  askChips();
  const поле = $("#askIn");
  if (поле) {
    поле.addEventListener("input", askSugRender);
    поле.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const w = поле.value.trim();
      if (!w) return;
      askAdd(w); поле.value = ""; askSugRender(); askChips();
    });
    поле.focus();
  }
  $("#askClose").addEventListener("click", closeSheet);
  $("#askGo").addEventListener("click", askRun);
  /* Словарь подсказок строим из текста книги — он же нужен и для поиска мест.
     Пока качается, поле работает как обычное: подсказки появятся сами. */
  if (hasBookFile(b)) gmLoadBook(b.id).then((t) => {
    if (!t || sheetMode !== "ask") return;
    askBuildIndex(b.id, t.разделы, askОкно(t.разделы, b));
    askSugRender();
  }).catch(() => {});
}

async function askRun() {
  const b = book();
  const список = asksOpen();
  if (!b || !список.length) return;
  openSheet(`<div class="ask-sheet"><div class="rd-load">Ищу места в книге…</div></div>`);
  const t = await gmLoadBook(b.id).catch(() => null);
  if (!t) { openSheet(`<div class="ask-sheet"><div class="rd-load">Текст книги не приехал — попробуй ещё раз</div></div>
    <div class="sheet-actions"><button class="btn" id="askClose" type="button">Закрыть</button></div>`);
    $("#askClose").addEventListener("click", closeSheet); return; }
  const окно = askОкно(t.разделы, b);
  const метки = askМетки(t.разделы, b);
  askRunState = {
    i: 0, k: 0, готовые: [],
    список: список.map((a) => ({ ...a, места: askCandidates(t.разделы, a.word, окно, метки) })),
  };
  askCard();
}

function askCard() {
  const st = askRunState;
  if (!st) return;
  if (st.i >= st.список.length) return askFinish();
  const cur = st.список[st.i];
  const м = cur.места[st.k];
  const ещё = cur.места.length > st.k + 1;
  openSheet(`
    <div class="ask-sheet">
      <div class="ask-step">${st.i + 1} из ${st.список.length}</div>
      <h3>${esc(cur.word)}</h3>
      ${м
        ? `<p class="ask-quote">${esc(м.фраза)}</p>
           ${м.раздел ? `<div class="ask-where">${esc(м.раздел)}</div>` : ""}`
        : `<p class="ask-hint">В тексте книги это слово не нашлось. Можно спросить и так — без цитаты.</p>`}
    </div>
    <div class="sheet-actions">
      ${м ? `<button class="btn gold" id="askYes" type="button">Да, это оно</button>` : ""}
      ${ещё ? `<button class="btn" id="askNext" type="button">Другое место</button>` : ""}
      <button class="btn" id="askSkip" type="button">${м ? "Пропустить" : "Спросить без цитаты"}</button>
    </div>`);
  const да = $("#askYes");
  if (да) да.addEventListener("click", () => {
    st.готовые.push({ id: cur.id, word: cur.word, фраза: м.фраза });
    st.i++; st.k = 0; askCard();
  });
  const др = $("#askNext");
  if (др) др.addEventListener("click", () => { st.k++; askCard(); });
  $("#askSkip").addEventListener("click", () => {
    if (!м) st.готовые.push({ id: cur.id, word: cur.word, фраза: "" });
    st.i++; st.k = 0; askCard();
  });
}

function askFinish() {
  const st = askRunState, b = book();
  askRunState = null;
  if (!st || !st.готовые.length) { closeSheet(); return; }
  const текст = askPrompt(st.готовые, b);
  copyRaw(текст);                       // промт длинный — адрес могут обрезать
  for (const g of st.готовые) askDrop(g.id, true);
  useMark("разбор-слов");
  const url = `https://chatgpt.com/?q=${encodeURIComponent(текст)}`;
  closeSheet();
  toast(`Разбор на ${st.готовые.length} ${plural(st.готовые.length, "место", "места", "мест")} — и в буфере`);
  if (navigator.standalone === true) location.href = url;
  else window.open(url, "_blank", "noopener");
}

/* ── Полоса «Объясни» ──
   Показывается, как только внутри текста что-то выделено. Внизу экрана, а не
   у выделения: там айфон рисует своё меню и перекрыл бы кнопку. */
function gmAskHide() {
  const bar = $("#gmAsk");
  if (bar) { bar.hidden = true; bar.innerHTML = ""; }
}
function gmAskShow() {
  const bar = $("#gmAsk");
  if (!bar) return;
  if (!gm || gmВкладка() !== "read") { gmAskHide(); return; }
  const sel = window.getSelection && window.getSelection();
  const фраза = sel ? String(sel).trim().replace(/\s+/g, " ") : "";
  const внутри = sel && sel.rangeCount && $("#gmRead")
    && $("#gmRead").contains(sel.getRangeAt(0).commonAncestorContainer);
  if (!фраза || фраза.length < 2 || !внутри) { gmAskHide(); return; }
  bar.hidden = false;
  bar.innerHTML = `<span>${esc(фраза.slice(0, 90))}${фраза.length > 90 ? "…" : ""}</span>
    <button id="gmAskGo" type="button">Объясни</button>`;
  /* Книгу и раздел снимаем прямо сейчас, вместе с фразой, а не в момент
     нажатия. Состояние карты и показанный текст расходятся: карту открыли для
     одной книги, а на экране ещё абзацы прошлой — и в промт уезжала не та
     книга. Что выделено, из того и берём. */
  const гл = (gm.части || []).find((x) => Number(x.n) === gm.часть);
  const откуда = gmText && gmText.id === gmBookFile()
    ? { id: gmText.id,
        раздел: гл ? gmИмяГлавы(гл.n, гл.name) : gmЗаголовок((gmText.разделы[gm.чтение] || {}).имя) }
    : { id: gmBookFile(), раздел: "" };
  const кн = $("#gmAskGo");
  if (кн) кн.addEventListener("click", () => gmAsk(фраза, откуда));
}

function gmAsk(фраза, откуда) {
  const из = откуда || { id: gm.id, раздел: "" };
  const b = (data.book.books || []).find((x) => x.id === из.id);
  const автор = b ? String(b.author || "").split("·")[0].trim() : "";
  const раздел = из.раздел;
  /* Без спойлеров — то же правило, что у всей карты: объясняем прочитанное и
     не рассказываем, что будет дальше. */
  /* Длину режем: адрес с вопросом уезжает в ChatGPT целиком, и на длинном
     выделении его обрезали по дороге — открывался прошлый разговор вместо
     нового. Полутора тысяч знаков хватает на несколько абзацев. */
  const кусок = фраза.length > 1500 ? фраза.slice(0, 1500) + "…" : фраза;
  const текст = `Вот фрагмент из книги «${b ? b.title : ""}»${автор ? `, ${автор}` : ""}`
    + `${раздел ? `, ${раздел}` : ""}:\n\n«${кусок}»\n\n`
    + `Объясни коротко: что здесь происходит, что значат непонятные слова и обороты, `
    + `на что тут стоит обратить внимание. Пиши конкретно, без общих фраз. `
    + `Не рассказывай, что будет дальше в книге.`;
  const вопрос = encodeURIComponent(текст);
  useMark("текст-вопрос");
  copyRaw(текст);   // если вопрос не подставится сам — он уже в буфере
  const url = `https://chatgpt.com/?q=${вопрос}`;
  if (navigator.standalone === true) location.href = url;
  else window.open(url, "_blank", "noopener");
}

/* Номер главы в подписи — всегда. Названия у книг разные: где-то «Песнь IX.
   Киклоп», где-то просто «Этапы штурма», и без цифры непонятно, где ты сейчас.
   Собственную нумерацию из названия убираем, чтобы не вышло «9. Песнь IX». */
/* Книга нумерует себя сама, если своя нумерация есть у большинства глав:
   «Песнь I», «Письмо второе», «Часть третья». Тогда наш номер не нужен — он
   спорит с изданием («1. Совет богов» там, где в книге «Песнь I»), а у
   «Баламута» ещё и расходится с ним: предисловие сдвигает счёт на два. */
function gmСамНумерует(части) {
  const список = части || (gm && gm.части) || [];
  if (список.length < 2) return false;
  const свои = список.filter((c) => gmNum(c.name) > 0).length;
  return свои * 2 >= список.length;
}
function gmИмяГлавы(n, имя) {
  /* У пьесы глава и так названа тактами — «1. Такты 1–4» повторяет само себя,
     а номер блока ничего не добавляет к их номерам. */
  if (/^Такты\s/.test(String(имя || ""))) return String(имя);
  if (gmСамНумерует()) return String(имя || "");
  const чистое = String(имя || "").replace(/^\s*(глава|песнь|часть|письмо)\s+[^.]{1,20}\.?\s*/i, "").trim();
  return `${n}. ${чистое || имя || ""}`;
}

function gmTitle() {
  const el = $("#gmTitle");
  if (!el || !gm) return;
  if (gm.часть === -1) { el.textContent = "Вокруг книги"; return; }
  const c = (gm.части || []).find((x) => Number(x.n) === gm.часть);
  el.textContent = c ? gmИмяГлавы(c.n, c.name) : gm.name;
}

/* Кнопка содержания нужна, только если делить и правда есть на что: одна
   глава на всю карту — это не выбор, а лишняя кнопка. */
function gmTocBtn() {
  const b = $("#gmToc");
  if (b) b.hidden = gmParts().length < 2;
  gmLayersRow();
}

/* Ряд слоёв под шапкой. Появляется, только когда слоёв правда несколько:
   у книги без разметки книг и людей выбирать не из чего. */
function gmLayersRow() {
  const box = $("#gmLayers");
  if (!box || !gm) return;
  /* Считаем в выбранной главе, а не по всей книге: человек стоит в своей
     главе, и число рядом со слоем должно говорить, сколько тут, а не всего. */
  const вГлаве = (p) => !gm.часть || (gm.часть === -1 ? !частьТочки(p) : частьТочки(p) === gm.часть);
  const счёт = (k) => new Set(gm.места.filter((p) => вкладкаТочки(p) === k && вГлаве(p))
    .map((p) => слойТочки(p) + "|" + p.name)).size;
  /* Пустая вкладка в этой главе не показывается совсем: «Справки · 0» —
     обещание, которое нечем выполнить, и открывать её приходится только чтобы
     это выяснить. Места остаются всегда: это сама карта, а не список поверх. */
  const вкладки = gmLayersOf().map(([k, имя]) => [k, имя, счёт(k)])
    .filter(([k, , n]) => n || k === "place" || k === "read");
  /* Вкладка могла опустеть при переходе в другую главу — тогда возвращаемся на
     карту: иначе открытым останется список, которого в ряду больше нет. */
  if (!вкладки.some(([k]) => k === gmВкладка())) gm.слой = (вкладки[0] || ["place"])[0];
  box.hidden = вкладки.length < 2;
  if (box.hidden) { box.innerHTML = ""; return; }
  const текущий = gmВкладка();
  box.innerHTML = вкладки.map(([k, имя, n]) =>
    `<button data-layer="${k}"${k === текущий ? ' class="on"' : ""}
      type="button">${имя}${k === "read" ? "" : " · " + n}</button>`).join("");
  /* Выбранный слой подтягиваем в видимую часть: он может оказаться за краем
     прокрутки, и тогда непонятно, что вообще открыто. */
  const он = box.querySelector("button.on");
  if (он && он.scrollIntoView) он.scrollIntoView({ block: "nearest", inline: "center" });
}

function gmToc() {
  const box = $("#gmHits");
  if (!box || !gm) return;
  const части = gmParts();
  if (!части.length) return;
  const слово = (n) => `${n} ${plural(n, "запись", "записи", "записей")}`;
  box.hidden = false;
  /* Записи без главы — не мусор: это то, что вокруг книги, а не в ней. У
     Достоевского так стоят адреса из его записной книжки, у «Одиссеи» — как
     поэма складывалась и как её переводили.
     Ставим первой строкой, а не последней: в хвосте она читалась как остаток,
     хотя открывать её можно с первого дня — она ничем не грозит. Про это и
     подпись: сюжета там нет, значит и спойлеров нет. */
  const вне = gm.места.filter((p) => !частьТочки(p)).length;
  // выбранная глава отмечена галочкой: иначе не видно, что карта чем-то сужена
  const выбрана = (n) => Number(gm.часть || 0) === n ? " class=\"on\"" : "";
  const птица = (n) => Number(gm.часть || 0) === n ? "✓ " : "";
  const вокруг = вне ? `<button data-part="-1"${выбрана(-1)} type="button">${птица(-1)}Вокруг книги
        <em>${слово(вне)} · о самой книге, без сюжета</em></button>` : "";
  box.innerHTML = вокруг + части.map((c) => `<button data-part="${esc(String(c.n))}"${выбрана(Number(c.n))} type="button">${птица(Number(c.n))}${esc(gmИмяГлавы(c.n, c.name))}
        <em>${esc(gmРазбивка(c.по) || слово(c.k))}</em></button>`).join("");
}

function gmPins() {
  const box = $("#gmPins");
  if (!box || !gm) return;
  box.innerHTML = gmВидимые().map((p) => {
    const { x, y } = mapXY(gm.рамка, p);
    /* Часть координат выверена по объектам OpenStreetMap, часть поставлена
       на глазок. Кружок у выверенной сплошной, у приблизительной — полый:
       видно, чему верить, не открывая карточку. */
    const примерно = /не выверен|стоит примерно/.test(p.t || "") ? " near" : "";
    const слой = слойТочки(p) === "place" ? "" : " " + слойТочки(p);
    /* У стека два имени: данное экспедицией и настоящее, местное. Первое
       крупно, второе строкой ниже и тише — на карте видно оба, а подпись
       не растягивается в ленту. */
    const м = /^(.+?) \((.+)\)$/.exec(p.name);
    const подпись = м
      ? `<span>${esc(м[1])}<em>${esc(м[2])}</em></span>`
      : `<span>${esc(p.name)}</span>`;
    return `<button class="gm-pin${примерно}${слой}${gm.at === p.name ? " on" : ""}" data-gm="${esc(p.name)}"
      data-x="${x.toFixed(3)}" data-y="${y.toFixed(3)}" type="button"><i></i>${подпись}</button>`;
  }).join("");
  gmScalePins();
}

/* Точки не растут вместе с картой: кружок остаётся кружком, иначе на четвёртом
   приближении он занимает пол-Пелопоннеса. */
/* Точки считаются в экранных координатах: где сейчас оказалась их доля карты
   после сдвига и увеличения. Это и держит их чёткими — они не участвуют в
   растягивании картинки. */
function gmScalePins() {
  if (!gm || !gm.base) return;
  const w = gm.base.w * gm.scale, h = gm.base.h * gm.scale;
  const видимые = [];
  document.querySelectorAll(".gm-pin").forEach((el) => {
    const x = gm.tx + w * Number(el.dataset.x) / 100;
    const y = gm.ty + h * Number(el.dataset.y) / 100;
    el.style.left = x.toFixed(1) + "px";
    el.style.top = y.toFixed(1) + "px";
    /* Прошлое состояние кучки снимаем целиком: класс, счётчик и подпись.
       Без возврата подписи распавшаяся кучка так и стояла «Египет · Фарос»
       рядом с отдельным Фаросом. */
    el.classList.remove("many");
    el.removeAttribute("data-many");
    const счёт = el.querySelector("b"); if (счёт) счёт.remove();
    const имя = el.querySelector("span");
    if (имя && имя.textContent !== el.dataset.gm) имя.textContent = el.dataset.gm;
    // за краем экрана точку не рисуем: она всё равно не видна, а тянет на себя касания
    const за = x < -40 || y < -40 || x > gm.base.sw + 40 || y > gm.base.sh + 40;
    el.style.visibility = за ? "hidden" : "";
    if (!за) видимые.push({ el, x, y });
  });

  /* Соседние стеки стоят в сотнях метров друг от друга: на карте мира это доли
     пикселя. Раньше такие точки раскладывались веером — но веер врёт: кружок
     стоит не там, где место, и промахнуться легко. Теперь слипшиеся точки
     собираются в одну с числом: нажал — и выбираешь из списка по имени.
     Приближаешь — кучка распадается сама, точки встают по своим местам. */
  const КЛЕТКА = 26;
  gm.кучки = {};
  const клетки = new Map();
  for (const т of видимые) {
    const k = Math.round(т.x / КЛЕТКА) + ":" + Math.round(т.y / КЛЕТКА);
    if (!клетки.has(k)) клетки.set(k, []);
    клетки.get(k).push(т);
  }
  for (const [k, кучка] of клетки) {
    if (кучка.length < 2) continue;
    const cx = кучка.reduce((a, т) => a + т.x, 0) / кучка.length;
    const cy = кучка.reduce((a, т) => a + т.y, 0) / кучка.length;
    /* Главной в кучке делаем выбранную точку, если она здесь: тогда кружок
       остаётся белым и видно, что выбор внутри этой кучки. */
    const глава = кучка.find((т) => т.el.dataset.gm === gm.at) || кучка[0];
    for (const т of кучка) if (т !== глава) т.el.style.visibility = "hidden";
    глава.el.style.left = cx.toFixed(1) + "px";
    глава.el.style.top = cy.toFixed(1) + "px";
    глава.el.classList.add("many");
    глава.el.dataset.many = k;
    глава.el.insertAdjacentHTML("beforeend", `<b>${кучка.length}</b>`);
    gm.кучки[k] = кучка.map((т) => т.el.dataset.gm);
    /* Подпись кучки перечисляет, кто в ней: иначе «2» над Египтом не отвечает
       на вопрос, куда делся Фарос. Много имён в строку не влезет — тогда счёт. */
    const подпись = глава.el.querySelector("span");
    if (подпись) подпись.textContent = кучка.length <= 3
      ? gm.кучки[k].join(" · ")
      : `${кучка.length} ${plural(кучка.length, "место", "места", "мест")}`;
  }

  gmLabels();
}

/* Подписи показываем, только если их немного: сто шесть имён поверх карты —
   это сплошная каша при любом увеличении. Там, где точек много, имя видно
   у выбранной, а остальные ищутся поиском. */
function gmLabels() {
  const pins = $("#gmPins");
  if (pins && gm) pins.classList.toggle("tight", gm.scale < 1.8 || gm.места.length > 25);
}

function gmApply() {
  const wrap = $("#gmWrap");
  if (!wrap || !gm) return;
  wrap.style.transform = `translate(${gm.tx}px, ${gm.ty}px) scale(${gm.scale})`;
  gmScalePins();
}

/* Вписываем карту в экран и запоминаем базовый размер: всё остальное считается
   от него, поэтому поворот телефона ничего не ломает. */
/* Подводим карту к выбранным точкам. На общем плане соседи сливаются в одну
   метку с числом: Фарос и Египет на карте Средиземноморья стоят в двенадцати
   пикселях друг от друга, и «а где Фарос?» — законный вопрос. Выбрал песнь —
   карта подъезжает к её местам, и они расходятся. */

function gmFit() {
  const stage = $("#gmStage"), wrap = $("#gmWrap"), img = $("#gmImg");
  if (!stage || !wrap || !img || !gm) return;
  const прим = () => {
    const sw = stage.clientWidth, sh = stage.clientHeight;
    const iw = img.naturalWidth || sw, ih = img.naturalHeight || sh;
    /* Вписываем целиком, а не заполняем экран: при открытии важно увидеть всю
       картину сразу — где Итака, а где Троя. Приблизить можно пальцами. */
    const w = sw, h = w * ih / iw;
    wrap.style.width = w + "px";
    gm.base = { w, h, sw, sh };
    gm.scale = 1;
    gm.tx = 0;
    gm.ty = Math.max(0, (sh - h) / 2);
    gmApply();
    /* Карта всегда показывается целиком, даже когда в главе одна метка:
       приближаться к ней незачем, а вот увидеть, где она относительно всего
       остального, — единственное, ради чего карту открывают. */
    if (gm.at) gmFocus(gm.at, 2.2);
  };
  if (img.complete && img.naturalWidth) прим();
  else img.onload = прим;
}

// подвести выбранную точку к центру экрана
function gmFocus(name, scale) {
  const p = gm && gm.места.find((x) => x.name === name);
  if (!p || !gm.base) return;
  const { x, y } = mapXY(gm.рамка, p);
  gm.scale = Math.min(GM_MAX, Math.max(1, scale || gm.scale));
  const px = gm.base.w * gm.scale * x / 100, py = gm.base.h * gm.scale * y / 100;
  gm.tx = gm.base.sw / 2 - px;
  gm.ty = gm.base.sh / 2 - py - 40;         // чуть выше центра: снизу карточка
  gmClamp();
  gmApply();
}

/* Карту нельзя утащить в пустоту: край изображения не уходит дальше края
   экрана, а если карта меньше экрана — она просто стоит по центру. */
function gmClamp() {
  if (!gm || !gm.base) return;
  const w = gm.base.w * gm.scale, h = gm.base.h * gm.scale;
  const sw = gm.base.sw, sh = gm.base.sh;
  gm.tx = w <= sw ? (sw - w) / 2 : Math.min(0, Math.max(sw - w, gm.tx));
  gm.ty = h <= sh ? (sh - h) / 2 : Math.min(0, Math.max(sh - h, gm.ty));
}

function gmCard() {
  const card = $("#gmCard");
  if (!card || !gm) return;
  /* Карточка снизу — принадлежность карты: она объясняет метку, на которую
     ткнули пальцем. В списке справок текст раскрывается прямо в строке, и
     всплывающий экран поверх него дублирует то же самое вторым способом. */
  if (gmВкладка() !== "place") { card.hidden = true; card.innerHTML = ""; return; }
  /* Ищем среди показанных, а не среди всех: у Огигии своё описание в каждой
     песни, и в песни V должно стоять её, а не первое попавшееся. */
  /* Запасной поиск — только внутри своего слоя: у стека и у человека, чьим
     именем он назван, имя одно, и карточка показывала бы не то. */
  const слой = gmВкладка();
  const p = gmВидимые().find((x) => x.name === gm.at)
    || gm.места.find((x) => x.name === gm.at && слойТочки(x) === слой);
  if (!p) { card.hidden = true; card.innerHTML = ""; return; }
  /* «Фото» ведёт в поиск по картинкам: интересно не где это на карте, а как
     место выглядит сегодня. У мифических имён свой запрос — «Огигия» не найдёт
     ничего, а «остров Гоцо Мальта» найдёт. Карта остаётся второй кнопкой. */
  const запрос = encodeURIComponent(p.q || p.name);
  const фото = `https://www.google.com/search?tbm=isch&q=${запрос}`;
  /* Google Earth вместо карты: со спутника видно, что это за место на самом
     деле — берег, скала, лес. Камера задаётся адресом: @широта,долгота, высота
     точки (0a), удаление камеры (1200d), угол обзора (35y) и повороты (0h/0t/0r).
     Никакого поиска по названию: Google подменяет место созвучным — «метеостанция
     Солнечная» превращалась в институт солнечно-земной физики. */
  const гео = `https://earth.google.com/web/@${p.lat},${p.lon},0a,1200d,35y,0h,0t,0r`;
  /* Яндекс полезнее по России: у него подробнее сибирские берега и подписи
     по-русски. Порядок координат у него обратный — сначала долгота. */
  const янд = `https://yandex.ru/maps/?ll=${p.lon},${p.lat}&z=16&pt=${p.lon},${p.lat},pm2rdm`;
  /* «История» — вопрос в Perplexity: он собирает ответ из открытых источников
     и показывает ссылки. Спрашиваем по-русски, но место называем так, как его
     знают в мире, — иначе поиск уводит не туда.
     Просим коротко и с картинками: длинную справку на телефоне между делом
     никто не дочитывает, а место запоминается не перечнем дат, а одной живой
     подробностью и фотографией. */
  /* Книгу называем прямо: без неё «ресторан Бореля» или «Игла» — просто слова,
     и поиск отвечает про что попало. С названием и автором он понимает, о чьём
     Петербурге и о чьей Нормандии речь. Переводчика из строки автора убираем:
     в вопросе он только мешает. */
  const кн = (data.book.books || []).find((b) => b.id === gm.id);
  const автор = кн ? String(кн.author || "").split("·")[0].trim() : "";
  const откуда = кн
    ? ` Место из книги «${кн.title}»${автор ? `, ${автор}` : ""}${
        p.q && p.q !== p.name ? `; в книге оно названо «${p.name}»` : ""}.`
    : "";
  /* Главный вопрос к месту — не «что тут было», а «что от этого осталось и
     куда идти смотреть». Особенно у «Одиссеи»: на месте мифических имён стоят
     настоящие города, и интересно, что уцелело от той Греции. Поэтому пункты
     идут от современного названия к подлинному, что можно потрогать, и
     заканчиваются списком точек, куда ехать. Отдельным пунктом — своя история
     места и громкие события, с ним связанные: книга упоминает его мимоходом,
     а у места обычно есть и собственная слава, ради которой туда и едут.
     Ещё пунктом — природа: не «какой там пейзаж вообще», а названные горы,
     бухты, водопады и скалы рядом. Место запоминается видом, а не датами, и
     половина мест поэмы интересна именно природой, а не развалинами.
     Фотографии просим отдельной строкой и обязательными: без этого ответ
     приходит сплошным текстом. Длину задаём жёстко — иначе две страницы. */
  const вопрос = encodeURIComponent(
    `Расскажи про место ${p.q || p.name}.${откуда} `
    + `Ответь коротко, по пунктам, на каждый одно-два предложения: `
    + `1) откуда взялось название и как это место называется сейчас — какой это город, остров или район на современной карте; `
    + `2) что здесь было в ту эпоху, о которой книга, и что из этого подтверждено раскопками, а что осталось преданием; `
    + `3) чем это место известно само по себе, помимо книги: тезисно его история и два-три самых громких события, которые с ним связаны и у всех на слуху; `
    + `4) что от той эпохи уцелело на самом месте — какие именно развалины, стены, храмы, и в каком музее лежат находки отсюда; `
    + `5) что здесь стоит увидеть сегодня: три-четыре главные достопримечательности по названиям, чем каждая интересна и как до неё добираются; `
    + `6) какая там природа и какие природные места рядом стоят внимания — горы, бухты, водопады, пещеры, скалы, озёра: назови их по именам и скажи, чем каждое примечательно и как выглядит; `
    + `7) одна живая подробность, которую замечают те, кто там побывал. `
    + `Обязательно покажи фотографии: общий вид места сегодня, пейзажи и названные природные места — горы, берег, лес, скалы, `
    + `снимки того подлинного, что сохранилось, и старые фотографии, если они есть. `
    + `Пиши конкретно, без общих фраз и перечней дат. `
    + `Сюжет книги${кн ? ` «${кн.title}»` : ""} не пересказывай и ничем не выдавай, чем она кончается `
    + `и что случится с героями дальше.`);
  const история = `https://chatgpt.com/?q=${вопрос}`;
  const мимо = (navigator.standalone === true) ? "" : ` target="_blank" rel="noopener"`;
  card.hidden = false;
  /* PastVu — архив старых снимков, привязанных к карте. Открываем его на этой
     же точке и в тех годах, о которых книга: увидеть место таким, каким оно
     было при героях. */
  const годы = pastvuYears(gm && gm.id ? { id: gm.id } : null);

  /* На общей карте место может приходить из нескольких глав — говорим, из
     каких: иначе непонятно, почему в описании только одна песнь. */
  const главы = gm.часть ? [] : gmГлавы(p.name);
  card.innerHTML = `
    <b>${esc(p.name)}</b>
    <p>${esc(p.t || "")}</p>
    ${p.about ? `<p class="gm-about">${esc(p.about)}</p>` : ""}
    ${главы.length > 1 ? `<p class="gm-in">${esc(главы.join(" · "))}</p>` : ""}
    <div class="gm-links">
      <a href="${esc(история)}"${мимо}>ChatGPT</a>
      <a href="${esc(янд)}" target="_blank" rel="noopener">Я.Карты</a>
      <a href="${esc(гео)}" target="_blank" rel="noopener">Earth</a>
      <a href="${esc(фото)}" target="_blank" rel="noopener">Картинки</a>
      ${годы ? `<a href="#" data-shots="1">Старые фото</a>` : ""}
      ${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">Источник</a>` : ""}
    </div>`;
}

/* Кучка точек: показываем её состав тем же списком, что и поиск, — выбрать
   по имени надёжнее, чем целиться пальцем в слипшиеся кружки. */
function gmCluster(имена) {
  const box = $("#gmHits");
  if (!box || !gm) return;
  const места = (имена || []).map((n) => gm.места.find((p) => p.name === n)).filter(Boolean);
  if (!места.length) return;
  box.hidden = false;
  box.innerHTML = места.map((p) => `<button data-hit="${esc(p.name)}" type="button">${esc(p.name)}
      <em>${esc((p.t || "").split(" · ").slice(0, 2).join(" · "))}</em></button>`).join("");
}

/* Поиск по названию: набрал «Тотем» — увидел, где он. Ищем и по имени из
   книги, и по описанию: там лежит официальное название и район, поэтому
   «Shetland» или «долерит» тоже находят. */
function gmSearch(текст) {
  const box = $("#gmHits");
  if (!box || !gm) return;
  const q = String(текст || "").trim().toLowerCase();
  if (q.length < 2) { box.hidden = true; box.innerHTML = ""; return; }
  /* Ищем по всей книге сразу: и по слоям, и по главам. Человек набирает
     «олуша» или «долерит», не помня, в каком это слое и в какой главе, — и
     ждать от него этого нельзя. В строке результата пишем, где найденное
     лежит, а нажатие само переключит слой и главу. */
  const вид = { place: "место", book: "книга", person: "человек",
                animal: "живность", rock: "порода", word: "слово",
                art: "искусство", thing: "вещь", text: "о тексте" };
  const было = new Set();
  const найдено = gm.места.filter((p) => {
    const ключ = слойТочки(p) + "|" + p.name;
    if (было.has(ключ)) return false;
    const есть = (p.name || "").toLowerCase().includes(q)
      || (p.q || "").toLowerCase().includes(q)
      || (p.t || "").toLowerCase().includes(q)
      || (p.about || "").toLowerCase().includes(q);
    if (есть) было.add(ключ);
    return есть;
  }).slice(0, 40);
  box.hidden = false;
  box.innerHTML = найдено.length
    ? найдено.map((p) => {
        const гл = частьТочки(p);
        const имя = (gm.части || []).find((x) => Number(x.n) === гл);
        const где = [вид[слойТочки(p)], имя ? gmИмяГлавы(гл, имя.name) : ""].filter(Boolean).join(" · ");
        const зн = слойТочки(p) === "place" ? "" : gmIcon(p) + " ";
        return `<button data-hit="${esc(p.name)}" data-hitlayer="${esc(вкладкаТочки(p))}"
          data-hitpart="${гл}" type="button">${esc(зн + p.name)}<em>${esc(где)}</em></button>`;
      }).join("")
    : `<button type="button" disabled>Ничего не нашлось</button>`;
}


/* ── Старые снимки места ──
   Архив PastVu отдаёт снимки по координате обычным запросом, и это удобнее,
   чем открывать их карту: телефон, чужой интерфейс, приближение — всё мимо.
   Показываем ленту сами: миниатюры, год, подпись; нажатие открывает снимок
   крупно, а ссылка ведёт на исходную страницу архива. */
const PV_API = "https://pastvu.com/api2";
const pvImg = (file, size) => `https://pastvu.com/_p/${size || "h"}/${file}`;
const pvPage = (cid) => `https://pastvu.com/p/${cid}`;
let shots = null;      // {место, список, at}

async function pvNearest(lat, lon, годы, limit) {
  const params = { geo: [lat, lon], limit: limit || 30 };
  if (годы) { params.year = годы.y; params.year2 = годы.y2; }
  const url = PV_API + "?method=photo.giveNearestPhotos&params=" + encodeURIComponent(JSON.stringify(params));
  const r = await withTimeout(fetch(url), 15000);
  if (!r.ok) throw new Error("архив не ответил");
  const d = await r.json();
  const list = (d && d.result && d.result.photos) || [];
  /* Архив отдаёт и снимки без года — они нам не нужны, мы обещали эпоху. */
  return list.filter((p) => p.file);
}

function openShots(p, все) {
  useMark("карта-снимки");
  const box = $("#gmShots");
  if (!box || !gm) return;
  shots = { место: p, список: null, one: null, все: !!все };
  box.hidden = false;
  box.setAttribute("aria-hidden", "false");
  рисуйСнимки("Ищу снимки…");
  const годы = shots.все ? null : pastvuYears({ id: gm.id });
  pvNearest(p.lat, p.lon, годы, 30)
    .then((list) => { if (shots) { shots.список = list; рисуйСнимки(); } })
    .catch(() => { if (shots) { shots.сбой = true; рисуйСнимки("Архив не ответил"); } });
}

function closeShots() {
  const box = $("#gmShots");
  if (box) { box.hidden = true; box.setAttribute("aria-hidden", "true"); box.innerHTML = ""; }
  shots = null;
}

function рисуйСнимки(ожидание) {
  const box = $("#gmShots");
  if (!box || !shots) return;
  const p = shots.место;
  const годы = pastvuYears({ id: gm ? gm.id : "" });
  const карта = `https://pastvu.com/?g=${p.lat},${p.lon}&z=17${годы ? `&y=${годы.y}&y2=${годы.y2}` : ""}`;
  const шапка = `
    <div class="sh-top">
      <b>${esc(shots.one ? (shots.one.title || "Снимок") : p.name)}</b>
      ${shots.one ? `<a href="${esc(pvPage(shots.one.cid))}" target="_blank" rel="noopener">Источник</a>`
        : `${годы ? `<button data-sh="years" type="button">${shots.все ? "Годы книги" : "Все годы"}</button>` : ""}
           <a href="${esc(карта)}" target="_blank" rel="noopener">Архив</a>`}
      <button data-sh="${shots.one ? "back" : "close"}" type="button">${shots.one ? "Назад" : "✕"}</button>
    </div>`;

  if (ожидание) {
    box.innerHTML = шапка + `<div class="sh-none">${esc(ожидание)}
      ${shots.сбой ? `<div style="margin-top:14px"><button class="btn" data-sh="retry" type="button">Ещё раз</button></div>` : ""}</div>`;
  }
  else if (shots.one) {
    const s1 = shots.one;
    box.innerHTML = шапка + `
      <div class="sh-one">
        <div class="sh-zoom"><img src="${esc(pvImg(s1.file, "d"))}" alt="${esc(s1.title || "")}" draggable="false"></div>
        <b>${esc(s1.title || "Без названия")}</b>
        <p>${s1.year ? esc(String(s1.year)) + " год · " : ""}снимок из архива PastVu · приближается пальцами</p>
      </div>`;
    /* Крупный файл иногда не отдаётся — тогда показываем миниатюру: лучше
       мелкий снимок, чем пустое место. */
    const кадр = box.querySelector(".sh-one img");
    if (кадр) кадр.addEventListener("error", function () {
      if (this.dataset.мелкий) return;
      this.dataset.мелкий = "1";
      this.src = pvImg(s1.file, "h");
    });
    shZoom(box.querySelector(".sh-zoom"));
  } else if (!shots.список) {
    box.innerHTML = шапка + `<div class="sh-none">Ищу снимки…</div>`;
  } else if (!shots.список.length) {
    box.innerHTML = шапка + `<div class="sh-none">Для этого места снимков ${shots.все ? "" : "тех лет "}в архиве нет.
      ${!shots.все && годы ? `<div style="margin-top:14px"><button class="btn" data-sh="years" type="button">Посмотреть все годы</button></div>` : ""}</div>`;
  } else {
    box.innerHTML = шапка + `<div class="sh-note">${shots.все || !годы
      ? "снимки всех лет, какие есть в архиве"
      : `снимки ${годы.y}–${годы.y2} годов · «Все годы» покажет остальные`}</div><div class="sh-grid">${shots.список.map((s1, i) => `
      <button class="sh-item" data-shot="${i}" type="button">
        <img src="${esc(pvImg(s1.file, "h"))}" alt="" loading="lazy">
        <b>${s1.year ? esc(String(s1.year)) : "год неизвестен"}</b>
        <em>${esc(s1.title || "")}</em>
      </button>`).join("")}</div>`;
  }

  box.querySelectorAll("[data-sh]").forEach((el) =>
    el.addEventListener("click", () => {
      if (el.dataset.sh === "back") { shots.one = null; рисуйСнимки(); }
      else if (el.dataset.sh === "retry") { const п = shots.место, в = shots.все; closeShots(); openShots(п, в); }
      else if (el.dataset.sh === "years") { const п = shots.место, в = !shots.все; closeShots(); openShots(п, в); }
      else closeShots();
    }));
  box.querySelectorAll("[data-shot]").forEach((el) =>
    el.addEventListener("click", () => {
      shots.one = shots.список[Number(el.dataset.shot)];
      рисуйСнимки();
      const b = $("#gmShots"); if (b) b.scrollTop = 0;
    }));
}

/* Снимок можно рассмотреть: щипок приближает, палец таскает, двойное касание
   возвращает к целому кадру. На старых фотографиях самое интересное — мелочи:
   вывески, экипажи, лица в окнах. */
function shZoom(рамка, макс) {
  if (!рамка) return;
  const предел = макс || 6;
  const img = рамка.querySelector("img");
  let scale = 1, tx = 0, ty = 0;
  const точки = new Map();
  let старт = null, щипок = false, тянули = false, last = 0;

  const применить = () => {
    const w = рамка.clientWidth, h = рамка.clientHeight;
    if (scale <= 1) { scale = 1; tx = 0; ty = 0; }
    else {
      tx = Math.min(0, Math.max(w - w * scale, tx));
      ty = Math.min(0, Math.max(h - h * scale, ty));
    }
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    рамка.classList.toggle("zoomed", scale > 1);
  };

  рамка.addEventListener("pointerdown", (e) => {
    точки.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { рамка.setPointerCapture(e.pointerId); } catch {}
    if (точки.size === 1) { старт = { x: e.clientX, y: e.clientY, tx, ty }; щипок = false; тянули = false; }
    if (точки.size === 2) {
      const [a, b] = [...точки.values()];
      щипок = true;
      старт = { d: Math.hypot(a.x - b.x, a.y - b.y), scale,
                cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, tx, ty };
    }
  });
  рамка.addEventListener("pointermove", (e) => {
    if (!точки.has(e.pointerId) || !старт) return;
    точки.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (точки.size === 1 && !старт.d) {
      if (scale <= 1) return;                       // целый кадр не таскаем: пусть страница листается
      const dx = e.clientX - старт.x, dy = e.clientY - старт.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) тянули = true;
      tx = старт.tx + dx; ty = старт.ty + dy;
      применить();
      e.preventDefault();
    } else if (точки.size === 2 && старт.d) {
      const [a, b] = [...точки.values()];
      const k = Math.min(предел, Math.max(1, старт.scale * (Math.hypot(a.x - b.x, a.y - b.y) / старт.d)));
      const r = рамка.getBoundingClientRect();
      const cx = старт.cx - r.left, cy = старт.cy - r.top;
      tx = cx - (cx - старт.tx) * (k / старт.scale);
      ty = cy - (cy - старт.ty) * (k / старт.scale);
      scale = k;
      применить();
      e.preventDefault();
    }
  });
  const конец = (e) => {
    точки.delete(e.pointerId);
    if (!точки.size) старт = null;
  };
  рамка.addEventListener("pointerup", (e) => {
    const t = Date.now();
    if (!щипок && !тянули && t - last < 300) {
      const r = рамка.getBoundingClientRect();
      const cx = e.clientX - r.left, cy = e.clientY - r.top;
      const k = scale > 1.2 ? 1 : 2.5;
      tx = cx - (cx - tx) * (k / scale);
      ty = cy - (cy - ty) * (k / scale);
      scale = k;
      применить();
      last = 0;
    } else last = (!щипок && !тянули) ? t : 0;
    конец(e);
  });
  рамка.addEventListener("pointercancel", конец);
  рамка.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = рамка.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    const k = Math.min(6, Math.max(1, scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    tx = cx - (cx - tx) * (k / scale);
    ty = cy - (cy - ty) * (k / scale);
    scale = k;
    применить();
  }, { passive: false });
}

function bindPlaceMap() {
  const box = $("#gmap"), stage = $("#gmStage");
  if (!box || !stage) return;
  $("#gmClose").addEventListener("click", closePlaceMap);

  const поле = $("#gmFind");
  if (поле) {
    /* На вкладке текста то же поле ищет по книге, а не по записям карты:
       двух полей на одном экране не надо, а искать хочется там, где смотришь. */
    const искать = () => {
      if (gm && gmВкладка() === "read") { gm.поиск = поле.value; gmRead(); return; }
      gmSearch(поле.value);
    };
    поле.addEventListener("input", искать);
    поле.addEventListener("focus", искать);
  }

  /* Выделение внутри текста — единственное, чего ждёт полоса «Объясни».
     selectionchange приходит и на снятие выделения, поэтому она же его и
     прячет. */
  document.addEventListener("selectionchange", () => {
    if (!gm || gmВкладка() !== "read") return;
    clearTimeout(gmAskTimer);
    gmAskTimer = setTimeout(gmAskShow, 120);
  });
  const кнТос = $("#gmToc");
  if (кнТос) кнТос.addEventListener("click", () => {
    const хиты = $("#gmHits");
    if (!хиты) return;
    if (!хиты.hidden && хиты.querySelector("[data-part]")) { хиты.hidden = true; хиты.innerHTML = ""; return; }
    if (поле) поле.value = "";
    useMark("карта-содержание");
    gmToc();
  });

  const слои = $("#gmLayers");
  if (слои) слои.addEventListener("click", (e) => {
    const b = e.target.closest("[data-layer]");
    if (!b || !gm) return;
    gm.слой = b.dataset.layer;
    /* Главу держим: человек читает главу и смотрит, что в ней есть по разным
       слоям. Снимаем только выбранную точку — она была из прошлого слоя. */
    gm.at = null;
    /* Поиск у вкладок разный — по записям и по тексту книги, — и переносить
       набранное с одной на другую бессмысленно. */
    gm.поиск = "";
    const пф = $("#gmFind");
    if (пф) { пф.value = ""; пф.placeholder = b.dataset.layer === "read" ? "Найти в тексте" : "Найти в книге"; }
    const хиты = $("#gmHits"); if (хиты) { хиты.hidden = true; хиты.innerHTML = ""; }
    gmLayersRow(); gmTocBtn(); gmTitle(); gmPins(); gmList(); gmCard(); gmFit();
    /* На «Текст» приходят за конкретным местом, а не листать: ставим курсор в
       поиск сразу. Фокус только здесь и только в этом жесте — иначе айфон
       клавиатуру не покажет. */
    if (b.dataset.layer === "read" && пф) пф.focus();
  });

  const хиты = $("#gmHits");
  if (хиты) хиты.addEventListener("click", (e) => {
    if (!gm) return;
    const ч = e.target.closest("[data-part]");
    if (ч) {
      gm.часть = Number(ч.dataset.part) || 0;
      gm.поиск = "";
      const пф2 = $("#gmFind"); if (пф2) пф2.value = "";
      /* Выбранное место могло уйти из показа вместе с чужой главой —
         тогда снимаем выбор, иначе карточка внизу висит без своей точки. */
      if (gm.at && !gmВидимые().some((p) => p.name === gm.at)) gm.at = null;
      хиты.hidden = true; хиты.innerHTML = "";
      gmTitle();
      gmLayersRow();      // числа у слоёв считаются в выбранной главе
      gmPins();
      gmList();
      gmCard();
      gmFit();
      return;
    }
    const b = e.target.closest("[data-hit]");
    if (!b) return;
    gm.at = b.dataset.hit;
    /* Найденное могло лежать в другом слое и другой главе — переходим туда,
       иначе нажатие показывало бы пустоту. */
    if (b.dataset.hitlayer) gm.слой = b.dataset.hitlayer;
    if (b.dataset.hitpart) gm.часть = Number(b.dataset.hitpart) || 0;
    хиты.hidden = true;
    if (поле) { поле.value = ""; поле.blur(); }
    gmLayersRow(); gmTocBtn(); gmTitle();
    gmPins();
    gmList();
    gmCard();
    if (gmВкладка() === "place") gmFocus(gm.at, Math.max(gm.scale, 3.5));
  });

  box.addEventListener("click", (e) => {
    const shot = e.target.closest("[data-shots]");
    if (shot) {
      e.preventDefault();
      const p = gm && gm.места.find((x) => x.name === gm.at);
      if (p) openShots(p);
      return;
    }
    if (!gm) return;
    const куча = e.target.closest("[data-many]");
    if (куча) { gmCluster(gm.кучки && gm.кучки[куча.dataset.many]); return; }
    const pin = e.target.closest("[data-gm]");
    if (pin) {
      gm.at = gm.at === pin.dataset.gm ? null : pin.dataset.gm;
      /* В списке карточка раскрывается прямо в строке, и нижняя не нужна:
         иначе один и тот же текст стоял бы дважды. */
      if (gmВкладка() !== "place") { gmList(); return; }
      gmPins();
      gmCard();
      if (gm.at) gmFocus(gm.at, Math.max(gm.scale, 2.2));
      return;
    }
    /* Нажал мимо точки — выбор снимается и карточка уходит: закрывать её
       отдельной кнопкой неудобно, а пустое место рядом всегда под рукой.
       После перетаскивания карты выбор не трогаем: это был не тычок. */
    if (!e.target.closest("#gmStage") || тянули || !gm.at) return;
    gm.at = null;
    gmPins();
    gmCard();
  });

  /* Жесты: одним пальцем тащим, двумя приближаем. Колесо — для настольного
     браузера. Всё на указателях, поэтому мышь и палец работают одинаково. */
  const точки = new Map();
  let старт = null, щипок = false, тянули = false;
  stage.addEventListener("pointerdown", (e) => {
    if (!gm) return;
    точки.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { stage.setPointerCapture(e.pointerId); } catch {}
    if (точки.size === 1) {
      старт = { x: e.clientX, y: e.clientY, tx: gm.tx, ty: gm.ty, moved: false };
      щипок = false; тянули = false;
    }
    if (точки.size === 2) щипок = true;
    if (точки.size === 2) {
      const [a, b] = [...точки.values()];
      старт = { d: Math.hypot(a.x - b.x, a.y - b.y), scale: gm.scale,
                cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, tx: gm.tx, ty: gm.ty, moved: true };
    }
  });
  stage.addEventListener("pointermove", (e) => {
    if (!gm || !точки.has(e.pointerId)) return;
    точки.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (точки.size === 1 && старт && старт.tx !== undefined && !старт.d) {
      const dx = e.clientX - старт.x, dy = e.clientY - старт.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) { старт.moved = true; тянули = true; }
      gm.tx = старт.tx + dx; gm.ty = старт.ty + dy;
      gmClamp(); gmApply();
    } else if (точки.size === 2 && старт && старт.d) {
      const [a, b] = [...точки.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const k = Math.min(GM_MAX, Math.max(1, старт.scale * (d / старт.d)));
      const r = stage.getBoundingClientRect();
      const cx = старт.cx - r.left, cy = старт.cy - r.top;
      // точка под пальцами остаётся под пальцами
      gm.tx = cx - (cx - старт.tx) * (k / старт.scale);
      gm.ty = cy - (cy - старт.ty) * (k / старт.scale);
      gm.scale = k;
      gmClamp(); gmApply();
    }
  });
  const конец = (e) => {
    точки.delete(e.pointerId);
    if (!точки.size) { старт = null; return; }
    /* Один палец убрали, второй остался — дальше это перетаскивание, а не
       щипок: перезаводим отсчёт, иначе карта замирает до полного отпускания. */
    const [a] = [...точки.values()];
    старт = { x: a.x, y: a.y, tx: gm ? gm.tx : 0, ty: gm ? gm.ty : 0, moved: true };
  };
  stage.addEventListener("pointerup", конец);
  stage.addEventListener("pointercancel", конец);

  stage.addEventListener("wheel", (e) => {
    if (!gm) return;
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    const k = Math.min(GM_MAX, Math.max(1, gm.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    gm.tx = cx - (cx - gm.tx) * (k / gm.scale);
    gm.ty = cy - (cy - gm.ty) * (k / gm.scale);
    gm.scale = k;
    gmClamp(); gmApply();
  }, { passive: false });

  /* Двойное касание — приблизить и отдалить обратно. Но два пальца при щипке
     тоже дают два «отпускания» подряд, и приближение честно сбрасывалось в
     единицу сразу после жеста: казалось, что карта «откидывает назад».
     Поэтому считаем двойным касанием только одиночные тапы без движения. */
  let last = 0, lastXY = null;
  stage.addEventListener("pointerup", (e) => {
    const t = Date.now();
    const одиночный = !щипок && !тянули;      // ни второго пальца, ни перетаскивания
    const рядом = lastXY && Math.hypot(e.clientX - lastXY.x, e.clientY - lastXY.y) < 30;
    if (одиночный && рядом && t - last < 300 && gm) {
      const r = stage.getBoundingClientRect();
      const cx = e.clientX - r.left, cy = e.clientY - r.top;
      /* Двойное касание: если уже приблизил — возвращаемся к общему виду,
         если нет — приближаем. Шаг крупный: мелкий шаг на такой карте
         бессмыслен. */
      const k = gm.scale > 1.6 ? 1 : 4;
      gm.tx = cx - (cx - gm.tx) * (k / gm.scale);
      gm.ty = cy - (cy - gm.ty) * (k / gm.scale);
      gm.scale = k;
      gmClamp(); gmApply();
    }
    last = одиночный ? t : 0;
    lastXY = { x: e.clientX, y: e.clientY };
  });

  window.addEventListener("resize", () => { if (gm) gmFit(); });
}

function bindPractice() {
  $("#pracClose").addEventListener("click", () => { if (prac) pracFinish(); });

  /* Картинку закрывает и крестик, и тап мимо неё, и Escape: она открывается
     поверх занятия, и выйти из неё должно быть проще, чем войти. */
  $("#picClose").addEventListener("click", picClose);
  $("#picBox").addEventListener("click", (e) => {
    if (e.target.closest(".sh-zoom") || e.target.closest("#picClose")) return;
    picClose();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") picClose(); });
  $("#pracPlayer").addEventListener("pointerdown", plDrag);
  $("#pracVideo").addEventListener("pointerdown", vidDrag);

  $("#pracVideo").addEventListener("click", async (e) => {
    const box = $("#pracVideo");
    const b = e.target.closest("[data-vd]");
    const rate = e.target.closest("[data-vrate]");
    if (rate) {
      pracStore().vrate = Number(rate.dataset.vrate);
      saveData(); schedulePush(); V.rate(pracStore().vrate); vidPaint();
      return;
    }
    const edge = e.target.closest("[data-vedge]");
    if (edge) { vidEdge(edge.dataset.vedge, Number(edge.dataset.vstep)); return; }
    const setv = e.target.closest("[data-vset]");
    if (setv) { vidAsk(setv.dataset.vset); return; }
    if (!b) return;

    // приближение по кругу: 1 → 2 → 3 → снова 1
    if (b.dataset.vd === "zoom") { vidZoom(box, (pracStore().vzoom || 1) >= 3 ? -99 : 1); return; }
    if (b.dataset.vd === "back") { V.seek(vidSel(V.dur()).a); vidPaint(); return; }

    if (b.dataset.vd === "link") {
      const raw = ((box.querySelector("#vdUrl") || {}).value || "").trim();
      /* И страница «поделиться», и прямая ссылка на хранилище идут одним путём:
         обе временные, поэтому по ним забирается файл, а не играется поток. */
      const ya = /disk\.yandex\.[a-z]+\/|storage\.yandex\.net|\/rdisk\//i.test(raw) ? raw : "";
      const vk = !ya && /vk(?:video)?\.(?:com|ru)|video_ext\.php/.test(raw) ? vkParse(raw) : null;
      const yt = (ya || vk) ? null : ytId(raw);
      // не узнали площадку — считаем, что это прямая ссылка на файл
      const direct = (!ya && !vk && !yt && /^https?:\/\/\S+$/i.test(raw)) ? dbxUrl(raw) : "";
      if (!ya && !vk && !yt && !direct) { toast("Не разобрал ссылку"); return; }
      const st = pracStore();
      delete st.yt; delete st.vk; delete st.url; delete st.ya;
      if (ya) st.ya = ya; else if (vk) st.vk = vk; else if (yt) st.yt = yt; else st.url = direct;
      await videoDrop(piece().id);          // файл и ссылка одновременно ни к чему
      videoUrls.set(piece().id, "");
      saveData(); schedulePush();
      box.dataset.mode = ""; pracVideo(prac && prac.cur);
      return;
    }

    if (b.dataset.vd === "pick") {
      const inp = box.querySelector('input[type="file"]');
      inp.onchange = async () => {
        const f = inp.files && inp.files[0];
        if (!f || vidBusy) return;
        vidBusy = true;
        try {
          toast("Сохраняю видео…");
          await videoSave(piece().id, f);
          /* Ссылку на Диск или файл НЕ стираем: она — запасной источник.
             Хранилище на телефоне не вечное (переустановка, чистка, само
             выселение) — и раньше вместе с ним пропадал и путь к ролику,
             приходилось выбирать файл заново. Теперь местная копия главнее,
             а ссылка молча выручает, когда копии не стало. Стираем только
             плееры: у ютуба и ВК файла нет. */
          delete pracStore().yt; delete pracStore().vk;
          saveData(); schedulePush();
          box.dataset.mode = ""; pracVideo(prac && prac.cur);
          toast("Готово — больше выбирать не придётся");
        } catch { toast("Не поместилось — освободи место"); }
        finally { vidBusy = false; }
      };
      inp.click();
      return;
    }

    if (b.dataset.vd === "src") {
      // спрашивать не о чем: разметка по тактам остаётся, файл при желании вернут
      delete pracStore().yt; delete pracStore().vk; delete pracStore().url; delete pracStore().ya;
      yaHref.clear();                 // ссылки Диска временные, держать их незачем
      await videoDrop(piece().id);
      videoUrls.set(piece().id, "");
      saveData(); schedulePush();
      clearInterval(vidTimer); ytPlayer = null; vkPlayer = null; pracVidEl = null; vidKind = "";
      box.dataset.mode = ""; pracVideo(prac && prac.cur);
      return;
    }

    if (!V.ready()) return;

    if (b.dataset.vd === "play") {
      if (V.paused()) {
        const sel = vidSel(V.dur());
        const t = V.now();
        if (t < sel.a || t >= sel.b - 0.15) V.seek(sel.a);
        V.play(); vidTick();
      } else V.pause();
      vidPaint();
    } else if (b.dataset.vd === "full") {
      vidFull(!box.classList.contains("full"));
    } else if (b.dataset.vd === "bind") {
      const u = prac && prac.cur;
      if (!u) { toast("Сейчас нет текущего задания"); return; }
      const sel = vidSel(V.dur());
      const list = vmarks().filter((m) => !(m.from === u.from && m.to === u.to));
      list.push({ from: u.from, to: u.to, a: sel.a, b: sel.b });
      pracStore().vmarks = list.sort((x, y) => x.from - y.from);
      saveData(); schedulePush();
      toast(`Кусок запомнен за тактами ${u.from}–${u.to}`);
    } else if (b.dataset.vd === "all") {
      pracStore().vloop = null;
      saveData(); schedulePush(); vidPaint();
    }
  });

  $("#pracPlayer").addEventListener("click", (e) => {
    const retry = e.target.closest('[data-pl="retry"]');
    if (retry) {
      const id = piece().id;
      audioFail.delete(id); audioUrls.delete(id);
      plWait(); pullAudio(id);
      return;
    }
    if (!pracAudioEl) return;
    const b = e.target.closest("[data-pl]");
    if (b && b.dataset.pl === "fold") {
      const st = pracStore();
      st.plOpen = !st.plOpen;
      saveData(); schedulePush();
      $("#pracPlayer").classList.toggle("folded", !st.plOpen);
      const lbl = $("#pracPlayer .pl-fold i");
      if (lbl) lbl.textContent = st.plOpen ? "свернуть" : "развернуть";
      if (st.plOpen) plPaint();
      return;
    }
    if (b) {
      if (b.dataset.pl === "reset") { plResetSpan(); return; }
      if (b.dataset.pl === "replay") {
        /* Переслушать место заново — одно нажатие. Раньше приходилось попадать
           пальцем в начало дорожки: на телефоне это лотерея. */
        const sel = plSel(pracAudioEl.dataset.for, pracAudioEl.duration || 0);
        try { pracAudioEl.currentTime = sel.a; } catch {}
        pracAudioEl.play().catch(() => {});
        plPaint();
        return;
      }
      if (b.dataset.pl === "play") {
        if (pracAudioEl.paused) {
          const sel = plSel(pracAudioEl.dataset.for, pracAudioEl.duration || 0);
          if (pracAudioEl.currentTime < sel.a || pracAudioEl.currentTime >= sel.b - 0.05)
            try { pracAudioEl.currentTime = sel.a; } catch {}
          pracAudioEl.play().catch(() => {});
        } else pracAudioEl.pause();
      } else {
        // снова весь трек, но скорость, увеличение и шаг остаются как были
        const o = plOpt(pracAudioEl.dataset.for);
        delete o.a; delete o.b;
        pracSaveLoops();
        plPaint();
      }
      return;
    }

    const id = pracAudioEl.dataset.for;
    const rate = e.target.closest("[data-rate]");
    if (rate) { plOpt(id).rate = Number(rate.dataset.rate); pracSaveLoops(); plApplyRate(); plPaint(); return; }
    const grid = e.target.closest("[data-grid]");
    if (grid) { plOpt(id).grid = Number(grid.dataset.grid); pracSaveLoops(); plPaint(); return; }
    const edge = e.target.closest("[data-edge]");
    if (edge) { plEdge(edge.dataset.edge, edge.dataset.step === "+" ? 1 : -1); return; }
    const set = e.target.closest("[data-set]");
    if (set) { plAsk(set.dataset.set); return; }
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
    // подробности по такту — нажатием на его кружок
    const bar = e.target.closest("[data-barinfo]");
    if (bar) { toast(bar.dataset.barinfo); return; }

    const b = e.target.closest("button");
    if (!b || !prac) return;

    /* Занятие со страницы задания: встаём на его первый шаг и, если надо,
       показываем подготовку. */
    if (b.dataset.term !== undefined) {
      termOpen(b.dataset.term);
      return;
    }
    if (b.dataset.lspic !== undefined) {
      picOpen(coverSrc(b.dataset.lspic, ""));
      return;
    }
    if (b.dataset.lblock !== undefined) {
      const с = +b.dataset.lblock;
      prac.at = { i: prac.at.i, phase: "step", step: с };
      const бл = blockOfStep(prac.at.i, с);
      prac.screen = lessonPrep(prac.at.i, бл).надо ? "prep" : "work";
      prac.stepAt = Date.now();
      return pracRender();
    }

    /* Занятие из сетки: открываем его страницу, а не бросаем сразу в шаг. */
    if (b.dataset.lgo !== undefined) {
      const n = +b.dataset.lgo, steps = lessonSteps(n) || [];
      if (courseWatch()) {
        prac.at = { i: n, phase: "watch", step: 0 };
        prac.screen = "watch";
        prac.pickOpen = false; prac.listOpen = false;
        return pracRender();
      }
      if (!steps.length) { toast("В этом занятии пока нет шагов"); return; }
      let at0 = steps.findIndex((_, m) => !lessonDone(n, "s" + m));
      prac.at = { i: n, phase: "step", step: at0 < 0 ? 0 : at0 };
      /* Раньше здесь стоял экран с описанием занятия. Он был лишней
         остановкой: между «хочу заниматься» и шагом ничего не нужно. */
      const бл0 = blockOfStep(n, prac.at.step);
      prac.screen = lessonPrep(n, бл0).надо ? "prep" : "work";
      prac.pickOpen = false; prac.listOpen = false;
      return pracRender();
    }
    if (b.dataset.lpick !== undefined) {
      const n = +b.dataset.lpick, steps = lessonSteps(n) || [];
      if (!steps.length) { toast("\u0412 \u044d\u0442\u043e\u043c \u0443\u0440\u043e\u043a\u0435 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442 \u0448\u0430\u0433\u043e\u0432"); return; }
      /* Начинаем урок с первого непройденного шага, а не с нуля. */
      let at0 = steps.findIndex((_, m) => !lessonDone(n, "s" + m));
      prac.at = { i: n, phase: "step", step: at0 < 0 ? 0 : at0 };
      prac.pickOpen = false; prac.listOpen = false;
      return pracRender();
    }
    if (b.dataset.lstep !== undefined) {
      prac.at = { i: prac.at.i, phase: "step", step: +b.dataset.lstep };
      prac.listOpen = false;
      return pracRender();
    }
    if (b.dataset.les) {
      const at = prac.at;
      const st = lessonStore();
      const sec = prac.stepAt ? Math.round((Date.now() - prac.stepAt) / 1000) : 0;

      const stepSec = () => prac.taskAt ? Math.round((Date.now() - prac.taskAt) / 1000) : 0;

      switch (b.dataset.les) {
        case "stepOk": {
          const steps = lessonSteps(at.i) || [];
          st.done["L" + at.i + ":s" + at.step] = todayStr();
          /* Урок засчитывается пройденным только когда закрыты ВСЕ его шаги —
             иначе награда за урок прилетала бы с первого же шага. Время и
             подход считаются всегда. */
          const all = steps.length && steps.every((_, n) => lessonDone(at.i, "s" + n));
          if (all) lessonMark(at.i); else { lessonCount(); saveData(); }
          prac.taskAt = Date.now();
          const бл = blockOfStep(at.i, at.step);
          if (at.step + 1 < steps.length) prac.at = { i: at.i, phase: "step", step: at.step + 1 };
          else prac.at = lessonNext();
          /* Занятие кончилось — останавливаемся и говорим об этом. Без этой
             остановки шаги идут сплошняком, конца не видно, и всё превращается
             в задание. Останавливаемся и на границе урока тоже.
             У материала с одним занятием остановки нет: там не занятия, а один
             процесс, и «можно встать» посреди него только сбивает. */
          if (!plainCourse() && бл && at.step >= бл.to && prac.at) {
            prac.lastBlock = бл;
            prac.screen = "blockDone";
          }
          break;
        }
        case "stepBack":
          /* Назад по лестнице без потери: пройденный шаг не сбрасываем,
             просто возвращаемся на него — перечитать или переделать. */
          prac.at = { i: at.i, phase: "step", step: Math.max(0, at.step - 1) };
          break;
        case "stepFwd": {
          /* Вперёд без отметки: шаг можно посмотреть и вернуться. Отметку
             ставит только большая кнопка. */
          const steps = lessonSteps(at.i) || [];
          prac.at = { i: at.i, phase: "step", step: Math.min(steps.length - 1, at.step + 1) };
          break;
        }
        case "prepOk":
          prac.screen = "work";
          prac.stepAt = Date.now();
          break;
        case "toPick":
          prac.screen = "pick";
          break;
        case "introGo": {
          /* С занятия идём в подготовку, а если доставать нечего — сразу к шагам. */
          const бл = blockOfStep(at.i, at.step || 0);
          prac.screen = lessonPrep(at.i, бл).надо ? "prep" : "work";
          prac.stepAt = Date.now();
          break;
        }
        case "blockNext": {
          /* Следующее занятие может потребовать другого — уголь сменился
             карандашом, добавился чёрный. Подготовку показываем заново только
             когда впереди снова рисование, иначе просто идём дальше. */
          const сл = prac.at && blockOfStep(prac.at.i, prac.at.step || 0);
          prac.screen = (!plainCourse() && сл && сл.doing && (!prac.lastBlock || !prac.lastBlock.doing)) ? "prep" : "work";
          prac.lastBlock = null;
          prac.stepAt = Date.now();
          break;
        }
        case "stepList": prac.listOpen = !prac.listOpen; prac.pickOpen = false; break;
        case "stepPick": prac.screen = "pick"; prac.listOpen = false; prac.pickOpen = false; break;
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

    /* Отметка захода: три кнопки вместо одной. Уровень — не оценка себе, а
       то, чем меряется готовность блока к сшивке. */
    if (b.dataset.lvl) {
      const u = prac.cur;
      if (!u) return;
      const lvl = Number(b.dataset.lvl);
      prac.startedAt = prac.startedAt || Date.now();
      const sec = prac.unitAt ? Math.round((Date.now() - prac.unitAt) / 1000) : 0;
      /* Рука шага: у чтения и игры по ключу своя, у сшивки — те, что звучат. */
      const рука = STEP_HAND[u.step] || pracHands(u);
      pracNote({ from: u.from, to: u.to, size: u.to - u.from + 1, hand: рука }, sec);
      repAdd(u, lvl);
      /* Прочитанное в запись дня отрезком не идёт: сыграно ничего не было.
         Время при этом считается — разбор глазами тоже занятие. */
      const чтение = u.step === "readR" || u.step === "readL";
      let added = 0;
      if (!чтение) {
        prac.closed.push({ from: u.from, to: u.to });
        added = pracLog({ from: u.from, to: u.to, hand: рука });
      } else pracCount();
      prac.undo = { u, added };
      saveData();
      schedulePush();
      return pracNext();
    }

    switch (b.dataset.prac) {
      case "begin": {
        /* Запись заведётся на первом закрытом отрезке. Нажал «Начать» и вышел —
           занятия не было. */
        prac.startedAt = prac.startedAt || Date.now();
        prac.counted = 0;
        return pracNext();
      }
      case "again": {
        /* Сшивка не идёт — возвращаемся к тактам блока и проходим их ещё раз.
           Ничего не сбрасывается: к цели каждого шага просто прибавляется по
           три захода, и путь честно удлиняется. */
        const w3 = pracWhere();
        if (!w3.bl) return;
        extraAdd(w3.bl);
        saveData();
        schedulePush();
        toast("Ещё круг по тактам " + w3.bl.from + "–" + w3.bl.to);
        return pracNext();
      }
      case "hint": prac.hintOpen = !prac.hintOpen; return pracRender();
      case "list": prac.listOpen = !prac.listOpen; return pracRender();
      case "listClose": prac.listOpen = false; return pracRender();

      case "undo": {
        /* Промахнулся по кнопке — снимаем последний заход и убираем его след
           из сегодняшней записи. */
        const un = prac.undo;
        if (!un) return;
        repDrop(un.u);
        const e = pracEntry(false);
        if (e && un.added) { e.spans.splice(-un.added, un.added); e.updatedAt = now(); }
        /* Отменяем чтение — из списка сыгранного вынимать нечего: оно туда и
           не попадало. Раньше отмена чтения съедала чужой заход, и итог
           занятия оказывался меньше, чем было на самом деле. */
        if (un.added) prac.closed.pop();
        prac.undo = null;
        saveData();
        schedulePush();
        toast("Возвращено");
        return pracNext();
      }
      case "reset":
        if (!confirm("Забыть все заходы по этой пьесе и начать с первого такта?\n\nЗаписи занятий останутся.")) return;
        data.practice[piece().id] = { reps: {}, final: {}, session: pracStore().session, at: now() };
        saveData(); schedulePush();
        return pracNext();

      case "finish": return pracFinish();
    }
  });
}


/* Словарь интерфейса: тема-мир может переписать формулировки под себя */
const WORDS_BASE = {
  tabHome: "Главная", tabProgress: "Прогресс", tabAch: "Достижения", tabNotes: "Заметки", tabDiary: "Дневник", tabWish: "Захотелось",
  tabMus: "Артефакты",
  ctaPiano: "🎹 Начать занятие", ctaBook: "📖 Отметить чтение", ctaPastel: "🎨 Отметить урок", ctaDraw: "🎨 Отметить рисование",
  ctaWatch: "🎬 Отметить просмотр", ctaLesson: "🎨 Посмотреть занятие",
  ctaLessonGo: "🎨 Начать занятие", ctaLessonSeen: "🎬 Отметить просмотр",
  ctaDone: "✅ Сегодня отмечено", ctaAdd: "дополнить", ctaAgain: "ещё занятие",
  streak: "серия",
  segAch: "✦ Достижения", segFacts: "💡 Знания"
};
/* Тем оформления больше нет: значки и слова у приложения одни. */
const ICON = (k, def) => def;
const T = (k) => WORDS_BASE[k];






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
  useMark("полка");
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

function openSheet(html, full) {
  const sheet = $("#sheet");
  /* Обычная шторка живёт снизу и не закрывает экран. Но там, где сидишь
     подолгу — комментарии к главе, — половина экрана только мешает: текст
     идёт узкой лентой и всё время прокручивается. Такую разворачиваем во
     весь рост. */
  sheet.classList.toggle("full", !!full);
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
  sheet.classList.remove("full");
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
  if (isCourse() && plainDraw()) { pickDrawDone = false; drawSince = now(); }
  syncPickers();
  const existing = entryFor(selectedDate);
  const title = existing ? "Дополнить запись" : (isBook() ? "Что прочитал?" : isWatch() ? (video().done ? "Пересмотрел?" : "Отметить просмотр") : isCourse() ? (plainDraw() ? "Рисовал сегодня" : "Какие уроки прошёл?") : "Что разбирал?");
  /* «Сегодня» подписывать незачем: отмечают почти всегда сегодняшний день, и
     строка только отодвигала главное. Дата остаётся, когда она другая, и
     остаётся предупреждение, что запись за этот день уже есть. */
  const день = selectedDate === todayStr() ? "" : fmtDay(selectedDate);
  const sub = [день, existing ? "запись уже есть" : ""].filter(Boolean).join(" · ");

  /* Две кнопки для нейросети живут не в теле шторки, а под точками в углу:
     в теле они спорили с главным делом — отметить страницу. */
  const меню = isBook() && (book().chapters || []).length > 0;
  openSheet(`
    <h3>${title}</h3>
    ${sub ? `<p class="sub">${sub}</p>` : ""}
    <div id="sheetBody"></div>
    <div class="sheet-actions${меню ? " with-more" : ""}">
      <button class="btn gold" id="sheetSave" type="button">Подтвердить</button>
      ${меню ? `
      <div class="mini-menu">
        <button class="btn mm-btn" id="aiMenu" type="button" aria-label="Ещё" aria-expanded="false"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="4" cy="10" r="1.7"/><circle cx="10" cy="10" r="1.7"/><circle cx="16" cy="10" r="1.7"/></svg></button>
        <div class="mm-pop" id="aiPop" hidden>
          <button class="mm-item" id="askCopy" type="button">Промт для ИИ</button>
          ${hasBookFile() ? `<button class="mm-item" id="bookFile" type="button">Книга .md</button>` : ""}
        </div>
      </div>` : ""}
    </div>`);

  renderSheetBody();
  /* Отмену убрали: шторку закрывают протяжкой вниз или касанием мимо неё,
     а место в ряду отдано точкам. */
  $("#sheetSave").addEventListener("click", saveEntry);
  if (меню) bindAiMenu();
}

/* Меню живёт в шапке, а не в теле: тело перерисовывается на каждое нажатие
   степпера, и обработчики пришлось бы вешать заново каждый раз. */
function bindAiMenu() {
  const кнопка = $("#aiMenu"), поп = $("#aiPop");
  if (!кнопка || !поп) return;
  const закрыть = () => { поп.hidden = true; кнопка.setAttribute("aria-expanded", "false"); };
  кнопка.addEventListener("click", (e) => {
    e.stopPropagation();
    поп.hidden = !поп.hidden;
    кнопка.setAttribute("aria-expanded", поп.hidden ? "false" : "true");
  });
  /* Мимо меню — закрыть. Слушаем на самой шторке, а не на документе: иначе
     обработчик пережил бы её и остался висеть до конца сессии. */
  $("#sheet").addEventListener("click", (e) => {
    if (!поп.hidden && !поп.contains(e.target) && e.target !== кнопка) закрыть();
  });
  const ac = $("#askCopy");
  if (ac) ac.addEventListener("click", () => {
    const главы = book().chapters || [];
    const i = Math.max(0, главы.indexOf(chapterAt(pickPage)));
    copyRaw(askText(book(), i)).then((ok) => btnSay(ac, ok ? "✓ Скопировано" : "Не вышло"));
  });
  const bf = $("#bookFile");
  if (bf) bf.addEventListener("click", () => giveBookFile(book(), bf));
}

function renderSheetBody() {
  const parts = isBook() && bookMode(book()) === "parts";
  $("#sheetBody").innerHTML = parts ? bookPartsUI()
    : isBook() ? bookSheetUI() : isWatch() ? watchSheetUI() : isCourse() ? pastelSheetUI() : pianoSheetUI();
  if (parts) bindBookPartsSheet();
  else if (isBook()) bindBookSheet();
  else if (isWatch()) { /* выбирать нечего: у ролика одно состояние */ }
  else if (isCourse()) { if (plainDraw()) bindDrawSheet(); else bindPastelSheet(); }
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
  if (plainDraw()) return drawSheetUI();
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

/* Простая отметка рисования. Выбирать нечего: нажал — значит сегодня рисовал.
   Снимок кладётся сразу, не дожидаясь «Подтвердить»: он и сам по себе ценен,
   а если передумать отмечать — снимок всё равно нужен. */
function drawSheetUI() {
  const снимки = takesFor(curKey()).filter((t) => t.kind === "photo");
  const сегодня = снимки.filter((t) => dateStr(new Date(t.at)) === selectedDate);
  const готов = !!course().done;
  return `
    <div class="dw">
      <button class="qbtn dw-cam" id="dwCam" type="button">📷 Сфотографировать лист</button>
      ${сегодня.length ? `<div class="dw-shots">${сегодня.map((t) => `
        <figure class="dw-sh" data-shot="${esc(t.id)}">
          ${takeUrls.get(t.id) ? `<img src="${esc(takeUrls.get(t.id))}" alt="" loading="lazy">` : `<i>🖼</i>`}
        </figure>`).join("")}</div>` : ""}
      <div class="lesson-hint">${сегодня.length
        ? `Сегодня ${сегодня.length} ${plural(сегодня.length, "снимок", "снимка", "снимков")} · всего ${снимки.length}`
        : снимки.length ? `Всего снимков: ${снимки.length}` : "Снимок не обязателен — можно просто отметить день"}</div>
      <button class="qbtn fin ${pickDrawDone ? "on" : ""}" id="dwFin" type="button">
        ${готов ? "✓ Рисунок уже завершён" : pickDrawDone ? "✓ Рисунок завершён" : "Рисунок завершён"}
      </button>
    </div>`;
}

function bindDrawSheet() {
  const cam = $("#dwCam");
  if (cam) cam.addEventListener("click", async () => {
    const f = await pickPhoto();
    if (!f) return;
    cam.disabled = true; cam.textContent = "Готовлю снимок…";
    try {
      await saveTake(await shrinkPhoto(f), 0, "photo");
      renderSheetBody();
    } catch { toast("Не получилось прочитать снимок"); cam.disabled = false; }
  });
  const fin = $("#dwFin");
  if (fin && !course().done) fin.addEventListener("click", () => { pickDrawDone = !pickDrawDone; renderSheetBody(); });
  document.querySelectorAll("#sheetBody [data-shot]").forEach((el) =>
    el.addEventListener("click", () => openShotSheet(el.dataset.shot)));
}


/* Завершение рисунка живёт на самом курсе, как «прочитана» у книги: это
   решение, а не накопленный процент. Снять его можно тем же «Начать заново». */
function markDraw(existing) {
  if (existing) existing.courseId = existing.courseId || course().id;
  if (!pickDrawDone) return;
  const c = course();
  if (!c.done) { c.done = true; c.doneAt = now(); c.updatedAt = now(); }
  if (existing) existing.drawDone = true;
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
    <div class="quick">${[5, 10, 20, 50].map(n => `<button class="qbtn" data-add="${n}" type="button">+${n}</button>`).join("")}
      ${pickDone
        ? `<button class="qbtn fin on" data-fin="0" type="button">✓ Завершена — уйдёт в библиотеку</button>`
        : `<button class="qbtn fin" data-fin="1" type="button">Завершить книгу</button>`}</div>
    <div style="margin-top:12px;font-size:0.85rem;color:var(--muted)">Это глава: <b style="color:var(--ink)">${esc(chapterAt(pickPage).name)}</b></div>
`;
}

function bindBookSheet() {
  const pages = book().pages;
  /* Отматывать назад можно свободно: перечитывать, возвращаться к месту,
     поправлять промах — дело обычное. Ограничение здесь было лишним. */
  document.querySelectorAll(".st-btn").forEach(b =>
    b.addEventListener("click", () => { pickPage = Math.min(pages, Math.max(0, pickPage + Number(b.dataset.d))); renderSheetBody(); }));
  document.querySelectorAll(".qbtn[data-add]").forEach(b =>
    b.addEventListener("click", () => { pickPage = Math.min(pages, pickPage + Number(b.dataset.add)); renderSheetBody(); }));
  /* Завершение — решение, а не страница. Отметил, докуда дошёл, и закрыл
     книгу: хоть на половине, хоть на последней странице. Прогресс остаётся
     тем, какой есть — врать про «100%» из-за закрытия книги незачем. */
  document.querySelectorAll(".qbtn[data-fin]").forEach(b =>
    b.addEventListener("click", () => { pickDone = b.dataset.fin === "1"; renderSheetBody(); }));
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
      ${[["right", "𝄞 Скрипичный"], ["left", "𝄢 Басовый"], ["both", "🤲 Оба"]].map(([h, l]) =>
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
  useMark("кубик");
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
        // только оболочка: видео, звук и записи обновления не касаются
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => /^keiko-v\d/.test(k)).map(k => caches.delete(k)));
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
    data.gut = mergeLists(data.gut || [], d.gut || []);
    data.archive = mergeLists(data.archive || [], d.archive || []);
      data.practice = mergePrac(data.practice, d.practice); pracStamp(false);

    // материалы, которых у нас нет, тоже возвращаем
    for (const p of (d.piano.pieces || [])) if (!data.piano.pieces.some(x => x.id === p.id)) data.piano.pieces.push(p);
    for (const b of ((d.book && d.book.books) || [])) if (!data.book.books.some(x => x.id === b.id)) data.book.books.push(b);
    // курсы — такие же определения материалов: без этой строки копия их теряла
    data.pastel.courses = mergeLists(data.pastel.courses || [], (d.pastel && d.pastel.courses) || []);

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
/* Иллюстрации к статьям лежат в каталоге отдельными файлами и кладутся в тот
   же кэш, что обложки: один раз скачал — дальше работает без сети. */
const CAT_ART_FILE = (key) => `art-${key}.txt`;
const CAT_ARTS_FILE = (key) => `article-${key}.json`;
const artsPulling = new Set();

/* Разбор материала — отдельный файл в каталожном гисте. Тянем его по требованию:
   открыл раздел разборов — спросили. Пришло — кладём на устройство и говорим
   вызвавшему, что содержимое обновилось. */
/* Прямая ссылка на файл гиста, без ревизии в адресе: всегда отдаёт свежее.
   Это один запрос вместо описи всего гиста — и он проходит там, где тяжёлая
   опись срывается по таймауту. Опись каталога с обложками и звуком весит
   мегабайт, и с ростом гиста ею стало дорого пользоваться ради одного файла. */
const rawURL = (name) => (cfg.catalogOwner && cfg.catalogId)
  ? `https://gist.githubusercontent.com/${encodeURIComponent(cfg.catalogOwner)}/${cfg.catalogId}/raw/${name}`
  : "";
async function catRaw(name, ms) {
  const url = rawURL(name);
  if (!url) return null;
  try {
    const r = await withTimeout(fetch(url, { cache: "no-store" }), ms || 25000);
    return r.ok ? await r.text() : null;
  } catch { return null; }
}
const artsURL = (id) => rawURL(CAT_ARTS_FILE(id));

/* ── Музей артефактов ──
   Вещи из музеев, привязанные к книгам: что по прочитанному можно пойти и
   увидеть вживую. Лежат одним файлом на все книги, а не по файлу на книгу,
   как разборы: список общий, и фильтр по книгам должен работать без того,
   чтобы тянуть разбор каждой. */
const MUS_FILE = "museum.json";
const LS_MUS = "keiko-museum";
let MUSEUM = null, musPulling = false;
try { MUSEUM = JSON.parse(localStorage.getItem(LS_MUS) || "null"); } catch {}
/* Скрытый предмет не показываем и не открываем: он остаётся в файле, но
   выходит из игры, пока материал перекраивают. */
/* Снятый предмет не показываем и не открываем. Пометку deleted раньше здесь
   не смотрели вовсе — убранные из описи вещи оставались на экране навсегда. */
const musItems = () => (MUSEUM && Array.isArray(MUSEUM.items))
  ? MUSEUM.items.filter((x) => !x.hidden && !x.deleted) : [];

async function pullMuseum() {
  if (musPulling) return false;
  musPulling = true;
  try {
    const url = rawURL(MUS_FILE);
    if (!url) return false;
    const r = await withTimeout(fetch(url, { cache: "no-store" }), 30000);
    if (!r.ok) return false;
    const pack = JSON.parse(await r.text());
    if (!pack || !Array.isArray(pack.items)) return false;
    const было = JSON.stringify(MUSEUM);
    MUSEUM = pack;
    try { localStorage.setItem(LS_MUS, JSON.stringify(pack)); } catch {}
    return было !== JSON.stringify(pack);
  } catch { return false; } finally { musPulling = false; }
}

let artsWhy = "";        // почему не приехало — показываем по кнопке в настройках

async function pullArts(id) {
  if (!id || artsPulling.has(id)) return false;
  artsPulling.add(id);
  artsWhy = "";
  const принять = (txt) => {
    const pack = JSON.parse(txt);
    if (!pack || typeof pack !== "object") throw new Error("файл разбора не разобрался");
    const было = JSON.stringify(ARTS[id] || null);
    ARTS[id] = pack;
    try { localStorage.setItem(LS_ART(id), JSON.stringify(pack)); } catch {}
    return было !== JSON.stringify(pack);
  };
  try {
    const url = artsURL(id);
    if (url) {
      try {
        const r = await withTimeout(fetch(url, { cache: "no-store" }), 30000);
        if (r.ok) return принять(await r.text());
        if (r.status === 404) { artsWhy = "разбора для этого материала в гисте нет"; return false; }
        artsWhy = "гист ответил " + r.status;
      } catch (e) { artsWhy = e.message || "нет связи"; }
    }
    // прямой ссылки нет или не сработала — идём длинным путём, через опись
    if (!cfg.token || !cfg.catalogId) { artsWhy = artsWhy || "гист не подключён"; return false; }
    const files = await catalogFiles(false);
    const txt = await catText(files, CAT_ARTS_FILE(id), 30000);
    if (!txt) { artsWhy = artsWhy || "файла разбора нет в описи гиста"; return false; }
    return принять(txt);
  } catch (e) {
    artsWhy = e.message || "не получилось";
    return false;
  } finally { artsPulling.delete(id); }
}
const artPulling = new Set();

/* Ключ хранения и имя файла — разные вещи. Карту в гисте можно заменить, не
   меняя имени файла, и тогда старая, уже лежащая на устройстве, осталась бы
   навсегда: точки поехали бы по чужой картинке. Поэтому в ключ входит версия
   из данных, а имя файла остаётся прежним. */
function artSrc(key, file) {
  if (!key) return "";
  const have = coverCache.get("art:" + key);
  if (have) return have;
  pullArt(key, file);
  return "";
}

async function pullArt(key, file) {
  if ((!cfg.catalogOwner && !cfg.token) || !cfg.catalogId || artPulling.has(key)) return;
  if (coverCache.get("art:" + key)) return;
  artPulling.add(key);
  try {
    const имя = file || CAT_ART_FILE(key);
    let txt = await catRaw(имя, 25000);
    if (!txt) {
      const files = await catalogFiles(false);
      txt = await catText(files, имя, 25000);
    }
    if (!txt) return;
    txt = txt.trim();
    if (!txt.startsWith("data:")) return;
    await coverSave("art:" + key, txt);
    coversArrived();
  } catch {} finally { artPulling.delete(key); }
}
/* Каталог сверяем часто, а не раз в сутки: у него свой условный запрос по
   метке, и когда ничего не менялось, ответ приходит пустым — это дёшево.
   Сутки же означали, что исправленная карточка или новая обложка доезжали до
   телефона к следующему дню, а до тех пор приложение показывало старое и
   выглядело сломанным. */
const CAT_EVERY = 5 * 60e3;

async function ensureCatalogGist(create) {
  /* Раньше здесь стояла проверка «тот ли это гист» — ещё одно полное скачивание
     перед каждым настоящим. Проверять есть чем и так: опись всё равно будет
     прочитана, и если нужного файла в ней нет, адрес сбросится там же. */
  if (cfg.catalogId) return cfg.catalogId;
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

/* Опись каталожного гиста — одна на сессию.
   Раньше за ней ходили четверо: обложки, звук, огибающие и сам каталог, —
   и каждый тянул гист целиком. А ответ GitHub несёт содержимое всех файлов
   разом: обложки лежат там же и приезжают инлайном, даже когда нужен один
   звук. Теперь опись берётся один раз, дальше — условным запросом, и на 304
   не приходит ничего. Содержимое файла чаще всего уже в ней, а что не влезло
   (оно помечено truncated) — докачиваем по своей ссылке. */
let catFiles = null, catEtag = "";

/* Опись просят все сразу: каждая обложка, каждый звук. Пока она не приехала,
   catFiles пуст — и каждый спросивший заводил свой запрос. Пять материалов на
   главной означали пять полных скачиваний каталога разом, и все они мешали
   друг другу. Теперь запрос один, а ждут его все. */
let catFlight = null;

function catalogFiles(force) {
  if (catFiles && !force) return Promise.resolve(catFiles);
  if (catFlight) return catFlight;
  catFlight = catalogFetch(force).finally(() => { catFlight = null; });
  return catFlight;
}

async function catalogFetch(force) {
  if (catFiles && !force) return catFiles;
  if (!cfg.token) return null;
  const id = await ensureCatalogGist(false);
  if (!id) return null;
  const cond = catEtag && catFiles ? { headers: { "If-None-Match": catEtag } } : {};
  /* Опись каталога тяжёлая: обложки лежат в ней содержимым. На мобильной сети
     двенадцати секунд не хватало, запрос срывался по таймауту — и звук с
     обложками «то грузится, то нет» ровно по погоде на канале. */
  const r = await gh("/gists/" + id, cond, 45000);
  if (r.status === 304) return catFiles;
  if (!r.ok) return catFiles;                       // связи нет — работаем тем, что было
  const пакет = await r.json();
  const files = пакет.files || {};
  /* Имя владельца нужно, чтобы читать файлы прямой ссылкой, без описи: опись
     весит мегабайт и на мобильной сети рвётся, а один файл — сотни килобайт. */
  if (пакет.owner && пакет.owner.login && cfg.catalogOwner !== пакет.owner.login) {
    cfg.catalogOwner = пакет.owner.login; saveCfg();
  }
  if (!files[CAT_FILE]) {
    // адрес указывает не туда — забываем его и ищем каталог заново
    cfg.catalogId = ""; saveCfg();
    catFiles = null; catEtag = "";
    const again = await ensureCatalogGist(false);
    if (!again) return null;
    const r2 = await gh("/gists/" + again, {}, 45000);
    if (!r2.ok) return null;
    catEtag = r2.headers.get("etag") || "";
    catFiles = (await r2.json()).files || {};
    return catFiles;
  }
  catEtag = r.headers.get("etag") || "";
  catFiles = files;
  return catFiles;
}

/* Содержимое одного файла описи. Большое приезжает по raw_url — в ссылке
   зашита ревизия, поэтому она неизменяемая и её не жалко кэшировать. */
async function catText(files, name, ms) {
  const f = files && files[name];
  if (!f) return null;
  if (!f.truncated) return f.content;
  if (!f.raw_url) return null;
  return await (await withTimeout(fetch(f.raw_url), ms || 20000)).text();
}

/* Есть ли материал, которого нет в кэше каталога. Каталог сверяется раз в
   сутки, и добавленная сегодня книга приезжала бы к завтрашнему дню: без
   записи в каталоге у неё нет ни обложки, ни наград, ни карточек — выглядит
   как поломка. Увидели незнакомый материал — тянем каталог сразу. */
function catalogMissing() {
  const keys = [];
  for (const b of (data.book.books || [])) if (!b.archived) keys.push(b.id);
  for (const p of (data.piano.pieces || [])) if (!p.archived) keys.push(p.id);
  /* Раньше здесь стоял единственный курс, и новый материал каталог не тянул:
     без записи в описи у него нет ни обложки, ни наград — выглядит поломкой.
     Именно из-за этой строки обложка «Аргоса» не приезжала. */
  for (const c of courses()) if ((c.lessons || []).length) keys.push(keyOfCourse(c));
  return keys.some((k) => k && !CATALOG[k]);
}

async function catalogPull(force) {
  if (!cfg.token) return;
  if (!force && now() - (cfg.catalogAt || 0) < CAT_EVERY) return;
  const files = await catalogFiles(true);
  if (!files) throw new Error("каталог недоступен");
  const f = files[CAT_FILE];
  if (!f) return;
  const txt = await catText(files, CAT_FILE);
  const n = applyCatalog(JSON.parse(txt));
  await applyPractice(files);
  return n;
}

/* Разбор пьес из того же гиста. Раньше функция читала ещё taxonomy и categories
   для карты знаний — карта уехала в attic/karta-znaniy.md, файлы в гисте целы. */
async function applyPractice(files) {
  try {
    const readFile = async (name) => {
      const t = await catText(files, name);
      return t ? JSON.parse(t) : null;
    };
    syncBookBtns();      // каталог принёс флаг «разбор есть» — кнопки могли измениться
    const prac = await readFile(PRAC_FILE);
    if (prac && typeof prac === "object") {
      PRACTICE_DATA = prac;
      localStorage.setItem(LS_PRAC, JSON.stringify(prac));
    }
  } catch {}
}

// обложки качаем по одной и только когда материал реально показан
const coverPulling = new Set();
/* Очередь по одной: обложки идут не толпой, а по порядку, и первой — та,
   что сейчас на главной. Раньше порядок задавался разметкой, то есть
   случайностью: активная книга стоит в середине ленты и ждала своей
   очереди наравне со всеми. */
const coverQueue = [];
let coverBusy = false;

function coverAsk(id) {
  if (!id || coverPulling.has(id) || coverQueue.includes(id)) return;
  if (id === curKey()) coverQueue.unshift(id); else coverQueue.push(id);
  coverPump();
}

async function coverPump() {
  if (coverBusy) return;
  coverBusy = true;
  try {
    while (coverQueue.length) {
      /* Активная могла смениться, пока шла очередь: каждый раз выбираем заново.
         И материала может уже не быть вовсе — очередь живёт дольше, чем список,
         и падать из-за этого ей незачем. */
      let активный = "";
      try { активный = curKey(); } catch { активный = ""; }
      const at = Math.max(0, coverQueue.indexOf(активный));
      await pullCover(coverQueue.splice(at, 1)[0]);
    }
  } finally { coverBusy = false; }
}

async function pullCover(id) {
  if ((!cfg.catalogOwner && !cfg.token) || !cfg.catalogId || coverPulling.has(id)) return;
  coverPulling.add(id);
  try {
    let txt = await catRaw(CAT_COVER_FILE(id), 25000);
    if (!txt) {
      const files = await catalogFiles(false);
      txt = await catText(files, CAT_COVER_FILE(id), 25000);
    }
    if (!txt) return;
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
    // картинка шага приезжает уже после того, как шаг открыт: показываем её
    if (prac && prac.kind === "lesson") pracRender();
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
  catFiles = null; catEtag = "";        // опись устарела: только что сами её и переписали

  applyCatalog(cat);
  for (const [mid, uri] of Object.entries(covers)) {
    if (typeof uri === "string" && uri.startsWith("data:")) await coverSave(mid, uri).catch(() => {});
  }
  return Object.keys(cat.materials).length;
}

/* Как читается книга. Роман идёт подряд, сборник — вразнобой:
   там отмечают рассказы, а не «докуда дошёл». */
const bookMode = (b) => (b && b.mode === "parts") ? "parts" : "linear";

/* Процент книги считается от той части, которую читаешь в приложении. Книгу
   можно завести с середины — «Снег на траве» начат со 183-й страницы, — и
   тогда первые страницы не покроются никогда: потолок был 49%, сколько ни
   читай. Закрытая книга — сто процентов по определению: это решение, а не
   расчёт. */
function bookPct(b) {
  if (!b || !b.pages) return 0;
  if (b.done) return 100;
  const всего = Math.max(1, b.pages - (b.startPage || 0));
  return Math.min(100, Math.round(Math.min(b.pages, bookCovered(b)) / всего * 100));
}

// «3 августа — 21 августа»: когда книгу открыли и когда закрыли
function bookSpanDates(b) {
  const ent = bookEntriesOf(b.id).slice().sort((x, y) => x.date < y.date ? -1 : 1);
  if (!ent.length) return "";
  const с = fmtDay(ent[0].date);
  const по = b.done ? fmtDay(b.doneAt || ent[ent.length - 1].date) : fmtDay(ent[ent.length - 1].date);
  return с === по ? с : с + " — " + по;
}

/* ── Начать материал заново ──
   Снимаем только «сколько сделано»: отметки разбора, записи занятий и открытые
   награды. Сам материал, его разбор, обложка и отзыв остаются на месте.
   Записи убираем пометкой, а не вычёркиванием: выкинутую из списка запись
   другое устройство вернёт первой же синхронизацией — «нет записи» читается
   там как «ещё не доехала». */
function resetMaterial(kind, id) {
  const t = now();
  const похоронить = (список, годится) => {
    let n = 0;
    for (const e of список || []) if (!e.deleted && годится(e)) { e.deleted = true; e.updatedAt = t; n++; }
    return n;
  };
  const снятьНаграды = (ключ) => {
    for (const поле of ["achAt", "factAt"]) {
      const o = data[поле] || {};
      for (const k of Object.keys(o)) if (k.startsWith(ключ + ":")) delete o[k];
    }
    // артефакты помечены не ключом материала, а своим id — ищем по книге
    for (const x of MUSEUM || []) if (x && x.book === ключ) delete (data.musAt || {})[x.id];
  };

  let убрано = 0;
  if (kind === "pf") {
    delete (data.practice || {})[id];
    убрано = похоронить(data.piano.entries, (e) => (e.pieceId || "bwv853") === id);
    снятьНаграды(id);
  } else if (kind === "bk") {
    const b = (data.book.books || []).find((x) => x.id === id);
    if (b) { b.done = false; b.doneAt = ""; b.updatedAt = t; }
    убрано = похоронить(data.book.entries, (e) => (e.bookId || "snow-1") === id);
    снятьНаграды(id);
  } else if (kind === "wt") {
    const v = (data.watch.videos || []).find((x) => x.id === id);
    if (v) { v.done = false; v.doneAt = 0; v.updatedAt = t; }
    убрано = похоронить(data.watch.entries, (e) => (e.videoId || "") === id);
    снятьНаграды(id);
  } else if (kind === "ps") {
    const первый = firstCourseId();
    const c = courses().find((x) => x.id === id) || courses()[0] || {};
    /* Ключ и имя хранилища берём общими правилами, а не считаем здесь заново:
       разойдутся — «Начать заново» сотрёт не тот курс. */
    const ключ = keyOfCourse(c);
    delete (data.practice || {})[withMaterial({ track: "pastel", courseId: c.id }, pracCourseKey)];
    убрано = похоронить(data.pastel.entries, (e) => (e.courseId || первый) === c.id);
    снятьНаграды(ключ);
  }
  saveData(); schedulePush();
  return убрано;
}

/* ── Библиотека: все материалы, у каждого своя страница со всем, что известно ── */
function libraryUI() {
  useMark("библиотека");
  const books  = (data.book.books || []).filter(b => !b.archived);
  const pieces = (data.piano.pieces || []).filter(p => !p.archived);
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
    if (kind === "ps") return pastelPageUI(id || "");
    if (kind === "wt") { const v = videos().find(x => x.id === id); if (v) return watchPageUI(v); libBook = null; }
    libBook = null;
  }

  const row = (key, cover, fallback, title, sub, pct, meta, wide) => `
    <span class="lib-cell">
    <button class="lib-eye${matHidden(key) ? " off" : ""}" data-eye="${esc(key)}" type="button"
      aria-label="${matHidden(key) ? "Вернуть на главную" : "Убрать с главной"}"
      title="${matHidden(key) ? "не показывается на главной" : "показывается на главной"}">${matHidden(key) ? "🙈" : "👁"}</button>
    <button class="lib-row" data-lib="${esc(key)}" type="button">
      <span class="lib-cover ${wide ? "wide" : ""}">${cover ? `<img src="${esc(cover)}" alt="" loading="lazy">` : `<i>${fallback}</i>`}</span>
      <span class="lib-body">
        <b>${esc(title)}</b>
        <em>${esc(sub || "")}</em>
        <span class="lib-bar"><i style="width:${pct}%"></i></span>
        <span class="lib-meta">${meta}</span>
      </span>
      <span class="mc-go">›</span>
    </button>
    </span>`;

  const group = (name, rows) => rows.length
    ? `<div class="lib-group">${esc(name)}</div><div class="lib-list">${rows.join("")}</div>` : "";

  const bookRow = (b) => {
    const ent = bookEntriesOf(b.id);
    const cov = Math.min(b.pages || 0, bookCovered(b));
    const pct = bookPct(b);
    const когда = bookSpanDates(b);
    const meta = b.done
      ? `прочитана${когда ? " · " + когда : ""} · ${ent.length} ${plural(ent.length, "запись", "записи", "записей")}`
      : `${pct}% · ${cov} из ${b.pages} стр · ${ent.length} ${plural(ent.length, "запись", "записи", "записей")}`
        + (когда ? " · " + когда : "");
    return row("bk:" + b.id, coverSrc(b.id, b.cover || ""), "📖", b.title, b.author, pct, meta);
  };
  const bookRows = books.filter(b => !b.done).map(bookRow);
  const doneBookRows = books.filter(b => b.done).map(bookRow);

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

  /* Строка на каждый курс: их стало несколько, а список показывал только
     открытый сейчас — «Аргоса» в библиотеке было просто не найти. Ключ берём
     тот же, что у ленты, иначе глазик прятал бы не то, что показывает. */
  const pastelRows = courses().map((c) => {
    const st = withMaterial({ track: "pastel", courseId: c.id }, pastelStats);
    const pct = Math.round(st.pct);
    const key = libKey({ track: "pastel", courseId: c.id });
    const ck = keyOfCourse(c);
    /* Уроками больше не меряем: у рисунка мера — ходы, у лекции — минуты. */
    const дней = new Set(withMaterial({ track: "pastel", courseId: c.id },
      () => courseEntries().map((e) => e.date))).size;
    const мера = c.mode === "watch" ? `${st.minutes} из ${st.minutesAll} мин`
      : (c.lessons || []).length ? `${st.stepsDone} из ${shagov(st.steps)}`
      : `${дней} ${plural(дней, "день", "дня", "дней")} за листом`;
    /* У рисунка процента нет — он или идёт, или закончен. */
    const слева = (c.lessons || []).length || c.mode === "watch"
      ? `${pct}% · ${мера}` : (c.done ? `закончен · ${мера}` : мера);
    return row(key, coverSrc(ck, ""), "🎨", c.name, c.author, pct, слева);
  });

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
        <span class="lib-meta">${esc(((н, к) => {
            /* Даты начала и конца лежали в записи с самого импорта, но на
               экран выходила только дата завершения — и было не понять, сколько
               книга шла. Совпали — показываем одну. */
            const д = (x) => x ? fmtY.format(fromStr(x)).replace(" г.", "") : "";
            const a1 = д(н), a2 = д(к);
            return a1 && a2 && a1 !== a2 ? a1 + " — " + a2 : (a2 || a1 || "");
          })(a.startedAt, a.finishedAt))}
          ${a.rating ? " · " + "★".repeat(a.rating) : ""}${a.review ? "" : " · без отзыва"}</span>
      </span>
      <span class="mc-go">›</span>
    </button>`);

  /* Две секции вместо шести: что в работе и что пройдено. Деление по трекам
     ничего не давало — книга, пьеса и ролик и так различимы по обложке,
     а шесть заголовков превращали список в лестницу. */
  const work = [...bookRows, ...pieceRows, ...pastelRows, ...watchRows];

  /* Закрытые книги и полка — это одно и то же: прочитанное. Делить их на
     «Прочитано» и «Архив» значило заставлять вспоминать, написан ли отзыв,
     чтобы понять, где искать книгу. Свежезакрытые идут первыми. */
  const прочитано = [...doneBookRows, ...shelfRows];

  return `
    <div class="lib-group">Сейчас · ${work.length}</div>`
    + (work.length ? `<div class="lib-list">${work.join("")}</div>`
        : `<div class="empty-note">Пока ничего не добавлено.</div>`)
    + `<div class="lib-group">Прочитано · ${прочитано.length}</div>`
    + (прочитано.length ? `<div class="lib-list">${прочитано.join("")}</div>`
        : `<div class="empty-note">Здесь копится пройденное — с датами, оценкой и отзывом.</div>`)
    /* Артефакты отсюда убраны: это не материал, и у них своя кнопка в шапке. */
    + `<div class="lib-group">Добавить</div>`
    /* Добавление роликов с ютуба убрано: отмечать просмотр видео оказалось
       занятием без смысла. Уже добавленные материалы остаются на месте. */
    + `<button class="btn add-book" id="libAddBook" type="button">＋ Прочитанную книгу</button>`;
}

function bookPageUI(b) {
  const ent = bookEntriesOf(b.id).slice().sort((x, y) => x.date < y.date ? -1 : 1);
  const spans = mergeSpans(bookSpans(b));
  const cov = Math.min(b.pages || 0, bookCovered(b));
  const pct = bookPct(b);
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

    ${resetBtnHTML("bk", b.id)}
    <button class="btn lib-arch" data-libarch="bk:${esc(b.id)}" type="button">Завершить и убрать в архив</button>`;
}

/* Видео — единственный материал, который заводится руками. */
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
      ${resetBtnHTML("wt", v.id)}
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
      <div class="lib-hand">скрипичный</div>
      <div class="lib-map bars">${strip(st.passes.right)}</div>
      <div class="lib-hand">басовый</div>
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

    ${resetBtnHTML("pf", pc.id)}
    <button class="btn lib-arch" data-libarch="pf:${esc(pc.id)}" type="button">Завершить и убрать в архив</button>`;
}

/* ── День за днём ──
   Числа сверху говорят «сколько всего», а по ним не видно, что было сегодня.
   Здесь каждый день рисования: сколько ходов закрыто, сколько минут и какие
   именно ходы, — чтобы отметка находилась там, где её ищут. */
function pastelDaysHTML(c, отметки, ent) {
  const имя = new Map();
  c.lessons.forEach((l, i) => (l.steps || []).forEach((x, n) =>
    имя.set("L" + i + ":s" + n, x.t || x.title || ("Ход " + (n + 1)))));
  const поДням = new Map();
  for (const [k, d] of Object.entries(отметки)) {
    if (!d || !имя.has(k)) continue;
    if (!поДням.has(d)) поДням.set(d, []);
    поДням.get(d).push(имя.get(k));
  }
  const мин = new Map(ent.map((e) => [e.date, e.mins || 0]));
  const дни = [...new Set([...поДням.keys(), ...ent.map((e) => e.date)])].sort().reverse();
  if (!дни.length) return "";
  return `
    <div class="freeze">
      <div class="fz-head">📅 <b>День за днём</b> — ${дни.length} ${plural(дни.length, "день", "дня", "дней")} за листом</div>
      <div class="pd-list">
        ${дни.map((d) => {
          const шаги = поДням.get(d) || [];
          const m = мин.get(d) || 0;
          const чем = [шаги.length ? шаги.length + " " + plural(шаги.length, "ход", "хода", "ходов") : "",
                       m ? m + " мин" : ""].filter(Boolean).join(" · ");
          return `<div class="pd">
            <div class="pd-top"><b>${esc(fmtDay(d))}</b><span>${esc(чем || "отметка без ходов")}</span></div>
            ${шаги.length ? `<p>${esc(шаги.join(" · "))}</p>` : ""}
          </div>`;
        }).join("")}
      </div>
    </div>`;
}

// страница курса — тоже только чтение
function pastelPageUI(id) {
  const c  = courses().find((x) => x.id === id) || courses()[0] || course();
  const st = withMaterial({ track: "pastel", courseId: c.id }, pastelStats);
  const первый = firstCourseId();
  const ent = data.pastel.entries
    .filter(e => !e.deleted && (e.courseId || первый) === c.id)
    .slice().sort((x, y) => x.date < y.date ? -1 : 1);
  const notes = ent.filter(e => e.note).length;
  const thoughts = (data.thoughts || []).filter(t => !t.deleted && t.key === "pastel").length;
  const days = new Set(ent.map(e => e.date)).size;
  const лекция = c.mode === "watch";
  const простой = !c.lessons.length;
  /* Ход разбора берём у того курса, чью страницу открыли, а не у активного:
     иначе карта шагов и список этапов показывали чужое, споря с числами
     над ними, которые уже считались правильно. */
  const отметки = withMaterial({ track: "pastel", courseId: c.id },
    () => ({ ...(lessonStore().done || {}) }));
  const этапов = new Set(c.lessons.flatMap((l) => (l.steps || []).map((x) => x.g || ""))).size;

  return `
    <button class="back" id="libBack" type="button">‹ Все материалы</button>

    <div class="panel lib-head">
      <div class="lib-cover big">${(() => {
        const ck = keyOfCourse(c);
        const src = coverSrc(ck, "");
        return src ? `<img src="${esc(src)}" alt="">` : `<i>🎨</i>`;
      })()}</div>
      <div class="lib-title"><b>${esc(c.name)}</b><em>${esc(c.author || "")}</em></div>
    </div>
    ${простой ? drawPageHTML(c, ent, notes, thoughts) : ""}

    ${простой ? "" : `
    <div class="panel">
      ${(() => {
        /* Карта — по ходам, как у пьесы по тактам: видно, сколько позади и где
           дыры. У лекции ходов нет, там карта по занятиям. */
        if (лекция) return `<div class="lib-map">${c.lessons.map((_, i) =>
          `<i style="opacity:${st.doneSet.has(i) ? 1 : 0.10}"></i>`).join("")}</div>`;
        const сделан = (i, n) => !!отметки["L" + i + ":s" + n];
        return `<div class="lib-map">${c.lessons.map((l, i) =>
          (l.steps || []).map((_, n) =>
            `<i style="opacity:${сделан(i, n) ? 1 : 0.10}"></i>`).join("")).join("")}</div>`;
      })()}
      <div class="lib-num">
        <div><b>${Math.round(st.pct)}%</b><span>пройдено</span></div>
        ${лекция
          ? `<div><b>${st.minutes}</b><span>из ${st.minutesAll} мин</span></div>`
          : `<div><b>${st.stepsDone}</b><span>из ${shagov(st.steps)}</span></div>`}
        <div><b>${days}</b><span>${plural(days, "день", "дня", "дней")}</span></div>
        ${лекция
          ? `<div><b>${st.days}</b><span>${plural(st.days, "запись", "записи", "записей")}</span></div>`
          : `<div><b>${st.stages}</b><span>из ${этапов} ${plural(этапов, "этапа", "этапов", "этапов")}</span></div>`}
      </div>
      <div class="lib-rows">
        <div><span>Первая запись</span><b>${ent[0] ? esc(fmtDay(ent[0].date)) : "—"}</b></div>
        <div><span>Последняя</span><b>${ent.length ? esc(fmtDay(ent[ent.length - 1].date)) : "—"}</b></div>
        <div><span>Заметок при отметке</span><b>${notes}</b></div>
        <div><span>Моментов о курсе</span><b>${thoughts}</b></div>
      </div>
    </div>

    ${лекция || простой ? "" : pastelDaysHTML(c, отметки, ent)}

    <div class="freeze">
      <div class="fz-head">🎨 <b>${лекция ? "Занятия" : "Этапы"}</b> — ${
        лекция ? st.lessons + " " + plural(st.lessons, "занятие", "занятия", "занятий")
               : этапов + " " + plural(этапов, "этап", "этапа", "этапов")}</div>
      <div class="parts">
        ${лекция ? c.lessons.map((l, i) => `
          <div class="pt-main ${st.doneSet.has(i) ? "full" : ""}" style="cursor:default">
            <span class="pt-fill" style="width:${st.doneSet.has(i) ? 100 : 0}%"></span>
            <span class="pt-name">${esc(l.title || l.name || "Занятие " + (i + 1))}</span>
            <span class="pt-meta">${st.doneSet.has(i) ? "пройдено" : Math.round(l.dur / 60) + " мин"}</span>
          </div>`).join("")
        : (() => {
            /* Этап показываем полосой: сколько его ходов закрыто. */
            const сделан = (i, n) => !!отметки["L" + i + ":s" + n];
            const по = new Map();
            c.lessons.forEach((l, i) => (l.steps || []).forEach((x, n) => {
              const g = x.g || "Без этапа";
              const v = по.get(g) || { all: 0, ok: 0 };
              v.all++; if (сделан(i, n)) v.ok++;
              по.set(g, v);
            }));
            return [...по].map(([g, v]) => {
              const p = v.all ? Math.round(v.ok / v.all * 100) : 0;
              return `
          <div class="pt-main ${p >= 100 ? "full" : ""}" style="cursor:default">
            <span class="pt-fill" style="width:${p}%"></span>
            <span class="pt-name">${esc(g)}</span>
            <span class="pt-meta">${p >= 100 ? "пройден" : v.ok + " из " + shagov(v.all)}</span>
          </div>`;
            }).join("");
          })()}
      </div>
    </div>

    `}

    ${resetBtnHTML("ps", c.id)}
    <button class="btn lib-arch" data-libarch="ps:${esc(c.id)}" type="button">Завершить и убрать в архив</button>`;
}

/* ── Страница простого рисунка ──
   Считать тут нечего: сколько дней сидел, сколько снимков накопилось и
   закончен ли лист. Снимки — главное: по ним видно движение лучше любых
   процентов. */
function drawPageHTML(c, ent, notes, thoughts) {
  const ключ = keyOfCourse(c);
  const снимки = takesFor(ключ).filter((t) => t.kind === "photo");
  const дни = new Set(ent.map((e) => e.date)).size;
  return `
    <div class="panel">
      <div class="lib-num">
        <div><b>${c.done ? "✓" : "—"}</b><span>${c.done ? "закончен" : "в работе"}</span></div>
        <div><b>${дни}</b><span>${plural(дни, "день", "дня", "дней")}</span></div>
        <div><b>${ent.length}</b><span>${plural(ent.length, "подход", "подхода", "подходов")}</span></div>
        <div><b>${снимки.length}</b><span>${plural(снимки.length, "снимок", "снимка", "снимков")}</span></div>
      </div>
      <div class="lib-rows">
        <div><span>Первая запись</span><b>${ent[0] ? esc(fmtDay(ent[0].date)) : "—"}</b></div>
        <div><span>Последняя</span><b>${ent.length ? esc(fmtDay(ent[ent.length - 1].date)) : "—"}</b></div>
        ${c.doneAt ? `<div><span>Завершён</span><b>${esc(fmtDay(dateStr(new Date(c.doneAt))))}</b></div>` : ""}
        <div><span>Заметок при отметке</span><b>${notes}</b></div>
        <div><span>Моментов о курсе</span><b>${thoughts}</b></div>
      </div>
    </div>

    ${снимки.length ? `
    <div class="freeze">
      <div class="fz-head">🖼 <b>Как шёл лист</b> — ${снимки.length} ${plural(снимки.length, "снимок", "снимка", "снимков")}, от первого к последнему</div>
      <div class="dw-shots wide">
        ${снимки.map((t) => `
          <figure class="dw-sh" data-shot="${esc(t.id)}">
            ${takeUrls.get(t.id) ? `<img src="${esc(takeUrls.get(t.id))}" alt="" loading="lazy">` : `<i>🖼</i>`}
            <figcaption>${esc(fmtDay(dateStr(new Date(t.at))))}</figcaption>
          </figure>`).join("")}
      </div>
    </div>` : ""}`;
}


/* Кнопка стоит на странице самого материала, рядом с «в архив»: там видно,
   что именно начинаешь заново. */
const resetBtnHTML = (kind, id) => `
  <button class="btn lib-arch" data-reset="${esc(kind)}:${esc(id)}" type="button">Начать заново</button>
  <p class="lib-hint">Снимет отметки, записи занятий и открытые награды этого материала.
    Сам материал и разбор останутся.</p>`;

function bindLibraryUI() {
  document.querySelectorAll("[data-reset]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const [kind, id] = btn.dataset.reset.split(":");
      if (!confirm("Начать материал заново? Отметки, записи и награды по нему будут сняты.")) return;
      const n = resetMaterial(kind, id || "");
      render();
      toast(n ? "Сброшено · записей убрано: " + n : "Сброшено");
    }));
  document.querySelectorAll("[data-eye]").forEach(btn =>
    btn.addEventListener("click", (e) => { e.stopPropagation(); matToggle(btn.dataset.eye); }));
  document.querySelectorAll("[data-lib]").forEach(btn =>
    btn.addEventListener("click", () => { libBook = btn.dataset.lib; render(); $("#view").scrollTop = 0; }));
  const addBook = $("#libAddBook");
  if (addBook) addBook.addEventListener("click", openAddBookSheet);
  document.querySelectorAll("[data-shelf]").forEach(btn =>
    btn.addEventListener("click", () => openShelfSheet(btn.dataset.shelf)));
  /* Экран наград скрыт: награды и карточки видны в «Моментах», внутри своей
     сессии. Код цел — вернуть значит вернуть строку в список разделов.
     Карта знаний убрана совсем, её код лежит в attic/karta-znaniy.md. */
  /* Кнопка «в архив» переехала со страницы настроек на страницу самого
     материала: там понятно, что именно завершаешь. Раньше она стояла в общем
     блоке и завершала «текущий», а какой текущий — приходилось помнить. */
  document.querySelectorAll("[data-libarch]").forEach(btn =>
    btn.addEventListener("click", () => {
      const [kind, id] = btn.dataset.libarch.split(":");
      if (kind === "bk") { data.active = "book"; data.book.activeBook = id; }
      else if (kind === "pf") { data.active = "piano"; data.piano.activePiece = id; }
      else if (kind === "ps") { data.active = "pastel"; if (id) data.pastel.activeCourse = id; }
      libBook = null;
      archiveCurrent();
    }));
  const back = $("#libBack");
  if (back) back.addEventListener("click", () => { libBook = null; render(); $("#view").scrollTop = 0; });
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




/* Словарь курса: как автор называет цвет и какой это примерно оттенок.
   Ищем по основе слова, потому что в тексте оно склоняется: «красным»,
   «бежевого», «чёрно-коричневым». Составные и уточнённые названия стоят
   первыми — иначе «тёмно-синий» поймается на «синий», а «чёрно-коричневый»
   на «чёрный». */
const ЦВЕТА_КУРСА = [
  ["ярко-рыж[а-яё]*", "B0561B"],
  ["бледно-рыж[а-яё]*", "D9915E"],
  ["рыж[а-яё]*", "B0561B"],
  ["лимонно-ж[её]лт[а-яё]*", "EFDF00"],
  ["приглуш[её]нн[а-яё]*\\s+ж[её]лт[а-яё]*", "C8963E"],
  ["ж[её]лт[а-яё]*", "EFDF00"],
  ["ярк[а-яё]*\\s+оранжев[а-яё]*", "F07800"],
  ["оранжев[а-яё]*", "F07800"],
  ["ч[её]рно-коричнев[а-яё]*", "2A1F1D"],
  ["т[её]мно-коричнев[а-яё]*", "4A2E20"],
  ["горьк[а-яё]*\\s+шоколад[а-яё]*", "3F2A20"],
  ["коричнев[а-яё]*", "5A3A28"],
  ["ч[её]рн[а-яё]*", "1A1A1A"],
  ["серо-голуб[а-яё]*", "8FA6B8"],
  ["голуб[а-яё]*", "7FB6D9"],
  ["т[её]мно-син[а-яё]*", "2B3A67"],
  ["холодн[а-яё]*\\s+син[а-яё]*", "2A4B8D"],
  ["син[а-яё]*", "2A4B8D"],
  ["серо-зел[её]н[а-яё]*", "8A9A7B"],
  ["зел[её]н[а-яё]*", "3E7A4E"],
  ["ярк[а-яё]*\\s+красн[а-яё]*", "D42A2A"],
  ["красн[а-яё]*", "D42A2A"],
  ["розов[а-яё]*", "E8A0A8"],
  ["бежев[а-яё]*", "E0C9A6"],
  ["терракот[а-яё]*", "C06A4E"],
  ["бел[ыоаие][а-яё]*", "F2F0EA"],
  ["охр[аыоей]\\b", "C8963E"],
  ["индиго", "2B3A67"],
];




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
let archTried = 0;
function maybeArchive(box) {
  if (!cfg.token || !cfg.gistId || cfg.archiveOff) return;   // по умолчанию включена
  if (now() - (cfg.lastArchive || 0) < ARCH_EVERY) return;
  /* Отметка успеха ставится только при удаче, поэтому сорвавшийся снимок
     пробовался заново на КАЖДОЙ сверке — а каждая попытка перебирает все гисты
     аккаунта. Между неудачами держим паузу. */
  if (now() - archTried < 3600e3) return;
  archTried = now();
  archiveNow(box, false).catch(() => {});   // не получилось — попробуем через час
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
  data.gut = mergeLists(data.gut || [], d.gut || []);
  data.archive = mergeLists(data.archive || [], d.archive || []);
  data.practice = mergePrac(data.practice, d.practice); pracStamp(false);
  for (const p of (d.piano.pieces || [])) if (!data.piano.pieces.some(x => x.id === p.id)) data.piano.pieces.push(p);
  for (const b of (d.book.books || [])) if (!data.book.books.some(x => x.id === b.id)) data.book.books.push(b);

  normalizeActive();
  saveData(); schedulePush(); render();
  toast(before === dataStamp() ? "Всё это уже было" : "Данные восстановлены");
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
  { id: "look",      icon: "🎧", name: "Атмосфера",     hint: () => cfg.sound ? "звук включён" : "звук выключен" },
  /* Материалы, полка и карта знаний собраны в одном месте: раньше они были
     раскиданы по трём экранам, и «где посмотреть прочитанное» каждый раз
     приходилось вспоминать. */
  { id: "library",   icon: "📚", name: "Библиотека",   hint: () => {
      const n = railItems().length, sh = shelfItems().length;
      return (n ? `${n} в работе` : "пусто") + (sh ? ` · ${sh} в архиве` : ""); } },
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
    body = soundUI() + dailyUI();
  } else if (id === "library") {
    /* Каталог уехал в «Данные»: он про обмен файлами, а не про материалы,
       и сверяется сам при каждой синхронизации. Блок «отправить в архив
       и начать новое» убран — теперь это кнопка на странице материала. */
    body = libraryUI();
  } else if (id === "data") {
    body = backupUI();
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

  bindGoalUI();
  bindSoundUI();
  bindDailyUI();
  bindBackupUI();
  bindLibraryUI();
  bindArchiveUI();
}

/* ══════════ Gist ══════════ */

function setSyncDot(state) { $("#syncDot").className = "sync-dot" + (state ? " " + state : ""); }

function gh(path, opts = {}, ms = 12000) {
  // свои заголовки добавляем к обязательным, а не вместо них
  const headers = Object.assign(
    { "Authorization": "Bearer " + cfg.token, "Accept": "application/vnd.github+json" },
    opts.headers || {});
  return withTimeout(fetch("https://api.github.com" + path,
    Object.assign({}, opts, { headers })), ms);
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
    // гист мог уже переехать на файлы по профилям — ищем и такой
    const found = (await r.json()).find(g => g.files &&
      (g.files[GIST_FILE] || Object.keys(g.files).some((n) => /^keiko-.+\.json$/.test(n))));
    if (found) { cfg.gistId = found.id; saveCfg(); await syncNow(false); toast("Подключено"); }
    else {
      const cr = await gh("/gists", {
        method: "POST",
        body: JSON.stringify({ description: "Кэйко — данные профилей", public: false,
          files: { [PROF_FILE(profileId)]: { content: JSON.stringify(exportData()) } } })
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

const exportData = () => ({ v: 7, savedAt: now(), usage: data.usage, active: data.active, weekGoal: data.weekGoal, shop: data.shop, thoughts: data.thoughts, wishes: data.wishes, gut: data.gut,
  /* Раздел таблеток убран, но старые отметки Дианы по-прежнему возим с собой:
     код удалить можно, чужие записи молча стирать — нет. */
  talks: data.talks, talksAt: data.talksAt, kanyeAt: data.kanyeAt, piano: data.piano, book: data.book, pastel: data.pastel, watch: data.watch, practice: data.practice, hidden: data.hidden, achAt: data.achAt, factAt: data.factAt, musAt: data.musAt, musLike: data.musLike, goalAt: data.goalAt, eventsV: data.eventsV, pracTrimV: data.pracTrimV, archive: data.archive, daily: data.daily, takes: data.takes, takesId: data.takesId });

/* Счётчики использования: каждое устройство пишет только свою ветку, поэтому
   достаточно поимённого максимума — числа только растут. */
function mergeUsage(local, remote) {
  const out = {};
  for (const src of [remote || {}, local || {}])
    for (const dev of Object.keys(src)) {
      out[dev] = out[dev] || {};
      for (const k of Object.keys(src[dev] || {})) {
        const a = out[dev][k] || {}, b = src[dev][k] || {};
        out[dev][k] = { n: Math.max(a.n || 0, b.n || 0), at: Math.max(a.at || 0, b.at || 0) };
      }
    }
  return out;
}

/* Отметки времени «когда это открылось»: музей, награды, карточки знаний.
   Единица означает «получено давно, время неизвестно». Из двух настоящих
   берём раннее — открылось оно тогда, когда открылось, а на каком устройстве
   это заметили первым, значения не имеет. Настоящее всегда бьёт единицу. */
function mergeStamps(local, remote) {
  const свод = { ...(local || {}) };
  for (const k in (remote || {})) {
    const a = свод[k] || 0, b = remote[k] || 0;
    свод[k] = (a > 1 && b > 1) ? Math.min(a, b) : Math.max(a, b);
  }
  return свод;
}

function mergeLists(local, remote) {
  const map = new Map();
  for (const i of remote || []) map.set(i.id, i);
  for (const i of local || []) {
    const o = map.get(i.id);
    if (!o || (i.updatedAt || 0) >= (o.updatedAt || 0)) map.set(i.id, i);
  }
  return [...map.values()];
}

/* Слепок последнего ответа гиста. Живёт в памяти сессии: пока он есть,
   можно спрашивать «а не изменилось ли» условным запросом и получать 304 без
   тела. Раньше каждая отметка тянула файл целиком — с обоими профилями и
   всеми мыслями, — хотя чаще всего там ничего не менялось. */
let gistEtag = "", gistBox = null;

// короткий отпечаток строки: сравнить «то же ли это», не храня саму строку
const strHash = (s) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36) + ":" + s.length;
};

async function syncNow(manual) {
  if (!cfg.token || !cfg.gistId) { if (manual && !cfg.token) openSettingsSheet(); return; }
  /* Сверка уже идёт. Раньше здесь был просто выход — и отметка, сделанная во
     время медленной сверки, не уезжала вовсе: своей очереди она не дожидалась,
     а нового повода могло не случиться до следующего запуска. Теперь помним,
     что просились, и повторяем, как только освободимся. */
  if (syncing) { syncAgain = true; return; }
  if (!navigator.onLine) { online = false; setSyncDot("off"); renderBanner(); return; }
  syncing = true; setSyncDot("busy");
  const stampBefore = dataStamp();
  try {
    /* Метка сверки живёт и в настройках, а не только в памяти: без этого
       каждый перезапуск начинался с полного скачивания гиста — оранжевая
       точка мигала подолгу на ровном месте. Теперь холодный старт спрашивает
       «а изменилось ли», и чаще всего получает пустое 304. */
    /* Метка сверки принадлежит ПРОФИЛЮ, а не устройству. Раньше она лежала
       общей: сверился в одном профиле — получил свежий etag; переключился на
       второй — сервер отвечал 304 «не менялось», и файл второго профиля не
       читался вовсе. Локальная старая копия считалась верной и первой же
       правкой затирала в гисте то, что там появилось. */
    const condTag = gistEtag || (cfg.gistEtagBy || {})[profileId] || "";
    const cond = condTag ? { headers: { "If-None-Match": condTag } } : {};
    const r = await gh("/gists/" + cfg.gistId, cond);
    if (r.status !== 304 && !r.ok) throw new Error("Ошибка сети (" + r.status + ")");

    /* cold: 304 при пустой памяти — гист не менялся с прошлой синхронизации,
       но слепка в памяти нет (перезапуск). Скачивать нечего: на прошлой
       сверке всё удалённое уже слито в местное. Осталось понять одно —
       менялось ли местное с тех пор; это решает сохранённый отпечаток. */
    let mine, remote, cold = false;
    if (r.status === 304 && gistBox) {
      /* Ничего не изменилось — берём то, что уже разобрали. Сливать заново
         нечего: удалённая сторона ровно та же, что в прошлый раз. */
      mine = gistBox;
      remote = null;
    } else if (r.status === 304) {
      cold = true; mine = null; remote = null;
      gistEtag = condTag;
    } else {
      const g = await r.json();
      gistEtag = r.headers.get("etag") || "";
      const files = g.files || {};
      const read = async (f) => {
        if (!f) return null;
        if (!f.truncated) return f.content;
        return f.raw_url ? await (await fetch(f.raw_url)).text() : null;
      };

      mine = null;
      const own = await read(files[PROF_FILE(profileId)]);
      if (own) { try { mine = JSON.parse(own); } catch {} }

      // своего файла ещё нет — берём себя из общего, он же и переедет при записи
      let shared = null;
      if (!mine) {
        const txt = await read(files[GIST_FILE]);
        if (txt) {
          try {
            const parsed = JSON.parse(txt);
            // самый старый файл был плоским — считаем его данными первого профиля
            shared = parsed && parsed.profiles ? parsed : { profiles: { anton: parsed } };
            mine = shared.profiles[profileId] || null;
          } catch {}
        }
      }
      remote = migrate(mine);
      gistBox = mine;

      /* Кто вообще есть: и переехавшие файлы, и те, кто ещё в общем. */
      const ids = Object.keys(files)
        .map((n) => /^keiko-(.+)\.json$/.exec(n))
        .filter(Boolean).map((m) => m[1]);
      for (const id of Object.keys((shared && shared.profiles) || {}))
        if (!ids.includes(id)) ids.push(id);
      if (ids.length) { cfg.profileIds = ids; saveCfg(); profilesFromKeys(ids); }
    }

    if (remote) {
      // определения материалов живут в гисте наравне с записями
      data.piano.pieces = mergeLists(data.piano.pieces, remote.piano.pieces);
      data.book.books = mergeLists(data.book.books, remote.book.books);
      if (remote.pastel.course && (!data.pastel.course ||
          (remote.pastel.course.updatedAt || 0) >= (data.pastel.course.updatedAt || 0))) {
        data.pastel.course = remote.pastel.course;
      }
      /* Курсы — такие же определения материалов, как пьесы и книги. Пока этой
         строки не было, устройство со старым списком отправляло его обратно и
         стирало курс, добавленный с другого. */
      data.pastel.courses = mergeLists(data.pastel.courses || [], remote.pastel.courses || []);
      if (data.pastel.activeCourse &&
          !data.pastel.courses.some((c) => c && c.id === data.pastel.activeCourse))
        data.pastel.activeCourse = "";
      if (!data.piano.activePiece && data.piano.pieces[0]) data.piano.activePiece = data.piano.pieces[0].id;
      if (!data.book.activeBook && data.book.books[0]) data.book.activeBook = data.book.books[0].id;

      data.piano.entries = mergeLists(data.piano.entries, remote.piano.entries);
      data.book.entries = mergeLists(data.book.entries, remote.book.entries);
      data.book.asks = mergeLists(data.book.asks || [], (remote.book.asks) || []);
      data.pastel.entries = mergeLists(data.pastel.entries, remote.pastel.entries);

      data.watch.videos = mergeLists(data.watch.videos, remote.watch.videos);
      data.watch.entries = mergeLists(data.watch.entries, remote.watch.entries);
      if (!data.watch.activeVideo && data.watch.videos[0]) data.watch.activeVideo = data.watch.videos[0].id;
      /* Цель и тема сравниваются по своей отметке, а не по штампу всего файла.
         Раньше условием было «файл свежее последней синхронизации» — и любая
         вчерашняя чужая правка побеждала твою сегодняшнюю: скачивание идёт
         раньше отправки, чужое значение ложилось поверх и уезжало обратно уже
         как твоё. У записей такого не бывает: там у каждой свой updatedAt. */
      if (remote.weekGoal && (remote.goalAt || 0) > (data.goalAt || 0)) {
        data.weekGoal = remote.weekGoal;
        data.goalAt = remote.goalAt;
      }
      data.thoughts = mergeLists(data.thoughts, remote.thoughts || []);
      data.wishes = mergeLists(data.wishes || [], remote.wishes || []);
      data.gut = mergeLists(data.gut || [], remote.gut || []);
      // выбранные версии — свод, а не список: берём свежий целиком
      if (remote.talks && (remote.talksAt || 0) > (data.talksAt || 0)) {
        data.talks = remote.talks; data.talksAt = remote.talksAt;
      }
      /* Палитра — слепок целиком, а не список записей: докупил мелков и залил
         заново. Побеждает свежий слепок, сливать половинки бессмысленно. */
      data.archive = mergeLists(data.archive, remote.archive);
      data.takes = mergeLists(data.takes || [], remote.takes || []);
      /* Разбор уезжал в гист, но обратно не возвращался никогда. На чистом
         устройстве он оставался пустым — и первой же записью затирал в гисте
         и пройденные такты, и ссылку на видео. */
      data.practice = mergePrac(data.practice, remote.practice);
      data.usage = mergeUsage(data.usage, remote.usage);
      /* Время открытия предмета: берём известное вместо «когда-то» (единицы),
         а из двух настоящих — раннее: открылся он тогда, когда открылся,
         на каком устройстве это заметили первым — неважно. */
      /* Сердце: храним время действия, у снятого — со знаком минус. При слиянии
         побеждает более позднее действие, иначе снятый на одном телефоне лайк
         возвращался бы со второго. */
      if (remote.musLike) {
        const свод = { ...(data.musLike || {}) };
        for (const k in remote.musLike) {
          const a = свод[k] || 0, b = remote.musLike[k] || 0;
          свод[k] = Math.abs(b) > Math.abs(a) ? b : a;
        }
        data.musLike = свод;
      }
      /* Время открытия — одинаково у предметов, наград и карточек знаний.
         Раньше сливался только музей, а achAt и factAt уезжали в гист как есть:
         второй телефон затирал ими времена первого, подставляя свои единицы
         «когда-то». Награда после этого пропадала из карточки дня — её отбор
         в ленте идёт как раз по этому времени. */
      data.musAt  = mergeStamps(data.musAt,  remote.musAt);
      data.achAt  = mergeStamps(data.achAt,  remote.achAt);
      data.factAt = mergeStamps(data.factAt, remote.factAt);
      // спрятанное — свойство взгляда, а не данных: берём то, что свежее целиком
      if (remote.hidden && (remote.savedAt || 0) > (cfg.lastSync || 0)) data.hidden = remote.hidden;
      pracStamp(false);        // слияние — не правка, отметки времени не трогаем
      // адрес гиста с файлами обязан жить в данных, а не в настройках устройства,
      // иначе на втором телефоне вложения просто неоткуда взять
      if (!data.takesId && remote.takesId) data.takesId = remote.takesId;
      if (data.takesId) { cfg.takesId = data.takesId; saveCfg(); }
      /* Показанное складываем, а не заменяем. Раньше более свежая дата тянула
         за собой весь чужой список, и история просмотров с другого устройства
         пропадала — те же мысли шли по второму кругу. Дата и выключатель
         берутся у свежей стороны, список — общий. */
      if (remote.daily) {
        const mine = data.daily || { date: "", seen: [], off: false };
        const theirs = remote.daily;
        const newer = String(theirs.date || "") > String(mine.date || "") ? theirs : mine;
        const seen = [...(mine.seen || [])];
        const было = new Set(seen);
        for (const id of (theirs.seen || [])) if (!было.has(id)) { было.add(id); seen.push(id); }
        data.daily = { date: newer.date || "", off: !!newer.off, n: newer.n || 0, seen: seen.slice(-2000) };
      }
      normalizeActive();
      saveData();
    }

    // сравниваем профиль целиком: раньше смотрели только занятия, и новые мысли,
    // книги на полке, паузы или цель могли навсегда остаться на одном устройстве
    const norm = (o) => JSON.stringify(migrate(o));
    const myNorm = norm(exportData());
    /* На холодном 304 сравнивать не с чем — сравниваем с отпечатком того, что
       ушло в гист в прошлый раз. Совпал — не изменилось ничего нигде, и вся
       сверка обошлась одним пустым запросом. */
    const changed = cold ? strHash(myNorm) !== (cfg.syncNormBy || {})[profileId] : norm(mine) !== myNorm;
    if (changed) {
      // отправляем один файл — свой; чужие в гисте PATCH не трогает
      const payload = JSON.stringify(exportData());
      const pr = await gh("/gists/" + cfg.gistId, {
        method: "PATCH",
        body: JSON.stringify({ files: { [PROF_FILE(profileId)]: { content: payload } } })
      });
      if (!pr.ok) throw new Error("Не сохранилось");
      /* После записи метка старая. Берём ту, что вернул сам PATCH: совпадёт —
         следующая сверка придёт пустой; не совпадёт — просто скачаем файл, как
         раньше. Хуже прежнего не будет.
         Слепок кладём РАЗОБРАННЫЙ ЗАНОВО, а не сам box: exportData отдаёт живые
         массивы приложения, и слепок менялся бы вместе с ними. Тогда сравнение
         «изменилось ли» всегда говорило бы «нет», и правки переставали уходить
         в гист вовсе. */
      gistEtag = pr.headers.get("etag") || "";
      gistBox = JSON.parse(payload);
      mine = gistBox;
    }
    cfg.lastSync = now();
    cfg.gistEtagBy = { ...(cfg.gistEtagBy || {}), [profileId]: gistEtag };
    /* Отпечаток — того, что реально ушло в гист, а не живых данных: myNorm
       посчитан до await, ровно из него собран payload. Считая заново здесь, мы
       записывали как «отправленное» и правку, случившуюся во время запроса, —
       на холодном старте она потом молча признавалась отправленной. */
    cfg.syncNormBy = { ...(cfg.syncNormBy || {}), [profileId]: strHash(myNorm) };
    delete cfg.gistEtag; delete cfg.syncNorm;   // общие метки больше не в ходу
    saveCfg(); setSyncDot("ok");
    // снимок в архив кладём в прежней форме: восстановление читает её же
    maybeArchive({ v: 9, savedAt: now(), profiles: { [profileId]: mine || exportData() } });
    // раз в сутки — но незнакомый материал ждать сутки не должен
    catalogPull(catalogMissing()).catch(() => {});
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
  } finally {
    syncing = false;
    if (syncAgain) { syncAgain = false; schedulePush(); }
  }
}

function schedulePush() {
  if (!cfg.token || !cfg.gistId) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => syncNow(false), 1500);
}

/* ══════════ Запуск ══════════ */

/* Заставка уходит, когда на экране уже есть что показать: и после обычного
   запуска, и после экрана подключения, и после выбора профиля, и даже после
   срыва — на пустой белый лист смотреть не должно доводиться ни в одном из
   этих случаев. */
function bootDone() {
  const el = document.getElementById("boot");
  if (!el) return;
  el.classList.add("gone");
  setTimeout(() => el.remove(), 320);
}

function init() {
  try {
    boot();
  } catch (e) { console.error(e); crashScreen(e); }
  bootDone();
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
  if (["home", "progress", "ach", "notes", "wish", "gut"].includes(cfg.tab)) tab = cfg.tab;
  if (["week", "month", "year"].includes(cfg.period)) period = cfg.period;
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
  const sortFab = $("#sortFab");
  if (sortFab) sortFab.addEventListener("click", () => {
    if (tab !== "wish") return;
    wishTriage = { ids: wishes().filter((w) => !w.done).map((w) => w.id), at: 0 };
    renderWishes();
    syncNotesFabs();
  });

  window.addEventListener("online", () => {
    online = true; setSyncDot(""); renderBanner();
    if (gistReady()) syncNow(false);        // догоняем всё, что накопилось офлайн
  });
  window.addEventListener("offline", () => { online = false; setSyncDot("off"); renderBanner(); });
  if (!online) setSyncDot("off");

  $("#gearBtn").addEventListener("click", openSettingsSheet);
  $("#musBtn").addEventListener("click", () => {
    /* Второе нажатие возвращает туда, откуда пришёл: кнопка в шапке работает
       как переключатель, а не как ещё одна вкладка. */
    if (tab === "mus") { tab = cfg.tabBack || "home"; }
    else { cfg.tabBack = tab; mus = { book: "", at: null }; tab = "mus"; useMark("вкладка-mus"); }
    cfg.tab = tab; saveCfg();
    settingsOpen = false;
    renderTabbar();
    render();
  });
  document.querySelector(".logo").addEventListener("click", openAboutSheet);
  // если доступ к движению уже разрешён — просто подписываемся

  bindPractice();
  bindPlaceMap();
  $("#sheetBg").addEventListener("click", closeSheet);
  /* Ушли из поля — доигрываем то, что придержали. Через таймер: фокус часто
     перепрыгивает в соседнее поле, и между ними экран трогать нельзя. */
  document.addEventListener("focusout", () => setTimeout(flushRender, 90), true);
  $("#cheerOk").addEventListener("click", () => {
    $("#cheer").classList.remove("show", "daily");
    nextOverlaySoon();
  });
  $("#cheer").addEventListener("click", e => {
    if (e.target !== e.currentTarget) return;
    $("#cheer").classList.remove("show", "daily");
    nextOverlaySoon();
  });

  window.addEventListener("resize", syncTabHeight);
  window.addEventListener("orientationchange", () => setTimeout(syncTabHeight, 200));

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      checkForUpdate(); if (selectedDate > todayStr()) selectedDate = todayStr(); syncNow(false); render(); }
  });

  render();
  /* Просьба не выселять хранилище: ролики, звук и записи живут в Cache
     Storage, и система вправе вычистить его под давлением места. persist
     переводит хранилище в разряд «не трогать без крайности». Отказ — не
     беда, просто остаёмся как были. */
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch {}
  coverLoadAll();                     // обложки из кэша — сразу, ещё до сети
  takeLoadAll().then(takesSweep);     // записи собственной игры, потом уборка сирот
  setTimeout(diaryFill, 3500);        // место и погода для записей, сделанных без сети
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


