/**
 * Localization Tool (L10n)
 *
 * Handles translation management, locale formatting, and content adaptation
 * for different regions and cultures.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface LocaleData {
  locale: string;
  language: string;
  region?: string;
  translations: Record<string, string>;
  pluralRules?: PluralRule[];
  dateFormats?: DateFormats;
  numberFormats?: NumberFormats;
  currency?: CurrencyFormat;
}

export interface PluralRule {
  category: 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
  condition: string;
}

export interface DateFormats {
  short: string;
  medium: string;
  long: string;
  full: string;
}

export interface NumberFormats {
  decimal: string;
  thousand: string;
  precision?: number;
}

export interface CurrencyFormat {
  code: string;
  symbol: string;
  position: 'before' | 'after';
  spacing: boolean;
}

export interface TranslationStatus {
  locale: string;
  totalKeys: number;
  translatedKeys: number;
  missingKeys: string[];
  coveragePercent: number;
}

export interface L10nConfig {
  defaultLocale?: string;
  fallbackLocale?: string;
  supportedLocales?: string[];
  translationsDir?: string;
}

const DEFAULT_CONFIG: L10nConfig = {
  defaultLocale: 'en-US',
  fallbackLocale: 'en',
  supportedLocales: ['en-US', 'es-ES', 'fr-FR', 'de-DE', 'ja-JP', 'zh-CN'],
  translationsDir: './locales',
};

export class L10nTool {
  private config: L10nConfig;
  private locales: Map<string, LocaleData>;

  constructor(config: Partial<L10nConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.locales = new Map();
  }

  /**
   * Load locale data from file
   */
  async loadLocale(locale: string, filePath?: string): Promise<LocaleData> {
    const targetPath = filePath || path.join(
      this.config.translationsDir!,
      `${locale}.json`
    );

    try {
      const content = await fs.readFile(targetPath, 'utf-8');
      const data = JSON.parse(content);

      const localeData: LocaleData = {
        locale,
        language: locale.split('-')[0],
        region: locale.split('-')[1],
        translations: data.translations || data,
        pluralRules: data.pluralRules || this.getDefaultPluralRules(locale),
        dateFormats: data.dateFormats || this.getDefaultDateFormats(locale),
        numberFormats: data.numberFormats || this.getDefaultNumberFormats(locale),
        currency: data.currency,
      };

      this.locales.set(locale, localeData);
      return localeData;
    } catch (error) {
      throw new Error(`Failed to load locale ${locale}: ${error}`);
    }
  }

  /**
   * Save locale data to file
   */
  async saveLocale(locale: string, filePath?: string): Promise<void> {
    const localeData = this.locales.get(locale);
    if (!localeData) {
      throw new Error(`Locale ${locale} not loaded`);
    }

    const targetPath = filePath || path.join(
      this.config.translationsDir!,
      `${locale}.json`
    );

    await fs.writeFile(targetPath, JSON.stringify(localeData, null, 2));
  }

  /**
   * Translate a key for a given locale
   */
  translate(key: string, locale: string, variables?: Record<string, any>): string {
    let localeData = this.locales.get(locale);

    // Try fallback locale if not found
    if (!localeData) {
      localeData = this.locales.get(this.config.fallbackLocale!);
    }

    if (!localeData) {
      return key; // Return key if no locale loaded
    }

    let translation = localeData.translations[key];

    if (!translation) {
      return key; // Return key if translation not found
    }

    // Replace variables
    if (variables) {
      translation = this.replaceVariables(translation, variables);
    }

    return translation;
  }

  /**
   * Replace variables in translation string
   */
  private replaceVariables(text: string, variables: Record<string, any>): string {
    let result = text;

    for (const [key, value] of Object.entries(variables)) {
      // Support both {{key}} and {key} formats
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
    }

    return result;
  }

  /**
   * Handle plural translations
   */
  translatePlural(
    key: string,
    count: number,
    locale: string,
    variables?: Record<string, any>
  ): string {
    const localeData = this.locales.get(locale);
    if (!localeData) {
      return key;
    }

    // Determine plural category
    const category = this.getPluralCategory(count, localeData.pluralRules || []);

    // Try to find translation for this category
    const pluralKey = `${key}.${category}`;
    let translation = localeData.translations[pluralKey];

    // Fallback to base key
    if (!translation) {
      translation = localeData.translations[key];
    }

    if (!translation) {
      return key;
    }

    // Add count to variables
    const allVars = { ...variables, count };

    return this.replaceVariables(translation, allVars);
  }

  /**
   * Get plural category for count
   */
  private getPluralCategory(count: number, rules: PluralRule[]): string {
    for (const rule of rules) {
      if (this.evaluatePluralCondition(count, rule.condition)) {
        return rule.category;
      }
    }

    return 'other';
  }

  /**
   * Evaluate plural condition
   */
  private evaluatePluralCondition(count: number, condition: string): boolean {
    // Simple evaluation for common conditions
    if (condition === 'n == 0') return count === 0;
    if (condition === 'n == 1') return count === 1;
    if (condition === 'n == 2') return count === 2;
    if (condition === 'n > 1') return count > 1;
    if (condition === 'n >= 2') return count >= 2;

    // More complex: n % 10
    const mod10 = count % 10;
    const mod100 = count % 100;

    if (condition.includes('n % 10')) {
      if (condition === 'n % 10 == 1 && n % 100 != 11') {
        return mod10 === 1 && mod100 !== 11;
      }
      if (condition === 'n % 10 >= 2 && n % 10 <= 4') {
        return mod10 >= 2 && mod10 <= 4;
      }
    }

    return false;
  }

  /**
   * Format date for locale
   */
  formatDate(date: Date, locale: string, format: 'short' | 'medium' | 'long' | 'full' = 'medium'): string {
    const localeData = this.locales.get(locale);

    if (!localeData?.dateFormats) {
      // Use Intl.DateTimeFormat as fallback
      return new Intl.DateTimeFormat(locale).format(date);
    }

    const formatString = localeData.dateFormats[format];

    // Simple date formatting
    return formatString
      .replace('YYYY', date.getFullYear().toString())
      .replace('MM', String(date.getMonth() + 1).padStart(2, '0'))
      .replace('DD', String(date.getDate()).padStart(2, '0'))
      .replace('HH', String(date.getHours()).padStart(2, '0'))
      .replace('mm', String(date.getMinutes()).padStart(2, '0'))
      .replace('ss', String(date.getSeconds()).padStart(2, '0'));
  }

  /**
   * Format number for locale
   */
  formatNumber(num: number, locale: string): string {
    const localeData = this.locales.get(locale);

    if (!localeData?.numberFormats) {
      // Use Intl.NumberFormat as fallback
      return new Intl.NumberFormat(locale).format(num);
    }

    const { decimal, thousand, precision } = localeData.numberFormats;

    // Round to precision
    let rounded = num;
    if (precision !== undefined) {
      rounded = Number(num.toFixed(precision));
    }

    // Convert to string and split
    const parts = rounded.toString().split('.');
    const intPart = parts[0];
    const decPart = parts[1] || '';

    // Add thousand separators
    const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousand);

    // Combine with decimal
    return decPart ? `${withThousands}${decimal}${decPart}` : withThousands;
  }

  /**
   * Format currency for locale
   */
  formatCurrency(amount: number, locale: string): string {
    const localeData = this.locales.get(locale);

    if (!localeData?.currency) {
      // Use Intl.NumberFormat as fallback
      return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(amount);
    }

    const { symbol, position, spacing } = localeData.currency;
    const formatted = this.formatNumber(amount, locale);
    const space = spacing ? ' ' : '';

    return position === 'before'
      ? `${symbol}${space}${formatted}`
      : `${formatted}${space}${symbol}`;
  }

  /**
   * Check translation coverage for a locale
   */
  checkCoverage(locale: string, referenceLocale?: string): TranslationStatus {
    const localeData = this.locales.get(locale);
    const refData = referenceLocale
      ? this.locales.get(referenceLocale)
      : this.locales.get(this.config.defaultLocale!);

    if (!localeData || !refData) {
      throw new Error(`Locale ${locale} or reference locale not loaded`);
    }

    const referenceKeys = Object.keys(refData.translations);
    const translatedKeys = Object.keys(localeData.translations);
    const missingKeys = referenceKeys.filter(key => !translatedKeys.includes(key));

    const coverage = ((translatedKeys.length / referenceKeys.length) * 100);

    return {
      locale,
      totalKeys: referenceKeys.length,
      translatedKeys: translatedKeys.length,
      missingKeys,
      coveragePercent: Math.round(coverage * 100) / 100,
    };
  }

  /**
   * Merge translations from another locale
   */
  mergeTranslations(targetLocale: string, sourceLocale: string, overwrite: boolean = false): void {
    const target = this.locales.get(targetLocale);
    const source = this.locales.get(sourceLocale);

    if (!target || !source) {
      throw new Error('Both locales must be loaded');
    }

    for (const [key, value] of Object.entries(source.translations)) {
      if (overwrite || !target.translations[key]) {
        target.translations[key] = value;
      }
    }
  }

  /**
   * Export translations to different formats
   */
  exportToFormat(locale: string, format: 'json' | 'csv' | 'po' | 'xliff'): string {
    const localeData = this.locales.get(locale);
    if (!localeData) {
      throw new Error(`Locale ${locale} not loaded`);
    }

    switch (format) {
      case 'json':
        return JSON.stringify(localeData.translations, null, 2);

      case 'csv':
        return this.exportToCSV(localeData.translations);

      case 'po':
        return this.exportToPO(locale, localeData.translations);

      case 'xliff':
        return this.exportToXLIFF(locale, localeData.translations);

      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Export to CSV
   */
  private exportToCSV(translations: Record<string, string>): string {
    let csv = 'key,value\n';

    for (const [key, value] of Object.entries(translations)) {
      const escapedValue = value.replace(/"/g, '""');
      csv += `"${key}","${escapedValue}"\n`;
    }

    return csv;
  }

  /**
   * Export to PO (gettext)
   */
  private exportToPO(locale: string, translations: Record<string, string>): string {
    let po = `# Translation file for ${locale}\n`;
    po += `# Generated on ${new Date().toISOString()}\n\n`;

    for (const [key, value] of Object.entries(translations)) {
      po += `msgid "${key}"\n`;
      po += `msgstr "${value}"\n\n`;
    }

    return po;
  }

  /**
   * Export to XLIFF
   */
  private exportToXLIFF(locale: string, translations: Record<string, string>): string {
    let xliff = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xliff += '<xliff version="1.2">\n';
    xliff += `  <file source-language="en" target-language="${locale}" datatype="plaintext">\n`;
    xliff += '    <body>\n';

    for (const [key, value] of Object.entries(translations)) {
      xliff += `      <trans-unit id="${key}">\n`;
      xliff += `        <source>${this.escapeXML(key)}</source>\n`;
      xliff += `        <target>${this.escapeXML(value)}</target>\n`;
      xliff += '      </trans-unit>\n';
    }

    xliff += '    </body>\n';
    xliff += '  </file>\n';
    xliff += '</xliff>\n';

    return xliff;
  }

  /**
   * Escape XML special characters
   */
  private escapeXML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Get default plural rules for common languages
   */
  private getDefaultPluralRules(locale: string): PluralRule[] {
    const lang = locale.split('-')[0];

    const commonRules: Record<string, PluralRule[]> = {
      en: [
        { category: 'one', condition: 'n == 1' },
        { category: 'other', condition: 'n != 1' },
      ],
      fr: [
        { category: 'one', condition: 'n <= 1' },
        { category: 'other', condition: 'n > 1' },
      ],
      ru: [
        { category: 'one', condition: 'n % 10 == 1 && n % 100 != 11' },
        { category: 'few', condition: 'n % 10 >= 2 && n % 10 <= 4' },
        { category: 'other', condition: 'true' },
      ],
      ar: [
        { category: 'zero', condition: 'n == 0' },
        { category: 'one', condition: 'n == 1' },
        { category: 'two', condition: 'n == 2' },
        { category: 'few', condition: 'n >= 3 && n <= 10' },
        { category: 'many', condition: 'n >= 11 && n <= 99' },
        { category: 'other', condition: 'n >= 100' },
      ],
    };

    return commonRules[lang] || commonRules.en;
  }

  /**
   * Get default date formats
   */
  private getDefaultDateFormats(locale: string): DateFormats {
    return {
      short: 'MM/DD/YYYY',
      medium: 'MMM DD, YYYY',
      long: 'MMMM DD, YYYY',
      full: 'dddd, MMMM DD, YYYY',
    };
  }

  /**
   * Get default number formats
   */
  private getDefaultNumberFormats(locale: string): NumberFormats {
    const lang = locale.split('-')[0];

    const formats: Record<string, NumberFormats> = {
      en: { decimal: '.', thousand: ',', precision: 2 },
      de: { decimal: ',', thousand: '.', precision: 2 },
      fr: { decimal: ',', thousand: ' ', precision: 2 },
    };

    return formats[lang] || formats.en;
  }
}
