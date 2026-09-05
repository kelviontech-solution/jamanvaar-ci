import React, { useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { JAMANVAAR_LOGOS } from '@jamanvaar/ui';
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
  ExternalLink
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
      { to: '/billing', label: 'Billing', icon: CreditCard },
      { to: '/entitlements', label: 'Feature Entitlements', icon: ShieldCheck }
    ]
  },
  {
    label: 'Device & Licensing',
    items: [
      { to: '/activation-keys', label: 'Activation Keys', icon: KeyRound },
      { to: '/devices', label: 'Registered Devices', icon: Laptop2 }
    ]
  },
  {
    label: 'Platform Operations',
    items: [
      { to: '/audit-logs', label: 'Audit Logs', icon: FileText },
      { to: '/system-health', label: 'System Health', icon: HeartPulse }
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
            {/* Live Operational Status */}
            <div className="header-status-pill" title="All Core Platform Services Operational">
              <span className="status-indicator-dot" />
              <span className="status-label">PLATFORM ONLINE</span>
            </div>

            {/* Notifications Button */}
            <button
              type="button"
              className="header-icon-btn"
              title="Notifications"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" />
              <span className="notification-dot" />
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
