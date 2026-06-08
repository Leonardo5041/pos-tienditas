import { useEffect, useRef } from "react";
import { X } from "lucide-react";

type ModalProps = {
  isOpen:    boolean;
  onClose:   () => void;
  children:  React.ReactNode;
  title?:    string;
  maxWidth?: number;
  showClose?: boolean;
};

export default function Modal({
  isOpen,
  onClose,
  children,
  title,
  maxWidth = 480,
  showClose = true,
}: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position:       "fixed",
        inset:          0,
        zIndex:         1000,
        background:     "rgba(0,0,0,0.75)",
        backdropFilter: "blur(4px)",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        padding:        "16px",
        overflowY:      "auto",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={contentRef}
        style={{
          background:   "#1a1a1a",
          border:       "1px solid rgba(255,255,255,0.1)",
          borderRadius: "20px",
          width:        "100%",
          maxWidth:     `${maxWidth}px`,
          maxHeight:    "calc(100vh - 32px)",
          overflowY:    "auto",
          position:     "relative",
          animation:    "modalIn 0.2s ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || showClose) && (
          <div
            style={{
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
              padding:        "20px 20px 0",
              marginBottom:   "4px",
            }}
          >
            {title && (
              <div
                style={{
                  fontSize:   "17px",
                  fontWeight: 600,
                  color:      "#f0f0f0",
                  fontFamily: "DM Sans, sans-serif",
                }}
              >
                {title}
              </div>
            )}
            {showClose && (
              <button
                onClick={onClose}
                style={{
                  marginLeft:     "auto",
                  width:          "32px",
                  height:         "32px",
                  borderRadius:   "50%",
                  background:     "#242424",
                  border:         "1px solid rgba(255,255,255,0.08)",
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  cursor:         "pointer",
                  flexShrink:     0,
                }}
              >
                <X size={16} color="#666" />
              </button>
            )}
          </div>
        )}

        <div style={{ padding: "16px 20px 24px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
