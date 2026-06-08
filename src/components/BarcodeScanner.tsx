import { useEffect, useCallback } from "react";
import { Zap } from "lucide-react";
import { useScanner } from "@/hooks/useScanner";

interface Props {
  onDetected: (barcode: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onDetected, onClose }: Props) {
  const handleDetected = useCallback(
    (barcode: string) => {
      onDetected(barcode);
      onClose();
    },
    [onDetected, onClose]
  );

  const { error, debug, torchSupported, torchActive, toggleTorch, startScan, stopScan, videoRef } = useScanner(handleDetected);

  useEffect(() => {
    startScan();
    return () => stopScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = () => {
    stopScan();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90">
      <style>{`
        @keyframes scanLine {
          0%, 100% { top: 10%; opacity: 0; }
          10%, 90% { opacity: 1; }
          50% { top: 85%; }
        }
      `}</style>

      <button
        onClick={handleClose}
        aria-label="Cerrar"
        className="fixed top-4 right-4 w-10 h-10 rounded-full bg-[#1a1a1a] border border-white/[0.14] text-white text-xl flex items-center justify-center"
      >
        ✕
      </button>

      {torchSupported && (
        <button
          onClick={toggleTorch}
          aria-label={torchActive ? "Apagar flash" : "Encender flash"}
          className={`fixed top-4 left-4 w-10 h-10 rounded-full border flex items-center justify-center transition-colors ${
            torchActive
              ? "bg-[#00e5a0] border-[#00e5a0] text-black"
              : "bg-[#1a1a1a] border-white/[0.14] text-white"
          }`}
        >
          <Zap size={18} />
        </button>
      )}

      {error ? (
        <div className="px-6 text-center max-w-sm">
          <p className="text-[#ff6b6b] text-lg font-semibold mb-2">Sin acceso a la cámara</p>
          <p className="text-white/60 text-sm leading-relaxed mb-6">{error}</p>
          <button
            onClick={handleClose}
            className="h-12 px-6 rounded-[10px] bg-[#242424] border border-white/[0.14] text-[#f0f0f0] font-semibold"
          >
            Cerrar
          </button>
        </div>
      ) : (
        <>
          <div className="relative w-full max-w-sm aspect-video rounded-2xl overflow-hidden border border-white/10 bg-black">
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              playsInline
              muted
            />

            <div className="absolute inset-4 pointer-events-none">
              <div className="absolute top-0 left-0 w-6 h-6 border-t-[3px] border-l-[3px] border-[#00e5a0] rounded-tl-[3px]" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-[3px] border-r-[3px] border-[#00e5a0] rounded-tr-[3px]" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-[3px] border-l-[3px] border-[#00e5a0] rounded-bl-[3px]" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-[3px] border-r-[3px] border-[#00e5a0] rounded-br-[3px]" />

              <div
                className="absolute left-4 right-4 h-0.5"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, #00e5a0, transparent)",
                  boxShadow: "0 0 8px #00e5a0",
                  animation: "scanLine 2s ease-in-out infinite",
                }}
              />
            </div>
          </div>

          <p className="mt-4 text-sm font-medium text-white/50">
            Apunta al código de barras
          </p>
          <p className="mt-1 text-[11px] text-white/40 font-mono">
            {debug.engine} · {debug.resolution} · {debug.attempts}
            {debug.lastError ? ` · ${debug.lastError}` : ""}
          </p>
        </>
      )}
    </div>
  );
}
