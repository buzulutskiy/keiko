# Встроенный плеер лекции

Жил один релиз (Кэйко 314). Занятие курса в режиме `watch` открывало окно с
`<video controls>`: файл выбирался с устройства, ложился в Cache Storage через
`videoSave`, ролик стартовал с запомненной секунды, а позиция писалась раз в
четыре секунды и на паузе. Убран 30 августа 2026 — оказалось проще отмечать
минуты руками, как страницы в книге, и смотреть в чём угодно.

## Как вернуть

1. Вставить код ниже рядом с `lcWhen` в app.js.
2. В экране `watch` вернуть `<div class="lc-frame" id="lcFrame"></div>`,
   поле `<input type="file" accept="video/*" id="lcFile">` и вызовы
   `lcMount(at.i)` плюс слушатель `change` на поле.
3. Стили `.lc-frame`, `.lc-empty`, `.lc-file` в index.html.

```js
let lcSaveAt = 0;
async function lcMount(i) {
  const frame = $("#lcFrame");
  if (!frame) return;
  const url = await videoLoad(lessonVidId(i));
  if (!prac || prac.screen !== "watch") return;
  if (!url) {
    frame.innerHTML = `<div class="lc-empty">Видео этого занятия ещё нет на устройстве.
      Выбери файл — он останется здесь и в сеть не уйдёт.</div>`;
    return;
  }
  const s = seenOf(i);
  frame.innerHTML = `<video controls playsinline preload="metadata" src="${esc(url)}"></video>`;
  const v = frame.querySelector("video");
  v.addEventListener("loadedmetadata", () => {
    /* К самому концу не возвращаемся: досмотрел — значит в следующий раз
       открывать надо сначала, а не на титрах. */
    const конец = v.duration && s.at >= v.duration - 3;
    if (s.at && !конец) v.currentTime = s.at;
    seenSet(i, конец ? 0 : s.at, v.duration);
    lcWhen(i);
  });
  const пиши = () => {
    const t = Date.now();
    if (t - lcSaveAt < 4000) return;          // раз в четыре секунды, а не каждый кадр
    lcSaveAt = t;
    seenSet(i, v.currentTime, v.duration);
    lcWhen(i);
  };
  v.addEventListener("timeupdate", пиши);
  v.addEventListener("pause", () => { lcSaveAt = 0; пиши(); });
  v.addEventListener("ended", () => { seenSet(i, v.duration, v.duration); lcWhen(i); });
}
```
