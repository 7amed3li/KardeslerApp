import type { ImageSourcePropType } from 'react-native';

export const BRAND_IMAGES = {
  logo: require('../../../assets/images/logo.webp') as ImageSourcePropType,
  heroBg: require('../../../assets/images/hero-bg.webp') as ImageSourcePropType,
} as const;

const DISH_IMAGE_BY_KEY: Record<string, ImageSourcePropType> = {
  adana: require('../../../assets/images/adana.webp') as ImageSourcePropType,
  urfa: require('../../../assets/images/mezeli_adana.webp') as ImageSourcePropType,
  beyti: require('../../../assets/images/beyti-1024x677.webp') as ImageSourcePropType,
  iskender: require('../../../assets/images/18-Iskender-Kebap.webp') as ImageSourcePropType,
  alinazik: require('../../../assets/images/21-Ali-Nazik-Kebap.webp') as ImageSourcePropType,
  mardin: require('../../../assets/images/12-Mardin-Kebap.webp') as ImageSourcePropType,
  kuzu_sis: require('../../../assets/images/26-Kuzu-Sis-Kebap.webp') as ImageSourcePropType,
  tavuk_sis: require('../../../assets/images/31-Tavuk-Sis-Izgara.webp') as ImageSourcePropType,
  tavuk_kanat: require('../../../assets/images/30-Tavuk-Kanat.webp') as ImageSourcePropType,
  pirzola: require('../../../assets/images/24-Kuzu-Pirzola.webp') as ImageSourcePropType,
  lokum: require('../../../assets/images/23-Kuzu-Lokum.webp') as ImageSourcePropType,
  karisik_kebap: require('../../../assets/images/27-Karisik-Kebap_1.webp') as ImageSourcePropType,
  durum: require('../../../assets/images/durum.webp') as ImageSourcePropType,
  lahmacun: require('../../../assets/images/lahmacun.webp') as ImageSourcePropType,
  kiymali_pide: require('../../../assets/images/kiymali_pide.webp') as ImageSourcePropType,
  kasarli_pide: require('../../../assets/images/kasarli_pide.webp') as ImageSourcePropType,
  kusbasili_pide: require('../../../assets/images/kusbasili_pide.webp') as ImageSourcePropType,
  serpme_kahvalti: require('../../../assets/images/Serpme-Kahvalti-2-Kisilik.webp') as ImageSourcePropType,
  menemen: require('../../../assets/images/menemen.webp') as ImageSourcePropType,
  humus: require('../../../assets/images/humus.webp') as ImageSourcePropType,
  ezme: require('../../../assets/images/ezme_salata.webp') as ImageSourcePropType,
  coban_salata: require('../../../assets/images/coban_salata.webp') as ImageSourcePropType,
  icli_kofte: require('../../../assets/images/icli_kofte.webp') as ImageSourcePropType,
  cig_kofte: require('../../../assets/images/cig_kofte.webp') as ImageSourcePropType,
  kunefe: require('../../../assets/images/kunefe.webp') as ImageSourcePropType,
  sutlac: require('../../../assets/images/sutlac.webp') as ImageSourcePropType,
  trilece: require('../../../assets/images/trilece.webp') as ImageSourcePropType,
  kazandibi: require('../../../assets/images/kazandibi.webp') as ImageSourcePropType,
  ezogelin: require('../../../assets/images/10-Ezogelin-Mercimek-Corbasi.webp') as ImageSourcePropType,
};

export function resolveDishImage(name: string, imageUrl?: string | null): ImageSourcePropType {
  const haystack = `${imageUrl ?? ''} ${name}`.toLowerCase();
  if (haystack.includes('adana')) return DISH_IMAGE_BY_KEY.adana!;
  if (haystack.includes('urfa')) return DISH_IMAGE_BY_KEY.urfa!;
  if (haystack.includes('beyti')) return DISH_IMAGE_BY_KEY.beyti!;
  if (haystack.includes('iskender')) return DISH_IMAGE_BY_KEY.iskender!;
  if (haystack.includes('ali nazik') || haystack.includes('alinazik')) return DISH_IMAGE_BY_KEY.alinazik!;
  if (haystack.includes('mardin')) return DISH_IMAGE_BY_KEY.mardin!;
  if (haystack.includes('kuzu') && haystack.includes('şiş')) return DISH_IMAGE_BY_KEY.kuzu_sis!;
  if (haystack.includes('tavuk') && haystack.includes('şiş')) return DISH_IMAGE_BY_KEY.tavuk_sis!;
  if (haystack.includes('kanat')) return DISH_IMAGE_BY_KEY.tavuk_kanat!;
  if (haystack.includes('pirzola')) return DISH_IMAGE_BY_KEY.pirzola!;
  if (haystack.includes('lokum')) return DISH_IMAGE_BY_KEY.lokum!;
  if (haystack.includes('karışık') || haystack.includes('karisik')) return DISH_IMAGE_BY_KEY.karisik_kebap!;
  if (haystack.includes('dürüm') || haystack.includes('durum')) return DISH_IMAGE_BY_KEY.durum!;
  if (haystack.includes('lahmacun')) return DISH_IMAGE_BY_KEY.lahmacun!;
  if (haystack.includes('kıymalı') && haystack.includes('pide')) return DISH_IMAGE_BY_KEY.kiymali_pide!;
  if (haystack.includes('kaşarlı') && haystack.includes('pide')) return DISH_IMAGE_BY_KEY.kasarli_pide!;
  if (haystack.includes('kuşbaşılı') && haystack.includes('pide')) return DISH_IMAGE_BY_KEY.kusbasili_pide!;
  if (haystack.includes('pide')) return DISH_IMAGE_BY_KEY.kusbasili_pide!;
  if (haystack.includes('serpme') || haystack.includes('kahvaltı') || haystack.includes('kahvalti')) {
    return DISH_IMAGE_BY_KEY.serpme_kahvalti!;
  }
  if (haystack.includes('menemen')) return DISH_IMAGE_BY_KEY.menemen!;
  if (haystack.includes('humus')) return DISH_IMAGE_BY_KEY.humus!;
  if (haystack.includes('ezme')) return DISH_IMAGE_BY_KEY.ezme!;
  if (haystack.includes('çoban') || haystack.includes('coban')) return DISH_IMAGE_BY_KEY.coban_salata!;
  if (haystack.includes('içli') || haystack.includes('icli')) return DISH_IMAGE_BY_KEY.icli_kofte!;
  if (haystack.includes('çiğ') || haystack.includes('cig')) return DISH_IMAGE_BY_KEY.cig_kofte!;
  if (haystack.includes('künefe') || haystack.includes('kunefe')) return DISH_IMAGE_BY_KEY.kunefe!;
  if (haystack.includes('sütlaç') || haystack.includes('sutlac')) return DISH_IMAGE_BY_KEY.sutlac!;
  if (haystack.includes('trileçe') || haystack.includes('trilece')) return DISH_IMAGE_BY_KEY.trilece!;
  if (haystack.includes('kazandibi')) return DISH_IMAGE_BY_KEY.kazandibi!;
  if (haystack.includes('ezogelin') || haystack.includes('çorba') || haystack.includes('mercimek')) {
    return DISH_IMAGE_BY_KEY.ezogelin!;
  }
  return BRAND_IMAGES.heroBg;
}

