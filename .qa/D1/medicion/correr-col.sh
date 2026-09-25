#!/bin/bash
# uso: correr-col.sh <nombre> <lineas separadas por coma>
S=/tmp/claude-0/-home-user-Factory-GSG/12bc8dd5-60d3-5e22-95c1-3816d17ad0a9/scratchpad/d1
N=$1; LINES=$2
D=$S/runs/$N
rm -rf $D; mkdir -p $D
( cd /home/user/erp && git archive 08b4563 ) | tar -x -C $D
ln -s /home/user/erp/node_modules $D/node_modules
( cd /home/user/erp && git show 08b4563:prisma/schema.prisma ) | awk -v L=",$LINES," '{ if (index(L, ","NR",")>0) { c=""; i=index($0,"//"); if (i>0) { c=substr($0,i); b=substr($0,1,i-1) } else { b=$0 }; sub(/[ \t]Float/," Decimal",b); sub(/[ \t]+$/,"",b); $0=b" @db.Decimal(14, 2)"(c!=""?" "c:"") } print }' > $D/prisma/schema.prisma
cd $D && DATABASE_URL="postgresql://x@localhost:1/x" npx prisma generate > $D.gen.txt 2>&1
npx tsc --noEmit -p tsconfig.json > $S/runs/$N.tsc.txt 2>&1
echo "$N $(grep -c 'error TS' $S/runs/$N.tsc.txt)" >> $S/runs/resumen.txt
rm -rf $D
