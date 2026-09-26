import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { areaForRoute } from '../auth/access';
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
import { NotificationBell } from '../components/NotificationBell';
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
  QrCode,
  ListChecks
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

/** B2-052: the sidebar badge under the logo said "SUPER ADMIN" for every role — a Read-Only user
 * was told they're a Super Admin, while the header's profile tag (right below) already correctly
 * showed their real role from this exact mapping. One shared source now, not two that can drift. */
const ROLE_LABEL: Record<string, string> = {
  PLATFORM_OWNER: 'Platform Owner',
  SUPER_ADMIN: 'Super Admin',
  PLATFORM_OPS: 'Platform Ops',
  SUPPORT_ADMIN: 'Support Admin',
  FINANCE_ADMIN: 'Finance Admin',
  READ_ONLY: 'Read-Only'
};

/** Words people type for a page that are not in its menu name (including common misspellings), so the header search finds pages too. */
const PAGE_KEYWORDS: Record<string, string> = {
  '/': 'home overview dashboard kpi revenue summary',
  '/restaurants': 'tenant tenants onboard onboarding customer hotel dhaba suspend',
  '/owners': 'owner owners login account password',
  '/branches': 'branch outlet location',
  '/subscriptions': 'subscription plan renew renewal suspend reactivate expiry',
  '/billing': 'invoice invoices receipt reciept receipts payment payments gst tax bill billing pdf',
  '/plans': 'plan plans tier pricing price entitlement entitlements',
  '/feature-catalog': 'feature features module modules category',
  '/qr-ordering': 'qr code table ordering guest menu',
  '/ai-assistant': 'ai jaman assistant chatbot',
  '/catalog': 'menu dish dishes item items food category master starter library',
  '/activation-keys': 'activation key keys code terminal redeem',
  '/payment-connections': 'payment gateway cashfree razorpay upi bank settlement',
  '/applications': 'app apps release releases version update download installer',
  '/devices': 'device devices terminal pos kds captain kiosk mdm lock wipe fleet',
  '/sync-monitor': 'sync conflict conflicts offline queue',
  '/backups': 'backup backups restore recovery snapshot',
  '/system-health': 'health telemetry status uptime database latency',
  '/sandboxes': 'staging sandbox test demo',
  '/reports': 'report reports analytics chart sales export',
  '/audit-logs': 'audit log logs history activity security',
  '/offline-policy': 'offline policy emergency extension grace',
  '/team': 'team staff admin admins role roles invite platform user users',
  '/tickets': 'ticket tickets support help request',
  '/support': 'support diagnostics diagnose inspect impersonate troubleshoot',
  '/settings/platform': 'settings branding logo seller gstin pan company invoice details maintenance quotas defaults',
  '/profile': 'profile password sessions sign out logout security account'
};

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
      { to: '/feature-catalog', label: 'Feature Catalog', icon: ListChecks },
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
  const { user, status, logout, can } = useAuth();
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
    // A page name wins over a restaurant search only when no restaurant, owner, device or key matched.
    const anyData = !!searchResults && (searchResults.restaurants.length + searchResults.owners.length + searchResults.devices.length + searchResults.activationKeys.length > 0);
    if (!anyData && pageMatches.length > 0) {
      goToSearchResult(pageMatches[0].item.to);
      return;
    }
    navigate(`/restaurants?search=${encodeURIComponent(searchQuery.trim())}`);
  }

  // What this signed-in role may open. The API enforces the same table; this
  // just keeps the menu and pages honest (BUG-083).
  const visibleNavGroups = NAV_GROUPS
    .map((group) => ({ ...group, items: group.items.filter((item) => can(areaForRoute(item.to), 'read')) }))
    .filter((group) => group.items.length > 0);

  // Pages (menu entries) matching what was typed: by name, section or keyword. Every typed word must match somewhere.
  const pageMatches = (() => {
    const words = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0 || searchQuery.trim().length < 2) return [];
    return visibleNavGroups
      .flatMap((g) => g.items.map((item) => ({ item, group: g.label })))
      .filter(({ item, group }) => {
        const hay = `${item.label} ${group} ${PAGE_KEYWORDS[item.to] ?? ''}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 6);
  })();
  const currentArea = areaForRoute(location.pathname);
  const canOpenPage = can(currentArea, 'read');
  const isReadOnlyPage = canOpenPage && !can(currentArea, 'write');

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
            <span className="super-admin-badge">{(user?.role && ROLE_LABEL[user.role]) || user?.role || 'Super Admin'}</span>
          </div>
        </div>

        {/* Navigation List */}
        <nav className="sidebar-nav">
          {visibleNavGroups.map((group) => {
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
                placeholder="Search pages, restaurants, owners, devices, keys…"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
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
                {pageMatches.length > 0 && (
                  <div>
                    <div style={{ padding: '8px 16px 4px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--jv-text-light)' }}>
                      Pages
                    </div>
                    {pageMatches.map(({ item, group }) => (
                      <button
                        key={item.to}
                        type="button"
                        onMouseDown={() => goToSearchResult(item.to)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 16px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13, color: 'var(--jv-text)' }}
                      >
                        <item.icon className="w-4 h-4" />
                        <span style={{ fontWeight: 600 }}>{item.label}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--jv-text-light)' }}>{group}</span>
                      </button>
                    ))}
                  </div>
                )}

                {searching && (
                  <div style={{ padding: '14px 16px', fontSize: 12, color: 'var(--jv-text-light)' }}>Searching…</div>
                )}

                {!searching && searchResults && (
                  <>
                    {searchResults.restaurants.length === 0 &&
                      searchResults.owners.length === 0 &&
                      searchResults.devices.length === 0 &&
                      searchResults.activationKeys.length === 0 &&
                      pageMatches.length === 0 && (
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

            <NotificationBell />

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
                  {user?.role ? ROLE_LABEL[user.role] ?? user.role : 'Super Admin'}
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
        <main className={`app-content${isReadOnlyPage ? ' readonly-area' : ''}`}>
          {isReadOnlyPage && (
            <div className="readonly-banner" role="status">
              You have read-only access to this area. Actions that change data are disabled.
            </div>
          )}
          {canOpenPage ? (
            <Outlet />
          ) : (
            <div className="no-access-panel" role="alert">
              <h2>You don't have access to this page</h2>
              <p>Your role ({user?.role?.replace(/_/g, ' ').toLowerCase()}) does not include this area. Ask a Platform Owner if you need it.</p>
              <Link to="/" className="btn btn-accent">Back to dashboard</Link>
            </div>
          )}
        </main>
      </div>
    </div>
    </JAMANVAARStartup>
  );
}
