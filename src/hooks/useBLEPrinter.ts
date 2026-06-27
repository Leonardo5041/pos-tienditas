import { useState, useCallback, useEffect } from "react";

const KNOWN_PAIRS = [
  { service: "000018f0-0000-1000-8000-00805f9b34fb", char: "00002af1-0000-1000-8000-00805f9b34fb" },
  { service: "0000ff00-0000-1000-8000-00805f9b34fb", char: "0000ff02-0000-1000-8000-00805f9b34fb" },
  { service: "49535343-fe7d-4ae5-8fa9-9fafd205e455", char: "49535343-8841-43f4-a8d4-ecbe34729bb3" },
  { service: "e7810a71-73ae-499d-8c15-faa9aef0c3f2", char: "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f" },
];

const BT_DEVICE_KEY = "ble_printer_device_id";
const BT_SERVICE_KEY = "ble_printer_service";
const CHUNK = 20;

// Singleton — persists in memory across navigations (until page reload)
// eslint-disable-next-line prefer-const
let _device: BluetoothDevice | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _char: any = null;
let _connected = false;

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
      const svc = await server.getPrimaryService(pair.service);
      const ch = await svc.getCharacteristic(pair.char);
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
  const [isConnected, setIsConnected] = useState(_connected);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const isSupported =
    typeof navigator !== "undefined" && "bluetooth" in navigator;

  function handleDisconnected() {
    _connected = false;
    _char = null;
    setIsConnected(false);
    setTimeout(() => { void autoReconnect(); }, 2000);
  }

  async function autoReconnect() {
    const savedId = localStorage.getItem(BT_DEVICE_KEY);
    if (!savedId) return;

    if (_connected && _char) {
      setIsConnected(true);
      return;
    }

    try {
      if (!("bluetooth" in navigator)) return;
      // getDevices() — no picker, no new permission prompt (Chrome 85+ Android/desktop)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const devices: BluetoothDevice[] = await (navigator as any).bluetooth.getDevices();
      if (!devices?.length) return;

      const saved = devices.find((d) => d.id === savedId);
      if (!saved) return;

      setIsReconnecting(true);
      const server = await saved.gatt!.connect();
      const savedService = localStorage.getItem(BT_SERVICE_KEY) ?? undefined;
      const { char, service } = await findWriteChar(server, savedService);

      localStorage.setItem(BT_SERVICE_KEY, service);
      _device = saved;
      _char = char;
      _connected = true;
      setIsConnected(true);

      saved.addEventListener("gattserverdisconnected", handleDisconnected);
    } catch {
      // getDevices not available or reconnect failed — user connects manually
    } finally {
      setIsReconnecting(false);
    }
  }

  useEffect(() => {
    void autoReconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const savedService = localStorage.getItem(BT_SERVICE_KEY) ?? undefined;
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: KNOWN_PAIRS.map((p) => p.service),
      });
      const server = await device.gatt!.connect();
      const { char, service } = await findWriteChar(server, savedService);

      localStorage.setItem(BT_DEVICE_KEY, device.id);
      localStorage.setItem(BT_SERVICE_KEY, service);

      _device = device;
      _char = char;
      _connected = true;
      setIsConnected(true);

      device.addEventListener("gattserverdisconnected", handleDisconnected);
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      if (!msg.toLowerCase().includes("cancel") && !msg.toLowerCase().includes("user")) {
        setError(msg);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const print = useCallback(async (data: Uint8Array): Promise<void> => {
    setError(null);
    setPrinting(true);
    try {
      let char: BluetoothRemoteGATTCharacteristic;

      if (_connected && _char) {
        char = _char;
      } else if (_device?.gatt?.connected) {
        const savedService = localStorage.getItem(BT_SERVICE_KEY) ?? undefined;
        const result = await findWriteChar(_device.gatt, savedService);
        localStorage.setItem(BT_SERVICE_KEY, result.service);
        _char = result.char;
        _connected = true;
        setIsConnected(true);
        char = result.char;
      } else {
        const savedService = localStorage.getItem(BT_SERVICE_KEY) ?? undefined;
        const device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: KNOWN_PAIRS.map((p) => p.service),
        });
        const server = await device.gatt!.connect();
        const { char: c, service } = await findWriteChar(server, savedService);

        localStorage.setItem(BT_DEVICE_KEY, device.id);
        localStorage.setItem(BT_SERVICE_KEY, service);
        _device = device;
        _char = c;
        _connected = true;
        char = c;
        setIsConnected(true);
        device.addEventListener("gattserverdisconnected", handleDisconnected);
      }

      await writeChunked(char, data);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const forget = useCallback(() => {
    localStorage.removeItem(BT_DEVICE_KEY);
    localStorage.removeItem(BT_SERVICE_KEY);
    try { _device?.gatt?.disconnect(); } catch { /* ignore */ }
    _device = null;
    _char = null;
    _connected = false;
    setIsConnected(false);
  }, []);

  return { print, printing, error, isSupported, isConnected, isReconnecting, connect, forget };
}
