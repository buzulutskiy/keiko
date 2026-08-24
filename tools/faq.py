#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Вопросы и ответы к песням — в Кэйко.

Формат входного файла:

    # Песнь I. Совсем вводные вопросы о мире поэмы

    **1. Кто такая Афина?** Богиня разума и ремесла.

    **2. Почему Афина принимает облик Ментеса?** Боги могут менять внешность.

Номер песни берётся из первой строки, вопросы — из строк со звёздочками.

    python3 tools/faq.py odyssey файл1.txt файл2.txt      # заменить эти песни
    python3 tools/faq.py odyssey --all файл1.txt ...      # стереть остальные
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
    ch = 0
    m = re.match(r'^#\s+(?:Песнь|Песня|Глава)\s+([IVXLC]+|\d+)', текст.strip(), re.I)
    if m: ch = номер(m.group(1))
    if not ch: sys.exit("не нашёл номер песни — первая строка должна быть «# Песнь I. …»")
    out = []
    for m in re.finditer(r'^\*\*\s*(\d+)\.\s*(.+?)\*\*\s*(.+)$', текст, re.M):
        q = m.group(2).strip()
        a = m.group(3).strip()
        if q and a: out.append({"ch": ch, "q": q, "a": a})
    return ch, out

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
        ch, список = разобрать(open(путь, encoding="utf-8").read())
        if not список: sys.exit(f"в {путь} не нашлось ни одного вопроса")
        if ch in свежие: sys.exit(f"песнь {ch} встретилась дважды")
        свежие[ch] = список

    d = каталог()                                  # свежее чтение прямо перед записью
    m = d["materials"].setdefault(key, {})
    было = m.get("faq") or []
    оставить = [] if только else [x for x in было if int(x.get("ch") or 0) not in свежие]
    m["faq"] = sorted(оставить + [q for ch in sorted(свежие) for q in свежие[ch]],
                      key=lambda x: int(x.get("ch") or 0))
    d["savedAt"] = int(time.time()*1000)

    body = json.dumps({"files": {"keiko-catalog.json": {"content": json.dumps(d, ensure_ascii=False)}}})
    for _ in range(4):
        r = subprocess.run(["gh","api","-X","PATCH","gists/"+CAT_GIST,"--input","-"],
                           input=body.encode(), capture_output=True)
        if r.returncode == 0:
            по = {}
            for q in m["faq"]: по[q["ch"]] = по.get(q["ch"], 0) + 1
            print(f"вопросов было {len(было)}, стало {len(m['faq'])}")
            print("   песни: " + ", ".join(f"{ch}:{по[ch]}" for ch in sorted(по)))
            return
        time.sleep(5)
    sys.exit("не записалось")

main()
