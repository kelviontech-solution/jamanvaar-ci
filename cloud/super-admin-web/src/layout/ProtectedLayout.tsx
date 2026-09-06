import React, { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import type { SystemHealth } from '../api/types';
// Deep relative import, not the '@jamanvaar/ui' barrel: that barrel also
// re-exports components which import @jamanvaar/database, whose module-level
// singleton immediately starts polling a LAN-only local device bridge
// (localhost:5178) that has no reason to exist in this pure cloud console —
// confirmed via a real browser session showing repeated connection-refused
// noise on every page. This avoids pulling that module graph in at all.
import { JAMANVAAR_LOGOS } from '../../../../packages/ui/src/assets';
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
  Sliders,
  BarChart3,
  Database
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
    label: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true }]
  },
  {
    label: 'Business Management',
    items: [
      { to: '/restaurants', label: 'Restaurants', icon: Store },
      { to: '/owners', label: 'Restaurant Owners', icon: Users },
      { to: '/branches', label: 'Branches', icon: Building2 }
    ]
  },
  {
    label: 'SaaS Management',
    items: [
      { to: '/plans', label: 'Plans', icon: Package },
      { to: '/subscriptions', label: 'Subscriptions', icon: Repeat },
      { to: '/billing', label: 'Invoices & Billing', icon: CreditCard },
      { to: '/entitlements', label: 'Feature Entitlements', icon: ShieldCheck },
      { to: '/reports', label: 'Reports & Analytics', icon: BarChart3 }
    ]
  },
  {
    label: 'Device & Ecosystem',
    items: [
      { to: '/applications', label: 'Applications', icon: Layers },
      { to: '/activation-keys', label: 'Activation Keys', icon: KeyRound },
      { to: '/devices', label: 'Registered Devices', icon: Laptop2 }
    ]
  },
  {
    label: 'Platform Operations',
    items: [
      { to: '/backups', label: 'Backups & Recovery', icon: Database },
      { to: '/support', label: 'Support & Diagnostics', icon: LifeBuoy },
      { to: '/audit-logs', label: 'Audit Logs', icon: FileText },
      { to: '/system-health', label: 'System Health', icon: HeartPulse },
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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
          {NAV_GROUPS.map((group) => (
            <div className="sidebar-group" key={group.label}>
              <div className="sidebar-group-label">{group.label}</div>
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
          ))}
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

          {/* Center Search Bar */}
          <div className="header-search-container">
            <form onSubmit={handleSearchSubmit} className="header-search-form">
              <Search className="search-icon" />
              <input
                type="text"
                placeholder="Search restaurants, owners, branches, keys…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="header-search-input"
              />
              <kbd className="search-kbd">Ctrl+K</kbd>
            </form>
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

            {/* Recent platform activity — links to the real audit log, the
                closest thing this console has to notifications today. The
                permanent unread dot this used to show was decorative (no
                click handler, no actual unread state behind it); removed
                rather than left implying activity that was never computed. */}
            <Link
              to="/audit-logs"
              className="header-icon-btn"
              title="Recent platform activity"
              aria-label="Recent platform activity"
            >
              <Bell className="w-4 h-4" />
            </Link>

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
                <div className="profile-role-tag">Super Admin</div>
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
  );
}
