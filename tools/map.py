#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Карта мест к главам — в Кэйко.

Кладёт в гист картинку карты (data URI, файл art-map-<id>.txt) и точки к
главам — в файл разбора материала, ключ map.

Формат файла точек:

    ## Песнь III
    Пилос (дворец Нестора Пилос) | 36.913 | 21.695 | Город Нестора…
    Итака | 38.42 | 20.68 | Родина Одиссея…

    python3 tools/map.py odyssey точки.txt карта.jpg 18.6 29.2 41.4 34.2
                          ^id     ^точки   ^картинка ^запад ^восток ^север ^юг

Картинка и рамка нужны один раз: дальше можно заливать только точки —
    python3 tools/map.py odyssey точки.txt
"""
import base64, json, re, subprocess, sys, time

CAT_GIST = "8a3a280b21390e3b32569913f9f3cabe"
ART_FILE = lambda key: f"article-{key}.json"
IMG_FILE = lambda key: f"art-map-{key}.txt"
RIM = {"I":1,"II":2,"III":3,"IV":4,"V":5,"VI":6,"VII":7,"VIII":8,"IX":9,"X":10,"XI":11,"XII":12,
       "XIII":13,"XIV":14,"XV":15,"XVI":16,"XVII":17,"XVIII":18,"XIX":19,"XX":20,"XXI":21,
       "XXII":22,"XXIII":23,"XXIV":24}

def номер(s):
    s = s.strip().rstrip(".")
    return int(s) if s.isdigit() else RIM.get(s.upper(), 0)

def разобрать(текст):
    ch, out = 0, []
    for сырая in текст.splitlines():
        line = сырая.strip()
        m = re.match(r'^#+\s*(?:Песнь|Песня|Глава)\s+([IVXLC]+|\d+)', line, re.I)
        if m: ch = номер(m.group(1)); continue
        if not line or line.startswith("#"): continue
        части = [x.strip() for x in line.split("|")]
        if len(части) < 4: continue
        name, lat, lon, t = части[0], части[1], части[2], " | ".join(части[3:])
        if not ch: sys.exit("точка до заголовка песни: " + name)
        # «Огигия (Гоцо Мальта)» — в скобках то, что искать в картинках
        q = ""
        m2 = re.match(r'^(.+?)\s*\((.+)\)$', name)
        if m2: name, q = m2.group(1).strip(), m2.group(2).strip()
        точка = {"ch": ch, "name": name, "lat": float(lat), "lon": float(lon), "t": t}
        if q: точка["q"] = q
        out.append(точка)
    return out

def файл(name, обязателен=True):
    for _ in range(5):
        r = subprocess.run(["gh","api","gists/"+CAT_GIST,"--jq",f'.files["{name}"].raw_url'],
                           capture_output=True, text=True)
        u = r.stdout.strip()
        if u == "null" or (not u and r.returncode == 0):
            if обязателен: sys.exit("нет файла " + name)
            return None
        if u:
            t = subprocess.run(["curl","-s","--retry","3",u], capture_output=True, text=True).stdout
            if t.strip().startswith("{"): return json.loads(t)
        time.sleep(3)
    sys.exit("не прочитать " + name)

def записать(files):
    body = json.dumps({"files": {k: {"content": v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)}
                                 for k, v in files.items()}})
    for _ in range(4):
        r = subprocess.run(["gh","api","-X","PATCH","gists/"+CAT_GIST,"--input","-"],
                           input=body.encode(), capture_output=True)
        if r.returncode == 0: return True
        time.sleep(5)
    sys.exit("не записалось")

def main():
    if len(sys.argv) < 3: sys.exit(__doc__)
    key, путь = sys.argv[1], sys.argv[2]
    точки = разобрать(open(путь, encoding="utf-8").read())
    if not точки: sys.exit("в файле не нашлось ни одной точки")

    pack = файл(ART_FILE(key), False) or {"article": [], "faq": [], "notes": []}
    песни = {p["ch"] for p in точки}
    старые = [p for p in (pack.get("map") or []) if p.get("ch") not in песни]
    pack["map"] = sorted(старые + точки, key=lambda p: (p["ch"], p["name"]))

    files = {ART_FILE(key): pack}
    if len(sys.argv) >= 8:
        карта, west, east, north, south = sys.argv[3], *map(float, sys.argv[4:8])
        raw = open(карта, "rb").read()
        тип = "image/jpeg" if карта.lower().endswith((".jpg", ".jpeg")) else "image/png"
        files[IMG_FILE(key)] = f"data:{тип};base64," + base64.b64encode(raw).decode()
        pack["mapBox"] = {"west": west, "east": east, "north": north, "south": south}
        # версия картинки: по ней приложение поймёт, что старую копию надо забыть
        pack["mapVer"] = int(time.time())
        print(f"карта: {len(raw)} байт, рамка {west}…{east} / {south}…{north}")

    записать(files)
    по = {}
    for p in pack["map"]: по[p["ch"]] = по.get(p["ch"], 0) + 1
    print("точек стало", len(pack["map"]) , "· " + ", ".join(f"песнь {ch}: {по[ch]}" for ch in sorted(по)))

main()
