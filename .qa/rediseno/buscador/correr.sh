#!/bin/sh
# Re-corre el recorrido del buscador (sin filtro de consola) con las mismas búsquedas de la corrida anterior.
# Salida nueva al lado de la vieja: recorrido-<quien>-<ancho>-2.txt
cd "$(dirname "$0")"
node recorrido.mjs magra dueno@magra.lab 390 "ma" "#48" "5555-2112" > recorrido-magra-dueno-390-2.txt 2>&1; echo "dueno-390 exit=$?"
node recorrido.mjs magra dueno@magra.lab 1440 "vac" "Micaela" "5555-2112" "#485" "Mariano González" "Sándalo" "a" "vacío" > recorrido-magra-dueno-1440-2.txt 2>&1; echo "dueno-1440 exit=$?"
node recorrido.mjs magra cajero@magra.lab 390 "vac" "Micaela" "#485" > recorrido-magra-cajero-390-2.txt 2>&1; echo "cajero-390 exit=$?"
