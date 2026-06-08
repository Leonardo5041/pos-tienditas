import { useState, useRef, useEffect, useCallback } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

export type DetectorLevel = "native" | "zxing";

const ZXING_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE,
];

const NATIVE_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "itf",
  "qr_code",
];

const FRAME_INTERVAL = 1000 / 15; // 15fps

export type ScannerDebug = {
  engine: string;
  attempts: number;
  resolution: string;
  lastError: string;
};

type NativeBarcode = { rawValue: string };
type NativeDetector = { detect: (source: CanvasImageSource) => Promise<NativeBarcode[]> };
type NativeDetectorCtor = new (opts: { formats: string[] }) => NativeDetector;

function playBeep() {
  try { navigator.vibrate?.(80); } catch { /* no-op */ }
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 1800;
    osc.type = "square";
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => ctx.close();
  } catch { /* AudioContext no disponible */ }
}

function normalizeBarcode(code: string): string {
  const digits = code.replace(/\D/g, "");
  return digits.length === 12 ? "0" + digits : code;
}

async function openStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });
}

async function applyFocusConstraints(track: MediaStreamTrack): Promise<void> {
  try {
    await track.applyConstraints({
      advanced: [{
        focusMode: "continuous",
        // @ts-ignore — whiteBalanceMode/exposureMode no tipados en TS estándar
        whiteBalanceMode: "continuous",
        exposureMode: "continuous",
      } as MediaTrackConstraintSet],
    });
  } catch {
    // dispositivo no soporta estos constraints
  }
}


function waitForVideo(video: HTMLVideoElement): Promise<void> {
  return new Promise<void>((resolve) => {
    video.addEventListener("loadeddata", () => resolve(), { once: true });
    setTimeout(resolve, 2000);
  });
}

export function useScanner(onDetected: (barcode: string) => void) {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [torchActive, setTorchActive] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [lastDetected, setLastDetected] = useState<string | null>(null);
  const [detectorLevel, setDetectorLevel] = useState<DetectorLevel>("zxing");
  const [debug, setDebug] = useState<ScannerDebug>({
    engine: "—",
    attempts: 0,
    resolution: "—",
    lastError: "",
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const torchActiveRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const stopFlagRef = useRef(false);
  const zxingReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const onDetectedRef = useRef(onDetected);
  const attemptsRef = useRef(0);
  const cooldownRef = useRef(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  });

  const triggerCooldown = useCallback((code: string) => {
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    cooldownRef.current = true;
    setCooldown(true);
    setLastDetected(code);
    cooldownTimerRef.current = setTimeout(() => {
      cooldownRef.current = false;
      setCooldown(false);
      setLastDetected(null);
    }, 1500);
  }, []);

  const stopScan = useCallback(() => {
    stopFlagRef.current = true;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    // Apagar torch antes de cerrar el stream
    if (trackRef.current && torchActiveRef.current) {
      try {
        trackRef.current.applyConstraints({
          advanced: [{ torch: false } as MediaTrackConstraintSet],
        });
      } catch { /* silent */ }
    }
    trackRef.current = null;
    torchActiveRef.current = false;
    setTorchActive(false);
    setTorchSupported(false);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
    cooldownRef.current = false;
    setCooldown(false);
    setLastDetected(null);
    setIsScanning(false);
  }, []);

  const startScan = useCallback(async () => {
    setError(null);
    stopFlagRef.current = false;
    attemptsRef.current = 0;
    setDebug({ engine: "—", attempts: 0, resolution: "—", lastError: "" });

    const video = videoRef.current;
    if (!video) {
      setError("No se pudo iniciar el video");
      return;
    }

    // Abrir stream — único punto de apertura para ambos detectores
    let stream: MediaStream;
    try {
      stream = await openStream();
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setError("Permiso de cámara denegado. Actívalo en los ajustes del navegador.");
      } else if (name === "NotFoundError") {
        setError("No se encontró ninguna cámara en este dispositivo.");
      } else {
        setError("No se pudo abrir la cámara: " + (e instanceof Error ? e.message : String(e)));
      }
      return;
    }

    streamRef.current = stream;
    video.srcObject = stream;
    await video.play();

    const track = stream.getVideoTracks()[0] ?? null;
    trackRef.current = track;

    // Aplicar focus/wb/exposure — puede hacerse antes del primer frame
    if (track) await applyFocusConstraints(track);

    await waitForVideo(video);

    // Asumir torch disponible — se confirma o descarta al primer toggle
    if (track) setTorchSupported(true);

    const NativeCtor = (
      window as unknown as { BarcodeDetector?: NativeDetectorCtor }
    ).BarcodeDetector;

    if (NativeCtor) {
      // ── Nivel 1: BarcodeDetector nativo ──
      setDetectorLevel("native");
      console.log("Detector: native (BarcodeDetector API)");
      const detector = new NativeCtor({ formats: NATIVE_FORMATS });
      setIsScanning(true);

      let lastFrameTime = 0;
      const tick = async (timestamp: number) => {
        if (stopFlagRef.current) return;
        if (timestamp - lastFrameTime < FRAME_INTERVAL) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        lastFrameTime = timestamp;
        if (cooldownRef.current) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        attemptsRef.current += 1;
        try {
          const codes = await detector.detect(video);
          if (codes.length > 0 && codes[0].rawValue) {
            const normalized = normalizeBarcode(codes[0].rawValue);
            playBeep();
            onDetectedRef.current(normalized);
            triggerCooldown(normalized);
          }
        } catch (e) {
          if (attemptsRef.current % 10 === 0) {
            setDebug((d) => ({
              ...d,
              lastError: e instanceof Error ? e.name : "detect-error",
            }));
          }
        }
        if (attemptsRef.current % 5 === 0) {
          setDebug({
            engine: "native",
            attempts: attemptsRef.current,
            resolution: video.videoWidth ? `${video.videoWidth}×${video.videoHeight}` : "—",
            lastError: "",
          });
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    // ── Nivel 2: ZXing con canvas + scan region ──
    setDetectorLevel("zxing");
    console.log("Detector: zxing");
    if (!zxingReaderRef.current) {
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, ZXING_FORMATS);
      hints.set(DecodeHintType.TRY_HARDER, true);
      zxingReaderRef.current = new BrowserMultiFormatReader(hints);
    }
    const zxingReader = zxingReaderRef.current;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      setError("No se pudo inicializar el canvas.");
      return;
    }

    setIsScanning(true);
    let lastFrameTime = 0;
    const tick = (timestamp: number) => {
      if (stopFlagRef.current) return;
      if (timestamp - lastFrameTime < FRAME_INTERVAL) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      lastFrameTime = timestamp;
      if (cooldownRef.current) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      if (video.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w === 0 || h === 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Zona central 80%×50% — reduce trabajo del decoder ~60%
      const sx = Math.floor(w * 0.1);
      const sy = Math.floor(h * 0.25);
      const sw = Math.floor(w * 0.8);
      const sh = Math.floor(h * 0.5);
      canvas.width = sw;
      canvas.height = sh;
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

      attemptsRef.current += 1;
      try {
        const result = zxingReader.decodeFromCanvas(canvas);
        if (result?.getText()) {
          const normalized = normalizeBarcode(result.getText());
          playBeep();
          onDetectedRef.current(normalized);
          triggerCooldown(normalized);
        }
      } catch {
        // NotFoundException — normal, no hay código en este frame
      }

      if (attemptsRef.current % 5 === 0) {
        setDebug({
          engine: "zxing",
          attempts: attemptsRef.current,
          resolution: w && h ? `${w}×${h}` : "—",
          lastError: "",
        });
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [stopScan, triggerCooldown]);

  useEffect(() => () => stopScan(), [stopScan]);

  const toggleTorch = useCallback(async () => {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchActiveRef.current;
    try {
      await track.applyConstraints({
        // @ts-ignore
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      torchActiveRef.current = next;
      setTorchActive(next);
    } catch {
      // dispositivo no soporta torch — ocultar botón
      setTorchSupported(false);
    }
  }, []);

  return {
    isScanning,
    error,
    debug,
    torchSupported,
    torchActive,
    toggleTorch,
    startScan,
    stopScan,
    videoRef,
    cooldown,
    lastDetected,
    detectorLevel,
  };
}
