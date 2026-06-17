import { useState, useCallback } from "react";

const KNOWN_PAIRS = [
  { service: "000018f0-0000-1000-8000-00805f9b34fb", char: "00002af1-0000-1000-8000-00805f9b34fb" },
  { service: "0000ff00-0000-1000-8000-00805f9b34fb", char: "0000ff02-0000-1000-8000-00805f9b34fb" },
  { service: "49535343-fe7d-4ae5-8fa9-9fafd205e455", char: "49535343-8841-43f4-a8d4-ecbe34729bb3" },
  { service: "e7810a71-73ae-499d-8c15-faa9aef0c3f2", char: "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f" },
];

const LS_KEY = "ble_printer_service";
const CHUNK = 20;

async function writeChunked(char: BluetoothRemoteGATTCharacteristic, data: Uint8Array) {
  for (let i = 0; i < data.length; i += CHUNK) {
    const chunk = data.slice(i, i + CHUNK);
    try {
      await char.writeValueWithoutResponse(chunk);
    } catch {
      await char.writeValue(chunk);
    }
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function findWriteChar(
  server: BluetoothRemoteGATTServer,
  savedService?: string
): Promise<{ char: BluetoothRemoteGATTCharacteristic; service: string }> {
  const pairs = savedService
    ? [
        ...KNOWN_PAIRS.filter((p) => p.service === savedService),
        ...KNOWN_PAIRS.filter((p) => p.service !== savedService),
      ]
    : KNOWN_PAIRS;

  const tried: string[] = [];
  for (const pair of pairs) {
    try {
      console.log("[BLE] trying service", pair.service);
      const svc = await server.getPrimaryService(pair.service);
      const ch = await svc.getCharacteristic(pair.char);
      console.log("[BLE] found char", pair.char);
      return { char: ch, service: pair.service };
    } catch (e) {
      tried.push(pair.service.slice(4, 8));
      console.warn("[BLE] service failed", pair.service, (e as Error).message);
    }
  }
  throw new Error(`Impresora no reconocida (probados: ${tried.join(", ")}). Abre la consola del navegador para más detalles.`);
}

export function useBLEPrinter() {
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSupported =
    typeof navigator !== "undefined" && "bluetooth" in navigator;

  const print = useCallback(async (data: Uint8Array): Promise<void> => {
    setError(null);
    setPrinting(true);
    try {
      const savedService = localStorage.getItem(LS_KEY) ?? undefined;
      console.log("[BLE] requesting device...");

      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: KNOWN_PAIRS.map((p) => p.service),
      });

      console.log("[BLE] device selected:", device.name);
      const server = await device.gatt!.connect();
      console.log("[BLE] GATT connected");

      const { char, service } = await findWriteChar(server, savedService);
      localStorage.setItem(LS_KEY, service);

      console.log("[BLE] sending", data.length, "bytes in chunks of", CHUNK);
      await writeChunked(char, data);
      console.log("[BLE] done");
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      console.error("[BLE] error:", msg);
      if (msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("user")) {
        return;
      }
      setError(msg);
      throw new Error(msg);
    } finally {
      setPrinting(false);
    }
  }, []);

  return { print, printing, error, isSupported };
}
