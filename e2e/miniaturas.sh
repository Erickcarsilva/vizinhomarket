#!/bin/bash
# Revisão visual remota: imprime no log do CI as telas do marketplace em miniatura (JPEG em base64).
# Só roda nos ramos de trabalho (claude/*); os prints completos continuam no artefato "prints-ponta-a-ponta".
SHOTS=${1:-e2e/prints}
IM=$(command -v magick || command -v convert)
if [ -z "$IM" ]; then sudo apt-get install -y -qq imagemagick >/dev/null 2>&1; IM=$(command -v magick || command -v convert); fi
n=0
for f in "$SHOTS"/m*.png; do
  [ -f "$f" ] || continue
  data=$("$IM" "$f" -resize 390x -crop 390x1400+0+0 +repage -quality 55 jpg:- | base64 -w0)
  echo "MINIATURA $(basename "$f" .png) $data"; n=$((n+1))
done
echo "MINIATURAS-TOTAL $n (ferramenta: ${IM:-nenhuma})"
