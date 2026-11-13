import React from 'react';
import { useTranslations } from '../../src/i18n';
import { Screen, StateView } from '../../src/ui/components';

export default function ProfileTabScreen() {
  const { t } = useTranslations();
  return (
    <Screen>
      <StateView kind="empty" title={t.profile.guestTitle} message={t.profile.guestDesc} />
    </Screen>
  );
}

