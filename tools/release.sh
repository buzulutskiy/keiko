#!/bin/sh
# Релиз Кэйко одной командой: проверки → версия в трёх местах → пуш → ожидание Pages.
#
#   tools/release.sh "сообщение коммита"      — полный релиз
#   tools/release.sh --check                  — только проверки, ничего не менять
#
# Версию руками больше не трогаем: скрипт сам находит текущую в version.json
# и поднимает её на единицу сразу в app.js, version.json и sw.js. Забыть одно
# из трёх мест — самый частый способ получить «старая версия при новом кэше».
set -e
cd "$(dirname "$0")/.."

node --check app.js
node tools/test.js

[ "$1" = "--check" ] && { echo "проверки прошли, релиз не делался"; exit 0; }
[ -n "$1" ] || { echo "нужно сообщение коммита: tools/release.sh \"...\""; exit 1; }

CUR=$(sed -n 's/.*Кэйко \([0-9][0-9]*\).*/\1/p' version.json)
[ -n "$CUR" ] || { echo "не нашёл номер версии в version.json"; exit 1; }
NEXT=$((CUR + 1))

grep -q "Кэйко $CUR" app.js || { echo "в app.js не «Кэйко $CUR» — версии разъехались, чинить руками"; exit 1; }
grep -q "keiko-v$CUR" sw.js || { echo "в sw.js не «keiko-v$CUR» — версии разъехались, чинить руками"; exit 1; }

sed -i '' "s/Кэйко $CUR/Кэйко $NEXT/" app.js version.json
sed -i '' "s/keiko-v$CUR/keiko-v$NEXT/" sw.js
node --check app.js

git add -A
git commit -q -m "$1

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push origin HEAD:main

echo "Кэйко $NEXT отправлен, ждём Pages…"
until curl -s https://buzulutskiy.github.io/keiko/version.json | grep -q "Кэйко $NEXT"; do sleep 5; done
echo "на проде: Кэйко $NEXT"
