// src/utils/buscarImagenes.ts
// Buscador de fotos de productos para el formulario de Inventario.
//
// Fuentes, en orden de relevancia:
//  1. Open Food Facts por código de barras: la foto del producto exacto.
//  2. Open Food Facts por nombre (vía /api/off-search: su buscador no admite llamadas directas del
//     navegador; en producción lo reenvía vercel.json y en desarrollo el proxy de vite.config.ts).
//  3. Openverse: fotos libres de todo tipo (frutas, herramientas, marcas).
//  4. Resultados aproximados de Open Food Facts, solo si no hubo suficientes exactos.
//
// Open Food Facts no corrige la ortografía, así que se busca también con variantes de escritura
// comunes en español (k/c, b/v, s/z): "inka cola" encuentra "Inca Kola", "cerbeza" encuentra "cerveza".
// Cada foto se valida contra las palabras buscadas para no mostrar productos que no tienen nada que ver.

export interface FotoEncontrada {
  url: string;
  titulo: string;
  aproximada?: boolean;
}

const VACIAS = ['de', 'la', 'el', 'en', 'con', 'y', 'x', 'del', 'los', 'las', 'al'];

const normalizar = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const palabras = (s: string) => normalizar(s).split(' ').filter(t => t.length > 1 && !VACIAS.includes(t));

// Clave fonética del español: k/qu/c(a,o,u) → c, z/c(e,i) → s, v → b, ll → y, h muda, letras dobles → una
const fonetica = (t: string) =>
  t.replace(/qu/g, 'k').replace(/c([ei])/g, 's$1').replace(/k/g, 'c').replace(/z/g, 's')
    .replace(/v/g, 'b').replace(/ll/g, 'y').replace(/h/g, '').replace(/(.)\1+/g, '$1');

const distancia = (a: string, b: string) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};

// Errores de tipeo tolerados según el largo de la palabra
const tolerancia = (t: string) => (t.length >= 7 ? 2 : t.length >= 4 ? 1 : 0);

const coincide = (buscada: string, candidatas: string[]) => {
  const fb = fonetica(buscada);
  return candidatas.some(c => {
    const fc = fonetica(c);
    return fc === fb || (fb.length >= 3 && fc.startsWith(fb)) || distancia(fb, fc) <= tolerancia(fb);
  });
};

// Cuántas de las palabras buscadas aparecen en el texto
const puntaje = (texto: string, buscadas: string[]) => {
  const candidatas = palabras(texto);
  return buscadas.filter(t => coincide(t, candidatas)).length;
};

// Variantes de escritura: la original primero, luego k↔c, b↔v, s↔z (máximo 4 búsquedas)
const variantes = (consulta: string) => {
  const opciones = palabras(consulta).map(t => {
    const o = new Set([t]);
    if (/k/.test(t)) o.add(t.replace(/k/g, 'c'));
    if (/c[aou]/.test(t)) o.add(t.replace(/c(?=[aou])/g, 'k'));
    if (/b/.test(t)) o.add(t.replace(/b/g, 'v'));
    if (/v/.test(t)) o.add(t.replace(/v/g, 'b'));
    if (/z/.test(t)) o.add(t.replace(/z/g, 's'));
    return [...o];
  });
  let combinaciones: string[][] = [[]];
  for (const o of opciones) combinaciones = combinaciones.flatMap(p => o.map(x => [...p, x]));
  const lista = [consulta.trim(), ...combinaciones.map(p => p.join(' '))];
  return [...new Set(lista.filter(Boolean))].slice(0, 4);
};

const leerJson = async (url: string, signal?: AbortSignal) => {
  try {
    const res = await fetch(url, { signal });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
};

/** Foto del producto exacto por su código de barras (Open Food Facts). */
export const imagenPorCodigoBarras = async (codigo: string, signal?: AbortSignal): Promise<string | null> => {
  const limpio = (codigo || '').replace(/\D/g, '');
  if (limpio.length < 8) return null;
  const data = await leerJson(
    `https://world.openfoodfacts.org/api/v2/product/${limpio}.json?fields=image_front_url,image_front_small_url,image_url`,
    signal
  );
  const p = data?.product;
  return p?.image_front_url || p?.image_url || p?.image_front_small_url || null;
};

/**
 * Busca fotos para un producto. `alAvanzar` recibe la lista parcial apenas llega cada fuente,
 * siempre ordenada por relevancia, para pintarla sin esperar a las demás.
 */
export const buscarImagenes = async (
  consulta: string,
  codigoBarras: string,
  signal: AbortSignal,
  alAvanzar: (fotos: FotoEncontrada[]) => void,
  maximo = 8
): Promise<FotoEncontrada[]> => {
  const buscadas = palabras(consulta);
  // Con 1–2 palabras deben estar todas; con 3 o más se tolera que falte una (p. ej. el tamaño)
  const minimo = buscadas.length <= 2 ? buscadas.length : buscadas.length - 1;
  const grupos: FotoEncontrada[][] = [[], [], [], []];

  const unir = () => {
    const vistas = new Set<string>();
    const lista: FotoEncontrada[] = [];
    for (const g of grupos) for (const f of g) {
      if (!f.url.startsWith('http') || vistas.has(f.url)) continue;
      vistas.add(f.url);
      lista.push(f);
    }
    return lista.slice(0, maximo);
  };
  const avisar = () => { if (!signal.aborted) alAvanzar(unir()); };

  // 1. Código de barras
  const porCodigo = imagenPorCodigoBarras(codigoBarras, signal).then(url => {
    grupos[0] = url ? [{ url, titulo: 'Por código de barras' }] : [];
    avisar();
  });

  // 2. Open Food Facts por nombre, con variantes de escritura
  let aproximadas: FotoEncontrada[] = [];
  const porNombre = Promise.all(
    variantes(consulta).map(v =>
      leerJson(`/api/off-search?q=${encodeURIComponent(v)}&langs=es,en&page_size=24&fields=product_name,brands,image_front_small_url,image_front_url`, signal)
    )
  ).then(respuestas => {
    const candidatos: (FotoEncontrada & { puntos: number })[] = [];
    for (const data of respuestas) for (const h of data?.hits || []) {
      const url = h.image_front_small_url || h.image_front_url;
      if (!url) continue;
      const titulo = [h.product_name, ...[].concat(h.brands || [])].filter(Boolean).join(' · ');
      candidatos.push({ url, titulo, puntos: puntaje(titulo, buscadas) });
    }
    candidatos.sort((a, b) => b.puntos - a.puntos);
    grupos[1] = candidatos.filter(c => c.puntos >= minimo);
    // Aproximadas: deben coincidir al menos en la primera palabra (el tipo de producto: leche, detergente…),
    // para no ofrecer productos que solo comparten la marca.
    aproximadas = candidatos
      .filter(c => c.puntos >= 1 && c.puntos < minimo && buscadas.length > 0 && coincide(buscadas[0], palabras(c.titulo)))
      .map(c => ({ ...c, aproximada: true }));
    avisar();
  });

  // 3. Openverse (fotos libres): se valida solo contra el título
  const porOpenverse = leerJson(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(consulta)}&page_size=12`, signal)
    .then(data => {
      grupos[2] = (data?.results || [])
        .map((r: any) => ({ url: r.thumbnail || r.url, titulo: r.title || '', puntos: puntaje(r.title || '', buscadas) }))
        .filter((r: any) => r.url && r.puntos >= minimo)
        .sort((a: any, b: any) => b.puntos - a.puntos);
      avisar();
    });

  await Promise.all([porCodigo, porNombre, porOpenverse]);

  // 4. Si faltan fotos, se completan con las aproximadas
  if (unir().length < 4) {
    grupos[3] = aproximadas;
    avisar();
  }
  return unir();
};
