import React from 'react';
import { db } from '@jamanvaar/database';
import { Logo } from '@jamanvaar/ui';
import { AlertCircle, ArrowRight, Lock, RefreshCw, Tablet, UtensilsCrossed } from 'lucide-react';
import { ADMIN_PRODUCTS, type AdminProduct } from '../../adminProducts';
import { useAdminProduct } from '../../hooks/useAdminProduct';

const PRODUCT_ICONS: Record<AdminProduct, React.ComponentType<{ className?: string }>> = { POS_ADMIN: UtensilsCrossed, KIOSK_ADMIN: Tablet };

/**
 * Shown after owner sign-in when the restaurant has no single obvious app to open yet: still
 * loading entitlements, an entitlements error, or more than one app enabled (Restaurant Admin /
 * Kiosk Admin) with none picked yet by the current URL/remembered preference. Extracted from
 * App.tsx.
 */
export const ProductPickerScreen: React.FC<{
  entitlementsLoading: boolean;
  entitlementError: string | null;
  authRequired: boolean;
  contextReady: boolean;
  context: ReturnType<typeof useAdminProduct>;
  availableProducts: readonly AdminProduct[];
  onRefetchEntitlements: () => void;
  onAdminLogout: () => void;
}> = ({ entitlementsLoading, entitlementError, authRequired, contextReady, context, availableProducts, onRefetchEntitlements, onAdminLogout }) => {
  return (
    <div className="min-h-screen bg-jaman-cream flex items-center justify-center p-6">
      <section className="bg-white border border-jaman-border rounded-3xl shadow-xl p-8 sm:p-10 max-w-md w-full space-y-6">
        <div className="flex flex-col items-center text-center gap-3">
          <Logo variant="horizontal" size="sm" />
          <p className="text-sm font-bold text-jaman-navy">{db.restaurant.name}</p>
        </div>

        {entitlementsLoading && (
          <div className="flex items-center justify-center gap-2.5 py-6 text-slate-500" role="status">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-sm font-medium">Loading your applications…</span>
          </div>
        )}

        {entitlementError && (
          <div className={`rounded-2xl border p-4 space-y-3 text-center ${authRequired ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'}`} role="alert">
            <div className={`w-10 h-10 rounded-full mx-auto flex items-center justify-center ${authRequired ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>
              {authRequired ? <Lock className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            </div>
            <p className={`text-sm font-semibold ${authRequired ? 'text-rose-800' : 'text-amber-800'}`}>{entitlementError}</p>
            <button
              type="button"
              onClick={authRequired ? onAdminLogout : onRefetchEntitlements}
              className={`w-full py-2.5 rounded-xl font-bold text-sm transition-colors cursor-pointer ${authRequired ? 'bg-rose-600 hover:bg-rose-700 text-white' : 'bg-amber-600 hover:bg-amber-700 text-white'}`}
            >
              {authRequired ? 'Sign in again' : 'Retry'}
            </button>
          </div>
        )}

        {contextReady && <div className="space-y-3">
          {context.denied && <p className="text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3 text-center" role="alert">This application is not enabled in your restaurant's current plan.</p>}
          {context.invalid && <p className="text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 text-center" role="alert">This page was not found. Choose an application below.</p>}
          {!context.denied && !context.invalid && <p className="text-sm font-bold text-slate-500 uppercase tracking-wider text-center">Choose what you want to manage</p>}
          {availableProducts.map(app => {
            const Icon = PRODUCT_ICONS[app];
            return (
              <button
                key={app}
                onClick={() => context.navigate(app)}
                className="w-full flex items-center gap-3.5 text-left rounded-2xl border border-jaman-border p-4 hover:border-jaman-saffron hover:bg-[#FFF8F2] transition-colors cursor-pointer group"
              >
                <div className="w-11 h-11 rounded-xl bg-jaman-cream text-jaman-navy flex items-center justify-center shrink-0 group-hover:bg-jaman-saffron group-hover:text-white transition-colors">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <strong className="text-sm font-bold text-jaman-navy">{ADMIN_PRODUCTS[app].name}</strong>
                  <p className="text-xs text-slate-500 mt-0.5">{ADMIN_PRODUCTS[app].description}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-jaman-saffron transition-colors shrink-0" />
              </button>
            );
          })}
          {!availableProducts.length && <p className="text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3 text-center" role="alert">No admin application is enabled. Ask your platform administrator to check your subscription.</p>}
        </div>}

        <button type="button" onClick={onAdminLogout} className="w-full text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
          Log out
        </button>
      </section>
    </div>
  );
};
