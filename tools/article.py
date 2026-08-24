#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Разборы песен (книжный клуб) — в Кэйко.

Формат входного файла (обычный markdown):

    # Песнь I. Дом, в котором сын ещё не может действовать
    ## Какой мир мы видим в «Одиссее»
    Абзац. Абзацы разделяются пустой строкой.
    ## Источники
    Гомер. «Одиссея», песнь I.

Номер песни берётся из первой строки (римский или арабский).
Заголовок после точки становится подзаголовком разбора в списке клуба.
Раздел «Источники» кладётся отдельными блоками — мелким шрифтом.

    python3 tools/article.py odyssey файл1.txt файл2.txt      # заменить эти песни
    python3 tools/article.py odyssey --all файл1.txt ...      # стереть остальные и записать только эти
"""
import json, re, subprocess, sys, time

CAT_GIST = "8a3a280b21390e3b32569913f9f3cabe"
RIM = {"I":1,"II":2,"III":3,"IV":4,"V":5,"VI":6,"VII":7,"VIII":8,"IX":9,"X":10,"XI":11,"XII":12,
       "XIII":13,"XIV":14,"XV":15,"XVI":16,"XVII":17,"XVIII":18,"XIX":19,"XX":20,"XXI":21,
       "XXII":22,"XXIII":23,"XXIV":24}

def номер(s):
    s = s.strip().rstrip(".")
    return int(s) if s.isdigit() else RIM.get(s.upper(), 0)

def разобрать(текст):
    ch, блоки, источники = 0, [], False
    буфер = []
    def слить():
        if буфер:
            t = " ".join(буфер).strip()
            буфер.clear()
            if t: блоки.append({"note": t} if источники else {"p": t})
    for сырая in текст.splitlines():
        line = сырая.strip()
        m = re.match(r'^#\s+(?:Песнь|Песня|Глава)\s+([IVXLC]+|\d+)\s*[.:]?\s*(.*)$', line, re.I)
        if m:
            слить()
            ch = номер(m.group(1))
            if m.group(2).strip(): блоки.append({"t": m.group(2).strip()})
            continue
        m = re.match(r'^#{2,}\s+(.+)$', line)
        if m:
            слить()
            источники = bool(re.match(r'^источник', m.group(1), re.I))
            блоки.append({"h": m.group(1).strip()})
            continue
        if not line:
            слить(); continue
        буфер.append(line)
    слить()
    if not ch: sys.exit("не нашёл номер песни — первая строка должна быть «# Песнь I. Заголовок»")
    return ch, [{"ch": ch, **б} for б in блоки]

def каталог():
    for _ in range(5):
        u = subprocess.run(["gh","api","gists/"+CAT_GIST,"--jq",'.files["keiko-catalog.json"].raw_url'],
                           capture_output=True, text=True).stdout.strip()
        if u:
            t = subprocess.run(["curl","-s","--retry","3",u], capture_output=True, text=True).stdout
            if t.strip().startswith("{"): return json.loads(t)
        time.sleep(3)
    sys.exit("не прочитать каталог")

def main():
    args = [a for a in sys.argv[1:] if a != "--all"]
    только = "--all" in sys.argv
    if len(args) < 2: sys.exit(__doc__)
    key, пути = args[0], args[1:]

    свежие = {}
    for путь in пути:
        ch, блоки = разобрать(open(путь, encoding="utf-8").read())
        if ch in свежие: sys.exit(f"песнь {ch} встретилась дважды")
        свежие[ch] = блоки

    d = каталог()                                  # свежее чтение прямо перед записью
    m = d["materials"].setdefault(key, {})
    было = m.get("article") or []
    оставить = [] if только else [x for x in было if int(x.get("ch") or 0) not in свежие]
    m["article"] = sorted(оставить + [б for ch in sorted(свежие) for б in свежие[ch]],
                          key=lambda x: int(x.get("ch") or 0))
    d["savedAt"] = int(time.time()*1000)

    body = json.dumps({"files": {"keiko-catalog.json": {"content": json.dumps(d, ensure_ascii=False)}}})
    for _ in range(4):
        r = subprocess.run(["gh","api","-X","PATCH","gists/"+CAT_GIST,"--input","-"],
                           input=body.encode(), capture_output=True)
        if r.returncode == 0:
            по = {}
            for б in m["article"]: по[б["ch"]] = по.get(б["ch"], 0) + 1
            print(f"блоков было {len(было)}, стало {len(m['article'])}")
            for ch in sorted(по): print(f"   песнь {ch}: {по[ch]} блоков")
            return
        time.sleep(5)
    sys.exit("не записалось")

main()
