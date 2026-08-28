#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Музей артефактов — в Кэйко.

Предметы из музеев, привязанные к книгам: что можно пойти и увидеть вживую.
Лежат одним файлом на все книги, чтобы работал общий список и фильтр.

Формат входного файла:

    # odyssey
    1 | Статуя Юпитера | ГР-4155 | Эрмитаж | Новый Эрмитаж, зал 107 | Вживую | Совет богов: Зевс решает… | https://…

    поля: глава | предмет | инв. № | музей | зал или город | статус | почему это здесь | ссылка | запрос | картинка | значок | вид

«Вид» — вещь (по умолчанию), живое или книга. От него зависят подписи и вопрос
поиску: у зверя нет зала и инвентарного номера, у книги нет и доступности.

Последние два поля необязательны. «Запрос» задаётся, когда каталожное имя плохо
ищется: тогда картинки и поиск идут по нему, а не по названию предмета.

Глава и ссылка необязательны — можно оставить пустыми. Строка «# <id книги>»
переключает книгу, так что в одном файле бывает несколько.

    python3 tools/museum.py предметы.txt              # добавить или заменить эти книги
    python3 tools/museum.py --all предметы.txt        # стереть остальное и записать только это
"""
import json, re, subprocess, sys, time

CAT_GIST = "8a3a280b21390e3b32569913f9f3cabe"
MUS_FILE = "museum.json"
СТАТУСЫ = {"вживую", "проверить показ", "только онлайн / запрос", "только онлайн", "в запасниках"}

def разобрать(текст):
    книга, out = "", []
    for сырая in текст.splitlines():
        line = сырая.strip()
        if not line: continue
        m = re.match(r'^#\s*([a-z0-9\-_]+)\s*$', line, re.I)
        if m: книга = m.group(1); continue
        if line.startswith("#"): continue          # заголовок или комментарий
        поля = [x.strip() for x in line.split("|")]
        if len(поля) < 6:
            sys.exit(f"мало полей в строке (нужно хотя бы 6): {line[:70]}")
        if not книга: sys.exit("перед предметами должна идти строка «# <id книги>»")
        гл, имя, инв, музей, место, статус = поля[:6]
        почему = поля[6] if len(поля) > 6 else ""
        ссылка = поля[7] if len(поля) > 7 else ""
        запрос = поля[8] if len(поля) > 8 else ""     # чем искать, если название неудачное
        картинка = поля[9] if len(поля) > 9 else ""   # снимок предмета из базы музея, без размеров
        значок = поля[10] if len(поля) > 10 else ""   # эмодзи в плитке; пусто — подберётся по типу вещи
        вид = поля[11] if len(поля) > 11 else ""      # вещь (по умолчанию) | живое | книга
        # словарь статусов — только про витрину: у зверя и книги он свой
        if (not вид or вид == "вещь") and статус.lower() not in СТАТУСЫ:
            print(f"  ⚠ незнакомый статус «{статус}» у «{имя}»", file=sys.stderr)
        out.append({
            "id": f"{книга}-{len(out)+1}",
            "book": книга,
            "ch": int(гл) if гл.isdigit() else 0,
            "name": имя, "inv": инв, "museum": музей, "place": место,
            "status": статус, "why": почему, "url": ссылка,
            **({"q": запрос} if запрос else {}),
            **({"img": картинка} if картинка else {}),
            **({"icon": значок} if значок else {}),
            **({"kind": вид} if вид and вид != "вещь" else {}),
        })
    return out

def файл(name):
    for _ in range(5):
        r = subprocess.run(["gh", "api", "gists/" + CAT_GIST, "--jq", f'.files["{name}"].raw_url'],
                           capture_output=True, text=True)
        u = r.stdout.strip()
        if u == "null" or (not u and r.returncode == 0): return None    # файла ещё нет
        if u:
            t = subprocess.run(["curl", "-s", "--retry", "3", u], capture_output=True, text=True).stdout
            if t.strip().startswith("{"): return json.loads(t)
        time.sleep(3)
    sys.exit("не прочитать " + name)

def записать(pack):
    body = json.dumps({"files": {MUS_FILE: {"content": json.dumps(pack, ensure_ascii=False)}}})
    for _ in range(4):
        r = subprocess.run(["gh", "api", "-X", "PATCH", "gists/" + CAT_GIST, "--input", "-"],
                           input=body.encode(), capture_output=True)
        if r.returncode == 0: return
        time.sleep(5)
    sys.exit("не записалось")

def main():
    args = [a for a in sys.argv[1:] if a != "--all"]
    только = "--all" in sys.argv
    if not args: sys.exit(__doc__)

    свежие = []
    for путь in args:
        свежие += разобрать(open(путь, encoding="utf-8").read())
    книги = {x["book"] for x in свежие}

    # свежее чтение прямо перед записью: между чтением и записью проходит чужая правка
    pack = файл(MUS_FILE) or {"items": []}
    было = pack.get("items") or []
    оставить = [] if только else [x for x in было if x.get("book") not in книги]
    pack["items"] = оставить + свежие
    pack["savedAt"] = int(time.time() * 1000)
    записать(pack)

    from collections import Counter
    c = Counter(x["book"] for x in pack["items"])
    print(f"предметов было {len(было)}, стало {len(pack['items'])}")
    for k, n in sorted(c.items()): print(f"   {k}: {n}")

main()
