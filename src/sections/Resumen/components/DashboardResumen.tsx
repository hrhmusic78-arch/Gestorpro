// src/sections/Resumen/components/DashboardResumen.tsx
import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, DollarSign, TrendingUp, ShoppingCart, 
  Users, Package, Hash, Tags, Trash2, CreditCard, Star, Loader2, AlertCircle 
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TarjetaMetrica } from './TarjetaMetrica';
import { supabase } from '../../../db/supabase';
// 🎯 MOTOR ÚNICO DE INGRESO TOTAL: misma fórmula y mismas fechas (Perú, UTC-5 fijo) que
// Reportes, Utilidades, Finanzas y Punto de Venta, para que "Ventas Netas" SIEMPRE coincida.
import { calcularIngresoTotal, fechaLocalPeru, primerDiaMesPeru, haceNDiasPeru, rangoUTCPeru } from '../../../utils/ingresos';

export const DashboardResumen: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawData, setRawData] = useState<any>(null); // Memoria cache
  const [periodo, setPeriodo] = useState<'HOY' | 'SEMANA' | 'MES'>('HOY'); // Filtro
  const [metricas, setMetricas] = useState({
    ventasBrutas: 0,
    utilidadReal: 0,
    costoVenta: 0,
    cuentasPorCobrar: 0,
    valorizacionInventario: 0,
    unidadesTotales: 0,
    kilosTotales: 0,
    catalogoActivo: 0,
    mermasValor: 0,
  });
  const [flujoNeto, setFlujoNeto] = useState<any[]>([]);
  const [topProductos, setTopProductos] = useState<any[]>([]);

  useEffect(() => {
    const fetchDashboardData = async (silencioso = false) => {
      try {
        if (!silencioso) setLoading(true);
        setError(null);

        // MODIFICACIÓN TÉCNICA: Agregamos la tabla 'batches' y quitamos los filtros estrictos
        const [
          { data: sales, error: errSales },
          { data: saleDetails, error: errDetails },
          { data: wastes, error: errWaste },
          { data: products, error: errProducts },
          { data: fiados, error: errFiados },
          { data: debtPayments, error: errPayments },
          { data: batches, error: errBatches } // <-- AÑADIDO PARA LEER LOS LOTES
        ] = await Promise.all([
          supabase.from('sales').select('*'),
          supabase.from('sale_details').select('*'),
          supabase.from('waste').select('*'),
          supabase.from('products').select('*'), 
          supabase.from('fiados').select('*'),
          supabase.from('debt_payments').select('*'),
          supabase.from('batches').select('id, product_id, quantity, cost_unit') // <-- AÑADIDO
        ]);

        if (errSales || errDetails || errWaste || errProducts || errFiados || errPayments || errBatches) {
          throw new Error("Fallo en la sincronización de tablas operativas.");
        }
        
        // Guardamos todo crudo y terminamos el fetch
        setRawData({ sales, saleDetails, wastes, products, fiados, debtPayments, batches });

      } catch (err: any) {
        setError(err.message);
      } finally {
        if (!silencioso) setLoading(false);
      }
    };

    fetchDashboardData();

    // 🛡️ EVICAMP: Si la pestaña estuvo inactiva (u otra caja/dispositivo registró ventas),
    // al volver a mirarla se refrescan los totales en silencio, sin tapar la pantalla con el loader.
    const refrescarSilencioso = () => fetchDashboardData(true);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refrescarSilencioso();
    };
    window.addEventListener('focus', refrescarSilencioso);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', refrescarSilencioso);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // 2do Efecto: Cálculos filtrados
  useEffect(() => {
    if (!rawData) return;

    const procesarMetricas = async () => {
    const { sales, saleDetails, wastes, products, fiados, debtPayments, batches } = rawData;

    // 🛠️ MOTOR DE FECHAS PURO: rango de fechas FIJO en hora Perú (UTC-5), sin depender de la
    // zona horaria configurada en el dispositivo/navegador — así "HOY" es el mismo día para
    // cualquier equipo (antes se calculaba con new Date().getFullYear()/getMonth() del propio
    // dispositivo, que podía correrse si el reloj/zona horaria del equipo no era Perú).
    const hoy = fechaLocalPeru();
    let fechaInicioRango = hoy;
    if (periodo === 'SEMANA') fechaInicioRango = haceNDiasPeru(7); // últimos 7 días, igual que Reportes/Utilidades
    if (periodo === 'MES') fechaInicioRango = primerDiaMesPeru();
    const { inicioUTC, finUTC } = rangoUTCPeru(fechaInicioRango, hoy);
    const inicioMs = new Date(inicioUTC).getTime();
    const finMs = new Date(finUTC).getTime();
    const isWithinRange = (dateStr: string) => {
      if (!dateStr) return true;
      const t = new Date(dateStr).getTime();
      return t >= inicioMs && t < finMs;
    };

    // 🚨 CORRECCIÓN: excluir tickets ANULADOS del período, igual que Punto de Venta, Finanzas,
    // Reportes y Utilidades. Antes esta pantalla sumaba TODAS las ventas del rango sin filtrar
    // por estado, así que un ticket anulado seguía inflando "Ventas Netas" aquí aunque ya no
    // contara en el resto del sistema — eso descuadraba el ingreso total entre pantallas.
    const salesFiltered = (sales || []).filter((s: any) => isWithinRange(s.created_at) && s.sunat_status !== 'ANULADO');
    const validSaleIds = new Set(salesFiltered.map((s: any) => s.id));
    const saleDetailsFiltered = (saleDetails || []).filter((d: any) => validSaleIds.has(d.sale_id));
    const wastesFiltered = (wastes || []).filter((w: any) => isWithinRange(w.created_at));
    // 🛡️ Si el ticket de un fiado fue ANULADO después de un abono, ese abono ya se revirtió en
    // caja (ver Reportes -> Anular Ticket) y no debe seguir sumando ingreso para siempre.
    const fiadoIdsAnulados = new Set((fiados || []).filter((f: any) => f.status === 'ANULADO').map((f: any) => f.id));
    const debtPaymentsFiltered = (debtPayments || []).filter((dp: any) => isWithinRange(dp.created_at) && !fiadoIdsAnulados.has(dp.fiado_id));
    // 🚨 CORRECCIÓN: un fiado ANULADO no debe seguir contando como deuda pendiente por cobrar.
    const fiadosFiltered = (fiados || []).filter((f: any) => isWithinRange(f.date_given) && f.status !== 'ANULADO');

        // --- CÁLCULOS TÉCNICOS ---
        // 🎯 MOTOR ÚNICO DE INGRESO TOTAL: se pide el mismo cálculo que usan Reportes,
        // Utilidades, Finanzas y Punto de Venta para este mismo rango de fechas, así
        // "Ventas Netas" SIEMPRE es el mismo monto en las 5 pantallas.
        const ingresoCanonico = await calcularIngresoTotal(fechaInicioRango, hoy);
        const ventasBrutas = ingresoCanonico.ingresoTotal;
        const costoVenta = saleDetailsFiltered.reduce((acc: number, d: any) => acc + (Number(d.cost_at_moment || 0) * Number(d.quantity || 0)), 0);
        const mermasValor = wastesFiltered.reduce((acc: number, w: any) => acc + Number(w.total_loss || 0), 0);
        const utilidadReal = ventasBrutas - costoVenta - mermasValor;

        const fiadosPendientes = fiadosFiltered.filter((f: any) => String(f.status).toUpperCase() !== 'CANCELADO');
        const cuentasPorCobrar = fiadosPendientes.reduce((acc: number, f: any) => acc + (Number(f.amount || 0) - Number(f.paid_amount || 0)), 0);

        // --- LÓGICA COPIADA DE INVENTARIO (Cálculo real de stock por lotes) ---
        let valorizacionInventario = 0;
        let unidadesTotales = 0; // Solo productos por UNIDAD (enteros)
        let kilosTotales = 0; // Solo productos por PESO (KG, con decimales)
        const catalogoActivo = (products || []).length;

        (products || []).forEach((p: any) => {
          // Buscamos todos los lotes de este producto
          const lotesDelProducto = (batches || []).filter((b: any) => b.product_id === p.id);

          // Sumamos la cantidad de todos sus lotes
          const stockRealGlobal = lotesDelProducto.length > 0
            ? lotesDelProducto.reduce((total: number, lote: any) => total + (Number(lote.quantity) || 0), 0)
            : 0;

          // 🚨 CORRECCIÓN: Tomamos el costo del lote MÁS RECIENTE (por ID numérico), no el primero
          // que devuelva la base de datos. Antes esto podía tomar un lote viejo con costo desactualizado.
          const loteMasReciente = lotesDelProducto.length > 0
            ? [...lotesDelProducto].sort((a: any, b: any) => Number(b.id || 0) - Number(a.id || 0))[0]
            : null;
          const costReal = loteMasReciente ? Number(loteMasReciente.cost_unit) : (Number(p.cost_price) || 0);

          valorizacionInventario += (stockRealGlobal * costReal);

          const esConsumo = String(p.unit || '').toUpperCase().includes('CONSUMO') || String(p.control_type || '').toUpperCase().includes('CONSUM');
          const esPeso = String(p.unit || p.weight_unit || '').toUpperCase() === 'KG' || p.control_type === 'WEIGHT';
          if (esPeso) kilosTotales += stockRealGlobal;
          else if (!esConsumo) unidadesTotales += stockRealGlobal;
        });

        setMetricas({
          ventasBrutas, utilidadReal, costoVenta, cuentasPorCobrar,
          valorizacionInventario, unidadesTotales, kilosTotales, catalogoActivo, mermasValor
        });

        // --- FLUJO POR MÉTODO ---
        let flujo = { Efectivo: 0, Yape: 0, Plin: 0, Tarjeta: 0 };
        salesFiltered.forEach((s: any) => {
          flujo.Efectivo += Number(s.amount_cash || 0);
          flujo.Yape += Number(s.amount_yape || 0);
          flujo.Plin += Number(s.amount_transfer || 0);
          flujo.Tarjeta += Number(s.amount_card || 0);
        });
        debtPaymentsFiltered.forEach((dp: any) => {
          flujo.Efectivo += Number(dp.amount_cash || 0);
          flujo.Yape += Number(dp.amount_yape || 0);
          flujo.Plin += Number(dp.amount_transfer || 0);
          flujo.Tarjeta += Number(dp.amount_card || 0);
        });

        setFlujoNeto([
          { metodo: 'Efectivo', neto: flujo.Efectivo },
          { metodo: 'Yape', neto: flujo.Yape },
          { metodo: 'Plin', neto: flujo.Plin },
          { metodo: 'Tarjeta', neto: flujo.Tarjeta },
        ]);

        const productAggr: Record<string, { desc: string, total: number }> = {};
        saleDetailsFiltered.forEach((d: any) => {
          if (!productAggr[d.product_id]) productAggr[d.product_id] = { desc: d.product_name, total: 0 };
          productAggr[d.product_id].total += Number(d.subtotal);
        });
        setTopProductos(Object.values(productAggr).sort((a, b) => b.total - a.total).slice(0, 5));
    };

    procesarMetricas();
  }, [rawData, periodo]);

  const fSoles = (v: number) => `S/ ${v.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-full bg-white">
      <Loader2 className="animate-spin text-[#10B981]" size={48} />
      <p className="font-mono text-[#1E293B] text-xs tracking-widest sm:tracking-[0.4em] uppercase mt-6 animate-pulse text-center">Iniciando Motor de Reportes...</p>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center h-full bg-white p-5 sm:p-10 border-2 border-[#1E293B]">
      <AlertCircle className="text-red-600 mb-4" size={64} />
      <h2 className="text-2xl font-black text-[#1E293B] uppercase tracking-tighter">Falla de Integridad SQL</h2>
      <p className="font-mono text-[#64748B] mt-2 text-center text-sm">{error}</p>
      <button onClick={() => window.location.reload()} className="mt-8 bg-[#1E293B] text-white px-10 py-4 font-black uppercase hover:bg-[#10B981] transition-all rounded-none border border-[#1E293B]">Reintentar Conexión</button>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-white rounded-none border-l border-[#E2E8F0]">
      {/* HEADER TÉCNICO - CONTRASTE MEDIO */}
      <div className="bg-white border-b-2 border-[#1E293B] p-4 sm:p-6 shrink-0 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 z-10 rounded-none">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-3xl font-black text-[#1E293B] tracking-tight flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-1 uppercase">
            <LayoutDashboard className="text-[#10B981] w-6 h-6 sm:w-8 sm:h-8" />
            Resumen <span className="text-[#10B981]">Operativo</span>
          </h1>
          <p className="text-[#64748B] text-[10px] mt-1 font-mono uppercase tracking-widest sm:tracking-[0.4em] font-bold">Consolidado Real de Mermas y Finanzas</p>
        </div>
        
        <div className="flex flex-col items-stretch md:items-end gap-3 w-full md:w-auto">
            <div className="flex flex-col items-stretch md:items-end gap-3">
            <div className="grid grid-cols-3 md:flex border border-[#1E293B] bg-white rounded-none shadow-[2px_2px_0px_0px_#1E293B]">
              {(['HOY', 'SEMANA', 'MES'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriodo(p)}
                  className={`px-4 py-2 md:py-1.5 font-mono text-[10px] cursor-pointer font-black uppercase tracking-widest transition-colors ${
                    periodo === p ? 'bg-[#1E293B] text-[#10B981]' : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#1E293B]'
                  } ${p !== 'MES' ? 'border-r border-[#1E293B]' : ''}`}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="hidden md:flex items-center gap-3 border border-[#1E293B] bg-white px-5 py-2 font-mono text-[11px] font-black uppercase tracking-widest text-[#10B981] rounded-none shadow-[2px_2px_0px_0px_#10B981]">
                <div className="w-2.5 h-2.5 bg-[#10B981] animate-pulse"></div>
                Conexión Estable
            </div>
        </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-6 lg:p-8 space-y-8 sm:space-y-10 short:space-y-5 custom-scrollbar">

        {/* MÉTRICAS DE ALTO IMPACTO */}
        <section>
          <h2 className="text-[12px] font-black text-[#1E293B] uppercase tracking-widest sm:tracking-[0.3em] mb-5 flex items-center gap-4">
            <div className="w-3 h-5 bg-[#10B981]"></div> Balance Financiero
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
            <TarjetaMetrica titulo="Ventas Netas" valor={fSoles(metricas.ventasBrutas)} icono={DollarSign} colorIcono="text-[#10B981]" bgIcono="bg-[#D1FAE5]" esPositivo={true} />
            <TarjetaMetrica titulo="Ganancia Real" valor={fSoles(metricas.utilidadReal)} icono={TrendingUp} colorIcono="text-[#10B981]" bgIcono="bg-[#D1FAE5]" esPositivo={metricas.utilidadReal > 0} />
            <TarjetaMetrica titulo="Inversión en Costo" valor={fSoles(metricas.costoVenta)} icono={ShoppingCart} colorIcono="text-[#1E293B]" bgIcono="bg-[#F1F5F9]" />
            <TarjetaMetrica titulo="Saldos Fiados" valor={fSoles(metricas.cuentasPorCobrar)} icono={Users} colorIcono="text-red-600" bgIcono="bg-red-50" />
          </div>
        </section>

        {/* CONTROL DE ACTIVOS */}
        <section>
          <h2 className="text-[12px] font-black text-[#1E293B] uppercase tracking-widest sm:tracking-[0.3em] mb-5 flex items-center gap-4">
            <div className="w-3 h-5 bg-[#1E293B]"></div> Inventario y Mermas
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-6">
            <TarjetaMetrica titulo="Valorización Total" valor={fSoles(metricas.valorizacionInventario)} icono={Package} colorIcono="text-[#1E293B]" bgIcono="bg-[#F1F5F9]" />
            <TarjetaMetrica titulo="Stock Unidades" valor={String(Math.round(metricas.unidadesTotales))} icono={Hash} colorIcono="text-[#1E293B]" bgIcono="bg-[#F1F5F9]" />
            <TarjetaMetrica titulo="Stock Kilos" valor={`${metricas.kilosTotales.toFixed(2)} KG`} icono={Hash} colorIcono="text-[#1E293B]" bgIcono="bg-[#F1F5F9]" />
            <TarjetaMetrica titulo="Items Activos" valor={metricas.catalogoActivo} icono={Tags} colorIcono="text-[#10B981]" bgIcono="bg-[#D1FAE5]" />
            <TarjetaMetrica titulo="Mermas Registradas" valor={fSoles(metricas.mermasValor)} icono={Trash2} colorIcono="text-red-600" bgIcono="bg-red-50" />
          </div>
        </section>

        {/* ÁREA ANALÍTICA */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8 pb-12">
          
          {/* GRÁFICA DE FLUJO MANTENIDA CON BORDES SUAVIZADOS */}
          <div className="lg:col-span-2 bg-white border-2 border-[#1E293B] flex flex-col rounded-none shadow-[4px_4px_0px_0px_#10B981] transition-shadow hover:shadow-[6px_6px_0px_0px_#10B981]">
            <div className="p-4 border-b-2 border-[#1E293B] bg-[#F8FAFC] flex justify-between items-center">
               <h3 className="text-xs font-black text-[#1E293B] uppercase tracking-widest flex items-center gap-2">
                 <CreditCard size={18} className="text-[#10B981]"/> Flujo por Método de Pago
               </h3>
            </div>
            <div className="p-4 sm:p-6 lg:p-8 short:py-4 flex-1 w-full" style={{ minHeight: '350px' }}>
              <ResponsiveContainer width="99%" height={350} minWidth={1}>
                <BarChart data={flujoNeto} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="metodo" axisLine={{ stroke: '#1E293B', strokeWidth: 2 }} tick={{ fill: '#1E293B', fontSize: 11, fontWeight: 'bold', fontFamily: 'monospace' }} tickLine={false} />
                  <YAxis axisLine={{ stroke: '#1E293B', strokeWidth: 2 }} tick={{ fill: '#64748B', fontSize: 11, fontFamily: 'monospace' }} tickLine={false} />
                  <Tooltip 
                    cursor={{ fill: '#D1FAE5', opacity: 0.4 }} 
                    formatter={(v: any) => [fSoles(Number(v)), "Ingreso Neto"]} 
                    contentStyle={{ border: '2px solid #1E293B', borderRadius: '0px', padding: '10px', fontFamily: 'monospace', fontWeight: 'bold' }} 
                  />
                  <Bar dataKey="neto" barSize={50}>
                    {flujoNeto.map((entry, index) => (
                      <Cell key={index} fill={entry.neto > 0 ? '#10B981' : '#EF4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* TABLA TOP PRODUCTOS CON CONTRASTE MEDIO */}
          <div className="bg-white border-2 border-[#1E293B] flex flex-col rounded-none shadow-[4px_4px_0px_0px_#1E293B] transition-shadow hover:shadow-[6px_6px_0px_0px_#1E293B]">
            <div className="p-4 border-b-2 border-[#1E293B] bg-[#F8FAFC]">
               <h3 className="text-xs font-black text-[#1E293B] uppercase tracking-widest flex items-center gap-2">
                 <Star size={18} className="text-[#10B981]"/> Top Productos
               </h3>
            </div>
            <div className="p-5 flex-1 overflow-auto">
              {topProductos.length > 0 ? (
                <table className="w-full text-left font-mono">
                  <thead>
                    <tr className="text-[10px] text-[#64748B] uppercase border-b-2 border-[#1E293B]">
                      <th className="pb-3 font-black">Descripción</th>
                      <th className="pb-3 text-right font-black">Recaudado</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs">
                    {topProductos.map((p, i) => (
                      <tr key={i} className="border-b border-[#F1F5F9] hover:bg-[#D1FAE5]/30 transition-colors">
                        <td className="py-4 font-bold text-[#1E293B] uppercase text-[11px] truncate max-w-[130px]" title={p.desc}>{p.desc}</td>
                        <td className="py-4 text-right text-[#10B981] font-black">{fSoles(p.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex items-center justify-center h-full font-mono text-[10px] text-[#64748B] uppercase tracking-[0.2em]">Data no disponible</div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};