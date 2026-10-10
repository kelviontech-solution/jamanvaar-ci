import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  showCloseButton?: boolean;
  className?: string;
  /** Extra classes for the scrollable body wrapper (default just adds padding). */
  bodyClassName?: string;
  /**
   * Optional bottom action bar rendered outside the scrollable body, pinned
   * to the foot of the modal card — for a primary action (e.g. "Add to
   * Cart") that must stay reachable without scrolling past long content.
   */
  footer?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'lg',
  showCloseButton = true,
  className = '',
  bodyClassName = '',
  footer
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const widthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl'
  };

  return (
    // No backdrop-blur: a full-viewport backdrop-filter forces continuous GPU recompositing of
    // everything behind the dialog, which on kiosk-grade hardware was visible as real cursor/UI
    // lag for as long as any modal stayed open (reported live). A plain tinted overlay reads the
    // same to a user but costs the GPU almost nothing.
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 sm:p-6 bg-black/60 animate-fadeIn">
      {/* Backdrop */}
      <div className="fixed inset-0" onClick={onClose} />

      {/* Modal Container — capped to the viewport with an internal
          scrolling body, so long content (e.g. several modifier groups)
          scrolls within the card instead of pushing the primary action
          off-screen or forcing the whole backdrop to scroll. */}
      <div
        role="dialog" aria-modal="true" aria-label={title || 'Dialog'}
        className={`relative w-full ${widthClasses[maxWidth]} max-h-[90vh] bg-white rounded-3xl shadow-2xl border border-[#EBE6DD] overflow-hidden z-10 animate-scaleUp flex flex-col ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#F3EFE6] bg-[#FBF9F5] shrink-0">
            <h2 className="text-xl font-bold text-[#0B253A]">{title}</h2>
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-white border border-[#EBE6DD] text-[#4A5568] hover:text-[#0B253A] hover:bg-[#F8F6F0] flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className={`p-6 overflow-y-auto flex-1 ${bodyClassName}`}>{children}</div>

        {/* Sticky footer action bar */}
        {footer && (
          <div className="px-6 py-4 border-t border-[#F3EFE6] bg-white shrink-0">{footer}</div>
        )}
      </div>
    </div>
  );
};
