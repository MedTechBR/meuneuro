#!/bin/sh
# Troca o ?v=N de todos os arquivos no index.html e o CACHE do sw.js (evita navegador com código velho).
# Uso: sh tools/bump.sh 3
cd "$(dirname "$0")/.." || exit 1
N="$1"; [ -z "$N" ] && { echo "uso: sh tools/bump.sh <numero>"; exit 1; }
sed -i '' -E "s/\?v=[0-9]+/?v=$N/g" index.html
sed -i '' -E "s/refilmed-v[0-9]+/refilmed-v$N/" sw.js
grep -o '?v=[0-9]*' index.html | sort -u; grep -o "refilmed-v[0-9]*" sw.js
