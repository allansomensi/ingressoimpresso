/**
 * Every user-facing text of the web app, in Brazilian Portuguese.
 *
 * Components never hard-code UI strings: they read them from here. There is no i18n framework on
 * purpose (national market only); centralizing keeps a future translation a mechanical change.
 *
 * One module per section (`pt-BR/`): import a section from its own module
 * (`import { event as eventTexts } from "@/texts/pt-BR/event"`), so a page carries only the
 * texts it shows. This file lists them for reference; importing it pulls every section in.
 */
export { meta } from "./pt-BR/meta";
export { brand } from "./pt-BR/brand";
export { nav } from "./pt-BR/nav";
export { landing } from "./pt-BR/landing";
export { templateGallery } from "./pt-BR/template-gallery";
export { eventPages } from "./pt-BR/event-pages";
export { pricingPage } from "./pt-BR/pricing-page";
export { guides } from "./pt-BR/guides";
export { footer } from "./pt-BR/footer";
export { reservations } from "./pt-BR/reservations";
export { sellerPage } from "./pt-BR/seller-page";
export { helpCenter } from "./pt-BR/help-center";
export { about } from "./pt-BR/about";
export { legal } from "./pt-BR/legal";
export { changelog } from "./pt-BR/changelog";
export { inbox } from "./pt-BR/inbox";
export { maintenance } from "./pt-BR/maintenance";
export { twoFactor } from "./pt-BR/two-factor";
export { unsubscribe } from "./pt-BR/unsubscribe";
export { certificate } from "./pt-BR/certificate";
export { credits } from "./pt-BR/credits";
export { status } from "./pt-BR/status";
export { common } from "./pt-BR/common";
export { theme } from "./pt-BR/theme";
export { notFound } from "./pt-BR/not-found";
export { crash } from "./pt-BR/crash";
export { pwa } from "./pt-BR/pwa";
export { login } from "./pt-BR/login";
export { panel } from "./pt-BR/panel";
export { event } from "./pt-BR/event";
export { ticketCanvas } from "./pt-BR/ticket-canvas";
export { ticket } from "./pt-BR/ticket";
export { portaria } from "./pt-BR/portaria";
export { results } from "./pt-BR/results";
export { account } from "./pt-BR/account";
export { admin } from "./pt-BR/admin";
export { templates } from "./pt-BR/templates";
export { profile } from "./pt-BR/profile";
export { eventChange } from "./pt-BR/event-change";
export { verifyPage } from "./pt-BR/verify-page";
export { referrals } from "./pt-BR/referrals";
export { series } from "./pt-BR/series";
export { checklist } from "./pt-BR/checklist";
export { errors } from "./pt-BR/errors";
