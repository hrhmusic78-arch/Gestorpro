// src/sections/Finanzas/types.ts

export interface CashSession {
  id: string;
  opening_balance: number;
  closing_balance?: number;
  expected_balance?: number;
  status: 'OPEN' | 'CLOSED';
  opened_at: string;
  closed_at?: string;
  justification?: string;
  opening_yape?: number;
  opening_card?: number;
  closing_yape?: number;
  closing_card?: number;
  expected_yape?: number;
  expected_card?: number;
}

export interface CashMovement {
  id: string;
  session_id?: string;
  type: 'INGRESO' | 'EGRESO';
  amount: number;
  description: string;
  created_at: string;
  payment_type: string;
  flujo?: 'INTERNO' | 'EXTERNO'; // <-- NUEVO: Define si entra a la caja del negocio o personal
}

// Métricas detalladas por método de pago (para el panel principal y el cierre de caja)
export interface SuperMetricas {
  fondoInicial: number;
  ingresosExtra: number;        // ingresos manuales en EFECTIVO
  gastos: number;               // egresos pagados en EFECTIVO (salen del cajón)
  ingresosExtraYape: number;    // ingresos manuales por Yape/Plin/Transferencia
  ingresosExtraTarjeta: number; // ingresos manuales por Tarjeta
  gastosYape: number;           // egresos pagados por Yape/Plin/Transferencia
  gastosTarjeta: number;        // egresos pagados con Tarjeta
  ventasEfectivo: number;
  ventasYape: number;
  ventasTarjeta: number;
  cobroDeudasEfectivo: number;
  cobroDeudasYape: number;
  cobroDeudasTarjeta: number;
  efectivoEsperadoCaja: number;
  yapeEsperado: number;         // ventas + cobros + ingresos - egresos, todo por Yape/Transferencia
  tarjetaEsperada: number;      // ventas + cobros + ingresos - egresos, todo con Tarjeta
  totalFacturado: number;
}