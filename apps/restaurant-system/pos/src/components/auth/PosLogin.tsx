import React, { useState, useEffect } from 'react';
import { usePosStore } from '../../store/posStore';
import { db } from '@jamanvaar/database';
import { JamanvaarAuthLayout } from '@jamanvaar/ui';
import {
  Lock,
  Unlock,
  User as UserIcon,
  Zap,
  CheckCircle2,
  Delete,
  ShieldAlert,
  Sparkles,
  Check
} from 'lucide-react';

export const PosLogin: React.FC = () => {
  const { loginWithPin, isOnline, toggleNetworkStatus } = usePosStore();
  const [selectedUser, setSelectedUser] = useState<(typeof db.users)[0] | null>(db.users[2] || db.users[0]);
  const [pin, setPin] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  // Clear error on PIN edit
  useEffect(() => {
    if (errorMessage) setErrorMessage('');
  }, [pin]);

  const handleKeyPress = (num: string) => {
    if (pin.length < 4) {
      setPin((prev) => prev + num);
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setPin('');
    setErrorMessage('');
  };

  const handleSubmit = (overridePin?: string) => {
    const pinToUse = overridePin || pin;
    if (pinToUse.length !== 4) {
      setErrorMessage('Please enter your complete 4-digit staff PIN.');
      return;
    }

    setIsVerifying(true);
    setTimeout(() => {
      const res = loginWithPin(pinToUse);
      setIsVerifying(false);
      if (!res.success) {
        setErrorMessage(res.error || 'Incorrect PIN. Please try again.');
        setPin('');
      }
    }, 200);
  };

  const handleQuickDemo = () => {
    const allUsers = db.users as ((typeof db.users)[0] & { pinCode?: string })[];
    const cashierUser =
      allUsers.find((u) => u.pinCode && (u.roleId === 'role-cashier' || u.roleId === 'role-lead-cashier')) ||
      allUsers[0];
    setSelectedUser(cashierUser);
    if (cashierUser && cashierUser.pinCode) {
      setPin(cashierUser.pinCode);
      handleSubmit(cashierUser.pinCode);
    }
  };

  return (
    <JamanvaarAuthLayout
      appIdentity="POS"
      appTitle="POS Counter"
      appSubtitle="Enter your 4-digit staff PIN to continue"
      isOnline={isOnline}
      onToggleNetwork={toggleNetworkStatus}
      heroHeadline="Smart Billing."
      heroHighlightWord="Better Dining."
      heroDescription="Fast, reliable and easy-to-use restaurant POS software built for modern Indian restaurants."
      capabilities={[
        { label: 'Fast Billing', icon: 'zap' },
        { label: 'Instant KOT', icon: 'printer' },
        { label: 'Table Management', icon: 'table' },
        { label: 'Offline First', icon: 'cloud' }
      ]}
      footerNote="Role-Based Security • Instant Offline Boot • 100% Secure"
    >
      {/* Quick Demo Login Bar (Matching Mockup) */}
      <button
        type="button"
        onClick={handleQuickDemo}
        className="w-full py-2.5 px-4 rounded-xl bg-[#FFF7ED] hover:bg-[#FFEEDD] border border-[#FDBA74] text-[#E66817] font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-2xs active:scale-[0.98] cursor-pointer"
      >
        <Zap className="w-4 h-4 text-[#E66817] fill-[#E66817]" />
        <span>QUICK DEMO LOGIN — Cashier Session (PIN: 1111)</span>
      </button>

      {/* Staff Profile Cards (48-56px Touch Targets) */}
      <div className="space-y-1.5 pt-1">
        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block text-left">
          Select Staff Profile
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {db.users.slice(0, 4).map((user, idx) => {
            const isSelected = selectedUser?.id === user.id;
            const avatarBg =
              idx === 0
                ? 'bg-emerald-100 text-emerald-800'
                : idx === 1
                ? 'bg-blue-100 text-blue-800'
                : idx === 2
                ? 'bg-amber-100 text-amber-800'
                : 'bg-purple-100 text-purple-800';

            return (
              <button
                key={user.id}
                type="button"
                onClick={() => {
                  setSelectedUser(user);
                  setPin('');
                  setErrorMessage('');
                }}
                className={`min-h-[52px] p-2.5 sm:p-3 rounded-2xl border text-left flex items-center gap-3 transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#FFF7ED] border-2 border-[#E66817] text-[#0B253A] shadow-xs'
                    : 'bg-white border-[#EBE6DD] text-slate-700 hover:border-slate-300'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm shrink-0 ${avatarBg}`}
                >
                  {user.fullName.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-extrabold text-xs text-[#0B253A] truncate leading-tight">
                    {user.fullName}
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium truncate capitalize mt-0.5">
                    {user.roleId.replace('role-', '').replace('-', ' ')}
                  </div>
                </div>
                {isSelected && (
                  <div className="w-5 h-5 rounded-full bg-[#E66817] flex items-center justify-center text-white shrink-0 shadow-2xs">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4-Digit PIN Indicator (○ ○ ○ ○) */}
      <div className="pt-2 flex flex-col items-center">
        <div className="flex items-center gap-3.5 my-1">
          {[0, 1, 2, 3].map((idx) => {
            const isFilled = pin.length > idx;
            return (
              <div
                key={idx}
                className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full border-2 transition-all flex items-center justify-center ${
                  isFilled
                    ? 'border-[#0B253A] bg-[#0B253A] scale-110 shadow-xs'
                    : 'border-slate-300 bg-transparent'
                }`}
              />
            );
          })}
        </div>

        {errorMessage && (
          <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-1.5 rounded-xl my-1 text-center flex items-center gap-1.5 animate-shake">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Large Touchscreen Numeric Keypad (1-9, C, 0, ⌫) */}
      <div className="grid grid-cols-3 gap-2 sm:gap-2.5 w-full max-w-xs mx-auto">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((key) => {
          const isAction = key === 'C' || key === '⌫';
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                if (key === 'C') handleClear();
                else if (key === '⌫') handleDelete();
                else handleKeyPress(key);
              }}
              className={`h-13 sm:h-14 rounded-2xl font-black text-xl sm:text-2xl flex items-center justify-center transition-all active:scale-95 select-none cursor-pointer border ${
                isAction
                  ? 'bg-slate-50 border-[#EBE6DD] text-rose-600 hover:bg-rose-50'
                  : 'bg-white border-[#EBE6DD] text-[#0B253A] hover:border-[#E66817] hover:bg-amber-50/30 shadow-2xs'
              }`}
            >
              {key === '⌫' ? (
                <div className="w-6 h-6 rounded-lg bg-rose-100 flex items-center justify-center text-rose-600">
                  <Delete className="w-4 h-4" />
                </div>
              ) : (
                key
              )}
            </button>
          );
        })}
      </div>

      {/* Large Unlock CTA Button */}
      <button
        type="button"
        onClick={() => handleSubmit()}
        disabled={pin.length !== 4 || isVerifying}
        className={`w-full py-3.5 sm:py-4 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md mt-1 ${
          pin.length === 4 && !isVerifying
            ? 'bg-[#E66817] hover:bg-[#EA580C] text-white shadow-orange-500/25 cursor-pointer active:scale-[0.99]'
            : 'bg-slate-200 text-slate-400 cursor-not-allowed'
        }`}
      >
        <Unlock className="w-4 h-4" />
        <span>{isVerifying ? 'VERIFYING...' : 'UNLOCK TERMINAL'}</span>
      </button>
    </JamanvaarAuthLayout>
  );
};
