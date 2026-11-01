// <script type="application/ld+json"> de un front (SEO ronda 2). Server component: no viaja JavaScript al cliente.
import { serializarLd } from "@/lib/seo/jsonld";

export default function JsonLd({ datos }: { datos: Record<string, unknown> | Record<string, unknown>[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializarLd(datos) }} />;
}
