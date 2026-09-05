import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { JAMANVAARStartup } from '@jamanvaar/ui';
import { AuthProvider } from '../auth/AuthContext';
import { ProtectedLayout } from '../layout/ProtectedLayout';
import { LoginPage } from '../pages/Login/LoginPage';
import { DashboardPage } from '../pages/Dashboard/DashboardPage';
import { RestaurantsListPage } from '../pages/Restaurants/RestaurantsListPage';
import { RestaurantDetailPage } from '../pages/Restaurants/RestaurantDetailPage';
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

export function App() {
  return (
    <JAMANVAARStartup appName="Super Admin" appType="SUPER_ADMIN" subtitle="Restaurant Operations Platform">
      <BrowserRouter>
        <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/restaurants" element={<RestaurantsListPage />} />
            <Route path="/restaurants/:id" element={<RestaurantDetailPage />} />
            <Route path="/owners" element={<OwnersListPage />} />
            <Route path="/branches" element={<BranchesListPage />} />
            <Route path="/plans" element={<PlansListPage />} />
            <Route path="/plans/:id" element={<PlanDetailPage />} />
            <Route path="/subscriptions" element={<SubscriptionsListPage />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/entitlements" element={<EntitlementsPage />} />
            <Route path="/activation-keys" element={<ActivationKeysListPage />} />
            <Route path="/devices" element={<DevicesListPage />} />
            <Route path="/audit-logs" element={<AuditLogsPage />} />
            <Route path="/system-health" element={<SystemHealthPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Routes>
        </AuthProvider>
      </BrowserRouter>
    </JAMANVAARStartup>
  );
}
