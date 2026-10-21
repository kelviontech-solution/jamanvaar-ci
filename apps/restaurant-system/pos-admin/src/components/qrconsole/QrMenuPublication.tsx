import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '@jamanvaar/ui';
import { CheckCircle2, RefreshCw, Send } from 'lucide-react';
import { activeAdminBranch } from '../../adminBranchScope';
import { QrAdminApi, type QrBranch, type QrMenuStatus } from '../../cloud/qrAdminClient';

export function QrMenuPublication({
  revision,
  editing,
  reviewRequest,
  onStatus,
  onPublished
}: {
  revision: number;
  editing: boolean;
  reviewRequest: number;
  onStatus: (value: QrMenuStatus | null) => void;
  onPublished: (text: string) => void;
}) {
  const [branch, setBranch] = useState(
      () => new URLSearchParams(location.search).get('setupBranch') || (activeAdminBranch !== 'all' ? activeAdminBranch : '') || ''
    ),
    [branches, setBranches] = useState<QrBranch[]>([]),
    [status, setStatus] = useState<QrMenuStatus | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [review, setReview] = useState(false),
    [approved, setApproved] = useState(false),
    [publishing, setPublishing] = useState(false);
  const mounted = useRef(false),
    request = useRef(0),
    lastReview = useRef(0),
    saving = useRef(false),
    callbacks = useRef({ onStatus, onPublished });
  callbacks.current = { onStatus, onPublished };
  const load = useCallback(async () => {
    if (!branch || branch === 'restaurant') return null;
    const serial = ++request.current;
    setLoading(true);
    setError('');
    try {
      const value = await QrAdminApi.menuStatus(branch);
      if (!mounted.current || serial !== request.current) return null;
      setStatus(value);
      callbacks.current.onStatus(value);
      return value;
    } catch (e) {
      if (mounted.current && serial === request.current) {
        setError(e instanceof Error ? e.message : 'Could not check the live menu.');
        setStatus(null);
        callbacks.current.onStatus(null);
      }
      return null;
    } finally {
      if (mounted.current && serial === request.current) setLoading(false);
    }
  }, [branch]);
  const loadBranches = async () => {
    try {
      const rows = await QrAdminApi.branches();
      if (!mounted.current) return;
      const active = rows.filter((row) => row.status === 'ACTIVE');
      setBranches(active);
      if (active.length === 1) setBranch(active[0].id);
      setError('');
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'Could not load branches. Try refreshing.');
    }
  };
  useEffect(() => {
    mounted.current = true;
    void loadBranches();
    return () => {
      mounted.current = false;
      request.current++;
    };
  }, []);
  useEffect(() => {
    setStatus(null);
    callbacks.current.onStatus(null);
    setApproved(false);
    setReview(false);
    void load();
  }, [load, revision]);
  useEffect(() => {
    const focus = () => {
      if (!saving.current && !review && !editing) void load();
    };
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, [load, review, editing]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden && !saving.current && !review && !editing) void load();
    }, 30000);
    return () => clearInterval(timer);
  }, [load, review, editing]);
  useEffect(() => {
    if (reviewRequest > lastReview.current) {
      lastReview.current = reviewRequest;
      setApproved(false);
      setReview(true);
      void load();
    }
  }, [reviewRequest, load]);
  const openReview = () => {
    setApproved(false);
    setReview(true);
    void load();
  };
  const publish = async () => {
    if (!status || !approved || saving.current || loading || status.review.errors.length) return;
    saving.current = true;
    setPublishing(true);
    setError('');
    try {
      const result = await QrAdminApi.publishMenu({ expectedChecksum: status.review.checksum, expectedVersion: status.review.publishedVersion });
      if (!mounted.current) return;
      const updated = await load();
      if (!mounted.current) return;
      setApproved(false);
      if (updated) {
        setReview(false);
        callbacks.current.onPublished(
          `Menu version ${result.version} published. ${updated.counts.live} dishes are visible on the live QR menu for ${updated.branchName}.${result.warnings?.length ? ' Some publication warnings need review.' : ''}`
        );
      }
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : 'Publishing failed. Your saved draft is retained.');
        setApproved(false);
      }
    } finally {
      saving.current = false;
      if (mounted.current) setPublishing(false);
    }
  };
  return (
    <section className="qr-menu-publication" aria-label="Draft and live menu status">
      <header>
        <div>
          <h3>Draft → Review → Live menu</h3>
          <p>Saving a dish keeps it in the shared draft. Publishing releases the saved menu to customers.</p>
        </div>
        <label>
          Check branch
          <select
            aria-label="Menu status branch"
            value={branch === 'restaurant' ? '' : branch}
            disabled={loading || publishing}
            onChange={(e) => setBranch(e.target.value)}
          >
            <option value="">Choose branch</option>
            {branches.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
      </header>
      {status && (
        <>
          <div className="qr-menu-counts">
            <div>
              <strong>{status.counts.draft}</strong>
              <span>Saved dishes</span>
            </div>
            <div>
              <strong>{status.counts.live}</strong>
              <span>Visible on live QR</span>
            </div>
            <div>
              <strong>{status.counts.afterPublish}</strong>
              <span>Visible after publishing</span>
            </div>
          </div>
          <p className="qr-menu-publication-state">
            {status.review.hasUnpublishedChanges
              ? 'Unpublished changes are waiting for review.'
              : `Published version ${status.publishedVersion} · Saved menu is published.`}
          </p>
        </>
      )}
      {!branch && <p>Choose a branch to compare its live menu with your saved draft.</p>}
      {!!status?.notices?.length && (
        <div className="qr-menu-review-warnings" role="status">
          {status.notices.map((text) => (
            <p key={text}>{text} Publishing the menu does not change these switches.</p>
          ))}
        </div>
      )}
      {error && (
        <p className="qr-menu-publication-error" role="alert">
          {error}
        </p>
      )}
      <div className="qr-menu-publication-actions">
        <button
          type="button"
          onClick={() => void (branches.length ? load() : loadBranches())}
          disabled={(!branch && branches.length > 0) || loading || publishing}
        >
          <RefreshCw size={16} />
          {loading ? 'Checking…' : 'Refresh live status'}
        </button>
        <button
          type="button"
          className="qr-menu-publish-primary"
          disabled={editing || !status || loading || publishing || !status.review.hasUnpublishedChanges}
          onClick={openReview}
        >
          <Send size={16} />
          Review & publish menu
        </button>
      </div>
      {editing && (
        <p className="qr-menu-publication-hint">Finish the current editor with Save draft or Save & review publish. Only saved changes can be reviewed.</p>
      )}
      <Modal
        isOpen={review}
        title="Review menu publication"
        maxWidth="2xl"
        onClose={() => {
          if (!saving.current) setReview(false);
        }}
      >
        <div className="qr-menu-publication-review">
          <p>
            <strong>Publishing updates the shared restaurant menu across branches and licensed ordering channels.</strong> This does not publish just one dish.
            Branch rules still control what each guest can order.
          </p>
          {loading && <p role="status">Checking the latest saved menu…</p>}
          {error && (
            <p role="alert" className="qr-menu-publication-error">
              {error}
            </p>
          )}
          {status && (
            <>
              <h3>
                {status.branchName}: {status.counts.live} live → {status.counts.afterPublish} after publishing
              </h3>
              {(['added', 'updated', 'removed', 'optionGroups'] as const).map((key) => (
                <details key={key} open={key === 'added'}>
                  <summary>
                    {{ added: 'New dishes', updated: 'Changed dishes', removed: 'Removed dishes', optionGroups: 'Changed sizes / add-ons' }[key]} (
                    {status.review.changes[key].length})
                  </summary>
                  <ul>
                    {status.review.changes[key].map((item) => (
                      <li key={item.id}>{item.name}</li>
                    ))}
                  </ul>
                </details>
              ))}
              {!!status.rows.filter((row) => !row.afterPublishVisible).length && (
                <div className="qr-menu-review-warnings">
                  <strong>These dishes will still be hidden after publishing</strong>
                  <ul>
                    {status.rows
                      .filter((row) => !row.afterPublishVisible)
                      .map((row) => (
                        <li key={row.id}>
                          <b>{row.name}</b> — {row.afterPublishReason}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
              {!!status.review.errors.length && (
                <div role="alert" className="qr-menu-publication-error">
                  <strong>Fix these problems before publishing</strong>
                  <ul>
                    {status.review.errors.map((text, index) => (
                      <li key={index}>{text}</li>
                    ))}
                  </ul>
                </div>
              )}
              {!!status.review.warnings.length && (
                <details>
                  <summary>Menu warnings ({status.review.warnings.length})</summary>
                  <ul>
                    {status.review.warnings.map((text, index) => (
                      <li key={index}>{text}</li>
                    ))}
                  </ul>
                </details>
              )}
              <label className="qr-menu-review-check">
                <input type="checkbox" checked={approved} disabled={publishing || loading} onChange={(e) => setApproved(e.target.checked)} />
                <span>I reviewed the saved changes and understand they update the shared menu.</span>
              </label>
              <div className="qr-menu-publication-actions">
                <button
                  type="button"
                  disabled={loading || publishing}
                  onClick={() => {
                    setApproved(false);
                    void load();
                  }}
                >
                  Refresh review
                </button>
                <button
                  type="button"
                  className="qr-menu-publish-primary"
                  disabled={!approved || loading || publishing || !!status.review.errors.length || !status.review.hasUnpublishedChanges}
                  onClick={() => void publish()}
                >
                  <CheckCircle2 size={16} />
                  {publishing ? 'Publishing…' : 'Publish reviewed menu'}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </section>
  );
}
