#!/bin/bash
# Revisão visual remota: imprime no log do CI as telas do marketplace em miniatura (JPEG em base64).
# Só roda nos ramos de trabalho (claude/*); os prints completos continuam no artefato "prints-ponta-a-ponta".
SHOTS=${1:-e2e/prints}
for f in "$SHOTS"/m*.png; do
  [ -f "$f" ] || continue
  data=$(convert "$f" -resize 390x -crop 390x1400+0+0 +repage -quality 55 jpg:- | base64 -w0)
  echo "MINIATURA $(basename "$f" .png) $data"
done
