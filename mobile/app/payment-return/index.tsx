import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { getMyOrderDetail } from '../../src/features/orders/api/orders.api';
import { useTranslations } from '../../src/i18n';
import { StateView } from '../../src/ui/components';

/**
 * Payment return handler. Never trusts redirect query parameters for payment status.
 * Always queries GET /api/v1/orders/:id from the server before navigating.
 */
export default function PaymentReturnScreen() {
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const router = useRouter();
  const { t } = useTranslations();

  useEffect(() => {
    let active = true;
    async function verifyFromServer() {
      if (!orderId) {
        router.replace('/(tabs)/orders');
        return;
      }
      try {
        await getMyOrderDetail(orderId);
      } finally {
        if (active) {
          router.replace(`/orders/${orderId}`);
        }
      }
    }
    void verifyFromServer();
    return () => {
      active = false;
    };
  }, [orderId, router]);

  return <StateView kind="loading" title={t.checkout.paymentProcessing} />;
}

