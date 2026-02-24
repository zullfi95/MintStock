import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import ru from './locales/ru.json';
import az from './locales/az.json';
import en from './locales/en.json';

const resources = {
  ru: { translation: ru },
  az: { translation: az },
  en: { translation: en }
};

const savedLanguage = localStorage.getItem('language') || 'az';
const validLanguage = ['ru', 'az', 'en'].includes(savedLanguage) ? savedLanguage : 'az';

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: validLanguage,
    fallbackLng: 'az',
    interpolation: { escapeValue: false }
  });

export default i18n;
