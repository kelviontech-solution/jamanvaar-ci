import { Link } from 'react-router-dom';
import { CopyButton } from '../../components/CopyButton';
import { Button, Card } from '../../components/ui';
import { useAuth } from '../../auth/AuthContext';
import { RESTAURANT_ADMIN_URL } from '../../lib/appUrls';
import { APP_CODE_LABELS } from '../../api/types';
import type { TenantUser } from '../../api/types';
import type { LaunchStatus } from './RestaurantSetupFlow';
import { ownerConsoleTask } from './setupActions';

export function OwnerHandover({ name, restaurantCode, branchId, status, owner, task, onOwner, onDevices }: {
  name: string; restaurantCode?: string | null; branchId: string; status?: LaunchStatus;
  owner?: TenantUser; task?: string | null; onOwner: () => void; onDevices: () => void;
}) {
  const { can } = useAuth();
  const login = ownerConsoleTask(RESTAURANT_ADMIN_URL, branchId, 'handover');
  const accepted = status?.handovers.some(h => h.acceptedAt);
  const products = status?.products.filter(p => p.purchased) ?? [];
  const tested = status && status.checks.filter(c => c.id.startsWith('test-')).length > 0 && status.checks.filter(c => c.id.startsWith('test-')).every(c => c.done);
  const summary = `${name}\nRestaurant ID: ${restaurantCode || 'See owner access'}\nBranch: ${status?.branch.name || 'Selected branch'}\nOwner console: ${login}\nIncluded products: ${products.map(p=>APP_CODE_LABELS[p.appCode]).join(', ')}\nChannel tests: ${tested ? 'Recorded' : 'Still required'}\nHandover: ${accepted ? 'Acknowledged' : 'Awaiting acknowledgement'}\nUse your own owner login. Connect each terminal with its individual pairing code. Never share passwords or pairing codes in this summary.`;
  return <Card style={{ padding: 22 }}>
    <h2>Owner handover</h2><p>Finish setup with the restaurant owner. This summary contains no passwords, invitation tokens or pairing codes.</p>
    <ol className="workflow-progress">
      <li>Restaurant: created</li>
      <li>Configuration: {status ? products.length && products.every(p=>p.configured) ? 'Complete for purchased products' : 'Work remains' : 'Checking'}</li>
      <li>Channel tests: {status ? tested ? 'Recorded' : 'Still required' : 'Checking'}</li>
      <li>Owner account: {owner ? `${owner.status}; ${owner.invitedAt ? 'invited '+new Date(owner.invitedAt).toLocaleDateString('en-IN') : 'invitation not recorded'}${owner.activatedAt ? '; activated '+new Date(owner.activatedAt).toLocaleDateString('en-IN') : ''}` : 'Not recorded'}</li>
      <li>Receiving-user handover: {status ? accepted ? 'Acknowledged' : 'Awaiting acknowledgement' : 'Checking'}</li>
    </ol>
    <h3>{status?.branch.name || 'Selected branch'} · {name}</h3>
    <p>Restaurant ID: <strong>{restaurantCode || 'Not assigned'}</strong>. The owner must sign in with their own account.</p>
    <div className="workflow-actions"><Button variant="ghost" onClick={onOwner}>Review owner access & invitation</Button>
      {owner && <Link className="btn btn-ghost" to={`/owners/${owner.id}`}>Invitation status & recovery</Link>}
      <Button variant="ghost" disabled={!can('devices','read')} onClick={onDevices}>Connect and check devices</Button>
      <CopyButton text={summary} label="Copy safe handover summary" />
    </div>
    <h3>{task === 'tables' ? 'Set up this branch’s tables' : 'Complete channel acceptance with the owner'}</h3>
    <p>Owner tasks open in a separate tab and require an authorized restaurant login. Branch access is validated before the workspace changes. A recorded test does not verify live payment or printer availability.</p>
    <div className="workflow-actions"><a className="btn btn-primary" href={ownerConsoleTask(RESTAURANT_ADMIN_URL,branchId,task || 'acceptance')} target="_blank" rel="noopener noreferrer">Open {task === 'tables' ? 'table setup' : 'channel acceptance'} in owner console</a>
      <a className="btn btn-ghost" href={login} target="_blank" rel="noopener noreferrer">Open receiving-user handover</a>
    </div>
  </Card>;
}
