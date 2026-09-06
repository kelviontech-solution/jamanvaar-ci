import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { ProtectedLayout } from '../layout/ProtectedLayout';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { LoginPage } from '../pages/Login/LoginPage';
import { DashboardPage } from '../pages/Dashboard/DashboardPage';
import { RestaurantsListPage } from '../pages/Restaurants/RestaurantsListPage';
import { RestaurantDetailPage } from '../pages/Restaurants/RestaurantDetailPage';
import { OnboardRestaurantPage } from '../pages/Onboarding/OnboardRestaurantPage';
import { OwnersListPage } from '../pages/Owners/OwnersListPage';
import { BranchesListPage } from '../pages/Branches/BranchesListPage';
import { PlansListPage } from '../pages/Plans/PlansListPage';
import { PlanDetailPage } from '../pages/Plans/PlanDetailPage';
import { SubscriptionsListPage } from '../pages/Subscriptions/SubscriptionsListPage';
import { BillingPage } from '../pages/Billing/BillingPage';
import { EntitlementsPage } from '../pages/Entitlements/EntitlementsPage';
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

/** Wraps a page element so a render crash on this one route can't blank the whole console. */
function page(name: string, element: JSX.Element) {
  return <ErrorBoundary boundaryName={name}>{element}</ErrorBoundary>;
}

export function App() {
  return (
    <ErrorBoundary boundaryName="root">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={page('Login', <LoginPage />)} />
            <Route path="/activate" element={page('Activate', <PlatformActivatePage />)} />
            <Route element={<ProtectedLayout />}>
              <Route path="/" element={page('Dashboard', <DashboardPage />)} />
              <Route path="/restaurants" element={page('RestaurantsList', <RestaurantsListPage />)} />
              <Route path="/restaurants/onboard" element={page('OnboardRestaurant', <OnboardRestaurantPage />)} />
              <Route path="/restaurants/:id" element={page('RestaurantDetail', <RestaurantDetailPage />)} />
              <Route path="/owners" element={page('OwnersList', <OwnersListPage />)} />
              <Route path="/branches" element={page('BranchesList', <BranchesListPage />)} />
              <Route path="/plans" element={page('PlansList', <PlansListPage />)} />
              <Route path="/plans/:id" element={page('PlanDetail', <PlanDetailPage />)} />
              <Route path="/subscriptions" element={page('SubscriptionsList', <SubscriptionsListPage />)} />
              <Route path="/billing" element={page('Billing', <BillingPage />)} />
              <Route path="/entitlements" element={page('Entitlements', <EntitlementsPage />)} />
              <Route path="/reports" element={page('Reports', <ReportsPage />)} />
              <Route path="/applications" element={page('Applications', <ApplicationsPage />)} />
              <Route path="/activation-keys" element={page('ActivationKeysList', <ActivationKeysListPage />)} />
              <Route path="/devices" element={page('DevicesList', <DevicesListPage />)} />
              <Route path="/backups" element={page('Backups', <BackupsPage />)} />
              <Route path="/team" element={page('Team', <TeamPage />)} />
              <Route path="/support" element={page('Support', <SupportPage />)} />
              <Route path="/tickets" element={page('Tickets', <TicketsPage />)} />
              <Route path="/audit-logs" element={page('AuditLogs', <AuditLogsPage />)} />
              <Route path="/system-health" element={page('SystemHealth', <SystemHealthPage />)} />
              <Route path="/settings/platform" element={page('PlatformSettings', <PlatformSettingsPage />)} />
              <Route path="/profile" element={page('Profile', <ProfilePage />)} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
