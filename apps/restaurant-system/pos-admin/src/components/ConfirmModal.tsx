import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal, Button } from '@jamanvaar/ui';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDanger = true
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="sm">
      <div className="space-y-4 py-2">
        <div className="flex items-start gap-3 p-3.5 bg-rose-50 border border-rose-200 rounded-2xl">
          <AlertTriangle className={`w-5 h-5 shrink-0 ${isDanger ? 'text-rose-600' : 'text-amber-600'}`} />
          <p className="text-xs font-semibold text-jaman-navy leading-relaxed whitespace-pre-line">
            {message}
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            {cancelText}
          </Button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-xs active:scale-95 ${
              isDanger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-jaman-saffron hover:bg-[#EA580C]'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
};
