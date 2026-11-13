import { useRouter } from 'expo-router';
import { ArrowLeft, ArrowRight, Check, Copy, Sparkles, Tag } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  Clipboard,
  I18nManager,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useCartStore } from '../../src/features/cart/model/cart.store';
import { useTranslations } from '../../src/i18n';
import { BRAND_IMAGES, resolveDishImage } from '../../src/ui/assets/dishImages';
import { Badge, Button, Card, Screen } from '../../src/ui/components';
import { useTheme } from '../../src/ui/themes/ThemeProvider';

interface CampaignOffer {
  id: string;
  code: string;
  titleTr: string;
  titleEn: string;
  titleAr: string;
  descTr: string;
  descEn: string;
  descAr: string;
  discountBadge: string;
  minBasketKurus: number;
  image: any;
}

const OFFERS: CampaignOffer[] = [
  {
    id: 'welcome-20',
    code: 'HOSGELDIN',
    titleTr: 'İlk Siparişine Özel %20 İndirim!',
    titleEn: '20% Off on Your First Order!',
    titleAr: 'خصم 20% خاص لطلبك الأول!',
    descTr: 'Tüm menüde geçerli, meşe kömürü lezzetlerini ilk siparişinde %20 indirimle tat.',
    descEn: 'Valid on entire menu. Taste wood-fired oak flavors with 20% off on your first order.',
    descAr: 'صالح على كامل المنيو، استمتع بمذاق مشويات خشب السنديان مع خصم 20% لطلبك الأول.',
    discountBadge: '%20 İndirim',
    minBasketKurus: 30000,
    image: resolveDishImage('Adana Kebap', '/images/adana.webp'),
  },
  {
    id: 'free-delivery',
    code: 'CIHANGIR',
    titleTr: 'Cihangir Bölgesine Ücretsiz Teslimat',
    titleEn: 'Free Delivery to Cihangir',
    titleAr: 'توصيل مجاني لمنطقة جيهانجير',
    descTr: 'Kendi motorlu kuryelerimizle sıcak ve hızlı teslimat.',
    descEn: 'Hot and fast delivery with our dedicated in-house couriers.',
    descAr: 'توصيل ساخن وسريع مع فريق توصيل المطعم الخاص.',
    discountBadge: 'Ücretsiz Kurye',
    minBasketKurus: 25000,
    image: resolveDishImage('Lahmacun', '/images/lahmacun.webp'),
  },
  {
    id: 'kebab-special',
    code: 'KEBAP10',
    titleTr: 'Kebap ve Taş Fırın Pidelerinde %10 İndirim',
    titleEn: '10% Off on Kebabs & Stone-Oven Pide',
    titleAr: 'خصم 10% على الكباب وفطائر الفرن الحجري',
    descTr: 'Zırh kıyması Adana, Urfa ve taş fırın gevrek pidelerinde geçerli indirim.',
    descEn: 'Special discount on hand-minced Adana, Urfa kebabs and crispy stone-oven pide.',
    descAr: 'خصم خاص على كباب أضنة وأورفة المفروم بالسكين وفطائر البيدة المقرمشة.',
    discountBadge: '%10 İndirim',
    minBasketKurus: 50000,
    image: resolveDishImage('Beyti Kebap', '/images/beyti-1024x677.webp'),
  },
  {
    id: 'breakfast-combo',
    code: 'KAHVALTI',
    titleTr: '2 Kişilik Serpme Kahvaltı Kampanyası',
    titleEn: 'Double Serpme Breakfast Offer',
    titleAr: 'عرض الفطور التركي المتكامل لشخصين',
    descTr: 'Taze simit, menemen, bal-kaymak ve zengin peynir çeşitleri ile güne lezzetle başla.',
    descEn: 'Start your day with warm simit, menemen, honey-cream and artisanal cheeses.',
    descAr: 'ابدأ يومك مع السميت الساخن والشكشوكة والعسل بالقشطة وألذ تشكيلة أجبان.',
    discountBadge: 'Özel Fiyat',
    minBasketKurus: 75000,
    image: resolveDishImage('Serpme Kahvaltı', '/images/Serpme-Kahvalti-2-Kisilik.webp'),
  },
];

export default function OffersScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t, language } = useTranslations();
  const { setCouponCode } = useCartStore();

  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [appliedCode, setAppliedCode] = useState<string | null>(null);

  const BackIcon = I18nManager.isRTL ? ArrowRight : ArrowLeft;

  const handleCopy = (code: string) => {
    Clipboard.setString(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const handleApply = (code: string) => {
    setCouponCode(code);
    setAppliedCode(code);
    setTimeout(() => {
      setAppliedCode(null);
      router.push('/(tabs)/menu');
    }, 1200);
  };

  return (
    <Screen edges={['top', 'bottom']}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.sm,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t.common.back}
          style={[styles.backBtn, { minWidth: theme.hitTarget.min, minHeight: theme.hitTarget.min }]}
        >
          <BackIcon size={20} color={theme.colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[theme.typography.titleMd, { color: theme.colors.text }]}>
            {t.offers.title}
          </Text>
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
            {t.offers.subtitle}
          </Text>
        </View>
        <Sparkles size={20} color={theme.colors.primary} />
      </View>

      {/* Offers List */}
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.md,
          gap: theme.spacing.md,
        }}
        showsVerticalScrollIndicator={false}
      >
        {OFFERS.map((offer) => {
          const title =
            language === 'ar'
              ? offer.titleAr
              : language === 'en'
                ? offer.titleEn
                : offer.titleTr;
          const desc =
            language === 'ar'
              ? offer.descAr
              : language === 'en'
                ? offer.descEn
                : offer.descTr;

          const isCopied = copiedCode === offer.code;
          const isApplied = appliedCode === offer.code;

          return (
            <Card
              key={offer.id}
              variant="elevated"
              style={{
                padding: 0,
                overflow: 'hidden',
                borderRadius: theme.radii.lg,
              }}
            >
              {/* Offer Image Header */}
              <View style={styles.imageContainer}>
                <Image source={offer.image} style={styles.offerImage} resizeMode="cover" />
                <View style={styles.badgeOverlay}>
                  <Badge label={offer.discountBadge} tone="accent" />
                </View>
              </View>

              {/* Offer Details */}
              <View style={{ padding: theme.spacing.md, gap: theme.spacing.sm }}>
                <Text style={[theme.typography.titleMd, { color: theme.colors.text }]}>
                  {title}
                </Text>
                <Text style={[theme.typography.bodySm, { color: theme.colors.textSecondary }]}>
                  {desc}
                </Text>

                {/* Coupon Code Strip */}
                <View
                  style={[
                    styles.couponStrip,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                      borderRadius: theme.radii.md,
                    },
                  ]}
                >
                  <View style={styles.couponLeft}>
                    <Tag size={16} color={theme.colors.primary} />
                    <Text style={[styles.couponCode, { color: theme.colors.primary }]}>
                      {offer.code}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => handleCopy(offer.code)}
                    accessibilityRole="button"
                    style={[
                      styles.copyBtn,
                      {
                        backgroundColor: isCopied
                          ? theme.colors.success
                          : theme.colors.surfaceElevated,
                        borderColor: isCopied ? theme.colors.success : theme.colors.border,
                      },
                    ]}
                  >
                    {isCopied ? (
                      <>
                        <Check size={14} color="#FFFFFF" />
                        <Text style={[styles.copyText, { color: '#FFFFFF' }]}>
                          {t.offers.copied}
                        </Text>
                      </>
                    ) : (
                      <>
                        <Copy size={14} color={theme.colors.text} />
                        <Text style={[styles.copyText, { color: theme.colors.text }]}>
                          {t.offers.copyCode}
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>

                {/* Action Buttons */}
                <View style={{ flexDirection: 'row', gap: theme.spacing.xs, marginTop: 4 }}>
                  <Button
                    label={isApplied ? t.offers.applied : t.offers.applyCoupon}
                    size="sm"
                    fullWidth
                    variant={isApplied ? 'primary' : 'outline'}
                    onPress={() => handleApply(offer.code)}
                  />
                  <Button
                    label={t.offers.startOrder}
                    size="sm"
                    fullWidth
                    onPress={() => router.push('/(tabs)/menu')}
                  />
                </View>
              </View>
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageContainer: {
    height: 140,
    width: '100%',
    position: 'relative',
    backgroundColor: '#FAF6F0',
  },
  offerImage: {
    width: '100%',
    height: '100%',
  },
  badgeOverlay: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  couponStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  couponLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  couponCode: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  copyText: {
    fontSize: 12,
    fontWeight: '600',
  },
});

