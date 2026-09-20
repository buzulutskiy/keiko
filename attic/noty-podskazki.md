# «Ноты» — подсказки по нотам в занятии

Снято в версии 564 по решению: «кнопки ноты, пройти ещё раз тоже не нужно…
вся эта история с каким-то усложнением вообще не нужна». Вместе с тремя
уровнями отметки («легко / с усилием / сложно»), которые в той же правке
свелись к одной кнопке «Получилось».

Что это было: кнопка «Ноты» в занятии раскрывала под кружками панель с
разбором текущего отрезка по тактам — какие ноты в правой руке, какие в
левой, по долям, русскими названиями. Текст лежит в разборе
(`keiko-practice.json`, поле `hints`: такт → `{r, l}`) и **никуда не делся**:
он по-прежнему нужен коду — `barSteps(b)` смотрит на `hints[b]`, чтобы понять,
сколько шагов у такта (звучат обе руки или одна). Снят только показ.

## Что вернуть

### 1. `app.js` — сборка панели

Рядом с `pracSpan`, перед `let pracAudioEl`:

```js
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
```

### 2. `app.js` — кнопка и показ в `pracRender`

В ряд `.wk-row`:

```js
${pracDoc() ? `<button class="pr-ghost" data-prac="hint">${prac.hintOpen ? "Скрыть ноты" : "Ноты"}</button>` : ""}
```

И сразу после `<p class="wk-tail">…</p>`:

```js
${prac.hintOpen ? pracHintHTML(u) : ""}
```

### 3. `app.js` — состояние и обработчик

В начальный объект `prac` (там же, где `listOpen: false`) вернуть
`hintOpen: false` — и в объект урока курса тоже, если понадобится.

В `switch (b.dataset.prac)`:

```js
case "hint": prac.hintOpen = !prac.hintOpen; return pracRender();
```

### 4. `index.html` — стили

```css
    /* ноты текущего отрезка */
    .pr-hint {
      margin-top: 20px; width: 100%; border-radius: 14px; padding: 14px 15px; text-align: left;
      background: rgba(139, 124, 246, 0.09); border: 1px solid rgba(139, 124, 246, 0.24);
      font-size: 0.88rem; line-height: 1.65;
    }
    .pr-hb { padding: 6px 0; border-top: 1px solid rgba(255, 255, 255, 0.07); }
    .pr-hb:first-child { border-top: 0; padding-top: 0; }
    .pr-hn { display: inline-block; min-width: 28px; font-weight: 700; color: var(--gold); font-size: 0.8rem; }
    .pr-hh { color: var(--dim); font-size: 0.76rem; font-weight: 600; }
    .pr-hint b { font-weight: 600; color: var(--ink); }
    .pr-hint i { font-style: normal; color: var(--gold-2); font-size: 0.78rem; }
    .pr-hint .c {
      display: inline-block; background: rgba(255, 255, 255, 0.1); border-radius: 3px;
      padding: 0 5px; margin: 0 3px 0 5px; font-weight: 700; font-size: 0.72rem; color: var(--muted);
    }
    .pr-leg {
      margin: 11px 0 0; padding-top: 9px; font-size: 0.7rem; color: var(--dim); line-height: 1.5;
      border-top: 1px solid rgba(255, 255, 255, 0.07);
    }
```

---

# Три уровня отметки и «Пройти ещё раз»

Снято тогда же и тем же решением. Здесь всё, что было завязано на трудность.

## `app.js` — сами уровни

```js
const LVLS = [
  { k: 1, name: "Легко",     hint: "пальцы сами" },
  { k: 2, name: "С усилием", hint: "вышло, но пришлось собраться" },
  { k: 3, name: "Сложно",    hint: "спотыкался" },
];
```

Кнопки в `pracRender`:

```js
const кнопки = LVLS.map((l) => `
  <button class="rep l${l.k}" data-lvl="${l.k}" type="button">
    <b>${l.name}</b><span>${l.hint}</span>
  </button>`).join("");
```

Подпись над ними у сшивки:

```js
${u.final ? `<p class="wk-next">пока идёт «сложно» — повторяем; «с усилием» или «легко» ${
  u.run ? "закрывают прогон" : "закрывают блок"}</p>` : ""}
```

## `app.js` — условие сшивки

```js
/* Сшивка засчитана, когда последний заход был не «сложно»: сложный повторяется
   до тех пор, пока блок не пойдёт хотя бы с усилием. */
const finalPassed = (bl) => {
  const list = finalOf(bl);
  return list.length > 0 && (list[list.length - 1].lvl || 3) <= 2;
};
const runPassed = (bl) => {
  if (!runNeeded(bl)) return true;
  const list = runOf(bl);
  return list.length > 0 && (list[list.length - 1].lvl || 3) <= 2;
};
```

`repAdd` писал уровень: `const rec = { lvl, d: todayStr(), at: now() };` —
и вызывался как `repAdd(u, lvl)`.

## `app.js` — лишние круги по блоку

```js
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
```

Кнопка и обработчик:

```js
${u.final ? `<button class="pr-ghost" data-prac="again">${
  u.run ? "Пройти ещё раз" : "Пройти блок ещё раз"}</button>` : ""}
```

```js
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
```

## `app.js` — цвет кружка по уровню

```js
out += `<i class="dot${r ? " l" + r.lvl : ""}${i === сейчас ? " now" : ""}"></i>`;
```

И подпись под списком тактов:

```
Кружок — один заход: мятный «легко», золотой «с усилием», фиолетовый «сложно».
```

## `index.html` — стили уровней

```css
    /* Три кнопки отметки: как прошёл заход. Цвета не про «хорошо-плохо»,
       а про усилие: мятный, золотой, фиолетовый. */
    .rep {
      display: grid; gap: 2px; padding: 12px 14px; border-radius: 15px; text-align: left;
      background: var(--glass); border: 1px solid var(--glass-line);
    }
    .rep b { font-size: 1.02rem; font-weight: 700; }
    .rep span { font-size: 0.78rem; color: var(--dim); }
    .rep.l1 { background: rgba(110, 231, 168, 0.13); border-color: rgba(110, 231, 168, 0.34); }
    .rep.l1 b { color: #8ef0bd; }
    .rep.l2 { background: rgba(240, 187, 92, 0.13); border-color: rgba(240, 187, 92, 0.34); }
    .rep.l2 b { color: #f3c876; }
    .rep.l3 { background: rgba(139, 124, 246, 0.14); border-color: rgba(139, 124, 246, 0.36); }
    .rep.l3 b { color: #b3a6ff; }
    .dot.l1 { background: #6ee7a8; border-color: #6ee7a8; }
    .dot.l2 { background: #f0bb5c; border-color: #f0bb5c; }
    .dot.l3 { background: var(--violet); border-color: var(--violet); }
```

## Что осталось в данных

Уровни у уже сделанных заходов (`lvl` в записях `reps` и `final`) лежат в
профиле нетронутыми: их просто никто не читает. Вернёшь код — вернутся и
цвета у старых кружков. Поле `extra` не встречалось ни у одной вещи, поэтому
его чтение снято совсем; если оно где-то всплывёт, вернуть надо `extraOf`
вместе с `stepGoal`.
