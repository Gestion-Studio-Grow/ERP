"use client";

// Un Cajon que se abre por la URL (`?agregar=1` por defecto) y se cierra sacando ese parámetro,
// sin volver al servidor. Sirve para el alta de las pantallas de gestión bajo «Diseño nuevo»: la
// tecla de la cabecera es un <Link> (funciona sin JS y se puede compartir), y el formulario va al
// costado en la PC y en hoja en el celular. El formulario se monta sólo abierto: al cerrarlo se
// descarta lo que quedó a medio escribir.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Cajon } from "@/components/ui";

export default function CajonPorUrl({
  parametro = "agregar",
  valor = "1",
  titulo,
  descripcion,
  children,
}: {
  parametro?: string;
  /** Con qué valor se abre (`?pagar=<id>` abre el de ese renglón). */
  valor?: string;
  titulo: React.ReactNode;
  descripcion?: React.ReactNode;
  children: React.ReactNode;
}) {
  const sp = useSearchParams();
  const ruta = usePathname();
  const router = useRouter();
  const abierto = sp.get(parametro) === valor;
  const cerrar = () => {
    const p = new URLSearchParams(sp.toString());
    p.delete(parametro);
    const s = p.toString();
    router.replace(s ? `${ruta}?${s}` : ruta, { scroll: false });
  };
  return (
    <Cajon abierto={abierto} onCerrar={cerrar} titulo={titulo} descripcion={descripcion}>
      {abierto && children}
    </Cajon>
  );
}
