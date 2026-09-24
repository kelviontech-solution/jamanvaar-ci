import React, { useSyncExternalStore } from 'react';
import { ArrowUpCircle, Wrench, X } from 'lucide-react';
import { AppUpdate, PlatformNotice } from '@jamanvaar/sync';

export interface PlatformNoticeBannerProps {
  /**
   * B2-010: this banner used to show the identical staff-worded message ("Your
   * terminals keep working…") to walk-in guests on the self-order Kiosk, which
   * makes no sense to someone who isn't restaurant staff. 'guest' shows a short,
   * neutral notice instead. Defaults to 'staff' — every other app is staff-only.
   */
  audience?: 'staff' | 'guest';
}

/**
 * security-audit MED-04: the server now validates `downloadUrl` as `https://` only
 * (see cloud/api's `publishReleaseSchema`), but this banner ships to every terminal app
 * and renders whatever the heartbeat response carries — this is defense-in-depth in
 * case that server-side check is ever bypassed or a stale/cached response is served.
 */
function isSafeHttpsUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * The platform team's announcement (maintenance etc.), shown as a thin bar at the
 * very top of a restaurant app. It says plainly that selling is not affected, and
 * can be dismissed for the session.
 */
export const PlatformNoticeBanner: React.FC<PlatformNoticeBannerProps> = ({ audience = 'staff' }) => {
  const snapshot = useSyncExternalStore(
    (cb) => PlatformNotice.subscribe(cb),
    () => JSON.stringify(PlatformNotice.getVisible()),
    () => JSON.stringify(PlatformNotice.getVisible())
  );
  const notice = JSON.parse(snapshot) as ReturnType<typeof PlatformNotice.getVisible>;
  const updateSnapshot = useSyncExternalStore(
    (cb) => AppUpdate.subscribe(cb),
    () => JSON.stringify(AppUpdate.getVisible()),
    () => JSON.stringify(AppUpdate.getVisible())
  );
  const update = JSON.parse(updateSnapshot) as ReturnType<typeof AppUpdate.getVisible>;

  // An optional "new version available" bar (a mandatory update is a lock screen, not a bar). The
  // maintenance notice, when there is one, takes the top of the screen.
  if (!notice && update && !update.mandatory) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="sticky inset-x-0 top-0 z-[9000] flex items-center gap-3 bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-md"
      >
        <ArrowUpCircle className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">
          Version {update.latestVersion} is available.
          {isSafeHttpsUrl(update.downloadUrl) && (
            <a href={update.downloadUrl} target="_blank" rel="noreferrer" className="ml-2 underline">
              Download
            </a>
          )}
        </span>
        <button
          type="button"
          onClick={() => AppUpdate.dismiss()}
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-bold hover:bg-black/10"
        >
          <X className="h-3.5 w-3.5" />
          Dismiss
        </button>
      </div>
    );
  }
  if (!notice) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky inset-x-0 top-0 z-[9000] flex items-center gap-3 bg-amber-500 px-4 py-2 text-sm font-semibold text-[#0B253A] shadow-md"
    >
      <Wrench className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        {audience === 'guest' ? 'We are currently undergoing scheduled maintenance. Thank you for your patience!' : notice.message}
        {audience === 'staff' && notice.endsAt && (
          <span className="ml-2 font-normal opacity-80">{' '}Until {new Date(notice.endsAt).toLocaleString()}.</span>
        )}
        {audience === 'staff' && (
          <span className="ml-2 font-normal opacity-80">{' '}Billing is not affected. Your terminals keep working.</span>
        )}
      </span>
      <button
        type="button"
        onClick={() => PlatformNotice.dismiss()}
        className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-bold hover:bg-black/10"
      >
        <X className="h-3.5 w-3.5" />
        Dismiss
      </button>
    </div>
  );
};
