import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import type { SystemHealth, SearchResult } from '../api/types';
import { applyTheme, getStoredTheme, type ThemePreference } from '../theme';
// Deep relative import, not the '@jamanvaar/ui' barrel: that barrel also
// re-exports components which import @jamanvaar/database, whose module-level
// singleton immediately starts polling a LAN-only local device bridge
// (localhost:5178) that has no reason to exist in this pure cloud console —
// confirmed via a real browser session showing repeated connection-refused
// noise on every page. This avoids pulling that module graph in at all.
import { JAMANVAAR_LOGOS } from '../../../../packages/ui/src/assets';
import { JAMANVAARStartup } from '../../../../packages/ui/src/JAMANVAARStartup';
import {
  LayoutDashboard,
  Store,
  Users,
  Building2,
  Package,
  Repeat,
  CreditCard,
  ShieldCheck,
  KeyRound,
  Laptop2,
  FileText,
  HeartPulse,
  UserCog,
  Search,
  Bell,
  LogOut,
  Menu,
  X,
  ExternalLink,
  Layers,
  LifeBuoy,
  Ticket,
  Sliders,
  BarChart3,
  Database,
  ChevronDown,
  Sun,
  Moon,
  Utensils,
  Activity,
  Boxes,
  ShieldAlert,
  Sparkles,
  QrCode
} from 'lucide-react';
import './layout.css';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Platform Control Center',
    items: [{ to: '/', label: 'Executive Dashboard', icon: LayoutDashboard, end: true }]
  },
  {
    label: 'Business Management',
    items: [
      { to: '/restaurants', label: 'Restaurants', icon: Store },
      { to: '/owners', label: 'Restaurant Owners', icon: Users },
      { to: '/branches', label: 'Branches', icon: Building2 },
      { to: '/subscriptions', label: 'Subscriptions', icon: Repeat },
      { to: '/billing', label: 'Invoices & Billing', icon: CreditCard }
    ]
  },
  {
    label: 'SaaS Management',
    items: [
      { to: '/plans', label: 'Plans & Entitlements', icon: Package },
      { to: '/qr-ordering', label: 'QR Ordering Suite', icon: QrCode },
      { to: '/ai-assistant', label: 'JAMAN AI Engine', icon: Sparkles },
      { to: '/catalog', label: 'Master Menu Catalog', icon: Utensils },
      { to: '/activation-keys', label: 'Activation Keys', icon: KeyRound },
      { to: '/payment-connections', label: 'Payment Gateways', icon: CreditCard },
      { to: '/applications', label: 'Applications & Releases', icon: Layers }
    ]
  },
  {
    label: 'Operations & MDM',
    items: [
      { to: '/devices', label: 'Device Fleet / MDM', icon: Laptop2 },
      { to: '/sync-monitor', label: 'Sync & Conflict Monitor', icon: Activity },
      { to: '/backups', label: 'Backups & Recovery', icon: Database },
      { to: '/system-health', label: 'System Telemetry', icon: HeartPulse },
      { to: '/sandboxes', label: 'Staging Sandboxes', icon: Boxes }
    ]
  },
  {
    label: 'Security & Reports',
    items: [
      { to: '/reports', label: 'Reports & Analytics', icon: BarChart3 },
      { to: '/audit-logs', label: 'Audit Logs', icon: FileText },
      { to: '/offline-policy', label: 'Emergency Offline Policy', icon: ShieldAlert },
      { to: '/team', label: 'Platform Team', icon: ShieldCheck },
      { to: '/tickets', label: 'Support Tickets', icon: Ticket },
      { to: '/support', label: 'Diagnostics & Support', icon: LifeBuoy },
      { to: '/settings/platform', label: 'Platform Settings', icon: Sliders }
    ]
  },
  {
    label: 'Account',
    items: [{ to: '/profile', label: 'My Profile', icon: UserCog }]
  }
];

export function ProtectedLayout() {
  const { user, status, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Cross-entity header search — this used to only ever build a
  // /restaurants?search= URL, so an owner name, device ID, or activation
  // code typed here silently found nothing even though the real
  // /api/v1/support/search endpoint (used by the Support page) already
  // indexes all four entity types. Wired here as a live typeahead instead.
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      api
        .get<SearchResult>(`/api/v1/support/search?q=${encodeURIComponent(q)}`)
        .then((res) => {
          setSearchResults(res);
          setSearchOpen(true);
        })
        .catch(() => setSearchResults(null))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  function goToSearchResult(path: string) {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults(null);
    navigate(path);
  }

  // Sidebar groups are collapsible and remembered per browser — previously
  // all 6 groups / 19 items were always fully expanded with no way to hide
  // sections a given operator never touches.
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('jamanvaar_superadmin_collapsed_groups');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      try {
        localStorage.setItem('jamanvaar_superadmin_collapsed_groups', JSON.stringify(next));
      } catch {
        // localStorage unavailable — collapse state just won't persist across reloads.
      }
      return next;
    });
  };
  // The "PLATFORM ONLINE" pill used to be static markup with no data behind
  // it. Polls the real health endpoint instead — a failed fetch (network
  // down, API unreachable) is itself meaningful and now shown as degraded
  // rather than silently continuing to claim "ONLINE".
  const [platformHealth, setPlatformHealth] = useState<'checking' | 'online' | 'degraded'>('checking');

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      api
        .get<SystemHealth>('/api/v1/platform/system-health')
        .then((h) => {
          if (!cancelled) setPlatformHealth(h.database === 'UP' ? 'online' : 'degraded');
        })
        .catch(() => {
          if (!cancelled) setPlatformHealth('degraded');
        });
    };
    check();
    const interval = setInterval(check, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Real notification center — expiringSubscriptions and failed-backup counts
  // were already computed server-side (DashboardSummary, backups fleet stats)
  // but never surfaced anywhere; the header bell just linked to the audit log.
  const [expiringSubscriptions, setExpiringSubscriptions] = useState(0);
  const [failedBackups, setFailedBackups] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      Promise.all([
        api.get<{ expiringSubscriptions: number }>('/api/v1/platform/dashboard'),
        api.get<{ stats: { failed: number } }>('/api/v1/platform/backups')
      ])
        .then(([dash, backups]) => {
          if (cancelled) return;
          setExpiringSubscriptions(dash.expiringSubscriptions || 0);
          setFailedBackups(backups.stats?.failed || 0);
        })
        .catch(() => {
          /* notification counts are best-effort — a failed poll just leaves the last known count */
        });
    };
    check();
    const interval = setInterval(check, 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const notificationCount = (expiringSubscriptions > 0 ? 1 : 0) + (failedBackups > 0 ? 1 : 0);

  // Dark/light theme toggle — resolves the *effective* theme (accounting for
  // 'system') so the icon always shows what clicking it will switch to next,
  // not just the raw stored preference.
  const [themePref, setThemePref] = useState<ThemePreference>(() => getStoredTheme());
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  const effectiveIsDark = themePref === 'dark' || (themePref === 'system' && systemPrefersDark);
  const toggleTheme = () => {
    const next: ThemePreference = effectiveIsDark ? 'light' : 'dark';
    setThemePref(next);
    applyTheme(next);
  };

  if (status === 'loading') {
    return (
      <div className="layout-loading">
        <div className="layout-loading-spinner" />
        <span>Loading JAMANVAAR Platform Control Center…</span>
      </div>
    );
  }
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    navigate(`/restaurants?search=${encodeURIComponent(searchQuery.trim())}`);
  }

  return (
    <JAMANVAARStartup
      appName="Super Admin"
      appType="SUPER_ADMIN"
      subtitle="JAMANVAAR Cloud Platform Control"
    >
      <div className="app-shell">
      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── SIDEBAR: JAMANVAAR Platform Navigation ── */}
      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        {/* Sidebar Brand Header */}
        <div className="sidebar-brand">
          <Link to="/" className="brand-logo-link" onClick={() => setMobileMenuOpen(false)}>
            <img
              src={JAMANVAAR_LOGOS.horizontal}
              alt="JAMANVAAR"
              className="brand-logo-img"
              loading="eager"
            />
          </Link>
          <div className="brand-badge-row">
            <span className="platform-tag">PLATFORM CONTROL</span>
            <span className="super-admin-badge">SUPER ADMIN</span>
          </div>
        </div>

        {/* Navigation List */}
        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group) => {
            const groupHasActiveItem = group.items.some((item) =>
              item.end
                ? location.pathname === item.to
                : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
            );
            // A group containing the active route is always shown expanded,
            // even if the user had previously collapsed it — otherwise
            // navigating there would hide the page you're currently on.
            const isExpanded = groupHasActiveItem || !collapsedGroups[group.label];
            return (
              <div className="sidebar-group" key={group.label}>
                <button
                  type="button"
                  className="sidebar-group-label sidebar-group-toggle"
                  onClick={() => toggleGroup(group.label)}
                  aria-expanded={isExpanded}
                >
                  <span>{group.label}</span>
                  <ChevronDown
                    className={`sidebar-group-chevron ${isExpanded ? 'expanded' : ''}`}
                  />
                </button>
                {isExpanded && (
                  <div className="sidebar-group-items">
                    {group.items.map((item) => {
                      const IconComponent = item.icon;
                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          end={item.end}
                          onClick={() => setMobileMenuOpen(false)}
                          className={({ isActive }) =>
                            `sidebar-link ${isActive ? 'active' : ''}`
                          }
                        >
                          <span className="sidebar-icon-wrap">
                            <IconComponent className="sidebar-icon" />
                          </span>
                          <span className="sidebar-label">{item.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="sidebar-footer">
          <div className="platform-health-pill">
            <span className="pulse-dot" />
            <span className="health-text">Platform Online</span>
            <Link to="/system-health" className="health-link" title="View System Health">
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="platform-version">JAMANVAAR Cloud v1.4.0</div>
        </div>
      </aside>

      {/* ── MAIN CONTENT AREA ── */}
      <div className="app-main">
        {/* ── TOP HEADER: Platform Administration Bar ── */}
        <header className="app-header">
          <div className="header-left">
            {/* Mobile Menu Trigger */}
            <button
              type="button"
              className="mobile-toggle-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* Breadcrumb / Title Context */}
            <div className="header-title-block">
              <span className="header-org-name">JAMANVAAR PLATFORM</span>
              <span className="header-sub-context">Control Center</span>
            </div>
          </div>

          {/* Center Search Bar — cross-entity live results via /api/v1/support/search */}
          <div className="header-search-container" style={{ position: 'relative' }}>
            <form onSubmit={handleSearchSubmit} className="header-search-form">
              <Search className="search-icon" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search restaurants, owners, devices, activation keys…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchResults && setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                className="header-search-input"
              />
              <kbd className="search-kbd">Ctrl+K</kbd>
            </form>

            {searchOpen && searchQuery.trim().length >= 2 && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  right: 0,
                  background: 'var(--jv-surface)',
                  border: '1px solid var(--jv-border)',
                  borderRadius: 10,
                  boxShadow: '0 8px 28px rgba(0,0,0,0.14)',
                  zIndex: 60,
                  maxHeight: 420,
                  overflowY: 'auto'
                }}
              >
                {searching && (
                  <div style={{ padding: '14px 16px', fontSize: 12, color: 'var(--jv-text-light)' }}>Searching…</div>
                )}

                {!searching && searchResults && (
                  <>
                    {searchResults.restaurants.length === 0 &&
                      searchResults.owners.length === 0 &&
                      searchResults.devices.length === 0 &&
                      searchResults.activationKeys.length === 0 && (
                        <div style={{ padding: '14px 16px', fontSize: 12, color: 'var(--jv-text-light)' }}>
                          No matches for "{searchQuery.trim()}"
                        </div>
                      )}

                    {searchResults.restaurants.length > 0 && (
                      <div>
                        <div style={{ padding: '8px 16px 4px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--jv-text-light)' }}>
                          Restaurants
                        </div>
                        {searchResults.restaurants.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onMouseDown={() => goToSearchResult(`/restaurants/${r.id}`)}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--jv-text)' }}
                          >
                            <Store className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span style={{ fontWeight: 700 }}>{r.name}</span>
                            {r.city && <span style={{ color: 'var(--jv-text-light)', fontSize: 11 }}>· {r.city}</span>}
                          </button>
                        ))}
                      </div>
                    )}

                    {searchResults.owners.length > 0 && (
                      <div>
                        <div style={{ padding: '8px 16px 4px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--jv-text-light)' }}>
                          Owners
                        </div>
                        {searchResults.owners.map((o) => (
                          <button
                            key={o.id}
                            type="button"
                            onMouseDown={() => goToSearchResult(o.restaurant ? `/restaurants/${o.restaurant.id}` : '/owners')}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--jv-text)' }}
                          >
                            <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span style={{ fontWeight: 700 }}>{o.fullName}</span>
                            <span style={{ color: 'var(--jv-text-light)', fontSize: 11 }}>· {o.email}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {searchResults.devices.length > 0 && (
                      <div>
                        <div style={{ padding: '8px 16px 4px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--jv-text-light)' }}>
                          Devices
                        </div>
                        {searchResults.devices.map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            onMouseDown={() => goToSearchResult('/devices')}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--jv-text)' }}
                          >
                            <Laptop2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span style={{ fontWeight: 700 }}>{d.type}</span>
                            <span style={{ color: 'var(--jv-text-light)', fontSize: 11 }}>· {d.restaurant?.name ?? d.id.slice(0, 10)}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {searchResults.activationKeys.length > 0 && (
                      <div>
                        <div style={{ padding: '8px 16px 4px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--jv-text-light)' }}>
                          Activation Keys
                        </div>
                        {searchResults.activationKeys.map((k) => (
                          <button
                            key={k.id}
                            type="button"
                            onMouseDown={() => goToSearchResult('/activation-keys')}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--jv-text)' }}
                          >
                            <KeyRound className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{k.code}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Header Right Actions */}
          <div className="header-right">
            {/* Live Operational Status — reflects GET /api/v1/platform/system-health, polled every 30s */}
            <div
              className={`header-status-pill${platformHealth === 'degraded' ? ' header-status-pill--degraded' : ''}`}
              title={
                platformHealth === 'online'
                  ? 'Database reachable, API responding'
                  : platformHealth === 'degraded'
                    ? 'System health check failed or database unreachable — see System Health'
                    : 'Checking platform health…'
              }
            >
              <span className="status-indicator-dot" />
              <span className="status-label">
                {platformHealth === 'online' ? 'PLATFORM ONLINE' : platformHealth === 'degraded' ? 'DEGRADED' : 'CHECKING…'}
              </span>
            </div>

            {/* Real notification center — surfaces expiringSubscriptions and
                failed-backup counts that were already computed server-side
                but previously discarded; this used to be a permanent
                decorative unread dot with no actual state behind it. */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="header-icon-btn"
                style={{ position: 'relative' }}
                title="Notifications"
                aria-label="Notifications"
                onClick={() => setNotifOpen((prev) => !prev)}
                onBlur={() => setTimeout(() => setNotifOpen(false), 150)}
              >
                <Bell className="w-4 h-4" />
                {notificationCount > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: -3,
                      right: -3,
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#ef4444',
                      border: '1.5px solid #fff'
                    }}
                  />
                )}
              </button>

              {notifOpen && (
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: 'calc(100% + 8px)',
                    width: 300,
                    background: 'var(--jv-surface)',
                    border: '1px solid var(--jv-border)',
                    borderRadius: 10,
                    boxShadow: '0 8px 28px rgba(0,0,0,0.14)',
                    zIndex: 60,
                    overflow: 'hidden'
                  }}
                >
                  <div style={{ padding: '10px 14px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--jv-text-light)', borderBottom: '1px solid var(--jv-border)' }}>
                    Notifications
                  </div>
                  {notificationCount === 0 ? (
                    <div style={{ padding: '18px 14px', fontSize: 12, color: 'var(--jv-text-light)', textAlign: 'center' }}>
                      Nothing needs your attention right now.
                    </div>
                  ) : (
                    <>
                      {expiringSubscriptions > 0 && (
                        <Link
                          to="/subscriptions"
                          onMouseDown={() => setNotifOpen(false)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--jv-border)', textDecoration: 'none' }}
                        >
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--jv-text)' }}>
                              {expiringSubscriptions} subscription{expiringSubscriptions === 1 ? '' : 's'} expiring soon
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--jv-text-light)' }}>Renew before they lapse</div>
                          </div>
                        </Link>
                      )}
                      {failedBackups > 0 && (
                        <Link
                          to="/backups"
                          onMouseDown={() => setNotifOpen(false)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', textDecoration: 'none' }}
                        >
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--jv-text)' }}>
                              {failedBackups} failed backup{failedBackups === 1 ? '' : 's'}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--jv-text-light)' }}>Review and retry the snapshot</div>
                          </div>
                        </Link>
                      )}
                    </>
                  )}
                  <Link
                    to="/audit-logs"
                    onMouseDown={() => setNotifOpen(false)}
                    style={{ display: 'block', padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--jv-text-secondary)', textAlign: 'center', borderTop: '1px solid var(--jv-border)', textDecoration: 'none' }}
                  >
                    View full activity log →
                  </Link>
                </div>
              )}
            </div>

            <button
              type="button"
              className="header-icon-btn"
              title={effectiveIsDark ? 'Switch to light theme' : 'Switch to dark theme'}
              aria-label="Toggle dark mode"
              onClick={toggleTheme}
            >
              {effectiveIsDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <div className="header-separator" aria-hidden="true" />

            {/* Admin Profile Pill */}
            <div className="app-header-profile">
              <Link to="/profile" className="profile-avatar-link" title="View Profile">
                <div className="profile-avatar">
                  {user?.fullName?.[0]?.toUpperCase() ?? 'S'}
                </div>
              </Link>
              <div className="profile-info-block">
                <div className="profile-name">{user?.fullName ?? 'Super Admin'}</div>
                <div className="profile-role-tag">
                  {user?.role
                    ? {
                        PLATFORM_OWNER: 'Platform Owner',
                        SUPER_ADMIN: 'Super Admin',
                        PLATFORM_OPS: 'Platform Ops',
                        SUPPORT_ADMIN: 'Support Admin',
                        FINANCE_ADMIN: 'Finance Admin',
                        READ_ONLY: 'Read-Only'
                      }[user.role] ?? user.role
                    : 'Super Admin'}
                </div>
              </div>

              {/* Logout Button */}
              <button
                type="button"
                className="logout-btn"
                onClick={handleLogout}
                title="Log out of Super Admin"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
    </JAMANVAARStartup>
  );
}
