// Supabase devuelve como máximo 1000 filas por consulta (aunque se pida .limit(15000)).
// traerTodo pide la consulta por bloques de 1000 hasta completarla, así las pantallas
// nunca quedan incompletas cuando una tabla crece (productos, ventas, lotes, clientes...).
//
// Uso: const { data, error } = await traerTodo(() => supabase.from('products').select('*').order('id'));
// La consulta debe tener un .order() estable (por ejemplo 'id') para que los bloques no se crucen.

const TAMANO_BLOQUE = 1000;

interface ConsultaPaginable<T> {
  range: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>;
}

export async function traerTodo<T = any>(consulta: () => ConsultaPaginable<T>): Promise<{ data: T[] | null; error: any }> {
  const todo: T[] = [];
  for (let desde = 0; ; desde += TAMANO_BLOQUE) {
    const { data, error } = await consulta().range(desde, desde + TAMANO_BLOQUE - 1);
    if (error) return { data: null, error };
    todo.push(...(data || []));
    if (!data || data.length < TAMANO_BLOQUE) break;
  }
  return { data: todo, error: null };
}
