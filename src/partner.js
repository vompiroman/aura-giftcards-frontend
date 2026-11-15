import { createPartnerOperations } from "./partner-operations.js";

const groups = {
  monthly_volume: ["Volume d’achat mensuel estimé", {
    UNDER_5000:"Moins de 5 000 DA", "5000_15000":"5 000 à 15 000 DA", "15000_50000":"15 000 à 50 000 DA", OVER_50000:"Plus de 50 000 DA",
  }],
  sales_channel: ["Canal de vente principal", {
    WEB:"Site web / E-commerce", MESSAGING:"Telegram / WhatsApp / Discord", SOCIAL:"Réseaux sociaux (Instagram, TikTok, Facebook…)",
    PHYSICAL:"Boutique physique", OTHER:"Autre",
  }],
  profile: ["Statut / Profil", {
    INDEPENDENT:"Revendeur indépendant", BUSINESS:"Entreprise / Auto-entrepreneur", CREATOR:"Communauté / Créateur",
  }],
};
const textFields = {
  products:"Produits ou catégories recherchés",
  quick_contact:"Contact rapide (Telegram, WhatsApp ou téléphone)",
  additional_info:"Informations complémentaires (facultatif)",
};
export const tierNames = { LOCKED:"Verrouillé", STARTER:"Débloqué", BRONZE:"Bronze", SILVER:"Argent", GOLD:"Or" };
const statuses = { NONE:"Aucune candidature", PENDING:"En attente", APPROVED:"Approuvée", REJECTED:"Refusée",
  CONFIRMED:"Confirmé", FAILED:"Échoué" };
const types = { DEPOSIT:"Recharge", PURCHASE:"Achat", REFUND:"Remboursement" };
const field = "min-h-11 w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-aura";
const button = "min-h-11 rounded-xl bg-aura px-4 py-2 text-sm font-bold text-white hover:bg-[#BE2E3D] disabled:opacity-50";
const secondary = "min-h-11 rounded-xl border border-black/15 px-4 py-2 text-sm font-bold hover:border-aura";
const card = "rounded-2xl border border-black/10 bg-white p-5 shadow-soft sm:p-7";

export function partnerReduction(subtotal, state) {
  if (state?.partner_status !== "APPROVED" || !state.has_unlocked_tiers) return 0;
  return Math.round(Number(subtotal) * Number(state.discount_percent || 0)) / 100;
}
export function partnerSavings(subtotal, state, existing = 0) {
  return Math.min(subtotal, Math.max(Number(existing || 0), partnerReduction(subtotal,state)));
}
export function partnerAnswers(form) {
  return Object.fromEntries([...Object.keys(groups),...Object.keys(textFields)].map(key => [
    key, String((form.elements.namedItem(key) || form.querySelector(`[name="${key}"]`))?.value || "").trim(),
  ]));
}

export function createPartnerUI({api, t, escape, price, date, getUser, onChange, toast, language, addToCart, showOrder}) {
  let enabled = false, configKnown = false, state = null, generation = 0, owner = null;
  let walletPage = 0, adminPage = 0, walletVersion = 0, adminVersion = 0;
  let depositReturn = new URLSearchParams(location.search).get("wallet_deposit");
  if (!/^[a-f0-9-]{36}$/i.test(depositReturn || "")) depositReturn = null;
  let partnerRequest, configRequest;
  const region = () => document.getElementById("partner-content");
  const label = value => escape(t(value));
  const htmlPrice = amount => escape(price(Number(amount)));
  const msg = (value, error=false) => `<p class="${error ? "text-red-700" : "text-black/60"} text-sm leading-6" role="${error ? "alert" : "status"}">${escape(value)}</p>`;
  const questionMarkup = () => `<div class="grid gap-4 sm:grid-cols-2">
    ${Object.entries(groups).map(([key,[title,choices]]) => `<label class="grid gap-2 text-sm font-semibold">${label(title)}
      <select class="${field}" name="${key}" required><option value="">${label("Sélectionne une réponse")}</option>
      ${Object.entries(choices).map(([id,name])=>`<option value="${id}">${label(name)}</option>`).join("")}</select></label>`).join("")}
    ${Object.entries(textFields).map(([key,title]) => `<label class="grid gap-2 text-sm font-semibold ${key==="additional_info" ? "sm:col-span-2" : ""}">${label(title)}
      ${key==="additional_info" ? `<textarea class="${field}" name="${key}" maxlength="1000" rows="3"></textarea>`
        : `<input class="${field}" name="${key}" required minlength="${key==="quick_contact" ? 3 : 1}" maxlength="${key==="quick_contact" ? 120 : 250}">`}</label>`).join("")}
    </div>`;
  const post = (path,body={}) => api(path,{method:"POST",body:JSON.stringify(body)});
  const operations = createPartnerOperations({api,t,escape,price,date,language,addToCart,showOrder,
    styles:{card,field,button,secondary}});
  const syncEntrypoints = () => {
    document.querySelectorAll("[data-partner-entry]").forEach(el=>el.classList.toggle("hidden",!enabled || !getUser()));
    const tab=document.getElementById("admin-partner-tab");
    tab?.classList.toggle("hidden",!enabled || getUser()?.is_admin!==true);
    const choice=document.getElementById("signup-partner-choice");
    choice?.classList.toggle("hidden",!enabled);
    const fields=document.getElementById("signup-partner-fields");
    if (fields && !fields.childElementCount) fields.innerHTML=questionMarkup();
    const select=document.getElementById("signup-account-type");
    if (fields) {
      fields.hidden = !enabled || select?.value !== "partner";
      fields.disabled = fields.hidden;
    }
    const entry=document.getElementById("customer-partner-entry");
    if (entry) entry.textContent=t(state?.partner_status && state.partner_status!=="NONE" ? "Espace partenaire" : "Devenir Partenaire");
  };
  async function config() {
    if(configKnown) return enabled;
    if (configRequest) return configRequest;
    configRequest=(async()=>{
      const result=await api("/partner/config").catch(()=>null);
      enabled=result?.enabled===true;
      configKnown=Boolean(result);
      syncEntrypoints();
      return enabled;
    })();
    try {return await configRequest;} finally {configRequest=null;}
  }
  async function refresh({force=false}={}) {
    const user=getUser();
    const identity=user?.id || user?.email || null;
    if(owner!==identity) {
      owner=identity; generation++; state=null; partnerRequest=null;
      walletPage=0; adminPage=0; walletVersion++; adminVersion++;
      const content=region(); if(content) content.replaceChildren();
      document.getElementById("admin-partner-content")?.replaceChildren();
      operations.clearAdminSupport(document.getElementById("admin-partner-support"));
      syncEntrypoints();
      onChange();
    }
    if (partnerRequest) return partnerRequest;
    if (state && !force) return state;
    const version=generation;
    const run=(async()=>{
      if (!await config() || !identity || generation!==version) return null;
      const result=await api("/partner");
      if(generation!==version) return null;
      state=result;
      syncEntrypoints();
      onChange();
      return state;
    })();
    partnerRequest=run;
    try {return await run;} finally {if(partnerRequest===run) partnerRequest=null;}
  }

  async function submit(answers) {
    await post("/partner/applications",answers);
    await refresh({force:true});
  }
  function formHandler(form, handler) {
    form.addEventListener("submit",async event=>{
      event.preventDefault();
      const control=form.querySelector('[type="submit"]');
      const feedback=form.querySelector("[data-partner-feedback]");
      control.disabled=true;
      try {await handler(form);}
      catch(error) {if(feedback) feedback.innerHTML=msg(error.message,true);}
      finally {control.disabled=false;}
    });
  }
  async function showWallet(offset=0) {
    const list=document.getElementById("partner-wallet-history");
    if(!list) return;
    const version=++walletVersion;
    walletPage=offset;
    try {
      const result=await api(`/partner/wallet?offset=${offset}`);
      if(version!==walletVersion || !list.isConnected) return;
      list.innerHTML=(result.transactions.length ? result.transactions.map(tx=>`<li class="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 py-3">
        <div><strong>${label(types[tx.kind])}</strong> · ${label(statuses[tx.status])}<p class="mt-1 text-xs text-black/60">${escape(date(tx.confirmed_at || tx.created_at))}${tx.order_id ? ` · ${escape(tx.order_id)}` : ""}</p></div>
        <div class="text-end"><strong>${tx.kind==="PURCHASE" ? "−" : "+"}${htmlPrice(tx.amount)}</strong>
         <p class="mt-1 text-xs text-black/60">${tx.balance_after==null ? "—" : `${label("Solde après opération")} : ${htmlPrice(tx.balance_after)}`}</p></div>
        ${tx.kind==="DEPOSIT" && tx.status==="PENDING" ? `<div class="flex flex-wrap gap-2"><button class="${secondary}" data-deposit-check="${escape(tx.id)}">${label("Vérifier le dépôt")}</button>
        ${safePaymentUrl(tx.payment_url) ? `<a class="inline-flex items-center ${secondary}" href="${escape(tx.payment_url)}">${label("Reprendre le paiement")}</a>` : ""}</div>` : ""}
      </li>`).join("") : `<li class="py-4 text-sm text-black/60">${label("Aucun mouvement.")}</li>`)
      + `<li class="mt-4 flex gap-2">${offset ? `<button class="${secondary}" data-wallet-page="${Math.max(0,offset-25)}">${label("Précédent")}</button>` : ""}${result.has_more ? `<button class="${secondary}" data-wallet-page="${offset+25}">${label("Suivant")}</button>` : ""}</li>`;
    } catch(error) {if(version===walletVersion) list.innerHTML=msg(error.message,true);}
  }
  function safePaymentUrl(value) {
    try {
      const url=new URL(value);
      return url.protocol==="https:" && !url.username && !url.password && !url.port &&
        (url.hostname==="slick-pay.com" || url.hostname.endsWith(".slick-pay.com") || url.hostname==="cib.satim.dz");
    } catch {return false;}
  }
  async function verify(id) {
    const result=await post(`/partner/wallet/deposits/${encodeURIComponent(id)}/verify`);
    toast(result.status==="CONFIRMED" ? "Recharge confirmée." : result.status==="FAILED" ? "Le paiement de la recharge a échoué." : "Recharge en attente de confirmation.");
    await refresh({force:true});
    draw();
  }
  function draw() {
    const root=region(); if(!root) return;
    if (!getUser()) {
      root.innerHTML=`<div class="${card}">${msg(t("Connecte-toi pour accéder à l’espace partenaire."))}<button class="route-link mt-4 ${button}" data-route="login">${label("Se connecter")}</button></div>`;
      return;
    }
    if (!enabled || !state) {
      root.innerHTML=msg(t("Programme partenaire indisponible.")); return;
    }
    if(state.partner_status==="PENDING") {
      root.innerHTML=`<div class="${card}"><h2 class="font-title text-2xl font-extrabold">${label("Candidature en cours d’examen")}</h2>${msg(t("Nous examinerons tes réponses avant d’activer le portefeuille."))}<button class="mt-4 ${secondary}" data-partner-refresh>${label("Actualiser")}</button></div>`;
      return;
    }
    if(state.partner_status!=="APPROVED") {
      root.innerHTML=`<form id="partner-application-form" class="${card}"><h2 class="font-title text-2xl font-extrabold">${label("Questionnaire partenaire")}</h2>
        <p class="mb-5 mt-2 text-sm text-black/60">${label(state.partner_status==="REJECTED" ? "Ta demande a été refusée. Tu peux envoyer une nouvelle candidature." : "Présente-nous ton activité de revente.")}</p>
        ${questionMarkup()}<div class="mt-4" data-partner-feedback></div><button type="submit" class="mt-4 ${button}">${label("Envoyer ma candidature")}</button></form>`;
      formHandler(document.getElementById("partner-application-form"),async form=>{await submit(partnerAnswers(form));draw();});
      return;
    }
    const unlocked=state.has_unlocked_tiers;
    const tier=label(tierNames[state.partner_tier] || tierNames.LOCKED);
    const next=state.next_tier;
    const lower=Number(state.tiers?.find(item=>item.tier===state.partner_tier)?.threshold || 0);
    const percent=next ? Math.min(100,Math.max(0,(Number(state.total_spent)-lower) / (Number(next.threshold)-lower) * 100)) : unlocked ? 100 : 0;
    root.innerHTML=`<div class="grid gap-5 lg:grid-cols-2">
      <section class="${card}"><h2 class="font-title text-2xl font-extrabold">${label("Mon Portefeuille")}</h2>
        <p class="mt-4 text-sm text-black/60">${label("Solde disponible")}</p><strong class="font-title text-4xl font-extrabold text-aura">${htmlPrice(state.wallet_balance)}</strong>
        <p class="mt-4 rounded-xl ${unlocked ? "bg-green-50 text-green-800" : "bg-yellow-100 text-black/80"} p-3 text-sm font-semibold">
        ${unlocked ? label("Tes paliers sont débloqués.") : `${label("Pour débloquer les paliers, effectue un dépôt unique d’au moins")} <strong>${htmlPrice(state.minimum_unlock_deposit)}</strong>.`}</p>
        <form id="partner-deposit-form" class="mt-4"><label class="grid gap-2 text-sm font-semibold">${label("Montant de la recharge")}
          <input class="${field}" name="amount" type="number" inputmode="decimal" min="1" max="100000" step="0.01" value="${unlocked ? "" : Number(state.minimum_unlock_deposit)}" required></label>
          <div class="mt-3" data-partner-feedback></div><button type="submit" class="mt-3 ${button}">${label("Recharger mon portefeuille")}</button></form></section>
      <section class="${card}"><h2 class="font-title text-2xl font-extrabold">${label("Progression partenaire")}</h2>
        <div class="mt-4 flex flex-wrap gap-2"><span class="rounded-full bg-graphite px-3 py-1 text-sm font-bold text-white">${tier}</span>
        <span class="rounded-full bg-green-50 px-3 py-1 text-sm font-bold text-green-800">${Number(state.discount_percent)} % · ${label("Remise active")}</span></div>
        <p class="mt-5 text-sm text-black/70">${label("Total dépensé")} : <strong>${htmlPrice(state.total_spent)}</strong></p>
        <progress max="100" value="${percent}" class="mt-3 h-3 w-full accent-aura" aria-label="${label("Progression partenaire")}"></progress>
        <p class="mt-2 text-sm text-black/60">${next ? `${label("Avant le prochain palier")} (${label(tierNames[next.tier])}) : ${htmlPrice(next.remaining)}`
          : label(unlocked ? "Tu as atteint le palier Or." : "Un dépôt débloque ta progression.")}</p>
        <ul class="mt-5 grid gap-2 text-sm">${(state.tiers || []).map(item=>`<li class="flex justify-between gap-2"><strong>${label(tierNames[item.tier])}</strong><span>${htmlPrice(item.threshold)} · ${Number(item.discount_percent)} %</span></li>`).join("")}</ul>
      </section></div><div class="mt-5" data-partner-operations></div>
      <section class="mt-5 ${card}"><div class="flex flex-wrap items-center justify-between gap-3"><h2 class="font-title text-2xl font-extrabold">${label("Historique du portefeuille")}</h2>
      <button class="${secondary}" data-partner-refresh>${label("Actualiser")}</button></div><ul id="partner-wallet-history" class="mt-3" aria-live="polite"></ul></section>`;
    let requestKey=null, requestedAmount=null;
    formHandler(document.getElementById("partner-deposit-form"),async form=>{
      const amount=Number(form.elements.amount.value);
      if(requestedAmount!==amount || !requestKey) {requestKey=crypto.randomUUID();requestedAmount=amount;}
      const result=await post("/partner/wallet/deposits",{amount,request_key:requestKey});
      if (safePaymentUrl(result.payment_url)) location.assign(result.payment_url);
      else {requestKey=null; await refresh({force:true}); draw(); if(result.status==="FAILED") toast("Le paiement de la recharge a échoué.");}
    });
    operations.attach(root.querySelector("[data-partner-operations]"),state.discount_percent);
    void showWallet(walletPage);
  }
  async function open() {
    const root=region(); if(!root) return;
    if (!getUser()) {draw();return;}
    root.innerHTML=msg(t("Chargement…"));
    try {
      await refresh({force:true});
      if (depositReturn && state?.partner_status==="APPROVED") {
        const id=depositReturn; depositReturn=null;
        try {await verify(id);} catch(error) {toast(error.message);}
      }
      draw();
    } catch(error) {root.innerHTML=msg(error.message,true);}
  }

  async function loadAdmin(offset=0) {
    const root=document.getElementById("admin-partner-content");
    if(!root || !enabled || getUser()?.is_admin!==true) return;
    if (offset===0) operations.loadAdminSupport(document.getElementById("admin-partner-support"));
    const version=++adminVersion;
    adminPage=offset;
    root.innerHTML=msg(t("Chargement…"));
    try {
      const result=await api(`/admin/partner-applications?offset=${offset}`);
      if(version!==adminVersion) return;
      root.innerHTML=(result.applications.length ? result.applications.map(app=>`<article class="${card} mb-4">
        <div class="flex flex-wrap items-center justify-between gap-3"><strong class="break-all font-title text-lg">${escape(app.email)}</strong>
          <span class="rounded-full bg-black/5 px-3 py-1 text-xs font-bold">${label(statuses[app.status])}</span></div>
        <p class="mt-1 text-xs text-black/60">${escape(date(app.submitted_at))}</p>
        <dl class="mt-4 grid gap-3 sm:grid-cols-2">${Object.entries(groups).map(([k,[title,choices]])=>`<div><dt class="text-xs font-semibold text-black/60">${label(title)}</dt><dd>${label(choices[app[k]] || "—")}</dd></div>`).join("")}
        ${Object.entries(textFields).map(([k,title])=>`<div><dt class="text-xs font-semibold text-black/60">${label(title)}</dt><dd class="break-words">${escape(app[k] || "—")}</dd></div>`).join("")}</dl>
        ${app.status==="PENDING" ? `<form class="mt-4" data-partner-review="${escape(app.id)}"><label class="grid gap-2 text-sm font-semibold">${label("Note administrative (facultative)")}<textarea class="${field}" name="note" maxlength="1000" rows="2"></textarea></label>
          <div class="mt-3 flex flex-wrap gap-2"><button type="submit" name="decision" value="APPROVED" class="${button}">${label("Approuver")}</button><button type="submit" name="decision" value="REJECTED" class="${secondary}">${label("Refuser")}</button></div>
          <p class="mt-2 text-sm text-red-700" data-review-feedback role="alert"></p></form>`
          : app.admin_note ? `<p class="mt-4 break-words text-sm">${label("Note administrative (facultative)")} : ${escape(app.admin_note)}</p>` : ""}</article>`).join("")
        : msg(t("Aucune demande partenaire.")))
        + `<div class="flex gap-2">${offset ? `<button class="${secondary}" data-partner-admin-page="${Math.max(0,offset-25)}">${label("Précédent")}</button>` : ""}${result.has_more ? `<button class="${secondary}" data-partner-admin-page="${offset+25}">${label("Suivant")}</button>` : ""}</div>`;
    } catch(error) {if(version===adminVersion) root.innerHTML=msg(error.message,true);}
  }
  document.addEventListener("click",async event=>{
    const target=event.target.closest("[data-partner-refresh],[data-wallet-page],[data-deposit-check],[data-partner-admin-page]");
    if(!target) return;
    if(target.hasAttribute("data-partner-refresh")) {void open();return;}
    if(target.dataset.walletPage!==undefined) {void showWallet(Number(target.dataset.walletPage));return;}
    if(target.dataset.partnerAdminPage!==undefined) {void loadAdmin(Number(target.dataset.partnerAdminPage));return;}
    target.disabled=true;
    try {await verify(target.dataset.depositCheck);} catch(error) {toast(error.message);}
    finally {target.disabled=false;}
  });
  document.addEventListener("submit",async event=>{
    const form=event.target.closest("[data-partner-review]");
    if(!form || !event.submitter) return;
    event.preventDefault();
    const note=form.elements.note.value;
    const buttons=[...form.querySelectorAll("button")]; buttons.forEach(b=>b.disabled=true);
    try {await post(`/admin/partner-applications/${encodeURIComponent(form.dataset.partnerReview)}/review`,{status:event.submitter.value,note}); await loadAdmin(adminPage);}
    catch(error) {form.querySelector("[data-review-feedback]").textContent=error.message;}
    finally {buttons.forEach(b=>b.disabled=false);}
  });
  document.getElementById("signup-account-type")?.addEventListener("change",syncEntrypoints);
  void config();
  return {refresh,open,loadAdmin,submit,state:()=>state,enabled:()=>enabled,hasDepositReturn:()=>Boolean(depositReturn),draw};
}
