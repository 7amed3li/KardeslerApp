import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { formatKurus, type SupportedLanguage } from '@kardesler/shared';

interface MenuItem {
  id: string;
  nameTr: string;
  nameAr: string;
  nameEn: string;
  priceKurus: number;
  category: string;
}

const SAMPLE_MENU: MenuItem[] = [
  {
    id: 'f0000000-0000-0000-0000-000000000001',
    nameTr: 'Zırh Kıyma Adana Kebap',
    nameAr: 'كباب أضنة لحم مفروم بالسكين',
    nameEn: 'Hand-Minced Spicy Adana Kebab',
    priceKurus: 34000,
    category: 'Kebaplar',
  },
  {
    id: 'f0000000-0000-0000-0000-000000000003',
    nameTr: 'Beyti Sarma Kebap',
    nameAr: 'بيتي كباب ملفوف بالخبز واللبن',
    nameEn: 'Beyti Sarma Kebab',
    priceKurus: 42000,
    category: 'Kebaplar',
  },
  {
    id: 'f0000000-0000-0000-0000-000000000008',
    nameTr: 'Çıtır Taş Fırın Lahmacun',
    nameAr: 'لحم بعجين مقرمش على الحطب',
    nameEn: 'Crispy Lahmacun',
    priceKurus: 9000,
    category: 'Pide & Lahmacun',
  },
  {
    id: 'f0000000-0000-0000-0000-000000000014',
    nameTr: 'Hatay Usulü Sıcak Künefe',
    nameAr: 'كنافة ساخنة على أصولها',
    nameEn: 'Traditional Warm Kunefe',
    priceKurus: 18000,
    category: 'Tatlılar',
  },
];

export default function App() {
  const [lang, setLang] = useState<SupportedLanguage>('tr');
  const [cart, setCart] = useState<{ [itemId: string]: number }>({});
  const minOrderKurus = 25000; // 250 TL Cihangir Zone 1 minimum

  const addToCart = (id: string) => {
    setCart((prev) => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => {
      const updated = { ...prev };
      if (updated[id] > 1) {
        updated[id]--;
      } else {
        delete updated[id];
      }
      return updated;
    });
  };

  const subtotalKurus = Object.entries(cart).reduce((sum, [id, qty]) => {
    const item = SAMPLE_MENU.find((m) => m.id === id);
    return sum + (item ? item.priceKurus * qty : 0);
  }, 0);

  const shortfallKurus = Math.max(0, minOrderKurus - subtotalKurus);
  const isMinOrderMet = shortfallKurus === 0;

  const getItemName = (item: MenuItem) => {
    if (lang === 'ar') return item.nameAr;
    if (lang === 'en') return item.nameEn;
    return item.nameTr;
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header Bar */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>🍢 Kardeşler Cihangir</Text>
          <Text style={styles.headerSubtitle}>
            {lang === 'ar' ? 'توصيل مجاني لجميع الطلبات' : 'Ücretsiz Teslimat • Free Delivery'}
          </Text>
        </View>

        {/* Language Switcher */}
        <View style={styles.langSwitch}>
          {(['tr', 'ar', 'en'] as SupportedLanguage[]).map((l) => (
            <TouchableOpacity
              key={l}
              onPress={() => setLang(l)}
              style={[styles.langBtn, lang === l && styles.langBtnActive]}
            >
              <Text style={[styles.langText, lang === l && styles.langTextActive]}>
                {l.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Menu Feed */}
      <ScrollView contentContainerStyle={styles.menuScroll}>
        <Text style={styles.sectionTitle}>
          {lang === 'ar' ? 'قائمة الطعام المختارة' : 'Günün Özel Lezzetleri'}
        </Text>

        {SAMPLE_MENU.map((item) => {
          const qty = cart[item.id] || 0;
          return (
            <View key={item.id} style={styles.card}>
              <View style={styles.cardInfo}>
                <Text style={styles.itemName}>{getItemName(item)}</Text>
                <Text style={styles.itemCategory}>{item.category}</Text>
                <Text style={styles.itemPrice}>{formatKurus(item.priceKurus)}</Text>
              </View>

              <View style={styles.qtyContainer}>
                {qty > 0 && (
                  <>
                    <TouchableOpacity
                      onPress={() => removeFromCart(item.id)}
                      style={styles.btnSecondary}
                    >
                      <Text style={styles.btnTextSecondary}>-</Text>
                    </TouchableOpacity>
                    <Text style={styles.qtyText}>{qty}</Text>
                  </>
                )}
                <TouchableOpacity onPress={() => addToCart(item.id)} style={styles.btnPrimary}>
                  <Text style={styles.btnTextPrimary}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Bottom Cart Bar */}
      {subtotalKurus > 0 && (
        <View style={styles.cartBar}>
          {!isMinOrderMet && (
            <View style={styles.shortfallNotice}>
              <Text style={styles.shortfallText}>
                {lang === 'ar'
                  ? `باقي ${formatKurus(shortfallKurus)} للوصول للحد الأدنى للطلب`
                  : `Minimum sipariş tutarına ${formatKurus(shortfallKurus)} kaldı`}
              </Text>
            </View>
          )}

          <View style={styles.cartContent}>
            <View>
              <Text style={styles.cartTotalLabel}>
                {lang === 'ar' ? 'المجموع (توصيل مجاني):' : 'Toplam Tutar:'}
              </Text>
              <Text style={styles.cartTotalAmount}>{formatKurus(subtotalKurus)}</Text>
            </View>

            <TouchableOpacity
              disabled={!isMinOrderMet}
              style={[styles.checkoutBtn, !isMinOrderMet && styles.checkoutBtnDisabled]}
            >
              <Text style={styles.checkoutBtnText}>
                {lang === 'ar' ? 'متابعة الطلب' : 'Siparişi Tamamla'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    padding: 16,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#b91c1c' },
  headerSubtitle: { fontSize: 12, color: '#16a34a', marginTop: 2, fontWeight: '600' },
  langSwitch: { flexDirection: 'row', gap: 4 },
  langBtn: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, backgroundColor: '#f1f5f9' },
  langBtnActive: { backgroundColor: '#b91c1c' },
  langText: { fontSize: 11, fontWeight: '600', color: '#64748b' },
  langTextActive: { color: '#ffffff' },
  menuScroll: { padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#1e293b', marginBottom: 12 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardInfo: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: 'bold', color: '#0f172a' },
  itemCategory: { fontSize: 12, color: '#94a3b8', marginVertical: 4 },
  itemPrice: { fontSize: 14, fontWeight: '700', color: '#b91c1c' },
  qtyContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnPrimary: {
    backgroundColor: '#b91c1c',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnTextPrimary: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
  btnSecondary: {
    backgroundColor: '#f1f5f9',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnTextSecondary: { color: '#334155', fontSize: 18, fontWeight: 'bold' },
  qtyText: { fontSize: 15, fontWeight: 'bold', color: '#0f172a' },
  cartBar: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    padding: 16,
  },
  shortfallNotice: {
    backgroundColor: '#fef3c7',
    padding: 8,
    borderRadius: 6,
    marginBottom: 10,
    alignItems: 'center',
  },
  shortfallText: { color: '#b45309', fontSize: 12, fontWeight: '600' },
  cartContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cartTotalLabel: { fontSize: 12, color: '#64748b' },
  cartTotalAmount: { fontSize: 18, fontWeight: 'bold', color: '#0f172a' },
  checkoutBtn: {
    backgroundColor: '#16a34a',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  checkoutBtnDisabled: { backgroundColor: '#94a3b8' },
  checkoutBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 15 },
});
