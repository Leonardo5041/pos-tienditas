import { useEffect } from "react";
import { X } from "lucide-react";
import { useIsMobile } from "@/hooks/useBreakpoint";

type ModalProps = {
  isOpen:   boolean;
  onClose:  () => void;
  children: React.ReactNode;
  title?:   string;
};

export default function Modal({ isOpen, onClose, children, title }: ModalProps) {
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  if (isMobile) {
    return (
      <>
        <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
        <div
          onClick={onClose}
          style={{ position: "fixed", inset: 0, zIndex: 49, background: "rgba(0,0,0,0.6)" }}
        />
        <div
          style={{
            position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50,
            background: "#1a1a1a", borderTop: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "20px 20px 0 0",
            padding: "20px 16px",
            paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
            maxHeight: "85vh", overflowY: "auto",
            animation: "slideUp 0.25s ease",
          }}
        >
          {title ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: "#f0f0f0", margin: 0 }}>{title}</h2>
              <button
                onClick={onClose}
                style={{ width: 32, height: 32, borderRadius: "50%", background: "#242424", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#999", cursor: "pointer", flexShrink: 0 }}
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div style={{ width: 40, height: 4, background: "#333", borderRadius: 2, margin: "0 auto 20px" }} />
          )}
          {children}
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`@keyframes fadeInModal{from{opacity:0;transform:translate(-50%,-48%)}to{opacity:1;transform:translate(-50%,-50%)}}`}</style>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 49, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      />
      <div
        style={{
          position: "fixed", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)", zIndex: 50,
          background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 20, padding: "28px 24px",
          width: "90%", maxWidth: 520,
          maxHeight: "85vh", overflowY: "auto",
          animation: "fadeInModal 0.2s ease",
        }}
      >
        {title && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "#f0f0f0", margin: 0 }}>{title}</h2>
            <button
              onClick={onClose}
              style={{ width: 32, height: 32, borderRadius: "50%", background: "#242424", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#999", cursor: "pointer", flexShrink: 0 }}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {children}
      </div>
    </>
  );
}
