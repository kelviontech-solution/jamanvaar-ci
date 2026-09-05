import React from 'react';
import { AlertCircle, AlertTriangle, RefreshCw, UtensilsCrossed, WifiOff } from 'lucide-react';
import { Button } from './Button';

export const LoadingState: React.FC<{ message?: string; className?: string }> = ({
  message = 'Loading...',
  className = ''
}) => (
  <div className={`flex flex-col items-center justify-center p-12 text-center select-none ${className}`}>
    <div className="w-12 h-12 rounded-full border-4 border-[#EBE6DD] border-t-[#E66817] animate-spin"></div>
    <p className="mt-4 text-base font-semibold text-[#0B253A]">{message}</p>
  </div>
);

export const EmptyState: React.FC<{
  title?: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
  className?: string;
}> = ({
  title = 'No Data Found',
  description = 'There are no items to display at this moment.',
  actionText,
  onAction,
  icon,
  className = ''
}) => (
  <div className={`flex flex-col items-center justify-center p-12 text-center bg-white rounded-2xl border border-[#EBE6DD] ${className}`}>
    <div className="w-16 h-16 rounded-2xl bg-[#FBF9F5] border border-[#EBE6DD] flex items-center justify-center text-[#8C9BAE] mb-4">
      {icon || <UtensilsCrossed className="w-8 h-8 text-[#E66817]" />}
    </div>
    <h3 className="text-lg font-bold text-[#0B253A]">{title}</h3>
    <p className="text-sm text-[#4A5568] max-w-sm mt-1 mb-6 leading-relaxed">
      {description}
    </p>
    {actionText && onAction && (
      <Button variant="primary" onClick={onAction}>
        {actionText}
      </Button>
    )}
  </div>
);

export const ErrorState: React.FC<{
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}> = ({
  title = 'Something went wrong',
  message = 'We could not complete your request. Please try again.',
  onRetry,
  className = ''
}) => (
  <div className={`flex flex-col items-center justify-center p-12 text-center bg-white rounded-2xl border border-rose-200 ${className}`}>
    <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4">
      <AlertCircle className="w-8 h-8" />
    </div>
    <h3 className="text-lg font-bold text-[#0B253A]">{title}</h3>
    <p className="text-sm text-[#4A5568] max-w-sm mt-1 mb-6">{message}</p>
    {onRetry && (
      <Button variant="accent" onClick={onRetry} leftIcon={<RefreshCw className="w-4 h-4" />}>
        Try Again
      </Button>
    )}
  </div>
);

export const OfflineBanner: React.FC<{ isOnline: boolean; className?: string }> = ({
  isOnline,
  className = ''
}) => {
  if (isOnline) return null;

  return (
    <div className={`bg-amber-500 text-white px-4 py-2 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow-inner select-none ${className}`}>
      <WifiOff className="w-4 h-4 animate-pulse" />
      <span>Offline Mode Active — Orders are queued locally and will automatically synchronize</span>
    </div>
  );
};
