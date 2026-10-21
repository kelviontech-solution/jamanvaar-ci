import { useState } from 'react';
import { useConfirm } from '@jamanvaar/ui';
import { CheckCircle2 } from 'lucide-react';
import { QrCatalog } from './QrCatalog';
import { QR_BEFORE_NAVIGATE } from './useQrUnsavedChanges';

export function QrMenuWorkspace() {
  const [view, setView] = useState<'EDIT' | 'LIVE'>('EDIT');
  const { confirm, confirmDialog } = useConfirm();
  const change = async (next: typeof view) => {
    if (next === view) return;
    if (
      !window.dispatchEvent(new Event(QR_BEFORE_NAVIGATE, { cancelable: true })) &&
      !(await confirm({
        title: 'Leave this menu task?',
        message: 'Unsaved editor changes will be discarded. Saved drafts will remain available.',
        confirmLabel: 'Discard & switch',
        cancelLabel: 'Keep editing',
        tone: 'danger'
      }))
    )
      return;
    setView(next);
  };
  return (
    <div className="qr-menu-workspace">
      <nav className="qr-menu-view-switch" aria-label="Menu workspace views">
        {(['EDIT', 'LIVE'] as const).map((value) => (
          <button type="button" key={value} aria-current={view === value ? 'page' : undefined} disabled={view === value} onClick={() => void change(value)}>
            {view === value && <CheckCircle2 size={17} />}
            <span>
              {value === 'EDIT' ? 'Dishes & drafts' : 'Live QR menu'}
              <small>{value === 'EDIT' ? 'Add, edit and publish changes' : 'See what guests can order'}</small>
            </span>
          </button>
        ))}
      </nav>
      <QrCatalog key={view} view={view} />
      {confirmDialog}
    </div>
  );
}
