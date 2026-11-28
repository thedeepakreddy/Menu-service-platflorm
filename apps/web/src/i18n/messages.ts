/**
 * Platform UI string catalogue (Phase 3; D-040 O-2, Doc 03 §15).
 *
 * `en` is the source and the platform default/fallback; `hu` is typed as `Messages`, so the
 * compiler refuses a missing or extra key: there is no silent fallback to untranslated strings.
 * These are platform interface strings only. Tenant content (menus, offers, business details) is
 * not translated here; it arrives with its own reviewed localization workflow (Phases 5–6).
 *
 * Strings never interpolate tenant names into sentences: Hungarian attaches suffixes and articles
 * to names, so a name is always shown on its own.
 */
export const SUPPORTED_LOCALES = ['en', 'hu'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/** Text direction per locale (no right-to-left locale at launch, O-2). */
export const LOCALE_DIRECTION: Record<Locale, 'ltr' | 'rtl'> = { en: 'ltr', hu: 'ltr' };

const en = {
  platform: {
    name: 'Hospitality Experience Platform',
    intro:
      'This platform hosts the digital home of hospitality venues. To visit one, open its link or scan its QR code.',
  },
  skipToContent: 'Skip to content',
  nav: {
    label: 'Main',
    home: 'Home',
    menu: 'Menu',
    offers: 'Offers',
    info: 'Info',
  },
  home: {
    eyebrow: 'Welcome',
    intro:
      'The menu, offers and venue details will appear here as soon as the venue publishes them.',
    exploreHeading: 'Explore',
    menuHint: 'Dishes and drinks',
    offersHint: 'Current promotions',
    infoHint: 'Hours, location and contact',
  },
  empty: {
    menuTitle: 'The menu is on its way',
    menuBody:
      'This venue hasn’t published a menu here yet. Please ask a member of staff about today’s selection.',
    offersTitle: 'No offers right now',
    offersBody: 'There are no published offers at the moment. Please check back another time.',
    infoTitle: 'Venue details coming soon',
    infoBody:
      'Opening hours, location and contact details haven’t been published here yet. Please ask a member of staff.',
    backHome: 'Back to home',
  },
  notFound: {
    title: 'This page isn’t available',
    body: 'The address may be mistyped, or the venue may no longer use this page. Check the address, or scan the venue’s QR code again.',
  },
  error: {
    title: 'Something went wrong',
    body: 'We couldn’t load this page just now. Please try again in a moment.',
    retry: 'Try again',
  },
  loading: 'Loading…',
  locale: {
    label: 'Language',
    change: 'Change language',
    names: { en: 'English', hu: 'Magyar' },
  },
};

export type Messages = typeof en;

const hu: Messages = {
  platform: {
    name: 'Vendéglátós élményplatform',
    intro:
      'Ez a platform vendéglátóhelyek digitális otthona. Egy hely meglátogatásához nyissa meg a linkjét, vagy olvassa be a QR-kódját.',
  },
  skipToContent: 'Ugrás a tartalomhoz',
  nav: {
    label: 'Fő navigáció',
    home: 'Kezdőlap',
    menu: 'Étlap',
    offers: 'Ajánlatok',
    info: 'Infó',
  },
  home: {
    eyebrow: 'Üdvözöljük',
    intro:
      'Az étlap, az ajánlatok és a hely adatai itt jelennek meg, amint a hely közzéteszi őket.',
    exploreHeading: 'Fedezze fel',
    menuHint: 'Ételek és italok',
    offersHint: 'Aktuális ajánlatok',
    infoHint: 'Nyitvatartás, helyszín és elérhetőség',
  },
  empty: {
    menuTitle: 'Az étlap hamarosan érkezik',
    menuBody: 'Ez a hely még nem tett közzé itt étlapot. A mai kínálatról kérdezze a személyzetet.',
    offersTitle: 'Jelenleg nincs ajánlat',
    offersBody: 'Jelenleg nincs közzétett ajánlat. Kérjük, nézzen vissza később.',
    infoTitle: 'A hely adatai hamarosan elérhetők',
    infoBody:
      'A nyitvatartás, a helyszín és az elérhetőség még nem került ide. Kérjük, érdeklődjön a személyzetnél.',
    backHome: 'Vissza a kezdőlapra',
  },
  notFound: {
    title: 'Ez az oldal nem érhető el',
    body: 'Lehet, hogy a cím elírás, vagy a hely már nem használja ezt az oldalt. Ellenőrizze a címet, vagy olvassa be újra a hely QR-kódját.',
  },
  error: {
    title: 'Valami hiba történt',
    body: 'Az oldalt most nem sikerült betölteni. Kérjük, próbálja újra egy kis idő múlva.',
    retry: 'Újrapróbálás',
  },
  loading: 'Betöltés…',
  locale: {
    label: 'Nyelv',
    change: 'Nyelv módosítása',
    names: { en: 'English', hu: 'Magyar' },
  },
};

export const MESSAGES: Record<Locale, Messages> = { en, hu };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
