#!/bin/bash
# Árbol de trabajo (con el rediseño sin commit): línea base y con TODAS las columnas en Decimal.
S=/tmp/claude-0/-home-user-Factory-GSG/12bc8dd5-60d3-5e22-95c1-3816d17ad0a9/scratchpad/d1
for modo in base todas; do
  D=$S/runs/wt-$modo; rm -rf $D; mkdir -p $D
  tar -C /home/user/erp --exclude=node_modules --exclude=./.next --exclude=./.git --exclude=./src/generated -cf - . | tar -x -C $D
  ln -s /home/user/erp/node_modules $D/node_modules
  if [ $modo = todas ]; then
    LINES=$(cut -f1 $S/columnas.tsv | paste -sd,)
    awk -v L=",$LINES," '{ if (index(L, ","NR",")>0) { c=""; i=index($0,"//"); if (i>0) { c=substr($0,i); b=substr($0,1,i-1) } else { b=$0 }; sub(/[ \t]Float/," Decimal",b); sub(/[ \t]+$/,"",b); $0=b" @db.Decimal(14, 2)"(c!=""?" "c:"") } print }' /home/user/erp/prisma/schema.prisma > $D/prisma/schema.prisma
  fi
  (cd $D && DATABASE_URL="postgresql://x@localhost:1/x" npx prisma generate > $S/runs/wt-$modo.gen.txt 2>&1 && npx tsc --noEmit -p tsconfig.json > $S/runs/wt-$modo.tsc.txt 2>&1)
  echo "wt-$modo $(grep -c 'error TS' $S/runs/wt-$modo.tsc.txt)" >> $S/runs/resumen-wt.txt
  rm -rf $D
done
