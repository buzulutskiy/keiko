# Промежуточная страница занятия

Экран `intro`: открывался между сеткой занятий и первым шагом. Показывал
иконку и название урока, процент прохождения, блок «Что узнаешь» с вопросами,
врезки «Что это даёт» и список этапов, по которым можно было прыгнуть внутрь
занятия. Убран 30 августа 2026: он оказался лишней остановкой между «хочу
заниматься» и собственно занятием.

## Как вернуть

1. Вставить блок ниже в `pracRender`, между экранами `pick` и `prep`.
2. В обработчике `data-lgo` вернуть `prac.screen = "intro";` вместо перехода
   сразу к подготовке или шагу.
3. Стили `.ls-intro`, `.ls-big`, `.ls-when`, `.ls-col`, `.ls-h`, `.ls-ask`,
   `.ls-steps`, `.ls-step` в index.html не удалялись — они на месте.

```js
  if (prac.screen === "intro" && at) {
    const l = ls[at.i] || {};
    const шаги = lessonSteps(at.i) || [];
    const п = lessonProgress(at.i);

    /* Этапы — по порядку и без повторов: длинный этап режется на заходы внутри,
       но в списке остаётся одной строкой. */
    const этапы = [];
    шаги.forEach((st, n) => {
      const g = st.g || "";
      const был = этапы.find((x) => x.g === g);
      if (был) { был.to = n; был.всего++; был.готово += lessonDone(at.i, "s" + n) ? 1 : 0; }
      else этапы.push({ g, from: n, to: n, всего: 1, готово: lessonDone(at.i, "s" + n) ? 1 : 0 });
    });
    const первыйОткрытый = этапы.findIndex((e) => e.готово < e.всего);

    box.innerHTML = `
      <div class="wk">
        <div class="wk-task ls-intro">
          <div class="ls-big">${esc(l.icon || "🎨")}</div>
          <h3>${esc(l.title || "Урок " + (at.i + 1))}</h3>
          <p class="ls-when">пройдено ${Math.round(п.pct)}%</p>
          ${п.было ? `<span class="ls-bar wide"><u style="width:${п.pct.toFixed(0)}%"></u></span>` : ""}
          <div class="ls-col">
          ${Array.isArray(l.ask) && l.ask.length ? `
            <p class="ls-h">Что узнаешь</p>
            <div class="ls-ask">${l.ask.map((x) => `<p>${esc(x)}</p>`).join("")}</div>` : ""}
          ${рамкиHTML("Что это даёт", l.life)}
          </div>

          <div class="ls-steps">
            ${этапы.map((e, n) => {
              const готов = e.готово >= e.всего;
              const сейчас = n === первыйОткрытый;
              const далеко = первыйОткрытый >= 0 && n > первыйОткрытый;
              /* Зачем этот этап — только у того, за который сейчас садиться:
                 шестнадцать пояснений подряд читать никто не станет. И только
                 первый абзац: дальше в конспекте идут пункты списком, они для
                 экрана шага, а не для «зачем». */
              const зачем = сейчас
                ? String((l.stages || {})[e.g] || "").split("•")[0].trim()
                : "";
              return `
                <button class="ls-step${готов ? " done" : ""}${сейчас ? " now" : ""}"
                  data-lblock="${e.from}" type="button"${далеко ? " disabled" : ""}>
                  <span class="ls-step-n">${готов ? "✓" : n + 1}</span>
                  <span class="ls-step-txt">
                    <b>${esc(e.g || "Этап " + (n + 1))}</b>
                    ${зачем ? `<i>${esc(зачем)}</i>` : ""}
                  </span>
                </button>`;
            }).join("")}
          </div>

          <div class="wk-row">
            <button class="pr-ghost" data-les="toPick">К занятиям</button>
            <button class="pr-ghost" data-prac="finish">Закрыть</button>
          </div>
        </div>
      </div>`;
    return;
  }
```
