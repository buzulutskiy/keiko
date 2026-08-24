#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Разборы и вопросы — из общего каталога в отдельный файл на материал.

Каталог тянется целиком при каждом обновлении содержимого, а разборы читают
редко и по одному материалу. Поэтому они живут отдельными файлами
article-<id>.json и грузятся, только когда открываешь раздел.

    python3 tools/split.py            # перенести всё, что ещё в каталоге
"""
import json, subprocess, sys, time

CAT_GIST = "8a3a280b21390e3b32569913f9f3cabe"
CAT_FILE = "keiko-catalog.json"
ART_FILE = lambda key: f"article-{key}.json"

def прочитать(name, обязателен=True):
    for _ in range(5):
        r = subprocess.run(["gh","api","gists/"+CAT_GIST,"--jq",f'.files["{name}"].raw_url'],
                           capture_output=True, text=True)
        u = r.stdout.strip()
        if u == "null" or (not u and r.returncode == 0):
            if обязателен: sys.exit("нет файла " + name)
            return None                      # файла ещё нет — это нормально
        if u:
            t = subprocess.run(["curl","-s","--retry","3",u], capture_output=True, text=True).stdout
            if t.strip().startswith("{"): return json.loads(t)
        time.sleep(3)
    sys.exit("не прочитать " + name)

def записать(files):
    body = json.dumps({"files": {k: {"content": json.dumps(v, ensure_ascii=False)} for k, v in files.items()}})
    for _ in range(4):
        r = subprocess.run(["gh","api","-X","PATCH","gists/"+CAT_GIST,"--input","-"],
                           input=body.encode(), capture_output=True)
        if r.returncode == 0: return True
        time.sleep(5)
    sys.exit("не записалось")

def main():
    d = прочитать(CAT_FILE)
    files, отчёт = {}, []
    for key, m in (d.get("materials") or {}).items():
        art, faq, notes = m.get("article"), m.get("faq"), m.get("notes")
        if not art and not faq and not notes: continue
        было = прочитать(ART_FILE(key), False) or {}
        свод = {"article": art or было.get("article") or [],
                "faq": faq or было.get("faq") or [],
                "notes": notes or было.get("notes") or []}
        files[ART_FILE(key)] = свод
        m.pop("article", None); m.pop("faq", None); m.pop("notes", None)
        m["arts"] = True                      # каталогу достаточно знать, что файл есть
        отчёт.append(f"{key}: разборов {len(свод['article'])}, вопросов {len(свод['faq'])}, "
                     f"комментариев {len(свод['notes'])}")
    if not files: print("в каталоге разборов нет — переносить нечего"); return
    d["savedAt"] = int(time.time()*1000)
    files[CAT_FILE] = d
    записать(files)
    print("\n".join(отчёт))
    print("каталог стал легче:", len(json.dumps(d, ensure_ascii=False)), "байт")

main()
