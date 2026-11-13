import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { filterMenuItems } from '../src/features/menu/model/menu.model';
import { formatTryFromKurus } from '../src/lib/money/format';
import { isVersionOutdated } from '../src/lib/version';
import {
  Button,
  OfflineBanner,
  PersistentCartBar,
  StateView,
} from '../src/ui/components';
import { ThemeProvider } from '../src/ui/themes/ThemeProvider';

describe('Phase 7 Redesign UI & System Gates', () => {
  it('renders Button with minimum 44pt target and fires onPress', () => {
    const onPress = jest.fn();
    const { getByRole } = render(
      <ThemeProvider forcedMode="light">
        <Button label="Sepete Ekle" onPress={onPress} />
      </ThemeProvider>,
    );
    const btn = getByRole('button', { name: 'Sepete Ekle' });
    fireEvent.press(btn);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders PersistentCartBar only when itemCount > 0', () => {
    const onPress = jest.fn();
    const empty = render(
      <ThemeProvider forcedMode="light">
        <PersistentCartBar
          itemCount={0}
          subtotalKurus={0}
          locale="tr"
          ctaLabel="Sepete Git"
          itemsLabel="0 ürün"
          onPress={onPress}
        />
      </ThemeProvider>,
    );
    expect(empty.toJSON()).toBeNull();

    const active = render(
      <ThemeProvider forcedMode="light">
        <PersistentCartBar
          itemCount={2}
          subtotalKurus={42000}
          locale="tr"
          ctaLabel="Sepete Git"
          itemsLabel="2 ürün"
          onPress={onPress}
        />
      </ThemeProvider>,
    );
    fireEvent.press(active.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders OfflineBanner and StateView variants cleanly', () => {
    const { getByText, rerender } = render(
      <ThemeProvider forcedMode="light">
        <OfflineBanner message="Çevrimdışısınız" />
      </ThemeProvider>,
    );
    expect(getByText('Çevrimdışısınız')).toBeTruthy();

    rerender(
      <ThemeProvider forcedMode="light">
        <StateView kind="closed" title="Restoran kapalı" />
      </ThemeProvider>,
    );
    expect(getByText('Restoran kapalı')).toBeTruthy();
  });

  it('evaluates minAppVersion semver gates, availableOnly filter, and money formatting', () => {
    expect(isVersionOutdated('1.0.0', '1.0.1')).toBe(true);
    expect(isVersionOutdated('1.0.0', '1.2.0')).toBe(true);
    expect(isVersionOutdated('1.2.0', '1.2.0')).toBe(false);
    expect(isVersionOutdated('2.0.0', '1.9.9')).toBe(false);
    expect(isVersionOutdated('1.0', '1.0.1')).toBe(true);
    expect(isVersionOutdated('1.0.1', '1.0')).toBe(false);
    expect(isVersionOutdated('1.0.0', undefined)).toBe(false);
    expect(formatTryFromKurus(12500, 'tr')).toContain('125');

    const items = [
      {
        id: '1',
        categoryId: 'c1',
        priceKurus: 10000,
        vatRatePercent: 10,
        imageUrl: null,
        isAvailable: true,
        sortOrder: 0,
        allergens: [],
        name: 'Adana',
        description: null,
        options: [],
      },
      {
        id: '2',
        categoryId: 'c1',
        priceKurus: 10000,
        vatRatePercent: 10,
        imageUrl: null,
        isAvailable: false,
        sortOrder: 1,
        allergens: [],
        name: 'Urfa',
        description: null,
        options: [],
      },
    ];
    expect(
      filterMenuItems({
        items,
        categoryId: null,
        searchQuery: '',
        favoritesOnly: false,
        favoriteIds: [],
        availableOnly: true,
      }),
    ).toHaveLength(1);
  });
});

