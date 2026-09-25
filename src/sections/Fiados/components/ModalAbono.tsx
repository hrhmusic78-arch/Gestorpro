import React, { useState, useEffect } from 'react';
import { X, Banknote, CreditCard, Smartphone, Calculator } from 'lucide-react';
import { supabase } from '../../../db/supabase';
import type { Fiado } from '../types';
import { useCerrarConEscape } from '../../../utils/useCerrarConEscape';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (pagos: { efectivo: number; yape: number; tarjeta: number }) => void;
  fiado: Fiado | null;
}

export const ModalAbono: React.FC<Props> = ({ isOpen, onClose, onConfirm, fiado }) => {
  useCerrarConEscape(isOpen, onClose); // Escape (o "Atrás" del control de TV) cierra la ventana
  const [efectivo, setEfectivo] = useState<string>('');
  const [yape, setYape] = useState<string>('');
  const [tarjeta, setTarjeta] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false); 

  useEffect(() => {
    if (isOpen && fiado) {
      setEfectivo(fiado.saldoPendiente.toString());
      setYape('');
      setTarjeta('');
    }
  }, [isOpen, fiado]);

  if (!isOpen || !fiado) return null;

  const valEfectivo = Number(efectivo) || 0;
  const valYape = Number(yape) || 0;
  const valTarjeta = Number(tarjeta) || 0;
  
  // Destrucción de la distorsión de coma flotante de JavaScript
  const totalAbono = Number((valEfectivo + valYape + valTarjeta).toFixed(2));
  const saldoPendiente = Number(fiado.saldoPendiente.toFixed(2));
  const nuevoSaldo = Number((saldoPendiente - totalAbono).toFixed(2));

  const handleConfirm = async () => {
    if (isSaving) return; 
    if (totalAbono <= 0) return alert('El monto debe ser mayor a 0.');
    
    // Aplicamos tolerancia de 0.05 del backend
    if (totalAbono > Number((saldoPendiente + 0.05).toFixed(2))) {
        return alert('El abono supera la deuda pendiente.');
    }

    setIsSaving(true); 
    try {
      const { data: session } = await supabase.from('cash_sessions').select('id').eq('status', 'OPEN').single();

      // 🚨 CORRECCIÓN ARQUITECTÓNICA: 
      // Se eliminó la inyección 'id: Date.now()' para evitar el Error 409 (Conflict).
      // Ahora PostgreSQL generará el ID secuencial automáticamente sin colisiones.
      const { error: pagoError } = await supabase.from('debt_payments').insert([{
        fiado_id: Number(fiado.id),
        customer_id: fiado.clienteId ? Number(fiado.clienteId) : null,
        amount: totalAbono,
        amount_cash: valEfectivo,
        amount_yape: valYape,
        amount_card: valTarjeta,
        payment_type: valEfectivo > 0 ? 'efectivo' : (valYape > 0 ? 'yape' : 'tarjeta'),
        session_id: session ? session.id : null,
        created_at: new Date().toISOString(),
        is_synced: 1
      }]);
      
      if (pagoError) throw pagoError;

      alert('✅ Abono registrado en la base de datos y sumado a la caja actual.');
      onConfirm({ efectivo: valEfectivo, yape: valYape, tarjeta: valTarjeta });
      setIsSaving(false);
    } catch (e: any) {
      alert('Error al registrar abono en BD: ' + e.message);
      setIsSaving(false); 
    }
  };

  return (
    <div className="fixed inset-0 bg-[#1E293B]/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 font-mono">
      <div className="max-h-[calc(var(--alto-pantalla)*0.94)] overflow-y-auto bg-white w-full max-w-md border-2 border-[#1E293B] shadow-[8px_8px_0_0_#1E293B] flex flex-col rounded-none">
        
        {/* HEADER */}
        <div className="bg-[#10B981] text-[#1E293B] px-6 py-4 flex justify-between items-center shrink-0 border-b-2 border-[#1E293B]">
          <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
            <Calculator size={20} /> Abono Mixto
          </h2>
          <button onClick={onClose} className="hover:text-white transition-colors cursor-pointer"><X size={20} /></button>
        </div>

        {/* BODY */}
        <div className="p-6 bg-[#F8FAFC] flex flex-col gap-4">
          <div className="bg-[#1E293B] text-white p-4 text-center border-2 border-[#1E293B] rounded-none">
            <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-widest">Saldo Actual de la Deuda</p>
            <p className="text-xl sm:text-3xl font-black text-[#EF4444]">S/ {saldoPendiente.toFixed(2)}</p>
            <p className="text-[10px] font-bold uppercase mt-1">Cliente: {fiado.clienteNombre}</p>
          </div>

          <div className="space-y-3 mt-2">
            <p className="text-[10px] font-black uppercase text-[#64748B] mb-2">Ingresa los montos por método de pago:</p>
            
            {/* EFECTIVO */}
            <div className="flex items-center gap-3 bg-white p-2 border-2 border-[#E2E8F0] focus-within:border-[#10B981] transition-colors rounded-none">
              <div className="w-8 h-8 bg-[#ECFDF5] flex items-center justify-center text-[#10B981]"><Banknote size={16}/></div>
              <span className="text-xs font-black uppercase flex-1 text-[#1E293B]">Efectivo</span>
              <div className="flex items-center gap-1">
                <span className="text-[#94A3B8] font-bold text-xs">S/</span>
                <input 
                  type="number" 
                  value={efectivo} 
                  onChange={(e) => setEfectivo(e.target.value)}
                  className="w-24 text-right text-sm font-black outline-none text-[#1E293B] rounded-none"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* YAPE */}
            <div className="flex items-center gap-3 bg-white p-2 border-2 border-[#E2E8F0] focus-within:border-[#8B5CF6] transition-colors rounded-none">
              <div className="w-8 h-8 bg-[#F5F3FF] flex items-center justify-center text-[#8B5CF6]"><Smartphone size={16}/></div>
              <span className="text-xs font-black uppercase flex-1 text-[#1E293B]">Yape</span>
              <div className="flex items-center gap-1">
                <span className="text-[#94A3B8] font-bold text-xs">S/</span>
                <input 
                  type="number" 
                  value={yape} 
                  onChange={(e) => setYape(e.target.value)}
                  className="w-24 text-right text-sm font-black outline-none text-[#1E293B] rounded-none"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* TARJETA */}
            <div className="flex items-center gap-3 bg-white p-2 border-2 border-[#E2E8F0] focus-within:border-[#3B82F6] transition-colors rounded-none">
              <div className="w-8 h-8 bg-[#EFF6FF] flex items-center justify-center text-[#3B82F6]"><CreditCard size={16}/></div>
              <span className="text-xs font-black uppercase flex-1 text-[#1E293B]">Tarjeta</span>
              <div className="flex items-center gap-1">
                <span className="text-[#94A3B8] font-bold text-xs">S/</span>
                <input 
                  type="number" 
                  value={tarjeta} 
                  onChange={(e) => setTarjeta(e.target.value)}
                  className="w-24 text-right text-sm font-black outline-none text-[#1E293B] rounded-none"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          {/* RESUMEN DEL ABONO */}
          <div className="mt-2 bg-[#FEF2F2] border-2 border-[#EF4444] p-3 flex justify-between items-center rounded-none">
            <div>
              <p className="text-[10px] font-black uppercase text-[#EF4444]">Total a Abonar</p>
              <p className="text-sm font-black text-[#1E293B]">S/ {totalAbono.toFixed(2)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black uppercase text-[#EF4444]">Deuda Restante</p>
              <p className="text-lg font-black text-[#EF4444] leading-none">S/ {Math.max(0, nuevoSaldo).toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="p-4 bg-white border-t-2 border-[#E2E8F0] flex justify-end gap-3 rounded-none">
          <button onClick={onClose} className="px-4 py-2 bg-white border-2 border-[#E2E8F0] text-[#64748B] text-[10px] font-black uppercase hover:border-[#1E293B] hover:text-[#1E293B] transition-colors cursor-pointer rounded-none">Cancelar</button>
          <button 
            onClick={handleConfirm} 
            disabled={isSaving}
            className={`px-6 py-2 border-2 border-[#1E293B] text-[10px] font-black uppercase transition-all shadow-[2px_2px_0_0_#1E293B] rounded-none ${
              isSaving 
                ? 'bg-[#E2E8F0] text-[#94A3B8] cursor-not-allowed shadow-none translate-x-[2px] translate-y-[2px]' 
                : 'bg-[#10B981] text-[#1E293B] hover:bg-[#1E293B] hover:text-[#10B981] cursor-pointer hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]'
            }`}
          >
            {isSaving ? 'Procesando...' : 'Confirmar Abono'}
          </button>
        </div>

      </div>
    </div>
  );
};