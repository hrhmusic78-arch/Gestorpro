import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../db/supabase';
import { Eye, EyeOff, BarChart3, X, Clock, Receipt, Coins, Smartphone, CreditCard, BookOpen, HandCoins } from 'lucide-react';
import { useCerrarConEscape } from '../../../utils/useCerrarConEscape';

interface Props {
  refreshTrigger: number;
}

export const MiniReporteDiario: React.FC<Props> = ({ refreshTrigger }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  useCerrarConEscape(isModalOpen, () => setIsModalOpen(false)); // Escape (o "Atrás" del control de TV) cierra la ventana
  const [totales, setTotales] = useState({
    efectivo: 0, yape: 0, tarjeta: 0, transferencia: 0, fiado: 0, totalReal: 0
  });
  const [ventasHoy, setVentasHoy] = useState<any[]>([]);

  useEffect(() => {
    const fetchHoy = async () => {
      const { data: sesionActiva } = await supabase
        .from('cash_sessions')
        .select('opened_at')
        .eq('status', 'OPEN')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!sesionActiva) {
        setTotales({ efectivo: 0, yape: 0, tarjeta: 0, transferencia: 0, fiado: 0, totalReal: 0 });
        setVentasHoy([]);
        return;
      }

      // 1. VENTAS DIRECTAS
      const { data: ventas } = await supabase
        .from('sales')
        .select('id, payment_type, amount_cash, amount_yape, amount_card, amount_transfer, amount_credit, total, created_at')
        .gte('created_at', sesionActiva.opened_at)
        .neq('sunat_status', 'ANULADO');

      // 🔥 2. ABONOS DE DEUDAS EN TIEMPO REAL (INTEGRACIÓN)
      const { data: abonos } = await supabase
        .from('cash_movements')
        .select('id, payment_type, amount, created_at')
        .eq('flujo', 'INGRESO_FIADO')
        .gte('created_at', sesionActiva.opened_at);

      let ef = 0, ya = 0, ta = 0, tr = 0, fi = 0;
      let ticketsUnificados: any[] = [];

      if (ventas) {
        ventas.forEach(s => {
          if (s.payment_type !== 'FIADO') {
            ef += Number(s.amount_cash || 0);
            ya += Number(s.amount_yape || 0);
            ta += Number(s.amount_card || 0);
            tr += Number(s.amount_transfer || 0);
          }
          fi += Number(s.amount_credit || 0);
          
          ticketsUnificados.push({
            id: s.id,
            tipo: 'VENTA',
            metodo: s.payment_type,
            total: Number(s.total || 0),
            hora: s.created_at
          });
        });
      }

      if (abonos) {
        abonos.forEach(a => {
          const tipoPago = (a.payment_type || '').toLowerCase();
          const monto = Number(a.amount || 0);
          
          if (tipoPago === 'yape' || tipoPago === 'transferencia' || tipoPago === 'plin') {
            ya += monto;
          } else if (tipoPago === 'tarjeta') {
            ta += monto;
          } else {
            ef += monto; // Por defecto efectivo
          }

          ticketsUnificados.push({
            id: a.id,
            tipo: 'ABONO',
            metodo: `ABONO ${a.payment_type || 'EFECTIVO'}`,
            total: monto,
            hora: a.created_at
          });
        });
      }

      ticketsUnificados.sort((a, b) => new Date(b.hora).getTime() - new Date(a.hora).getTime());

      const real = ef + ya + ta + tr;
      setTotales({ efectivo: ef, yape: ya, tarjeta: ta, transferencia: tr, fiado: fi, totalReal: real });
      setVentasHoy(ticketsUnificados);
    };
    fetchHoy();

    // 🛡️ EVICAMP: Si la pestaña estuvo inactiva (u otra caja/dispositivo registró ventas),
    // al volver a mirarla se refrescan los totales para no quedar con datos viejos.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchHoy();
    };
    window.addEventListener('focus', fetchHoy);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', fetchHoy);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refreshTrigger]);

  const modalContent = isModalOpen ? createPortal(
    <div className="fixed inset-0 bg-[#1E293B]/90 backdrop-blur-md z-[999999] flex items-center justify-center p-2 sm:p-8 animate-fade-in font-mono">
      <div className="bg-white border-4 border-[#1E293B] shadow-[8px_8px_0_0_#1E293B] sm:shadow-[16px_16px_0_0_#1E293B] w-full max-w-6xl flex flex-col h-[calc(var(--alto-pantalla)*0.9)] rounded-none">
        
        <div className="bg-[#1E293B] text-white p-4 sm:p-6 flex justify-between items-center gap-3 shrink-0">
          <h2 className="font-black uppercase tracking-widest text-sm sm:text-xl flex items-center gap-3">
            <Receipt size={28} className="text-[#10B981]" /> Rendimiento de Caja Actual
          </h2>
          <button onClick={() => setIsModalOpen(false)} className="hover:text-[#EF4444] transition-colors cursor-pointer bg-white/10 p-2 hover:bg-white/20">
            <X size={32} strokeWidth={3} />
          </button>
        </div>

        <div className="p-3 sm:p-8 bg-[#F8FAFC] flex-1 overflow-y-auto lg:overflow-hidden custom-scrollbar">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8 lg:h-full min-h-0">
            
            <div className="flex flex-col gap-4 sm:gap-6 lg:overflow-y-auto custom-scrollbar lg:pr-4 min-h-0">
              <div className="bg-[#1E293B] p-5 sm:p-8 text-center border-4 border-[#1E293B] shrink-0 shadow-[8px_8px_0_0_#CBD5E1]">
                <p className="text-[#94A3B8] text-xs font-black uppercase tracking-widest mb-2">Total Ingresado a Caja (Ventas + Abonos)</p>
                <p className="text-2xl sm:text-4xl sm:text-6xl lg:text-7xl font-black text-white mt-2 drop-shadow-lg break-all">S/ {totales.totalReal.toFixed(2)}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-5 shrink-0">
                <div className="bg-white border-4 border-[#E2E8F0] p-3 sm:p-5 flex flex-col items-center text-center min-w-0 shadow-[6px_6px_0_0_#E2E8F0]">
                  <Coins size={32} className="text-[#10B981] mb-2" />
                  <span className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">Efectivo Físico</span>
                  <span className="text-lg sm:text-3xl font-black text-[#1E293B] mt-1 break-all">S/ {totales.efectivo.toFixed(2)}</span>
                </div>
                <div className="bg-white border-4 border-[#E2E8F0] p-3 sm:p-5 flex flex-col items-center text-center min-w-0 shadow-[6px_6px_0_0_#E2E8F0]">
                  <Smartphone size={32} className="text-[#8B5CF6] mb-2" />
                  <span className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">Yape / Plin / Transf.</span>
                  <span className="text-lg sm:text-3xl font-black text-[#1E293B] mt-1 break-all">S/ {(totales.yape + totales.transferencia).toFixed(2)}</span>
                </div>
                <div className="bg-white border-4 border-[#E2E8F0] p-3 sm:p-5 flex flex-col items-center text-center min-w-0 shadow-[6px_6px_0_0_#E2E8F0]">
                  <CreditCard size={32} className="text-[#3B82F6] mb-2" />
                  <span className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">Tarjeta (POS)</span>
                  <span className="text-lg sm:text-3xl font-black text-[#1E293B] mt-1 break-all">S/ {totales.tarjeta.toFixed(2)}</span>
                </div>
                <div className="bg-white border-4 border-[#E2E8F0] p-3 sm:p-5 flex flex-col items-center text-center min-w-0 shadow-[6px_6px_0_0_#E2E8F0]">
                  <BookOpen size={32} className="text-[#EF4444] mb-2" />
                  <span className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">Deuda (Fiados Emitidos)</span>
                  <span className="text-lg sm:text-3xl font-black text-[#1E293B] mt-1 break-all">S/ {totales.fiado.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="border-4 border-[#E2E8F0] bg-white flex flex-col min-h-[300px] lg:h-full lg:min-h-0 shadow-[8px_8px_0_0_#E2E8F0]">
              <div className="bg-[#F8FAFC] border-b-4 border-[#E2E8F0] p-5 shrink-0 flex justify-between items-center">
                <h3 className="text-base font-black text-[#1E293B] uppercase tracking-widest">Desglose Movimientos ({ventasHoy.length})</h3>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 min-h-0">
                {ventasHoy.length > 0 ? ventasHoy.map((v) => (
                  <div key={v.id} className="flex justify-between items-center gap-3 p-3 sm:p-5 border-2 border-[#E2E8F0] hover:border-[#1E293B] bg-white hover:bg-[#F8FAFC] transition-all">
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-[#64748B] flex items-center gap-2">
                        <Clock size={16}/> {new Date(v.hora).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className={`text-base font-black uppercase mt-2 tracking-widest flex items-center gap-2 ${v.tipo === 'ABONO' ? 'text-[#3B82F6]' : v.metodo === 'FIADO' ? 'text-[#EF4444]' : 'text-[#1E293B]'}`}>
                        {v.tipo === 'ABONO' && <HandCoins size={18} />} {v.metodo}
                      </span>
                    </div>
                    <span className={`text-lg sm:text-2xl font-black shrink-0 ${v.metodo === 'FIADO' ? 'text-[#EF4444]' : 'text-[#10B981]'}`}>
                       S/ {v.total.toFixed(2)}
                    </span>
                  </div>
                )) : (
                  <div className="text-center p-6 sm:p-12 text-lg font-bold text-[#94A3B8]">Caja vacía. Aún no hay ventas.</div>
                )}
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  , document.getElementById('root') ?? document.body) : null; // dentro de #root para heredar el zoom de TV

  return (
    <>
      <div className="bg-white border-2 border-[#1E293B] shadow-[4px_4px_0_0_#E2E8F0] shrink-0 font-mono flex flex-col">
        <div className="bg-[#1E293B] text-white p-3 flex justify-between items-center">
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 hover:text-[#10B981] transition-colors cursor-pointer"
            title="Ver Historial del Día"
          >
            <BarChart3 size={18} />
            <span className="text-[11px] font-black uppercase tracking-widest hidden sm:inline">Caja Actual:</span>
            <span className="text-lg font-black text-[#10B981] ml-1">
              {isVisible ? `S/ ${totales.totalReal.toFixed(2)}` : 'S/ ***.**'}
            </span>
          </button>
          <button 
            onClick={() => setIsVisible(!isVisible)}
            className="text-[#94A3B8] hover:text-white transition-colors cursor-pointer px-2"
          >
            {isVisible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        <div className="grid grid-cols-4 divide-x-2 divide-[#E2E8F0] bg-[#F8FAFC] min-w-0">
          <div className="p-1.5 sm:p-2 flex flex-col items-center justify-center text-center min-w-0">
            <span className="text-[9px] font-black text-[#64748B] uppercase mb-1">Efectivo</span>
            <span className="text-xs font-black text-[#1E293B]">{isVisible ? `S/ ${totales.efectivo.toFixed(1)}` : '***'}</span>
          </div>
          <div className="p-1.5 sm:p-2 flex flex-col items-center justify-center text-center min-w-0">
            <span className="text-[9px] font-black text-[#8B5CF6] uppercase mb-1">Yape/Plin</span>
            <span className="text-xs font-black text-[#1E293B]">{isVisible ? `S/ ${(totales.yape + totales.transferencia).toFixed(1)}` : '***'}</span>
          </div>
          <div className="p-1.5 sm:p-2 flex flex-col items-center justify-center text-center min-w-0">
            <span className="text-[9px] font-black text-[#3B82F6] uppercase mb-1">Tarjeta</span>
            <span className="text-xs font-black text-[#1E293B]">{isVisible ? `S/ ${totales.tarjeta.toFixed(1)}` : '***'}</span>
          </div>
          <div className="p-1.5 sm:p-2 flex flex-col items-center justify-center text-center min-w-0">
            <span className="text-[9px] font-black text-[#EF4444] uppercase mb-1">Fiados</span>
            <span className="text-xs font-black text-[#1E293B]">{isVisible ? `S/ ${totales.fiado.toFixed(1)}` : '***'}</span>
          </div>
        </div>
      </div>
      {modalContent}
    </>
  );
};