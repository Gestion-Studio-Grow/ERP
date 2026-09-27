import json, glob, statistics as st, sys

Q = "/home/user/erp-shine3d/.qa/shine3d-2709/mediciones"
CLAVES = ["lcp", "fcp", "tbt", "largas", "largaMax", "scrollHorizontal", "jsAntesDelLoad", "redJsAntesDelLoad", "redJsDespues", "escenaListaMs"]
filas = []
for frente in ["nueva", "legado"]:
    for vista in ["390", "1440", "fps390"]:
        for momento in ["antes", "despues"]:
            rs = []
            for f in sorted(glob.glob(f"{Q}/{momento}-{frente}-r*-medicion.json")):
                d = json.load(open(f))
                if vista in d:
                    rs.append(d[vista])
            if not rs:
                continue
            med = {}
            for k in CLAVES:
                vals = [r.get(k) for r in rs if isinstance(r.get(k), (int, float))]
                med[k] = st.median(vals) if vals else None
            med["errores"] = sum(len(r.get("errores", [])) for r in rs)
            fps = [float(x) for r in rs for x in ([r.get("fpsFinal")] if r.get("fpsFinal") else []) + (r.get("fpsSeguidos") or [])[-1:] if x]
            med["fps"] = st.median(fps) if fps else None
            med["paso"] = [r.get("calidad") for r in rs]
            med["boton"] = [r.get("boton") for r in rs][:1]
            filas.append((frente, vista, momento, len(rs), med))
for f in filas:
    print(json.dumps({"frente": f[0], "vista": f[1], "momento": f[2], "n": f[3], **f[4]}, ensure_ascii=False))
