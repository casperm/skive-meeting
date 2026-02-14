"use client";

import { QRCodeSVG } from "qrcode.react";
import { X } from "lucide-react";

interface QRCodeModalProps {
    url: string;
    onClose: () => void;
}

export function QRCodeModal({ url, onClose }: QRCodeModalProps) {
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ textAlign: "center" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                    <h2 style={{ margin: 0 }}>Join on Mobile</h2>
                    <button className="whiteboard-close" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <p>Scan this QR code with your mobile device to join the meeting instantly.</p>

                <div style={{
                    background: "white",
                    padding: "1.5rem",
                    borderRadius: "16px",
                    display: "inline-block",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                    marginBottom: "1.5rem"
                }}>
                    <QRCodeSVG
                        value={url}
                        size={200}
                        level="H"
                        includeMargin={true}
                    />
                </div>

                <div className="meeting-id-badge" style={{ width: "100%", wordBreak: "break-all", fontSize: "0.75rem" }}>
                    {url}
                </div>
            </div>
        </div>
    );
}
