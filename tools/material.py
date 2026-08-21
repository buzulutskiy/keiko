#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Проверка материала перед тем, как сказать «залито».

Ловит ровно те промахи, которые уже случались при добавлении книги:
обложку забыли, факты без «копнуть глубже», награда без текста, страницы
за пределами книги, книга не в том профиле, каталог не сходится с данными.

    python3 tools/material.py stolpy diana
    python3 tools/material.py --all
"""
import json, subprocess, sys, time

DATA_GIST = "67442ecb9e18c230a93fad886b712c4f"
CAT_GIST  = "8a3a280b21390e3b32569913f9f3cabe"

def gist_file(gid, name, tries=5):
    for _ in range(tries):
        u = subprocess.run(["gh", "api", "gists/" + gid, "--jq", f'.files["{name}"].raw_url'],
                           capture_output=True, text=True).stdout.strip()
        if u:
            t = subprocess.run(["curl", "-s", "--retry", "3", u], capture_output=True, text=True).stdout
            if t.strip().startswith(("{", "[", "data:")):
                return t
        time.sleep(3)
    raise SystemExit(f"не прочитать {name}")

def has_file(gid, name):
    """Пустой ответ — это сбой сети, а не отсутствие файла: молча считать
    его за «нет» нельзя, ложная тревога хуже отсутствия проверки."""
    for _ in range(4):
        out = subprocess.run(["gh", "api", "gists/" + gid, "--jq", ".files | keys[]"],
                             capture_output=True, text=True).stdout.split()
        if out:
            return name in out
        time.sleep(3)
    raise SystemExit("не прочитать опись каталога — проверка не выполнена")

ОК, ОШ = [], []
def проверь(cond, good, bad):
    (ОК if cond else ОШ).append(good if cond else bad)

def check(key, profile):
    cat = json.loads(gist_file(CAT_GIST, "keiko-catalog.json"))
    prof = json.loads(gist_file(DATA_GIST, f"keiko-{profile}.json"))

    book = next((b for b in prof.get("book", {}).get("books", []) if b.get("id") == key), None)
    проверь(book, f"книга есть в профиле «{profile}»", f"книги «{key}» нет в профиле «{profile}»")
    if not book:
        return

    # ── поля книги ──
    for f in ("id", "title", "author", "pages"):
        проверь(book.get(f), f"есть {f}: {str(book.get(f))[:40]}", f"не заполнено поле {f}")
    проверь(isinstance(book.get("pages"), int) and book["pages"] > 0,
            f"страниц: {book.get('pages')}", "pages должно быть числом больше нуля")
    проверь(book.get("art") in ("wave", "pine", "quill", "lamp"),
            f"art: {book.get('art')}", f"art должен быть wave/pine/quill/lamp, а не {book.get('art')!r}")
    проверь(book.get("tone") in ("violet", "sea", "snow", "night", "wine", "forest", "pastel"),
            f"tone: {book.get('tone')}", f"неизвестный tone {book.get('tone')!r}")
    проверь(book.get("ratio"), f"ratio: {book.get('ratio')}", "не задан ratio — обложка поедет по пропорциям")

    ch = book.get("chapters") or []
    проверь(ch, f"глав: {len(ch)}", "нет содержания — приложение не покажет текущую главу")
    if ch:
        порядок = all(ch[i]["from"] <= ch[i + 1]["from"] for i in range(len(ch) - 1))
        проверь(порядок, "главы идут по возрастанию", "главы не по порядку — chapterAt соврёт")
        за = [c["name"] for c in ch if c["from"] > book["pages"]]
        проверь(not за, "все главы внутри книги", f"главы за пределами книги: {за}")

    # ── материал в каталоге ──
    m = cat.get("materials", {}).get(key)
    проверь(m, "материал есть в каталоге", f"в каталоге нет материала «{key}» — не будет ни наград, ни карточек")
    if not m:
        return

    # ── обложка ──
    if m.get("cover"):
        проверь(has_file(CAT_GIST, f"cover-{key}.txt"),
                f"обложка cover-{key}.txt на месте", f"cover: true, но файла cover-{key}.txt нет")
    else:
        ОШ.append("обложки нет (cover не true) — покажется рисованная заглушка")

    # ── награды ──
    ach, words = m.get("ach") or [], m.get("words") or {}
    проверь(ach, f"наград: {len(ach)}", "нет наград")
    ids = [a.get("id") for a in ach]
    проверь(len(set(ids)) == len(ids), "id наград уникальны", f"повторы id: {[i for i in ids if ids.count(i) > 1]}")
    без = [a["id"] for a in ach if a["id"] not in words]
    проверь(not без, "у всех наград есть текст", f"награды без текста в words: {без}")
    лишние = [w for w in words if w not in ids]
    проверь(not лишние, "лишних текстов нет", f"текст есть, а награды нет: {лишние}")
    for a in ach:
        for f in ("icon", "name", "hint", "when"):
            if not a.get(f) and f != "hint":
                ОШ.append(f"награда {a.get('id')}: не заполнено {f}")
    стр = [a["id"] for a in ach for c in a.get("when", [])
           if c[0] == "page" and c[2] > book["pages"]]
    проверь(not стр, "награды не просят страниц больше, чем есть", f"недостижимы по страницам: {стр}")
    заметки = [a["id"] for a in ach for c in a.get("when", []) if c[0] == "notes"]
    проверь(not заметки, "нет наград за заметки", f"поле заметки убрано из приложения, недостижимо: {заметки}")

    # ── карточки знаний ──
    facts = m.get("facts") or []
    проверь(facts, f"карточек: {len(facts)}", "нет карточек знаний")
    for i, f in enumerate(facts):
        if not f.get("t") or not f.get("x"):
            ОШ.append(f"карточка {i}: нет t или x")
        if len(f.get("more") or []) != 2:
            ОШ.append(f"карточка {i} «{str(f.get('t'))[:30]}»: нужно ровно два «копнуть глубже», сейчас {len(f.get('more') or [])}")
        if f.get("page", 0) > book["pages"]:
            ОШ.append(f"карточка {i}: страница {f['page']} за пределами книги")
    коротко = [i for i, f in enumerate(facts) if len(f.get("x", "")) < 150]
    проверь(not коротко, "карточки достаточно развёрнуты", f"слишком короткий текст в карточках: {коротко}")

def main():
    if len(sys.argv) >= 3:
        пары = [(sys.argv[1], sys.argv[2])]
    else:
        prof_ids = ("anton", "diana")
        пары = []
        for p in prof_ids:
            d = json.loads(gist_file(DATA_GIST, f"keiko-{p}.json"))
            for b in d.get("book", {}).get("books", []):
                if not b.get("archived"):
                    пары.append((b["id"], p))
    for key, prof in пары:
        ОК.clear(); ОШ.clear()
        print(f"\n══ {key} · профиль {prof}")
        check(key, prof)
        for s in ОК: print("  ✓", s)
        for s in ОШ: print("  ✗", s)
        print("  ИТОГ:", "готово к работе" if not ОШ else f"НЕ ГОТОВО, промахов: {len(ОШ)}")

main()
