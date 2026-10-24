import { ModalBackdrop } from '@jamanvaar/ui';
import React, { useEffect, useRef, useState } from 'react';
import { usePosStore } from '../../store/posStore';
import { ManagerOverrideRepository, StaffRepository } from '@jamanvaar/database';
import { StaffSession } from '@jamanvaar/sync';
import { deviceFetch } from '../../cloud/cloudClient';
import { ShieldAlert, Unlock, Delete } from 'lucide-react';

export const ManagerOverrideModal: React.FC = () => {
  const { pendingOverride, closeOverrideModal, currentUser } = usePosStore();
  const [pin, setPin] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const verifyingRef = useRef(false);
  const [verifying, setVerifying] = useState(false);
  const [remote, setRemote] = useState<{ id: string; fingerprint: string; status: string } | null>(null);
  const completed = useRef(false);
  useEffect(() => {
    setRemote(null);
    setErrorMessage('');
    setPin('');
    completed.current = false;
  }, [pendingOverride]);
  useEffect(() => {
    if (!remote || !pendingOverride || remote.status !== 'PENDING') return;
    let stopped = false,
      polling = false;
    const poll = async () => {
      if (polling || completed.current) return;
      polling = true;
      try {
        const response = await deviceFetch(
          `/api/v1/operations/device/approvals/${encodeURIComponent(remote.id)}/claim`,
          {
            method: 'POST',
            body: JSON.stringify({
              staffToken: StaffSession.sessionToken() ?? '',
              fingerprint: remote.fingerprint,
            }),
          },
        );
        const result = await response.json();
        if (stopped) return;
        if (!response.ok)
          throw new Error(
            typeof result.message === 'string' ? result.message : 'Could not check remote approval',
          );
        if (result.status === 'APPROVED') {
          completed.current = true;
          if (
            pendingOverride.approvalScope &&
            !StaffSession.acceptRemoteApproval(
              result.approvalToken,
              result.approvalExpiresAt,
              result.managerName,
              pendingOverride.approvalScope,
            )
          )
            throw new Error('Remote refund approval expired. Request a new approval.');
          ManagerOverrideRepository.requestOverride({
            action: pendingOverride.action,
            reason: pendingOverride.details || 'Remote manager approval',
            requestedBy: currentUser?.fullName || 'Cashier',
            approvedBy: result.managerName,
          });
          await pendingOverride.onApprove(result.managerName);
          if (!stopped) closeOverrideModal();
        } else if (result.status !== 'PENDING') setRemote({ ...remote, status: result.status });
      } catch (e) {
        if (!stopped) {
          setErrorMessage(e instanceof Error ? e.message : 'Remote approval could not be checked');
          if (completed.current) setRemote({ ...remote, status: 'ACTION_FAILED' });
        }
      } finally {
        polling = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [remote, pendingOverride, currentUser, closeOverrideModal]);
  const requestRemote = async () => {
    if (!pendingOverride || verifyingRef.current) return;
    verifyingRef.current = true;
    setVerifying(true);
    setErrorMessage('');
    try {
      const session = StaffSession.sessionToken();
      if (!session) throw new Error('Sign in online on this terminal before requesting remote approval.');
      completed.current = false;
      const fingerprint = crypto.randomUUID();
      const response = await deviceFetch('/api/v1/operations/device/approvals', {
        method: 'POST',
        body: JSON.stringify({
          action: pendingOverride.action,
          details: pendingOverride.details || pendingOverride.title,
          staffToken: session,
          fingerprint,
          scope: pendingOverride.approvalScope,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          typeof result.message === 'string' ? result.message : 'Could not request remote approval',
        );
      setRemote({ id: result.data.id, fingerprint, status: 'PENDING' });
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Could not request approval');
    } finally {
      verifyingRef.current = false;
      setVerifying(false);
    }
  };

  if (!pendingOverride) return null;

  const handleKeyPress = (num: string) => {
    if (pin.length < 4) {
      setPin((prev) => prev + num);
      setErrorMessage('');
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setPin('');
    setErrorMessage('');
  };

  const handleVerify = async () => {
    if (pin.length !== 4 || verifyingRef.current || remote?.status === 'PENDING' || completed.current) return;
    verifyingRef.current = true;
    setVerifying(true);
    try {
      const res = await ManagerOverrideRepository.verifyPin(pin);
      if (res.success && res.isManager) {
        const managerName = res.user?.fullName || 'Manager';
        // The server confirms the manager and gives a short approval that travels with the action this unlocks (best effort offline).
        const approvedOnline = await StaffSession.approve(pin, deviceFetch, pendingOverride.approvalScope);
        if (pendingOverride.approvalScope && !approvedOnline) {
          setErrorMessage(
            'This online refund needs a current manager approval. Check the connection and authorize again.',
          );
          return;
        }
        ManagerOverrideRepository.requestOverride({
          action: pendingOverride.action,
          reason: pendingOverride.details || 'Manager authorized sensitive action',
          requestedBy: currentUser?.fullName || 'Cashier',
          approvedBy: managerName,
        });

        await pendingOverride.onApprove(managerName);
        closeOverrideModal();
      } else {
        const lockoutMs = StaffRepository.pinLockoutRemainingMs();
        setErrorMessage(
          lockoutMs > 0
            ? `Too many wrong PINs. Try again in ${Math.ceil(lockoutMs / 1000)}s.`
            : 'Authorization failed. Only a Manager or Admin PIN is permitted.',
        );
        setPin('');
      }
    } finally {
      verifyingRef.current = false;
      setVerifying(false);
    }
  };

  return (
    <ModalBackdrop className="flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="bg-jaman-cream border-2 border-amber-500 rounded-3xl max-w-sm w-full p-6 shadow-2xl flex flex-col items-center">
        <div className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center mb-3">
          <ShieldAlert className="w-7 h-7 text-amber-600" />
        </div>

        <h2 className="text-base font-extrabold text-jaman-navy text-center">{pendingOverride.title}</h2>
        <p className="text-xs text-slate-500 text-center mt-1 mb-4">
          {pendingOverride.details || 'This action requires higher manager credentials.'}
        </p>

        {/* PIN digits indicator */}
        {['HIGH_DISCOUNT', 'REFUND'].includes(pendingOverride.action) && (
          <div className="w-full mb-3 text-sm">
            <button
              disabled={verifying || remote?.status === 'PENDING'}
              onClick={() => void requestRemote()}
              className="min-h-11 w-full border rounded-xl p-2 bg-white"
            >
              {remote?.status === 'PENDING'
                ? 'Waiting for remote manager…'
                : 'Request approval from manager device'}
            </button>
            {remote && remote.status !== 'PENDING' && (
              <p role="status">Remote request: {remote.status}. You can request again.</p>
            )}
          </div>
        )}
        <div className="flex gap-3 mb-4">
          {[0, 1, 2, 3].map((idx) => {
            const filled = pin.length > idx;
            return (
              <div
                key={idx}
                className={`w-11 h-12 rounded-xl border-2 flex items-center justify-center font-bold text-xl transition-all ${
                  filled
                    ? 'border-amber-600 bg-amber-50 text-amber-900 shadow-xs'
                    : 'border-slate-300 bg-white text-slate-300'
                }`}
              >
                {filled ? '●' : '○'}
              </div>
            );
          })}
        </div>

        {errorMessage && (
          <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-lg mb-3 text-center">
            {errorMessage}
          </div>
        )}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-2 w-full mb-4">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((key) => {
            const isAction = key === 'C' || key === '⌫';
            return (
              <button
                key={key}
                onClick={() => {
                  if (key === 'C') handleClear();
                  else if (key === '⌫') handleDelete();
                  else handleKeyPress(key);
                }}
                className={`h-11 rounded-xl font-bold text-base flex items-center justify-center keypad-btn border transition-colors ${
                  isAction
                    ? 'bg-slate-100 border-slate-200 text-slate-600'
                    : 'bg-white border-slate-200 text-jaman-navy hover:border-amber-500'
                }`}
              >
                {key === '⌫' ? <Delete className="w-4 h-4 text-slate-500" /> : key}
              </button>
            );
          })}
        </div>

        <div className="w-full flex gap-2">
          <button
            onClick={handleVerify}
            disabled={pin.length !== 4 || verifying || remote?.status === 'PENDING' || completed.current}
            className="flex-1 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md shadow-amber-600/25 disabled:opacity-50"
          >
            <Unlock className="w-4 h-4" />
            <span>Authorize</span>
          </button>
          <button
            onClick={closeOverrideModal}
            className="px-4 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs hover:bg-slate-200"
          >
            Cancel
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
};
