import React, { useState, useEffect } from 'react';
import { db, JamanvaarLocalCore } from '@jamanvaar/database';
import { DeviceRecord } from '@jamanvaar/types';
import {
  Server,
  Smartphone,
  Monitor,
  Tablet,
  QrCode,
  CheckCircle2,
  RefreshCw,
  X,
  ShieldCheck,
  Plus,
  Wifi,
  Sparkles,
  Edit2
} from 'lucide-react';

interface ConnectedDevicesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ConnectedDevicesModal: React.FC<ConnectedDevicesModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const [devices, setDevices] = useState<DeviceRecord[]>(JamanvaarLocalCore.getRegisteredDevices());
  const [pairingToken, setPairingToken] = useState<{ token: string; expires_at: string } | null>(null);
  const [isGeneratingPairing, setIsGeneratingPairing] = useState(false);

  useEffect(() => {
    const unsub = db.subscribe(() => {
      setDevices([...JamanvaarLocalCore.getRegisteredDevices()]);
    });
    return unsub;
  }, []);

  const handleGeneratePairingToken = () => {
    setIsGeneratingPairing(true);
    const tokenPayload = JamanvaarLocalCore.generatePairingToken();
    setPairingToken({ token: tokenPayload.token, expires_at: tokenPayload.expires_at });
    setIsGeneratingPairing(false);
  };

  const getDeviceIcon = (type: string, platform?: string) => {
    if (type === 'CAPTAIN') return <Smartphone className="w-5 h-5 text-emerald-600" />;
    if (type === 'KDS') return <Monitor className="w-5 h-5 text-amber-600" />;
    return <Server className="w-5 h-5 text-blue-600" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-jaman-border shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 bg-jaman-navy text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-jaman-saffron text-white flex items-center justify-center font-black">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base">Connected Restaurant Devices</h3>
              <p className="text-xs text-slate-300">
                Authoritative fleet registered on Local Core (JAMANVAAR-AHM-FLAGSHIP)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1 bg-jaman-cream">
          {/* Core Health Badge */}
          <div className="bg-white p-3.5 rounded-2xl border border-emerald-200 flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
              <div>
                <span className="text-xs font-black text-emerald-950 block">LOCAL CORE: HEALTHY & ONLINE</span>
                <span className="text-[11px] text-slate-500 font-mono">Port 8765 • Single Authoritative DB</span>
              </div>
            </div>
            <button
              onClick={handleGeneratePairingToken}
              className="px-3 py-1.5 bg-jaman-saffron hover:bg-[#EA580C] text-white text-xs font-black rounded-xl flex items-center gap-1.5 shadow-sm shadow-jaman-saffron/25 cursor-pointer"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Pair New Device (QR)</span>
            </button>
          </div>

          {/* Pairing Token Modal/Card if Active */}
          {pairingToken && (
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-300 rounded-3xl p-5 text-center space-y-3 shadow-md animate-in zoom-in-95">
              <div className="flex items-center justify-center gap-2 text-amber-900 font-extrabold text-sm">
                <QrCode className="w-5 h-5 text-jaman-saffron" />
                <span>Scan with Captain APK to Pair</span>
              </div>
              <div className="inline-block bg-white p-4 rounded-2xl border border-amber-200 shadow-sm">
                <div className="text-3xl font-black font-mono tracking-widest text-jaman-navy">
                  {pairingToken.token}
                </div>
                <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                  Short-lived code • Valid for 5 minutes
                </span>
              </div>
              <p className="text-xs text-slate-600">
                On the Captain handheld, tap <strong>[ Scan Restaurant QR ]</strong> or enter this code.
              </p>
            </div>
          )}

          {/* Device Fleet List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
              <span>Registered Devices ({devices.length})</span>
              <span>Status</span>
            </div>

            <div className="space-y-2">
              {devices.map((d) => {
                const isOnline = d.status === 'ONLINE';
                return (
                  <div
                    key={d.id}
                    className="bg-white p-3.5 rounded-2xl border border-jaman-border shadow-2xs flex items-center justify-between hover:border-slate-300 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center">
                        {getDeviceIcon(d.type, d.platform)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-xs text-jaman-navy">{d.name}</span>
                          {d.isPrimary && (
                            <span className="text-[9px] font-black bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded">
                              PRIMARY POS
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                          <span>{d.id}</span>
                          <span>•</span>
                          <span>{d.platform || 'Local LAN'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1.5 ${
                          isOnline
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-slate-100 text-slate-500 border border-slate-300'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                        {isOnline ? 'ONLINE' : 'OFFLINE'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-jaman-border flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-500 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Zero database credentials exposed to client handhelds</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-jaman-navy hover:bg-[#123652] text-white rounded-xl font-bold cursor-pointer transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
