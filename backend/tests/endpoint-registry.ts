export interface RouteMatrixEntry {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  auth: 'public' | 'customer' | 'staff' | 'owner' | 'print_agent' | 'totp_setup' | 'hmac';
  testedIn: string;
}

export const ENDPOINT_TEST_REGISTRY: RouteMatrixEntry[] = [
  // Health & Docs
  { method: 'GET', path: '/health', auth: 'public', testedIn: 'endpoint-matrix' },
  { method: 'GET', path: '/healthz', auth: 'public', testedIn: 'endpoint-matrix' },
  { method: 'GET', path: '/readyz', auth: 'public', testedIn: 'endpoint-matrix' },
  { method: 'GET', path: '/docs', auth: 'public', testedIn: 'endpoint-matrix' },

  // Auth
  { method: 'POST', path: '/api/v1/auth/customer/otp/request', auth: 'public', testedIn: 'endpoint-matrix' },
  { method: 'POST', path: '/api/v1/auth/customer/otp/verify', auth: 'public', testedIn: 'endpoint-matrix' },
  { method: 'POST', path: '/api/v1/auth/customer/refresh', auth: 'public', testedIn: 'endpoint-matrix' },
  { method: 'POST', path: '/api/v1/auth/customer/logout', auth: 'customer', testedIn: 'endpoint-matrix' },
  { method: 'POST', path: '/api/v1/auth/staff/login', auth: 'public', testedIn: 'endpoint-matrix' },
  { method: 'POST', path: '/api/v1/auth/staff/totp/setup', auth: 'totp_setup', testedIn: 'endpoint-matrix' },
  { method: 'POST', path: '/api/v1/auth/staff/totp/verify-setup', auth: 'totp_setup', testedIn: 'endpoint-matrix' },
  { method: 'POST', path: '/api/v1/print-agent/token', auth: 'owner', testedIn: 'endpoint-matrix' },
  { method: 'POST', path: '/api/v1/print-agent/token/revoke', auth: 'owner', testedIn: 'endpoint-matrix' },

  // Users & Addresses
  { method: 'DELETE', path: '/api/v1/users/me', auth: 'customer', testedIn: 'endpoint-matrix' },
  { method: 'PATCH', path: '/api/v1/users/me', auth: 'customer', testedIn: 'endpoint-matrix' },
  { method: 'POST', path: '/api/v1/devices', auth: 'customer', testedIn: 'endpoint-matrix' },
  { method: 'GET', path: '/api/v1/referrals/me', auth: 'customer', testedIn: 'endpoint-matrix' },
  { method: 'GET', path: '/api/v1/addresses', auth: 'customer', testedIn: 'endpoint-matrix' },
  { method: 'POST', path: '/api/v1/addresses', auth: 'customer', testedIn: 'endpoint-matrix' },
  { method: 'PATCH', path: '/api/v1/addresses/:id', auth: 'customer', testedIn: 'endpoint-matrix' },
  { method: 'DELETE', path: '/api/v1/addresses/:id', auth: 'customer', testedIn: 'endpoint-matrix' },

  // Menu, Delivery & Public Settings
  { method: 'GET', path: '/api/v1/menu', auth: 'public', testedIn: 'endpoint-matrix' },
  { method: 'GET', path: '/api/v1/banners', auth: 'public', testedIn: 'endpoint-matrix' },
  { method: 'GET', path: '/api/v1/settings/public', auth: 'public', testedIn: 'endpoint-matrix' },
  { method: 'POST', path: '/api/v1/delivery/check', auth: 'public', testedIn: 'endpoint-matrix' },
  { method: 'PATCH', path: '/api/v1/admin/menu/items/:id', auth: 'owner', testedIn: 'endpoint-matrix' },
  { method: 'POST', path: '/api/v1/admin/menu/items', auth: 'owner', testedIn: 'endpoint-matrix' },
  { method: 'DELETE', path: '/api/v1/admin/menu/items/:id', auth: 'owner', testedIn: 'endpoint-matrix' },
  { method: 'POST', path: '/api/v1/admin/menu/categories', auth: 'owner', testedIn: 'endpoint-matrix' },
  { method: 'PATCH', path: '/api/v1/admin/menu/categories/:id', auth: 'owner', testedIn: 'endpoint-matrix' },

  // Orders & Payments
  { method: 'POST', path: '/api/v1/orders/quote', auth: 'public', testedIn: 'endpoint-matrix' },
  { method: 'POST', path: '/api/v1/cart/price', auth: 'public', testedIn: 'endpoint-matrix' },
  { method: 'POST', path: '/api/v1/orders', auth: 'customer', testedIn: 'endpoint-matrix' },
  { method: 'GET', path: '/api/v1/orders', auth: 'customer', testedIn: 'endpoint-matrix' },
  { method: 'GET', path: '/api/v1/orders/:id', auth: 'customer', testedIn: 'endpoint-matrix' },
  { method: 'POST', path: '/api/v1/orders/:id/cancel', auth: 'customer', testedIn: 'endpoint-matrix' },
  { method: 'POST', path: '/api/v1/orders/:id/reorder', auth: 'customer', testedIn: 'endpoint-matrix' },
  { method: 'POST', path: '/api/v1/payments/webhook', auth: 'hmac', testedIn: 'endpoint-matrix' },

  // Staff, Realtime & Print Agent
  { method: 'GET', path: '/api/v1/staff/orders', auth: 'staff', testedIn: 'endpoint-matrix' },
  { method: 'POST', path: '/api/v1/staff/orders/:id/status', auth: 'staff', testedIn: 'endpoint-matrix' },
  { method: 'PATCH', path: '/api/v1/orders/:id/status', auth: 'staff', testedIn: 'endpoint-matrix' },
  { method: 'POST', path: '/api/v1/staff/orders/:id/driver', auth: 'staff', testedIn: 'endpoint-matrix' },
  { method: 'POST', path: '/api/v1/staff/orders/:id/reprint', auth: 'staff', testedIn: 'endpoint-matrix' },
  { method: 'POST', path: '/api/v1/staff/settings/pause', auth: 'staff', testedIn: 'endpoint-matrix' },
  { method: 'GET', path: '/api/v1/realtime/staff', auth: 'staff', testedIn: 'endpoint-matrix' },
  { method: 'GET', path: '/api/v1/print-agent/jobs/poll', auth: 'print_agent', testedIn: 'endpoint-matrix' },
  { method: 'POST', path: '/api/v1/print-agent/jobs/:id/ack', auth: 'print_agent', testedIn: 'endpoint-matrix' },
  { method: 'POST', path: '/api/v1/heartbeats', auth: 'staff', testedIn: 'endpoint-matrix' },

  // Loyalty, Reviews & Consents
  { method: 'GET', path: '/api/v1/loyalty/me', auth: 'customer', testedIn: 'endpoint-matrix' },
  { method: 'POST', path: '/api/v1/reviews', auth: 'customer', testedIn: 'endpoint-matrix' },
  { method: 'POST', path: '/api/v1/consents', auth: 'customer', testedIn: 'endpoint-matrix' },

  // Admin CRUD & Governance
  { method: 'GET', path: '/api/v1/admin/reports/daily-summary', auth: 'owner', testedIn: 'endpoint-matrix' },
  { method: 'GET', path: '/api/v1/admin/audit-logs', auth: 'owner', testedIn: 'endpoint-matrix' },
  { method: 'GET', path: '/api/v1/admin/coupons', auth: 'owner', testedIn: 'endpoint-matrix' },
  { method: 'POST', path: '/api/v1/admin/coupons', auth: 'owner', testedIn: 'endpoint-matrix' },
  { method: 'PATCH', path: '/api/v1/admin/coupons/:id', auth: 'owner', testedIn: 'endpoint-matrix' },
  { method: 'GET', path: '/api/v1/admin/zones', auth: 'owner', testedIn: 'endpoint-matrix' },
  { method: 'PATCH', path: '/api/v1/admin/zones/:id', auth: 'owner', testedIn: 'endpoint-matrix' },
  { method: 'GET', path: '/api/v1/admin/drivers', auth: 'owner', testedIn: 'endpoint-matrix' },
  { method: 'POST', path: '/api/v1/admin/drivers', auth: 'owner', testedIn: 'endpoint-matrix' },
  { method: 'GET', path: '/api/v1/admin/staff', auth: 'owner', testedIn: 'endpoint-matrix' },
  { method: 'GET', path: '/api/v1/admin/fraud-flags', auth: 'owner', testedIn: 'endpoint-matrix' },
  { method: 'POST', path: '/api/v1/admin/fraud-flags/:id/resolve', auth: 'owner', testedIn: 'endpoint-matrix' },
  { method: 'GET', path: '/api/v1/admin/banners', auth: 'owner', testedIn: 'endpoint-matrix' },
  { method: 'POST', path: '/api/v1/admin/banners', auth: 'owner', testedIn: 'endpoint-matrix' },
  { method: 'PATCH', path: '/api/v1/admin/settings', auth: 'owner', testedIn: 'endpoint-matrix' },
];

