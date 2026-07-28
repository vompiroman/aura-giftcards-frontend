import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import {
  getMetaMarketingConsent,
  initializeMetaPixel,
  metaContents,
  setMetaMarketingConsent,
  trackMeta,
  trackMetaPurchase,
} from "./meta.js";

const API_BASE = 'https://aura-giftcards-api.onrender.com/api';
const TOKEN_STORAGE_KEY = 'aura_access_token';

const capturePaymentReturn = () => {
  const hash = window.location.hash || '';
  const searchParams = new URLSearchParams(window.location.search);
  let orderId = null;

  if (hash.startsWith('#success_')) {
    orderId = hash.slice('#success_'.length);
  } else if (['return', 'success'].includes(searchParams.get('payment'))) {
    orderId = searchParams.get('order_id') || searchParams.get('amp;order_id');
  }

  if (!orderId) return null;

  localStorage.setItem('last_order_id', orderId);
  window.history.replaceState(
    { path: window.location.pathname },
    '',
    window.location.pathname,
  );
  return orderId;
};

const INITIAL_PAYMENT_ORDER_ID = capturePaymentReturn();
initializeMetaPixel();

const getAccessToken = () => sessionStorage.getItem(TOKEN_STORAGE_KEY);
const storeAccessToken = (token) => {
  sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  localStorage.removeItem('token');
};
const clearAccessToken = () => {
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem('token');
};
const parseOrderItems = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const CATALOG = {
  "Netflix 1 mois": 600,
  "Netflix 2 mois": 1100,
  "Netflix 3 mois": 4000,
  "Netflix 6 mois": 7500,
  "Netflix 12 mois": 14000,
  "Spotify 1 mois": 200,
  "Spotify 2 mois": 900,
  "Spotify 3 mois": 2400,
  "Crunchyroll 1 mois": 500,
  "Crunchyroll 3 mois": 1200,
  "Crunchyroll 1 an": 3000,
};

function unitPrice(itemOrName) {
  const name = typeof itemOrName === 'object' && itemOrName ? (itemOrName.name || (itemOrName.type + ' ' + (itemOrName.canonicalDuration || '1 mois'))) : itemOrName;
  return CATALOG[name] ?? (typeof itemOrName === 'object' && itemOrName?.price ? itemOrName.price : 0);
}

function displayCartTotal(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, it) => sum + unitPrice(it) * (Number(it?.quantity) || 1), 0);
}

function formatDA(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("fr-DZ").format(n) + " DA";
}

window.toastSubscribers = [];
window.showToast = (message, type = 'success') => {
  window.toastSubscribers.forEach(cb => cb(message, type));
};

function ToastContainer() {
  const [toasts, setToasts] = React.useState([]);

  React.useEffect(() => {
    const handler = (msg, type) => {
      const id = Date.now();
      setToasts(t => [...t, { id, msg, type }]);
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
    };
    window.toastSubscribers.push(handler);
    return () => {
      window.toastSubscribers = window.toastSubscribers.filter(cb => cb !== handler);
    };
  }, []);

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className="toast">
          {t.type === 'success' ? '✅' : '⚠️'} {t.msg}
        </div>
      ))}
    </div>
  );
}

const PRODUCTS = [
  {
    id: 'netflix',
    name: 'Netflix',
    descKey: 'descNetflix',
    color: 'netflix',
    popular: true,
    plans: [
      { durationKey: 'planMonth', canonicalDuration: '1 mois', price: 600 },
      { durationKey: 'plan2Months', canonicalDuration: '2 mois', price: 1100 }
    ]
  },
  {
    id: 'spotify',
    name: 'Spotify',
    descKey: 'descSpotify',
    color: 'spotify',
    popular: false,
    plans: [
      { durationKey: 'planMonth', canonicalDuration: '1 mois', price: 200 },
      { durationKey: 'plan2Months', canonicalDuration: '2 mois', price: 900 }
    ]
  },
  {
    id: 'crunchyroll',
    name: 'Crunchyroll',
    descKey: 'descCrunchyroll',
    color: 'crunchyroll',
    popular: false,
    plans: [
      { durationKey: 'planMonth', canonicalDuration: '1 mois', price: 500 },
      { durationKey: 'planYear', canonicalDuration: '1 an', price: 3000 }
    ]
  }
];

function AuraMark({ className = '' }) {
  return (
    <svg className={`aura-mark ${className}`} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#ef4050" d="M24 3.5 44 41.5H34.1l-3.25-6.8H17.15l-3.25 6.8H4L24 3.5Z" />
      <path fill="#8f1723" d="m24 3.5 20 38h-9.9l-3.25-6.8H24V3.5Z" />
      <path fill="#0d0d15" d="m24 15.2-5.15 11.1h10.3L24 15.2Z" />
      <path fill="#e8c9a0" d="m30.85 34.7-2.2-4.58h6.23l-2.18 4.58h-1.85Z" />
      <circle cx="35.7" cy="11.1" r="2.25" fill="#e8c9a0" />
    </svg>
  );
}

function UiIcon({ name, className = '' }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    home: <><path {...common} d="m3.5 10.5 8.5-7 8.5 7v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5v-9Z" /><path {...common} d="M9 21v-6h6v6" /></>,
    bag: <><path {...common} d="M5 8.5h14l-1 12H6l-1-12Z" /><path {...common} d="M8.5 9V7a3.5 3.5 0 0 1 7 0v2" /></>,
    user: <><circle {...common} cx="12" cy="8" r="3.5" /><path {...common} d="M4.5 20.5c1.1-3.55 3.55-5.25 7.5-5.25s6.4 1.7 7.5 5.25" /></>,
    globe: <><circle {...common} cx="12" cy="12" r="8.5" /><path {...common} d="M3.7 12h16.6M12 3.5c2.1 2.3 3.2 5.13 3.2 8.5S14.1 18.2 12 20.5C9.9 18.2 8.8 15.37 8.8 12S9.9 5.8 12 3.5Z" /></>,
    cart: <><path {...common} d="M3.5 4.5h2l1.55 10.1a1.5 1.5 0 0 0 1.48 1.27h7.7a1.5 1.5 0 0 0 1.46-1.15l1.1-4.72H7" /><circle {...common} cx="9.3" cy="20" r="1.25" /><circle {...common} cx="16.5" cy="20" r="1.25" /></>,
    sun: <><circle {...common} cx="12" cy="12" r="3.65" /><path {...common} d="M12 2.5v2M12 19.5v2M21.5 12h-2M4.5 12h-2M18.72 5.28l-1.42 1.42M6.7 17.3l-1.42 1.42M18.72 18.72 17.3 17.3M6.7 6.7 5.28 5.28" /></>,
    moon: <path {...common} d="M20 15.25A8.15 8.15 0 0 1 8.75 4 8.5 8.5 0 1 0 20 15.25Z" />,
  };
  return <svg className={`ui-icon ${className}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">{paths[name] || paths.home}</svg>;
}

function BrandSymbol({ service }) {
  const normalized = String(service || '').toLowerCase();

  if (normalized === 'netflix') {
    return (
      <svg className="brand-symbol netflix" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path fill="#b20710" d="M8 4h10l12 25.2V4h10v40H30L18 18.8V44H8V4Z" />
        <path fill="#e50914" d="M18 4h10l12 40H30L18 18.8V4Z" />
        <path fill="#f34b56" d="m30 29.2 4.8 10.2H30l-2.4-5.1 2.4-5.1Z" />
      </svg>
    );
  }

  if (normalized === 'spotify') {
    return (
      <svg className="brand-symbol spotify" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <circle cx="24" cy="24" r="21" fill="#1ed760" />
        <path d="M12.2 18.1c8.2-2.5 17.45-1.5 23.65 2.08M14 24.2c6.7-1.96 14.22-1.18 19.3 1.77M15.75 30.03c5.08-1.42 10.72-.84 14.6 1.36" fill="none" stroke="#07140c" strokeWidth="3.05" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg className="brand-symbol crunchyroll" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle cx="24" cy="24" r="21" fill="#ff7a30" />
      <circle cx="27.8" cy="21.3" r="13.65" fill="#fff7f2" />
      <circle cx="32.9" cy="16.5" r="7.25" fill="#ff7a30" />
      <path d="M14.2 31.35c4.8 4.17 11.75 5.23 17.6 2.42" fill="none" stroke="#ff7a30" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

const translations = {
  fr: {
    // Header & Nav
    navHome: "Accueil",
    navShop: "Boutique",
    navLogin: "Connexion",
    navCart: "Panier",
    navAccount: "Informations",
    navOrders: "Commandes",
    navLogout: "Déconnexion",
    
    // Top Banner
    topBanner: "Services streaming disponibles partout en Algérie",
    topBannerMobile: "Disponible partout en Algérie",
    topBannerSupport: "Support WhatsApp",
    topBannerSupportMobile: "WhatsApp",
    marketingConsentTitle: "Mesure publicitaire Meta",
    marketingConsentText: "Avec votre accord, le Pixel Meta et l’API Conversions mesurent nos publicités. Le site et le paiement fonctionnent aussi si vous refusez.",
    marketingConsentLearnMore: "En savoir plus",
    marketingConsentReject: "Refuser",
    marketingConsentAccept: "Accepter",
    
    // Hero
    heroTitle1: "Tes abonnements streaming",
    heroTitle2: "au meilleur prix",
    heroEyebrow: "La plateforme streaming pensée pour l'Algérie",
    heroDesc1: "Netflix • Spotify • Crunchyroll",
    heroDesc2: "Netflix attribué automatiquement • Spotify et Crunchyroll activés sur votre compte",
    heroCta: "Acheter maintenant",
    heroSecondary: "Voir les offres",
    heroNote: "Activation adaptée • Support humain • Paiement local",
    heroShowcaseNetflix: "Netflix",
    heroShowcaseManual: "Spotify & Crunchyroll",
    heroShowcaseEta: "Délai selon le service et la disponibilité",
    heroShowcaseAuto: "Attribution automatique",
    heroShowcaseManualActivation: "Activation manuelle",
    trustClients: "Activation adaptée à chaque service",
    trustDelivery: "Suivi de commande en ligne",
    trustSecure: "Paiement sécurisé",
    
    // Shop
    shopEyebrow: "Nos abonnements",
    shopTitle: "Choisissez votre compte",
    shopSubtitle: "Sélectionnez un service et une durée, ajoutez au panier et payez en quelques clics.",
    popular: "Populaire",
    addToCart: "Ajouter au panier",
    added: "Ajouté !",
    priceLabel: "Prix",
    
    // Stats
    statsTitle: "Ils nous font confiance",
    statsSubtitle: "Rejoignez des centaines de clients satisfaits",
    statSold: "Comptes vendus",
    statDelivery: "Livraison moyenne",
    statSat: "Clients satisfaits",
    serviceHighlightsTitle: "Un service clair et suivi",
    serviceHighlightsSubtitle: "Chaque abonnement suit le bon parcours, du paiement à l'activation.",
    serviceNetflix: "Netflix automatique",
    serviceNetflixDesc: "Après confirmation du paiement, l'attribution se fait automatiquement selon le stock disponible.",
    serviceManual: "Spotify et Crunchyroll",
    serviceManualDesc: "Nous activons l'abonnement directement sur votre compte après réception de vos identifiants.",
    serviceSupport: "Support en Algérie",
    serviceSupportDesc: "Une équipe disponible sur WhatsApp pour vous accompagner et suivre votre commande.",
    stepsTitle: "Votre abonnement en 3 étapes",
    stepsEyebrow: "Simple et transparent",
    stepsSubtitle: "Un parcours simple et transparent, avec un délai adapté à chaque service.",
    stepChoose: "Choisissez votre service",
    stepChooseDesc: "Sélectionnez le compte et la durée qui vous conviennent.",
    stepPay: "Payez en toute sécurité",
    stepPayDesc: "Réglez par CIB ou Edahabia via notre prestataire sécurisé.",
    stepActivate: "Recevez ou activez",
    stepActivateDesc: "Netflix est attribué automatiquement; Spotify et Crunchyroll sont activés sur votre compte.",
    faqEyebrow: "Besoin d'aide ?",
    faqTitle: "Questions fréquentes",
    faqSubtitle: "Les réponses essentielles avant de commander.",
    faqItems: [
      ["Comment vais-je recevoir mon abonnement ?", "Après confirmation du paiement, Netflix est attribué automatiquement selon le stock disponible. Pour Spotify et Crunchyroll, transmettez les identifiants de votre propre compte depuis la commande afin que notre équipe réalise l'activation."],
      ["Comment fonctionne Netflix ?", "Vous recevez l'accès à un profil privé sur un compte Netflix. Ne modifiez pas l'email, le mot de passe ou les autres profils afin de conserver la garantie."],
      ["Comment fonctionnent Spotify et Crunchyroll ?", "L'abonnement est activé sur votre propre compte. Utilisez de préférence un mot de passe temporaire, puis modifiez-le après confirmation de l'activation."],
      ["Le paiement est-il sécurisé ?", "Les paiements CIB et Edahabia sont traités par SlickPay. Aura Stream ne collecte pas les données de votre carte bancaire."],
      ["Que faire si mon accès ne fonctionne plus ?", "Contactez le support WhatsApp avec votre numéro de commande. L'équipe vérifiera l'accès et vous proposera la solution adaptée à votre service."],
      ["Quel est le délai d'activation ?", "Netflix est attribué automatiquement après paiement lorsque le stock est disponible. Spotify et Crunchyroll sont activés manuellement, généralement de quelques minutes à quelques heures selon la disponibilité de l'équipe."]
    ],
    
    // Cart
    cartEmpty: "Votre panier est vide",
    cartEmptySub: "Ajoutez des comptes pour commencer",
    cartTotal: "Total",
    checkoutBtn: "Commander",
    helpWhatsapp: "Besoin d'aide ?",
    noProducts: "Aucun produit disponible pour le moment.",
    errorMustLogin: "Vous devez être connecté pour commander.",
    
    // Auth Modal
    loginTitle: "Connexion",
    signupTitle: "Inscription",
    loginSub: "Connectez-vous à votre compte",
    signupSub: "Créez votre compte Aura Stream",
    emailPlaceholder: "Adresse email",
    passPlaceholder: "Mot de passe",
    loading: "Chargement...",
    forgotPass: "Mot de passe oublié ?",
    forgotSub: "Entrez votre email pour recevoir un lien de réinitialisation",
    btnForgot: "Envoyer le lien",
    toLogin: "Déjà inscrit ? Se connecter",
    toSignup: "Pas de compte ? S'inscrire",
    toLoginForgot: "Retour à la connexion",
    
    // Checkout
    checkoutBack: "Retour",
    checkoutTitle: "Résumé de commande",
    checkoutPay: "Payer par Edahabia / CIB",
    checkoutProcessing: "Création du paiement sécurisé...",
    checkoutProblem: "Un problème ?",
    checkoutContact: "Contactez-nous sur WhatsApp",
    
    // Success
    successTitle: "Commande confirmée !",
    successDesc: "Merci pour votre achat. Suivez l'attribution ou l'activation depuis Mes commandes.",
    successCta: "Voir mes commandes",
    
    // Profile
    profileTitle: "Mes Informations",
    emailReadonly: "Adresse Email (Non modifiable)",
    firstName: "Prénom (Optionnel)",
    lastName: "Nom (Optionnel)",
    phoneNum: "Numéro de téléphone (Optionnel)",
    security: "Sécurité",
    oldPass: "Ancien mot de passe",
    oldPassPh: "Requis pour changer de mot de passe",
    newPass: "Nouveau mot de passe",
    newPassPh: "Laissez vide pour ne pas changer",
    confirmPass: "Confirmer le nouveau",
    saveChanges: "Enregistrer les modifications",
    
    // Orders
    ordersTitle: "Mes Commandes",
    ordersEmpty: "Vos commandes apparaîtront ici une fois confirmées. Pour toute question, contactez-nous sur WhatsApp.",
    contactSupport: "Contacter le support WhatsApp",
    
    // Reset Password
    resetTitle: "Réinitialisation du mot de passe",
    resetSuccess: "Mot de passe réinitialisé avec succès !",
    close: "Fermer",
    validateNewPass: "Valider le nouveau mot de passe",
    
    // Footer
    footerDesc: "Vos comptes streaming au meilleur prix en Algérie. Service rapide et sécurisé.",
    footerNav: "Navigation",
    footerContact: "Contact",
    footerServices: "Services",
    footerRights: "Tous droits réservés.",
    
    // Products
    descNetflix: "Films, séries et documentaires sans limites",
    descSpotify: "Musique illimitée sans publicités",
    descCrunchyroll: "Anime en VOSTFR et simulcast",
    planMonth: "1 mois",
    plan2Months: "2 mois",
    planYear: "1 an",
    errorGeneric: "Une erreur est survenue.",
    errorRateLimit: "Trop de tentatives. Veuillez patienter quelques minutes.",
    errorEmailTaken: "Cet email est déjà utilisé.",
    errorInvalidCredentials: "Email ou mot de passe incorrect.",
    errorPasswordTooShort: "Le mot de passe doit contenir au moins 6 caractères.",
    errorInvalidEmail: "Adresse email invalide.",
    errorNetwork: "Erreur réseau. Vérifiez votre connexion internet.",
    errorPaymentProvider: "Erreur du prestataire de paiement.",
    errorOldPasswordRequired: "Veuillez saisir votre ancien mot de passe.",
    errorPasswordMismatch: "Les nouveaux mots de passe ne correspondent pas."
  },
  en: {
    navHome: "Home",
    navShop: "Shop",
    navLogin: "Login",
    navCart: "Cart",
    navAccount: "Information",
    navOrders: "Orders",
    navLogout: "Logout",
    
    topBanner: "Streaming services available throughout Algeria",
    topBannerMobile: "Available across Algeria",
    topBannerSupport: "WhatsApp support",
    topBannerSupportMobile: "WhatsApp",
    marketingConsentTitle: "Meta advertising measurement",
    marketingConsentText: "With your consent, Meta Pixel and Conversions API measure our advertising. The site and payment work normally if you decline.",
    marketingConsentLearnMore: "Learn more",
    marketingConsentReject: "Decline",
    marketingConsentAccept: "Accept",
    
    heroTitle1: "Your streaming subscriptions",
    heroTitle2: "at the best price",
    heroEyebrow: "The streaming platform built for Algeria",
    heroDesc1: "Netflix • Spotify • Crunchyroll",
    heroDesc2: "Netflix assigned automatically • Spotify and Crunchyroll activated on your account",
    heroCta: "Shop Now",
    heroSecondary: "View offers",
    heroNote: "Service-specific activation • Human support • Local payment",
    heroShowcaseNetflix: "Netflix",
    heroShowcaseManual: "Spotify & Crunchyroll",
    heroShowcaseEta: "Timing depends on service and availability",
    heroShowcaseAuto: "Automatic assignment",
    heroShowcaseManualActivation: "Manual activation",
    trustClients: "Activation adapted to each service",
    trustDelivery: "Online order tracking",
    trustSecure: "Secure payment",
    
    shopEyebrow: "Our subscriptions",
    shopTitle: "Choose your account",
    shopSubtitle: "Select a service and duration, add to cart and pay in a few clicks.",
    popular: "Popular",
    addToCart: "Add to cart",
    added: "Added!",
    priceLabel: "Price",
    
    statsTitle: "They trust us",
    statsSubtitle: "Join hundreds of satisfied customers",
    statSold: "Accounts sold",
    statDelivery: "Average delivery",
    statSat: "Satisfied customers",
    serviceHighlightsTitle: "A clear, tracked service",
    serviceHighlightsSubtitle: "Each subscription follows the right path from payment to activation.",
    serviceNetflix: "Automatic Netflix",
    serviceNetflixDesc: "After payment confirmation, assignment is automatic according to available stock.",
    serviceManual: "Spotify and Crunchyroll",
    serviceManualDesc: "We activate the subscription directly on your account after receiving your credentials.",
    serviceSupport: "Support in Algeria",
    serviceSupportDesc: "Our WhatsApp team can help you and follow up on your order.",
    stepsTitle: "Your subscription in 3 steps",
    stepsEyebrow: "Simple and transparent",
    stepsSubtitle: "A simple, transparent journey with timing adapted to each service.",
    stepChoose: "Choose your service",
    stepChooseDesc: "Select the account and duration that suit you.",
    stepPay: "Pay securely",
    stepPayDesc: "Pay by CIB or Edahabia through our secure provider.",
    stepActivate: "Receive or activate",
    stepActivateDesc: "Netflix is assigned automatically; Spotify and Crunchyroll are activated on your account.",
    faqEyebrow: "Need help?",
    faqTitle: "Frequently asked questions",
    faqSubtitle: "Essential answers before placing an order.",
    faqItems: [
      ["How will I receive my subscription?", "After payment is confirmed, Netflix is assigned automatically when stock is available. For Spotify and Crunchyroll, send your own account credentials from the order so our team can activate the service."],
      ["How does Netflix work?", "You receive access to a private profile on a Netflix account. Do not change the email, password, or other profiles if you want to keep the warranty."],
      ["How do Spotify and Crunchyroll work?", "The subscription is activated on your own account. Preferably use a temporary password and change it after activation is confirmed."],
      ["Is payment secure?", "CIB and Edahabia payments are processed by SlickPay. Aura Stream does not collect your bank card details."],
      ["What if my access stops working?", "Contact WhatsApp support with your order number. The team will check your access and provide the appropriate solution for your service."],
      ["How long does activation take?", "Netflix is assigned automatically after payment when stock is available. Spotify and Crunchyroll are activated manually, usually within a few minutes to a few hours depending on team availability."]
    ],
    
    cartEmpty: "Your cart is empty",
    cartEmptySub: "Add accounts to get started",
    cartTotal: "Total",
    checkoutBtn: "Checkout",
    helpWhatsapp: "Need help?",
    noProducts: "No products available at the moment.",
    errorMustLogin: "You must be logged in to place an order.",
    
    loginTitle: "Login",
    signupTitle: "Sign Up",
    loginSub: "Log in to your account",
    signupSub: "Create your Aura Stream account",
    emailPlaceholder: "Email address",
    passPlaceholder: "Password",
    loading: "Loading...",
    forgotPass: "Forgot password?",
    forgotSub: "Enter your email to receive a reset link",
    btnForgot: "Send reset link",
    toLogin: "Already registered? Login",
    toSignup: "No account? Sign up",
    toLoginForgot: "Back to login",
    
    checkoutBack: "Back",
    checkoutTitle: "Order Summary",
    checkoutPay: "Pay with SlickPay",
    checkoutProcessing: "Processing...",
    checkoutProblem: "Having trouble?",
    checkoutContact: "Contact us on WhatsApp",
    
    successTitle: "Order confirmed!",
    successDesc: "Thank you for your purchase. Track assignment or activation from My Orders.",
    successCta: "View my orders",
    
    profileTitle: "My Information",
    emailReadonly: "Email Address (Read-only)",
    firstName: "First Name (Optional)",
    lastName: "Last Name (Optional)",
    phoneNum: "Phone Number (Optional)",
    security: "Security",
    oldPass: "Old password",
    oldPassPh: "Required to change password",
    newPass: "New password",
    newPassPh: "Leave empty to keep current",
    confirmPass: "Confirm new password",
    saveChanges: "Save changes",
    
    ordersTitle: "My Orders",
    ordersEmpty: "Your orders will appear here once confirmed. For any questions, contact us on WhatsApp.",
    contactSupport: "Contact WhatsApp Support",
    
    resetTitle: "Password Reset",
    resetSuccess: "Password reset successfully!",
    close: "Close",
    validateNewPass: "Confirm new password",
    
    footerDesc: "Your streaming accounts at the best price in Algeria. Fast and secure service.",
    footerNav: "Navigation",
    footerContact: "Contact",
    footerServices: "Services",
    footerRights: "All rights reserved.",
    
    // Products
    descNetflix: "Unlimited movies, TV shows, and documentaries",
    descSpotify: "Ad-free unlimited music",
    descCrunchyroll: "Anime in sub/dub and simulcast",
    planMonth: "1 month",
    plan2Months: "2 months",
    planYear: "1 year",
    errorGeneric: "An error occurred.",
    errorRateLimit: "Too many attempts. Please wait a few minutes.",
    errorEmailTaken: "This email is already in use.",
    errorInvalidCredentials: "Incorrect email or password.",
    errorPasswordTooShort: "Password must be at least 6 characters.",
    errorInvalidEmail: "Invalid email address.",
    errorNetwork: "Network error. Check your internet connection.",
    errorPaymentProvider: "Payment provider error.",
    errorOldPasswordRequired: "Please enter your old password.",
    errorPasswordMismatch: "New passwords do not match."
  },
  ar: {
    navHome: "الرئيسية",
    navShop: "المتجر",
    navLogin: "دخول",
    navCart: "السلة",
    navAccount: "معلوماتي",
    navOrders: "طلباتي",
    navLogout: "تسجيل الخروج",
    
    topBanner: "خدمات البث متاحة في جميع أنحاء الجزائر",
    topBannerMobile: "متاح في جميع أنحاء الجزائر",
    topBannerSupport: "دعم واتساب",
    topBannerSupportMobile: "واتساب",
    marketingConsentTitle: "قياس إعلانات Meta",
    marketingConsentText: "بموافقتك، نستخدم Meta Pixel وConversions API لقياس إعلاناتنا. يعمل الموقع والدفع بشكل طبيعي إذا رفضت.",
    marketingConsentLearnMore: "اعرف المزيد",
    marketingConsentReject: "رفض",
    marketingConsentAccept: "موافقة",
    
    heroTitle1: "اشتراكات البث الخاصة بك",
    heroTitle2: "بأفضل الأسعار",
    heroEyebrow: "منصة البث المصممة للجزائر",
    heroDesc1: "Netflix • Spotify • Crunchyroll",
    heroDesc2: "تخصيص نتفليكس تلقائياً • تفعيل سبوتيفاي وكرانشي رول على حسابك",
    heroCta: "تسوق الآن",
    heroSecondary: "شاهد العروض",
    heroNote: "تفعيل حسب الخدمة • دعم بشري • دفع محلي",
    heroShowcaseNetflix: "Netflix",
    heroShowcaseManual: "Spotify و Crunchyroll",
    heroShowcaseEta: "المدة حسب الخدمة والتوفر",
    heroShowcaseAuto: "تخصيص تلقائي",
    heroShowcaseManualActivation: "تفعيل يدوي",
    trustClients: "تفعيل مناسب لكل خدمة",
    trustDelivery: "متابعة الطلب عبر الإنترنت",
    trustSecure: "دفع آمن",
    
    shopEyebrow: "اشتراكاتنا",
    shopTitle: "اختر حسابك",
    shopSubtitle: "حدد الخدمة والمدة، أضف إلى السلة وادفع بنقرات قليلة.",
    popular: "شائع",
    addToCart: "أضف إلى السلة",
    added: "تمت الإضافة!",
    priceLabel: "السعر",
    
    statsTitle: "يثقون بنا",
    statsSubtitle: "انضم إلى مئات العملاء الراضين",
    statSold: "حسابات مباعة",
    statDelivery: "متوسط وقت التسليم",
    statSat: "عملاء راضون",
    serviceHighlightsTitle: "خدمة واضحة ومتابعة",
    serviceHighlightsSubtitle: "كل اشتراك يمر بالمسار المناسب من الدفع إلى التفعيل.",
    serviceNetflix: "نتفليكس تلقائي",
    serviceNetflixDesc: "بعد تأكيد الدفع، يتم التخصيص تلقائياً حسب المخزون المتاح.",
    serviceManual: "سبوتيفاي وكرانشي رول",
    serviceManualDesc: "نفعّل الاشتراك مباشرة على حسابك بعد استلام بياناتك.",
    serviceSupport: "دعم في الجزائر",
    serviceSupportDesc: "فريق واتساب متاح لمساعدتك ومتابعة طلبك.",
    stepsTitle: "اشتراكك في 3 خطوات",
    stepsEyebrow: "بسيط وشفاف",
    stepsSubtitle: "مسار بسيط وشفاف بمدة مناسبة لكل خدمة.",
    stepChoose: "اختر خدمتك",
    stepChooseDesc: "حدد الحساب والمدة المناسبة لك.",
    stepPay: "ادفع بأمان",
    stepPayDesc: "ادفع عبر CIB أو Edahabia من خلال مزود آمن.",
    stepActivate: "استلم أو فعّل",
    stepActivateDesc: "يتم تخصيص نتفليكس تلقائياً، وتفعيل سبوتيفاي وكرانشي رول على حسابك.",
    faqEyebrow: "تحتاج مساعدة؟",
    faqTitle: "الأسئلة الشائعة",
    faqSubtitle: "الإجابات الأساسية قبل تقديم الطلب.",
    faqItems: [
      ["كيف أستلم اشتراكي؟", "بعد تأكيد الدفع، يتم تخصيص نتفليكس تلقائياً عند توفر المخزون. بالنسبة لسبوتيفاي وكرانشي رول، أرسل بيانات حسابك من الطلب ليقوم فريقنا بالتفعيل."],
      ["كيف يعمل نتفليكس؟", "تحصل على ملف شخصي خاص داخل حساب نتفليكس. لا تغيّر البريد الإلكتروني أو كلمة المرور أو الملفات الأخرى للحفاظ على الضمان."],
      ["كيف يعمل سبوتيفاي وكرانشي رول؟", "يتم تفعيل الاشتراك على حسابك الشخصي. يفضّل استخدام كلمة مرور مؤقتة وتغييرها بعد تأكيد التفعيل."],
      ["هل الدفع آمن؟", "تتم معالجة مدفوعات CIB وEdahabia عبر SlickPay. لا تجمع Aura Stream بيانات بطاقتك البنكية."],
      ["ماذا أفعل إذا توقف الوصول؟", "تواصل مع دعم واتساب وأرسل رقم طلبك. سيتحقق الفريق من الوصول ويقترح الحل المناسب لخدمتك."],
      ["كم يستغرق التفعيل؟", "يتم تخصيص نتفليكس تلقائياً بعد الدفع عند توفر المخزون. يتم تفعيل سبوتيفاي وكرانشي رول يدوياً، عادةً خلال بضع دقائق إلى بضع ساعات حسب توفر الفريق."]
    ],
    
    cartEmpty: "سلة التسوق فارغة",
    cartEmptySub: "أضف حسابات للبدء",
    cartTotal: "المجموع",
    checkoutBtn: "إتمام الطلب",
    noProducts: "لا توجد منتجات متاحة حالياً.",
    errorMustLogin: "يجب عليك تسجيل الدخول لإتمام الطلب.",
    helpWhatsapp: "تحتاج مساعدة؟",
    
    loginTitle: "تسجيل الدخول",
    signupTitle: "إنشاء حساب",
    loginSub: "قم بتسجيل الدخول إلى حسابك",
    signupSub: "قم بإنشاء حساب Aura Stream الخاص بك",
    emailPlaceholder: "البريد الإلكتروني",
    passPlaceholder: "كلمة المرور",
    loading: "جاري التحميل...",
    forgotPass: "هل نسيت كلمة المرور؟",
    forgotSub: "أدخل بريدك الإلكتروني لتلقي رابط إعادة التعيين",
    btnForgot: "إرسال الرابط",
    toLogin: "مسجل مسبقاً؟ تسجيل الدخول",
    toSignup: "ليس لديك حساب؟ إنشاء حساب",
    toLoginForgot: "العودة لتسجيل الدخول",
    
    checkoutBack: "رجوع",
    checkoutTitle: "ملخص الطلب",
    checkoutPay: "الدفع عبر SlickPay",
    checkoutProcessing: "جاري المعالجة...",
    checkoutProblem: "هل تواجه مشكلة؟",
    checkoutContact: "تواصل معنا عبر WhatsApp",
    
    successTitle: "تم تأكيد الطلب!",
    successDesc: "شكراً لشرائك. تابع التخصيص أو التفعيل من صفحة طلباتي.",
    successCta: "عرض طلباتي",
    
    profileTitle: "معلوماتي",
    emailReadonly: "البريد الإلكتروني (للقراءة فقط)",
    firstName: "الاسم (اختياري)",
    lastName: "اللقب (اختياري)",
    phoneNum: "رقم الهاتف (اختياري)",
    security: "الأمان",
    oldPass: "كلمة المرور القديمة",
    oldPassPh: "مطلوب لتغيير كلمة المرور",
    newPass: "كلمة المرور الجديدة",
    newPassPh: "اتركه فارغاً لعدم التغيير",
    confirmPass: "تأكيد كلمة المرور الجديدة",
    saveChanges: "حفظ التغييرات",
    saving: "جاري الحفظ...",
    profileUpdated: "تم تحديث الملف الشخصي بنجاح!",
    
    resetTitle: "إعادة تعيين كلمة المرور",
    resetSub: "أدخل كلمة المرور الجديدة أدناه.",
    validateNewPass: "تأكيد كلمة المرور الجديدة",
    resetSuccess: "تم إعادة تعيين كلمة المرور بنجاح!",
    close: "إغلاق",
    
    footerDesc: "حسابات البث الخاصة بك بأفضل سعر في الجزائر. خدمة سريعة وآمنة.",
    footerNav: "التنقل",
    footerContact: "اتصل بنا",
    footerServices: "الخدمات",
    footerRights: "جميع الحقوق محفوظة.",
    
    descNetflix: "أفلام، مسلسلات، وأفلام وثائقية بلا حدود",
    descSpotify: "موسيقى غير محدودة بدون إعلانات",
    descCrunchyroll: "أنمي مترجم ومدبلج بالتزامن مع اليابان",
    planMonth: "شهر واحد",
    plan2Months: "شهران",
    planYear: "سنة واحدة",
    errorGeneric: "حدث خطأ ما.",
    errorRateLimit: "محاولات كثيرة جدًا. يرجى الانتظار بضع دقائق.",
    errorEmailTaken: "هذا البريد الإلكتروني مستخدم بالفعل.",
    errorInvalidCredentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    errorPasswordTooShort: "يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.",
    errorInvalidEmail: "عنوان البريد الإلكتروني غير صالح.",
    errorNetwork: "خطأ في الشبكة. تحقق من اتصالك بالإنترنت.",
    errorPaymentProvider: "خطأ في مزود الدفع.",
    errorOldPasswordRequired: "يرجى إدخال كلمة المرور القديمة.",
    errorPasswordMismatch: "كلمتا المرور الجديدتان غير متطابقتين."
  }
};

/* ---- Language Context ---- */
const LanguageContext = React.createContext();

const LanguageProvider = ({ children }) => {
  const [lang, setLang] = React.useState(localStorage.getItem('lang') || 'fr');

  React.useEffect(() => {
    localStorage.setItem('lang', lang);
    if (lang === 'ar') {
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = 'ar';
    } else {
      document.documentElement.dir = 'ltr';
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const t = (key) => translations[lang][key] || key;

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

const useLanguage = () => React.useContext(LanguageContext);

/* ---- Auth Context ---- */
const AuthContext = React.createContext();

const useScrollReveal = (deps = []) => {
  React.useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.classList.add('active');
      });
    }, { threshold: 0.1 });
    
    // Slight delay to ensure React has painted the DOM
    const timer = setTimeout(() => {
      document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
    }, 100);
    
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, deps);
};

const AuthProvider = ({ children }) => {
  const [user, setUser] = React.useState(null);
  const [token, setToken] = React.useState(getAccessToken());
  const [authLoading, setAuthLoading] = React.useState(true);

  React.useEffect(() => {
    const initAuth = async () => {
      const storedToken = getAccessToken();
      if (storedToken) {
        try {
          const res = await fetch(API_BASE + '/me', {
            headers: { 'Authorization': `Bearer ${storedToken}` }
          });
          const data = await res.json();
          if (res.ok && data.user) {
            setUser(data.user);
            setToken(storedToken);
          } else {
            clearAccessToken();
            setToken(null);
            setUser(null);
          }
        } catch (err) {
          console.error('Auth check error:', err);
        }
      }
      setAuthLoading(false);
    };
    initAuth();
  }, []);

  const translateError = (msg) => {
    if (!msg) return 'errorGeneric';
    const m = msg.toLowerCase();
    if (m.includes('rate limit')) return 'errorRateLimit';
    if (m.includes('already registered') || m.includes('already exists')) return 'errorEmailTaken';
    if (m.includes('invalid login') || m.includes('invalid email or password')) return 'errorInvalidCredentials';
    if (m.includes('password') && m.includes('short')) return 'errorPasswordTooShort';
    if (m.includes('invalid email')) return 'errorInvalidEmail';
    if (m.includes('network') || m.includes('fetch')) return 'errorNetwork';
    return 'errorGeneric';
  };

  const login = async (email, password) => {
    try {
      const res = await fetch(API_BASE + '/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json().catch(() => ({}));
      const accessToken = data.access_token || data.session?.access_token;
      if (res.ok && accessToken && data.user) {
        setToken(accessToken);
        setUser({...data.user, is_admin: Boolean(data.user.is_admin ?? data.is_admin)});
        storeAccessToken(accessToken);
        return { success: true };
      }
      return { success: false, error: translateError(data.error || data.message) };
    } catch (err) {
      console.error('Login error:', err);
      return { success: false, error: translateError(err.message) };
    }
  };

  const register = async (email, password) => {
    try {
      const res = await fetch(API_BASE + '/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.user) {
        const loginResult = await login(email, password);
        return loginResult;
      }
      return { success: false, error: translateError(data.error || data.message) };
    } catch (err) {
      console.error('Register error:', err);
      return { success: false, error: translateError(err.message) };
    }
  };

  const updateProfile = async (first_name, last_name, phone, old_password, password) => {
    try {
      const res = await fetch(API_BASE + '/update-profile', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ first_name, last_name, phone, old_password, password })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.user) {
        setUser({ ...user, user_metadata: data.user.user_metadata });
        return { success: true };
      }
      return { success: false, error: translateError(data.error || data.message) };
    } catch (err) {
      console.error('Update profile error:', err);
      return { success: false, error: translateError(err.message) };
    }
  };

  const forgotPassword = async (email) => {
    try {
      const res = await fetch(API_BASE + '/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return { success: true, message: data.message };
      return { success: false, error: translateError(data.error || data.message) };
    } catch (err) {
      return { success: false, error: translateError(err.message) };
    }
  };

  const resetPassword = async (recoveryToken, password) => {
    try {
      const res = await fetch(API_BASE + '/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: recoveryToken, password })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return { success: true };
      return { success: false, error: translateError(data.error || data.message) };
    } catch (err) {
      return { success: false, error: translateError(err.message) };
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    clearAccessToken();
  };

  return (
    <AuthContext.Provider value={{ user, token, authLoading, login, register, logout, updateProfile, forgotPassword, resetPassword }}>
      {!authLoading && children}
    </AuthContext.Provider>
  );
};

const useAuth = () => React.useContext(AuthContext);

/* ---- Components ---- */

function LanguageSwitcher() {
  const { lang, setLang } = useLanguage();
  const labels = { fr: 'FR', en: 'EN', ar: 'AR' };
  const langs = ['fr', 'en', 'ar'];
  const [open, setOpen] = React.useState(false);
  const dropdownRef = React.useRef(null);

  React.useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} style={{position: 'relative', display: 'inline-block'}}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="nav-btn lang-btn"
        aria-label="Changer de langue"
      >
        <UiIcon name="globe" className="nav-icon" />
        <span className="nav-text" style={{color: 'var(--gold)'}}>{labels[lang]}</span>
      </button>
      {open && (
        <div className="animate-fadeIn" style={{
          position: 'absolute', top: '110%', right: 0, 
          background: 'var(--bg-secondary)', border: '1px solid var(--border)', 
          borderRadius: 'var(--radius-xs)', overflow: 'hidden', zIndex: 100,
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
        }}>
          {langs.map(l => (
            <button
              key={l}
              onClick={() => { setLang(l); setOpen(false); }}
              style={{
                display: 'block', width: '100%', padding: '0.8rem 1rem', background: 'none', border: 'none',
                color: lang === l ? 'var(--gold)' : 'var(--text-primary)',
                textAlign: 'left', fontWeight: lang === l ? 700 : 500,
                borderBottom: '1px solid rgba(255,255,255,0.02)'
              }}
              onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.05)'}
              onMouseLeave={(e) => e.target.style.background = 'none'}
            >
              {labels[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TopBanner() {
  const { t } = useLanguage();
  return (
    <div className="top-banner">
      <div className="top-banner-inner">
        <span className="status-dot" aria-hidden="true"></span>
        <span className="banner-copy banner-copy-desktop">{t('topBanner')}</span>
        <span className="banner-copy banner-copy-mobile">{t('topBannerMobile')}</span>
        <span className="banner-separator" aria-hidden="true">•</span>
        <a href="https://wa.me/213557828812" target="_blank" rel="noopener noreferrer">
          <span className="banner-copy banner-copy-desktop">{t('topBannerSupport')}</span>
          <span className="banner-copy banner-copy-mobile">{t('topBannerSupportMobile')}</span>
        </a>
      </div>
    </div>
  );
}

function UserDropdown({ auth, onNavigate }) {
  const [open, setOpen] = React.useState(false);
  const dropdownRef = React.useRef(null);
  const { t } = useLanguage();

  React.useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="user-dropdown-container" ref={dropdownRef}>
      <button className="nav-btn user-btn" type="button" onClick={() => setOpen(!open)} aria-label="Ouvrir mon compte">
        <UiIcon name="user" />
      </button>
      {open && (
        <div className="user-dropdown-menu animate-fadeIn">
          <div className="dropdown-header">{auth.user.email}</div>
          {auth.user.is_admin && (
            <button onClick={() => { setOpen(false); onNavigate('admin'); }} style={{color: 'var(--gold)'}}>👑 Administration</button>
          )}
          <button onClick={() => { setOpen(false); onNavigate('profile'); }}>👤 {t('navAccount')}</button>
          <button onClick={() => { setOpen(false); onNavigate('orders'); }}>📦 {t('navOrders')}</button>
          <hr/>
          <button style={{color: 'var(--red)'}} onClick={() => { setOpen(false); auth.logout(); }}>🚪 {t('navLogout')}</button>
        </div>
      )}
    </div>
  );
}

function ThemeToggle() {
  const [isDark, setIsDark] = React.useState(() => {
    return localStorage.getItem('aura_theme') !== 'light';
  });

  React.useEffect(() => {
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('aura_theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('aura_theme', 'light');
    }
  }, [isDark]);

  return (
    <button
      className="theme-toggle nav-btn"
      type="button"
      onClick={() => setIsDark(!isDark)}
      title={isDark ? 'Activer le mode clair' : 'Activer le mode sombre'}
      aria-label={isDark ? 'Activer le mode clair' : 'Activer le mode sombre'}
      style={{fontSize: '1.2rem', padding: '0.4rem', minWidth: 'auto', border: 'none', background: 'none'}}
    >
      <UiIcon name={isDark ? 'sun' : 'moon'} />
    </button>
  );
}

function Header({ cartCount, onCartClick, onNavigate, auth, onLoginClick, cartBump }) {
  const { t } = useLanguage();
  return (
    <header className="header">
      <div className="header-inner">
        <button className="logo" type="button" aria-label="Aura Stream — Accueil" onClick={() => onNavigate('home')}>
          <span className="brand-mark" aria-hidden="true"><AuraMark /></span>
          <span className="brand-copy">Aura<span>Stream</span></span>
        </button>
        <nav className="nav-links" aria-label="Navigation principale">
          <button className="nav-btn home-nav-btn" type="button" onClick={() => onNavigate('home')}>
            <UiIcon name="home" className="nav-icon" />
            <span className="nav-text">{t('navHome')}</span>
          </button>
          <button className="nav-btn shop-nav-btn" type="button" onClick={() => onNavigate('shop')}>
            <UiIcon name="bag" className="nav-icon" />
            <span className="nav-text">{t('navShop')}</span>
          </button>
          {auth.user ? (
            <UserDropdown auth={auth} onNavigate={onNavigate} />
          ) : (
            <button className="login-btn" type="button" onClick={onLoginClick}>
              <UiIcon name="user" className="nav-icon" />
              <span className="nav-text">{t('navLogin')}</span>
            </button>
          )}
          <LanguageSwitcher />
          <ThemeToggle />
          <button className={`cart-btn ${cartBump ? 'shake-animation' : ''}`} type="button" onClick={onCartClick} aria-label={`${t('navCart')} (${cartCount})`}>
            <UiIcon name="cart" />
            {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
          </button>
        </nav>
      </div>
    </header>
  );
}

function HeroSection({ onShopClick }) {
  const { t } = useLanguage();
  return (
    <section className="hero">
      <div className="hero-bg">
        <div className="hero-orb hero-orb-1"></div>
        <div className="hero-orb hero-orb-2"></div>
        <div className="hero-orb hero-orb-3"></div>
      </div>
      <div className="hero-shell">
        <div className="hero-content">
          <div className="eyebrow animate-fadeInUp"><span aria-hidden="true"></span>{t('heroEyebrow')}</div>
          <h1 className="animate-fadeInUp delay-1">
            <span>{t('heroTitle1')}</span>
            <br /><span className="gradient-text">{t('heroTitle2')}.</span>
          </h1>
          <p className="hero-subtitle animate-fadeInUp delay-2">
            <span className="services-list">{t('heroDesc1')}</span>
            <br />{t('heroDesc2')}
          </p>
          <div className="hero-actions animate-fadeInUp delay-3">
            <button className="hero-cta" onClick={onShopClick}>
              {t('heroCta')}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
            <button type="button" className="hero-secondary" onClick={() => document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' })}>
              {t('heroSecondary')} <span aria-hidden="true">↓</span>
            </button>
          </div>
          <p className="hero-note animate-fadeInUp delay-4">{t('heroNote')}</p>
        </div>

        <div className="hero-showcase animate-fadeInUp delay-2" aria-label={t('heroDesc1')}>
          <div className="showcase-glow"></div>
          <div className="service-tickets-track">
            <div className="service-ticket ticket-netflix">
              <div className="ticket-top">
                <span className="ticket-logo"><BrandSymbol service="netflix" /></span>
                <span>Netflix</span>
                <small>Premium</small>
              </div>
              <div className="ticket-bottom"><span>1 mois</span><strong>600 DA</strong></div>
            </div>
            <div className="service-ticket ticket-spotify">
              <div className="ticket-top">
                <span className="ticket-logo"><BrandSymbol service="spotify" /></span>
                <span>Spotify</span>
                <small>Premium</small>
              </div>
              <div className="ticket-bottom"><span>1 mois</span><strong>200 DA</strong></div>
            </div>
            <div className="service-ticket ticket-crunchyroll">
              <div className="ticket-top">
                <span className="ticket-logo"><BrandSymbol service="crunchyroll" /></span>
                <span>Crunchyroll</span>
                <small>Mega Fan</small>
              </div>
              <div className="ticket-bottom"><span>1 an</span><strong>3 000 DA</strong></div>
            </div>
          </div>
          <div className="delivery-pill"><span aria-hidden="true">✓</span>{t('heroShowcaseEta')}</div>
        </div>

        <div className="trust-badges animate-fadeInUp delay-4">
          <div className="trust-badge"><span aria-hidden="true">✅</span> {t('trustClients')}</div>
          <div className="trust-badge"><span aria-hidden="true">⚡</span> {t('trustDelivery')}</div>
          <div className="trust-badge"><span aria-hidden="true">🔒</span> {t('trustSecure')}</div>
        </div>
      </div>
    </section>
  );
}

function StepsSection() {
  const { t } = useLanguage();
  const steps = [
    { icon: '1', title: t('stepChoose'), description: t('stepChooseDesc') },
    { icon: '2', title: t('stepPay'), description: t('stepPayDesc') },
    { icon: '3', title: t('stepActivate'), description: t('stepActivateDesc') },
  ];
  return (
    <section className="section steps-section" id="how-it-works">
      <div className="section-header reveal">
        <div className="eyebrow section-eyebrow"><span aria-hidden="true"></span>{t('stepsEyebrow')}</div>
        <h2 className="section-title">{t('stepsTitle')}</h2>
        <p className="section-subtitle">{t('stepsSubtitle')}</p>
      </div>
      <div className="steps-grid">
        {steps.map((step, index) => (
          <article className="step-card reveal" key={step.icon} style={{ transitionDelay: `${index * 0.1}s` }}>
            <div className="step-number">{step.icon}</div>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProductCard({ product, onAddToCart, className, style }) {
  const { t } = useLanguage();
  const [selectedPlan, setSelectedPlan] = React.useState(0);
  const [added, setAdded] = React.useState(false);
  const addedTimerRef = React.useRef(null);

  React.useEffect(() => () => {
    if (addedTimerRef.current) window.clearTimeout(addedTimerRef.current);
  }, []);

  const handleAdd = () => {
    const plan = product.plans[selectedPlan];
    const canonicalName = product.name + ' ' + (plan.canonicalDuration || '1 mois');
    onAddToCart({
      id: product.id,
      type: product.name,
      name: canonicalName,
      color: product.color,
      duration: t(plan.durationKey),
      price: plan.price
    });
    setAdded(true);
    if (addedTimerRef.current) window.clearTimeout(addedTimerRef.current);
    addedTimerRef.current = window.setTimeout(() => setAdded(false), 1500);
  };

  return (
    <div className={`product-card ${product.color} ${className || ''}`} style={style}>
      {product.popular && <div className="popular-badge">{t('popular')}</div>}
      <div className="product-brand-row">
        <div className={'product-icon ' + product.color}>
          <BrandSymbol service={product.id} />
        </div>
        <div>
          <div className="product-name">{product.name}</div>
          <div className="product-desc">{t(product.descKey)}</div>
        </div>
      </div>
      <div className="duration-selector">
        {product.plans.map((plan, idx) => (
          <button
            type="button"
            key={idx}
            className={'duration-btn' + (selectedPlan === idx ? ' active' : '')}
            onClick={() => setSelectedPlan(idx)}
            aria-pressed={selectedPlan === idx}
          >
            {t(plan.durationKey)}
          </button>
        ))}
      </div>
      <div className="price-label">{t('priceLabel')}</div>
      <div className="product-price">
        <span className="price-current">{product.plans[selectedPlan].price}</span>
        <span className="price-currency">DA</span>
      </div>
      <button type="button" className={'add-to-cart-btn ' + product.color + (added ? ' added' : '')} onClick={handleAdd}>
        <span className="cart-icon">🛒 {t('addToCart')}</span>
        <span className="check-icon">✔ {t('added')}</span>
      </button>
    </div>
  );
}

function ProductsSection({ onAddToCart }) {
  const { t } = useLanguage();
  return (
    <section className="section" id="shop">
      <div className="section-header reveal">
        <div className="eyebrow section-eyebrow"><span aria-hidden="true"></span>{t('shopEyebrow')}</div>
        <h2 className="section-title">{t('shopTitle')}</h2>
        <p className="section-subtitle">{t('shopSubtitle')}</p>
      </div>
      <div className="products-grid">
        {PRODUCTS.map((product, idx) => (
          <ProductCard 
            key={product.id} 
            product={product} 
            onAddToCart={onAddToCart} 
            className="reveal" 
            style={{transitionDelay: `${idx * 0.1}s`}}
          />
        ))}
      </div>
    </section>
  );
}

function AnimatedCounter({ target, suffix }) {
  const [count, setCount] = React.useState(0);
  const ref = React.useRef(null);
  const started = React.useRef(false);

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          let start = 0;
          const duration = 2000;
          const step = (ts) => {
            if (!start) start = ts;
            const progress = Math.min((ts - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * target));
            if (progress < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target]);

  return <div className="stat-number" ref={ref} dir="ltr" style={{unicodeBidi: 'bidi-override', direction: 'ltr'}}>{count}{suffix}</div>;
}

function FAQSection() {
  const { t } = useLanguage();
  const [openIndex, setOpenIndex] = React.useState(null);
  const faqs = t('faqItems');

  return (
    <section className="section faq-section animate-fadeInUp">
      <div className="section-header">
        <div className="eyebrow section-eyebrow"><span aria-hidden="true"></span>{t('faqEyebrow')}</div>
        <h2 className="section-title">{t('faqTitle')}</h2>
        <p className="section-subtitle">{t('faqSubtitle')}</p>
      </div>
      <div className="faq-list">
        {faqs.map(([question, answer], index) => {
          const isOpen = openIndex === index;
          return (
            <div key={question} className={`faq-item ${isOpen ? 'open' : ''}`}>
              <button className="faq-question" type="button" aria-expanded={isOpen} onClick={() => setOpenIndex(isOpen ? null : index)}>
                <span className="faq-number">{String(index + 1).padStart(2, '0')}</span>
                <span>{question}</span>
                <i aria-hidden="true">+</i>
              </button>
              {isOpen && (
                <div className="faq-answer">{answer}</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}


function ServiceHighlightsSection() {
  const { t } = useLanguage();
  const highlights = [
    { icon: '✓', title: t('serviceNetflix'), description: t('serviceNetflixDesc') },
    { icon: '↗', title: t('serviceManual'), description: t('serviceManualDesc') },
    { icon: '◈', title: t('serviceSupport'), description: t('serviceSupportDesc') },
  ];
  return (
    <section className="social-proof">
      <div className="section" style={{paddingTop: '3rem', paddingBottom: '3rem'}}>
        <div className="section-header reveal">
          <h2 className="section-title">{t('serviceHighlightsTitle')}</h2>
          <p className="section-subtitle">{t('serviceHighlightsSubtitle')}</p>
        </div>
        <div className="stats-grid">
          {highlights.map((highlight, index) => (
            <div className="service-highlight reveal" key={highlight.title} style={{transitionDelay: `${index * 0.1}s`}}>
              <div className="service-highlight-icon" aria-hidden="true">{highlight.icon}</div>
              <div className="stat-label">{highlight.title}</div>
              <p>{highlight.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CartSidebar({ cart, onRemove, onClose, onCheckout }) {
  const { t } = useLanguage();
  const total = displayCartTotal(cart);
  const closeButtonRef = React.useRef(null);

  React.useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <React.Fragment>
      <div className="cart-overlay" aria-hidden="true" onClick={onClose}></div>
      <aside className="cart-sidebar" role="dialog" aria-modal="true" aria-labelledby="cart-title">
        <div className="cart-header">
          <h2 id="cart-title">{t('navCart')} ({cart.length})</h2>
          <button ref={closeButtonRef} className="cart-close" type="button" onClick={onClose} aria-label="Fermer le panier">&times;</button>
        </div>
        <div className="cart-items">
          {cart.length === 0 ? (
            <div className="cart-empty">
              <div className="cart-empty-icon">🛒</div>
              <p>{t('cartEmpty')}</p>
              <p style={{fontSize: '0.82rem'}}>{t('cartEmptySub')}</p>
            </div>
          ) : (
            cart.map((item, idx) => (
              <div key={idx} className="cart-item">
                <div className="cart-item-info">
                  <div className={'cart-item-icon ' + item.color} style={{
                    background: item.color === 'netflix' ? 'rgba(229,9,20,0.12)' :
                                item.color === 'spotify' ? 'rgba(29,185,84,0.12)' :
                                'rgba(244,117,33,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <BrandSymbol service={item.id || item.type} />
                  </div>
                  <div>
                    <div className="cart-item-name">{item.type}</div>
                    <div className="cart-item-duration">{item.duration}</div>
                  </div>
                </div>
                <div className="cart-item-right">
                  <span className="cart-item-price">{formatDA(unitPrice(item))}</span>
                  <button className="cart-item-remove" type="button" onClick={() => onRemove(idx)} aria-label={`Retirer ${item.type}`}>&times;</button>
                </div>
              </div>
            ))
          )}
        </div>
        {cart.length > 0 && (
          <div className="cart-footer">
            <div className="cart-total">
              <span>{t('cartTotal')}</span>
              <span className="cart-total-amount">{total} DA</span>
            </div>
            <button className="checkout-btn" type="button" onClick={onCheckout}>
              {t('checkoutBtn')} &rarr;
            </button>
            <div className="cart-whatsapp-help">
              {t('helpWhatsapp')}&nbsp;
              <a href="https://wa.me/213557828812" target="_blank" rel="noopener noreferrer">WhatsApp</a>
            </div>
          </div>
        )}
      </aside>
    </React.Fragment>
  );
}

function LoginModal({ auth, onClose, onSuccess }) {
  const { t } = useLanguage();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isSignup, setIsSignup] = React.useState(false);
  const [isForgot, setIsForgot] = React.useState(false);
  const [error, setError] = React.useState('');
  const [successMsg, setSuccessMsg] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const closeButtonRef = React.useRef(null);

  React.useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMsg('');
    
    if (isForgot) {
      const result = await auth.forgotPassword(email);
      if (result.success) {
        setSuccessMsg(result.message);
      } else {
        setError(t(result.error));
      }
    } else {
      const result = isSignup ? await auth.register(email, password) : await auth.login(email, password);
      if (result.success) {
        onSuccess();
      } else {
        setError(t(result.error));
      }
    }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="login-modal-title">
        <button ref={closeButtonRef} className="modal-close" type="button" onClick={onClose} aria-label="Fermer">&times;</button>
        <h2 id="login-modal-title">{isForgot ? t('forgotPass') : (isSignup ? t('signupTitle') : t('loginTitle'))}</h2>
        <p className="modal-subtitle">
          {isForgot ? t('forgotSub') : (isSignup ? t('signupSub') : t('loginSub'))}
        </p>
        <form onSubmit={handleSubmit}>
          <input
            className="form-input"
            type="email"
            placeholder={t('emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {!isForgot && (
            <input
              className="form-input"
              type="password"
              placeholder={t('passPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          )}


          
          {error && <p className="form-error">{error}</p>}
          {successMsg && <p style={{color: 'var(--green-whatsapp)', fontSize: '0.9rem', marginBottom: '1rem', textAlign: 'center'}}>{successMsg}</p>}
          
          <button className="form-submit" type="submit" disabled={loading}>
            {loading ? t('loading') : (isForgot ? t('btnForgot') : (isSignup ? t('signupTitle') : t('loginTitle')))}
          </button>
          
          {!isForgot && !isSignup && (
            <div style={{textAlign: 'center', marginTop: '1rem'}}>
              <button type="button" style={{background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.9rem', cursor: 'pointer', textDecoration: 'underline'}} onClick={() => { setIsForgot(true); setError(''); }}>
                {t('forgotPass')}
              </button>
            </div>
          )}
          
          <button className="form-toggle" type="button" onClick={() => { 
            if (isForgot) { setIsForgot(false); setIsSignup(false); }
            else { setIsSignup(!isSignup); }
            setError('');
            setSuccessMsg('');
          }}>
            {isForgot ? t('toLoginForgot') : (isSignup ? t('toLogin') : t('toSignup'))}
          </button>
        </form>
      </div>
    </div>
  );
}

function CheckoutPage({ cart, email, onSuccess, onBack }) {
  const { t } = useLanguage();
  const auth = useAuth();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [cgvAccepted, setCgvAccepted] = React.useState(false);
  const [promoCode, setPromoCode] = React.useState('');
  const [promo, setPromo] = React.useState(null);
  const [promoLoading, setPromoLoading] = React.useState(false);
  const [promoMessage, setPromoMessage] = React.useState('');
  const subtotal = displayCartTotal(cart);
  const total = promo?.total ?? subtotal;

  const validatePromo = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) {
      setPromo(null);
      setPromoMessage('Saisissez un code promo.');
      return;
    }
    setPromoLoading(true);
    setPromoMessage('');
    try {
      const response = await fetch(`${API_BASE}/validate-promo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.token}` },
        body: JSON.stringify({ code, items: cart.map(item => ({ name: item.name, quantity: 1 })) }),
      });
      const data = await response.json().catch(() => ({}));
      const discountAmount = Number(data.discount_amount ?? data.discount ?? 0);
      const total = Number(data.total);
      if (!response.ok || data.valid === false || !Number.isFinite(total) || !Number.isFinite(discountAmount)) {
        setPromo(null);
        setPromoMessage(data.error || 'Ce code promo est invalide ou expiré.');
      } else {
        setPromo({
          code: String(data.code || code).trim().toUpperCase(),
          discount: Math.max(0, discountAmount),
          total: Math.max(0, total),
        });
        setPromoMessage(data.message || 'Code promo appliqué.');
      }
    } catch {
      setPromo(null);
      setPromoMessage('Le service des codes promo est momentanément indisponible.');
    } finally {
      setPromoLoading(false);
    }
  };

  const handleCheckout = async () => {
    if (!auth.token) {
      setError("Vous devez être connecté pour commander.");
      return;
    }
    setLoading(true);
    setError('');
    try {
      const itemsPayload = cart.map(item => ({ name: item.name || (item.type + ' ' + (item.canonicalDuration || '1 mois')), quantity: 1 }));
      const marketingConsent = getMetaMarketingConsent();
      
      // 1. Create order
      const orderRes = await fetch(API_BASE + '/create-order', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.token}`
        },
        body: JSON.stringify({
          items: itemsPayload,
          promo_code: promo?.code || null,
          marketing_consent: marketingConsent?.status === 'granted',
          marketing_consent_version: marketingConsent?.version || null,
          marketing_consent_at: marketingConsent?.updated_at || null
        })
      });
      const orderData = await orderRes.json();
      
      if (!orderRes.ok || !orderData.order_id) {
        setError(orderData.error || t('errorGeneric'));
        setLoading(false);
        return;
      }

      // Save info for the success page (Spotify/Crunchyroll credentials form)
      localStorage.setItem('has_spotify', cart.some(i => i.id === 'spotify') ? 'true' : 'false');
      localStorage.setItem('has_crunchyroll', cart.some(i => i.id === 'crunchyroll') ? 'true' : 'false');
      localStorage.setItem('last_order_id', orderData.order_id);

      // 2. Create invoice
      const invoiceRes = await fetch(API_BASE + '/create-invoice', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.token}`
        },
        body: JSON.stringify({
          order_id: orderData.order_id
        })
      });
      const data = await invoiceRes.json();
      
      if (data.url || data.payment_url) {
        window.location.href = data.url || data.payment_url;
      } else {
        setError(data.error || 'Erreur lors de la création de la facture');
      }
    } catch (err) {
      setError('Erreur serveur: ' + err.message);
    }
    setLoading(false);
  };

  return (
    <div className="checkout-page animate-fadeInUp">
      <button className="nav-btn" onClick={onBack} style={{marginBottom: '1.5rem', color: 'var(--text-secondary)'}}>
        &larr; {t('checkoutBack')}
      </button>
      <div className="checkout-card">
        <h2 style={{fontSize: '1.4rem', fontWeight: 700, marginBottom: '1.5rem'}}>{t('checkoutTitle')}</h2>
        {cart.map((item, idx) => (
          <div key={idx} className="checkout-item">
            <span style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
              <BrandSymbol service={item.id || item.type} />
              {item.type} &mdash; {item.duration}
            </span>
            <span style={{fontWeight: 600}}>{item.price} DA</span>
          </div>
        ))}
        <hr className="checkout-divider" />
        {promo && (
          <div style={{display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem'}}>
            <span>Sous-total</span>
            <span>{formatDA(subtotal)}</span>
          </div>
        )}
        <div className="checkout-promo-row" style={{display: 'flex', gap: '0.6rem', alignItems: 'end', marginBottom: '1rem'}}>
          <label className="checkout-promo-label" htmlFor="checkout-promo" style={{flex: 1, color: 'var(--text-secondary)', fontSize: '0.85rem'}}>
            Code promo
            <input
              id="checkout-promo"
              className="form-input"
              value={promoCode}
              onChange={(event) => { setPromoCode(event.target.value); setPromo(null); setPromoMessage(''); }}
              placeholder="Ex. AURA10"
              autoComplete="off"
              style={{marginTop: '0.35rem'}}
            />
          </label>
          <button type="button" className="btn btn-secondary checkout-promo-btn" onClick={validatePromo} disabled={promoLoading || !promoCode.trim()}>
            {promoLoading ? 'Vérification…' : 'Appliquer'}
          </button>
        </div>
        {promoMessage && <p aria-live="polite" style={{fontSize: '0.85rem', color: promo ? 'var(--spotify)' : 'var(--text-secondary)', marginBottom: '1rem'}}>{promoMessage}</p>}
        {promo && (
          <div style={{display: 'flex', justifyContent: 'space-between', color: 'var(--spotify)', fontSize: '0.9rem', marginBottom: '0.5rem'}}>
            <span>Réduction ({promo.code})</span>
            <strong>-{formatDA(promo.discount)}</strong>
          </div>
        )}
        <div className="checkout-total">
          <span>{promo ? 'Total après réduction' : t('cartTotal')}</span>
          <span style={{color: 'var(--gold)'}}>{formatDA(total)}</span>
        </div>

        {error && <p className="form-error" style={{marginTop: '1.5rem'}}>{error}</p>}
        <button className="checkout-pay-btn" onClick={handleCheckout} disabled={loading}>
          {loading ? t('checkoutProcessing') : t('checkoutPay')}
        </button>
      </div>
      <div className="cart-whatsapp-help" style={{marginTop: '1.5rem'}}>
        {t('checkoutProblem')}&nbsp;
        <a href="https://wa.me/213557828812" target="_blank" rel="noopener noreferrer" style={{color: 'var(--green-whatsapp)', fontWeight: 600}}>{t('checkoutContact')}</a>
      </div>
    </div>
  );
}
const CredentialsForm = ({ service, color, icon, creds, setCreds, onSubmit, sent }) => {
  if (sent) return (
    <div style={{color: color, marginBottom: '2rem', padding: '1rem', background: `${color}15`, borderRadius: '8px', border: `1px solid ${color}`}}>
      ✅ Vos identifiants {service} ont été envoyés avec succès ! Nous activerons votre compte d'ici quelques minutes.
    </div>
  );
  return (
    <div className="dashboard-card" style={{marginBottom: '2rem', textAlign: 'left', padding: '1.5rem', border: `1px solid ${color}`}}>
      <h3 style={{color: color, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem'}}>
        <span style={{fontSize: '1.3rem'}}>{icon}</span>
        Activation {service} Requise
      </h3>
      <p style={{fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem'}}>
        Afin que nous puissions activer l'abonnement sur votre compte {service}, veuillez nous fournir vos identifiants. (Si vous n'avez pas de compte, créez-en un gratuit d'abord).
      </p>
      <form onSubmit={onSubmit}>
        <input type="email" placeholder={`Email ${service}`} className="form-input" style={{marginBottom: '0.75rem'}} required value={creds.email} onChange={e => setCreds({...creds, email: e.target.value})} />
        <input type="password" placeholder={`Mot de passe ${service}`} className="form-input" style={{marginBottom: '0.75rem'}} required value={creds.password} onChange={e => setCreds({...creds, password: e.target.value})} />
        <input type="tel" placeholder="Votre numéro WhatsApp" className="form-input" required value={creds.whatsapp} onChange={e => setCreds({...creds, whatsapp: e.target.value})} />
        <button type="submit" className="form-submit" style={{background: color, color: '#000'}}>
          Envoyer mes identifiants {service}
        </button>
      </form>
    </div>
  );
};

const OrderCredentialsUpdater = ({ order, service, color, icon, onUpdated }) => {
  const [items, setItems] = React.useState([]);
  React.useEffect(() => {
    setItems(parseOrderItems(order.items));
  }, [order.items]);

  const itemWithCreds = items.find(i => i.name && i.name.toLowerCase().includes(service.toLowerCase()));
  const savedCreds = itemWithCreds?.client_credentials;
  const credentialsSubmitted = Boolean(itemWithCreds?.client_credentials_submitted || savedCreds);

  const [creds, setCreds] = React.useState(savedCreds || { email: '', password: '', whatsapp: '' });
  const [isEditing, setIsEditing] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (credentialsSubmitted) {
      if (savedCreds) setCreds(savedCreds);
      setIsEditing(false);
    } else {
      setIsEditing(true);
    }
  }, [savedCreds, credentialsSubmitted]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!creds.email || !creds.password || !creds.whatsapp) return;
    setLoading(true);
    try {
      const token = getAccessToken();
      if (token) {
        const response = await fetch(`${API_BASE}/client-credentials`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ order_id: order.order_id, service, email: creds.email, password: creds.password, whatsapp: creds.whatsapp })
        });
        if (!response.ok) throw new Error('Enregistrement refusé');
      }

      // Notification Discord gérée par le serveur
      setIsEditing(false);
      if (typeof onUpdated === 'function') {
        onUpdated();
      }
    } catch (err) { console.error('Error', err); }
    setLoading(false);
  };

  if (!isEditing && credentialsSubmitted) {
    return (
      <div style={{marginTop: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)', border: `1px solid ${color}40`}}>
         <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
           <h4 style={{color, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem'}}>{icon} Identifiants {service} transmis</h4>
           <button onClick={() => setIsEditing(true)} style={{background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem'}} title="Modifier">✏️</button>
         </div>
         <div style={{marginTop: '0.8rem', fontSize: '0.9rem', color: 'var(--text-secondary)'}}>
           Identifiants enregistrés de manière sécurisée. Ils ne sont pas réaffichés.
         </div>
      </div>
    );
  }

  return (
    <div style={{marginTop: '1rem', padding: '1.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)', border: `1px solid ${color}40`}}>
      <h4 style={{marginBottom: '1rem', color, display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
        {icon} Activation {service} Requise
      </h4>
      <p style={{fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem'}}>
        Afin que nous puissions activer l'abonnement sur votre compte {service}, veuillez nous fournir vos identifiants.
      </p>
      <form onSubmit={handleSubmit}>
        <input type="email" placeholder={`Email ${service}`} className="form-input" style={{marginBottom: '0.75rem'}} required value={creds.email} onChange={e => setCreds({...creds, email: e.target.value})} />
        <input type="password" placeholder={`Mot de passe ${service}`} className="form-input" style={{marginBottom: '0.75rem'}} required value={creds.password} onChange={e => setCreds({...creds, password: e.target.value})} />
        <input type="tel" placeholder="Votre numéro WhatsApp" className="form-input" style={{marginBottom: '0.75rem'}} required value={creds.whatsapp} onChange={e => setCreds({...creds, whatsapp: e.target.value})} />
        <button type="submit" className="form-submit" style={{background: color, color: '#000'}} disabled={loading}>
          {loading ? 'Enregistrement...' : `Envoyer mes identifiants ${service}`}
        </button>
        {savedCreds && <button type="button" onClick={() => setIsEditing(false)} style={{marginTop: '0.8rem', background: 'transparent', border: 'none', color: 'var(--text-secondary)', width: '100%', cursor: 'pointer'}}>Annuler</button>}
      </form>
    </div>
  );
};

function LegacySuccessPage({ onNavigate }) {
  const { t } = useLanguage();
  const [credentials, setCredentials] = React.useState({ email: '', password: '', whatsapp: '' });
  const [crunchCreds, setCrunchCreds] = React.useState({ email: '', password: '', whatsapp: '' });
  const [sentSpotify, setSentSpotify] = React.useState(false);
  const [sentCrunchyroll, setSentCrunchyroll] = React.useState(false);
  
  const hasSpotify = localStorage.getItem('has_spotify') === 'true';
  const hasCrunchyroll = localStorage.getItem('has_crunchyroll') === 'true';
  const orderId = localStorage.getItem('last_order_id') || 'Inconnue';

  const handleSpotifySubmit = async (e) => {
    e.preventDefault();
    if (!credentials.email || !credentials.password || !credentials.whatsapp) return;
    try {
      const token = getAccessToken();
      if (token && orderId !== 'Inconnue') {
        const response = await fetch(`${API_BASE}/client-credentials`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ order_id: orderId, service: 'Spotify', email: credentials.email, password: credentials.password, whatsapp: credentials.whatsapp })
        });
        if (!response.ok) throw new Error('Enregistrement refusé');
      }
      setSentSpotify(true);
      localStorage.removeItem('has_spotify');
    } catch (err) {
      window.showToast("Impossible d'enregistrer les identifiants. Réessayez.", 'warning');
    }
  };

  const handleCrunchyrollSubmit = async (e) => {
    e.preventDefault();
    if (!crunchCreds.email || !crunchCreds.password || !crunchCreds.whatsapp) return;
    try {
      const token = getAccessToken();
      if (token && orderId !== 'Inconnue') {
        const res = await fetch(`${API_BASE}/client-credentials`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ order_id: orderId, service: 'Crunchyroll', email: crunchCreds.email, password: crunchCreds.password, whatsapp: crunchCreds.whatsapp })
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Enregistrement refusé');
        }
      }

      setSentCrunchyroll(true);
      localStorage.removeItem('has_crunchyroll');
    } catch (err) {
      window.showToast("Impossible d'enregistrer les identifiants. Réessayez.", 'warning');
    }
  };



  return (
    <div className="success-page animate-fadeInUp">
      <div className="success-icon">✔</div>
      <h2 style={{fontSize: '1.8rem', fontWeight: 800, marginBottom: '0.75rem'}}>{t('successTitle')}</h2>
      <p style={{color: 'var(--text-secondary)', marginBottom: '2rem', lineHeight: 1.6}}>
        {t('successDesc')}
      </p>
      
      {hasSpotify && (
        <CredentialsForm service="Spotify" color="#1DB954" icon="🎵" creds={credentials} setCreds={setCredentials} onSubmit={handleSpotifySubmit} sent={sentSpotify} />
      )}

      {hasCrunchyroll && (
        <CredentialsForm service="Crunchyroll" color="#F47521" icon="🍥" creds={crunchCreds} setCreds={setCrunchCreds} onSubmit={handleCrunchyrollSubmit} sent={sentCrunchyroll} />
      )}

      <button className="hero-cta" style={{animation: 'none'}} onClick={() => onNavigate('orders')}>
        {t('successCta')}
      </button>
    </div>
  );
}

function SuccessPage({ onNavigate, auth, onConfirmed }) {
  const [payment, setPayment] = React.useState(null);
  const [checking, setChecking] = React.useState(true);
  const [sent, setSent] = React.useState({ Spotify: false, Crunchyroll: false });
  const [spotifyCreds, setSpotifyCreds] = React.useState({ email: '', password: '', whatsapp: '' });
  const [crunchCreds, setCrunchCreds] = React.useState({ email: '', password: '', whatsapp: '' });
  const confirmedRef = React.useRef(false);
  const orderId = localStorage.getItem('last_order_id') || '';
  const hasSpotify = localStorage.getItem('has_spotify') === 'true';
  const hasCrunchyroll = localStorage.getItem('has_crunchyroll') === 'true';

  const checkStatus = React.useCallback(async () => {
    const token = auth?.token || getAccessToken();
    if (!orderId || !token) {
      setChecking(false);
      return null;
    }
    try {
      const response = await fetch(`${API_BASE}/validate-order?id=${encodeURIComponent(orderId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      if (!response.ok) throw new Error('Statut indisponible');
      const next = await response.json();
      setPayment(next);
      return next;
    } catch (_) {
      return null;
    }
  }, [auth?.token, orderId]);

  React.useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      setChecking(true);
      for (let attempt = 0; attempt < 8 && !cancelled; attempt++) {
        const next = await checkStatus();
        const terminal = next && (
          next.payment_status === 'paid' || next.payment_status === 'failed' ||
          next.status === 'active' || next.status === 'completed' || next.status === 'cancelled'
        );
        if (terminal) break;
        if (attempt < 7) await new Promise(resolve => setTimeout(resolve, 1500));
      }
      if (!cancelled) setChecking(false);
    };
    poll();
    return () => { cancelled = true; };
  }, [checkStatus]);

  const isPaid = Boolean(payment && (
    payment.payment_status === 'paid' || payment.status === 'active' || payment.status === 'completed'
  ));
  const isFailed = Boolean(payment && (
    payment.payment_status === 'failed' || payment.status === 'cancelled'
  ));
  const isActivated = Boolean(payment && ['active', 'completed'].includes(payment.status));

  React.useEffect(() => {
    if (!isPaid || !orderId || confirmedRef.current) return;
    confirmedRef.current = true;
    trackMetaPurchase({
      orderId,
      amount: payment?.amount,
      items: parseOrderItems(payment?.items)
    });
    if (typeof onConfirmed === 'function') onConfirmed();
    window.dispatchEvent(new Event('refresh_orders'));
  }, [isPaid, orderId, payment]);

  const submitCredentials = async (service, creds, setter) => {
    const token = auth?.token || getAccessToken();
    if (!token || !isPaid || !creds.email || !creds.password || !creds.whatsapp) return;
    try {
      const response = await fetch(`${API_BASE}/client-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ order_id: orderId, service, ...creds })
      });
      if (!response.ok) throw new Error('Enregistrement refusé');
      setSent(current => ({ ...current, [service]: true }));
      setter({ email: '', password: '', whatsapp: '' });
      localStorage.removeItem(service === 'Spotify' ? 'has_spotify' : 'has_crunchyroll');
    } catch (_) {
      window.showToast("Impossible d'enregistrer les identifiants. Réessayez.", 'warning');
    }
  };

  const supportMessage = encodeURIComponent(`Bonjour Aura Stream, j'ai besoin d'aide pour la commande ${orderId || 'inconnue'}.`);
  const steps = [
    { label: 'Commande créée', done: Boolean(orderId), current: false },
    { label: isFailed ? 'Paiement annulé ou refusé' : 'Paiement confirmé', done: isPaid, current: !isPaid && !isFailed },
    { label: isActivated ? 'Activation terminée' : 'Activation en cours', done: isActivated, current: isPaid && !isActivated },
    { label: isActivated ? 'Abonnement disponible dans Mes commandes' : 'Livraison', done: isActivated, current: false }
  ];

  return (
    <div className="success-page animate-fadeInUp">
      <div className="success-icon" style={isFailed ? {borderColor: 'rgba(230,57,70,.5)', background: 'rgba(230,57,70,.12)'} : {}}>
        {isFailed ? '!' : isPaid ? '✓' : '…'}
      </div>
      <h2 style={{fontSize: '1.8rem', fontWeight: 800, marginBottom: '0.75rem'}}>
        {isFailed ? 'Paiement non confirmé' : isPaid ? 'Paiement confirmé' : 'Vérification du paiement'}
      </h2>
      <p style={{color: 'var(--text-secondary)', lineHeight: 1.6}}>
        {isFailed
          ? 'Votre commande n’a pas été validée et votre panier a été conservé.'
          : isPaid
            ? (isActivated ? 'Votre abonnement est prêt.' : 'Votre paiement est reçu. Nous terminons maintenant l’activation.')
            : 'Nous interrogeons le serveur de paiement. Cette vérification peut prendre quelques secondes.'}
      </p>

      <div className="confirmation-card">
        <div className="confirmation-meta">
          <div><small style={{color: 'var(--text-muted)'}}>Commande</small><div style={{fontWeight: 700}}>{orderId || 'Indisponible'}</div></div>
          {amount > 0 && <div><small style={{color: 'var(--text-muted)'}}>Montant</small><div style={{fontWeight: 700, color: 'var(--gold)'}}>{formatDA(amount)}</div></div>}
        </div>
        <div className="confirmation-steps">
          {steps.map((step, index) => (
            <div key={step.label} className={`confirmation-step ${step.done ? 'done' : ''} ${step.current ? 'current' : ''}`}>
              <div className="confirmation-step-icon">{step.done ? '✓' : index + 1}</div>
              <div style={{fontWeight: step.current || step.done ? 700 : 500, color: step.current ? 'var(--gold)' : 'var(--text-primary)'}}>{step.label}</div>
            </div>
          ))}
        </div>
      </div>

      {!isPaid && !isFailed && (
        <button className="btn btn-secondary" disabled={checking} onClick={async () => { setChecking(true); await checkStatus(); setChecking(false); }}>
          {checking ? 'Vérification en cours…' : 'Vérifier à nouveau'}
        </button>
      )}

      {isPaid && hasSpotify && !sent.Spotify && (
        <CredentialsForm service="Spotify" color="#1DB954" icon="🎵" creds={spotifyCreds} setCreds={setSpotifyCreds} onSubmit={(event) => { event.preventDefault(); submitCredentials('Spotify', spotifyCreds, setSpotifyCreds); }} sent={sent.Spotify} />
      )}
      {isPaid && hasCrunchyroll && !sent.Crunchyroll && (
        <CredentialsForm service="Crunchyroll" color="#F47521" icon="🍥" creds={crunchCreds} setCreds={setCrunchCreds} onSubmit={(event) => { event.preventDefault(); submitCredentials('Crunchyroll', crunchCreds, setCrunchCreds); }} sent={sent.Crunchyroll} />
      )}

      <div className="confirmation-actions">
        <button className="hero-cta" style={{animation: 'none'}} onClick={() => onNavigate('orders')}>Voir mes commandes</button>
        <a className="btn btn-secondary" href={`https://wa.me/213557828812?text=${supportMessage}`} target="_blank" rel="noopener noreferrer">Aide WhatsApp</a>
      </div>
    </div>
  );
}

function ProfilePage({ auth }) {
  const { t } = useLanguage();
  const meta = auth.user.user_metadata || {};
  const [firstName, setFirstName] = React.useState(meta.first_name || '');
  const [lastName, setLastName] = React.useState(meta.last_name || '');
  const [phone, setPhone] = React.useState(meta.phone || '');
  const [oldPassword, setOldPassword] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState({ type: '', text: '' });

  const handleUpdate = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });
    
    if (password) {
      if (!oldPassword) {
        setMessage({ type: 'error', text: t('errorOldPasswordRequired') });
        return;
      }
      if (password !== confirmPassword) {
        setMessage({ type: 'error', text: t('errorPasswordMismatch') });
        return;
      }
    }
    
    setLoading(true);
    const res = await auth.updateProfile(firstName, lastName, phone, oldPassword, password);
    if (res.success) {
      setMessage({ type: 'success', text: 'Profil mis à jour avec succès !' });
      setOldPassword('');
      setPassword('');
      setConfirmPassword('');
    } else {
      setMessage({ type: 'error', text: t(res.error) });
    }
    setLoading(false);
  };

  return (
    <div className="animate-fadeInUp reveal active" style={{maxWidth: '600px', margin: '0 auto'}}>
      <h2 style={{fontSize: '1.8rem', fontWeight: 800, marginBottom: '2rem'}}>{t('profileTitle')}</h2>
      <div className="dashboard-card">
        <form onSubmit={handleUpdate}>
          <div style={{marginBottom: '1.5rem'}}>
            <label style={{display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem'}}>{t('emailReadonly')}</label>
            <input type="text" className="form-input" value={auth.user.email} disabled style={{opacity: 0.6}} />
          </div>
          
          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem'}}>
            <div>
              <label style={{display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem'}}>{t('firstName')}</label>
              <input type="text" className="form-input" placeholder={t('firstName')} value={firstName} onChange={e => setFirstName(e.target.value)} />
            </div>
            <div>
              <label style={{display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem'}}>{t('lastName')}</label>
              <input type="text" className="form-input" placeholder={t('lastName')} value={lastName} onChange={e => setLastName(e.target.value)} />
            </div>
          </div>

          <div style={{marginBottom: '1.5rem'}}>
            <label style={{display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem'}}>{t('phoneNum')}</label>
            <input type="text" className="form-input" placeholder="Ex: 0557... ou +213..." value={phone} onChange={e => setPhone(e.target.value)} />
          </div>

          <hr style={{border: 'none', borderTop: '1px solid var(--border)', margin: '2rem 0'}} />
          <h3 style={{fontSize: '1.2rem', marginBottom: '1rem', fontWeight: 600}}>{t('security')}</h3>

          <div style={{marginBottom: '1rem'}}>
            <label style={{display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem'}}>{t('oldPass')}</label>
            <input type="password" className="form-input" placeholder={t('oldPassPh')} value={oldPassword} onChange={e => setOldPassword(e.target.value)} />
          </div>

          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem'}}>
            <div>
              <label style={{display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem'}}>{t('newPass')}</label>
              <input type="password" className="form-input" placeholder={t('newPassPh')} value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <div>
              <label style={{display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem'}}>{t('confirmPass')}</label>
              <input type="password" className="form-input" placeholder={t('confirmPass')} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
            </div>
          </div>

          {message.text && (
            <div style={{marginBottom: '1rem', color: message.type === 'success' ? 'var(--green-whatsapp)' : 'var(--red)', fontSize: '0.9rem', textAlign: 'center'}}>
              {message.text}
            </div>
          )}

          <button type="submit" className="form-submit" disabled={loading}>
            {loading ? t('loading') : t('saveChanges')}
          </button>
        </form>
      </div>
    </div>
  );
}
function CustomSelect({ value, onChange, options, style = {} }) {
  const [open, setOpen] = React.useState(false);
  const dropdownRef = React.useRef(null);

  React.useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.value === value) || options[0];

  return (
    <div ref={dropdownRef} style={{position: 'relative', display: 'inline-block', minWidth: '240px', textAlign: 'left', marginBottom: '0.85rem', ...style}}>
      <button 
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', padding: '0.85rem 1rem', background: 'var(--bg-card)', 
          color: 'white', border: `1px solid ${open ? 'var(--gold)' : 'var(--border)'}`, 
          borderRadius: 'var(--radius-xs)', display: 'flex', justifyContent: 'space-between', 
          alignItems: 'center', transition: 'var(--transition)',
          fontSize: '0.95rem'
        }}>
        <span>{selectedOption.label}</span>
        <span style={{transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s', fontSize: '0.8rem', color: 'var(--gold)'}}>▼</span>
      </button>

      {open && (
        <div className="animate-fadeIn" style={{
          position: 'absolute', top: 'calc(100% + 5px)', left: 0, right: 0, 
          background: 'var(--bg-secondary)', border: '1px solid var(--border)', 
          borderRadius: 'var(--radius-xs)', overflow: 'hidden', zIndex: 100,
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
        }}>
          {options.map((opt) => (
            <button 
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              style={{
                width: '100%', padding: '0.8rem 1rem', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.02)',
                color: value === opt.value ? 'var(--gold)' : 'var(--text-primary)', 
                textAlign: 'left', fontWeight: value === opt.value ? 600 : 400
              }}
              onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.05)'}
              onMouseLeave={(e) => e.target.style.background = 'none'}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminInventory({ auth }) {
  const [inventory, setInventory] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [form, setForm] = React.useState({ service: 'netflix', account_email: '', account_password: '', profiles: [{name: '', pin: ''}] });
  const [msg, setMsg] = React.useState('');
  const [editingId, setEditingId] = React.useState(null);
  const [editForm, setEditForm] = React.useState({});

  const fetchInv = async () => {
    try {
      const res = await fetch(API_BASE + '/admin/inventory', { headers: { 'Authorization': `Bearer ${auth.token}` } });
      const data = await res.json();
      if (res.ok && data.inventory) setInventory(data.inventory);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  React.useEffect(() => { fetchInv(); }, [auth.token]);

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      let payload;
      if (form.service === 'netflix') {
        payload = form.profiles.map(p => ({
          service: 'netflix',
          account_email: form.account_email,
          account_password: form.account_password,
          profile_name: p.name,
          profile_pin: p.pin
        }));
      } else {
        payload = {
          service: form.service,
          account_email: form.account_email,
          account_password: form.account_password
        };
      }

      const res = await fetch(API_BASE + '/admin/inventory', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.token}` },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setMsg('Compte(s) ajouté(s) au stock avec succès !');
        setForm({ ...form, account_email: '', account_password: '', profiles: [{name: '', pin: ''}] });
        fetchInv();
        setTimeout(() => setMsg(''), 3000);
      }
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Voulez-vous vraiment supprimer ce compte du stock ?")) return;
    try {
      const res = await fetch(API_BASE + '/admin/inventory/' + id, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${auth.token}` }
      });
      if (res.ok) fetchInv();
    } catch (e) { console.error(e); }
  };

  const handleSaveEdit = async (id) => {
    try {
      const res = await fetch(API_BASE + '/admin/inventory/' + id, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.token}` },
        body: JSON.stringify(editForm)
      });
      if (res.ok) {
        setEditingId(null);
        fetchInv();
      }
    } catch (e) { console.error(e); }
  };

  if (loading) return <div className="skeleton" style={{height: '200px'}}></div>;

  return (
    <div className="animate-fadeInUp">
      <div className="dashboard-card" style={{marginBottom: '2rem'}}>
        <h3 style={{marginBottom: '1rem', color: 'var(--gold)'}}>➕ Ajouter au Stock</h3>
        <form onSubmit={handleAdd} style={{display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end'}}>
          <div style={{flex: 1, minWidth: '200px'}}>
            <label style={{fontSize: '0.85rem', color: 'var(--text-secondary)'}}>Service</label>
            <div style={{width: '100%'}}>
              <CustomSelect
                value={form.service}
                onChange={(val) => setForm({...form, service: val})}
                options={[
                  {value: 'netflix', label: 'Netflix'},
                  {value: 'spotify', label: 'Spotify'},
                  {value: 'crunchyroll', label: 'Crunchyroll'}
                ]}
                style={{display: 'block', minWidth: 'unset', width: '100%'}}
              />
            </div>
          </div>
          <div style={{flex: 1, minWidth: '200px'}}>
            <label style={{fontSize: '0.85rem', color: 'var(--text-secondary)'}}>Email</label>
            <input required type="email" className="form-input" value={form.account_email} onChange={e => setForm({...form, account_email: e.target.value})} />
          </div>
          <div style={{flex: 1, minWidth: '200px'}}>
            <label style={{fontSize: '0.85rem', color: 'var(--text-secondary)'}}>{form.service === 'netflix' ? 'Mot de passe (Optionnel)' : 'Mot de passe'}</label>
            <input type="text" className="form-input" value={form.account_password} onChange={e => setForm({...form, account_password: e.target.value})} placeholder={form.service === 'netflix' ? 'Optionnel pour Netflix' : ''} />
          </div>
          {form.service === 'netflix' && (
            <div style={{width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem'}}>
              {form.profiles.map((p, index) => (
                <div key={index} style={{display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap'}}>
                  <div style={{flex: 1, minWidth: '150px'}}>
                    <label style={{fontSize: '0.85rem', color: 'var(--text-secondary)'}}>Nom Profil {index + 1} (Opt)</label>
                    <input type="text" className="form-input" value={p.name} onChange={e => {
                      const newProfiles = [...form.profiles];
                      newProfiles[index].name = e.target.value;
                      setForm({...form, profiles: newProfiles});
                    }} placeholder={`Ex: Profil ${index + 1}`} />
                  </div>
                  <div style={{flex: 1, minWidth: '150px'}}>
                    <label style={{fontSize: '0.85rem', color: 'var(--text-secondary)'}}>Code PIN {index + 1} (Opt)</label>
                    <input type="text" className="form-input" value={p.pin} onChange={e => {
                      const newProfiles = [...form.profiles];
                      newProfiles[index].pin = e.target.value;
                      setForm({...form, profiles: newProfiles});
                    }} placeholder="Ex: 1234" />
                  </div>
                  {index > 0 ? (
                    <button type="button" onClick={() => {
                      const newProfiles = form.profiles.filter((_, i) => i !== index);
                      setForm({...form, profiles: newProfiles});
                    }} style={{background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: '0.8rem', fontSize: '1.2rem', minWidth: '40px', marginBottom: '0.85rem'}}>&times;</button>
                  ) : (
                    <div style={{minWidth: '40px', marginBottom: '0.85rem'}}></div>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setForm({...form, profiles: [...form.profiles, {name: '', pin: ''}]})} style={{background: 'none', border: '1px dashed var(--border)', color: 'var(--text-secondary)', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer', alignSelf: 'flex-start'}}>+ Ajouter un profil</button>
            </div>
          )}
          <button type="submit" className="form-submit" style={{width: '100%', padding: '0.8rem 1.5rem', marginTop: '1rem'}}>Ajouter au Stock</button>
        </form>
        {msg && <p style={{color: 'var(--green-whatsapp)', marginTop: '1rem', fontSize: '0.9rem'}}>{msg}</p>}
      </div>

      <h3 style={{marginBottom: '1rem'}}>Stock Actuel ({inventory.length} comptes)</h3>
      <div style={{display: 'grid', gap: '1rem'}}>
        {inventory.length === 0 && <p style={{color: 'var(--text-secondary)'}}>Aucun compte en stock.</p>}
        {inventory.map(item => (
          <div key={item.id} className="dashboard-card" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', opacity: item.is_used ? 0.5 : 1}}>
            {editingId === item.id ? (
              <div style={{flex: 1, display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginRight: '1rem'}}>
                <input type="text" className="form-input" value={editForm.account_email} onChange={e => setEditForm({...editForm, account_email: e.target.value})} style={{padding: '0.4rem'}} placeholder="Email" />
                <input type="text" className="form-input" value={editForm.account_password} onChange={e => setEditForm({...editForm, account_password: e.target.value})} style={{padding: '0.4rem'}} placeholder="Mot de passe" />
                {item.service.toLowerCase().includes('netflix') && (
                  <>
                    <input type="text" className="form-input" value={editForm.profile_name || ''} onChange={e => setEditForm({...editForm, profile_name: e.target.value})} style={{padding: '0.4rem', width: '120px'}} placeholder="Profil" />
                    <input type="text" className="form-input" value={editForm.profile_pin || ''} onChange={e => setEditForm({...editForm, profile_pin: e.target.value})} style={{padding: '0.4rem', width: '80px'}} placeholder="PIN" />
                  </>
                )}
                <button onClick={() => handleSaveEdit(item.id)} className="form-submit" style={{padding: '0.4rem 1rem', width: 'auto'}}>Enregistrer</button>
                <button onClick={() => setEditingId(null)} style={{background: 'none', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '0.4rem 1rem', borderRadius: '4px', cursor: 'pointer'}}>Annuler</button>
              </div>
            ) : (
              <div style={{flex: 1}}>
                <span style={{fontWeight: 'bold', color: 'var(--gold)', textTransform: 'capitalize', marginRight: '1rem', display: 'inline-block', width: '90px'}}>{item.service}</span>
                <span style={{marginRight: '1rem'}}>{item.account_email}</span>
                <span style={{color: 'var(--text-secondary)'}}>{item.account_password}</span>
                {item.profile_name && (
                  <span style={{color: 'var(--netflix)', marginLeft: '1rem'}}>
                    👤 {item.profile_name} {item.profile_pin ? `(🔒 ${item.profile_pin})` : ''}
                  </span>
                )}
                {item.is_used && <span style={{marginLeft: '1rem', fontSize: '0.8rem', color: 'var(--red)'}}>● Assigné (CMD: {item.assigned_order_id})</span>}
                {!item.is_used && <span style={{marginLeft: '1rem', fontSize: '0.8rem', color: 'var(--green-whatsapp)'}}>● Disponible</span>}
              </div>
            )}
            {!item.is_used && editingId !== item.id && (
              <button onClick={() => { setEditingId(item.id); setEditForm({...item}); }} style={{background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontSize: '1.2rem', padding: '0 0.5rem', marginRight: '0.5rem'}}>✏️</button>
            )}
            {editingId !== item.id && (
              <button onClick={() => handleDelete(item.id)} style={{background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: '1.5rem', padding: '0 0.5rem'}}>&times;</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminStats({ orders, auth }) {
  const [inventory, setInventory] = React.useState([]);

  React.useEffect(() => {
    const fetchInv = async () => {
      try {
        const res = await fetch(API_BASE + '/admin/inventory', { headers: { 'Authorization': `Bearer ${auth.token}` } });
        const data = await res.json();
        if (res.ok && data.inventory) setInventory(data.inventory);
      } catch (e) {}
    };
    fetchInv();
  }, [auth.token]);

  const activeOrders = orders.filter(o => o.status === 'active');
  const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
  const availableStock = inventory.filter(i => !i.is_used).length;
  const usedStock = inventory.filter(i => i.is_used).length;

  // Orders per day (last 7 days)
  const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
  const last7 = Array.from({length: 7}, (_, i) => {
    const day = daysAgo(6 - i);
    const dayStr = day.toLocaleDateString('fr-FR', { weekday: 'short' });
    const count = orders.filter(o => {
      const d = new Date(o.created_at);
      return d.toDateString() === day.toDateString();
    }).length;
    return { label: dayStr, count };
  });
  const maxCount = Math.max(...last7.map(d => d.count), 1);

  // Service distribution
  const countService = (name) => orders.filter(o => JSON.stringify(o.items || []).toLowerCase().includes(name)).length;
  const services = [
    { name: 'Netflix', count: countService('netflix'), color: 'var(--netflix)' },
    { name: 'Spotify', count: countService('spotify'), color: 'var(--spotify)' },
    { name: 'Crunchyroll', count: countService('crunchyroll'), color: 'var(--crunchyroll)' },
  ];
  const maxService = Math.max(...services.map(s => s.count), 1);

  const KpiCard = ({ icon, label, value, color }) => (
    <div className="dashboard-card" style={{padding: '1.5rem', textAlign: 'center', flex: 1, minWidth: '150px'}}>
      <div style={{fontSize: '2rem', marginBottom: '0.5rem'}}>{icon}</div>
      <div style={{fontSize: '2rem', fontWeight: 800, color: color || 'var(--gold)', marginBottom: '0.3rem'}}>{value}</div>
      <div style={{fontSize: '0.85rem', color: 'var(--text-secondary)'}}>{label}</div>
    </div>
  );

  return (
    <div className="animate-fadeInUp">
      <div style={{display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem'}}>
        <KpiCard icon="💰" label="Revenu Total" value={`${totalRevenue.toLocaleString()} DA`} />
        <KpiCard icon="📦" label="Total Commandes" value={orders.length} color="var(--text-primary)" />
        <KpiCard icon="✅" label="Actives" value={activeOrders.length} color="var(--spotify)" />
        <KpiCard icon="📦" label="Stock Dispo" value={availableStock} color={availableStock === 0 ? 'var(--red)' : 'var(--spotify)'} />
      </div>

      <div className="dashboard-card" style={{padding: '1.5rem', marginBottom: '2rem'}}>
        <h3 style={{marginBottom: '1.5rem', color: 'var(--gold)'}}>Commandes (7 derniers jours)</h3>
        <div style={{display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height: '120px'}}>
          {last7.map((d, i) => (
            <div key={i} style={{flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem'}}>
              <span style={{fontSize: '0.75rem', color: 'var(--text-secondary)'}}>{d.count}</span>
              <div style={{width: '100%', maxWidth: '40px', height: `${Math.max((d.count / maxCount) * 100, 5)}%`, background: 'linear-gradient(to top, var(--gold), var(--gold-light))', borderRadius: '4px 4px 0 0', transition: 'height 0.5s ease'}} />
              <span style={{fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'capitalize'}}>{d.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="dashboard-card" style={{padding: '1.5rem'}}>
        <h3 style={{marginBottom: '1.5rem', color: 'var(--gold)'}}>Répartition par service</h3>
        <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
          {services.map((s, i) => (
            <div key={i}>
              <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem'}}>
                <span style={{fontWeight: 600}}>{s.name}</span>
                <span style={{color: 'var(--text-secondary)'}}>{s.count} commande(s)</span>
              </div>
              <div style={{height: '8px', background: 'var(--bg-card)', borderRadius: '4px', overflow: 'hidden'}}>
                <div style={{height: '100%', width: `${(s.count / maxService) * 100}%`, background: s.color, borderRadius: '4px', transition: 'width 0.5s ease'}} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const ORDER_STATUS_LABELS = {
  pending: 'En traitement',
  active: 'Active',
  cancelled: 'Annulée',
  completed: 'Terminée',
};

function orderStatusLabel(order) {
  if (order.payment_status !== 'paid' && order.status === 'pending') return 'Paiement en attente';
  return ORDER_STATUS_LABELS[order.status] || 'Statut indisponible';
}

function activationEtaLabel(order, items) {
  if (order.status !== 'pending' || order.payment_status !== 'paid') return '';
  const manual = items.some((item) => /spotify|crunchyroll/i.test(String(item?.name || '')));
  return manual
    ? 'Activation de vos services en cours. Le délai dépend de la disponibilité de notre équipe.'
    : 'Paiement reçu. Attribution automatique en cours selon le stock disponible.';
}

function AdminPromoCodes({ auth }) {
  const emptyForm = {
    code: '',
    discount_type: 'percentage',
    discount_value: '',
    starts_at: '',
    ends_at: '',
    max_uses: '',
    services: [],
    active: true,
  };
  const [promoCodes, setPromoCodes] = React.useState([]);
  const [form, setForm] = React.useState(emptyForm);
  const [createdCode, setCreatedCode] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  const loadPromoCodes = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/admin/promo-codes`, {
        headers: { Authorization: `Bearer ${auth.token}` },
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Chargement impossible.');
      setPromoCodes(Array.isArray(data.promo_codes) ? data.promo_codes : []);
    } catch (err) {
      setError(err.message || 'Impossible de charger les codes promo.');
    } finally {
      setLoading(false);
    }
  }, [auth.token]);

  React.useEffect(() => {
    loadPromoCodes();
  }, [loadPromoCodes]);

  const toggleService = (service) => {
    setForm((current) => ({
      ...current,
      services: current.services.includes(service)
        ? current.services.filter((value) => value !== service)
        : [...current.services, service],
    }));
  };

  const createPromo = async (event) => {
    event.preventDefault();
    const code = form.code.trim().toUpperCase();
    const value = Number(form.discount_value);
    const maxUses = form.max_uses === '' ? null : Number(form.max_uses);
    if (!/^[A-Z0-9_-]{4,32}$/.test(code)) {
      setError('Le code doit contenir 4 à 32 caractères : lettres, chiffres, tiret ou underscore.');
      return;
    }
    if (!Number.isFinite(value) || value <= 0 || (form.discount_type === 'percentage' && value > 100)) {
      setError('La remise doit être positive et ne peut pas dépasser 100 %.');
      return;
    }
    if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses <= 0)) {
      setError('Le nombre maximal d’utilisations doit être un entier positif.');
      return;
    }
    if (form.starts_at && form.ends_at && new Date(form.ends_at) <= new Date(form.starts_at)) {
      setError('La date de fin doit être postérieure à la date de début.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/admin/promo-codes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({
          code,
          discount_type: form.discount_type,
          discount_value: value,
          starts_at: form.starts_at || null,
          ends_at: form.ends_at || null,
          max_uses: maxUses,
          services: form.services,
          active: form.active,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Création impossible.');
      setCreatedCode(code);
      setForm(emptyForm);
      await loadPromoCodes();
    } catch (err) {
      setError(err.message || 'Impossible de créer le code promo.');
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (promo, active) => {
    setError('');
    try {
      const response = await fetch(`${API_BASE}/admin/promo-codes`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({ id: promo.id, active }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Mise à jour impossible.');
      setPromoCodes((current) => current.map((item) => item.id === promo.id ? { ...item, active } : item));
    } catch (err) {
      setError(err.message || 'Impossible de modifier le code promo.');
    }
  };

  const discountLabel = (promo) => ['percentage', 'percent'].includes(promo.discount_type)
    ? `${Number(promo.discount_value)} %`
    : formatDA(promo.discount_value);

  return (
    <div>
      {createdCode && (
        <div className="dashboard-card" style={{border: '1px solid var(--spotify)', marginBottom: '1.5rem'}} role="status">
          <strong style={{color: 'var(--spotify)'}}>Code créé — copiez-le maintenant</strong>
          <p style={{color: 'var(--text-secondary)', margin: '0.5rem 0'}}>Pour votre sécurité, l’API ne pourra pas réafficher ce code en clair.</p>
          <div style={{display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap'}}>
            <code style={{fontSize: '1.15rem', color: 'var(--gold)'}}>{createdCode}</code>
            <button type="button" className="btn btn-secondary" onClick={() => navigator.clipboard.writeText(createdCode)}>Copier</button>
            <button type="button" className="btn btn-secondary" onClick={() => setCreatedCode('')}>J’ai terminé</button>
          </div>
        </div>
      )}

      <form className="dashboard-card" onSubmit={createPromo} style={{marginBottom: '1.5rem'}}>
        <h3 style={{marginBottom: '1rem'}}>Créer un code promo</h3>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem'}}>
          <label>Code
            <input className="form-input" value={form.code} onChange={(event) => setForm({...form, code: event.target.value.toUpperCase()})} placeholder="AURA10" maxLength={32} required />
          </label>
          <label>Type de remise
            <select className="form-input" value={form.discount_type} onChange={(event) => setForm({...form, discount_type: event.target.value})}>
              <option value="percentage">Pourcentage</option>
              <option value="fixed">Montant fixe</option>
            </select>
          </label>
          <label>Valeur
            <input className="form-input" type="number" min="1" max={form.discount_type === 'percentage' ? 100 : undefined} step="1" value={form.discount_value} onChange={(event) => setForm({...form, discount_value: event.target.value})} required />
          </label>
          <label>Utilisations maximales
            <input className="form-input" type="number" min="1" step="1" value={form.max_uses} onChange={(event) => setForm({...form, max_uses: event.target.value})} placeholder="Illimité" />
          </label>
          <label>Début
            <input className="form-input" type="datetime-local" value={form.starts_at} onChange={(event) => setForm({...form, starts_at: event.target.value})} />
          </label>
          <label>Fin
            <input className="form-input" type="datetime-local" value={form.ends_at} onChange={(event) => setForm({...form, ends_at: event.target.value})} />
          </label>
        </div>
        <fieldset style={{border: 0, margin: '1rem 0'}}>
          <legend style={{marginBottom: '0.5rem'}}>Services concernés (aucun = tous)</legend>
          <div style={{display: 'flex', gap: '1rem', flexWrap: 'wrap'}}>
            {['Netflix', 'Spotify', 'Crunchyroll'].map((service) => (
              <label key={service}><input type="checkbox" checked={form.services.includes(service)} onChange={() => toggleService(service)} /> {service}</label>
            ))}
          </div>
        </fieldset>
        <label style={{display: 'block', marginBottom: '1rem'}}><input type="checkbox" checked={form.active} onChange={(event) => setForm({...form, active: event.target.checked})} /> Activer dès la création</label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="form-submit" disabled={saving}>{saving ? 'Création…' : 'Créer le code promo'}</button>
      </form>

      <div className="dashboard-card">
        <h3 style={{marginBottom: '1rem'}}>Codes existants</h3>
        {loading ? (
          <p>Chargement des codes promo…</p>
        ) : promoCodes.length === 0 ? (
          <p style={{color: 'var(--text-secondary)'}}>Aucun code promo créé.</p>
        ) : (
          <div style={{overflowX: 'auto'}}>
            <table style={{width: '100%', borderCollapse: 'collapse'}}>
              <thead><tr><th>Code</th><th>Remise</th><th>Période</th><th>Usages</th><th>Services</th><th>État</th></tr></thead>
              <tbody>
                {promoCodes.map((promo) => (
                  <tr key={promo.id}>
                    <td>{promo.masked_code || `${promo.code_prefix || 'PROMO'}••••`}</td>
                    <td>{discountLabel(promo)}</td>
                    <td>{promo.starts_at ? new Date(promo.starts_at).toLocaleDateString('fr-DZ') : 'Immédiate'} → {promo.ends_at ? new Date(promo.ends_at).toLocaleDateString('fr-DZ') : 'Sans fin'}</td>
                    <td>{Number(promo.usage_count) || 0} / {promo.max_uses || '∞'}</td>
                    <td>{Array.isArray(promo.services) && promo.services.length ? promo.services.join(', ') : 'Tous'}</td>
                    <td><button type="button" className="btn btn-secondary" aria-pressed={Boolean(promo.active)} onClick={() => setActive(promo, !promo.active)}>{promo.active ? 'Actif' : 'Inactif'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AdminDashboard({ auth }) {
  const [orders, setOrders] = React.useState([]);
  const [inventory, setInventory] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [filterService, setFilterService] = React.useState('all');
  const [filterStatus, setFilterStatus] = React.useState('all');
  const [filterDateFrom, setFilterDateFrom] = React.useState('');
  const [filterDateTo, setFilterDateTo] = React.useState('');
  const [sortDate, setSortDate] = React.useState('desc');
  const [currentPage, setCurrentPage] = React.useState(1);
  const [adminTab, setAdminTab] = React.useState('orders');
  const [pageInfo, setPageInfo] = React.useState({ total: 0, totalPages: 1 });
  const ordersPerPage = 25;

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, filterService, filterStatus, filterDateFrom, filterDateTo, sortDate]);

  React.useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      setError('');
      try {
        const query = new URLSearchParams({
          page: String(currentPage),
          limit: String(ordersPerPage),
          sort: sortDate,
        });
        if (debouncedSearch) query.set('search', debouncedSearch);
        if (filterService !== 'all') query.set('service', filterService);
        if (filterStatus !== 'all') query.set('status', filterStatus);
        if (filterDateFrom) query.set('date_from', filterDateFrom);
        if (filterDateTo) query.set('date_to', filterDateTo);
        const res = await fetch(`${API_BASE}/admin/all-orders?${query.toString()}`, {
          headers: { 'Authorization': `Bearer ${auth.token}` },
          cache: 'no-store'
        });
        const data = await res.json().catch(() => ({}));
        
        if (res.ok && data.orders) {
          setOrders(data.orders);
          setPageInfo({
            total: Number(data.total) || data.orders.length,
            totalPages: Math.max(1, Number(data.total_pages) || 1),
          });
        } else {
          setError(data.error || 'Erreur lors du chargement des commandes');
        }
      } catch (err) {
        setError('Impossible de charger les commandes. Vérifiez votre connexion puis réessayez.');
      }
      setLoading(false);
    };
    fetchOrders();
  }, [auth.token, currentPage, debouncedSearch, filterService, filterStatus, filterDateFrom, filterDateTo, sortDate]);

  React.useEffect(() => {
    const fetchInventory = async () => {
      try {
        const res = await fetch(API_BASE + '/admin/inventory', {
          headers: { 'Authorization': `Bearer ${auth.token}` },
          cache: 'no-store',
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.inventory) setInventory(data.inventory);
      } catch {}
    };
    if (auth.token) fetchInventory();
  }, [auth.token]);

  if (loading) return (
    <div className="orders-container animate-fadeInUp">
      <div className="section-header">
        <h2 style={{color: 'var(--gold)'}}>👑 Panel Administration</h2>
        <p>Chargement en cours...</p>
      </div>
      <div className="orders-list">
        {[1, 2, 3].map(i => (
          <div key={i} className="dashboard-card skeleton" style={{height: '150px', marginBottom: '1rem'}}></div>
        ))}
      </div>
    </div>
  );
  if (error) return <div className="error" style={{color: 'var(--red)', padding: '2rem', textAlign: 'center'}}>{error}</div>;

  const totalPages = pageInfo.totalPages;
  const currentOrders = orders;
  const pageButtons = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages])]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);

  return (
    <div className="orders-container animate-fadeInUp">
      <div className="section-header">
        <h2 style={{color: 'var(--gold)'}}>👑 Panel Administration</h2>
        <div style={{display: 'flex', gap: '1rem', marginTop: '1rem', justifyContent: 'center', flexWrap: 'wrap'}}>
          <button className={`nav-btn ${adminTab === 'orders' ? 'active' : ''}`} style={adminTab === 'orders' ? {color: 'var(--gold)', borderBottom: '2px solid var(--gold)', borderRadius: 0} : {borderRadius: 0}} onClick={() => setAdminTab('orders')}>📦 Commandes</button>
          <button className={`nav-btn ${adminTab === 'inventory' ? 'active' : ''}`} style={adminTab === 'inventory' ? {color: 'var(--gold)', borderBottom: '2px solid var(--gold)', borderRadius: 0} : {borderRadius: 0}} onClick={() => setAdminTab('inventory')}>📦 Stocks</button>
          <button className={`nav-btn ${adminTab === 'promos' ? 'active' : ''}`} style={adminTab === 'promos' ? {color: 'var(--gold)', borderBottom: '2px solid var(--gold)', borderRadius: 0} : {borderRadius: 0}} onClick={() => setAdminTab('promos')}>🏷️ Codes promo</button>
          <button className={`nav-btn ${adminTab === 'stats' ? 'active' : ''}`} style={adminTab === 'stats' ? {color: 'var(--gold)', borderBottom: '2px solid var(--gold)', borderRadius: 0} : {borderRadius: 0}} onClick={() => setAdminTab('stats')}>📊 Stats</button>
        </div>
      </div>

      {adminTab === 'stats' ? (
        <AdminStats orders={orders} auth={auth} />
      ) : adminTab === 'inventory' ? (
        <AdminInventory auth={auth} />
      ) : adminTab === 'promos' ? (
        <AdminPromoCodes auth={auth} />
      ) : (
        <React.Fragment>

      <div style={{display: 'flex', gap: '0.5rem', marginBottom: '2rem', flexWrap: 'wrap', justifyContent: 'center', background: 'rgba(255,255,255,0.03)', padding: '0.5rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)'}}>
        <button onClick={() => {setFilterStatus('all'); setCurrentPage(1);}} style={{padding: '0.6rem 1.2rem', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 600, transition: 'all 0.3s', background: filterStatus === 'all' ? 'var(--gold)' : 'transparent', color: filterStatus === 'all' ? '#000' : 'var(--text-secondary)'}}>Toutes</button>
        <button onClick={() => {setFilterStatus('pending'); setCurrentPage(1);}} style={{padding: '0.6rem 1.2rem', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 600, transition: 'all 0.3s', background: filterStatus === 'pending' ? 'var(--gold)' : 'transparent', color: filterStatus === 'pending' ? '#000' : 'var(--text-secondary)'}}>En attente</button>
        <button onClick={() => {setFilterStatus('active'); setCurrentPage(1);}} style={{padding: '0.6rem 1.2rem', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 600, transition: 'all 0.3s', background: filterStatus === 'active' ? 'var(--spotify)' : 'transparent', color: filterStatus === 'active' ? '#000' : 'var(--text-secondary)'}}>Confirmées</button>
        <button onClick={() => {setFilterStatus('cancelled'); setCurrentPage(1);}} style={{padding: '0.6rem 1.2rem', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 600, transition: 'all 0.3s', background: filterStatus === 'cancelled' ? 'var(--red)' : 'transparent', color: filterStatus === 'cancelled' ? '#fff' : 'var(--text-secondary)'}}>Annulées</button>
      </div>

      <div style={{display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap', justifyContent: 'center'}}>
        <label style={{display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: '240px', color: 'var(--text-secondary)', fontSize: '0.8rem'}}>
          Rechercher une commande
          <input
            id="admin-order-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ID, email client…"
            aria-label="Rechercher par identifiant ou email"
            className="form-input"
          />
        </label>
        <CustomSelect 
          value={filterService} 
          onChange={(val) => {setFilterService(val); setCurrentPage(1);}} 
          options={[
            { value: 'all', label: 'Tous les services' },
            { value: 'netflix', label: 'Netflix' },
            { value: 'spotify', label: 'Spotify' },
            { value: 'crunchyroll', label: 'Crunchyroll' }
          ]} 
        />
        <label style={{display: 'flex', flexDirection: 'column', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.8rem'}}>
          Du
          <input type="date" value={filterDateFrom} onChange={(event) => setFilterDateFrom(event.target.value)} className="form-input" aria-label="Date de début" />
        </label>
        <label style={{display: 'flex', flexDirection: 'column', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.8rem'}}>
          Au
          <input type="date" value={filterDateTo} onChange={(event) => setFilterDateTo(event.target.value)} className="form-input" aria-label="Date de fin" />
        </label>
        <button onClick={() => setSortDate(sortDate === 'desc' ? 'asc' : 'desc')} style={{background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)', padding: '0.6rem 1.2rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, transition: 'all 0.3s', height: '42px'}}>
          {sortDate === 'desc' ? '⬇️ Plus récentes' : '⬆️ Plus anciennes'}
        </button>
      </div>

      <div className="orders-list">
        {currentOrders.length === 0 ? (
          <div className="dashboard-card" style={{textAlign: 'center', padding: '3rem'}}>
            <p>Aucune commande ne correspond aux critères.</p>
          </div>
        ) : (
          currentOrders.map((order) => {
            const items = parseOrderItems(order.items);
            const date = new Date(order.created_at).toLocaleString('fr-DZ');
            let statusColor = 'var(--text-secondary)';
            if (order.status === 'active') statusColor = 'var(--spotify)';
            if (order.status === 'cancelled') statusColor = 'var(--red)';
            if (order.status === 'pending') statusColor = 'var(--gold)';
            
            let daysLeftText = '';
            if (order.status === 'active' && order.expires_at) {
              const diffMs = new Date(order.expires_at) - new Date();
              const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
              daysLeftText = daysLeft > 0 ? ` (Expire dans ${daysLeft} jours)` : ' (Expiré)';
              if (daysLeft <= 3 && daysLeft > 0) statusColor = 'var(--red)'; // Alerte expiration proche
            }

            return (
              <div key={order.order_id} className="dashboard-card" style={{marginBottom: '1rem', borderLeft: `4px solid ${statusColor}`}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem'}}>
                  <div>
                    <h3 style={{fontSize: '1.2rem', marginBottom: '0.5rem'}}>{order.order_id}</h3>
                    <p style={{color: 'var(--text-secondary)', fontSize: '0.9rem'}}>Client : <span style={{color: 'var(--text-primary)'}}>{order.assigned_email}</span></p>
                    <p style={{color: 'var(--text-secondary)', fontSize: '0.9rem'}}>Date : {date}</p>
                    <div style={{marginTop: '1rem'}}>
                      {items.map((item, i) => {
                        const orderInvItems = inventory.filter(inv => inv.assigned_order_id === order.order_id);
                        const cred = orderInvItems.find(inv => item?.name?.toLowerCase().includes(inv?.service?.toLowerCase() || ''));
                        return (
                          <div key={i} style={{background: 'var(--bg-card)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-xs)', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap'}}>
                            <span>{item.name} (x{item.quantity})</span>
                            <span style={{fontWeight: 600, color: 'var(--gold)'}}>{item.price} DA</span>
                            {cred && (
                              <div style={{width: '100%', marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', padding: '0.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', border: '1px dashed rgba(255,255,255,0.1)'}}>
                                📧 <strong style={{color: '#fff'}}>{cred.account_email}</strong> | 🔑 <strong style={{color: '#fff'}}>{cred.account_password}</strong>
                              </div>
                            )}
                            {item.client_credentials && (
                              <div style={{width: '100%', marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', padding: '0.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', border: '1px dashed rgba(255,255,255,0.1)'}}>
                                📧 <strong style={{color: '#fff'}}>{item.client_credentials.email}</strong> | 🔑 <strong style={{color: '#fff'}}>{item.client_credentials.password}</strong> | 💬 <strong style={{color: '#fff'}}>{item.client_credentials.whatsapp}</strong>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{textAlign: 'right'}}>
                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem', marginBottom: '0.5rem'}}>
                      <div style={{position: 'relative', display: 'inline-flex', alignItems: 'center'}}>
                        <CustomSelect 
                          value={order.status}
                          onChange={async (val) => {
                            const newStatus = val;
                            const t = getAccessToken();
                            if (!t) return;
                            
                            // Optimistic update
                            setOrders(prev => prev.map(o => o.order_id === order.order_id ? {...o, status: newStatus} : o));
                            
                            try {
                              const res = await fetch(API_BASE+'/admin/update-order-status', {
                                method: 'POST',
                                headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer '+t},
                                body: JSON.stringify({ order_id: order.order_id, status: newStatus })
                              });
                              if (!res.ok) {
                                 alert("Erreur lors de la mise à jour");
                                 window.location.reload();
                              }
                            } catch (err) {
                              alert("Erreur réseau");
                            }
                          }}
                          options={[
                            { value: 'pending', label: '⏳ EN ATTENTE' },
                            { value: 'active', label: '✅ CONFIRMÉ' },
                            { value: 'cancelled', label: '❌ ANNULÉ' }
                          ]}
                          style={{ minWidth: '160px' }}
                        />
                      </div>
                    </div>
                    {daysLeftText && <div style={{fontSize: '0.85rem', color: statusColor, fontWeight: 600, marginBottom: '0.5rem'}}>{daysLeftText}</div>}
                    {activationEtaLabel(order, items) && <div style={{fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '280px'}}>{activationEtaLabel(order, items)}</div>}
                    <div style={{fontSize: '0.8rem', color: statusColor, marginTop: '0.35rem'}}>{orderStatusLabel(order)}</div>
                    <div style={{fontSize: '1.4rem', fontWeight: 700, marginTop: '0.5rem'}}>
                      Total: {order.amount} DA
                    </div>
                    <div style={{marginTop: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end'}}>
                      <a href="#" onClick={(e) => {
                        e.preventDefault();
                        const phone = prompt('Entrez le numéro de téléphone (WhatsApp) du client pour le relancer :');
                        if (phone) window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}`, '_blank');
                      }} className="btn btn-secondary" style={{padding: '0.5rem 1rem', fontSize: '0.85rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)'}}>💬 WhatsApp</a>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {totalPages > 1 && (
        <div style={{display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '3rem'}}>
          <button 
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: currentPage === 1 ? 'transparent' : 'rgba(255,255,255,0.1)', color: currentPage === 1 ? 'rgba(255,255,255,0.2)' : 'var(--text-primary)', cursor: currentPage === 1 ? 'default' : 'pointer', transition: 'all 0.3s', fontWeight: 600 }}
          >
            Précédent
          </button>
          
          {pageButtons.map((page) => (
            <button 
              key={page}
              onClick={() => setCurrentPage(page)}
              aria-label={`Aller à la page ${page}`}
              aria-current={currentPage === page ? 'page' : undefined}
              style={{
                width: '40px', height: '40px', borderRadius: '50%', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, cursor: 'pointer', transition: 'all 0.3s',
                 background: currentPage === page ? 'var(--gold)' : 'transparent',
                 color: currentPage === page ? '#000' : 'var(--text-secondary)',
                 boxShadow: currentPage === page ? '0 4px 12px rgba(212,175,55,0.3)' : 'none'
               }}
            >
              {page}
            </button>
          ))}

          <button 
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: currentPage === totalPages ? 'transparent' : 'rgba(255,255,255,0.1)', color: currentPage === totalPages ? 'rgba(255,255,255,0.2)' : 'var(--text-primary)', cursor: currentPage === totalPages ? 'default' : 'pointer', transition: 'all 0.3s', fontWeight: 600 }}
          >
            Suivant
          </button>
        </div>
      )}
        </React.Fragment>
      )}
    </div>
  );
}

const NetflixOTPButton = ({ orderId, auth, account }) => {
  const [loading, setLoading] = React.useState(false);
  const [code, setCode] = React.useState(null);
  const [copied, setCopied] = React.useState(false);

  const getInitialCooldown = () => {
    try {
      const expiry = localStorage.getItem(`otp_cooldown_${orderId}`);
      if (expiry) {
        const remaining = Math.ceil((Number(expiry) - Date.now()) / 1000);
        return remaining > 0 ? remaining : 0;
      }
    } catch(e) {}
    return 0;
  };

  const [cooldown, setCooldown] = React.useState(getInitialCooldown);

  const startCooldownWithStorage = (seconds) => {
    setCooldown(seconds);
    try {
      localStorage.setItem(`otp_cooldown_${orderId}`, String(Date.now() + seconds * 1000));
    } catch(e) {}
  };

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown(c => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const copyEmail = () => {
    if (!account?.email) return;
    navigator.clipboard.writeText(account.email).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const getOTP = async () => {
    if (loading || cooldown > 0) return;
    setLoading(true);
    setCode(null);
    try {
      const res = await fetch(API_BASE + '/get-netflix-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.token}` },
        body: JSON.stringify({ order_id: orderId })
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("Retry-After")) || 12;
        alert(`Trop de tentatives. Réessayez dans ${retryAfter}s.`);
        startCooldownWithStorage(retryAfter);
      } else if (res.ok && (data.code || data.link)) {
        setCode(data.code || data.link);
        startCooldownWithStorage(12);
      } else {
        alert(data.error || "Aucun code trouvé pour l'instant. Demandez le code sur Netflix puis réessayez.");
        startCooldownWithStorage(12);
      }
    } catch(err) {
      alert("Erreur réseau. Impossible de contacter le serveur.");
    }
    setLoading(false);
  };

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem'}}>
      {/* Encadré Compte assigné */}
      {account?.email ? (
        <div style={{
          background: 'linear-gradient(160deg, rgba(229, 9, 20, 0.15), rgba(255, 255, 255, 0.03))',
          border: '1px solid rgba(229, 9, 20, 0.4)',
          borderRadius: '14px',
          padding: '1.25rem',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)'
        }}>
          <div style={{display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9aa3b2', marginBottom: '8px'}}>
            <span style={{display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#35d07f', boxShadow: '0 0 8px #35d07f'}}></span>
            Email de connexion Netflix assigné
          </div>
          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '12px'}}>
            <span style={{fontSize: '1.1rem', fontWeight: 'bold', color: '#fff', wordBreak: 'break-all'}}>{account.email}</span>
            <button onClick={copyEmail} type="button" style={{
              background: copied ? 'rgba(53, 208, 127, 0.2)' : 'rgba(255,255,255,0.1)',
              border: copied ? '1px solid #35d07f' : '1px solid rgba(255,255,255,0.2)',
              color: copied ? '#35d07f' : '#fff',
              padding: '6px 12px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.85rem'
            }}>
              {copied ? 'Copié ✓' : '📋 Copier l\'email'}
            </button>
          </div>
          {(account.profile_name || account.profile_pin) && (
            <div style={{display: 'flex', gap: '20px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '10px', marginBottom: '12px'}}>
              {account.profile_name && (
                <div>
                  <div style={{fontSize: '0.72rem', textTransform: 'uppercase', color: '#9aa3b2'}}>Profil</div>
                  <div style={{fontSize: '0.95rem', fontWeight: 'bold'}}>{account.profile_name}</div>
                </div>
              )}
              {account.profile_pin && (
                <div>
                  <div style={{fontSize: '0.72rem', textTransform: 'uppercase', color: '#9aa3b2'}}>Code PIN</div>
                  <div style={{fontSize: '0.95rem', fontWeight: 'bold', color: '#E50914'}}>{account.profile_pin}</div>
                </div>
              )}
            </div>
          )}
          <ol style={{margin: 0, paddingLeft: '18px', fontSize: '0.85rem', color: '#9aa3b2', lineHeight: '1.5'}}>
            <li>Connectez-vous sur Netflix avec <strong style={{color: '#fff'}}>cet email</strong>.</li>
            <li>Cliquez sur <strong style={{color: '#fff'}}>« Obtenir le code Netflix »</strong> ci-dessous lorsque Netflix vous demande le code par email.</li>
          </ol>
        </div>
      ) : (
        <div style={{background: 'rgba(255,165,0,0.1)', border: '1px solid rgba(255,165,0,0.3)', padding: '1rem', borderRadius: '10px', color: 'orange', fontSize: '0.9rem'}}>
          ⏳ Attribution automatique de votre compte Netflix en cours...
        </div>
      )}

      {/* Section Bouton OTP */}
      <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(229,9,20,0.1)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(229,9,20,0.3)'}}>
        <h5 style={{color: '#E50914', margin: 0}}>🔒 Code de connexion Netflix</h5>
        <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0}}>
          Une fois la demande de code déclenchée sur Netflix, cliquez sur le bouton ci-dessous pour l'afficher instantanément.
        </p>
        {code ? (
          <div style={{fontSize: '1.5rem', letterSpacing: '4px', fontWeight: 'bold', color: '#E50914', padding: '0.5rem 0'}}>
            {code}
          </div>
        ) : (
          <button className="btn" onClick={getOTP} disabled={loading || cooldown > 0} style={{background: (loading || cooldown > 0) ? 'rgba(229,9,20,0.5)' : '#E50914', color: '#fff', width: 'fit-content', fontWeight: 'bold', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '8px', cursor: (loading || cooldown > 0) ? 'not-allowed' : 'pointer'}}>
            {loading ? 'Recherche du code en cours...' : cooldown > 0 ? `⏳ Réessayer dans ${cooldown}s...` : '📥 Obtenir le code Netflix'}
          </button>
        )}
      </div>
    </div>
  );
};


function OrdersPage({ auth }) {
  const { t } = useLanguage();
  const [orders, setOrders] = React.useState([]);
  const [credentials, setCredentials] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [expandedOrders, setExpandedOrders] = React.useState({});
  
  const toggleExpanded = (id) => setExpandedOrders(prev => ({...prev, [id]: !prev[id]}));

  const fetchOrders = React.useCallback(async () => {
    try {
      const res = await fetch(API_BASE + '/my-orders?t=' + Date.now(), {
        headers: { 'Authorization': `Bearer ${auth.token}` },
        cache: 'no-store'
      });
      const data = await res.json();
      if (res.ok && data.orders) {
        setOrders(data.orders.filter(order => order.payment_status === 'paid'));
        try {
          const credRes = await fetch(API_BASE + '/my-credentials', { headers: { 'Authorization': `Bearer ${auth.token}` } });
          const credData = await credRes.json();
          if (credRes.ok && credData.credentials) setCredentials(credData.credentials);
        } catch(e) {}
      } else {
        setError(data.error || 'Erreur lors du chargement des commandes');
      }
    } catch (err) {
      setError('Erreur réseau. Vérifiez votre connexion puis réessayez.');
    }
    setLoading(false);
  }, [auth.token]);

  React.useEffect(() => {
    if (auth.token) fetchOrders();
    const handleRefresh = () => { if (auth.token) fetchOrders(); };
    window.addEventListener('refresh_orders', handleRefresh);
    return () => window.removeEventListener('refresh_orders', handleRefresh);
  }, [auth.token, fetchOrders]);

  if (loading) return (
    <div className="orders-container animate-fadeInUp">
      <div className="section-header">
        <h2>📦 {t('navOrders')}</h2>
        <p>Chargement de vos commandes...</p>
      </div>
      <div className="orders-list">
        {[1, 2].map(i => (
          <div key={i} className="dashboard-card skeleton" style={{height: '150px', marginBottom: '1rem'}}></div>
        ))}
      </div>
    </div>
  );
  if (error) return <div className="error" style={{color: 'var(--red)', padding: '2rem', textAlign: 'center'}}>{error}</div>;

  return (
    <div className="animate-fadeInUp reveal active" style={{maxWidth: '800px', margin: '0 auto'}}>
      <h2 style={{fontSize: '1.8rem', fontWeight: 800, marginBottom: '2rem'}}>{t('ordersTitle')}</h2>
      
      {orders.length === 0 ? (
        <div className="dashboard-card" style={{textAlign: 'center'}}>
          <div style={{fontSize: '3rem', marginBottom: '1rem'}}>📦</div>
          <p style={{color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1.5rem'}}>{t('ordersEmpty')}</p>
          <a href="https://wa.me/213557828812" target="_blank" rel="noopener noreferrer"
            style={{display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.75rem 1.5rem', background: 'var(--green-whatsapp)', color: '#fff',
              borderRadius: 'var(--radius-sm)', fontWeight: 600, fontSize: '0.92rem'}}>
            {t('contactSupport')}
          </a>
        </div>
      ) : (
        <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
          {orders.map(order => {
            const creds = credentials.find(c => c.assigned_order_id === order.order_id);
            const items = parseOrderItems(order.items);
            const date = new Date(order.created_at).toLocaleDateString('fr-DZ');
            const hasNetflix = items.some(item => String(item.name || '').toLowerCase().includes('netflix'));
            const isNetflixWaitingForStock = order.status === 'pending' && order.payment_status === 'paid' && hasNetflix;
            const pendingLabel = isNetflixWaitingForStock
              ? 'Paiement reçu — attribution Netflix en cours selon le stock disponible.'
              : order.payment_status === 'paid'
                ? 'Paiement reçu — activation en cours'
                : 'Paiement non confirmé';
            let daysLeft = null;
            if (order.status === 'active' && order.expires_at) {
              const diffMs = new Date(order.expires_at) - new Date();
              daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
            }
            
            return (
            <div key={order.order_id} className="dashboard-card" style={{display: 'flex', flexDirection: 'column', gap: '1rem', borderLeft: order.status === 'active' ? '4px solid var(--spotify)' : 'none'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem'}}>
                <div>
                  <div style={{fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.3rem'}}>{date}</div>
                  <div style={{fontWeight: 600}}>Commande #{order.order_id} {order.amount ? <span style={{color: 'var(--gold)', marginLeft: '0.5rem'}}>({formatDA(order.amount)})</span> : null}</div>
                  <div style={{marginTop: '0.5rem'}}>
                    {items.map((item, i) => <span key={i} style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginRight: '0.5rem'}}>{item.name} {unitPrice(item) ? `(${formatDA(unitPrice(item))})` : ''}</span>)}
                  </div>
                </div>
                <div style={{display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end'}}>
                  <span style={{
                    padding: '0.4rem 1rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600,
                    background: order.status === 'active' ? 'rgba(29,185,84,0.1)' : order.status === 'pending' ? 'rgba(255,193,7,0.1)' : 'rgba(255,255,255,0.05)',
                    color: order.status === 'active' ? 'var(--spotify)' : order.status === 'pending' ? 'var(--gold)' : 'var(--text-secondary)'
                  }}>
                    {order.status === 'active' ? (daysLeft !== null ? (daysLeft > 0 ? `Actif (${daysLeft}j restants)` : 'Expiré') : 'Actif') : order.status === 'pending' ? pendingLabel : order.status === 'cancelled' ? 'Annulée' : 'Terminée'}
                  </span>
                  {activationEtaLabel(order, items) && (
                    <div style={{width: '100%', fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'right'}}>
                      {activationEtaLabel(order, items)}
                    </div>
                  )}
                  {order.status === 'active' && order.expires_at && (
                    <div style={{width: '100%', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem', textAlign: 'right'}}>
                      Expire le : {new Date(order.expires_at).toLocaleDateString('fr-DZ')}
                    </div>
                  )}
                  {daysLeft !== null && daysLeft <= 7 && daysLeft > 0 && (
                    <button className="btn btn-primary" style={{padding: '0.4rem 1rem', fontSize: '0.85rem'}} onClick={() => {
                       const message = `Bonjour Aura Stream ! Mon abonnement se termine dans ${daysLeft} jours et je souhaite le renouveler pour ne pas perdre l'accès. (Commande #${order.order_id})`;
                       window.open(`https://wa.me/213557828812?text=${encodeURIComponent(message)}`, '_blank');
                    }}>Renouveler</button>
                  )}
                  {daysLeft !== null && daysLeft <= 0 && (
                    <button className="btn btn-primary" style={{padding: '0.4rem 1rem', fontSize: '0.85rem'}} onClick={() => {
                       const message = `Bonjour Aura Stream ! Mon abonnement est expiré et je souhaite le renouveler. (Commande #${order.order_id})`;
                       window.open(`https://wa.me/213557828812?text=${encodeURIComponent(message)}`, '_blank');
                    }}>Renouveler</button>
                  )}
                </div>
              </div>
              
              {items.length > 1 && (
                <div style={{textAlign: 'center', marginTop: '0.5rem', marginBottom: expandedOrders[order.order_id] ? '0' : '0.5rem'}}>
                  <button onClick={() => toggleExpanded(order.order_id)} style={{background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, padding: '0.4rem 1rem', borderRadius: '20px'}}>
                    {expandedOrders[order.order_id] ? '▲ Masquer les détails' : `▼ Gérer mes services (${items.length})`}
                  </button>
                </div>
              )}

              {(items.length <= 1 || expandedOrders[order.order_id]) && (
                  <div style={{marginTop: '1rem', borderTop: items.length > 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', paddingTop: items.length > 1 ? '1rem' : '0'}}>
                    {items.some(i => i.name.toLowerCase().includes('spotify')) && (
                      <OrderCredentialsUpdater order={order} service="Spotify" color="#1DB954" icon="🎵" onUpdated={fetchOrders} />
                    )}
                    {items.some(i => i.name.toLowerCase().includes('crunchyroll')) && (
                      <OrderCredentialsUpdater order={order} service="Crunchyroll" color="#F47521" icon="🍘" onUpdated={fetchOrders} />
                    )}

                    {order.status === 'active' && (
                      <div style={{marginTop: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.1)'}}>
                        {items.some(i => i.name.toLowerCase().includes('netflix')) ? (
                          <NetflixOTPButton orderId={order.order_id} auth={auth} account={order.account} />
                        ) : (
                          <>
                            {creds ? (
                              <>
                                <h4 style={{marginBottom: '0.8rem', color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                                  <span style={{fontSize: '1.2rem'}}>🔑</span> Vos Identifiants ({creds.service})
                                </h4>
                                <div style={{display: 'flex', flexWrap: 'wrap', gap: '1rem'}}>
                                  <div style={{flex: 1, minWidth: '200px'}}>
                                    <label style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Email / Identifiant</label>
                                    <div style={{display: 'flex', alignItems: 'center', background: 'var(--bg)', padding: '0.5rem 1rem', borderRadius: '4px', marginTop: '0.2rem'}}>
                                      <span style={{flex: 1, fontFamily: 'monospace', fontSize: '0.95rem'}}>{creds.account_email}</span>
                                      <button onClick={() => { navigator.clipboard.writeText(creds.account_email); window.showToast("Copié !"); }} style={{background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer'}}>📋</button>
                                    </div>
                                  </div>
                                  <div style={{flex: 1, minWidth: '200px'}}>
                                    <label style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Mot de passe</label>
                                    <div style={{display: 'flex', alignItems: 'center', background: 'var(--bg)', padding: '0.5rem 1rem', borderRadius: '4px', marginTop: '0.2rem'}}>
                                      <span style={{flex: 1, fontFamily: 'monospace', fontSize: '0.95rem'}}>{creds.account_password}</span>
                                      <button onClick={() => { navigator.clipboard.writeText(creds.account_password); window.showToast("Copié !"); }} style={{background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer'}}>📋</button>
                                    </div>
                                  </div>
                                </div>
                                {creds.profile_name && (
                                  <div style={{display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '1rem'}}>
                                    <div style={{flex: 1, minWidth: '200px'}}>
                                      <label style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>👤 Profil attribué</label>
                                      <div style={{display: 'flex', alignItems: 'center', background: 'var(--bg)', padding: '0.5rem 1rem', borderRadius: '4px', marginTop: '0.2rem'}}>
                                        <span style={{flex: 1, fontFamily: 'monospace', fontSize: '0.95rem', color: 'var(--gold)'}}>{creds.profile_name}</span>
                                      </div>
                                    </div>
                                    {creds.profile_pin && (
                                      <div style={{flex: 1, minWidth: '200px'}}>
                                        <label style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>🔒 Code PIN</label>
                                        <div style={{display: 'flex', alignItems: 'center', background: 'var(--bg)', padding: '0.5rem 1rem', borderRadius: '4px', marginTop: '0.2rem'}}>
                                          <span style={{flex: 1, fontFamily: 'monospace', fontSize: '0.95rem', color: 'var(--gold)', letterSpacing: '2px'}}>{creds.profile_pin}</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                                <p style={{fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '1rem', fontStyle: 'italic'}}>⚠️ Ne partagez pas ces identifiants. Tout changement de mot de passe annulera votre garantie.</p>
                              </>
                            ) : (
                              <div style={{padding: '1rem 0'}}>
                                <p style={{color: 'orange', fontSize: '0.9rem', textAlign: 'center', margin: 0}}>⏳ En cours d'assignation de vos identifiants...</p>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
            </div>

          )})}
        </div>
      )}
    </div>
  );
}

function WhatsAppFloat() {
  const { t } = useLanguage();
  return (
    <a href="https://wa.me/213557828812" target="_blank" rel="noopener noreferrer" className="whatsapp-float">
      <span className="whatsapp-tooltip">{t('helpWhatsapp')}</span>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
    </a>
  );
}

function LegalPage() {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';
  
  return (
    <div className="animate-fadeInUp reveal active" style={{maxWidth: '800px', margin: '0 auto', textAlign: isAr ? 'right' : 'left'}}>
      <h2 style={{fontSize: '2rem', fontWeight: 800, marginBottom: '2rem', color: 'var(--gold)'}}>Mentions Légales & CGV</h2>
      
      <div className="dashboard-card" style={{marginBottom: '2rem'}}>
        <h3 style={{fontSize: '1.3rem', marginBottom: '1rem', fontWeight: 700}}>Conditions Générales de Vente (CGV)</h3>
        <p style={{marginBottom: '1rem', lineHeight: 1.6, color: 'var(--text-secondary)'}}>
          <strong>1. Objet :</strong> Les présentes conditions régissent les services d'abonnement streaming proposés par Aura Stream pour Netflix, Spotify et Crunchyroll.
        </p>
        <p style={{marginBottom: '1rem', lineHeight: 1.6, color: 'var(--text-secondary)'}}>
          <strong>2. Attribution et activation :</strong> Après confirmation du paiement, Netflix est attribué automatiquement selon le stock disponible. Spotify et Crunchyroll sont activés manuellement sur le compte du client après réception des identifiants nécessaires. Le suivi est disponible dans « Mes commandes ».
        </p>
        <p style={{marginBottom: '1rem', lineHeight: 1.6, color: 'var(--text-secondary)'}}>
          <strong>3. Responsabilité de l'utilisateur :</strong> Pour Netflix, l'acheteur ne doit pas modifier l'email, le mot de passe ou les autres profils du compte attribué. Pour Spotify et Crunchyroll, le client reste responsable de son compte personnel et ne doit pas modifier l'abonnement pendant l'activation.
        </p>
      </div>

      <div className="dashboard-card" style={{marginBottom: '2rem'}}>
        <h3 style={{fontSize: '1.3rem', marginBottom: '1rem', fontWeight: 700}}>Politique de Remboursement et Garantie</h3>
        <p style={{marginBottom: '1rem', lineHeight: 1.6, color: 'var(--text-secondary)'}}>
          <strong>Garantie :</strong> Un accès Netflix attribué est couvert pendant la durée achetée, sous réserve du respect des consignes d'utilisation. Pour Spotify et Crunchyroll, le support vérifie l'activation réalisée sur le compte du client.
        </p>
        <p style={{marginBottom: '1rem', lineHeight: 1.6, color: 'var(--text-secondary)'}}>
          <strong>Remboursement :</strong> En raison de la nature numérique du service, un remboursement n'est normalement plus possible après attribution ou activation. Si Aura Stream ne peut pas fournir le service payé ou une solution de remplacement dans un délai raisonnable, le support étudie un remboursement adapté à la situation.
        </p>
      </div>

      <div className="dashboard-card">
        <h3 style={{fontSize: '1.3rem', marginBottom: '1rem', fontWeight: 700}}>Politique de Confidentialité</h3>
        <p style={{marginBottom: '1rem', lineHeight: 1.6, color: 'var(--text-secondary)'}}>
          Aura Stream utilise vos informations de compte et de commande (nom, prénom, email, téléphone et contenu de la commande) pour fournir le service, sécuriser le paiement et assurer le support. Les données nécessaires au paiement sont transmises à SlickPay.
        </p>
        <p style={{marginBottom: '1rem', lineHeight: 1.6, color: 'var(--text-secondary)'}}>
          Les identifiants fournis pour activer Spotify ou Crunchyroll sont utilisés uniquement pour traiter la commande et sont transmis au canal opérationnel Discord réservé à l'équipe. Ils ne sont pas utilisés à des fins publicitaires. Nous vous recommandons de choisir un mot de passe temporaire puis de le modifier après confirmation de l'activation.
        </p>
        <p style={{marginBottom: '1rem', lineHeight: 1.6, color: 'var(--text-secondary)'}}>
          Avec votre accord, le Pixel Meta et l’API Conversions transmettent à Meta des événements de navigation et d’achat, tels que les pages consultées, les produits choisis, le montant, la devise et un identifiant d’événement. Ces informations servent à mesurer et optimiser nos campagnes publicitaires Meta. Meta peut traiter ces données sur des serveurs situés hors d’Algérie, selon ses propres conditions et mécanismes de transfert.
        </p>
        <p style={{lineHeight: 1.6, color: 'var(--text-secondary)'}}>
          Votre choix publicitaire est facultatif : le refus ne bloque aucune fonctionnalité du site. Vous pouvez donner ou retirer votre accord à tout moment avec le lien « Gérer mes préférences publicitaires » en bas de page. Aura Stream ne vend pas vos données personnelles.
        </p>
      </div>
    </div>
  );
}

function Footer({ onNavigate, onManageMarketing }) {
  const { t } = useLanguage();
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <button className="footer-logo" type="button" onClick={() => onNavigate('home')} aria-label="Aura Stream — Accueil">
            <AuraMark />
            <span>Aura<span>Stream</span></span>
          </button>
          <p>{t('footerDesc')}</p>
        </div>
        <div className="footer-section">
          <h4>{t('footerNav')}</h4>
          <ul>
            <li><a href="#" onClick={(e) => { e.preventDefault(); onNavigate('home'); }}>{t('navHome')}</a></li>
            <li><a href="#" onClick={(e) => { e.preventDefault(); onNavigate('shop'); }}>{t('navShop')}</a></li>
            <li><a href="#" onClick={(e) => { e.preventDefault(); onNavigate('legal'); }}>CGV & Légal</a></li>
            <li><button type="button" className="footer-link-button" onClick={onManageMarketing}>Gérer mes préférences publicitaires</button></li>
          </ul>
        </div>
        <div className="footer-section">
          <h4>{t('footerServices')}</h4>
          <ul>
            <li>Netflix</li>
            <li>Spotify</li>
            <li>Crunchyroll</li>
          </ul>
        </div>
        <div className="footer-section">
          <h4>{t('footerContact')}</h4>
          <ul>
            <li><a href="https://wa.me/213557828812" target="_blank" rel="noopener noreferrer" style={{unicodeBidi: 'plaintext'}}>WhatsApp: +213 557 828 812</a></li>
            <li><a href="https://www.instagram.com/aurastreamdz/" target="_blank" rel="noopener noreferrer" className="instagram-link">Instagram</a></li>
          </ul>
        </div>
      </div>
      <div className="footer-bottom">
        &copy; {new Date().getFullYear()} Aura Stream. {t('footerRights')}
      </div>
    </footer>
  );
}

function MarketingConsent({ onDecision, onPrivacy }) {
  const { t } = useLanguage();
  return (
    <div className="marketing-consent" role="dialog" aria-modal="true" aria-labelledby="marketing-consent-title">
      <div>
        <h2 id="marketing-consent-title">{t('marketingConsentTitle')}</h2>
        <p>
          {t('marketingConsentText')}
          {' '}<button type="button" className="consent-privacy-link" onClick={onPrivacy}>{t('marketingConsentLearnMore')}</button>
        </p>
      </div>
      <div className="marketing-consent-actions">
        <button type="button" onClick={() => onDecision(false)}>{t('marketingConsentReject')}</button>
        <button type="button" onClick={() => onDecision(true)}>{t('marketingConsentAccept')}</button>
      </div>
    </div>
  );
}


/* ---- Main App ---- */
function AuraGiftCards() {
  const [page, setPage] = React.useState('home');
  const [cart, setCart] = React.useState(() => {
    try {
      const saved = localStorage.getItem('aura_cart');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [showCart, setShowCart] = React.useState(false);
  const [showLogin, setShowLogin] = React.useState(false);
  const [recoveryToken, setRecoveryToken] = React.useState(null);
  const [cartBump, setCartBump] = React.useState(false);
  const [showMarketingConsent, setShowMarketingConsent] = React.useState(
    () => !getMetaMarketingConsent(),
  );
  const auth = useAuth();
  
  React.useEffect(() => {
    // Detect Supabase recovery hash
    const hash = window.location.hash;
    if (hash && hash.includes('type=recovery')) {
      const params = new URLSearchParams(hash.substring(1));
      const token = params.get('access_token');
      if (token) {
        setRecoveryToken(token);
        window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
        initializeMetaPixel();
      }
    }

    if (INITIAL_PAYMENT_ORDER_ID) {
      setPage('success');
    }
  }, []);

  const initialMount = React.useRef(true);

  React.useEffect(() => {
    const pageSeo = {
      home: ['Aura Stream — Netflix, Spotify et Crunchyroll en Algérie', 'Abonnements streaming avec paiement sécurisé et activation rapide en Algérie.'],
      shop: ['Abonnements streaming — Aura Stream', 'Choisissez votre abonnement Netflix, Spotify ou Crunchyroll en dinars algériens.'],
      checkout: ['Paiement sécurisé — Aura Stream', 'Vérifiez votre commande avant de poursuivre vers le paiement sécurisé.'],
      success: ['Suivi de commande — Aura Stream', 'Suivez la confirmation du paiement et l’activation de votre abonnement.'],
      orders: ['Mes commandes — Aura Stream', 'Consultez vos abonnements et leur statut d’activation.']
    };
    const [title, description] = pageSeo[page] || pageSeo.home;
    document.title = title;
    const descriptionTag = document.querySelector('meta[name="description"]');
    if (descriptionTag) descriptionTag.setAttribute('content', description);

    if (page === 'home' || page === 'shop') {
      trackMeta('ViewContent', {
        content_name: page === 'shop' ? 'Catalogue Aura Stream' : 'Accueil Aura Stream',
        content_type: 'product',
        content_ids: PRODUCTS.map(product => product.name)
      });
    }
  }, [page]);

  // Sync cart from Supabase on login if local cart is empty
  React.useEffect(() => {
    if (auth.user && auth.user.user_metadata?.cart && cart.length === 0) {
      setCart(auth.user.user_metadata.cart);
    }
  }, [auth.user]);

  // Sync cart to local storage on changes
  React.useEffect(() => {
    localStorage.setItem('aura_cart', JSON.stringify(cart));
    initialMount.current = false;
  }, [cart]);

  // Re-run scroll animations every time the page changes
  useScrollReveal([page]);

  const addToCart = (card) => {
    setCart([...cart, card]);
    trackMeta('AddToCart', {
      content_name: card.type + ' ' + card.duration,
      content_ids: [card.name || card.id],
      content_type: 'product',
      contents: metaContents([card]),
      quantity: Number(card.quantity || 1),
      value: card.price,
      currency: 'DZD'
    });
    setCartBump(true);
    setTimeout(() => setCartBump(false), 400);
  };

  const removeFromCart = (index) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  const handleNavigate = (p) => {
    setPage(p);
    if (p === 'orders') window.dispatchEvent(new Event('refresh_orders'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCheckout = () => {
    setShowCart(false);
    trackMeta('InitiateCheckout', {
      content_ids: cart.map(item => item.name || item.id).filter(Boolean),
      content_type: 'product',
      contents: metaContents(cart),
      num_items: cart.length,
      value: displayCartTotal(cart),
      currency: 'DZD'
    });
    if (!auth.user) {
      setShowLogin(true);
    } else {
      setPage('checkout');
    }
  };

  const handleLoginSuccess = () => {
    setShowLogin(false);
    if (cart.length > 0) {
      setPage('checkout');
    }
  };

  const handleMarketingDecision = (allowed) => {
    setMetaMarketingConsent(allowed);
    setShowMarketingConsent(false);
  };

  return (
    <div>
      {false && auth.user?.is_admin && (
        <button onClick={async () => {
          try {
            const t = auth.token || getAccessToken();
            if(!t) { alert("Token manquant !"); return; }
            alert("Génération de la commande en cours...");
            const res = await fetch(API_BASE+'/create-order', {
               method: 'POST',
               headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer '+t},
               body: JSON.stringify({
                  amount: 1500,
                  items: [
                    {name: 'Netflix 1 mois', price: 1500, quantity: 1}
                  ]
               })
            });
            if(res.ok) {
              const data = await res.json();
              // Auto-validate for testing
              await fetch(API_BASE + '/validate-order?id=' + data.order_id);
              
              setPage('orders'); window.dispatchEvent(new Event('refresh_orders'));
            } else {
              const data = await res.json();
              alert("❌ Erreur serveur : " + (data.error || "Inconnue"));
            }
          } catch(e) { alert("❌ Erreur: "+e.message); }
        }} style={{position:'fixed', bottom:'80px', left:'20px', zIndex:9999, background:'var(--spotify)', color:'#000', padding:'12px 24px', borderRadius:'8px', fontWeight:700, cursor:'pointer', border:'none', boxShadow:'0 4px 12px rgba(29,185,84,0.3)'}}>
          🪄 Générer une commande Test (Admin)
        </button>
      )}

      <TopBanner />
      <Header
        cartCount={cart.length}
        cartBump={cartBump}
        onCartClick={() => setShowCart(true)}
        onNavigate={handleNavigate}
        auth={auth}
        onLoginClick={() => setShowLogin(true)}
      />

      <main>
        {page === 'home' && (
          <>
            <HeroSection onShopClick={() => handleNavigate('shop')} />
            <ProductsSection onAddToCart={addToCart} />
            <StepsSection />
            <ServiceHighlightsSection />
            <FAQSection />
          </>
        )}

        {page === 'shop' && (
          <ProductsSection onAddToCart={addToCart} />
        )}

        {page === 'checkout' && auth.user && (
          <div className="section">
            <CheckoutPage
              cart={cart}
              email={auth.user.email}
              onSuccess={() => { setCart([]); handleNavigate('success'); }}
              onBack={() => handleNavigate('shop')}
            />
          </div>
        )}

        {page === 'success' && (
          <div className="section">
            <SuccessPage auth={auth} onNavigate={handleNavigate} onConfirmed={() => setCart([])} />
          </div>
        )}

        {page === 'profile' && auth.user && (
          <div className="section">
            <ProfilePage auth={auth} />
          </div>
        )}

        {page === 'orders' && auth.user && (
          <div className="section">
            <OrdersPage auth={auth} />
          </div>
        )}

        {page === 'legal' && (
          <div className="section">
            <LegalPage />
          </div>
        )}

        {page === 'admin' && auth.user?.is_admin && (
          <div className="section">
            <AdminDashboard auth={auth} />
          </div>
        )}
      </main>

      <Footer
        onNavigate={handleNavigate}
        onManageMarketing={() => setShowMarketingConsent(true)}
      />
      <WhatsAppFloat />

      {showMarketingConsent && (
        <MarketingConsent
          onDecision={handleMarketingDecision}
          onPrivacy={() => {
            setShowMarketingConsent(false);
            handleNavigate('legal');
          }}
        />
      )}

      {showCart && (
        <CartSidebar
          cart={cart}
          onRemove={removeFromCart}
          onClose={() => setShowCart(false)}
          onCheckout={handleCheckout}
        />
      )}

      {showLogin && (
        <LoginModal
          auth={auth}
          onClose={() => setShowLogin(false)}
          onSuccess={handleLoginSuccess}
        />
      )}

      {recoveryToken && (
        <ResetPasswordModal
          auth={auth}
          recoveryToken={recoveryToken}
          onClose={() => setRecoveryToken(null)}
        />
      )}



      <ToastContainer />
    </div>
  );
}

function ResetPasswordModal({ auth, recoveryToken, onClose }) {
  const { t } = useLanguage();
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    setError('');
    const res = await auth.resetPassword(recoveryToken, password);
    if (res.success) {
      setSuccess(true);
    } else {
      setError(t(res.error));
    }
    setLoading(false);
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        {!success && <button className="modal-close" onClick={onClose}>&times;</button>}
        <h2>{t('resetTitle')}</h2>
        {success ? (
          <div style={{textAlign: 'center'}}>
            <p style={{color: 'var(--green-whatsapp)', marginBottom: '1.5rem'}}>{t('resetSuccess')}</p>
            <button className="form-submit" onClick={onClose}>{t('close')}</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <input className="form-input" type="password" placeholder={t('newPass')} value={password} onChange={e => setPassword(e.target.value)} required />
            <input className="form-input" type="password" placeholder={t('confirmPass')} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
            {error && <p className="form-error">{error}</p>}
            <button className="form-submit" type="submit" disabled={loading}>
              {loading ? t('loading') : t('validateNewPass')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <AuraGiftCards />
      </AuthProvider>
    </LanguageProvider>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);
