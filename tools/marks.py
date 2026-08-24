#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Разметка записи по тактам — в разбор пьесы.

Вход — строки вида:

    Такт 1: 0:00.00 – 0:06.36 (6.36 с)
    Такт 2: 0:06.36 – 0:10.64 (4.29 с)

Берётся только начало каждого такта; конец такта — это начало следующего.
Последняя строка нужна как граница: её начало закрывает предыдущий такт.

    python3 tools/marks.py bwv853 разметка.txt
    python3 tools/marks.py bwv853 разметка.txt --clear   # стереть прежнюю разметку
"""
import json, re, subprocess, sys, time

CAT_GIST = "8a3a280b21390e3b32569913f9f3cabe"
PRAC_FILE = "keiko-practice.json"

def секунды(s):
    m = re.match(r'^(?:(\d+):)?(\d+(?:[.,]\d+)?)$', s.strip())
    if not m: return None
    мин = int(m.group(1) or 0)
    сек = float(m.group(2).replace(",", "."))
    return round(мин * 60 + сек, 3)

def разобрать(текст):
    out = {}
    for line in текст.splitlines():
        m = re.match(r'^\s*(?:Такт|такт)\s*(\d+)\s*[:—-]\s*([0-9:.,]+)', line)
        if not m: continue
        t = секунды(m.group(2))
        if t is None: continue
        out[int(m.group(1))] = t
    return out

def разбор():
    for _ in range(5):
        u = subprocess.run(["gh","api","gists/"+CAT_GIST,"--jq",f'.files["{PRAC_FILE}"].raw_url'],
                           capture_output=True, text=True).stdout.strip()
        if u:
            t = subprocess.run(["curl","-s","--retry","3",u], capture_output=True, text=True).stdout
            if t.strip().startswith("{"): return json.loads(t)
        time.sleep(3)
    sys.exit("не прочитать разбор")

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) < 2: sys.exit(__doc__)
    key, путь = args[0], args[1]
    новые = разобрать(open(путь, encoding="utf-8").read())
    if not новые: sys.exit("в файле не нашлось ни одной строки вида «Такт 1: 0:00.00 – …»")

    d = разбор()                                   # свежее чтение прямо перед записью
    doc = d.setdefault(key, {})
    было = {} if "--clear" in sys.argv else (doc.get("marks") or {})
    marks = {str(k): v for k, v in {**{int(x): y for x, y in было.items()}, **новые}.items()}
    doc["marks"] = {k: marks[k] for k in sorted(marks, key=lambda x: int(x))}

    body = json.dumps({"files": {PRAC_FILE: {"content": json.dumps(d, ensure_ascii=False)}}})
    for _ in range(4):
        r = subprocess.run(["gh","api","-X","PATCH","gists/"+CAT_GIST,"--input","-"],
                           input=body.encode(), capture_output=True)
        if r.returncode == 0:
            ks = sorted(doc["marks"], key=lambda x: int(x))
            print(f"{key}: тактов размечено {len(ks)} — с {ks[0]}-го по {ks[-1]}-й")
            return
        time.sleep(5)
    sys.exit("не записалось")

main()
