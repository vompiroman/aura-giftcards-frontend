import { createPartnerToolkit } from "./partner-toolkit.js";

const services = { netflix: "Netflix", spotify: "Spotify", crunchyroll: "Crunchyroll", snapchat: "Snapchat+" };
const statuses = {
  pending: "À livrer", unpaid: "Paiement en attente", active: "Actives",
  expiring: "À renouveler", expired: "Expirées", cancelled: "Annulées",
};
const quantityLimit = 20;

function laterDelivery(value, previous) {
  if (!value) return false;
  if (!previous) return true;
  const difference = Date.parse(value) - Date.parse(previous);
  if (difference !== 0) return difference > 0;
  // Postgres may distinguish two allocations within the same JavaScript millisecond.
  const fraction = timestamp => (timestamp.match(/\.(\d+)/)?.[1] || "").padEnd(6,"0");
  return fraction(value) > fraction(previous);
}

function orderStatus(order) {
  if (order.status === "cancelled") return "cancelled";
  if (order.payment_status === "unpaid") return "unpaid";
  const remaining = Date.parse(order.expires_at) - Date.now();
  if (order.status === "expired" || remaining <= 0) return "expired";
  if (order.status === "active") return remaining <= 7 * 86400_000 ? "expiring" : "active";
  return "pending";
}

export function createPartnerOperations({ api, t, escape, price, date, language, addToCart, showOrder, styles }) {
  const { card, field, button, secondary } = styles;
  const label = value => escape(t(value));
  const money = value => escape(price(Number(value)));
  const toolkit = createPartnerToolkit({api,t,escape,price,date,language,styles});
  const tabs = { orders: "Mes commandes partenaire", basket: "Panier rapide", report: "Bilan mensuel", support:"Assistance" };
  const tabMarkup = Object.entries(tabs).map(([id,name]) =>
    `<button type="button" class="${secondary}" data-partner-section="${id}" aria-pressed="false">${label(name)}</button>`).join("");
  let mounted, stockSnapshot;

  function close() {
    mounted?.stop();
    mounted = null;
    stockSnapshot = null;
  }

  function attach(root, discountPercent) {
    if (!root) return;
    mounted?.stop();
    const model = { service: "", status: "", offset: 0, revision: 0, stopped: false };
    const month = new Intl.DateTimeFormat("en-CA",{ year:"numeric", month:"2-digit", timeZone:"Africa/Algiers" })
      .formatToParts(new Date());
    model.month = `${month.find(p=>p.type==="year").value}-${month.find(p=>p.type==="month").value}`;
    root.innerHTML = `<div data-toolkit-guide></div><section class="${card}"><h2 class="font-title text-2xl font-extrabold">${label("Stock Netflix")}</h2>
      <p class="mt-2 text-sm" data-stock aria-live="polite">${label("Chargement…")}</p>
      <div class="mt-2" data-stock-alert></div></section>
      <section class="mt-5 ${card}">
        <nav class="flex flex-wrap gap-2" aria-label="${label("Espace partenaire")}">${tabMarkup}</nav>
        <div class="mt-5" data-operations-content tabindex="-1"></div>
      </section>`;
    const content = root.querySelector("[data-operations-content]");
    const refreshToolkit=toolkit.stockTools(root,tab=>{
      void draw(tab);
      content.focus();
    });
    const textStatus = (element, message) => { if (element) element.textContent = t(message); };
    const put = (path,data) => api(path,{method:"PUT",body:JSON.stringify(data)});
    const current = revision => !model.stopped && root.isConnected && revision === model.revision;
    const stock = root.querySelector("[data-stock]");
    function renderStock() {
      if (!stockSnapshot) return;
      const text = `${t("Profils libres")} : ${stockSnapshot.profiles} · ${t("Comptes avec des profils libres")} : ${stockSnapshot.accounts}`;
      if (stock.textContent !== text) stock.textContent = text;
    }
    renderStock();
    let timer, refreshing = false;
    async function pollStock() {
      if (model.stopped || !root.isConnected || refreshing || document.visibilityState === "hidden"
        || root.closest("[data-view]")?.classList.contains("hidden")) return;
      refreshing = true;
      try {
        const value = await api("/partner/stock");
        if (model.stopped || !root.isConnected) return;
        if (!stockSnapshot || laterDelivery(value.last_delivery_at,stockSnapshot.last_delivery_at)) {
          stockSnapshot = value;
          renderStock();
        }
        void refreshToolkit(Number(stockSnapshot.profiles));
      } catch {
        if (!stockSnapshot && !model.stopped && root.isConnected) {
          textStatus(stock,"Stock momentanément indisponible.");
        }
      } finally { refreshing = false; }
    }
    function stop() {
      model.stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange",pollStock);
    }
    mounted = { stop };
    timer = window.setInterval(() => {
      if (!root.isConnected) stop();
      else void pollStock();
    },5000);
    document.addEventListener("visibilitychange",pollStock);
    void pollStock();

    function options(choices, currentValue) {
      return Object.entries(choices).map(([value,name]) =>
        `<option value="${value}" ${value===currentValue ? "selected" : ""}>${label(name)}</option>`).join("");
    }
    function drawOrders(revision) {
      content.innerHTML = `<h2 class="font-title text-xl font-extrabold">${label(tabs.orders)}</h2>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <label class="grid gap-1 text-sm font-semibold">${label("Service")}<select data-filter="service" class="${field}">
            ${options({"":"Tous les services",...services},model.service)}</select></label>
          <label class="grid gap-1 text-sm font-semibold">${label("Statut")}<select data-filter="status" class="${field}">
            ${options({"":"Tous les statuts",...statuses},model.status)}</select></label>
        </div><div class="mt-4" data-order-results aria-live="polite">${label("Chargement…")}</div>`;
      content.querySelectorAll("[data-filter]").forEach(select=>select.addEventListener("change",()=>{
        model[select.dataset.filter]=select.value;
        model.offset=0;
        void draw("orders");
      }));
      const result = content.querySelector("[data-order-results]");
      return api(`/partner/orders?${new URLSearchParams({service:model.service,status:model.status,offset:model.offset})}`)
        .then(payload=>{
          if (!current(revision)) return;
          result.innerHTML = payload.orders.map((order,index)=>`<article class="border-b border-black/10 py-4">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div><strong>${escape(order.order_id)}</strong><p class="mt-1 text-sm text-black/70">${order.items.map(item=>`${label(item.name)} × ${Number(item.quantity)}`).join(" · ")}</p></div>
              <div class="text-end text-sm"><strong>${money(order.amount)}</strong><p class="text-black/60">${label(statuses[orderStatus(order)])}</p></div>
            </div>
            <p class="mt-2 text-xs text-black/60">${escape(date(order.created_at))}
              ${order.expires_at ? ` · ${label("Expiration")} : ${escape(date(order.expires_at))}` : ""}</p>
            <div class="mt-3 flex flex-wrap gap-2">
              <button class="${secondary}" data-order-cart="${index}">${label("Commander à nouveau")}</button>
              ${order.payment_status==="paid" ? `<button class="${secondary}" data-order-details="${index}">${label("Voir le suivi")}</button>
                <a class="inline-flex items-center ${secondary}" href="/api/partner/orders/${encodeURIComponent(order.order_id)}/invoice.pdf">${label("Télécharger la facture")}</a>` : ""}
            </div>
            <form class="mt-3 flex flex-wrap items-end gap-3" data-order-form="${index}">
              <label class="grid flex-1 gap-1 text-sm font-semibold">${label("Référence client privée")}
                <input class="${field}" name="client_reference" maxlength="80" value="${escape(order.partner_client_reference || "")}"></label>
              <label class="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" class="accent-aura" name="reminders" ${order.partner_reminders ? "checked" : ""}>
                ${label("Rappels e-mail à J−7 et J−2")}</label>
              <button class="${secondary}" type="submit">${label("Enregistrer")}</button><p class="basis-full text-xs" data-feedback role="status"></p>
            </form>${toolkit.orderTools(order,index)}</article>`).join("") || `<p class="text-sm text-black/60">${label("Aucune commande pour ces filtres.")}</p>`;
          result.innerHTML += `<div class="mt-4 flex flex-wrap gap-2">${model.offset ? `<button class="${secondary}" data-order-page="-20">${label("Précédent")}</button>` : ""}
            ${payload.has_more ? `<button class="${secondary}" data-order-page="20">${label("Suivant")}</button>` : ""}</div>`;
          toolkit.bindOrderTools(result,payload.orders);
          result.querySelectorAll("[data-order-page]").forEach(el=>el.addEventListener("click",()=>{
            model.offset+=Number(el.dataset.orderPage); void draw("orders");
          }));
          result.querySelectorAll("[data-order-cart]").forEach(el=>el.addEventListener("click",()=>{
            addToCart(payload.orders[Number(el.dataset.orderCart)].items);
          }));
          result.querySelectorAll("[data-order-details]").forEach(el=>el.addEventListener("click",()=>{
            showOrder(payload.orders[Number(el.dataset.orderDetails)].order_id);
          }));
          result.querySelectorAll("[data-order-form]").forEach(form=>form.addEventListener("submit",async event=>{
            event.preventDefault();
            const submit = form.querySelector('[type="submit"]');
            submit.disabled=true;
            const order = payload.orders[Number(form.dataset.orderForm)];
            const feedback = form.querySelector("[data-feedback]");
            try {
              await put(`/partner/orders/${encodeURIComponent(order.order_id)}/preferences`,{
                client_reference:form.elements.client_reference.value, reminders:form.elements.reminders.checked, language:language(),
              });
              textStatus(feedback,"Préférences enregistrées.");
            } catch(error) { textStatus(feedback,error.message); }
            finally { submit.disabled=false; }
          }));
        });
    }

    async function drawBasket(revision) {
      const basket = await api("/partner/basket");
      if (!current(revision)) return;
      const catalog = Object.entries(basket.catalog);
      const saved = new Map();
      for (const item of basket.items || []) saved.set(item.name,(saved.get(item.name)||0)+Number(item.quantity));
      content.innerHTML = `<h2 class="font-title text-xl font-extrabold">${label(tabs.basket)}</h2>
        <p class="mt-2 text-sm text-black/65">${label("Activation manuelle estimée dans la journée.")}</p>
        <form class="mt-3">
          ${catalog.map(([name,amount],index)=>`<label class="flex items-center justify-between gap-3 border-b border-black/10 py-3 text-sm font-semibold">
            <span>${label(name)}<small class="block font-normal text-black/60">${money(amount-Math.round(amount*discountPercent)/100)}</small></span>
            <input class="${field} max-w-24" data-basket-line="${index}" type="number" min="0" max="${quantityLimit}" step="1" value="${saved.get(name)||0}">
          </label>`).join("")}
          <div class="mt-4 flex flex-wrap gap-2">
            <button class="${button}" type="submit">${label("Mettre au panier")}</button>
            <button class="${secondary}" type="button" data-save-basket>${label("Enregistrer comme panier type")}</button>
          </div><p class="mt-2 text-sm" role="status" data-basket-status></p>
        </form>`;
      const form = content.querySelector("form");
      const lines = () => [...form.querySelectorAll("[data-basket-line]")].map(input=>({
        name:catalog[Number(input.dataset.basketLine)][0], quantity:Number(input.value),
      })).filter(item=>item.quantity>0);
      form.addEventListener("submit",event=>{
        event.preventDefault(); addToCart(lines());
      });
      const save = form.querySelector("[data-save-basket]");
      save.addEventListener("click",async ()=>{
        if (!form.reportValidity()) return;
        save.disabled=true;
        const feedback = form.querySelector("[data-basket-status]");
        try {
          await put("/partner/basket",{items:lines()});
          textStatus(feedback,"Panier type enregistré.");
        } catch(error) { textStatus(feedback,error.message); }
        finally { save.disabled=false; }
      });
    }

    async function drawReport(revision) {
      content.innerHTML = `<h2 class="font-title text-xl font-extrabold">${label(tabs.report)}</h2>
        <label class="mt-3 grid max-w-56 gap-1 text-sm font-semibold">${label("Mois")}
          <input class="${field}" type="month" value="${escape(model.month)}" data-report-month></label>
        <div class="mt-4" data-report>${label("Chargement…")}</div>`;
      content.querySelector("[data-report-month]").addEventListener("change",event=>{
        if (!/^20\d{2}-\d{2}$/.test(event.target.value)) return;
        model.month=event.target.value; void draw("report");
      });
      const report = await api(`/partner/monthly?month=${encodeURIComponent(model.month)}`);
      if (!current(revision)) return;
      const totals = { purchases:"Commandes payées", spent:"Total dépensé", savings:"Remises obtenues",
        deposits:"Recharges", wallet_purchases:"Achats par portefeuille", refunds:"Remboursements" };
      content.querySelector("[data-report]").innerHTML = `<dl class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          ${Object.entries(totals).map(([key,title])=>`<div class="rounded-xl bg-ivory p-3"><dt class="text-xs text-black/65">${label(title)}</dt>
            <dd class="mt-1 font-bold">${key==="purchases" ? Number(report[key]) : money(report[key])}</dd></div>`).join("")}
        </dl><a class="mt-4 inline-flex items-center ${secondary}" href="/api/partner/monthly.csv?month=${encodeURIComponent(model.month)}">${label("Exporter le bilan CSV")}</a>`;
    }

    async function draw(tab) {
      const revision = ++model.revision;
      root.querySelectorAll("[data-partner-section]").forEach(el => el.setAttribute("aria-pressed", String(el.dataset.partnerSection===tab)));
      textStatus(content,"Chargement…");
      try {
        if (tab==="orders") await drawOrders(revision);
        else if (tab==="basket") await drawBasket(revision);
        else if (tab==="report") await drawReport(revision);
        else await toolkit.renderTickets(content,()=>current(revision));
      } catch (error) {
        if (current(revision)) textStatus(content,error.message);
      }
    }
    root.querySelectorAll("[data-partner-section]").forEach(el=>el.addEventListener("click",()=>void draw(el.dataset.partnerSection)));
    void draw("orders");
  }
  return { attach, close, loadAdminSupport:toolkit.loadAdmin, clearAdminSupport:toolkit.clearAdmin };
}
