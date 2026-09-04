#!/usr/bin/env python3
"""Проверка на спойлеры: карта, карточки и артефакты всех книг сразу.

Правило одно (SPRAVKI.md → «Без спойлеров»): запись, привязанная к главе N,
не рассказывает о том, что случится позже N, и вообще не пересказывает событий —
ни этой книги, ни любой другой, на которую ссылается.

Скрипт не решает за человека: он вытаскивает подозрительные предложения, чтобы
их перечитали глазами. Смерть реального человека в биографии — не спойлер,
смерть героя — спойлер, и отличить это может только читающий.

    python3 tools/spoilers.py            # все книги
    python3 tools/spoilers.py unizhennye # одна
"""
import json, re, subprocess, sys

КАТАЛОГ = "8a3a280b21390e3b32569913f9f3cabe"

# Глаголы события, а не описания. Ловим широко: лишний шум дешевле пропуска.
СЛОВА = re.compile(
    r"(убива|убьёт|убил|погиб|умира|умрёт|умер|смерть его|в финале|в конце книги"
    r"|в конце романа|кончается тем|оказыв|выясн|разоблач|предат|окажется"
    r"|станет ясно|в итоге|потом он|потом она|позже он|позже она|сойдёт с ума"
    r"|самоубий|повес(ит|илс)|сходит с ума|признаётся|раскрыв)", re.I)


def гист():
    r = subprocess.run(["gh", "api", "gists/" + КАТАЛОГ], capture_output=True, text=True)
    if r.returncode:
        sys.exit("гист не читается: " + r.stderr[:200])
    return json.loads(r.stdout)


def файл(g, имя):
    f = g["files"][имя]
    # большие файлы гист отдаёт обрезанными — тогда идём за raw_url
    if f.get("truncated"):
        return json.loads(subprocess.run(["curl", "-s", "--retry", "3", f["raw_url"]],
                                         capture_output=True, text=True).stdout)
    return json.loads(f["content"])


def предложения(текст):
    return [s.strip() for s in re.split(r"(?<=[.!?]) ", текст) if СЛОВА.search(s)]


def main():
    только = sys.argv[1] if len(sys.argv) > 1 else None
    g = гист()
    книги = sorted(n[8:-5] for n in g["files"] if n.startswith("article-"))
    if только:
        книги = [b for b in книги if b == только] or sys.exit("нет такой книги: " + только)

    всего = хитов = 0
    for bk in книги:
        d = файл(g, "article-%s.json" % bk)
        строки = []
        for p in d.get("map", []):
            всего += 1
            гл = p.get("part") or p.get("ch") or 0
            for s in предложения(p.get("about", "") + " " + p.get("t", "")):
                строки.append("  гл.%s · %s · %s\n    %s" % (гл, p.get("kind", "place"), p["name"], s))
        for f in d.get("facts", []):
            всего += 1
            т = f.get("t", "") if isinstance(f, dict) else str(f)
            for s in предложения(т):
                строки.append("  карточка · %s\n    %s" % (f.get("h", "") if isinstance(f, dict) else "", s))
        if строки:
            print("\n=== %s ===" % bk)
            print("\n".join(строки))
            хитов += len(строки)

    # ── Ступени времени ──
    # Открываются по дням, а не по прочитанному: награда на полгода придёт и
    # к тому, кто на трети книги. Значит её текст должен быть верен с любого
    # места — и проверять его надо тем же ситом.
    кат = файл(g, "keiko-catalog.json")
    строки = []
    for mid, m in (кат.get("materials") or {}).items():
        if только and mid != только:
            continue
        fl = m.get("flavor")
        if not isinstance(fl, dict):
            continue
        for k, v in fl.items():
            if not isinstance(v, dict) or not v.get("word"):
                continue
            всего += 1
            for s in предложения(v["word"]):
                строки.append("  %s · %s · %s\n    %s" % (mid, k, v.get("name", ""), s))
        # и слова у самих наград: у наград по обстоятельствам они с фактами
        for a in m.get("ach", []):
            if not a.get("word"):
                continue
            всего += 1
            for s in предложения(a["word"]):
                строки.append("  %s · %s · %s\n    %s" % (mid, a["id"], a.get("name", ""), s))
    if строки:
        print("\n=== ступени времени ===")
        print("\n".join(строки))
        хитов += len(строки)

    м = файл(g, "museum.json")
    вещи = м.get("items", м if isinstance(м, list) else [])
    строки = []
    for x in вещи:
        if x.get("deleted") or (только and x.get("book") != только):
            continue
        всего += 1
        for s in предложения(x.get("why", "") + " " + x.get("about", "")):
            строки.append("  %s · гл.%s · %s\n    %s" % (x.get("book", ""), x.get("ch"), x.get("name"), s))
    if строки:
        print("\n=== артефакты ===")
        print("\n".join(строки))
        хитов += len(строки)

    print("\nпроверено записей: %d · подозрительных предложений: %d" % (всего, хитов))
    print("Каждое перечитать: событие книги — переписать, факт о реальном человеке — оставить.")


if __name__ == "__main__":
    main()
