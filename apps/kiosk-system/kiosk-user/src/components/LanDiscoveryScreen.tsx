import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface DiscoveredCore {
  ip: string;
  port: number;
  hostname: string;
}

interface LanDiscoveryScreenProps {
  onConnected: (coreUrl: string) => void;
}

export const LanDiscoveryScreen: React.FC<LanDiscoveryScreenProps> = ({ onConnected }) => {
  const [phase, setPhase] = useState<'searching' | 'found' | 'manual' | 'connecting' | 'error'>('searching');
  const [cores, setCores] = useState<DiscoveredCore[]>([]);
  const [manualIp, setManualIp] = useState('192.168.1.');
  const [manualPort, setManualPort] = useState('5178');
  const [errorMsg, setErrorMsg] = useState('');
  const [dots, setDots] = useState('');

  // Animated dots for "searching..."
  useEffect(() => {
    if (phase !== 'searching') return;
    const t = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 400);
    return () => clearInterval(t);
  }, [phase]);

  // Check if we're running in Tauri environment
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  // Check saved core URL first
  useEffect(() => {
    const saved = localStorage.getItem('jamanvaar_core_url');
    if (saved) {
      // Test if saved connection still works
      fetch(`${saved}/health`, { signal: AbortSignal.timeout(3000) })
        .then(r => r.json())
        .then(() => onConnected(saved))
        .catch(() => {
          localStorage.removeItem('jamanvaar_core_url');
          startDiscovery();
        });
    } else {
      startDiscovery();
    }
  }, []);

  async function startDiscovery() {
    setPhase('searching');
    setCores([]);

    if (isTauri) {
      try {
        // Use Rust UDP discovery (10 second timeout)
        const discovered = await invoke<DiscoveredCore[]>('discover_local_core', { timeoutSecs: 10 });
        if (discovered && discovered.length > 0) {
          setCores(discovered);
          setPhase('found');
        } else {
          setPhase('manual');
        }
      } catch (err) {
        console.warn('LAN discovery failed, falling back to manual:', err);
        setPhase('manual');
      }
    } else {
      // Browser/dev mode: go to manual
      setTimeout(() => setPhase('manual'), 2000);
    }
  }

  async function connectToCore(ip: string, port: number) {
    setPhase('connecting');
    const coreUrl = `http://${ip}:${port}`;

    try {
      const response = await fetch(`${coreUrl}/health`, { signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        localStorage.setItem('jamanvaar_core_url', coreUrl);
        onConnected(coreUrl);
      } else {
        setErrorMsg(`Server responded with ${response.status}. Try again.`);
        setPhase('error');
      }
    } catch {
      setErrorMsg(`Cannot connect to ${coreUrl}. Make sure POS machine is running.`);
      setPhase('error');
    }
  }

  async function connectManual() {
    const ip = manualIp.trim();
    const port = parseInt(manualPort, 10);
    if (!ip || isNaN(port)) {
      setErrorMsg('Please enter a valid IP address and port.');
      return;
    }
    await connectToCore(ip, port);
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#FBF8F2] select-none px-6">
      {/* JAMANVAAR Logo */}
      <div className="mb-8">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#E66817] to-[#C24E05] flex items-center justify-center shadow-2xl shadow-[#E66817]/30">
          <svg viewBox="0 0 100 100" className="w-12 h-12 text-white" fill="currentColor">
            <path d="M50 10 C28 10 10 28 10 50 C10 72 28 90 50 90 C72 90 90 72 90 50 C90 28 72 10 50 10Z" fillOpacity="0.15"/>
            <text x="50" y="62" textAnchor="middle" fontSize="28" fontWeight="900" fontFamily="Arial">J</text>
          </svg>
        </div>
      </div>

      <h1 className="text-2xl font-black text-[#0B253A] mb-1">JAMANVAAR Kiosk</h1>
      <p className="text-sm text-slate-500 mb-8">Restaurant Technology</p>

      {/* Searching Phase */}
      {phase === 'searching' && (
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3">
            <div className="w-3 h-3 rounded-full bg-[#E66817] animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-3 h-3 rounded-full bg-[#E66817] animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-3 h-3 rounded-full bg-[#E66817] animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <p className="text-base font-bold text-[#0B253A]">
            Searching for restaurant{dots}
          </p>
          <p className="text-xs text-slate-400">Looking for JAMANVAAR on your network</p>
          <button
            onClick={() => setPhase('manual')}
            className="mt-4 text-xs text-slate-400 underline cursor-pointer hover:text-slate-600"
          >
            Enter IP manually
          </button>
        </div>
      )}

      {/* Found Phase */}
      {phase === 'found' && cores.length > 0 && (
        <div className="w-full max-w-sm space-y-4">
          <div className="text-center mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full text-emerald-700 text-xs font-bold mb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              JAMANVAAR Restaurant Core Found
            </div>
          </div>

          {cores.map((core, i) => (
            <div key={i} className="bg-white rounded-2xl border border-[#EBE6DD] p-5 shadow-lg">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="font-black text-[#0B253A] text-base">JAMANVAAR</p>
                  <p className="text-xs text-slate-500 mt-0.5">Restaurant Core Server</p>
                </div>
                <span className="text-[10px] font-mono bg-slate-100 px-2 py-1 rounded-lg text-slate-600">
                  {core.ip}:{core.port}
                </span>
              </div>
              <button
                onClick={() => connectToCore(core.ip, core.port)}
                className="w-full py-3 bg-[#E66817] hover:bg-[#D4580F] text-white font-black rounded-xl text-sm shadow-lg shadow-[#E66817]/30 transition-all active:scale-95 cursor-pointer"
              >
                Connect to Restaurant
              </button>
            </div>
          ))}

          <button
            onClick={() => setPhase('manual')}
            className="w-full text-center text-xs text-slate-400 underline cursor-pointer mt-2 hover:text-slate-600"
          >
            Use different IP
          </button>
        </div>
      )}

      {/* Manual Entry Phase */}
      {phase === 'manual' && (
        <div className="w-full max-w-sm space-y-4">
          <div className="text-center mb-2">
            <p className="font-bold text-[#0B253A] text-base">Enter Restaurant Server IP</p>
            <p className="text-xs text-slate-400 mt-1">Ask your restaurant manager for the POS machine IP address</p>
          </div>

          <div className="bg-white rounded-2xl border border-[#EBE6DD] p-5 shadow-md space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1">
                IP Address
              </label>
              <input
                type="text"
                value={manualIp}
                onChange={e => setManualIp(e.target.value)}
                placeholder="192.168.1.100"
                className="w-full px-3 py-2.5 rounded-xl border border-[#EBE6DD] bg-[#FAF7F2] text-[#0B253A] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#E66817]/30"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1">
                Port
              </label>
              <input
                type="text"
                value={manualPort}
                onChange={e => setManualPort(e.target.value)}
                placeholder="5178"
                className="w-full px-3 py-2.5 rounded-xl border border-[#EBE6DD] bg-[#FAF7F2] text-[#0B253A] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#E66817]/30"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-medium">
              {errorMsg}
            </div>
          )}

          <button
            onClick={connectManual}
            className="w-full py-3 bg-[#E66817] hover:bg-[#D4580F] text-white font-black rounded-xl text-sm shadow-lg shadow-[#E66817]/30 transition-all active:scale-95 cursor-pointer"
          >
            Connect
          </button>
          <button
            onClick={startDiscovery}
            className="w-full py-2.5 border border-[#EBE6DD] bg-white hover:bg-[#FAF7F2] text-[#0B253A] font-bold rounded-xl text-sm transition-all cursor-pointer"
          >
            Search Again
          </button>
        </div>
      )}

      {/* Connecting Phase */}
      {phase === 'connecting' && (
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-[#E66817] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="font-bold text-[#0B253A]">Connecting to restaurant{dots}</p>
        </div>
      )}

      {/* Error Phase */}
      {phase === 'error' && (
        <div className="w-full max-w-sm space-y-4 text-center">
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl">
            <p className="font-black text-rose-800 mb-1">Restaurant Core Unavailable</p>
            <p className="text-xs text-rose-600">{errorMsg}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={startDiscovery}
              className="flex-1 py-3 border border-[#EBE6DD] bg-white hover:bg-[#FAF7F2] text-[#0B253A] font-bold rounded-xl text-sm cursor-pointer"
            >
              Retry
            </button>
            <button
              onClick={() => { setErrorMsg(''); setPhase('manual'); }}
              className="flex-1 py-3 bg-[#0B253A] text-white font-bold rounded-xl text-sm cursor-pointer"
            >
              Settings
            </button>
          </div>
        </div>
      )}

      <div className="absolute bottom-6 text-center">
        <p className="text-[10px] text-slate-400 font-mono">v1.0.0 • Powered by Kelviontech</p>
      </div>
    </div>
  );
};

export default LanDiscoveryScreen;
