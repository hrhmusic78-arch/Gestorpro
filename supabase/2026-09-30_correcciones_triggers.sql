-- =====================================================================
-- 2026-09-30  Corrección de triggers (idempotente: se puede correr N veces)
-- Aplicar en AMBAS bases: GestorPro y GestorPro-primer-usuario.
--
-- 1) fn_reduce_stock_from_sales: ya NO se traga los errores. Antes tenía
--    "EXCEPTION WHEN OTHERS THEN RAISE WARNING", así que si algo fallaba la
--    venta se guardaba pero el stock no bajaba. Ahora el error sube y el
--    INSERT en sale_details (y toda la venta de fn_register_sale) falla.
--    El resto del comportamiento es idéntico (productos CONSUMO se saltan,
--    cantidad 0 se salta, stock puede quedar en 0 o negativo sin error,
--    productos sin lotes solo bajan products.quantity, FIFO por lotes).
--
-- 2) fn_register_fiado_payment_in_cash: el abono mixto ya se partía en
--    efectivo/yape/tarjeta, pero faltaba amount_transfer (Plin/transfer.)
--    y si las columnas por método no sumaban el total, la diferencia no
--    entraba a caja. Ahora:
--      - un cash_movement por cada método con monto > 0
--        (efectivo, yape, tarjeta, transferencia)
--      - si la suma por métodos es menor que amount, el resto se registra
--        con NEW.payment_type
--      - si todo viene en 0 (pagos viejos) se registra amount con
--        NEW.payment_type (igual que antes)
--    La descripción ahora termina en " / Pago #<id>" para poder ubicar
--    los movimientos exactos del pago al anularlo.
--
-- 3) NUEVO trigger tr_fiado_payment_cash_delete (AFTER DELETE en
--    debt_payments): al borrar (anular) un abono, borra sus movimientos
--    INGRESO_FIADO de caja (todos los métodos del abono mixto).
--    => El frontend YA NO debe borrar cash_movements ni restar
--       fiados.paid_amount al anular: update_fiado_status recalcula
--       paid_amount/status solo (SUM de los pagos que quedan).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Descuento de stock por venta (errores visibles)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reduce_stock_from_sales()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_qty_to_deduct NUMERIC;
    v_current_stock NUMERIC;
    v_batch_record record;
    v_deducted NUMERIC;
    v_is_consumo BOOLEAN;
    v_costo_real NUMERIC := 0;
BEGIN
    SELECT (COALESCE(unit, '') = 'CONSUMO' OR COALESCE(control_type, '') = 'CONSUMPTION')
    INTO v_is_consumo
    FROM public.products WHERE id = NEW.product_id;

    IF v_is_consumo = TRUE THEN
        RETURN NEW;
    END IF;

    v_qty_to_deduct := ABS(COALESCE(NEW.quantity, 0));
    IF v_qty_to_deduct = 0 THEN
        RETURN NEW;
    END IF;

    UPDATE public.products
    SET quantity = COALESCE(quantity, 0) - v_qty_to_deduct
    WHERE id = NEW.product_id
    RETURNING COALESCE(quantity, 0) INTO v_current_stock;

    FOR v_batch_record IN
        SELECT id, COALESCE(quantity, 0) AS qty, COALESCE(cost_unit, 0) AS cost
        FROM public.batches
        WHERE product_id = NEW.product_id AND COALESCE(quantity, 0) > 0
        ORDER BY created_at ASC, id ASC
        FOR UPDATE
    LOOP
        IF v_qty_to_deduct <= 0 THEN EXIT; END IF;

        IF v_batch_record.qty >= v_qty_to_deduct THEN
            UPDATE public.batches SET quantity = (v_batch_record.qty - v_qty_to_deduct) WHERE id = v_batch_record.id;
            v_deducted := v_qty_to_deduct;
            v_qty_to_deduct := 0;
        ELSE
            UPDATE public.batches SET quantity = 0 WHERE id = v_batch_record.id;
            v_deducted := v_batch_record.qty;
            v_qty_to_deduct := v_qty_to_deduct - v_batch_record.qty;
        END IF;

        -- Costo exacto del lote (para Utilidades)
        v_costo_real := v_batch_record.cost;

        INSERT INTO public.inventory_movements (
            batch_id, product_id, product_name, change_amount,
            previous_quantity, new_quantity, operation_type, reason, notes, created_at, "user", is_synced
        ) VALUES (
            v_batch_record.id, NEW.product_id, NEW.product_name, -v_deducted,
            (v_current_stock + v_deducted), v_current_stock,
            'VENTA', 'Venta POS', 'Ticket #' || NEW.sale_id::text, NOW(), 'Sistema', 1
        );
    END LOOP;

    IF v_costo_real > 0 THEN
        NEW.cost_at_moment := v_costo_real;
    END IF;

    -- Sin bloque EXCEPTION: cualquier error aborta el INSERT (y la venta).
    RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------
-- 2) Abono de fiado -> caja, un movimiento por método
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_register_fiado_payment_in_cash()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_cliente  TEXT := 'Cliente ID: ' || COALESCE(NEW.customer_id::text, 'General');
    v_tag      TEXT := ' / Pago #' || NEW.id::text;
    v_cash     NUMERIC := COALESCE(NEW.amount_cash, 0);
    v_yape     NUMERIC := COALESCE(NEW.amount_yape, 0);
    v_card     NUMERIC := COALESCE(NEW.amount_card, 0);
    v_transfer NUMERIC := COALESCE(NEW.amount_transfer, 0);
    v_split    NUMERIC;
    v_resto    NUMERIC;
BEGIN
    v_split := GREATEST(v_cash, 0) + GREATEST(v_yape, 0) + GREATEST(v_card, 0) + GREATEST(v_transfer, 0);

    IF v_cash > 0 THEN
        INSERT INTO public.cash_movements (session_id, type, amount, description, payment_type, created_at, is_synced, flujo)
        VALUES (NEW.session_id::text, 'INGRESO', v_cash, 'ABONO FIADO (EFECTIVO) / ' || v_cliente || v_tag, 'efectivo', NEW.created_at, 1, 'INGRESO_FIADO');
    END IF;

    IF v_yape > 0 THEN
        INSERT INTO public.cash_movements (session_id, type, amount, description, payment_type, created_at, is_synced, flujo)
        VALUES (NEW.session_id::text, 'INGRESO', v_yape, 'ABONO FIADO (YAPE) / ' || v_cliente || v_tag, 'yape', NEW.created_at, 1, 'INGRESO_FIADO');
    END IF;

    IF v_card > 0 THEN
        INSERT INTO public.cash_movements (session_id, type, amount, description, payment_type, created_at, is_synced, flujo)
        VALUES (NEW.session_id::text, 'INGRESO', v_card, 'ABONO FIADO (TARJETA) / ' || v_cliente || v_tag, 'tarjeta', NEW.created_at, 1, 'INGRESO_FIADO');
    END IF;

    IF v_transfer > 0 THEN
        INSERT INTO public.cash_movements (session_id, type, amount, description, payment_type, created_at, is_synced, flujo)
        VALUES (NEW.session_id::text, 'INGRESO', v_transfer, 'ABONO FIADO (TRANSFERENCIA) / ' || v_cliente || v_tag, 'transferencia', NEW.created_at, 1, 'INGRESO_FIADO');
    END IF;

    IF v_split = 0 THEN
        -- Pagos sin desglose (versiones viejas): un solo movimiento con su método
        IF COALESCE(NEW.amount, 0) > 0 THEN
            INSERT INTO public.cash_movements (session_id, type, amount, description, payment_type, created_at, is_synced, flujo)
            VALUES (NEW.session_id::text, 'INGRESO', NEW.amount, 'ABONO DE FIADO / ' || v_cliente || v_tag, COALESCE(NEW.payment_type, 'efectivo'), NEW.created_at, 1, 'INGRESO_FIADO');
        END IF;
    ELSE
        -- Desglose incompleto: lo que falta para llegar a amount entra con payment_type
        v_resto := ROUND(COALESCE(NEW.amount, 0) - v_split, 2);
        IF v_resto > 0.009 THEN
            INSERT INTO public.cash_movements (session_id, type, amount, description, payment_type, created_at, is_synced, flujo)
            VALUES (NEW.session_id::text, 'INGRESO', v_resto, 'ABONO DE FIADO / ' || v_cliente || v_tag, COALESCE(NEW.payment_type, 'efectivo'), NEW.created_at, 1, 'INGRESO_FIADO');
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------
-- 3) Anular (borrar) abono -> borra sus movimientos de caja
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_remove_fiado_payment_from_cash()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_cliente TEXT := 'Cliente ID: ' || COALESCE(OLD.customer_id::text, 'General');
    v_borrados INTEGER;
BEGIN
    -- Movimientos etiquetados con el id del pago (creados desde esta versión)
    DELETE FROM public.cash_movements
    WHERE flujo = 'INGRESO_FIADO'
      AND description LIKE '%/ Pago #' || OLD.id::text;
    GET DIAGNOSTICS v_borrados = ROW_COUNT;

    -- Movimientos antiguos sin etiqueta: el trigger de alta siempre usó
    -- created_at = debt_payments.created_at, misma sesión y mismo cliente.
    IF v_borrados = 0 AND OLD.created_at IS NOT NULL THEN
        DELETE FROM public.cash_movements
        WHERE flujo = 'INGRESO_FIADO'
          AND created_at = OLD.created_at
          AND session_id IS NOT DISTINCT FROM OLD.session_id::text
          AND description LIKE 'ABONO%/ ' || v_cliente
          AND description NOT LIKE '%/ Pago #%';
    END IF;

    RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS tr_fiado_payment_cash_delete ON public.debt_payments;
CREATE TRIGGER tr_fiado_payment_cash_delete
    AFTER DELETE ON public.debt_payments
    FOR EACH ROW EXECUTE FUNCTION public.fn_remove_fiado_payment_from_cash();

COMMIT;
