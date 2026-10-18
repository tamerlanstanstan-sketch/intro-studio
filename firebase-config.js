/* Настройки вашего проекта Firebase. Это не секрет: защиту дают правила из firestore.rules.
   Где взять значения: консоль Firebase -> Настройки проекта -> Ваши приложения -> Веб-приложение -> Config. */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyB48nuPybgv-td_lfHJwF8_YLLGpYKlxbk",
    authDomain: "circle-499bc.firebaseapp.com",
    projectId: "circle-499bc",
    storageBucket: "circle-499bc.firebasestorage.app",
    messagingSenderId: "898537317838",
    appId: "1:898537317838:web:4876ff901a2df37f84779f",
    measurementId: "G-6HX0EFM3R6"
};

/* Почта модератора: этот аккаунт видит жалобы, удаляет посты, блокирует и выдаёт синюю галочку.
   Должна совпадать с почтой в firestore.rules. */
window.MOD_EMAIL = "tamshop.ru@gmail.com";
