import { useState, useCallback, useRef } from 'react'

const SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb'
const CHAR_UUID    = '00002af1-0000-1000-8000-00805f9b34fb'

export function useBluetoothPrinter() {
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const charRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null)

  const isSupported = 'bluetooth' in navigator

  const connect = useCallback(async () => {
    setError(null)
    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SERVICE_UUID],
      })
      const server  = await device.gatt.connect()
      const service = await server.getPrimaryService(SERVICE_UUID)
      const char    = await service.getCharacteristic(CHAR_UUID)
      charRef.current = char
      setIsConnected(true)
    } catch (err: any) {
      setError(err.message ?? 'No se pudo conectar')
      setIsConnected(false)
    }
  }, [])

  const print = useCallback(async (lines: string[]) => {
    if (!charRef.current) {
      setError('No hay impresora conectada')
      return
    }
    try {
      const encoder  = new TextEncoder()
      const ESC_INIT = new Uint8Array([0x1b, 0x40])
      const CUT      = new Uint8Array([0x1d, 0x56, 0x00])

      const text      = lines.join('\n') + '\n\n\n'
      const textBytes = encoder.encode(text)
      const allBytes  = new Uint8Array([...ESC_INIT, ...textBytes, ...CUT])

      const CHUNK = 20
      for (let i = 0; i < allBytes.length; i += CHUNK) {
        await charRef.current.writeValue(allBytes.slice(i, i + CHUNK))
        await new Promise(r => setTimeout(r, 30))
      }
    } catch (err: any) {
      setError(err.message ?? 'Error al imprimir')
    }
  }, [])

  return { isSupported, isConnected, error, connect, print }
}
