// src/sections/Finanzas/index.tsx
import React, { useState, useEffect } from 'react';
import { Wallet, ArrowDownToLine, Lock, CreditCard, Smartphone, Banknote, ReceiptText } from 'lucide-react';
import { supabase } from '../../db/supabase';
import type { CashSession, CashMovement, SuperMetricas } from './types';

import { ModalApertura } from './components/ModalApertura';
import { TablaMovimientos } from './components/TablaMovimientos';
import { ModalNuevoMovimiento } from './components/ModalNuevoMovimiento';
import { ModalCierre } from './components/ModalCierre';
import { TablaHistorial } from './components/TablaHistorial';
import { FiltroFechas } from './components/FiltroFechas';
// 🎯 MOTOR ÚNICO DE INGRESO TOTAL: misma fórmula y mismas fechas que Resumen, Reportes,
// Utilidades y Punto de Venta. Se usa SOLO para el número mostrado en "Gran Total en Caja"
// (decisión explícita del dueño: que coincida con las demás pantallas aunque ya no reste
// gastos/retiros). El arqueo real de "Cerrar Caja" (ModalCierre) NO usa esto — sigue su
// propio cálculo con superMetricas, sin cambios.
// (SuperMetricas ahora vive en ./types porque ModalCierre tambien lo necesita para el arqueo
// de Efectivo/Yape/Tarjeta al cerrar caja.)
import { calcularIngresoTotal, fechaLocalPeru } from '../../utils/ingresos';
import { usePermiso } from '../../utils/permisos';
import { traerTodo } from '../../utils/traerTodo';

export const Finanzas: React.FC = () => {
  // Abrir/cerrar caja y registrar ingresos/egresos son permisos distintos
  const puedeTurno = usePermiso('caja_abrir_cerrar_turno');
  const puedeMovimientos = usePermiso('caja_ingresos_egresos');
  const [sessionActiva, setSessionActiva] = useState<CashSession | null>(null);
  const [movimientos, setMovimientos] = useState<CashMovement[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Estados Clásicos y Nuevos
  const [superMetricas, setSuperMetricas] = useState<SuperMetricas | null>(null);
  // 🎯 Ingreso bruto de HOY (motor único) — mismo monto que Resumen/Reportes/Utilidades/POS,
  // usado solo para el número grande de "Gran Total en Caja".
  const [ventasNetasHoy, setVentasNetasHoy] = useState<number | null>(null);

  const [isAperturaModalOpen, setIsAperturaModalOpen] = useState(false);
  const [isMovimientoModalOpen, setIsMovimientoModalOpen] = useState(false);
  const [isCierreModalOpen, setIsCierreModalOpen] = useState(false);

  // NUEVO: Estados y funciones para el Historial y Limpieza
  const [vistaActual, setVistaActual] = useState<'ACTUAL' | 'HISTORIAL'>('ACTUAL');
  const [pestañaFlujo, setPestañaFlujo] = useState<'INTERNO' | 'EXTERNO'>('INTERNO'); // <-- Control de Pestañas
  const [historialCajas, setHistorialCajas] = useState<CashSession[]>([]);
  
  const [paginaActual, setPaginaActual] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const ITEMS_POR_PAGINA = 20;

  const cargarHistorial = async (page = 1, desde = fechaDesde, hasta = fechaHasta) => {
    let query = supabase
      .from('cash_sessions')
      .select('*', { count: 'exact' })
      .eq('status', 'CLOSED');

    if (desde && hasta) {
      query = query
        .gte('opened_at', `${desde}T00:00:00.000Z`)
        .lte('opened_at', `${hasta}T23:59:59.999Z`);
    }

    const from = (page - 1) * ITEMS_POR_PAGINA;
    const to = from + ITEMS_POR_PAGINA - 1;

    query = query.order('opened_at', { ascending: false }).range(from, to);

    const { data, count, error } = await query;

    if (error) {
      console.error("Error cargando historial:", error);
      return;
    }

    if (data) {
      setHistorialCajas(data as CashSession[]);
      setTotalPaginas(count ? Math.ceil(count / ITEMS_POR_PAGINA) : 1);
    }
  };

  const handleFilterChange = (desde: string, hasta: string) => {
    setFechaDesde(desde);
    setFechaHasta(hasta);
    setPaginaActual(1);
    cargarHistorial(1, desde, hasta);
  };

  useEffect(() => {
    cargarDatosCaja();

    // 🛡️ EVICAMP: Si la pestaña estuvo inactiva (u otra caja/dispositivo registró ventas),
    // al volver a mirarla se refrescan los totales para no quedar con datos viejos.
    // Se hace en modo silencioso para no tapar la pantalla con el loader cada vez que se regresa.
    const refrescarSilencioso = () => cargarDatosCaja(true);
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

  // 🎯 MOTOR ÚNICO DE INGRESO TOTAL: mismo cálculo que Resumen/Reportes/Utilidades/POS para
  // HOY (día calendario Perú), usado solo en la tarjeta "Gran Total en Caja".
  useEffect(() => {
    const cargarVentasNetasHoy = async () => {
      const hoy = fechaLocalPeru();
      const r = await calcularIngresoTotal(hoy, hoy);
      setVentasNetasHoy(r.ingresoTotal);
    };
    cargarVentasNetasHoy();
    window.addEventListener('focus', cargarVentasNetasHoy);
    return () => window.removeEventListener('focus', cargarVentasNetasHoy);
  }, []);

  const cargarDatosCaja = async (silencioso = false) => {
    if (!silencioso) setIsLoading(true);
    try {
      const { data: sessionData } = await supabase
        .from('cash_sessions')
        .select('*')
        .eq('status', 'OPEN')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle(); // <-- SOLUCIÓN: maybeSingle no hace explotar el sistema si la caja está cerrada

      if (sessionData) {
        setSessionActiva(sessionData as CashSession);
        
        // 1. Movimientos Manuales
        // Paginado (Supabase corta en 1000 filas); orden estable por id para que los bloques no se crucen.
        const { data: movData } = await traerTodo<any>(() => supabase.from('cash_movements').select('*').eq('session_id', sessionData.id).order('id'));
        
        // .neq('sunat_status','ANULADO') en Supabase descarta también las filas con sunat_status
        // NULL, y además necesitamos saber qué tickets anulados son de esta caja (ver DEVOLUCION).
        const { data: salesData } = await traerTodo<any>(() => supabase.from('sales').select('*').gte('created_at', sessionData.opened_at).order('id'));

        // Cada movimiento cuenta en la bolsa de SU método de pago (no todo es efectivo).
        const bolsaDe = (tipo: string | null | undefined): 'efectivo' | 'yape' | 'tarjeta' => {
          const t = (tipo || 'efectivo').toLowerCase();
          if (t === 'yape' || t === 'plin' || t === 'transferencia') return 'yape';
          if (t === 'tarjeta' || t === 'card') return 'tarjeta';
          return 'efectivo';
        };

        const esAnulada = (s: any) => s.status === 'ANULADO' || s.sunat_status === 'ANULADO';
        // Tickets anulados que se vendieron en ESTA caja: su venta ya no se suma, así que su
        // contraasiento DEVOLUCION no debe restarse otra vez (sería doble descuento).
        // Reportes guarda en la descripción los últimos 6 caracteres del id ("#xxxxxx").
        const anuladasDeEstaCaja = new Set(
          (salesData || []).filter(esAnulada).map((s: any) => String(s.id).slice(-6))
        );

        let gastos = 0, gastosYape = 0, gastosTarjeta = 0;
        let ingresosExtra = 0, ingresosExtraYape = 0, ingresosExtraTarjeta = 0;
        let vEfectivo = 0, vYape = 0, vTarjeta = 0;
        let dEfectivo = 0, dYape = 0, dTarjeta = 0;

        // 🔥 INGENIERÍA EVICAMP: El Trigger de la BD ya mete los abonos en cash_movements con flujo='INGRESO_FIADO'.
        movData?.forEach(m => {
          if (m.flujo === 'EXTERNO') return;
          const monto = Number(m.amount) || 0;
          const bolsa = bolsaDe(m.payment_type);

          if (m.type === 'INGRESO') {
            // 🔥 BYPASS TYPESCRIPT: Forzamos la validación como String puro
            if (String(m.flujo) === 'INGRESO_FIADO') {
              // Abono de deuda inyectado automáticamente por la base de datos
              if (bolsa === 'yape') dYape += monto;
              else if (bolsa === 'tarjeta') dTarjeta += monto;
              else dEfectivo += monto;
            } else {
              // Ingreso manual a caja (Ej: Sencillo, Vueltos)
              if (bolsa === 'yape') ingresosExtraYape += monto;
              else if (bolsa === 'tarjeta') ingresosExtraTarjeta += monto;
              else ingresosExtra += monto;
            }
          }
          if (m.type === 'EGRESO') {
            if (m.flujo === 'DEVOLUCION') {
              const ticket = /#(\w{1,6})\)?\s*$/.exec(String(m.description || ''))?.[1];
              // Anulación de un ticket de esta caja: la venta ya no cuenta, no se resta de nuevo.
              if (ticket && anuladasDeEstaCaja.has(ticket)) return;
              // Si el ticket era de una caja anterior, el dinero sí sale ahora: se resta abajo.
            }
            if (bolsa === 'yape') gastosYape += monto;
            else if (bolsa === 'tarjeta') gastosTarjeta += monto;
            else gastos += monto;
          }
        });

        salesData?.forEach(s => {
          // BLOQUEO MATEMÁTICO: Ignorar tickets FIADOS y ANULADOS (una venta anulada simplemente no cuenta)
          if (s.payment_method === 'FIADO' || s.payment_type === 'FIADO' || s.status === 'FIADO') return;
          if (esAnulada(s)) return;

          vEfectivo += Number(s.amount_cash || 0);
          vYape += Number(s.amount_yape || 0) + Number(s.amount_transfer || 0);
          vTarjeta += Number(s.amount_card || 0);
        });

        const fondoInicial = Number(sessionData.opening_balance) || 0;
        const efectivoFisicoQueDebeHaber = fondoInicial + vEfectivo + dEfectivo + ingresosExtra - gastos;
        const yapeEsperado = vYape + dYape + ingresosExtraYape - gastosYape;
        const tarjetaEsperada = vTarjeta + dTarjeta + ingresosExtraTarjeta - gastosTarjeta;

        setSuperMetricas({
          fondoInicial, ingresosExtra, gastos,
          ingresosExtraYape, ingresosExtraTarjeta, gastosYape, gastosTarjeta,
          ventasEfectivo: vEfectivo, ventasYape: vYape, ventasTarjeta: vTarjeta,
          cobroDeudasEfectivo: dEfectivo, cobroDeudasYape: dYape, cobroDeudasTarjeta: dTarjeta,
          efectivoEsperadoCaja: efectivoFisicoQueDebeHaber,
          yapeEsperado, tarjetaEsperada,
          totalFacturado: vEfectivo + vYape + vTarjeta
        });

        // 🔥 ARQUITECTURA TÉCNICA: Ya no necesitamos inyectar datos falsos.
        // El Trigger de la BD nos trajo los abonos reales en 'movData'. Solo los ordenamos.
        const todosLosMovimientos = [...(movData as CashMovement[] || [])];
        todosLosMovimientos.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        setMovimientos(todosLosMovimientos);
      } else {
        setSessionActiva(null);
      }
    } catch (error) {
      console.error(error);
    } finally {
      if (!silencioso) setIsLoading(false);
    }
  };

  // FUNCIÓN PARA ELIMINAR MOVIMIENTO MANUAL
  const handleDeleteMovimiento = async (idMov: string) => {
    // Los abonos de fiado los crea la base de datos: borrarlos aquí dejaría la deuda y la caja descuadradas.
    const mov = movimientos.find(m => String(m.id) === String(idMov));
    if (mov && String(mov.flujo) === 'INGRESO_FIADO') {
      alert('Este ingreso es un abono de crédito. Anúlalo desde Créditos.');
      return;
    }
    if (window.confirm('⚠️ ¿Seguro que deseas ELIMINAR este movimiento? Esta acción recalculará la caja.')) {
      const { error } = await supabase.from('cash_movements').delete().eq('id', idMov);
      if (error) {
        alert('Error al eliminar: ' + error.message);
      } else {
        cargarDatosCaja(); // Recargamos todo para recalcular la boveda
      }
    }
  };

  if (isLoading) return <div className="flex h-full items-center justify-center font-mono">Calculando Bóveda...</div>;

  return (
    <div className="h-full flex flex-col gap-4 sm:gap-6 p-0 w-full font-mono">
      
      <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-end gap-4 shrink-0">
        <div>
          <h1 className="text-xl sm:text-3xl font-black text-[#1E293B] uppercase tracking-tighter flex items-center gap-3">
            <Wallet className="text-[#10B981] w-6 h-6 sm:w-8 sm:h-8" /> Tesorería
          </h1>
          <p className="text-[#64748B] text-xs font-bold tracking-widest uppercase mt-1">
            Arqueo de Yape, Efectivo y Deudas en tiempo real
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button 
            onClick={() => {
              if (vistaActual === 'ACTUAL') {
                setVistaActual('HISTORIAL');
                cargarHistorial();
              } else {
                setVistaActual('ACTUAL');
              }
            }}
            className="flex-1 sm:flex-none justify-center bg-[#F8FAFC] text-[#1E293B] px-4 sm:px-6 py-3 border-2 border-[#1E293B] font-black text-xs uppercase tracking-widest sm:tracking-[0.2em] shadow-[4px_4px_0_0_#1E293B] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_0_#1E293B] transition-all cursor-pointer mr-2 flex items-center gap-2"
          >
            <ReceiptText size={16} /> {vistaActual === 'ACTUAL' ? 'Ver Historial' : 'Volver a Caja'}
          </button>

          {vistaActual === 'ACTUAL' && (
            !sessionActiva ? (puedeTurno && (
              <button onClick={() => setIsAperturaModalOpen(true)} className="flex-1 sm:flex-none bg-[#10B981] text-white px-4 sm:px-6 py-3 border-2 border-[#1E293B] font-black text-xs uppercase tracking-[0.2em] shadow-[4px_4px_0_0_#1E293B] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_0_#1E293B] transition-all cursor-pointer">
                Aperturar Caja
              </button>)
            ) : (
              <>
                {puedeMovimientos && (
                <button onClick={() => setIsMovimientoModalOpen(true)} className="flex-1 sm:flex-none justify-center bg-white text-[#1E293B] px-4 py-3 border-2 border-[#1E293B] font-black text-xs uppercase tracking-widest flex items-center gap-2 shadow-[4px_4px_0_0_#1E293B] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_0_#1E293B] transition-all cursor-pointer">
                  + Nuevo Movimiento
                </button>
                )}
                {puedeTurno && (
                <button onClick={() => setIsCierreModalOpen(true)} className="flex-1 sm:flex-none justify-center bg-[#EF4444] text-white px-4 sm:px-6 py-3 border-2 border-[#1E293B] font-black text-xs uppercase tracking-[0.2em] flex items-center gap-2 shadow-[4px_4px_0_0_#1E293B] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_0_#1E293B] transition-all cursor-pointer">
                  <Lock size={16} /> Cerrar Caja
                </button>
                )}
              </>
            )
          )}
        </div>
      </div>

      {vistaActual === 'HISTORIAL' ? (
        <div className="flex flex-col flex-1 h-full min-h-0">
          <FiltroFechas onFilter={handleFilterChange} />
          <TablaHistorial 
            historialCajas={historialCajas} 
            paginaActual={paginaActual}
            totalPaginas={totalPaginas}
            onPageChange={(nuevaPagina) => {
              setPaginaActual(nuevaPagina);
              cargarHistorial(nuevaPagina);
            }}
          />
        </div>
      ) : sessionActiva && superMetricas ? (
        <div className="flex flex-col gap-4 sm:gap-6 flex-1 overflow-y-auto custom-scrollbar pb-8 lg:pr-2">

          {/* PANEL MAESTRO DE RECAUDACIÓN (ESTILO EVICAMP) */}
          <div className="mb-0 bg-[#1E293B] border border-[#1E293B] rounded-none p-4 sm:p-6 text-center shadow-none shrink-0">
            <span className="text-[#64748B] text-xs sm:text-sm uppercase tracking-widest font-bold">Gran Total en Caja (Todo Incluido)</span>
            <h1 className="text-[#FFFFFF] text-3xl sm:text-5xl font-mono font-black mt-2">
              {ventasNetasHoy === null ? 'Calculando...' : `S/ ${ventasNetasHoy.toFixed(2)}`}
            </h1>
            <p className="text-[#94A3B8] text-xs mt-2 uppercase">Incluye Efectivo, Yape, Transferencias y Tarjetas</p>
          </div>

          {/* SÚPER PANEL DE MÉTRICAS */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 shrink-0">
            <div className="bg-white border-2 border-[#1E293B] p-4 flex flex-col justify-between">
               <p className="text-[12px] font-black text-[#64748B] uppercase tracking-widest flex items-center gap-2"><Banknote size={14}/> Efectivo Esperado Físico</p>
               <p className="text-xl sm:text-3xl font-black text-[#10B981] mt-2">S/ {superMetricas.efectivoEsperadoCaja.toFixed(2)}</p>
               <p className="text-[12px] font-bold text-[#64748B] uppercase mt-2 border-t pt-2">(Fondo + Ventas Físicas + Cobros - Gastos)</p>
            </div>
            
            <div className="bg-[#F8FAFC] border-2 border-[#E2E8F0] p-4">
               <p className="text-[12px] font-black text-[#3B82F6] uppercase tracking-widest flex items-center gap-2"><Smartphone size={14}/> Yape / Transferencias</p>
               <p className="text-xl font-black text-[#1E293B] mt-1">S/ {superMetricas.yapeEsperado.toFixed(2)}</p>
               <div className="text-[12px] font-bold text-[#64748B] uppercase mt-2 space-y-1 border-t pt-2">
                 <p>Ventas: S/ {superMetricas.ventasYape.toFixed(2)}</p>
                 <p>Cobros: S/ {superMetricas.cobroDeudasYape.toFixed(2)}</p>
                 {superMetricas.ingresosExtraYape > 0 && <p>Ingresos: S/ {superMetricas.ingresosExtraYape.toFixed(2)}</p>}
                 {superMetricas.gastosYape > 0 && <p className="text-[#EF4444]">Egresos: -S/ {superMetricas.gastosYape.toFixed(2)}</p>}
               </div>
            </div>

            <div className="bg-[#F8FAFC] border-2 border-[#E2E8F0] p-4">
               <p className="text-[12px] font-black text-[#8B5CF6] uppercase tracking-widest flex items-center gap-2"><CreditCard size={14}/> Pagos Tarjeta</p>
               <p className="text-xl font-black text-[#1E293B] mt-1">S/ {superMetricas.tarjetaEsperada.toFixed(2)}</p>
               <div className="text-[12px] font-bold text-[#64748B] uppercase mt-2 space-y-1 border-t pt-2">
                 <p>Ventas: S/ {superMetricas.ventasTarjeta.toFixed(2)}</p>
                 {superMetricas.cobroDeudasTarjeta > 0 && <p>Cobros: S/ {superMetricas.cobroDeudasTarjeta.toFixed(2)}</p>}
                 {superMetricas.ingresosExtraTarjeta > 0 && <p>Ingresos: S/ {superMetricas.ingresosExtraTarjeta.toFixed(2)}</p>}
                 {superMetricas.gastosTarjeta > 0 && <p className="text-[#EF4444]">Egresos: -S/ {superMetricas.gastosTarjeta.toFixed(2)}</p>}
               </div>
            </div>

            <div className="bg-[#FEF2F2] border-2 border-[#EF4444] p-4">
               <p className="text-[12px] font-black text-[#EF4444] uppercase tracking-widest flex items-center gap-2"><ArrowDownToLine size={14}/> Gastos y Retiros</p>
               <p className="text-xl font-black text-[#EF4444] mt-1">S/ {superMetricas.gastos.toFixed(2)}</p>
               <p className="text-[12px] font-bold text-[#EF4444] uppercase mt-2 border-t border-[#EF4444]/20 pt-2">Salió del cajón</p>
            </div>
          </div>

          <div className="flex-1 min-h-[420px] sm:min-h-[500px] short:min-h-[380px] shrink-0 bg-white border-2 border-[#E2E8F0] shadow-[4px_4px_0_0_#E2E8F0] sm:shadow-[8px_8px_0_0_#E2E8F0] flex flex-col overflow-hidden">
             
             <div className="flex border-b-2 border-[#E2E8F0] bg-[#F8FAFC] shrink-0">
               <button 
                 onClick={() => setPestañaFlujo('INTERNO')}
                 className={`flex-1 px-2 py-3 text-xs font-black uppercase tracking-normal sm:tracking-widest border-b-4 transition-colors cursor-pointer rounded-none ${pestañaFlujo === 'INTERNO' ? 'border-[#1E293B] text-[#1E293B] bg-white' : 'border-transparent text-[#94A3B8] hover:text-[#1E293B] hover:bg-white'}`}
               >
                 Movimientos Internos (Negocio)
               </button>
               <button 
                 onClick={() => setPestañaFlujo('EXTERNO')}
                 className={`flex-1 px-2 py-3 text-xs font-black uppercase tracking-normal sm:tracking-widest border-b-4 transition-colors cursor-pointer rounded-none ${pestañaFlujo === 'EXTERNO' ? 'border-[#1E293B] text-[#1E293B] bg-white' : 'border-transparent text-[#94A3B8] hover:text-[#1E293B] hover:bg-white'}`}
               >
                 Movimientos Externos (Personal)
               </button>
             </div>
             
             {/* TABLA FILTRADA CON FUNCIÓN ONDELTE */}
             <TablaMovimientos 
               movimientos={movimientos.filter(m => {
                 if (pestañaFlujo === 'INTERNO') {
                   // 🔥 BYPASS TYPESCRIPT: String() rompe el bloqueo estricto del compilador
                   return m.flujo === 'INTERNO' || !m.flujo || String(m.flujo) === 'INGRESO_FIADO';
                 }
                 return m.flujo === 'EXTERNO';
               })} 
               onDelete={handleDeleteMovimiento}
             />
          </div>
        </div>
      ) : (
        <div className="flex-1 border-4 border-dashed border-[#E2E8F0] flex flex-col items-center justify-center p-6">
           <Wallet size={64} className="text-[#CBD5E1] mb-4" />
           <h2 className="text-[#1E293B] font-black text-xl uppercase tracking-widest mb-2">Caja Cerrada</h2>
        </div>
      )}

      <ModalApertura isOpen={isAperturaModalOpen} onClose={() => setIsAperturaModalOpen(false)} onSuccess={cargarDatosCaja} />
      {sessionActiva && (
        <>
          <ModalNuevoMovimiento isOpen={isMovimientoModalOpen} onClose={() => setIsMovimientoModalOpen(false)} onSuccess={cargarDatosCaja} sessionId={sessionActiva.id} />
          {superMetricas && (
            <ModalCierre isOpen={isCierreModalOpen} onClose={() => setIsCierreModalOpen(false)} onSuccess={cargarDatosCaja} sessionActiva={sessionActiva} superMetricas={superMetricas} />
          )}
        </>
      )}
    </div>
  );
};