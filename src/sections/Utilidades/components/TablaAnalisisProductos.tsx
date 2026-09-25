// src/sections/Utilidades/components/TablaAnalisisProductos.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { Search, Filter, TrendingDown, TrendingUp, RotateCcw, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import type { AnalisisProducto, StatsFiltro } from '../types';
import { ModalDetalleProducto } from './ModalDetalleProducto';
import { clicConTeclado } from '../../../utils/clicConTeclado';

interface Props {
  datos: AnalisisProducto[];
  fechaInicio: string;
  fechaFin: string;
  setFechaInicio: (val: string) => void;
  setFechaFin: (val: string) => void;
  limpiarFechas: () => void;
  onStatsFiltradasChange: (stats: StatsFiltro) => void;
}

export const TablaAnalisisProductos: React.FC<Props> = ({ datos, fechaInicio, fechaFin, setFechaInicio, setFechaFin, limpiarFechas, onStatsFiltradasChange }) => {
  const [busqueda, setBusqueda] = useState('');
  const [filtroCat, setFiltroCat] = useState('TODAS');
  const [filtroEstado, setFiltroEstado] = useState('TODOS');

  const [localInicio, setLocalInicio] = useState(fechaInicio);
  const [localFin, setLocalFin] = useState(fechaFin);

  useEffect(() => {
    setLocalInicio(fechaInicio);
    setLocalFin(fechaFin);
  }, [fechaInicio, fechaFin]);

  const handleBuscarFecha = () => {
    setFechaInicio(localInicio);
    setFechaFin(localFin);
  };

  const [paginaActual, setPaginaActual] = useState(1);
  const [productoSeleccionado, setProductoSeleccionado] = useState<AnalisisProducto | null>(null);
  const categoriasUnicas = Array.from(new Set(datos.map(d => d.categoria))).sort();

  // ⚙️ MOTOR DE BÚSQUEDA OMNIDIRECCIONAL (EVICAMP V3)
  const normalizarTexto = (texto: string) => {
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  };

  const datosFiltrados = useMemo(() => datos.filter(prod => {
    // 1. Construimos un índice global concatenando todos los datos útiles del producto
    const indiceOmni = normalizarTexto(`${prod.nombre || ''} ${prod.categoria || ''} ${prod.estado || ''} ${prod.tipoControl || ''}`);
    const busquedaNormalizada = normalizarTexto(busqueda || '');

    // 2. Fragmentamos la búsqueda
    const terminosBusqueda = busquedaNormalizada.split(/\s+/).filter(Boolean);

    // 3. Verificamos que CADA palabra tipeada exista en el índice global
    const coincideBusqueda = terminosBusqueda.length === 0 || terminosBusqueda.every(termino =>
      indiceOmni.includes(termino)
    );

    const coincideCat = filtroCat === 'TODAS' || prod.categoria === filtroCat;
    const coincideEstado = filtroEstado === 'TODOS' || prod.estado === filtroEstado;

    return coincideBusqueda && coincideCat && coincideEstado;
  }), [datos, busqueda, filtroCat, filtroEstado]);

  const hayFiltrosActivos = busqueda.trim() !== '' || filtroCat !== 'TODAS' || filtroEstado !== 'TODOS';

  // 🟢 TOTALES DEL SUBCONJUNTO VISIBLE: para que las tarjetas de resumen reflejen
  // exactamente lo que la tabla está mostrando cuando hay un filtro de categoría/rotación/búsqueda activo.
  const statsFiltradas = useMemo((): StatsFiltro => ({
    ingresos: datosFiltrados.reduce((acc, p) => acc + p.ingresosTotales, 0),
    costos: datosFiltrados.reduce((acc, p) => acc + p.costoTotalVentas, 0),
    mermas: datosFiltrados.reduce((acc, p) => acc + p.perdidaMerma, 0),
    hayFiltros: hayFiltrosActivos,
  }), [datosFiltrados, hayFiltrosActivos]);

  useEffect(() => {
    onStatsFiltradasChange(statsFiltradas);
  }, [statsFiltradas, onStatsFiltradasChange]);

  useEffect(() => {
    setPaginaActual(1);
  }, [busqueda, filtroCat, filtroEstado]);

  const itemsPorPagina = 10;
  const totalPaginas = Math.ceil(datosFiltrados.length / itemsPorPagina) || 1;
  const startIndex = (paginaActual - 1) * itemsPorPagina;
  const datosPaginados = datosFiltrados.slice(startIndex, startIndex + itemsPorPagina);

  const limpiarFiltrosTabla = () => {
    setBusqueda('');
    setFiltroCat('TODAS');
    setFiltroEstado('TODOS');
    limpiarFechas();
  };

  return (
    <div className="bg-[#FFFFFF] border border-[#1E293B] rounded-none shadow-[4px_4px_0px_0px_rgba(30,41,59,0.05)] flex flex-col font-sans mt-4">

      {/* HEADER Y FILTROS */}
      <div className="p-4 bg-[#FFFFFF] border-b border-[#1E293B] flex flex-wrap gap-4 items-center justify-between shrink-0">
        <h2 className="text-[#1E293B] font-black uppercase tracking-widest flex items-center gap-3 text-sm">
          <Filter size={18} className="text-[#065F46]" strokeWidth={2.5} />
          RENTABILIDAD DETALLADA DE PRODUCTOS
        </h2>

        <div className="flex flex-wrap gap-3 w-full lg:w-auto">
          <div className="flex bg-[#FFFFFF] border border-[#1E293B] rounded-none focus-within:border-[#065F46] flex-1 lg:w-64 transition-all">
            <div className="p-2 flex items-center justify-center text-[#1E293B] bg-[#F8FAFC] border-r border-[#1E293B]">
              <Search size={16} strokeWidth={2}/>
            </div>
            <input
              type="text" placeholder="BUSCAR PRODUCTO..."
              value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              className="w-full text-xs font-bold text-[#1E293B] outline-none p-2 bg-transparent uppercase placeholder:text-[#94A3B8]"
            />
          </div>
          <select
            value={filtroCat} onChange={(e) => setFiltroCat(e.target.value)}
            className="bg-[#FFFFFF] text-xs font-bold text-[#1E293B] outline-none p-2 border border-[#1E293B] rounded-none focus:border-[#065F46] cursor-pointer transition-all uppercase"
          >
            <option value="TODAS">CATEGORÍA: TODAS</option>
            {categoriasUnicas.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          <select
            value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}
            className="bg-[#FFFFFF] text-xs font-bold text-[#1E293B] outline-none p-2 border border-[#1E293B] rounded-none focus:border-[#065F46] cursor-pointer transition-all uppercase"
          >
            <option value="TODOS">ROTACIÓN: TODAS</option>
            <option value="BUENO">VENTA: BUENO</option>
            <option value="REGULAR">VENTA: REGULAR</option>
            <option value="BAJO">VENTA: BAJO</option>
            <option value="SIN VENTAS">SIN VENTAS</option>
          </select>

          <div className="flex items-center gap-2 bg-[#FFFFFF] border border-[#1E293B] p-1.5 rounded-none">
            <div className="flex flex-col px-1.5">
              <label className="text-[8px] font-bold text-[#64748B] uppercase tracking-wider">Desde</label>
              <div className="flex items-center gap-1.5">
                <CalendarDays size={12} className="text-[#1E293B]" />
                <input type="date" value={localInicio} onChange={(e) => setLocalInicio(e.target.value)} className="text-[11px] font-bold text-[#1E293B] outline-none bg-transparent cursor-pointer font-mono" />
              </div>
            </div>
            <div className="w-[1px] h-7 bg-[#E2E8F0]"></div>
            <div className="flex flex-col px-1.5">
              <label className="text-[8px] font-bold text-[#64748B] uppercase tracking-wider">Hasta</label>
              <div className="flex items-center gap-1.5">
                <CalendarDays size={12} className="text-[#1E293B]" />
                <input type="date" value={localFin} onChange={(e) => setLocalFin(e.target.value)} className="text-[11px] font-bold text-[#1E293B] outline-none bg-transparent cursor-pointer font-mono" />
              </div>
            </div>
            <button onClick={handleBuscarFecha} className="bg-[#1E293B] hover:bg-[#065F46] text-[#FFFFFF] p-1.5 rounded-none transition-colors cursor-pointer flex items-center justify-center border border-[#1E293B] hover:border-[#065F46]" title="Buscar por Fecha">
              <Search size={14} strokeWidth={2} />
            </button>
          </div>

          <button
            onClick={limpiarFiltrosTabla}
            className="bg-[#1E293B] hover:bg-[#065F46] text-[#FFFFFF] px-3 py-2 rounded-none transition-colors cursor-pointer border border-[#1E293B] hover:border-[#065F46] flex items-center justify-center"
            title="Limpiar Todos los Filtros"
          >
            <RotateCcw size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* CONTROLES PAGINACIÓN SUPERIOR */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2 bg-[#F8FAFC] border-b border-[#E2E8F0] gap-4">
        <span className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">
          MOSTRANDO {datosFiltrados.length === 0 ? 0 : startIndex + 1} A {Math.min(startIndex + itemsPorPagina, datosFiltrados.length)} DE {datosFiltrados.length} REGISTROS
        </span>
        <div className="flex items-center gap-2">
          <button onClick={() => setPaginaActual(p => Math.max(1, p - 1))} disabled={paginaActual === 1} className="px-3 py-1.5 border border-[#1E293B] rounded-none text-[10px] font-bold text-[#1E293B] bg-white hover:bg-[#065F46] hover:text-white hover:border-[#065F46] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 transition-all uppercase">
            <ChevronLeft size={14} strokeWidth={2}/> ANT
          </button>
          <span className="px-3 py-1.5 text-[10px] font-black text-[#FFFFFF] bg-[#1E293B] rounded-none uppercase tracking-widest">
            {paginaActual} / {totalPaginas}
          </span>
          <button onClick={() => setPaginaActual(p => Math.min(totalPaginas, p + 1))} disabled={paginaActual === totalPaginas} className="px-3 py-1.5 border border-[#1E293B] rounded-none text-[10px] font-bold text-[#1E293B] bg-white hover:bg-[#065F46] hover:text-white hover:border-[#065F46] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 transition-all uppercase">
            SIG <ChevronRight size={14} strokeWidth={2}/>
          </button>
        </div>
      </div>

      {/* TABLA PRINCIPAL - DISEÑO TÉCNICO ESMERALDA LIGERO */}
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1000px]">
          <thead className="bg-[#1E293B] text-[#FFFFFF] sticky top-0 z-10">
            <tr>
              <th className="p-3 text-[10px] font-black tracking-widest uppercase border-b-2 border-[#065F46]">Producto / Ref</th>
              <th className="p-3 text-[10px] font-black tracking-widest uppercase text-center border-b-2 border-[#065F46]">Stock Actual</th>
              <th className="p-3 text-[10px] font-black tracking-widest uppercase text-center border-b-2 border-[#065F46]">U. Vendidas</th>
              <th className="p-3 text-[10px] font-black tracking-widest uppercase text-right border-b-2 border-[#065F46]">Ingreso Cobrado</th>
              <th className="p-3 text-[10px] font-black tracking-widest uppercase text-right border-b-2 border-[#065F46]">Costo Ventas</th>
              <th className="p-3 text-[10px] font-black tracking-widest uppercase text-right border-b-2 border-[#065F46]">Mermas</th>
              <th className="p-3 text-[10px] font-black tracking-widest uppercase text-right bg-[#065F46] text-[#FFFFFF] border-b-2 border-[#047857]">Utilidad Neta</th>
              <th className="p-3 text-[10px] font-black tracking-widest uppercase text-center border-b-2 border-[#065F46] w-24">Margen</th>
            </tr>
          </thead>
          <tbody className="bg-[#FFFFFF]">
            {datosPaginados.length === 0 ? (
              <tr><td colSpan={8} className="p-4 sm:p-6 lg:p-8 short:py-4 text-center text-[#64748B] font-bold text-xs uppercase border-b border-[#E2E8F0]">NO SE ENCONTRARON REGISTROS.</td></tr>
            ) : (
              datosPaginados.map((prod) => (
                <tr
                  key={prod.id}
                  {...clicConTeclado(() => setProductoSeleccionado(prod))}
                  className="border-b border-[#E2E8F0] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                  title="Ver ventas de este producto"
                >
                  <td className="p-3">
                    <p className="text-xs font-black text-[#1E293B] uppercase mb-1">{prod.nombre}</p>
                    <div className="flex gap-2">
                      <span className="text-[9px] font-bold text-[#64748B] border border-[#CBD5E1] bg-[#F1F5F9] px-2 py-0.5 rounded-none uppercase tracking-widest">{prod.categoria}</span>

                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-none uppercase tracking-widest border ${
                        prod.estado === 'BUENO' ? 'border-[#065F46] text-[#065F46] bg-[#ECFDF5]' :
                        prod.estado === 'REGULAR' ? 'border-[#1E293B] text-[#1E293B]' :
                        prod.estado === 'BAJO' ? 'border-[#94A3B8] text-[#94A3B8]' :
                        'border-[#CBD5E1] text-[#64748B] bg-[#F1F5F9]'
                      }`}>
                        {prod.estado}
                      </span>
                    </div>
                  </td>

                  <td className="p-3 text-center">
                    {prod.tipoControl === 'CONSUMO' ? (
                      <span className="text-[9px] font-black px-2 py-1 rounded-none border border-[#1E293B] text-[#1E293B] uppercase tracking-widest">
                        INTERNO
                      </span>
                    ) : (
                      <span className={`text-[9px] font-black px-2 py-1 rounded-none border uppercase tracking-widest ${
                        (prod.stockActual || 0) <= 5 ? 'border-[#EF4444] text-[#FFFFFF] bg-[#EF4444]' :
                        (prod.stockActual || 0) <= 15 ? 'border-[#F59E0B] text-[#FFFFFF] bg-[#F59E0B]' :
                        'border-[#E2E8F0] text-[#1E293B] bg-[#F8FAFC]'
                      }`}>
                        {(prod.stockActual || 0) <= 5 ? `CRÍTICO (${Number(prod.stockActual).toFixed(2)})` :
                         (prod.stockActual || 0) <= 15 ? `BAJO (${Number(prod.stockActual).toFixed(2)})` :
                         `OK (${Number(prod.stockActual).toFixed(2)})`}
                      </span>
                    )}
                  </td>

                  <td className="p-3 text-center text-sm font-black text-[#1E293B] font-mono">
                    {Number(prod.unidadesVendidas).toFixed(2)} <span className="text-[9px] font-bold text-[#64748B]">{prod.unidadMedida}</span>
                  </td>
                  <td className="p-3 text-right text-xs font-bold text-[#64748B] font-mono">S/ {prod.ingresosTotales.toFixed(2)}</td>
                  <td className="p-3 text-right text-xs font-bold text-[#64748B] font-mono">S/ {prod.costoTotalVentas.toFixed(2)}</td>
                  <td className="p-3 text-right text-xs font-bold text-[#EF4444] font-mono">
                    {prod.perdidaMerma > 0 ? `- S/ ${prod.perdidaMerma.toFixed(2)}` : 'S/ 0.00'}
                  </td>
                  <td className="p-3 text-right text-sm font-black border-x border-[#065F46]/20 bg-[#ECFDF5]">
                    <span className={`font-mono ${prod.utilidadReal >= 0 ? 'text-[#065F46]' : 'text-[#EF4444]'}`}>
                      S/ {prod.utilidadReal.toFixed(2)}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <span className={`flex items-center justify-center gap-1 text-[9px] font-black px-1.5 py-1 rounded-none border tracking-widest ${
                      prod.margen >= 30 ? 'border-[#065F46] text-[#065F46] bg-[#ECFDF5]' :
                      prod.margen > 0 ? 'border-[#1E293B] text-[#1E293B]' :
                      'border-[#EF4444] text-[#EF4444] bg-[#FEF2F2]'
                    }`}>
                      {prod.margen >= 0 ? <TrendingUp size={12} strokeWidth={3}/> : <TrendingDown size={12} strokeWidth={3}/>}
                      {prod.margen.toFixed(0)}%
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {productoSeleccionado && (
        <ModalDetalleProducto
          producto={productoSeleccionado}
          onClose={() => setProductoSeleccionado(null)}
        />
      )}
    </div>
  );
};