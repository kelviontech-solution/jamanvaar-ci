import { Link } from 'react-router-dom';
import { Card } from '../../components/ui';
import {
  Package,
  ListChecks,
  QrCode,
  MessageCircle,
  Sparkles,
  Utensils,
  KeyRound,
  Landmark,
  Banknote,
  Wallet,
  Layers,
  ArrowRight
} from 'lucide-react';
import '../../components/shared.css';
import './saasManagement.css';

interface SaaSFeature {
  to: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const FEATURES: SaaSFeature[] = [
  {
    to: '/plans',
    title: 'Plans & Entitlements',
    description: 'Pricing tiers and what each subscription plan unlocks for a restaurant.',
    icon: Package
  },
  {
    to: '/feature-catalog',
    title: 'Feature Catalog',
    description: 'The master list of every licensable feature and which plans include it.',
    icon: ListChecks
  },
  {
    to: '/qr-ordering',
    title: 'QR Ordering Suite',
    description: 'Table QR menus, service requests, scheduled pickup, and solo QR restaurants.',
    icon: QrCode
  },
  {
    to: '/whatsapp-ordering',
    title: 'WhatsApp Ordering',
    description: 'WhatsApp-based ordering channel setup and connector status per restaurant.',
    icon: MessageCircle
  },
  {
    to: '/ai-assistant',
    title: 'JAMAN AI Engine',
    description: 'Configuration and rollout of the JAMAN AI assistant across restaurants.',
    icon: Sparkles
  },
  {
    to: '/catalog',
    title: 'Master Menu Catalog',
    description: 'The shared library of dishes, categories, and templates restaurants onboard from.',
    icon: Utensils
  },
  {
    to: '/activation-keys',
    title: 'Activation Keys',
    description: 'Generate and track device activation keys for every terminal type.',
    icon: KeyRound
  },
  {
    to: '/payment-connections',
    title: 'Payment Gateways',
    description: 'Razorpay, UPI, and bank gateway connections available to restaurants.',
    icon: Landmark
  },
  {
    to: '/platform-payments',
    title: 'Platform Payments',
    description: 'Platform-wide payment volume, commission, and revenue dashboard.',
    icon: Banknote
  },
  {
    to: '/payouts',
    title: 'Restaurant Payouts',
    description: 'Manual payout routing, settlement, and EOD reconciliation to restaurants.',
    icon: Wallet
  },
  {
    to: '/applications',
    title: 'Applications & Releases',
    description: 'App version releases, installers, and update rollout across all terminals.',
    icon: Layers
  }
];

export function SaaSManagementPage() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">SaaS Management</h1>
          <p className="page-subtitle">
            The productized side of the platform — pricing, licensable features, add-on ordering channels, and the
            master data restaurants are provisioned from. Open any area below.
          </p>
        </div>
      </div>

      <div className="saas-cards-grid">
        {FEATURES.map((feature) => {
          const IconComponent = feature.icon;
          return (
            <Link key={feature.to} to={feature.to} className="saas-feature-card-link">
              <Card className="saas-feature-card">
                <div className="saas-feature-card-icon">
                  <IconComponent className="w-5 h-5" />
                </div>
                <div className="saas-feature-card-body">
                  <div className="saas-feature-card-title-row">
                    <h3 className="saas-feature-card-title">{feature.title}</h3>
                    <ArrowRight className="w-4 h-4 saas-feature-card-arrow" />
                  </div>
                  <p className="saas-feature-card-desc">{feature.description}</p>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
