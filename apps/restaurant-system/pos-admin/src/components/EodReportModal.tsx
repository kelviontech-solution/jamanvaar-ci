import React from 'react';
import { EodZReportDocument } from './reports/EodZReportDocument';

interface EodReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EodReportModal: React.FC<EodReportModalProps> = ({
  isOpen,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex justify-center p-2 sm:p-6 animate-in fade-in duration-200">
      <div className="w-full max-w-5xl my-auto">
        <EodZReportDocument onClose={onClose} />
      </div>
    </div>
  );
};
