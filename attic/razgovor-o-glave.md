# «Разговор о главе» — стили

Раздел показывал по прочитанной главе наблюдение, вопрос и несколько версий
ответа: `.tk-block` с `.tk-see`, `.tk-q` и списком `.tk-opts`/`.tk-opt`, внизу
`.tk-why` и `.tk-end`. Сам раздел убрали раньше, а стили остались и мешали:
объявление `.tk-list` из этого блока перебивало живой список записей игры —
тот получал `display: grid` и отступ 26 пикселей вместо `flex` и 12.

Убрано 31 августа 2026.

## Как вернуть

Вставить блок ниже в index.html и переименовать в нём `.tk-list` — это имя
занято списком записей игры (объявлен выше, рядом с `.tk-row` и `.tk-head`).

```css
    /* Разговор о главе: наблюдение, вопрос, версии ответа. */
    .tk-list { display: grid; gap: 26px; margin-top: 12px; text-align: left; }
    .tk-block h4 { margin: 0 0 8px; font-size: 1.06rem; font-weight: 750; }
    .tk-see { margin: 0 0 10px; font-size: 0.98rem; line-height: 1.6; color: var(--ink); }
    .tk-q {
      margin: 0 0 12px; padding-left: 12px; border-left: 2px solid rgba(255,201,77,.5);
      font-size: 0.95rem; line-height: 1.55; color: var(--muted);
    }
    .tk-opts { display: grid; gap: 7px; }
    .tk-opt {
      display: grid; grid-template-columns: 24px 1fr; gap: 10px; align-items: start;
      text-align: left; padding: 11px 13px; border-radius: 13px;
      background: var(--glass); border: 1px solid var(--glass-line);
      font-size: 0.92rem; line-height: 1.45; color: var(--muted);
    }
    .tk-opt i {
      font-style: normal; font-weight: 700; color: var(--dim);
      text-align: center; line-height: 1.45;
    }
    .tk-opt.on {
      background: rgba(255, 201, 77, 0.12); border-color: rgba(255, 201, 77, 0.45);
      color: var(--ink);
    }
    .tk-opt.on i { color: var(--gold); }
    .tk-why {
      margin: 10px 0 0; padding: 11px 13px; border-radius: 12px;
      background: rgba(139, 124, 246, 0.1); border: 1px solid rgba(139, 124, 246, 0.25);
      font-size: 0.92rem; line-height: 1.55; color: var(--ink);
    }
    .tk-end {
      margin: 18px 0 0; padding: 14px 15px; border-radius: 13px;
      background: var(--card-2); border: 1px solid var(--line);
    }
    .tk-end > p { margin: 0 0 12px; font-size: 0.95rem; line-height: 1.55; }
    .tk-end .tk-opts { gap: 6px; }
```
