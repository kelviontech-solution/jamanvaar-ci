import { Link } from 'react-router-dom';
import { CopyButton } from '../../components/CopyButton';
import { Button, Card } from '../../components/ui';
import { useAuth } from '../../auth/AuthContext';
import { ownerPortal } from '../../lib/appUrls';
import { ExternalLink } from 'lucide-react';
import { APP_CODE_LABELS } from '../../api/types';
import type { TenantUser } from '../../api/types';
import type { LaunchStatus } from './RestaurantSetupFlow';
import { ownerProductTask } from './setupActions';
import './owner-handover.css';

export function OwnerHandover({
  name,
  restaurantCode,
  branchId,
  status,
  owner,
  task,
  onOwner,
  onDevices
}: {
  name: string;
  restaurantCode?: string | null;
  branchId: string;
  status?: LaunchStatus;
  owner?: TenantUser;
  task?: string | null;
  onOwner: () => void;
  onDevices: () => void;
}) {
  const { can } = useAuth();
  const products = status?.products.filter((product) => product.purchased) ?? [];
  const apps = products.filter((product) => product.enabled).map((product) => product.appCode);
  const portal = ownerPortal(apps);
  const canOpen = Boolean(status && branchId && apps.length);
  const login = canOpen ? ownerProductTask(apps, branchId, 'handover') : '';
  const accepted = status?.handovers.some((handover) => handover.acceptedAt);
  const tests = status?.checks.filter((check) => check.id.startsWith('test-')) ?? [];
  const tested = tests.length > 0 && tests.every((check) => check.done);
  const configured = products.length > 0 && products.every((product) => product.configured);
  const summary = `${name}
Restaurant ID: ${restaurantCode || 'See owner access'}
Branch: ${status?.branch.name || 'Selected branch'}
Owner workspace: ${login || 'Check branch product access first'}
Included products: ${products.map((product) => APP_CODE_LABELS[product.appCode]).join(', ')}
Channel tests: ${tested ? 'Recorded' : 'Still required'}
Branch handover: ${accepted ? 'Acknowledged' : 'Awaiting acknowledgement'}
Use your own owner login. No passwords or pairing codes are included in this summary.`;
  const actions = [
    {
      task: task === 'tables' ? 'tables' : 'acceptance',
      title: task === 'tables' ? 'Set up branch tables' : 'Test ordering channels',
      description:
        task === 'tables'
          ? 'Open table setup for this branch and check the table QR codes.'
          : 'Check an order through each enabled ordering channel and record the result. Payment and printer checks are separate.',
      label: task === 'tables' ? 'Open table setup' : 'Open channel tests'
    },
    {
      task: 'handover',
      title: 'Prepare and acknowledge handover',
      description: 'Review outstanding work, name the receiving owner or manager, and ask them to sign in and acknowledge the branch handover.',
      label: 'Open branch handover'
    }
  ];
  return (
    <Card className="owner-handover">
      <header className="handover-heading">
        <div>
          <span className="handover-eyebrow">LAUNCH & HANDOVER</span>
          <h2>Finish setup with the owner</h2>
          <p>Review this branch, test its channels and hand over the remaining work.</p>
        </div>
        <CopyButton text={summary} label="Copy safe summary" />
      </header>
      <div className="handover-identity">
        <div>
          <strong>{name}</strong>
          <span>{status?.branch.name || 'Choose a branch'}</span>
        </div>
        <div>
          <span>Restaurant ID</span>
          <strong>{restaurantCode || 'Not assigned'}</strong>
        </div>
        <div>
          <span>Owner workspace</span>
          <strong>{status ? apps.length ? portal.name : 'No enabled workspace' : 'Checking access'}</strong>
        </div>
      </div>
      <dl className="handover-status-grid">
        <div>
          <dt>Configuration</dt>
          <dd>{status ? (configured ? 'Configured' : 'Setup remaining') : 'Checking'}</dd>
        </div>
        <div>
          <dt>Channel tests</dt>
          <dd>{status ? (tested ? 'Results recorded' : 'Tests required') : 'Checking'}</dd>
        </div>
        <div>
          <dt>Owner account</dt>
          <dd>{owner ? (owner.status === 'ACTIVE' ? 'Active' : owner.status.toLowerCase().replaceAll('_', ' ')) : 'Not recorded'}</dd>
        </div>
        <div>
          <dt>Branch handover</dt>
          <dd>{status ? (accepted ? 'Accepted' : 'Awaiting recipient') : 'Checking'}</dd>
        </div>
      </dl>
      <section aria-label="Owner access and devices" className="handover-management">
        <h3>Check access and devices</h3>
        <div className="handover-management-actions">
          <Button variant="ghost" onClick={onOwner}>
            Review owner access
          </Button>
          {owner && (
            <Link className="btn btn-ghost" to={`/owners/${owner.id}`}>
              Invitation & recovery
            </Link>
          )}
          <Button variant="ghost" disabled={!can('devices', 'read')} onClick={onDevices}>
            Check connected devices
          </Button>
        </div>
      </section>
      <section aria-label="Owner launch tasks">
        <h3>Complete these tasks with the owner</h3>
        <p>The owner signs in with their own restaurant account. Your Super Admin session is not shared.</p>
        {!canOpen && (
          <p role="status" className="handover-notice">
            {status
              ? 'Enable a purchased product for this branch before opening owner tasks.'
              : 'Waiting for branch access checks. If this does not finish, refresh the setup checks above.'}
          </p>
        )}
        <div className="handover-task-grid">
          {actions.map((action, index) => (
            <article key={action.task}>
              <span className="handover-task-number">{index + 1}</span>
              <h4>{action.title}</h4>
              <p>{action.description}</p>
              {canOpen ? (
                <a className="btn btn-primary" href={ownerProductTask(apps, branchId, action.task)} target="_blank" rel="noopener noreferrer">
                  {action.label}
                  <ExternalLink size={16} aria-hidden="true" />
                </a>
              ) : (
                <Button disabled>{action.label}</Button>
              )}
              <small>Opens {portal.name} in a new tab</small>
            </article>
          ))}
        </div>
      </section>
    </Card>
  );
}
