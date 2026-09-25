// src/sections/Finanzas/components/ModalCierre.tsx
import React, { useState } from 'react';
import { X, Lock, Calculator, AlertTriangle, Banknote, Smartphone, CreditCard } from 'lucide-react';
import { supabase } from '../../../db/supabase';
import type { CashSession, SuperMetricas } from '../types';
import { useCerrarConEscape } from '../../../utils/useCerrarConEscape';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  sessionActiva: CashSession;
  superMetricas: SuperMetricas;
}

// Un bloque de arqueo reutilizable: muestra lo esperado, pide lo real, y marca el descuadre.
interface BloqueArqueoProps {
  icono: React.ReactNode;
  color: string;
  titulo: string;
  esperado: number;
  valor: string;
  onChange: (val: string) => void;
}
const BloqueArqueo: React.FC<BloqueArqueoProps> = ({ icono, color, titulo, esperado, valor, onChange }) => {
  const numReal = Number(valor) || 0;
  const diferencia = numReal - esperado;
  const hayDescuadre = valor !== '' && diferencia !== 0;

  return (
    <div className="border-2 border-[#E2E8F0] p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2" style={{ color }}>
          {icono} {titulo}
        </span>
        <span className="text-xs font-bold text-[#64748B]">Espera: S/ {esperado.toFixed(2)}</span>
      </div>
      <input
        type="number"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder="¿Cuánto hay realmente?"
        className={`w-full p-3 text-xl font-black text-center outline-none transition-colors border-2 rounded-none ${
          valor === '' ? 'bg-[#F8FAFC] border-[#1E293B] focus:border-[#EF4444]' :
          diferencia === 0 ? 'bg-[#ECFDF5] border-[#10B981] text-[#10B981]' : 'bg-[#FEF2F2] border-[#EF4444] text-[#EF4444]'
        }`}
      />
      {hayDescuadre && (
        <p className="text-[10px] font-black uppercase text-[#D97706] flex items-center gap-1">
          <AlertTriangle size={12} />
          {diferencia > 0 ? `Sobra S/ ${Math.abs(diferencia).toFixed(2)}` : `Falta S/ ${Math.abs(diferencia).toFixed(2)}`}
        </p>
      )}
    </div>
  );
};

export const ModalCierre: React.FC<Props> = ({ isOpen, onClose, onSuccess, sessionActiva, superMetricas }) => {
  useCerrarConEscape(isOpen, onClose); // Escape (o "Atrás" del control de TV) cierra la ventana
  const [montoEfectivo, setMontoEfectivo] = useState('');
  const [montoYape, setMontoYape] = useState('');
  const [montoTarjeta, setMontoTarjeta] = useState('');
  const [justificacion, setJustificacion] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  // Lo que el sistema espera encontrar en cada método, según las ventas/cobros de la sesión.
  const esperadoEfectivo = superMetricas.efectivoEsperadoCaja;
  const esperadoYape = superMetricas.ventasYape + superMetricas.cobroDeudasYape;
  const esperadoTarjeta = superMetricas.ventasTarjeta;

  const diferenciaEfectivo = (Number(montoEfectivo) || 0) - esperadoEfectivo;
  const diferenciaYape = (Number(montoYape) || 0) - esperadoYape;
  const diferenciaTarjeta = (Number(montoTarjeta) || 0) - esperadoTarjeta;

  const hayDescuadre =
    (montoEfectivo !== '' && diferenciaEfectivo !== 0) ||
    (montoYape !== '' && diferenciaYape !== 0) ||
    (montoTarjeta !== '' && diferenciaTarjeta !== 0);

  const faltaCompletar = montoEfectivo === '' || montoYape === '' || montoTarjeta === '';

  const handleCierre = async () => {
    if (faltaCompletar) return;
    if (hayDescuadre && !justificacion) {
      alert('Debes justificar la diferencia de dinero.');
      return;
    }

    setIsSubmitting(true);

    const { error } = await supabase.from('cash_sessions').update({
      closing_balance: Number(montoEfectivo) || 0,
      expected_balance: esperadoEfectivo,
      closing_yape: Number(montoYape) || 0,
      expected_yape: esperadoYape,
      closing_card: Number(montoTarjeta) || 0,
      expected_card: esperadoTarjeta,
      status: 'CLOSED',
      closed_at: new Date().toISOString(),
      justification: justificacion.toUpperCase() || null
    }).eq('id', sessionActiva.id);

    setIsSubmitting(false);

    if (error) {
      alert('Error al cerrar caja: ' + error.message);
    } else {
      const resumen = [
        `Efectivo: ${diferenciaEfectivo === 0 ? 'CUADRADO' : (diferenciaEfectivo > 0 ? `+S/ ${diferenciaEfectivo.toFixed(2)}` : `-S/ ${Math.abs(diferenciaEfectivo).toFixed(2)}`)}`,
        `Yape: ${diferenciaYape === 0 ? 'CUADRADO' : (diferenciaYape > 0 ? `+S/ ${diferenciaYape.toFixed(2)}` : `-S/ ${Math.abs(diferenciaYape).toFixed(2)}`)}`,
        `Tarjeta: ${diferenciaTarjeta === 0 ? 'CUADRADO' : (diferenciaTarjeta > 0 ? `+S/ ${diferenciaTarjeta.toFixed(2)}` : `-S/ ${Math.abs(diferenciaTarjeta).toFixed(2)}`)}`,
      ].join('\n');
      alert(`✅ Caja Cerrada Exitosamente.\n${resumen}`);
      onSuccess();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-[#1E293B]/90 backdrop-blur-md flex items-center justify-center z-[9999] p-2 sm:p-4 font-mono">
      <div className="bg-white border-2 border-[#1E293B] shadow-[8px_8px_0_0_#1E293B] w-full max-w-lg flex flex-col rounded-none animate-fade-in max-h-[calc(var(--alto-pantalla)*0.94)] sm:max-h-[calc(var(--alto-pantalla)*0.9)]">

        <div className="bg-[#EF4444] p-4 border-b-2 border-[#1E293B] flex justify-between items-center text-white shrink-0">
          <h2 className="font-black uppercase tracking-widest flex items-center gap-2 text-sm">
            <Lock size={18} /> Arqueo y Cierre de Caja
          </h2>
          <button onClick={onClose} className="hover:text-[#1E293B] transition-colors cursor-pointer">
            <X size={20} strokeWidth={3} />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4 overflow-y-auto custom-scrollbar">

          <div className="bg-[#F8FAFC] border-2 border-[#E2E8F0] p-3 flex items-center gap-2 text-[#64748B]">
            <Calculator size={16} />
            <span className="text-[10px] font-bold uppercase tracking-widest">
              Cuenta lo que hay físicamente en caja y confirma tu Yape/Tarjeta contra lo que el sistema calculó.
            </span>
          </div>

          <BloqueArqueo
            icono={<Banknote size={14} />} color="#10B981" titulo="Efectivo"
            esperado={esperadoEfectivo} valor={montoEfectivo} onChange={setMontoEfectivo}
          />
          <BloqueArqueo
            icono={<Smartphone size={14} />} color="#3B82F6" titulo="Yape / Transferencias"
            esperado={esperadoYape} valor={montoYape} onChange={setMontoYape}
          />
          <BloqueArqueo
            icono={<CreditCard size={14} />} color="#8B5CF6" titulo="Tarjeta"
            esperado={esperadoTarjeta} valor={montoTarjeta} onChange={setMontoTarjeta}
          />

          {hayDescuadre && (
            <div className="bg-[#FFFBEB] border-2 border-[#F59E0B] p-4 animate-fade-in space-y-2">
              <div className="flex items-center gap-2 text-[#D97706]">
                <AlertTriangle size={16} />
                <span className="text-[10px] font-black uppercase tracking-widest">Hay una diferencia, explica el motivo</span>
              </div>
              <input
                type="text"
                value={justificacion}
                onChange={(e) => setJustificacion(e.target.value)}
                placeholder="Explica el motivo de la diferencia..."
                className="w-full bg-white border border-[#FCD34D] p-2 text-xs font-black uppercase outline-none focus:border-[#F59E0B] rounded-none"
              />
            </div>
          )}

        </div>

        <div className="p-4 bg-[#F8FAFC] border-t-2 border-[#1E293B] shrink-0">
          <button
            onClick={handleCierre}
            disabled={faltaCompletar || isSubmitting}
            className="w-full bg-[#1E293B] text-white p-3 font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2 hover:bg-[#EF4444] transition-colors disabled:opacity-50 border-2 border-[#1E293B] shadow-[4px_4px_0_0_#1E293B] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] cursor-pointer rounded-none"
          >
            {isSubmitting ? 'Cerrando Bóveda...' : <><Lock size={18} /> Finalizar Día y Cerrar</>}
          </button>
        </div>

      </div>
    </div>
  );
};
