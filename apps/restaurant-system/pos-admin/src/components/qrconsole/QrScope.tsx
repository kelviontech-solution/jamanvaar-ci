import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { storedAdminBranch } from '../../adminBranchScope';
import { QrAdminApi } from '../../cloud/qrAdminClient';

type Scope = { managed: boolean; branchId: string; name: string; restaurantWide: boolean };
const QrScopeContext = createContext<Scope>({ managed: false, branchId: '', name: '', restaurantWide: true });

/** The host header owns editing scope. A branch change reloads the authenticated workspace. */
export function QrScopeProvider({ managed, children }: { managed: boolean; children: ReactNode }) {
  const [selected] = useState(() => storedAdminBranch());
  const branchId = selected && selected !== 'all' ? selected : '';
  const [name, setName] = useState(branchId ? 'Selected branch' : 'Restaurant-wide');
  useEffect(() => {
    if (!managed || !branchId) return;
    let active = true;
    void QrAdminApi.branches().then(rows => {
      if (active) setName(rows.find(row => row.id === branchId)?.name || 'Selected branch');
    }).catch(() => { /* The host validates branch access; a name lookup never changes scope. */ });
    return () => { active = false; };
  }, [managed, branchId]);
  return <QrScopeContext.Provider value={{ managed, branchId, name, restaurantWide: !branchId }}>{children}</QrScopeContext.Provider>;
}
export const useQrScope = () => useContext(QrScopeContext);

export function QrEditingScope({ shared = false, viewing = false }: { shared?: boolean; viewing?: boolean }) {
  const scope = useQrScope();
  if (!scope.managed) return null;
  return <span className="qr-scope-label"><span aria-hidden="true">◉</span> {shared ? 'Shared restaurant menu' : viewing ? scope.restaurantWide ? 'Viewing all branches' : `Viewing ${scope.name}` : scope.restaurantWide ? 'Editing restaurant defaults' : `Editing ${scope.name}`}</span>;
}
