export interface HumanAuditEvent {
  title: string;
  description: string;
  category: string;
  badgeTone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'gold';
}

const EVENT_REGISTRY: Record<string, Partial<HumanAuditEvent>> = {
  TENANT_LOGIN: {
    title: 'Restaurant Admin Sign In',
    description: 'Restaurant owner or authorized staff signed in to the Restaurant Admin console.',
    category: 'Authentication',
    badgeTone: 'info'
  },
  TENANT_LOGIN_FAILED: {
    title: 'Sign In Attempt Failed',
    description: 'Login attempt rejected due to invalid credentials or inactive account status.',
    category: 'Security',
    badgeTone: 'danger'
  },
  DEVICE_ACTIVATED: {
    title: 'Terminal Hardware Activated',
    description: 'A physical device terminal successfully redeemed an activation key and registered a hardware token.',
    category: 'Terminal MDM',
    badgeTone: 'success'
  },
  ACTIVATION_KEY_GENERATED: {
    title: 'Hardware Activation Key Issued',
    description: 'A single-use cryptographic terminal activation key was minted for hardware binding.',
    category: 'Licensing',
    badgeTone: 'gold'
  },
  ACTIVATION_KEY_REVOKED: {
    title: 'Activation Key Revoked',
    description: 'An unused terminal activation key was revoked and invalidated by administrator.',
    category: 'Licensing',
    badgeTone: 'warning'
  },
  RESTAURANT_CREATED: {
    title: 'Restaurant Tenant Provisioned',
    description: 'New restaurant tenant and default primary branch were initialized on the cloud platform.',
    category: 'Tenant Lifecycle',
    badgeTone: 'success'
  },
  RESTAURANT_UPDATED: {
    title: 'Restaurant Profile Updated',
    description: 'Commercial profile, contact information, or tax credentials were updated.',
    category: 'Tenant Lifecycle',
    badgeTone: 'neutral'
  },
  RESTAURANT_SUSPENDED: {
    title: 'Restaurant Account Suspended',
    description: 'Restaurant tenant access and all associated operational terminals were suspended.',
    category: 'Tenant Lifecycle',
    badgeTone: 'danger'
  },
  RESTAURANT_ACTIVATED: {
    title: 'Restaurant Account Reactivated',
    description: 'Restaurant tenant was restored to active operational standing.',
    category: 'Tenant Lifecycle',
    badgeTone: 'success'
  },
  SUBSCRIPTION_CREATED: {
    title: 'SaaS Subscription Provisioned',
    description: 'Subscription plan was assigned with active feature entitlements and billing period.',
    category: 'Subscription & Plan',
    badgeTone: 'gold'
  },
  SUBSCRIPTION_UPDATED: {
    title: 'Subscription Plan Modified',
    description: 'Subscription tier, billing cycle, or expiration date was adjusted.',
    category: 'Subscription & Plan',
    badgeTone: 'info'
  },
  SUBSCRIPTION_CANCELLED: {
    title: 'Subscription Cancelled',
    description: 'SaaS subscription was cancelled or scheduled for termination.',
    category: 'Subscription & Plan',
    badgeTone: 'warning'
  },
  INVOICE_CREATED: {
    title: 'Tax Invoice Generated',
    description: 'Platform billing system issued an official GST tax invoice for subscription services.',
    category: 'Billing & Invoices',
    badgeTone: 'neutral'
  },
  INVOICE_PAID: {
    title: 'Invoice Payment Reconciled',
    description: 'Subscription invoice marked as fully paid and settled.',
    category: 'Billing & Invoices',
    badgeTone: 'success'
  },
  OWNER_PASSWORD_RESET: {
    title: 'Owner Password Reset',
    description: 'Super Admin securely updated or reset credentials for the restaurant owner.',
    category: 'Security & Access',
    badgeTone: 'warning'
  },
  OWNER_UPDATED: {
    title: 'Owner Profile Updated',
    description: 'Master owner contact name, email, or phone number was updated.',
    category: 'Security & Access',
    badgeTone: 'neutral'
  },
  OWNER_ACTIVE: {
    title: 'Owner Account Activated',
    description: 'Restaurant owner account was enabled.',
    category: 'Security & Access',
    badgeTone: 'success'
  },
  OWNER_DISABLED: {
    title: 'Owner Account Disabled',
    description: 'Restaurant owner account was disabled by administrator.',
    category: 'Security & Access',
    badgeTone: 'danger'
  },
  TENANT_USER_ACTIVATED: {
    title: 'Tenant User Activated',
    description: 'User completed first-time setup and password activation.',
    category: 'Authentication',
    badgeTone: 'success'
  },
  DEVICE_COMMAND_ISSUED: {
    title: 'MDM Remote Command Issued',
    description: 'Remote operational command (lock, sync, wipe, or update) queued for device fleet.',
    category: 'Device Fleet',
    badgeTone: 'gold'
  },
  DEVICE_LOCKED: {
    title: 'Terminal Remote Locked',
    description: 'Terminal was locked from cloud console for security or operational reasons.',
    category: 'Device Fleet',
    badgeTone: 'danger'
  },
  DEVICE_UNLOCKED: {
    title: 'Terminal Unlocked',
    description: 'Terminal lock was cleared and restored to active cashier operations.',
    category: 'Device Fleet',
    badgeTone: 'success'
  },
  BACKUP_TRIGGERED: {
    title: 'Backup Snapshot Created',
    description: 'Tenant-isolated encrypted cloud backup snapshot was generated.',
    category: 'Backup & Recovery',
    badgeTone: 'info'
  },
  BACKUP_VERIFIED: {
    title: 'Backup Integrity Verified',
    description: 'SHA-256 cryptographic checksum and snapshot structure were successfully verified.',
    category: 'Backup & Recovery',
    badgeTone: 'success'
  },
  OFFLINE_EXTENSION_GRANTED: {
    title: 'Emergency Offline License Signed',
    description: 'ECDSA P-256 signed emergency certificate granted to allow extended offline operations.',
    category: 'Offline Policy',
    badgeTone: 'warning'
  },
  SANDBOX_CREATED: {
    title: 'Staging Sandbox Provisioned',
    description: 'Sanitized 1-click clone of restaurant menu, settings, and tables created for testing.',
    category: 'Sandboxes',
    badgeTone: 'info'
  },
  MENU_SYNDICATED: {
    title: 'Master Menu Syndicated',
    description: 'Master menu catalog dish published and synchronized down to restaurant franchises.',
    category: 'Menu Catalog',
    badgeTone: 'info'
  }
};

export function formatAuditEvent(action: string, categoryFallback?: string): HumanAuditEvent {
  const reg = EVENT_REGISTRY[action];
  if (reg && reg.title && reg.description) {
    return {
      title: reg.title,
      description: reg.description,
      category: reg.category || categoryFallback || 'General',
      badgeTone: reg.badgeTone || 'neutral'
    };
  }

  // Fallback: convert SNAKE_CASE into Capitalized Words
  const words = action.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return {
    title: words.join(' '),
    description: `Platform operational event: ${action}`,
    category: categoryFallback || 'System',
    badgeTone: action.includes('FAIL') || action.includes('ERROR') ? 'danger' : 'neutral'
  };
}
