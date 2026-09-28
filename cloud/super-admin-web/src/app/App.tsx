import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { ProtectedLayout } from '../layout/ProtectedLayout';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { LoginPage } from '../pages/Login/LoginPage';
import { DashboardPage } from '../pages/Dashboard/DashboardPage';
import { RestaurantsListPage } from '../pages/Restaurants/RestaurantsListPage';
import { RestaurantDetailPage } from '../pages/Restaurants/RestaurantDetailPage';
import { OnboardRestaurantPage } from '../pages/Onboarding/OnboardRestaurantPage';
import { OwnersListPage } from '../pages/Owners/OwnersListPage';
import { OwnerDetailPage } from '../pages/Owners/OwnerDetailPage';
import { BranchesListPage } from '../pages/Branches/BranchesListPage';
import { BranchDetailPage } from '../pages/Branches/BranchDetailPage';
import { PlansListPage } from '../pages/Plans/PlansListPage';
import { PlanDetailPage } from '../pages/Plans/PlanDetailPage';
import { SubscriptionsListPage } from '../pages/Subscriptions/SubscriptionsListPage';
import { BillingPage } from '../pages/Billing/BillingPage';
import { EntitlementsPage } from '../pages/Entitlements/EntitlementsPage';
import { FeatureCatalogPage } from '../pages/FeatureCatalog/FeatureCatalogPage';
import { ActivationKeysListPage } from '../pages/ActivationKeys/ActivationKeysListPage';
import { DevicesListPage } from '../pages/Devices/DevicesListPage';
import { AuditLogsPage } from '../pages/AuditLogs/AuditLogsPage';
import { SystemHealthPage } from '../pages/SystemHealth/SystemHealthPage';
import { ProfilePage } from '../pages/Profile/ProfilePage';
import { ApplicationsPage } from '../pages/Applications/ApplicationsPage';
import { SupportPage } from '../pages/Support/SupportPage';
import { PlatformSettingsPage } from '../pages/Settings/PlatformSettingsPage';
import { ReportsPage } from '../pages/Reports/ReportsPage';
import { BackupsPage } from '../pages/Backups/BackupsPage';
import { TeamPage } from '../pages/Team/TeamPage';
import { PlatformActivatePage } from '../pages/Activate/PlatformActivatePage';
import { TicketsPage } from '../pages/Tickets/TicketsPage';
import { NotificationsPage } from '../pages/Notifications/NotificationsPage';
import { DeviceDetailPage } from '../pages/Devices/DeviceDetailPage';
import { MasterCatalogPage } from '../pages/Catalog/MasterCatalogPage';
import { AiAssistantPage } from '../pages/AiAssistant/AiAssistantPage';
import { SyncMonitorPage } from '../pages/SyncMonitor/SyncMonitorPage';
import { OfflinePolicyPage } from '../pages/OfflinePolicy/OfflinePolicyPage';
import { SandboxesPage } from '../pages/Sandboxes/SandboxesPage';
import { QrOrderingPage } from '../pages/QrOrdering/QrOrderingPage';
import { PaymentConnectionsListPage } from '../pages/PaymentConnections/PaymentConnectionsListPage';
import { PlatformPaymentsDashboardPage } from '../pages/PlatformPayments/PlatformPaymentsDashboardPage';

/** Wraps a page element so a render crash on this one route can't blank the whole console. */
function page(name: string, element: JSX.Element) {
  return <ErrorBoundary boundaryName={name}>{element}</ErrorBoundary>;
}

export function App() {
  return (
    <ErrorBoundary boundaryName="root">
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={page('Login', <LoginPage />)} />
            <Route path="/activate" element={page('Activate', <PlatformActivatePage />)} />
            <Route element={<ProtectedLayout />}>
              <Route path="/" element={page('Dashboard', <DashboardPage />)} />
              {/* BUG-HIGH-001: "/dashboard" was never a registered path (the
                  dashboard has always lived at "/") but is exactly the URL
                  habit/muscle-memory or an old bookmark would produce —
                  redirect it instead of 404ing. */}
              <Route path="/dashboard" element={<Navigate to="/" replace />} />
              <Route path="/restaurants" element={page('RestaurantsList', <RestaurantsListPage />)} />
              <Route path="/restaurants/onboard" element={page('OnboardRestaurant', <OnboardRestaurantPage />)} />
              <Route path="/restaurants/:id" element={page('RestaurantDetail', <RestaurantDetailPage />)} />
              <Route path="/owners" element={page('OwnersList', <OwnersListPage />)} />
              <Route path="/owners/:id" element={page('OwnerDetail', <OwnerDetailPage />)} />
              <Route path="/branches" element={page('BranchesList', <BranchesListPage />)} />
              <Route path="/branches/:id" element={page('BranchDetail', <BranchDetailPage />)} />
              <Route path="/plans" element={page('PlansList', <PlansListPage />)} />
              <Route path="/plans/:id" element={page('PlanDetail', <PlanDetailPage />)} />
              <Route path="/qr-ordering" element={page('QrOrdering', <QrOrderingPage />)} />
              <Route path="/ai-assistant" element={page('AiAssistant', <AiAssistantPage />)} />
              <Route path="/catalog" element={page('MasterCatalog', <MasterCatalogPage />)} />
              <Route path="/subscriptions" element={page('SubscriptionsList', <SubscriptionsListPage />)} />
              <Route path="/billing" element={page('Billing', <BillingPage />)} />
              <Route path="/entitlements" element={page('Entitlements', <EntitlementsPage />)} />
              <Route path="/feature-catalog" element={page('FeatureCatalog', <FeatureCatalogPage />)} />
              <Route path="/reports" element={page('Reports', <ReportsPage />)} />
              <Route path="/applications" element={page('Applications', <ApplicationsPage />)} />
              <Route path="/activation-keys" element={page('ActivationKeysList', <ActivationKeysListPage />)} />
              <Route path="/payment-connections" element={page('PaymentConnectionsList', <PaymentConnectionsListPage />)} />
              <Route path="/platform-payments" element={page('PlatformPaymentsDashboard', <PlatformPaymentsDashboardPage />)} />
              <Route path="/devices" element={page('DevicesList', <DevicesListPage />)} />
              <Route path="/devices/:id" element={page('DeviceDetail', <DeviceDetailPage />)} />
              <Route path="/sync-monitor" element={page('SyncMonitor', <SyncMonitorPage />)} />
              <Route path="/backups" element={page('Backups', <BackupsPage />)} />
              <Route path="/sandboxes" element={page('Sandboxes', <SandboxesPage />)} />
              <Route path="/offline-policy" element={page('OfflinePolicy', <OfflinePolicyPage />)} />
              <Route path="/team" element={page('Team', <TeamPage />)} />
              <Route path="/support" element={page('Support', <SupportPage />)} />
              <Route path="/tickets" element={page('Tickets', <TicketsPage />)} />
              <Route path="/notifications" element={page('Notifications', <NotificationsPage />)} />
              <Route path="/audit-logs" element={page('AuditLogs', <AuditLogsPage />)} />
              <Route path="/system-health" element={page('SystemHealth', <SystemHealthPage />)} />
              <Route path="/settings/platform" element={page('PlatformSettings', <PlatformSettingsPage />)} />
              <Route path="/profile" element={page('Profile', <ProfilePage />)} />
              {/* Any other unmatched path while authenticated — back to the
                  dashboard rather than a bare "No routes matched" console
                  warning and a blank page. */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
