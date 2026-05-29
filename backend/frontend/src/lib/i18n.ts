/**
 * src/lib/i18n.ts
 *
 * Lightweight i18n for AdhanNow.
 * - Translations for all UI strings
 * - RTL detection
 * - Hijri date formatting (using built-in Intl — no library needed)
 *
 * Usage:
 *   import { t, isRTL, toHijri } from '../lib/i18n';
 *   const lang = localStorage.getItem('adhan_language') || 'en';
 *   t(lang, 'dashboard.nextPrayer')  // → "Next Prayer" or "الصلاة القادمة"
 */

export type SupportedLang = 'en' | 'ar' | 'fr' | 'de' | 'ur' | 'tr' | 'es' | 'id';

// ─── RTL languages ────────────────────────────────────────────────────────────

const RTL_LANGS: SupportedLang[] = ['ar', 'ur'];

export function isRTL(lang: string): boolean {
  return RTL_LANGS.includes(lang as SupportedLang);
}

/**
 * Apply RTL/LTR direction to document root.
 * Call this whenever language changes.
 */
export function applyDocumentDirection(lang: string): void {
  document.documentElement.setAttribute('lang', lang);
  document.documentElement.setAttribute('dir', isRTL(lang) ? 'rtl' : 'ltr');
}

// ─── Hijri date ───────────────────────────────────────────────────────────────

/**
 * Returns a formatted Hijri date string using the built-in Intl API.
 * Works in all modern browsers and Node 18+. No library needed.
 *
 * @param date  Gregorian date (defaults to today)
 * @param lang  Language for the output string
 * @returns     e.g. "١٤ ذو الحجة ١٤٤٦" (Arabic) or "14 Dhul Hijjah 1446" (English)
 */
export function toHijri(date: Date = new Date(), lang = 'en'): string {
  try {
    const locale = lang === 'ar' ? 'ar-SA-u-ca-islamic-umalqura' : `${lang}-u-ca-islamic-umalqura`;
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch {
    // Fallback for environments that don't support islamic-umalqura
    try {
      return new Intl.DateTimeFormat('en-u-ca-islamic', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(date);
    } catch {
      return '';
    }
  }
}

/**
 * Returns both Gregorian and Hijri date strings for display.
 */
export function getDualDate(date: Date = new Date(), lang = 'en'): {
  gregorian: string;
  hijri: string;
} {
  const gregorian = new Intl.DateTimeFormat(lang, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);

  const hijri = toHijri(date, lang);

  return { gregorian, hijri };
}

// ─── Prayer name translations ─────────────────────────────────────────────────

const PRAYER_NAMES: Record<SupportedLang, Record<string, string>> = {
  en: { fajr: 'Fajr',  sunrise: 'Sunrise', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' },
  ar: { fajr: 'الفجر', sunrise: 'الشروق',  dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' },
  fr: { fajr: 'Fajr',  sunrise: 'Lever',   dhuhr: 'Dhouhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Icha' },
  de: { fajr: 'Fadschr', sunrise: 'Sonnenaufgang', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Ischa' },
  ur: { fajr: 'فجر',   sunrise: 'طلوع آفتاب', dhuhr: 'ظہر', asr: 'عصر', maghrib: 'مغرب', isha: 'عشاء' },
  tr: { fajr: 'İmsak', sunrise: 'Güneş',   dhuhr: 'Öğle', asr: 'İkindi', maghrib: 'Akşam', isha: 'Yatsı' },
  es: { fajr: 'Fajr',  sunrise: 'Amanecer', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Magrib', isha: 'Isha' },
  id: { fajr: 'Subuh', sunrise: 'Terbit',  dhuhr: 'Dzuhur', asr: 'Ashar', maghrib: 'Maghrib', isha: 'Isya' },
};

export function prayerName(lang: string, prayer: string): string {
  const map = PRAYER_NAMES[lang as SupportedLang] ?? PRAYER_NAMES.en;
  return map[prayer] ?? prayer;
}

// ─── UI translations ──────────────────────────────────────────────────────────

type TranslationKeys = {
  // Dashboard
  'dashboard.nextPrayer': string;
  'dashboard.today': string;
  'dashboard.automationActive': string;
  'dashboard.automationPaused': string;
  'dashboard.pauseAutomation': string;
  'dashboard.resumeAutomation': string;
  'dashboard.devices': string;
  'dashboard.prayerTimes': string;
  // Navigation
  'nav.dashboard': string;
  'nav.calendar': string;
  'nav.mosque': string;
  'nav.quran': string;
  'nav.qiblah': string;
  'nav.alexa': string;
  'nav.settings': string;
  // Settings
  'settings.save': string;
  'settings.saving': string;
  'settings.language': string;
  // General
  'general.loading': string;
  'general.error': string;
  'general.save': string;
  'general.cancel': string;
  'general.continue': string;
};

const TRANSLATIONS: Record<SupportedLang, TranslationKeys> = {
  en: {
    'dashboard.nextPrayer':       'Next Prayer',
    'dashboard.today':            'Today',
    'dashboard.automationActive': 'Automation Active',
    'dashboard.automationPaused': 'Automation Paused',
    'dashboard.pauseAutomation':  'Pause Automation',
    'dashboard.resumeAutomation': 'Resume Automation',
    'dashboard.devices':          'Devices',
    'dashboard.prayerTimes':      "Today's Prayer Times",
    'nav.dashboard':  'Dashboard',
    'nav.calendar':   'Calendar',
    'nav.mosque':     'Mosque',
    'nav.quran':      'Dua & Quran',
    'nav.qiblah':     'Qiblah',
    'nav.alexa':      'Alexa Setup',
    'nav.settings':   'Settings',
    'settings.save':     'Save all settings',
    'settings.saving':   'Saving settings…',
    'settings.language': 'App & Alexa language',
    'general.loading':  'Loading…',
    'general.error':    'An error occurred',
    'general.save':     'Save',
    'general.cancel':   'Cancel',
    'general.continue': 'Continue',
  },
  ar: {
    'dashboard.nextPrayer':       'الصلاة القادمة',
    'dashboard.today':            'اليوم',
    'dashboard.automationActive': 'الأذان التلقائي نشط',
    'dashboard.automationPaused': 'الأذان التلقائي متوقف',
    'dashboard.pauseAutomation':  'إيقاف الأذان التلقائي',
    'dashboard.resumeAutomation': 'تشغيل الأذان التلقائي',
    'dashboard.devices':          'الأجهزة',
    'dashboard.prayerTimes':      'مواقيت الصلاة اليوم',
    'nav.dashboard':  'الرئيسية',
    'nav.calendar':   'التقويم',
    'nav.mosque':     'المسجد',
    'nav.quran':      'الأدعية والقرآن',
    'nav.qiblah':     'القبلة',
    'nav.alexa':      'إعداد أليكسا',
    'nav.settings':   'الإعدادات',
    'settings.save':     'حفظ الإعدادات',
    'settings.saving':   'جارٍ الحفظ…',
    'settings.language': 'اللغة',
    'general.loading':  'جارٍ التحميل…',
    'general.error':    'حدث خطأ',
    'general.save':     'حفظ',
    'general.cancel':   'إلغاء',
    'general.continue': 'متابعة',
  },
  fr: {
    'dashboard.nextPrayer':       'Prochaine prière',
    'dashboard.today':            'Aujourd\'hui',
    'dashboard.automationActive': 'Automatisation active',
    'dashboard.automationPaused': 'Automatisation en pause',
    'dashboard.pauseAutomation':  'Mettre en pause',
    'dashboard.resumeAutomation': 'Reprendre',
    'dashboard.devices':          'Appareils',
    'dashboard.prayerTimes':      'Horaires de prière aujourd\'hui',
    'nav.dashboard':  'Tableau de bord',
    'nav.calendar':   'Calendrier',
    'nav.mosque':     'Mosquée',
    'nav.quran':      'Dou\'a & Coran',
    'nav.qiblah':     'Qibla',
    'nav.alexa':      'Configuration Alexa',
    'nav.settings':   'Paramètres',
    'settings.save':     'Enregistrer',
    'settings.saving':   'Enregistrement…',
    'settings.language': 'Langue',
    'general.loading':  'Chargement…',
    'general.error':    'Une erreur s\'est produite',
    'general.save':     'Enregistrer',
    'general.cancel':   'Annuler',
    'general.continue': 'Continuer',
  },
  de: {
    'dashboard.nextPrayer':       'Nächstes Gebet',
    'dashboard.today':            'Heute',
    'dashboard.automationActive': 'Automatisierung aktiv',
    'dashboard.automationPaused': 'Automatisierung pausiert',
    'dashboard.pauseAutomation':  'Automatisierung pausieren',
    'dashboard.resumeAutomation': 'Automatisierung fortsetzen',
    'dashboard.devices':          'Geräte',
    'dashboard.prayerTimes':      'Gebetszeiten heute',
    'nav.dashboard':  'Dashboard',
    'nav.calendar':   'Kalender',
    'nav.mosque':     'Moschee',
    'nav.quran':      'Dua & Koran',
    'nav.qiblah':     'Qibla',
    'nav.alexa':      'Alexa-Einrichtung',
    'nav.settings':   'Einstellungen',
    'settings.save':     'Einstellungen speichern',
    'settings.saving':   'Wird gespeichert…',
    'settings.language': 'Sprache',
    'general.loading':  'Laden…',
    'general.error':    'Ein Fehler ist aufgetreten',
    'general.save':     'Speichern',
    'general.cancel':   'Abbrechen',
    'general.continue': 'Weiter',
  },
  ur: {
    'dashboard.nextPrayer':       'اگلی نماز',
    'dashboard.today':            'آج',
    'dashboard.automationActive': 'خودکار اذان فعال',
    'dashboard.automationPaused': 'خودکار اذان موقوف',
    'dashboard.pauseAutomation':  'اذان روکیں',
    'dashboard.resumeAutomation': 'اذان شروع کریں',
    'dashboard.devices':          'آلات',
    'dashboard.prayerTimes':      'آج کے اوقات نماز',
    'nav.dashboard':  'ڈیش بورڈ',
    'nav.calendar':   'کیلنڈر',
    'nav.mosque':     'مسجد',
    'nav.quran':      'دعا اور قرآن',
    'nav.qiblah':     'قبلہ',
    'nav.alexa':      'الیکسا سیٹ اپ',
    'nav.settings':   'ترتیبات',
    'settings.save':     'تمام ترتیبات محفوظ کریں',
    'settings.saving':   'محفوظ ہو رہا ہے…',
    'settings.language': 'زبان',
    'general.loading':  'لوڈ ہو رہا ہے…',
    'general.error':    'ایک خرابی پیش آئی',
    'general.save':     'محفوظ کریں',
    'general.cancel':   'منسوخ کریں',
    'general.continue': 'جاری رکھیں',
  },
  tr: {
    'dashboard.nextPrayer':       'Sonraki Namaz',
    'dashboard.today':            'Bugün',
    'dashboard.automationActive': 'Otomasyon Aktif',
    'dashboard.automationPaused': 'Otomasyon Duraklatıldı',
    'dashboard.pauseAutomation':  'Otomasyonu Duraklat',
    'dashboard.resumeAutomation': 'Otomasyonu Sürdür',
    'dashboard.devices':          'Cihazlar',
    'dashboard.prayerTimes':      'Bugünün Namaz Vakitleri',
    'nav.dashboard':  'Ana Sayfa',
    'nav.calendar':   'Takvim',
    'nav.mosque':     'Cami',
    'nav.quran':      'Dua ve Kuran',
    'nav.qiblah':     'Kıble',
    'nav.alexa':      'Alexa Kurulumu',
    'nav.settings':   'Ayarlar',
    'settings.save':     'Tüm ayarları kaydet',
    'settings.saving':   'Kaydediliyor…',
    'settings.language': 'Dil',
    'general.loading':  'Yükleniyor…',
    'general.error':    'Bir hata oluştu',
    'general.save':     'Kaydet',
    'general.cancel':   'İptal',
    'general.continue': 'Devam',
  },
  es: {
    'dashboard.nextPrayer':       'Próxima oración',
    'dashboard.today':            'Hoy',
    'dashboard.automationActive': 'Automatización activa',
    'dashboard.automationPaused': 'Automatización pausada',
    'dashboard.pauseAutomation':  'Pausar automatización',
    'dashboard.resumeAutomation': 'Reanudar automatización',
    'dashboard.devices':          'Dispositivos',
    'dashboard.prayerTimes':      'Horarios de oración hoy',
    'nav.dashboard':  'Panel',
    'nav.calendar':   'Calendario',
    'nav.mosque':     'Mezquita',
    'nav.quran':      'Dua y Corán',
    'nav.qiblah':     'Qibla',
    'nav.alexa':      'Configurar Alexa',
    'nav.settings':   'Ajustes',
    'settings.save':     'Guardar ajustes',
    'settings.saving':   'Guardando…',
    'settings.language': 'Idioma',
    'general.loading':  'Cargando…',
    'general.error':    'Ha ocurrido un error',
    'general.save':     'Guardar',
    'general.cancel':   'Cancelar',
    'general.continue': 'Continuar',
  },
  id: {
    'dashboard.nextPrayer':       'Sholat Berikutnya',
    'dashboard.today':            'Hari Ini',
    'dashboard.automationActive': 'Otomasi Aktif',
    'dashboard.automationPaused': 'Otomasi Dijeda',
    'dashboard.pauseAutomation':  'Jeda Otomasi',
    'dashboard.resumeAutomation': 'Lanjutkan Otomasi',
    'dashboard.devices':          'Perangkat',
    'dashboard.prayerTimes':      'Jadwal Sholat Hari Ini',
    'nav.dashboard':  'Beranda',
    'nav.calendar':   'Kalender',
    'nav.mosque':     'Masjid',
    'nav.quran':      'Doa & Quran',
    'nav.qiblah':     'Kiblat',
    'nav.alexa':      'Pengaturan Alexa',
    'nav.settings':   'Pengaturan',
    'settings.save':     'Simpan semua pengaturan',
    'settings.saving':   'Menyimpan…',
    'settings.language': 'Bahasa',
    'general.loading':  'Memuat…',
    'general.error':    'Terjadi kesalahan',
    'general.save':     'Simpan',
    'general.cancel':   'Batal',
    'general.continue': 'Lanjutkan',
  },
};

/**
 * Translate a key.
 * @param lang  Language code (e.g. 'ar', 'fr')
 * @param key   Translation key
 * @returns     Translated string, falls back to English
 */
export function t(lang: string, key: keyof TranslationKeys): string {
  const map = TRANSLATIONS[lang as SupportedLang] ?? TRANSLATIONS.en;
  return map[key] ?? TRANSLATIONS.en[key] ?? key;
}

/**
 * Get current language from localStorage.
 */
export function getCurrentLang(): string {
  return localStorage.getItem('adhan_language') || 'en';
}

/**
 * Persist language + apply document direction.
 */
export function setLanguage(lang: string): void {
  localStorage.setItem('adhan_language', lang);
  applyDocumentDirection(lang);
}
