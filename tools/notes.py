#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Свои комментарии к книге — в Кэйко.

Формат входного файла:

    ## Песнь I
    1–10 | Зачин
    Текст комментария. Может занимать
    несколько строк подряд.

    1 | Муза
    Следующий комментарий — после пустой строки.

Номер песни: римский или арабский. Заголовок после «|» можно опустить.
Порядок комментариев внутри песни сохраняется.

    python3 tools/notes.py odyssey мои-комментарии.txt
    python3 tools/notes.py odyssey мои-комментарии.txt --add   # дописать к тем, что есть
"""
import json, re, subprocess, sys, time

CAT_GIST = "8a3a280b21390e3b32569913f9f3cabe"
RIM = {"I":1,"II":2,"III":3,"IV":4,"V":5,"VI":6,"VII":7,"VIII":8,"IX":9,"X":10,"XI":11,"XII":12,
       "XIII":13,"XIV":14,"XV":15,"XVI":16,"XVII":17,"XVIII":18,"XIX":19,"XX":20,"XXI":21,
       "XXII":22,"XXIII":23,"XXIV":24}

def номер(s):
    s = s.strip().rstrip(".")
    if s.isdigit(): return int(s)
    return RIM.get(s.upper(), 0)

def разобрать(текст):
    песнь, out, текущий = 0, [], None
    for сырая in текст.splitlines():
        line = сырая.rstrip()
        m = re.match(r'^\s*#+\s*(?:Песнь|Песня|Глава)?\s*([IVXLC]+|\d+)\s*$', line, re.I)
        if m:
            if текущий: out.append(текущий); текущий = None
            песнь = номер(m.group(1)); continue
        m = re.match(r'^\s*([\d–—\-–—, ]+?)\s*\|\s*(.*)$', line)
        if m and re.search(r'\d', m.group(1)):
            if текущий: out.append(текущий)
            текущий = {"ch": песнь, "line": m.group(1).strip(), "t": m.group(2).strip(), "x": ""}
            continue
        if not line.strip():
            if текущий: out.append(текущий); текущий = None
            continue
        if текущий:
            текущий["x"] = (текущий["x"] + " " + line.strip()).strip()
    if текущий: out.append(текущий)
    return [n for n in out if n["x"] or n["t"]]

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
    if len(sys.argv) < 3: sys.exit(__doc__)
    key, путь = sys.argv[1], sys.argv[2]
    дописать = "--add" in sys.argv

    новые = разобрать(open(путь, encoding="utf-8").read())
    if not новые: sys.exit("в файле не нашлось ни одного комментария — проверь формат")
    без_песни = [n for n in новые if not n["ch"]]
    if без_песни: sys.exit(f"у {len(без_песни)} комментариев нет песни: добавь строку «## Песнь I»")

    d = каталог()                                  # свежее чтение прямо перед записью
    m = d["materials"].setdefault(key, {})
    было = m.get("notes") or []
    m["notes"] = (было + новые) if дописать else новые
    d["savedAt"] = int(time.time()*1000)

    body = json.dumps({"files": {"keiko-catalog.json": {"content": json.dumps(d, ensure_ascii=False)}}})
    for _ in range(4):
        r = subprocess.run(["gh","api","-X","PATCH","gists/"+CAT_GIST,"--input","-"],
                           input=body.encode(), capture_output=True)
        if r.returncode == 0:
            по_песням = {}
            for n in m["notes"]: по_песням[n["ch"]] = по_песням.get(n["ch"], 0) + 1
            print(f"было {len(было)}, стало {len(m['notes'])}")
            for ch in sorted(по_песням): print(f"   песнь {ch}: {по_песням[ch]}")
            return
        time.sleep(5)
    sys.exit("не записалось")

main()
