#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Книга целиком: от epub до залитого материала, за два захода.

Заводить книгу вручную — это восемьдесят вызовов оболочки и четыре прохода по
одному и тому же: прочитать гист, поправить, залить, перечитать. Здесь то же
самое делается двумя командами, а всё, что можно посчитать, считается само.

    python3 tools/book.py scan книга.epub [id]
        Конвертирует epub в markdown, разбирает заголовки, вычисляет, где
        кончается текст, и раскидывает по главам три сети: топонимы,
        сноски издания и слова из словаря эпохи. Печатает каркас спеки.

Что здесь делает скрипт и что человек — граница жёсткая:

    скрипт    конвертация, заголовки, оценка последней страницы, координаты,
              плитки карты и рамка, обложка, одна запись на всё, проверки
    читающий  какие слова этой книги и этого автора стоит собирать, как
              назвать темы, за что давать награды, что написать в справке

Сети из scan — это невод, а не улов. Словарь эпохи в нём один на все книги, и
он заведомо не знает, что «блонды» у Гоголя двадцать раз читаются сегодня как
«блондинки», а у другого автора это слово не встретится вовсе. Единственная
по-настоящему книжная подсказка здесь — сноски издания: их составитель уже
решил, что без пояснения непонятно. У «Униженных» это «плащ-накидка с круглым
воротником» и «т.е. латунный», у «Петербургских повестей» — одни переводы с
французского, и сеть остаётся пустой. Так и должно быть: сеть показывает, где
искать, а выбирает читающий.

Четвёртая сеть — редкие слова книги по частоте — пробовалась и убрана: без
корпуса частотность не считается, и она выдавала «адского», «актеров»,
«английские». Полусеть хуже, чем её отсутствие: на неё смотришь.

    python3 tools/book.py check спека.json
        Те же проверки, но ничего не заливая: спеку правят по многу раз.

    python3 tools/book.py build спека.json
        Одним заходом: текст и обложка в каталог, запись в профиль, опись с
        наградами и темами, карта с координатами по геокодеру, подложка из
        плиток OSM, — и сразу проверки: достижимость наград, плотность
        собрания, «до чтения не открыто ничего», спойлеры.

Спека — один json. Обязательное:

    id, профиль, title, author, pages, chapters[{name, from}], epub, cover
    ach[], words{}, themes[], map[]

У записи карты либо lat/lon, либо «где» — строка для геокодера; координаты
подставятся сами и лягут обратно в спеку, чтобы второй раз не искать.
"""
import base64, json, math, os, re, subprocess, sys, time, urllib.parse, urllib.request

ПРОФИЛИ = "67442ecb9e18c230a93fad886b712c4f"
КАТАЛОГ = "8a3a280b21390e3b32569913f9f3cabe"
EPUB2MD = os.path.expanduser("~/Documents/Хобби/knigi-dlya-ii/epub2md.py")
АГЕНТ   = "keiko-personal/1.0 (private reading app, non-commercial)"
ЗДЕСЬ   = os.path.dirname(os.path.abspath(__file__))
КЭШГЕО  = os.path.join(ЗДЕСЬ, ".geo-cache.json")


# ── гисты ──────────────────────────────────────────────────────────────────

def гист(gid, имя, попыток=5):
    """Содержимое файла гиста. Через raw_url: опись гиста весит мегабайт."""
    for _ in range(попыток):
        u = subprocess.run(["gh", "api", "gists/" + gid, "--jq", f'.files["{имя}"].raw_url'],
                           capture_output=True, text=True).stdout.strip()
        if u:
            т = subprocess.run(["curl", "-s", "--retry", "3", u], capture_output=True, text=True).stdout
            if т: return т
        time.sleep(1.5)
    return ""

def залить(gid, файлы):
    """Один PATCH на все файлы разом: каждая отдельная запись — это новая
       ревизия гиста и лишняя секунда ожидания."""
    тело = json.dumps({"files": {k: {"content": v} for k, v in файлы.items()}}, ensure_ascii=False)
    r = subprocess.run(["gh", "api", "-X", "PATCH", "gists/" + gid, "--input", "-"],
                       input=тело, capture_output=True, text=True)
    if r.returncode: sys.exit("не залилось: " + r.stderr[:300])


# ── разведка ───────────────────────────────────────────────────────────────

СЛОВАРЬ = """фризов манишк бекеш тулуп фуфайк армяк салоп капот кисейн батист гроденапл
левантин нанк тафт кашемир шаль муслин блонд гипюр шандал канделябр ломберн комод ширм
геридон табакерк чубук сбитен ерофеич сивух пунш кулебяк расстега ботвинь просвир
подьяч регистратор экзекутор столоначальник камергер камер-юнкер денщик лаке швейцар
кучер форейтор дрожк линейк ванька лихач одноколк бричк вертопрах фанфарон щеголь франт
фалд обшлаг лацкан петлиц эполет темляк аксельбант позумент галун штоф косушк шкалик
четвертак полтин гривенн алтын грош ассигнац бельведер мезонин антресол флигел
лоскутн ветошн толкуч фортепьян клавикорд шарманк органчик сюртук вицмундир фрак
шинел бобров куниц смушк каракул пряничн кондитерск ресторац кухмистерск трактир
брандмейстер будочник алебард каланч съезж чухон бурлак мещан купчих просвирн
пасквил фельетон водевил бенефис раёк нюхательн скарлатин чахотк лихорадк горячк
золотух подагр десятин верст сажен аршин вершок фунт пуд золотник целков ломбард
ростовщик вексел закладн духовн опек богадельн острог каторг розг шпицрутен
титулярн коллежск асессор надворн статск советник департамент канцеляр сенат"""

УКАЗАТЕЛИ = (r'(?:улиц\w*|проспект\w*|мост\w*|сад\w*|двор\w*|част[иья]|рынк\w*|рынок|'
             r'остров\w*|набережн\w*|переул\w*|площад\w*|канал\w*|лини[июя]\w*|застав\w*|'
             r'слобод\w*|собор\w*|церкв\w*|бульвар\w*|кладбищ\w*|ворот\w*)')

def главы_файла(текст):
    """Заголовки «## Глава N. Имя» и объём каждой в знаках."""
    куски = re.split(r'^## ', текст, flags=re.M)[1:]
    из = []
    for k in куски:
        имя = k.split("\n")[0].strip()
        if re.match(r'^(Перед текстом|Оглавление|Над книгой|Сноски)', имя): continue
        из.append((re.sub(r'^Глава \d+\.\s*', "", имя), len(k)))
    return из

def последняя_страница(главы, оглавление):
    """Где кончается текст. В томе есть титул, содержание и выходные данные, и
       ставить `pages` по числу страниц издания значит сделать сто процентов
       недостижимыми. Считаем по плотности знаков на страницу у тех глав, чьи
       границы известны из оглавления."""
    if len(оглавление) < 2: return None
    плотн = []
    for i in range(len(оглавление) - 1):
        стр = оглавление[i + 1] - оглавление[i]
        if стр > 0 and i < len(главы): плотн.append(главы[i][1] / стр)
    if not плотн: return None
    ср = sum(плотн) / len(плотн)
    хвост = главы[len(оглавление) - 1][1] if len(главы) >= len(оглавление) else 0
    return round(оглавление[-1] + хвост / ср), round(ср)

def разведка(epub, key=None):
    md = subprocess.run([sys.executable, EPUB2MD, epub], capture_output=True, text=True)
    путь = ""
    for s in (md.stdout + md.stderr).splitlines():
        if s.strip().endswith(".md"): путь = s.strip()
    if not путь or not os.path.exists(путь): sys.exit("epub не сконвертировался:\n" + md.stderr[:400])
    текст = open(путь, encoding="utf-8").read()
    главы = главы_файла(текст)

    print(f"файл: {путь}  ({len(текст)//1000}к знаков)")
    print(f"\nглав в файле: {len(главы)}")
    for имя, n in главы: print(f"   {n//1000:>4}к  {имя}")

    куски = re.split(r'^## ', текст, flags=re.M)[1:]
    for имя, тело in [(g[0], k) for g, k in zip(главы, [k for k in куски if not re.match(
            r'^(Перед текстом|Оглавление|Над книгой|Сноски)', k.split("\n")[0].strip())])]:
        топо, слова = set(), []
        for m in re.finditer(r'([А-ЯЁ][а-яё]+(?:ск(?:ий|ой|ая|ому|ом|ого|им)|ый|ой|ая|ин|ов)?)\s+' + УКАЗАТЕЛИ, тело):
            топо.add(m.group(0).strip())
        for m in re.finditer(УКАЗАТЕЛИ + r'\s+([А-ЯЁ][а-яё]+)', тело):
            топо.add(m.group(0).strip())
        for w in СЛОВАРЬ.split():
            n = len(re.findall(w, тело, re.I))
            if n: слова.append(f"{w}×{n}")
        цит = sorted({m.group(1) for m in re.finditer(r'«([^»]{4,44})»', тело)})
        сноски = re.findall(r'^\[\d+\]\s*(.+)$', тело, re.M)
        print(f"\n══ {имя} ══")
        print("  места:  " + (" · ".join(sorted(топо)) or "—"))
        print("  словарь эпохи:  " + (" · ".join(слова) or "—"))
        if сноски: print("  сноски издания: " + " · ".join(x[:52] for x in сноски[:14]))
        if цит: print("  в кавычках: " + " · ".join(цит[:14]))

    print("\n" + "─" * 64)
    print("Дальше — чтение, а не скрипт. По этим сетям решается, что войдёт в")
    print("собрание: слово остаётся, если о него спотыкается сегодняшний читатель")
    print("или если оно и есть язык этого автора. Сноски издания — самая надёжная")
    print("подсказка: составитель уже отметил непонятное.\n")
    print("каркас спеки (заполнить и передать в build):\n")
    print(json.dumps({
        "id": key or "id", "профиль": "anton", "title": "", "author": "", "volume": "",
        "pages": 0, "startPage": 0, "mode": "linear", "tone": "sea", "art": "quill",
        "epub": epub, "cover": "", "maxDays": 45, "ask": "",
        "chapters": [{"name": имя, "from": 0} for имя, _ in главы],
        "ach": [], "words": {}, "flavor": {}, "themes": [], "map": [],
    }, ensure_ascii=False, indent=2))
    print("\nстраницы книги проставь из оглавления издания — дальше `build` сам скажет,")
    print("где по плотности знаков кончается текст, и сверит это с pages.")


# ── геокодер ───────────────────────────────────────────────────────────────

def геокод(запрос, рамка=None):
    """Координаты по названию. С кэшем на диске: одна и та же книга правится
       по многу раз, и гонять Nominatim заново незачем."""
    кэш = {}
    if os.path.exists(КЭШГЕО):
        try: кэш = json.load(open(КЭШГЕО, encoding="utf-8"))
        except Exception: кэш = {}
    ключ = запрос + ("|" + рамка if рамка else "")
    if ключ in кэш: return tuple(кэш[ключ])
    u = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + urllib.parse.quote(запрос)
    if рамка: u += "&bounded=1&viewbox=" + рамка
    req = urllib.request.Request(u, headers={"User-Agent": АГЕНТ})
    try:
        r = json.loads(urllib.request.urlopen(req, timeout=25).read().decode())
    except Exception:
        r = []
    time.sleep(1.1)                    # политика Nominatim: не чаще раза в секунду
    из = (round(float(r[0]["lat"]), 5), round(float(r[0]["lon"]), 5)) if r else None
    if из:
        кэш[ключ] = list(из)
        json.dump(кэш, open(КЭШГЕО, "w", encoding="utf-8"), ensure_ascii=False)
    return из


# ── подложка карты ─────────────────────────────────────────────────────────

Number_ = lambda v: (str(v).isdigit() and int(v)) or 0

мерк = lambda lat: math.log(math.tan(math.pi / 4 + lat * math.pi / 360))

def подложка(точки, поле=0.012, зум=14, ширина=1700):
    """Рамка по точкам и картинка из плиток OSM.

       Пропорция картинки обязана совпасть с Δдолготы / ΔМеркатора — иначе
       точки поедут по вертикали, и понять это по одной карте невозможно:
       выглядит правдоподобно, а мост оказывается не на своём месте."""
    from PIL import Image
    lats = [p["lat"] for p in точки]; lons = [p["lon"] for p in точки]
    W, E = min(lons) - поле, max(lons) + поле
    S, N = min(lats) - поле / 2, max(lats) + поле / 2
    гx = lambda lon: (lon + 180.0) / 360.0 * (1 << зум)
    def гy(lat):
        r = math.radians(lat)
        return (1.0 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2.0 * (1 << зум)
    x0f, x1f, y0f, y1f = гx(W), гx(E), гy(N), гy(S)
    x0, x1, y0, y1 = int(x0f), int(x1f), int(y0f), int(y1f)
    всего = (x1 - x0 + 1) * (y1 - y0 + 1)
    if всего > 260: sys.exit(f"плиток вышло {всего} — рамка слишком велика для зума {зум}")
    кэш = os.path.join(ЗДЕСЬ, ".tiles"); os.makedirs(кэш, exist_ok=True)
    холст = Image.new("RGB", ((x1 - x0 + 1) * 256, (y1 - y0 + 1) * 256))
    новых = 0
    for tx in range(x0, x1 + 1):
        for ty in range(y0, y1 + 1):
            п = os.path.join(кэш, f"{зум}_{tx}_{ty}.png")
            if not os.path.exists(п):
                req = urllib.request.Request(f"https://tile.openstreetmap.org/{зум}/{tx}/{ty}.png",
                                             headers={"User-Agent": АГЕНТ})
                with urllib.request.urlopen(req, timeout=25) as r, open(п, "wb") as f: f.write(r.read())
                time.sleep(0.25); новых += 1
            холст.paste(Image.open(п).convert("RGB"), ((tx - x0) * 256, (ty - y0) * 256))
    карта = холст.crop((round((x0f - x0) * 256), round((y0f - y0) * 256),
                        round((x1f - x0) * 256), round((y1f - y0) * 256)))
    ш, в = карта.size
    ждём = math.radians(E - W) / (мерк(N) - мерк(S))
    if abs(ш / в - ждём) > 0.01: sys.exit(f"пропорция карты {ш/в:.3f}, а должна быть {ждём:.3f}")
    карта = карта.resize((ширина, round(ширина * в / ш)), Image.LANCZOS)
    вых = os.path.join(ЗДЕСЬ, ".map.jpg")
    карта.save(вых, quality=70, optimize=True)
    print(f"  подложка: плиток {всего} (новых {новых}), {os.path.getsize(вых)//1024} КБ, "
          f"пропорция {ш/в:.3f}")
    return {"west": W, "east": E, "north": N, "south": S}, вых


# ── обложка ────────────────────────────────────────────────────────────────

def обложка(путь, высота=820, качество=55):
    from PIL import Image
    im = Image.open(путь).convert("RGB")
    ш0, в0 = im.size
    im = im.resize((round(ш0 * высота / в0), высота), Image.LANCZOS)
    вых = os.path.join(ЗДЕСЬ, ".cover.jpg")
    im.save(вых, "JPEG", quality=качество, optimize=True)
    б = open(вых, "rb").read()
    print(f"  обложка: {len(б)//1024} КБ, пропорция {ш0} / {в0}")
    return "data:image/jpeg;base64," + base64.b64encode(б).decode(), f"{ш0} / {в0}"


# ── проверки ───────────────────────────────────────────────────────────────

def прочитана(глава, spec, покрыто, курсор):
    """Дочитана ли глава. У книги вразбивку — своим куском, а не курсором:
       сборник повестей начинают с любой."""
    гл = spec["chapters"]; n = глава - 1
    конец = гл[n + 1]["from"] - 1 if n + 1 < len(гл) else spec["pages"]
    if spec.get("mode") != "parts": return курсор >= конец
    return any(a <= конец <= b for a, b in покрыто)

def проверить_награды(spec):
    """Пройти книгу страница за страницей и посмотреть, что и когда открылось.
       Ловит три вещи разом: недостижимые награды, тёзок и провалы в лестнице
       длиннее двух заходов."""
    ach = spec.get("ach") or []
    имена = [a["name"] for a in ach]
    тёзки = sorted({n for n in имена if имена.count(n) > 1})
    старт, конец = spec.get("startPage", 0), spec["pages"]
    открыто, шаги = {}, []
    for стр in range(старт + 1, конец + 1):
        покрыто = [(старт + 1, стр)]
        читано = {i + 1 for i in range(len(spec["chapters"])) if прочитана(i + 1, spec, покрыто, стр)}
        сост = {"page": стр, "pct": (стр - старт) / max(1, конец - старт) * 100, "read": читано}
        для_шага = []
        for a in ach:
            if a["id"] in открыто: continue
            ок = True
            for м, оп, зн in a.get("when", []):
                v = сост.get(м)
                if v is None: ок = False; break        # метрика не про страницы — проверим отдельно
                if оп == "has": ок = зн in v
                elif оп == ">=": ок = v >= зн
                elif оп == ">": ок = v > зн
                elif оп == "<=": ок = v <= зн
                elif оп == "<": ок = v < зн
                elif оп == "==": ок = v == зн
                else: ок = False
                if not ок: break
            if ок: открыто[a["id"]] = стр; для_шага.append(a["name"])
        if для_шага: шаги.append((стр, для_шага))
    постраничные = [a for a in ach if all(м in ("page", "pct", "read") for м, _, _ in a.get("when", []))]
    недостижимы = [a["name"] for a in постраничные if a["id"] not in открыто]
    провалы = []
    if spec.get("mode") == "parts":
        # Сборник читают повестями, и «сорок страниц без награды» тут ничего не
        # значит: страницы идут не подряд. Провал — это дочитанная повесть,
        # которая не принесла ничего.
        награды_главы = {}
        for i, c in enumerate(spec["chapters"]):
            конец = spec["chapters"][i+1]["from"] - 1 if i + 1 < len(spec["chapters"]) else spec["pages"]
            награды_главы[c["name"]] = [n for с, имена_ in шаги if с <= конец
                                        and с > (spec["chapters"][i]["from"] - 1) for n in имена_]
        провалы = [(имя, 0) for имя, н in награды_главы.items() if not н]
    else:
        точки = [старт] + [с for с, _ in шаги]
        for i in range(1, len(точки)):
            if точки[i] - точки[i - 1] > 40: провалы.append((точки[i - 1], точки[i]))
    print(f"\n── награды ──")
    print(f"  всего {len(ach)}, по страницам {len(постраничные)}, открылись все: "
          f"{'да' if not недостижимы else 'НЕТ — ' + ', '.join(недостижимы)}")
    if тёзки: print(f"  ⚠ ТЁЗКИ: {', '.join(тёзки)}")
    if провалы:
        если_части = spec.get("mode") == "parts"
        print("  ⚠ " + ("части без единой награды: " + " · ".join(a for a, _ in провалы)
              if если_части else
              "провалы без наград: " + " · ".join(f"{a}→{b} ({b-a} стр)" for a, b in провалы)))
    for с, имена_ in шаги: print(f"     {с:>4}  {' · '.join(имена_)}")
    return not недостижимы and not тёзки

def проверить_собрание(spec):
    """Плотность по главам и распределение по темам. Тема на три записи
       читается как обрывок, глава на двадцать — как свалка."""
    карта = spec.get("map") or []
    # Как в приложении: места в собрание не идут, а одно имя в одном слое —
    # одна запись. В файле слово размечено в каждой главе, где встречается
    # («Стек» у «Столпов моря» — двадцать один раз), и без свода счёт врёт
    # вдвое: показывает 294 там, где человек видит 147.
    один = {}
    for x in карта:
        if not x.get("kind"): continue
        ключ = x["kind"] + "|" + x["name"]
        было = один.get(ключ)
        длина = lambda y: len(y.get("about", "")) + len(y.get("t", ""))
        if not было: один[ключ] = x
        else:
            глубже = x if длина(x) > длина(было) else было
            рано = min([n for n in (было.get("part"), x.get("part")) if n] or [0])
            один[ключ] = dict(глубже, part=рано) if рано else глубже
    # Предметы музея — такая же часть собрания, они просто лежат в другом
    # файле. Без них счёт занижен: у «Столпов моря» на семнадцать штук.
    try:
        муз = json.loads(гист(КАТАЛОГ, "museum.json")).get("items") or []
    except Exception:
        муз = []
    имена = {x["name"] for x in один.values()}
    свои = [x for x in муз if x.get("book") == spec["id"] and not x.get("hidden")
            and not x.get("deleted") and x.get("name") not in имена and Number_(x.get("ch"))]
    вещи = list(один.values()) + [{"kind": "art0", "name": x["name"], "part": int(x["ch"]),
                                   "about": x.get("about", ""), "t": x.get("why", "")} for x in свои]
    по_гл, по_теме = {}, {}
    имена_тем = {t["id"]: (t.get("icon", "•"), t["name"]) for t in spec.get("themes", [])}
    for x in вещи:
        по_гл[x.get("part", 0)] = по_гл.get(x.get("part", 0), 0) + 1
        t = тема_для(x, spec.get("themes") or [])
        по_теме[t] = по_теме.get(t, 0) + 1
    print(f"\n── собрание ──")
    мест = len([x for x in карта if not x.get("kind")])
    print(f"  вещей {len(вещи)} (из них предметов музея {len(свои)}), мест на карте {мест}")
    гл = spec["chapters"]
    for i, c in enumerate(гл):
        n = по_гл.get(i + 1, 0)
        стр = (гл[i + 1]["from"] if i + 1 < len(гл) else spec["pages"]) - c["from"]
        # Ругаемся не на число, а на плотность: глава в пять страниц с пятью
        # записями — это нормально, глава в сорок с двумя — пусто.
        знак = " ⚠" if стр and (n / стр > 0.8 or (стр > 15 and n < 3)) else ""
        print(f"     {c['name'][:30]:30} {стр:>4} стр · {n:>3} вещей{знак}")
    if по_гл.get(0): print(f"     {'вокруг книги':30} {'':>4}     {по_гл[0]:>3}")
    for t, n in sorted(по_теме.items(), key=lambda x: -x[1]):
        зн, имя = имена_тем.get(t, ("•", t))
        print(f"     {зн} {имя[:26]:26} {n:>3}" + ("  ⚠ мало" if n < 5 else ""))
    # до чтения не должно быть открыто ничего
    без_главы = [x for x in вещи if not x.get("part")]
    print(f"  вокруг книги: {len(без_главы)} — раскидываются по страницам, до чтения закрыты")
    return True

def тема_для(x, темы):
    for t in темы:
        if x["name"] in (t.get("names") or []): return t["id"]
    for t in темы:
        if x.get("kind") in (t.get("kinds") or []): return t["id"]
    return темы[-1]["id"] if темы else "—"


# ── сборка ─────────────────────────────────────────────────────────────────

def build(путь_спеки):
    spec = json.load(open(путь_спеки, encoding="utf-8"))
    key, профиль = spec["id"], spec["профиль"]
    print(f"══ {spec.get('title') or key} ══")

    # 1. текст
    md = subprocess.run([sys.executable, EPUB2MD, spec["epub"]], capture_output=True, text=True)
    путь_md = ""
    for s in (md.stdout + md.stderr).splitlines():
        if s.strip().endswith(".md"): путь_md = s.strip()
    текст = open(путь_md, encoding="utf-8").read()
    главы = главы_файла(текст)
    print(f"  текст: {len(текст)//1024} КБ, глав в файле {len(главы)}")
    оглавление = [c["from"] for c in spec["chapters"]]
    оценка = последняя_страница(главы, оглавление)
    if оценка:
        конец, плотн = оценка
        разница = abs(конец - spec["pages"])
        знак = "" if разница <= 6 else f"  ⚠ в спеке {spec['pages']}"
        print(f"  текст кончается примерно на {конец}-й ({плотн} знаков на страницу){знак}")
    if len(главы) < len(spec["chapters"]):
        print(f"  ⚠ в файле {len(главы)} разделов против {len(spec['chapters'])} глав в спеке")

    # 2. обложка
    cover, ratio = обложка(spec["cover"])

    # 3. карта: координаты по геокодеру, если их нет
    карта, места = [], []
    for x in spec.get("map", []):
        y = dict(x)
        if not y.get("kind"):                      # место
            if "lat" not in y or "lon" not in y:
                где = y.pop("где", None) or y["name"]
                к = геокод(где, spec.get("рамка_поиска"))
                if not к: sys.exit(f"не нашлось место: {где}")
                y["lat"], y["lon"] = к
            места.append(y)
        else:
            y.setdefault("lat", 0); y.setdefault("lon", 0)
        y.pop("где", None)
        y["updatedAt"] = int(time.time() * 1000)
        карта.append(y)
    print(f"  карта: записей {len(карта)}, из них мест {len(места)}")

    # координаты подставились — кладём их обратно в спеку, чтобы не искать снова
    for x, y in zip(spec.get("map", []), карта):
        if not y.get("kind"): x["lat"], x["lon"] = y["lat"], y["lon"]
    json.dump(spec, open(путь_спеки, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    файлы_каталога = {
        f"book-{key}.md": текст,
        f"cover-{key}.txt": cover,
    }
    статья = {"map": карта, "mapVer": 1, "savedAt": int(time.time() * 1000)}
    if места:
        рамка, картинка = подложка(места)
        статья["mapBox"] = рамка
        файлы_каталога[f"art-map-{key}.txt"] = ("data:image/jpeg;base64," +
            base64.b64encode(open(картинка, "rb").read()).decode())
    файлы_каталога[f"article-{key}.json"] = json.dumps(статья, ensure_ascii=False, separators=(",", ":"))

    # 4. опись
    опись = json.loads(гист(КАТАЛОГ, "keiko-catalog.json"))
    # Дописываем в существующую запись, а не заменяем её. В описи живут поля,
    # которых в спеке нет и быть не должно: `arts` (есть ли разбор), `verse`
    # (нумерация стихов у «Одиссеи»), `off`, `noAch`, старые `facts`. Замена
    # целиком стёрла бы их молча — и «Одиссея» потеряла бы нумерацию строк.
    было = опись["materials"].get(key) or {}
    было.update({
        "cover": True, "md": True, "maxDays": spec.get("maxDays", 45),
        "ach": spec.get("ach", []), "words": spec.get("words", {}),
        "flavor": spec.get("flavor", {}), "ask": spec.get("ask", ""),
        "themes": spec.get("themes", []),
    })
    опись["materials"][key] = было
    опись["savedAt"] = int(time.time() * 1000)
    файлы_каталога["keiko-catalog.json"] = json.dumps(опись, ensure_ascii=False, separators=(",", ":"))

    # 5. профиль
    данные = json.loads(гист(ПРОФИЛИ, f"keiko-{профиль}.json"))
    # Запись книги тоже дополняем: `done`, `doneAt`, `archived` ставит человек
    # в приложении, и перезапись спекой их бы сняла.
    прежняя = next((b for b in данные["book"]["books"] if b.get("id") == key), {})
    книга = dict(прежняя)
    книга.update({k: spec[k] for k in ("id", "title", "author", "pages") if k in spec})
    for k in ("volume", "startPage", "art", "tone", "mode"):
        if spec.get(k) is not None: книга[k] = spec[k]
    книга["ratio"] = ratio
    книга["chapters"] = spec["chapters"]
    книга["updatedAt"] = int(time.time() * 1000)
    данные["book"]["books"] = [b for b in данные["book"]["books"] if b.get("id") != key] + [книга]
    данные["savedAt"] = int(time.time() * 1000)

    # 6. одна запись на всё
    залить(КАТАЛОГ, файлы_каталога)
    залить(ПРОФИЛИ, {f"keiko-{профиль}.json": json.dumps(данные, ensure_ascii=False, separators=(",", ":"))})
    print(f"  залито: {len(файлы_каталога)} файлов каталога + профиль {профиль}")

    # 7. проверки
    ладно = проверить_награды(spec) & проверить_собрание(spec)
    print("\n── сторонние проверки ──")
    for кмд in ([sys.executable, os.path.join(ЗДЕСЬ, "material.py"), key, профиль],
                [sys.executable, os.path.join(ЗДЕСЬ, "spoilers.py"), key]):
        r = subprocess.run(кмд, capture_output=True, text=True)
        хвост = [s for s in (r.stdout or "").strip().splitlines() if s.strip()][-2:]
        print("  " + os.path.basename(кмд[1]) + ": " + " · ".join(x.strip() for x in хвост))
        if "НЕ ГОТОВО" in r.stdout: ладно = False
    print("\n" + ("ИТОГ: книга заведена" if ладно else "ИТОГ: есть промахи — смотри значки ⚠ выше"))


if __name__ == "__main__":
    if len(sys.argv) < 3 or sys.argv[1] not in ("scan", "build", "check"):
        sys.exit(__doc__)
    if sys.argv[1] == "scan":
        разведка(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
    elif sys.argv[1] == "check":
        # спека правится по многу раз; гонять заливку ради счётчиков незачем
        spec = json.load(open(sys.argv[2], encoding="utf-8"))
        проверить_награды(spec); проверить_собрание(spec)
    else:
        build(sys.argv[2])
