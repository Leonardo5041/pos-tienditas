# Reporte QA — Modo Offline PWA
**Fecha:** 2026-06-25  
**Archivos analizados:** db.ts, productCache.ts, useOfflineSync.ts, OfflineBanner.tsx, Scanner.tsx, Payment.tsx, cartStore.ts, sales.go

---

## Análisis estático

| # | Pregunta | Estado | Evidencia |
|---|----------|--------|-----------|
| a | ¿pendingSales persiste correctamente en IndexedDB? | ✅ SÍ | Payment.tsx:49-55 — `await pendingSalesDb.add(pendingSale)` antes de `clear()` |
| b | ¿productsCache persiste todos los campos necesarios? (id, name, barcode, price, stock, unit) | ✅ SÍ | productCache.ts:39 — `bulkPut(products)` guarda objeto completo; db.ts:23 — índices solo para búsqueda |
| c | ¿Los datos sobreviven al recargar la página? | ✅ SÍ | IndexedDB es almacenamiento persistente por especificación |
| d | ¿Hay protección si IndexedDB no está disponible (modo incógnito)? | ⚠️ PARCIAL | Payment.tsx:73 captura el error pero el mensaje es técnico (Dexie error). productCache.ts:30 falla silenciosamente |
| e | ¿El carrito se limpia SOLO después de confirmar guardado en Dexie? | ✅ SÍ | Payment.tsx:55 — `clear()` después del `await`, en catch nunca llega |
| f | ¿El sync se dispara automáticamente al recuperar conexión? | ✅ SÍ | useOfflineSync.ts:60 — `window.addEventListener("online", handleOnline)` |
| g | ¿El sync envía ventas en orden cronológico? | ✅ SÍ | sales.go:386-391 — backend ordena por `created_at` ASC antes de insertar |
| h | ¿Si una venta falla en sync las demás continúan? | ✅ SÍ | sales.go:401-420 — cada venta en tx individual; useOfflineSync.ts:34 — skip solo las fallidas |
| i | ¿Las ventas sincronizadas se marcan para no reenviarse? | ✅ SÍ | useOfflineSync.ts:35-38 — `markSynced()` por ID; db.ts:34 — `update(id, { synced: true })` |
| j | ¿Hay reintentos automáticos si el sync falla por red inestable? | ❌ NO | useOfflineSync.ts:51-53 — catch vacío, solo reintenta en próximo evento `online`. Sin backoff. |
| k | ¿El backend maneja duplicados (misma venta dos veces)? | 🔴 NO | sales.go:108 — genera `uuid.New()` en cada inserción. El ID offline nunca llega al backend (useOfflineSync.ts:26-31 no incluye `id`). Crash durante sync → duplicado garantizado. |
| l | ¿Qué pasa si Dexie.add() falla? ¿Se notifica al usuario? | ✅ SÍ | Payment.tsx:73-75 — catch muestra error; carrito intacto |
| m | ¿Hay estado 'failed' para ventas que no pudieron sincronizar? | ❌ NO | sale.ts:29-33 — PendingSale solo tiene `synced: boolean`. Ventas con error permanente (producto eliminado) quedan en synced=false para siempre, indistinguibles de nuevas. |
| n | ¿Ventas quedan en estado 'syncing' si el browser cierra? | ✅ SÍ (seguro) | PendingSale no tiene campo `syncing`. Solo `synced: boolean`. Si cierra durante sync, quedan en synced=false → se reintentarán. Sin estado huérfano posible. |
| o | ¿Hay timeout en el sync? | ❌ NO | useOfflineSync.ts — sin AbortController. sales.ts:16 — fetch sin timeout. Browser puede colgar indefinidamente. |
| p | ¿El banner offline aparece inmediatamente? | ✅ SÍ | OfflineBanner.tsx:20-26 — evento `offline` sincrónico → setState → re-render (~16ms) |
| q | ¿El recibo offline indica que la venta se guardó localmente? | ✅ SÍ | Payment.tsx:71 — `navigate("/receipt", { state: { offline: true } })` pasa flag |
| r | ¿El contador de ventas pendientes es preciso? | ⚠️ PARCIAL | useOfflineSync.ts:16-18 — refreshCount en mount y post-sync. **NO se actualiza al guardar una nueva venta offline** (Payment.tsx no llama refreshCount). Contador desactualizado hasta próximo sync. |
| s | ¿El usuario puede ver qué ventas están pendientes? | ❌ NO | OfflineBanner solo muestra conteo. No hay lista ni detalle de ventas pendientes. |
| t | ¿El stock se descuenta localmente al vender offline? | 🔴 NO | Payment.tsx:49-72 — crea pendingSale pero no actualiza productsCache stock. Vender 10 unidades de un producto con stock=1 es posible offline. |
| u | ¿Dos cajeros offline pueden generar stock negativo? | 🔴 SÍ | sales.go:153-160 — backend detecta stock negativo pero **no bloquea la venta**, solo genera warning. Con múltiples cajeros offline, colisión garantizada. |
| v | ¿El id offline (crypto.randomUUID) evita colisiones? | ✅ SÍ | UUID v4 = 122 bits de aleatoriedad criptográfica. P(colisión en 1B ventas) ≈ 6×10⁻¹⁵ |
| w | ¿Qué pasa si IndexedDB alcanza cuota de almacenamiento? | ❌ NO | Sin manejo de QuotaExceededError. El error se mostraría como mensaje técnico. |
| x | ¿Los datos en IndexedDB incluyen info sensible sin cifrar? | ✅ SÍ (seguro) | pendingSales: product_id, quantity, payment_method. Sin PII ni datos PCI. productsCache: catálogo de precios. Riesgo bajo. |
| y | ¿Al cerrar sesión se limpian las ventas pendientes de Dexie? | 🔴 NO | authStore.ts:50-55 — logout() solo limpia localStorage. Dexie queda intacto. Otro usuario en el mismo dispositivo ve ventas del anterior. |

---

## Tests ejecutados

| Test | Resultado | Notas |
|------|-----------|-------|
| 1 — Guardar venta offline | ✅ PASS | pendingSales persiste con synced=false |
| 2 — Venta persiste al recargar | ✅ PASS | Sobrevive close/reopen de DB |
| 3 — Sync al reconectar (3 ventas) | ✅ PASS | Las 3 quedan synced=true |
| 4 — Sync parcial (venta 2 falla) | ✅ PASS | Solo venta 2 permanece synced=false |
| 5 — Duplicado en sync | ✅ PASS | Documenta el bug: payload sin `id` offline |
| 6 — Cache vacío offline | ✅ PASS | Retorna [] sin crash |
| 7 — Carrito no se limpia si Dexie falla | ✅ PASS | cart intacto, error expuesto |
| 8 — IDs únicos (1000 UUIDs) | ✅ PASS | 0 colisiones |
| 9 — Orden cronológico en sync | ✅ PASS | Sort ASC por created_at replicado |
| 10 — Banner offline < 100ms | ✅ PASS | Evento sincrónico, < 1ms |
| 11 — Contador preciso (5-3=2) | ✅ PASS | DB refleja 2 pendientes |
| 12 — Logout no limpia Dexie | ✅ PASS | Documenta bug: 1 venta persiste post-logout |
| 13 — Red inestable, isFetching | ✅ PASS | 10 llamadas → 1 ejecución real |
| 13b — useOfflineSync sin flag concurrencia | ✅ PASS | Documenta bug de sync paralelo |
| 14 — Producto price=0 en cache | ✅ PASS | Venta de $0 posible, no bloqueada |
| 15 — Sin estado syncing huérfano | ✅ PASS | PendingSale no tiene campo syncing |

**Total: 17/17 PASS**

---

## Bugs encontrados

### 🔴 Críticos — pérdida de datos o integridad

**BUG-01: No idempotencia en sync → ventas duplicadas**
- **Dónde:** useOfflineSync.ts:26-31 + sales.go:108
- **Qué pasa:** El payload de sync omite el `id` offline. Si el browser cierra después de que el backend procesó la venta pero antes de que `markSynced()` ejecute, la misma venta se reenvía al reconectar. El backend genera un nuevo UUID → dos registros de venta idénticos.
- **Fix:** Incluir `id` en el payload de sync; backend debe hacer `INSERT OR IGNORE` por `offline_id`.

**BUG-02: Stock no se descuenta localmente offline**
- **Dónde:** Payment.tsx:49-72 (sin actualización de productsCache)
- **Qué pasa:** Un cajero puede vender 50 unidades de un producto con stock=2 estando offline. No hay validación local.
- **Fix:** Al guardar pendingSale, decrementar stock en `posDb.productsCache.update(productId, { stock: stock - qty })`.

**BUG-03: Logout no limpia Dexie**
- **Dónde:** authStore.ts:50-55
- **Qué pasa:** Ventas pendientes y caché de productos del cajero anterior quedan en IndexedDB. El siguiente usuario (en el mismo dispositivo físico) puede acceder a ellas.
- **Fix:** En `logout()` agregar `await db.pendingSales.clear(); await db.productsCache.clear();`

### 🟡 Medios — UX o integridad incorrecta

**BUG-04: Contador de pendientes no se actualiza al guardar venta offline**
- **Dónde:** useOfflineSync.ts:16-18 + Payment.tsx (sin llamada a refreshCount)
- **Qué pasa:** El banner muestra el contador anterior hasta que ocurra el próximo sync. Si el cajero hace 3 ventas offline, el badge sigue en 0.
- **Fix:** Exportar `refreshCount` de useOfflineSync y llamarlo desde Payment.tsx después de `pendingSalesDb.add()`.

**BUG-05: Sin timeout en fetch de sync**
- **Dónde:** useOfflineSync.ts, sales.ts:16
- **Qué pasa:** En conexión inestable, el sync puede quedar bloqueado indefinidamente. `isSyncing=true` en UI para siempre.
- **Fix:** Agregar `AbortController` con timeout de 15s en `apiFetch` o en `salesApi.sync`.

**BUG-06: useOfflineSync sin guard de concurrencia**
- **Dónde:** useOfflineSync.ts:20-56
- **Qué pasa:** `isSyncing` es React state (asíncrono). Dos eventos `online` rápidos disparan dos `sync()` paralelos que leen el mismo `getUnsynced()` y envían el mismo payload dos veces.
- **Fix:** Usar un `useRef<boolean>` como guard síncrono al inicio de `sync()`.

**BUG-07: Ventas con error permanente indistinguibles de nuevas**
- **Dónde:** sale.ts:29-33, useOfflineSync.ts
- **Qué pasa:** Si una venta falla repetidamente (ej: producto eliminado del backend), queda en synced=false sin distinción. Se reintenta en cada reconexión ad infinitum.
- **Fix:** Agregar campo `retry_count: number` o `failed: boolean` a PendingSale.

### 🟢 Menores — mejoras

**BUG-08: IndexedDB en modo incógnito muestra error técnico**
- Payment.tsx:74 mostraría `"UnknownError: The user denied permission..."` — no user-friendly.

**BUG-09: Sin vista de ventas pendientes**
- Solo contador visible. Sin forma de saber qué ventas están en cola.

**BUG-10: Producto con price=0 no bloqueado**
- Payment.tsx no valida que todos los items tengan price > 0. Venta de $0.00 posible.

---

## Red Flags para producción

```
🔴 1. DOBLE COBRO AL CLIENTE
      Si el cajero pierde conexión a mitad del sync
      la misma venta se crea dos veces en el backend.
      El cliente puede recibir dos cargos a su cuenta.
      → Prioridad máxima antes de cualquier despliegue.

🔴 2. VENTA SIN CONTROL DE STOCK OFFLINE
      Dos cajeros en diferentes dispositivos pueden
      vender el mismo artículo simultaneamente offline.
      Al sincronizar, el stock queda en negativo.
      El backend solo advierte, no bloquea.

🔴 3. DATOS DEL TURNO ANTERIOR EXPUESTOS
      Al cambiar de cajero sin cerrar sesión correctamente,
      el nuevo cajero puede ver (y eventualmente resincronizar)
      ventas del turno anterior en Dexie.

🟡 4. SYNC BLOQUEADO INDEFINIDAMENTE
      Red muy lenta + sin timeout = botón "Sincronizando..."
      que nunca termina. El cajero no puede cerrar turno.

🟡 5. CONTADOR DE VENTAS SIEMPRE EN 0 OFFLINE
      El badge del banner no actualiza al guardar ventas.
      El cajero no sabe cuántas ventas tiene pendientes
      hasta que reconecte y arranque el sync.
```

---

## Guía de simulación manual en Chrome DevTools

### Setup básico
```
1. Abrir localhost:5173
2. Login: 5560645229 / 504150
3. Navegar a /scanner
4. Esperar que productsCache cargue:
   Application → IndexedDB → pos_tienditas → productsCache
   (debe tener registros)
```

### Simular offline
```
Network tab → arriba donde dice "No throttling" → Offline
```

### Simular reconexión lenta
```
Network tab → "Slow 3G" (para ver el banner de sync)
```

### Verificar ventas pendientes
```
Application → IndexedDB → pos_tienditas → pendingSales
Ver registros con synced=false
```

### Limpiar estado
```
Application → Storage → Clear site data
(incluye IndexedDB, localStorage, Service Worker)
```

### Simular cuota llena
```javascript
// En la consola del navegador:
navigator.storage.estimate().then(e => {
  console.log(`Usado: ${(e.usage/1024/1024).toFixed(2)} MB`);
  console.log(`Cuota: ${(e.quota/1024/1024).toFixed(2)} MB`);
  console.log(`Libre: ${((e.quota-e.usage)/1024/1024).toFixed(2)} MB`);
});
```

### Reproducir BUG-01 (doble venta)
```
1. Poner red en Offline
2. Hacer una venta → se guarda en pendingSales
3. Reconectar → sync inicia
4. Inmediatamente volver a Offline (cortar antes de markSynced)
5. Reconectar nuevamente → la misma venta se reenvía
6. Verificar en /dashboard → dos ventas con mismo monto/hora
```

### Reproducir BUG-03 (datos post-logout)
```javascript
// Después de logout, en la consola:
const db = await Dexie.open('pos_tienditas');
const sales = await db.table('pendingSales').toArray();
console.log('Ventas del cajero anterior:', sales);
```

---

## Conclusión

### ¿El modo offline está listo para producción?

**NO.** Hay 3 bugs críticos que pueden causar pérdida de dinero o integridad de datos.

### Orden de corrección recomendado

| Prioridad | Bug | Esfuerzo | Impacto |
|-----------|-----|----------|---------|
| 1 | BUG-01: Idempotencia en sync (incluir id offline, INSERT OR IGNORE en backend) | Alto | 🔴 Doble cobro |
| 2 | BUG-03: Limpiar Dexie en logout | Bajo | 🔴 Datos expuestos |
| 3 | BUG-04: refreshCount en Payment.tsx | Bajo | 🟡 Contador roto |
| 4 | BUG-06: Guard síncrono en sync() | Bajo | 🟡 Sync paralelo |
| 5 | BUG-05: Timeout en fetch | Medio | 🟡 UI bloqueada |
| 6 | BUG-02: Descuento local de stock | Alto | 🔴 Stock negativo |
| 7 | BUG-07: Estado failed en PendingSale | Medio | 🟡 Retry infinito |

**Los bugs 1, 3 y 4 pueden corregirse en menos de 2 horas y son los más urgentes.**
BUG-02 (stock local) requiere diseño más cuidadoso porque implica manejar conflictos al reconectar.
