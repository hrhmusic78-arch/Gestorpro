import { supabase } from '../db/supabase';

/**
 * 🎯 MOTOR ÚNICO DE INGRESO TOTAL (EVICAMP)
 * ------------------------------------------------------------------
 * Antes, Resumen, Reportes, Utilidades, Finanzas y Punto de Venta cada
 * uno reimplementaba su propia fórmula de "Ingreso Total" / "Ventas
 * Netas" (con pequeñas diferencias: uno excluía anulados y otro no,
 * uno sumaba ingresos manuales de caja y otro no, uno usaba la zona
 * horaria del dispositivo y otro fecha fija Perú...). Eso hacía que
 * el mismo día mostrara montos distintos según la pantalla.
 *
 * Esta es la ÚNICA fuente de verdad. Todas las pantallas que muestren
 * "Ingreso Total" / "Ventas Netas" para un rango de fechas deben llamar
 * a calcularIngresoTotal() de aquí. Si el negocio necesita cambiar la
 * fórmula, se cambia UNA SOLA VEZ en este archivo.
 *
 * Reglas de negocio (ya validadas contra producción):
 *  - Solo cuenta el dinero EFECTIVAMENTE COBRADO en cada venta
 *    (efectivo + yape + tarjeta + transferencia). La parte fiada
 *    (crédito) NO suma hasta que el cliente la paga.
 *  - Se excluyen los tickets ANULADOS.
 *  - Se suman los abonos de fiados (debt_payments) pagados dentro del
 *    rango, salvo que el ticket original haya sido anulado después
 *    (ese dinero ya se revirtió de caja).
 *  - Se suman los ingresos manuales de caja (cash_movements tipo
 *    INGRESO), excluyendo los de flujo EXTERNO (personal, no es
 *    dinero del negocio) y los INGRESO_FIADO (ya se cuentan arriba
 *    vía debt_payments; contarlos aquí también los duplicaría).
 */

// Perú no tiene horario de verano: siempre UTC-5, todo el año.
const PERU_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Fecha (YYYY-MM-DD) del día calendario en Perú, SIN depender de la
 *  zona horaria configurada en el dispositivo/navegador que la pide.
 *  Dos dispositivos con reloj/zona horaria distintos deben ver el
 *  mismo "HOY". */
export function fechaLocalPeru(fecha: Date = new Date()): string {
  return new Date(fecha.getTime() - PERU_OFFSET_MS).toISOString().split('T')[0];
}

/** YYYY-MM-DD del primer día del mes actual, en calendario Perú. */
export function primerDiaMesPeru(fecha: Date = new Date()): string {
  const hoy = fechaLocalPeru(fecha);
  return `${hoy.slice(0, 7)}-01`;
}

/** YYYY-MM-DD de "hace N días" (inclusive), en calendario Perú. */
export function haceNDiasPeru(n: number, fecha: Date = new Date()): string {
  return fechaLocalPeru(new Date(fecha.getTime() - n * 24 * 60 * 60 * 1000));
}

/** Convierte un rango de fechas (YYYY-MM-DD, YYYY-MM-DD) a límites UTC
 *  que cubren el día completo en hora Perú: 00:00 a 23:59:59.999. */
export function rangoUTCPeru(fechaInicio: string, fechaFin: string) {
  const finExpandido = new Date(fechaFin + 'T12:00:00');
  finExpandido.setDate(finExpandido.getDate() + 1);
  const finStr = finExpandido.toISOString().split('T')[0];
  return {
    inicioUTC: `${fechaInicio}T05:00:00.000Z`,
    finUTC: `${finStr}T05:00:00.000Z`
  };
}

/** Trae TODAS las filas de una tabla dentro de un rango de fechas, sin
 *  toparse con ningún límite de filas del servidor (pagina en bloques
 *  de 1000). `columnaFecha` es la columna sobre la que se filtra
 *  (por defecto 'created_at'; algunas tablas usan otro nombre). */
export async function fetchAllRango(tabla: string, cols: string, inicioUTC: string, finUTC: string, columnaFecha = 'created_at'): Promise<any[]> {
  let datos: any[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabase.from(tabla).select(cols).gte(columnaFecha, inicioUTC).lt(columnaFecha, finUTC).range(from, from + 999);
    if (!data || data.length === 0) break;
    datos = [...datos, ...data];
    if (data.length < 1000) break;
    from += 1000;
  }
  return datos;
}

/** Trae TODA una tabla sin filtro de fecha (paginado en bloques de 1000). */
export async function fetchAllTabla(tabla: string, cols: string): Promise<any[]> {
  let datos: any[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabase.from(tabla).select(cols).range(from, from + 999);
    if (!data || data.length === 0) break;
    datos = [...datos, ...data];
    if (data.length < 1000) break;
    from += 1000;
  }
  return datos;
}

export interface IngresoTotalResult {
  ingresoTotal: number;   // Ventas cobradas + Ingresos extra de caja + Abonos de fiados
  ventasReales: number;   // Solo lo cobrado en ventas (efectivo/yape/tarjeta/transferencia)
  ingresosExtra: number;  // Ingresos manuales a caja (INTERNO, ej. sencillo/vueltos)
  abonosDeuda: number;    // Abonos de fiados pagados en el rango
  gastos: number;         // Egresos de caja (INTERNO), sin compras a proveedores/mercadería
}

export async function calcularIngresoTotal(fechaInicio: string, fechaFin: string): Promise<IngresoTotalResult> {
  const { inicioUTC, finUTC } = rangoUTCPeru(fechaInicio, fechaFin);

  const [sales, movements, debts] = await Promise.all([
    fetchAllRango('sales', 'id, amount_cash, amount_yape, amount_transfer, amount_card, sunat_status', inicioUTC, finUTC),
    fetchAllRango('cash_movements', 'type, amount, flujo, description', inicioUTC, finUTC),
    fetchAllRango('debt_payments', 'amount, fiado_id', inicioUTC, finUTC)
  ]);

  const facturasValidas = (sales || []).filter((s: any) => s.sunat_status !== 'ANULADO');
  const ventasReales = facturasValidas.reduce((acc: number, s: any) =>
    acc + Number(s.amount_cash || 0) + Number(s.amount_yape || 0) + Number(s.amount_card || 0) + Number(s.amount_transfer || 0), 0);

  let ingresosExtra = 0;
  let gastos = 0;
  (movements || []).forEach((m: any) => {
    if (m.flujo === 'EXTERNO') return;
    // El trigger de la BD ya mete los abonos de fiados en cash_movements con flujo
    // INGRESO_FIADO, pero ese mismo dinero ya se cuenta abajo vía debt_payments.
    if (m.flujo === 'INGRESO_FIADO') return;

    if (m.type === 'EGRESO') {
      // Ignoramos compras de mercadería/proveedores: el Costo de Inversión ya las
      // resta producto por producto; sumarlas aquí también las restaría dos veces.
      const descripcion = (m.description || '').toUpperCase();
      const esCompraMercaderia = descripcion.includes('PROVEEDOR') || descripcion.includes('MERCADER');
      if (!esCompraMercaderia) gastos += Number(m.amount || 0);
    }
    if (m.type === 'INGRESO') ingresosExtra += Number(m.amount || 0);
  });

  let abonosDeuda = 0;
  const fiadoIdsConAbono = Array.from(new Set((debts || []).map((d: any) => d.fiado_id).filter(Boolean)));
  let fiadoIdsAnulados = new Set<number>();
  if (fiadoIdsConAbono.length > 0) {
    const { data: fiadosDeAbonos } = await supabase.from('fiados').select('id, status').in('id', fiadoIdsConAbono);
    fiadoIdsAnulados = new Set((fiadosDeAbonos || []).filter((f: any) => f.status === 'ANULADO').map((f: any) => f.id));
  }
  (debts || []).forEach((d: any) => {
    // Si el ticket de esta deuda fue ANULADO después del abono, ese dinero ya se
    // revirtió en caja y no debe seguir sumando ingreso para siempre.
    if (fiadoIdsAnulados.has(d.fiado_id)) return;
    abonosDeuda += Number(d.amount || 0);
  });

  return {
    ingresoTotal: ventasReales + ingresosExtra + abonosDeuda,
    ventasReales, ingresosExtra, abonosDeuda, gastos
  };
}
