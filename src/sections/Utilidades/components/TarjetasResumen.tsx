// src/sections/Utilidades/components/TarjetasResumen.tsx
import React from 'react';
import { DollarSign, ArrowDownToLine, ArrowUpFromLine, Activity, Wallet, Filter } from 'lucide-react';

interface Props {
  ingresos: number;
  costos: number;
  mermas: number;
  gastosOperativos: number;
  utilidad: number;
  filtrado?: boolean;
}

export const TarjetasResumen: React.FC<Props> = ({ ingresos, costos, mermas, gastosOperativos, utilidad, filtrado }) => {
  return (
    <div className="flex flex-col gap-3 font-sans">
      {filtrado && (
        <div className="flex items-center gap-2 text-[10px] font-black text-[#065F46] uppercase tracking-widest">
          <Filter size={12} strokeWidth={3} />
          Mostrando totales solo de los productos filtrados en la tabla
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white border border-[#065F46] p-3 sm:p-5 flex flex-col sm:flex-row gap-2 sm:gap-4 items-start sm:items-center min-w-0 rounded-none shadow-[2px_2px_0px_0px_rgba(6,95,70,0.1)]">
          <div className="w-12 h-12 bg-[#ECFDF5] border border-[#059669] flex items-center justify-center text-[#059669] rounded-none shrink-0">
            <ArrowUpFromLine size={24} strokeWidth={2} />
          </div>
          <div>
            <p className="text-[10px] font-black text-[#64748B] uppercase tracking-tighter">Ingreso Total Bruto</p>
            <p className="text-lg sm:text-2xl font-bold break-all text-[#1E293B] font-mono">S/ {ingresos.toFixed(2)}</p>
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] p-3 sm:p-5 flex flex-col sm:flex-row gap-2 sm:gap-4 items-start sm:items-center min-w-0 rounded-none">
          <div className="w-12 h-12 bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-500 rounded-none shrink-0">
            <ArrowDownToLine size={24} strokeWidth={2} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest">Inversión (Costo)</p>
            <p className="text-lg sm:text-2xl font-bold break-all text-[#1E293B] font-mono">S/ {costos.toFixed(2)}</p>
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] p-3 sm:p-5 flex flex-col sm:flex-row gap-2 sm:gap-4 items-start sm:items-center min-w-0 rounded-none">
          <div className="w-12 h-12 bg-red-50 border border-red-100 flex items-center justify-center text-red-500 rounded-none shrink-0">
            <Activity size={24} strokeWidth={2} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest">Pérdida Mermas</p>
            <p className="text-lg sm:text-2xl font-bold break-all text-[#1E293B] font-mono">S/ {mermas.toFixed(2)}</p>
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] p-3 sm:p-5 flex flex-col sm:flex-row gap-2 sm:gap-4 items-start sm:items-center min-w-0 rounded-none">
          <div className="w-12 h-12 bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-500 rounded-none shrink-0">
            <Wallet size={24} strokeWidth={2} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest">Gastos Operativos</p>
            <p className="text-lg sm:text-2xl font-bold break-all text-[#1E293B] font-mono">S/ {gastosOperativos.toFixed(2)}</p>
          </div>
        </div>

        <div className="bg-[#065F46] border-2 border-[#065F46] p-3 sm:p-5 flex flex-col sm:flex-row gap-2 sm:gap-4 items-start sm:items-center min-w-0 rounded-none shadow-[4px_4px_0px_0px_rgba(6,95,70,0.2)] text-white col-span-2 lg:col-span-1">
          <div className="w-10 h-10 sm:w-14 sm:h-14 bg-white flex items-center justify-center text-[#065F46] rounded-none shrink-0">
            <DollarSign size={28} strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-[10px] font-black text-[#ECFDF5] uppercase tracking-widest">Utilidad Neta</p>
            <p className="text-xl sm:text-3xl font-black text-white font-mono">S/ {utilidad.toFixed(2)}</p>
          </div>
        </div>
      </div>
    </div>
  );
};