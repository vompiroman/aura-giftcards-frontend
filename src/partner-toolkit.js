const ticketStatuses = { OPEN:"Ouverte", IN_PROGRESS:"En cours", RESOLVED:"Résolue" };

export function createPartnerToolkit({ api, t, escape, price, date, language, styles }) {
  const { card, field, secondary } = styles;
  const label = text => escape(t(text));
  const money = amount => escape(price(Number(amount)));
  const status = (node, message) => { node.textContent=t(message); };
  const write = (path, method, body) => api(path,{method,body:JSON.stringify(body)});
  const options = (current="") => Object.entries(ticketStatuses)
    .map(([key,name])=>`<option value="${key}" ${key===current?"selected":""}>${label(name)}</option>`).join("");
  let adminVersion=0;

  function stockTools(root, openBasket) {
    const guide=root.querySelector("[data-toolkit-guide]");
    const alert=root.querySelector("[data-stock-alert]");
    let profiles=null, subscribed=false, ready=false, writing=false, revision=0, lastFetch=0;
    alert.innerHTML=`<button type="button" class="${secondary}" hidden></button><p class="mt-2 text-sm" role="status"></p>`;
    const control=alert.querySelector("button");
    const feedback=alert.querySelector("p");
    function renderAlert() {
      control.hidden=!ready || (!subscribed && profiles!==0);
      control.disabled=writing;
      control.textContent=t(subscribed?"Annuler l’alerte Netflix":"Me prévenir du retour en stock");
    }
    async function refresh(profileCount) {
      const changed=profiles!==profileCount;
      profiles=profileCount;
      if (writing || (!changed && Date.now()-lastFetch<20_000)) return;
      lastFetch=Date.now();
      const current=++revision;
      try {
        const result=await api("/partner/toolkit");
        if (!root.isConnected || current!==revision) return;
        ready=true;
        subscribed=result.subscribed===true;
        if (result.onboarding_complete) guide.replaceChildren();
        else if (!guide.firstChild) {
          guide.innerHTML=`<section class="mb-5 ${card}"><h2 class="font-title text-2xl font-extrabold">${label("Bien démarrer comme partenaire")}</h2>
            <ol class="mt-3 grid list-decimal gap-3 ps-5 text-sm sm:grid-cols-3">
              <li><a class="font-bold text-aura underline" data-onboarding-wallet href="#partner">${label("Recharger mon portefeuille")}</a><p class="mt-1">${label("Effectue une recharge pour payer avec ton solde.")}</p></li>
              <li><button type="button" class="text-start font-bold text-aura underline" data-onboarding-basket>${label("Passer une première commande")}</button><p class="mt-1">${label("Choisis une offre et valide ton panier.")}</p></li>
              <li><button type="button" class="text-start font-bold text-aura underline" data-onboarding-orders>${label("Suivre ma livraison")}</button><p class="mt-1">${label("Retrouve la livraison dans tes commandes partenaire.")}</p></li>
            </ol></section>`;
          guide.querySelector("[data-onboarding-wallet]").addEventListener("click",event=>{
            event.preventDefault(); document.getElementById("partner-deposit-form")?.elements.amount.focus();
          });
          guide.querySelector("[data-onboarding-basket]").addEventListener("click",()=>openBasket("basket"));
          guide.querySelector("[data-onboarding-orders]").addEventListener("click",()=>openBasket("orders"));
        }
      } catch { /* Keep the existing dashboard usable before the toolkit migration. */ }
      finally { renderAlert(); }
    }
    control.addEventListener("click",async ()=>{
      const enable=!subscribed;
      revision++; writing=true; renderAlert();
      try {
        const result=await write("/partner/stock/alert","PUT",{enabled:enable,language:language()});
        subscribed=result.subscribed;
        status(feedback,subscribed?"Alerte Netflix activée.":enable?"Netflix est déjà disponible.":"Alerte Netflix annulée.");
      } catch(error) { status(feedback,error.message); }
      finally { writing=false; renderAlert(); }
    });
    return refresh;
  }

  function orderTools(order,index) {
    return `<div class="mt-3 grid gap-2">
      <details data-order-support="${index}"><summary class="cursor-pointer text-sm font-bold text-aura">${label("Signaler un problème")}</summary>
        <form class="mt-2"><label class="grid gap-1 text-sm font-semibold">${label("Décris le problème")}
          <textarea name="message" class="${field}" rows="3" minlength="10" maxlength="1500" required></textarea></label>
          <p class="mt-1 text-xs text-black/65">${label("Évite les mots de passe et les codes PIN.")}</p>
          <button class="mt-2 ${secondary}" type="submit">${label("Envoyer la demande")}</button>
          <p class="mt-2 text-sm" role="status"></p>
        </form></details>
      ${order.payment_status==="paid"?`<details data-order-margin="${index}"><summary class="cursor-pointer text-sm font-bold text-aura">${label("Marge de revente")}</summary>
        <form class="mt-2" hidden><label class="grid gap-1 text-sm font-semibold">${label("Prix de revente (DA)")}
          <input name="resale" type="number" min="0" max="1000000000" step="0.01" class="${field}"></label>
          <p class="my-2 text-sm" data-margin-value></p><p class="text-xs text-black/65">${label("Marge brute avant tes frais.")}</p>
          <button class="mt-2 ${secondary}" type="submit">${label("Enregistrer")}</button></form>
        <p class="mt-2 text-sm" role="status"></p></details>`:""}
    </div>`;
  }

  function bindOrderTools(root,orders) {
    root.querySelectorAll("[data-order-support]").forEach(node=>{
      const form=node.querySelector("form");
      const path=`/partner/orders/${encodeURIComponent(orders[Number(node.dataset.orderSupport)].order_id)}/support`;
      form.addEventListener("submit",async event=>{
        event.preventDefault(); const submit=event.submitter; submit.disabled=true;
        try {
          await write(path,"POST",{message:form.elements.message.value});
          form.reset(); status(form.querySelector("[role=status]"),"Demande envoyée. Retrouve-la dans Assistance.");
        } catch(error) { status(form.querySelector("[role=status]"),error.message); }
        finally { submit.disabled=false; }
      });
    });
    root.querySelectorAll("[data-order-margin]").forEach(node=>{
      const form=node.querySelector("form");
      const feedback=node.querySelector("[role=status]");
      const path=`/partner/orders/${encodeURIComponent(orders[Number(node.dataset.orderMargin)].order_id)}/margin`;
      function render(value) {
        form.elements.resale.value=value.resale_price ?? "";
        form.querySelector("[data-margin-value]").innerHTML=`${label("Prix payé")} : ${money(value.cost)} · ${label("Marge brute estimée")} : ${value.gross_margin===null?"—":money(value.gross_margin)}`;
        form.hidden=false;
      }
      node.addEventListener("toggle",async ()=>{
        if (!node.open || !form.hidden) return;
        try { render(await api(path)); }
        catch(error) { status(feedback,error.message); }
      });
      form.addEventListener("submit",async event=>{
        event.preventDefault(); const submit=event.submitter; submit.disabled=true;
        const raw=form.elements.resale.value;
        try {
          render(await write(path,"PUT",{resale_price:raw===""?null:Number(raw)}));
          status(feedback,"Prix de revente enregistré.");
        } catch(error) { status(feedback,error.message); }
        finally { submit.disabled=false; }
      });
    });
  }

  async function renderTickets(root,isCurrent,{admin=false,offset=0,filter=""}={}) {
    const base=admin?"/admin/partner-support":"/partner/support";
    if (admin) root.innerHTML=`<label class="mb-3 grid max-w-56 gap-1 text-sm font-semibold">${label("Statut")}
      <select class="${field}" data-ticket-filter><option value="">${label("Tous les statuts")}</option>${options(filter)}</select></label><div data-ticket-list></div>`;
    const region=admin?root.querySelector("[data-ticket-list]"):root;
    root.querySelector("[data-ticket-filter]")?.addEventListener("change",event=>{
      void renderTickets(root,isCurrent,{admin:true,filter:event.target.value});
    });
    status(region,"Chargement…");
    try {
      const result=await api(`${base}?${new URLSearchParams({offset,status:filter})}`);
      if (!isCurrent() || !region.isConnected) return;
      region.innerHTML=result.tickets.map(ticket=>`<article class="border-b border-black/10 py-3">
        <strong><bdi>${escape(ticket.order_id)}</bdi> · ${label(ticketStatuses[ticket.status])}</strong>
        <p class="mt-1 text-xs text-black/60">${escape(date(ticket.created_at))}</p>
        <p class="mt-2 whitespace-pre-wrap break-words text-sm">${escape(ticket.message)}</p>
        ${admin?`<form class="mt-2 grid gap-2" data-ticket-update="${escape(ticket.id)}">
          <label class="grid gap-1 text-sm font-semibold">${label("Statut")}<select name="status" class="${field}">${options(ticket.status)}</select></label>
          <label class="grid gap-1 text-sm font-semibold">${label("Réponse au partenaire")}<textarea class="${field}" name="reply" maxlength="1500" rows="2">${escape(ticket.reply||"")}</textarea></label>
          <button type="submit" class="justify-self-start ${secondary}">${label("Enregistrer")}</button><p role="status" class="text-sm"></p></form>`
          :ticket.reply?`<p class="mt-2 whitespace-pre-wrap break-words rounded-lg bg-ivory p-3 text-sm"><strong>${label("Réponse de l’assistance")}</strong><br>${escape(ticket.reply)}</p>`:""}
      </article>`).join("") || `<p class="text-sm text-black/60">${label("Aucune demande d’assistance.")}</p>`;
      region.innerHTML+=`<div class="mt-3 flex gap-2">${offset?`<button class="${secondary}" data-ticket-page="-20">${label("Précédent")}</button>`:""}
        ${result.has_more?`<button class="${secondary}" data-ticket-page="20">${label("Suivant")}</button>`:""}</div>`;
      region.querySelectorAll("[data-ticket-page]").forEach(el=>el.addEventListener("click",()=>{
        void renderTickets(root,isCurrent,{admin,offset:offset+Number(el.dataset.ticketPage),filter});
      }));
      region.querySelectorAll("[data-ticket-update]").forEach(form=>form.addEventListener("submit",async event=>{
        event.preventDefault(); const submit=event.submitter; submit.disabled=true;
        try {
          await write(`${base}/${encodeURIComponent(form.dataset.ticketUpdate)}`,"PUT",{
            status:form.elements.status.value,reply:form.elements.reply.value,
          });
          if (isCurrent()) await renderTickets(root,isCurrent,{admin,offset,filter});
        } catch(error) { status(form.querySelector("[role=status]"),error.message); }
        finally { submit.disabled=false; }
      }));
    } catch(error) { if (isCurrent() && region.isConnected) status(region,error.message); }
  }

  return {
    stockTools,orderTools,bindOrderTools,renderTickets,
    loadAdmin(root) {
      if (!root) return;
      const version=++adminVersion;
      void renderTickets(root,()=>version===adminVersion,{admin:true});
    },
    clearAdmin(root) { adminVersion++; root?.replaceChildren(); },
  };
}
