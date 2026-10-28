#!/bin/bash
# 一鍵部署 Google 試算表後端：建立試算表＋Apps Script、上傳 Code.gs、部署網頁應用程式、把網址寫進 config.js。
# 第一次執行會要求登入 Google 並設定小組長密碼；之後改了 Code.gs 再執行一次，就會更新到同一個網址。
set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"
CLASP="npx -y @google/clasp@2.4.2"
DEPLOY="$ROOT/.deploy"            # 本機專用，含密碼，不會推上 GitHub
mkdir -p "$DEPLOY"

echo "== 1/5 登入 Google =="
if [ ! -f "$HOME/.clasprc.json" ]; then
  echo "瀏覽器會打開 Google 登入頁，請用要存放資料的個人 Gmail 帳號登入並按「允許」。"
  $CLASP login
else
  echo "已登入過，略過。"
fi

echo "== 2/5 小組長密碼 =="
if [ ! -s "$DEPLOY/password" ]; then
  while true; do
    read -r -s -p "請設定小組長密碼（輸入時不會顯示）：" PW1; echo
    read -r -s -p "請再輸入一次：" PW2; echo
    if [ -n "$PW1" ] && [ "$PW1" = "$PW2" ]; then break; fi
    echo "兩次不一樣或是空白，請重新輸入。"
  done
  printf '%s' "$PW1" > "$DEPLOY/password"; chmod 600 "$DEPLOY/password"
else
  echo "沿用先前設定的密碼（要改密碼：刪除 .deploy/password 再執行一次）。"
fi

echo "== 3/5 建立試算表與 Apps Script =="
cd "$DEPLOY"
if [ ! -f .clasp.json ]; then
  $CLASP create --type sheets --title "晚餐分享資料" --rootDir .
  rm -f Code.js   # clasp 建立時附的空白範例檔
else
  echo "已建立過，略過。"
fi

echo "== 4/5 上傳程式並部署 =="
python3 - "$ROOT/apps-script/Code.gs" "$DEPLOY/Code.gs" "$DEPLOY/password" <<'PY'
import json, sys
src, dst, pwfile = sys.argv[1:4]
code = open(src, encoding='utf-8').read()
pw = open(pwfile, encoding='utf-8').read()
old = "var LEADER_PASSWORD = '請改成你的密碼';"
assert old in code, '找不到 LEADER_PASSWORD 那一行'
open(dst, 'w', encoding='utf-8').write(code.replace(old, 'var LEADER_PASSWORD = ' + json.dumps(pw, ensure_ascii=False) + ';', 1))
PY
cp "$ROOT/apps-script/appsscript.json" "$DEPLOY/appsscript.json"
$CLASP push -f
if [ -s deployment-id ]; then
  $CLASP deploy -i "$(cat deployment-id)" -d "更新 $(date '+%Y-%m-%d %H:%M')"
  UPDATED=1
else
  OUT=$($CLASP deploy -d "第一版")
  echo "$OUT"
  echo "$OUT" | grep -o 'AKfyc[A-Za-z0-9_-]*' | head -1 > deployment-id
fi
ID=$(cat deployment-id)
[ -n "$ID" ] || { echo "沒有取得部署 ID，請把上面的訊息給 Claude 看"; exit 1; }
URL="https://script.google.com/macros/s/$ID/exec"

echo "== 5/5 寫入 config.js =="
python3 - "$ROOT/config.js" "$URL" <<'PY'
import re, sys
p, url = sys.argv[1:3]
s = open(p, encoding='utf-8').read()
s = re.sub(r"API_URL:\s*'[^']*'", "API_URL: '" + url + "'", s)
open(p, 'w', encoding='utf-8').write(s)
PY
SHEET=$(python3 -c "import json;print(json.load(open('.clasp.json')).get('parentId',[''])[0] if isinstance(json.load(open('.clasp.json')).get('parentId'),list) else json.load(open('.clasp.json')).get('parentId',''))" 2>/dev/null || true)
echo
echo "完成！後端網址：$URL"
if [ -n "$UPDATED" ]; then echo "（更新既有部署，網址不變，不需要再授權）"; exit 0; fi
[ -n "$SHEET" ] && echo "試算表：https://docs.google.com/spreadsheets/d/$SHEET/edit"
echo
echo "最後一步：瀏覽器會打開後端網址，請按「審查權限 → 選帳號 → 進階 → 前往（不安全）→ 允許」。"
echo "看到「晚餐分享後端運作中」就完成了。"
open "$URL"
