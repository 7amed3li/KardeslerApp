import type { ImageSourcePropType } from 'react-native';

export const BRAND_IMAGES = {
  logo: require('../../../assets/images/logo.webp') as ImageSourcePropType,
  heroBg: require('../../../assets/images/hero-bg.webp') as ImageSourcePropType,
} as const;

const DISH_BY_PATH: Record<string, ImageSourcePropType> = {
  '/images/10-Ezogelin-Mercimek-Corbasi.webp': require('../../../assets/images/10-Ezogelin-Mercimek-Corbasi.webp') as ImageSourcePropType,
  '/images/12-Mardin-Kebap.webp': require('../../../assets/images/12-Mardin-Kebap.webp') as ImageSourcePropType,
  '/images/13-Domatesli-Kebap.webp': require('../../../assets/images/13-Domatesli-Kebap.webp') as ImageSourcePropType,
  '/images/14-Patlicanli-Kebap.webp': require('../../../assets/images/14-Patlicanli-Kebap.webp') as ImageSourcePropType,
  '/images/16-Yogurtlu-Kebap.webp': require('../../../assets/images/16-Yogurtlu-Kebap.webp') as ImageSourcePropType,
  '/images/17-Vali-Kebabi.webp': require('../../../assets/images/17-Vali-Kebabi.webp') as ImageSourcePropType,
  '/images/18-Iskender-Kebap.webp': require('../../../assets/images/18-Iskender-Kebap.webp') as ImageSourcePropType,
  '/images/19-Kiremit-Kebap.webp': require('../../../assets/images/19-Kiremit-Kebap.webp') as ImageSourcePropType,
  '/images/20-Alti-Ezmeli-Kebap.webp': require('../../../assets/images/20-Alti-Ezmeli-Kebap.webp') as ImageSourcePropType,
  '/images/21-Ali-Nazik-Kebap.webp': require('../../../assets/images/21-Ali-Nazik-Kebap.webp') as ImageSourcePropType,
  '/images/22-Inegol-Kofte.webp': require('../../../assets/images/22-Inegol-Kofte.webp') as ImageSourcePropType,
  '/images/23-Kuzu-Lokum.webp': require('../../../assets/images/23-Kuzu-Lokum.webp') as ImageSourcePropType,
  '/images/24-Kuzu-Pirzola.webp': require('../../../assets/images/24-Kuzu-Pirzola.webp') as ImageSourcePropType,
  '/images/25-Dana-Bonfile.webp': require('../../../assets/images/25-Dana-Bonfile.webp') as ImageSourcePropType,
  '/images/26-Kuzu-Sis-Kebap.webp': require('../../../assets/images/26-Kuzu-Sis-Kebap.webp') as ImageSourcePropType,
  '/images/27-Karisik-Kebap_1.webp': require('../../../assets/images/27-Karisik-Kebap_1.webp') as ImageSourcePropType,
  '/images/28-Karisik-Kebap_2.webp': require('../../../assets/images/28-Karisik-Kebap_2.webp') as ImageSourcePropType,
  '/images/29-Dana-Cop-Sis.webp': require('../../../assets/images/29-Dana-Cop-Sis.webp') as ImageSourcePropType,
  '/images/3-Omlet.webp': require('../../../assets/images/3-Omlet.webp') as ImageSourcePropType,
  '/images/30-Tavuk-Kanat.webp': require('../../../assets/images/30-Tavuk-Kanat.webp') as ImageSourcePropType,
  '/images/31-Tavuk-Sis-Izgara.webp': require('../../../assets/images/31-Tavuk-Sis-Izgara.webp') as ImageSourcePropType,
  '/images/5-Sahanda-Yumurta.webp': require('../../../assets/images/5-Sahanda-Yumurta.webp') as ImageSourcePropType,
  '/images/6-Sucuklu-Yumurta.webp': require('../../../assets/images/6-Sucuklu-Yumurta.webp') as ImageSourcePropType,
  '/images/7-Kavurmali-Yumurta.webp': require('../../../assets/images/7-Kavurmali-Yumurta.webp') as ImageSourcePropType,
  '/images/9-Sehriyeli-Tavuk-Corbasi.webp': require('../../../assets/images/9-Sehriyeli-Tavuk-Corbasi.webp') as ImageSourcePropType,
  '/images/Serpme-Kahvalti-2-Kisilik.webp': require('../../../assets/images/Serpme-Kahvalti-2-Kisilik.webp') as ImageSourcePropType,
  '/images/adana.webp': require('../../../assets/images/adana.webp') as ImageSourcePropType,
  '/images/adana_kuzu_sis_kebap_v2.webp': require('../../../assets/images/adana_kuzu_sis_kebap_v2.webp') as ImageSourcePropType,
  '/images/adana_tavuk_sis_kebap_v2.webp': require('../../../assets/images/adana_tavuk_sis_kebap_v2.webp') as ImageSourcePropType,
  '/images/babagannush.webp': require('../../../assets/images/babagannush.webp') as ImageSourcePropType,
  '/images/beyaz_peynirli_pide.webp': require('../../../assets/images/beyaz_peynirli_pide.webp') as ImageSourcePropType,
  '/images/beyti-1024x677.webp': require('../../../assets/images/beyti-1024x677.webp') as ImageSourcePropType,
  '/images/cacik.webp': require('../../../assets/images/cacik.webp') as ImageSourcePropType,
  '/images/cig_kofte.webp': require('../../../assets/images/cig_kofte.webp') as ImageSourcePropType,
  '/images/coban_salata.webp': require('../../../assets/images/coban_salata.webp') as ImageSourcePropType,
  '/images/durum.webp': require('../../../assets/images/durum.webp') as ImageSourcePropType,
  '/images/elma_dilim_patates.webp': require('../../../assets/images/elma_dilim_patates.webp') as ImageSourcePropType,
  '/images/etli_etmek.webp': require('../../../assets/images/etli_etmek.webp') as ImageSourcePropType,
  '/images/etli_konya.webp': require('../../../assets/images/etli_konya.webp') as ImageSourcePropType,
  '/images/ezme_salata.webp': require('../../../assets/images/ezme_salata.webp') as ImageSourcePropType,
  '/images/gozleme_cesitleri.webp': require('../../../assets/images/gozleme_cesitleri.webp') as ImageSourcePropType,
  '/images/havuc_tarator.webp': require('../../../assets/images/havuc_tarator.webp') as ImageSourcePropType,
  '/images/humus.webp': require('../../../assets/images/humus.webp') as ImageSourcePropType,
  '/images/hunkarbegendi.webp': require('../../../assets/images/hunkarbegendi.webp') as ImageSourcePropType,
  '/images/icli_kofte.webp': require('../../../assets/images/icli_kofte.webp') as ImageSourcePropType,
  '/images/ispanakli_pide.webp': require('../../../assets/images/ispanakli_pide.webp') as ImageSourcePropType,
  '/images/karides_guvec.webp': require('../../../assets/images/karides_guvec.webp') as ImageSourcePropType,
  '/images/karisik_meze.webp': require('../../../assets/images/karisik_meze.webp') as ImageSourcePropType,
  '/images/kasarli_pide.webp': require('../../../assets/images/kasarli_pide.webp') as ImageSourcePropType,
  '/images/kasarli_sucuklu_pide.webp': require('../../../assets/images/kasarli_sucuklu_pide.webp') as ImageSourcePropType,
  '/images/kasarli_sucuklu_yumurtali_pide.webp': require('../../../assets/images/kasarli_sucuklu_yumurtali_pide.webp') as ImageSourcePropType,
  '/images/kasarli_yumurtali_pide.webp': require('../../../assets/images/kasarli_yumurtali_pide.webp') as ImageSourcePropType,
  '/images/kavurmali_kasarli_pide.webp': require('../../../assets/images/kavurmali_kasarli_pide.webp') as ImageSourcePropType,
  '/images/kavurmali_pide.webp': require('../../../assets/images/kavurmali_pide.webp') as ImageSourcePropType,
  '/images/kazandibi.webp': require('../../../assets/images/kazandibi.webp') as ImageSourcePropType,
  '/images/kiymali_kasarli_pide.webp': require('../../../assets/images/kiymali_kasarli_pide.webp') as ImageSourcePropType,
  '/images/kiymali_pide.webp': require('../../../assets/images/kiymali_pide.webp') as ImageSourcePropType,
  '/images/kizartmasi_patates.webp': require('../../../assets/images/kizartmasi_patates.webp') as ImageSourcePropType,
  '/images/kopoglu_white.webp': require('../../../assets/images/kopoglu_white.webp') as ImageSourcePropType,
  '/images/koz_biberli.webp': require('../../../assets/images/koz_biberli.webp') as ImageSourcePropType,
  '/images/kunefe.webp': require('../../../assets/images/kunefe.webp') as ImageSourcePropType,
  '/images/kuru_cacik.webp': require('../../../assets/images/kuru_cacik.webp') as ImageSourcePropType,
  '/images/kuru_dolma.webp': require('../../../assets/images/kuru_dolma.webp') as ImageSourcePropType,
  '/images/kusbasili_kasarli_pide.webp': require('../../../assets/images/kusbasili_kasarli_pide.webp') as ImageSourcePropType,
  '/images/kusbasili_pide.webp': require('../../../assets/images/kusbasili_pide.webp') as ImageSourcePropType,
  '/images/kuzu_ciger.webp': require('../../../assets/images/kuzu_ciger.webp') as ImageSourcePropType,
  '/images/kuzu_ciger_menu.webp': require('../../../assets/images/kuzu_ciger_menu.webp') as ImageSourcePropType,
  '/images/kuzu_sis_menu.webp': require('../../../assets/images/kuzu_sis_menu.webp') as ImageSourcePropType,
  '/images/kuzu_tavuk_sis_kebap_v2.webp': require('../../../assets/images/kuzu_tavuk_sis_kebap_v2.webp') as ImageSourcePropType,
  '/images/lahmacun.webp': require('../../../assets/images/lahmacun.webp') as ImageSourcePropType,
  '/images/mardin_menu.webp': require('../../../assets/images/mardin_menu.webp') as ImageSourcePropType,
  '/images/menemen.webp': require('../../../assets/images/menemen.webp') as ImageSourcePropType,
  '/images/menu/kuzu_ciger_v3.webp': require('../../../assets/images/menu/kuzu_ciger_v3.webp') as ImageSourcePropType,
  '/images/mevsim_salata.webp': require('../../../assets/images/mevsim_salata.webp') as ImageSourcePropType,
  '/images/mezeli_adana.webp': require('../../../assets/images/mezeli_adana.webp') as ImageSourcePropType,
  '/images/mezeli_bonfile.webp': require('../../../assets/images/mezeli_bonfile.webp') as ImageSourcePropType,
  '/images/mezeli_cop_sis.webp': require('../../../assets/images/mezeli_cop_sis.webp') as ImageSourcePropType,
  '/images/mezeli_durum.webp': require('../../../assets/images/mezeli_durum.webp') as ImageSourcePropType,
  '/images/mezeli_kofte.webp': require('../../../assets/images/mezeli_kofte.webp') as ImageSourcePropType,
  '/images/mezeli_kuzu_sis.webp': require('../../../assets/images/mezeli_kuzu_sis.webp') as ImageSourcePropType,
  '/images/mezeli_lokum.webp': require('../../../assets/images/mezeli_lokum.webp') as ImageSourcePropType,
  '/images/mezeli_pirzola.webp': require('../../../assets/images/mezeli_pirzola.webp') as ImageSourcePropType,
  '/images/mezeli_tavuk_kanat.webp': require('../../../assets/images/mezeli_tavuk_kanat.webp') as ImageSourcePropType,
  '/images/mezeli_tavuk_sis.webp': require('../../../assets/images/mezeli_tavuk_sis.webp') as ImageSourcePropType,
  '/images/mutebbel.webp': require('../../../assets/images/mutebbel.webp') as ImageSourcePropType,
  '/images/otlu_yogurt.webp': require('../../../assets/images/otlu_yogurt.webp') as ImageSourcePropType,
  '/images/ozel_lahmacun.webp': require('../../../assets/images/ozel_lahmacun.webp') as ImageSourcePropType,
  '/images/pastirmali_kavurmali_kasarli_pide.webp': require('../../../assets/images/pastirmali_kavurmali_kasarli_pide.webp') as ImageSourcePropType,
  '/images/pastirmali_yumurta.webp': require('../../../assets/images/pastirmali_yumurta.webp') as ImageSourcePropType,
  '/images/patatesli_pide.webp': require('../../../assets/images/patatesli_pide.webp') as ImageSourcePropType,
  '/images/peymacun.webp': require('../../../assets/images/peymacun.webp') as ImageSourcePropType,
  '/images/saksuka.webp': require('../../../assets/images/saksuka.webp') as ImageSourcePropType,
  '/images/sebzeli_pide.webp': require('../../../assets/images/sebzeli_pide.webp') as ImageSourcePropType,
  '/images/semiz_otu.webp': require('../../../assets/images/semiz_otu.webp') as ImageSourcePropType,
  '/images/sigara_boregi.webp': require('../../../assets/images/sigara_boregi.webp') as ImageSourcePropType,
  '/images/simitli_yumurta.webp': require('../../../assets/images/simitli_yumurta.webp') as ImageSourcePropType,
  '/images/sutlac.webp': require('../../../assets/images/sutlac.webp') as ImageSourcePropType,
  '/images/tavuk_kanat_menu.webp': require('../../../assets/images/tavuk_kanat_menu.webp') as ImageSourcePropType,
  '/images/tavuklu_pide.webp': require('../../../assets/images/tavuklu_pide.webp') as ImageSourcePropType,
  '/images/tavuklu_salata.webp': require('../../../assets/images/tavuklu_salata.webp') as ImageSourcePropType,
  '/images/ton_balikli_salata.webp': require('../../../assets/images/ton_balikli_salata.webp') as ImageSourcePropType,
  '/images/trilece.webp': require('../../../assets/images/trilece.webp') as ImageSourcePropType,
  '/images/vejetaryen_vegan_tabagi.webp': require('../../../assets/images/vejetaryen_vegan_tabagi.webp') as ImageSourcePropType,
  '/images/yogurt.webp': require('../../../assets/images/yogurt.webp') as ImageSourcePropType,
  '/images/yogurtlu_karamelize_sogan.webp': require('../../../assets/images/yogurtlu_karamelize_sogan.webp') as ImageSourcePropType,

  // Drinks
  '/images/drink-coca-cola.webp': require('../../../assets/images/drink-coca-cola.webp') as ImageSourcePropType,
  '/images/drink-fanta.webp': require('../../../assets/images/drink-fanta.webp') as ImageSourcePropType,
  '/images/drink-soda.webp': require('../../../assets/images/drink-soda.webp') as ImageSourcePropType,
  '/images/drink-su.webp': require('../../../assets/images/drink-su.webp') as ImageSourcePropType,
  '/images/ayran.webp': require('../../../assets/images/cacik.webp') as ImageSourcePropType,

  // Baseline .jpg Aliases
  '/images/adana.jpg': require('../../../assets/images/adana.webp') as ImageSourcePropType,
  '/images/urfa.jpg': require('../../../assets/images/adana.webp') as ImageSourcePropType,
  '/images/beyti.jpg': require('../../../assets/images/beyti-1024x677.webp') as ImageSourcePropType,
  '/images/copsisi.jpg': require('../../../assets/images/29-Dana-Cop-Sis.webp') as ImageSourcePropType,
  '/images/kuzu_ciger.jpg': require('../../../assets/images/kuzu_ciger.webp') as ImageSourcePropType,
  '/images/adana_durum.jpg': require('../../../assets/images/durum.webp') as ImageSourcePropType,
  '/images/urfa_durum.jpg': require('../../../assets/images/durum.webp') as ImageSourcePropType,
  '/images/tavuk_sis_durum.jpg': require('../../../assets/images/durum.webp') as ImageSourcePropType,
  '/images/lahmacun_item.jpg': require('../../../assets/images/lahmacun.webp') as ImageSourcePropType,
  '/images/kasarli_pide.jpg': require('../../../assets/images/kasarli_pide.webp') as ImageSourcePropType,
  '/images/kusbasili_kasarli_pide.jpg': require('../../../assets/images/kusbasili_kasarli_pide.webp') as ImageSourcePropType,
  '/images/serpme_kahvalti.jpg': require('../../../assets/images/Serpme-Kahvalti-2-Kisilik.webp') as ImageSourcePropType,
  '/images/menemen.jpg': require('../../../assets/images/menemen.webp') as ImageSourcePropType,
  '/images/coban_salata.jpg': require('../../../assets/images/coban_salata.webp') as ImageSourcePropType,
  '/images/kunefe.jpg': require('../../../assets/images/kunefe.webp') as ImageSourcePropType,
  '/images/ayran.jpg': require('../../../assets/images/cacik.webp') as ImageSourcePropType,
};

export function resolveOptionalDishImage(
  name: string,
  imageUrl?: string | null,
): ImageSourcePropType | null {
  if (imageUrl && DISH_BY_PATH[imageUrl]) return DISH_BY_PATH[imageUrl]!;

  const haystack = `${imageUrl ?? ''} ${name}`.toLocaleLowerCase('tr-TR');

  // Exact dish fallbacks by keywords
  if (haystack.includes('adana') || haystack.includes('urfa')) return DISH_BY_PATH['/images/adana.webp'] ?? null;
  if (haystack.includes('beyti')) return DISH_BY_PATH['/images/beyti-1024x677.webp'] ?? null;
  if (haystack.includes('peymacun')) return DISH_BY_PATH['/images/peymacun.webp'] ?? null;
  if (haystack.includes('lahmacun')) return DISH_BY_PATH['/images/lahmacun.webp'] ?? null;
  if (haystack.includes('durum') || haystack.includes('dürüm')) return DISH_BY_PATH['/images/durum.webp'] ?? null;
  if (haystack.includes('menemen')) return DISH_BY_PATH['/images/menemen.webp'] ?? null;
  if (haystack.includes('kahvalti') || haystack.includes('kahvaltı') || haystack.includes('serpme')) {
    return DISH_BY_PATH['/images/Serpme-Kahvalti-2-Kisilik.webp'] ?? null;
  }
  if (haystack.includes('omlet')) return DISH_BY_PATH['/images/3-Omlet.webp'] ?? null;
  if (haystack.includes('yumurta') || haystack.includes('sahanda')) return DISH_BY_PATH['/images/5-Sahanda-Yumurta.webp'] ?? null;
  if (haystack.includes('borek') || haystack.includes('börek')) return DISH_BY_PATH['/images/sigara_boregi.webp'] ?? null;
  if (haystack.includes('gozleme') || haystack.includes('gözleme')) return DISH_BY_PATH['/images/gozleme_cesitleri.webp'] ?? null;
  if (haystack.includes('humus')) return DISH_BY_PATH['/images/humus.webp'] ?? null;
  if (haystack.includes('coban') || haystack.includes('çoban') || haystack.includes('salata')) {
    return DISH_BY_PATH['/images/coban_salata.webp'] ?? null;
  }
  if (haystack.includes('kunefe') || haystack.includes('künefe')) return DISH_BY_PATH['/images/kunefe.webp'] ?? null;
  if (haystack.includes('sutlac') || haystack.includes('sütlaç')) return DISH_BY_PATH['/images/sutlac.webp'] ?? null;
  if (haystack.includes('kazandibi')) return DISH_BY_PATH['/images/kazandibi.webp'] ?? null;
  if (haystack.includes('trilece') || haystack.includes('triliçe')) return DISH_BY_PATH['/images/trilece.webp'] ?? null;
  if (haystack.includes('ciger') || haystack.includes('ciğer')) return DISH_BY_PATH['/images/kuzu_ciger.webp'] ?? null;
  if (haystack.includes('cop sis') || haystack.includes('çöp şiş')) return DISH_BY_PATH['/images/29-Dana-Cop-Sis.webp'] ?? null;
  if (haystack.includes('kanat')) return DISH_BY_PATH['/images/30-Tavuk-Kanat.webp'] ?? null;
  if (haystack.includes('pirzola')) return DISH_BY_PATH['/images/24-Kuzu-Pirzola.webp'] ?? null;
  if (haystack.includes('lokum')) return DISH_BY_PATH['/images/23-Kuzu-Lokum.webp'] ?? null;
  if (haystack.includes('bonfile')) return DISH_BY_PATH['/images/25-Dana-Bonfile.webp'] ?? null;
  if (haystack.includes('kofte') || haystack.includes('köfte')) return DISH_BY_PATH['/images/22-Inegol-Kofte.webp'] ?? null;
  if (haystack.includes('iskender')) return DISH_BY_PATH['/images/18-Iskender-Kebap.webp'] ?? null;
  if (haystack.includes('kiremit')) return DISH_BY_PATH['/images/19-Kiremit-Kebap.webp'] ?? null;
  if (haystack.includes('vali')) return DISH_BY_PATH['/images/17-Vali-Kebabi.webp'] ?? null;
  if (haystack.includes('ali nazik')) return DISH_BY_PATH['/images/21-Ali-Nazik-Kebap.webp'] ?? null;
  if (haystack.includes('mardin')) return DISH_BY_PATH['/images/12-Mardin-Kebap.webp'] ?? null;
  if (haystack.includes('patlican') || haystack.includes('patlıcan')) return DISH_BY_PATH['/images/14-Patlicanli-Kebap.webp'] ?? null;
  if (haystack.includes('karisik') || haystack.includes('karışık')) return DISH_BY_PATH['/images/27-Karisik-Kebap_1.webp'] ?? null;
  if (haystack.includes('icli kofte') || haystack.includes('içli köfte')) return DISH_BY_PATH['/images/icli_kofte.webp'] ?? null;
  if (haystack.includes('cig kofte') || haystack.includes('çiğ köfte')) return DISH_BY_PATH['/images/cig_kofte.webp'] ?? null;
  if (haystack.includes('corba') || haystack.includes('çorba') || haystack.includes('mercimek')) {
    return DISH_BY_PATH['/images/10-Ezogelin-Mercimek-Corbasi.webp'] ?? null;
  }
  if (haystack.includes('meze') || haystack.includes('tabagi') || haystack.includes('tabağı')) {
    return DISH_BY_PATH['/images/karisik_meze.webp'] ?? null;
  }
  if (haystack.includes('saksuka') || haystack.includes('şakşuka')) return DISH_BY_PATH['/images/saksuka.webp'] ?? null;
  if (haystack.includes('kopoglu') || haystack.includes('köpoğlu')) return DISH_BY_PATH['/images/kopoglu_white.webp'] ?? null;
  if (haystack.includes('tarator')) return DISH_BY_PATH['/images/havuc_tarator.webp'] ?? null;
  if (haystack.includes('cacik') || haystack.includes('cacık')) return DISH_BY_PATH['/images/cacik.webp'] ?? null;
  if (haystack.includes('patates')) return DISH_BY_PATH['/images/elma_dilim_patates.webp'] ?? null;
  if (haystack.includes('pide')) return DISH_BY_PATH['/images/kasarli_pide.webp'] ?? null;
  if (haystack.includes('kebap') || haystack.includes('sis') || haystack.includes('şiş')) {
    return DISH_BY_PATH['/images/adana.webp'] ?? null;
  }

  // Drinks Fallbacks
  if (haystack.includes('cola') || haystack.includes('kola')) return DISH_BY_PATH['/images/drink-coca-cola.webp'] ?? null;
  if (haystack.includes('fanta')) return DISH_BY_PATH['/images/drink-fanta.webp'] ?? null;
  if (haystack.includes('sprite') || haystack.includes('gazoz') || haystack.includes('camlica') || haystack.includes('çamlıca')) {
    return DISH_BY_PATH['/images/drink-soda.webp'] ?? null;
  }
  if (haystack.includes('soda') || haystack.includes('maden')) return DISH_BY_PATH['/images/drink-soda.webp'] ?? null;
  if (haystack.includes('su') || haystack.includes('water')) return DISH_BY_PATH['/images/drink-su.webp'] ?? null;
  if (haystack.includes('ayran')) return DISH_BY_PATH['/images/cacik.webp'] ?? null;
  if (
    haystack.includes('salgam') ||
    haystack.includes('şalgam') ||
    haystack.includes('ice tea') ||
    haystack.includes('meyve') ||
    haystack.includes('portakal') ||
    haystack.includes('nar') ||
    haystack.includes('limonata') ||
    haystack.includes('icecek') ||
    haystack.includes('içecek')
  ) {
    return DISH_BY_PATH['/images/drink-fanta.webp'] ?? null;
  }

  return BRAND_IMAGES.heroBg;
}

export function resolveDishImage(name: string, imageUrl?: string | null): ImageSourcePropType {
  return resolveOptionalDishImage(name, imageUrl) ?? BRAND_IMAGES.heroBg;
}
