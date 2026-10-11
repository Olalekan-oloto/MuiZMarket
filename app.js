const $ = (s) => document.querySelector(s);
const state = { products: [], categories: [], category: "All products", query: "", user: null, cart: readCart(), authMode: "login" };
function readCart(){ try { return JSON.parse(localStorage.getItem("muizmarket-cart") || "[]"); } catch { return []; } }
function saveCart(){ localStorage.setItem("muizmarket-cart", JSON.stringify(state.cart)); renderCart(); }
function escapeHtml(v){ return String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function dollars(n,currency="USD"){ const safe=["USD","NGN"].includes(currency)?currency:"USD"; return new Intl.NumberFormat("en-US",{style:"currency",currency:safe,maximumFractionDigits:2}).format(Number(n)||0); }
async function api(url, options={}) {
  const res = await fetch(url, { credentials:"same-origin", ...options, headers: { ...(options.body ? {"Content-Type":"application/json"} : {}), ...(options.headers||{}) } });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}
let toastTimer;
function toast(message){ const el=$("#toast"); el.textContent=message; el.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),2800); }
function cartQuantity(){ return state.cart.reduce((s,x)=>s+x.quantity,0); }
function renderProducts(){
  const q=state.query.toLowerCase();
  const products=state.products.filter(p=>(state.category==="All products"||p.category===state.category)&&`${p.name} ${p.category} ${p.description}`.toLowerCase().includes(q));
  $("#productCountText").textContent=`${products.length} ${products.length===1?"product":"products"} in this collection`;
  $("#productGrid").innerHTML=products.length?products.map((p,i)=>`<article class="product-card"><div class="product-top"><div class="product-symbol">${["✦","◈","◇","⌘","◎","▣"][i%6]}</div><span class="product-category">${escapeHtml(p.category)}</span></div><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.description)}</p><div class="product-bottom"><div class="price">${dollars(p.price,p.currency||"USD")} <small>${escapeHtml(p.currency||"USD")}</small></div><button class="add-btn" data-add="${p.id}">＋ Add to bag</button></div></article>`).join(""):`<div class="empty-state">No products found. Try another search or category.</div>`;
  $("#categoryFilters").innerHTML=state.categories.map(c=>`<button class="filter-btn ${state.category===c?"active":""}" data-category="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join("");
}
function renderCart(){
  $("#cartCount").textContent=cartQuantity(); $("#drawerCount").textContent=`(${cartQuantity()})`;
  const lines=state.cart.map(line=>({...line,product:state.products.find(p=>p.id===line.id)})).filter(x=>x.product);
  $("#cartItems").innerHTML=lines.length?lines.map(x=>`<div class="cart-line"><div class="product-symbol">✦</div><div class="cart-line-main"><b>${escapeHtml(x.product.name)}</b><small>${dollars(x.product.price,x.product.currency||"USD")} each</small></div><div class="qty-control"><button data-qty="${x.id}" data-delta="-1" aria-label="Decrease quantity">−</button><span>${x.quantity}</span><button data-qty="${x.id}" data-delta="1" aria-label="Increase quantity">+</button></div></div>`).join(""):`<div class="empty-state">Your bag is waiting for something good.</div>`;
  const total=lines.reduce((sum,x)=>sum+x.product.price*x.quantity,0);
  const currency=lines[0]?.product.currency||"USD";
  $("#cartTotal").textContent=dollars(total,currency);
  $("#checkoutButton").disabled=!lines.length;
  $("#checkoutButton").style.opacity=lines.length?"1":".5";
}
function setCartOpen(open){ $("#cartDrawer").classList.toggle("open",open); $("#overlay").classList.toggle("open",open); $("#cartDrawer").setAttribute("aria-hidden",String(!open)); }
function setAuthOpen(open,mode=state.authMode){ $("#authModal").classList.toggle("open",open); if(open){$("#authForm").classList.remove("hidden");$("#verifyForm").classList.add("hidden");document.querySelector(".auth-tabs").classList.remove("hidden");setAuthMode(mode);} }
function setAuthMode(mode){ state.authMode=mode; $("#authTitle").textContent=mode==="login"?"Sign in":"Create your account"; $("#authSubtitle").textContent=mode==="login"?"Sign in to manage your orders and checkout.":"A few details to make MuiZMarket yours."; $("#nameLabel").classList.toggle("hidden",mode!=="register"); $("#nameField").required=mode==="register"; $("#passwordField").autocomplete=mode==="login"?"current-password":"new-password"; $("#authSubmit").textContent=mode==="login"?"Sign in ↗":"Create account ↗"; document.querySelectorAll(".auth-tab").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode)); $("#authError").textContent=""; }
function renderAuth(){ $("#authButton").textContent=state.user?"Sign out":"Sign in"; $("#authButton").classList.toggle("btn-gold",Boolean(state.user)); $("#authButton").classList.toggle("btn-outline",!state.user); $("#heroAccount").textContent=state.user?"Open buyer dashboard →":"Create an account →"; $("#ctaAccount").textContent=state.user?"Open buyer dashboard ↗":"Get started ↗"; }
async function signOut(){try{await api("/api/logout",{method:"POST",body:JSON.stringify({})});state.user=null;renderAuth();await loadOrders();await renderSellerWorkspace();toast("You have signed out securely.");}catch(e){toast(e.message);}}
async function loadOrders(){
  const el=$("#ordersList");
  if(!state.user){el.innerHTML='<div class="empty-state">Sign in to view your order history.</div>';return;}
  try{const {orders}=await api("/api/orders");el.innerHTML=orders.length?orders.map(o=>`<div class="order-card"><div><strong>Order #${o.id}</strong><small>${new Date(o.created_at+"Z").toLocaleString()} · ${o.items.map(i=>`${escapeHtml(i.name)} × ${i.quantity}`).join(", ")}</small></div><div style="text-align:right"><strong>${dollars(o.total,o.currency||"USD")}</strong><small class="status">${escapeHtml(o.status)}</small></div></div>`).join(""):'<div class="empty-state">No orders yet. Your first discovery is waiting above.</div>';}catch(e){el.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`;}
}
async function refreshMe(){const d=await api("/api/me");state.user=d.user;renderAuth();loadOrders();renderSellerWorkspace();}
function sellerPanel(title,body){return `<div class="seller-panel"><h3>${title}</h3>${body}</div>`;}
async function renderSellerWorkspace(){
  const root=$("#sellerWorkspace"); if(!root)return;
  if(!state.user){root.innerHTML=sellerPanel("Start selling",'<p>Sign in, apply for a seller account, and wait for owner approval before publishing products.</p><button class="btn btn-gold" id="applySeller">Apply to become a seller ↗</button>');return;}
  if(state.user.role==="customer") {root.innerHTML=sellerPanel("Start selling",'<p>Your buyer account is ready. Apply to become a seller; the owner will review your application.</p><button class="btn btn-gold" id="applySeller">Apply to become a seller ↗</button><div class="seller-message" id="sellerMessage"></div>');return;}
  try{
    const d=await api("/api/seller/dashboard"); const balances=(d.balances||[]).map(b=>`<div class="seller-metric"><small>Available to withdraw · ${escapeHtml(b.currency)}</small><strong>${dollars(b.available_cents/100,b.currency)}</strong><small>Pending: ${dollars(b.pending_cents/100,b.currency)} · Paid out: ${dollars(b.paid_cents/100,b.currency)}</small></div>`).join("")||'<div class="seller-metric"><small>Available to withdraw</small><strong>₦0.00</strong><small>Your sales earnings will appear here.</small></div>';
    const products=(d.products||[]).map(p=>`<div class="seller-row"><div><b>${escapeHtml(p.name)}</b><small>${escapeHtml(p.currency)} ${dollars(p.price,p.currency)} · ${escapeHtml(p.approval_status)}</small></div><span class="status">${p.active?"Live":"Under review"}</span></div>`).join("")||'<p>No listings yet.</p>';
    const payouts=(d.payouts||[]).map(p=>`<div class="seller-row"><div><b>${dollars(p.amount_cents/100,p.currency)}</b><small>${new Date(p.created_at+"Z").toLocaleDateString()}</small></div><span class="status">${escapeHtml(p.status)}</span></div>`).join("")||'<p>No payout requests yet.</p>';
    const trialEnd=d.seller.seller_trial_ends_at?new Date(d.seller.seller_trial_ends_at):null;
    const trialDays=trialEnd?Math.max(0,Math.ceil((trialEnd.getTime()-Date.now())/86400000)):0;
    const trialNotice=trialDays>0?`<p class="seller-message"><b>7-day free trial</b> · ${trialDays} day${trialDays===1?"":"s"} remaining, until ${trialEnd.toLocaleDateString()}. No subscription payment is taken during the trial. Choose a plan after the trial ends.</p>`:"";
    const sub=d.subscription?`<p>Current plan: <b>${escapeHtml(d.subscription.plan_code)}</b> · ${escapeHtml(d.subscription.status)} · ${escapeHtml(d.subscription.currency)}${d.subscription.current_period_end?` · renews/ends ${new Date(d.subscription.current_period_end).toLocaleDateString()}`:""}</p>${d.subscription.cancel_at_period_end?'<p class="seller-message">Auto-renewal cancelled. Access remains until the paid period ends.</p>':(["active","past_due"].includes(d.subscription.status)?'<button class="btn btn-outline" id="cancelSubscription">Cancel auto-renewal</button>':"")}`:(trialDays>0?"<p>No paid plan yet.</p>":'<p>No active seller subscription or free trial found.</p>');
    let html=sellerPanel("Seller status",`<p>Account: <b>${escapeHtml(d.seller.seller_status)}</b>. A 10% marketplace commission applies to successful sales.</p><div class="seller-metrics">${balances}</div>`);
    if(d.seller.seller_status!=="approved") html+=sellerPanel("Application pending",'<p>The owner must approve your seller account before listings and paid plans can be activated.</p>');
    else {
      html+=sellerPanel("Subscription",`${trialNotice}${sub}<p>Monthly: $15 / ₦15,000. Every 3 months: $40 / ₦40,000. Yearly: $120 / ₦120,000.</p><p>Newly approved sellers receive one 7-day free trial before payment is required.</p><label>Currency<select id="subCurrency"><option value="NGN">NGN · Naira</option><option value="USD">USD · US dollar</option></select></label><div class="seller-actions"><button data-subscribe="monthly">Pay monthly</button><button data-subscribe="quarterly">Pay every 3 months</button><button data-subscribe="yearly">Pay yearly</button></div><div class="seller-message" id="sellerMessage"></div>`);
      html+=sellerPanel("Add a product",`<form id="sellerProductForm"><label>Product name<input name="name" required maxlength="120"></label><label>Digital product category<select name="category" required>
        <option value="">Choose a category</option>
        <option>Instagram Content Kits</option><option>Facebook Marketing Assets</option><option>X (Twitter) Resources</option><option>Pinterest Templates</option>
        <option>Social Media Marketing Tools</option><option>Graphic Design Assets</option><option>Website Templates</option><option>Software & Plugins</option><option>E-books & Learning</option><option>Business Templates</option><option>Digital Services</option><option>Other Digital Products</option>
      </select></label><label>Description<textarea name="description" required maxlength="1000"></textarea></label><label>Price<input name="price" type="number" min="0.01" step="0.01" required></label><label>Currency<select name="currency"><option value="NGN">NGN · Naira</option><option value="USD">USD · US dollar</option></select></label><button class="btn btn-gold" type="submit">Submit listing for review ↗</button><div class="seller-message" id="productMessage"></div></form>`);
      html+=sellerPanel("Your listings",products);
      html+=sellerPanel("Verified payout account",`${d.seller.payout_account_verified?`<p><b>${escapeHtml(d.seller.payout_bank_name||"Nigerian bank")}</b> · ${escapeHtml(d.seller.payout_account_name||"")}</p><p class="seller-message">Bank account verified. To change it, submit new details below.</p>`:"<p>Verify a Nigerian bank account before requesting automated NGN payouts.</p>"}<form id="payoutAccountForm"><label>Flutterwave bank code<input name="bank_code" required placeholder="e.g. 044"></label><label>10-digit account number<input name="account_number" inputmode="numeric" pattern="[0-9]{10}" maxlength="10" required placeholder="0123456789"></label><label>Phone number<input name="phone" type="tel" required placeholder="+234…"></label><button class="btn btn-outline" type="submit">Verify and save bank account</button><div class="seller-message" id="payoutAccountMessage"></div></form>`);
      html+=sellerPanel("Withdraw earnings",'<p>NGN withdrawals: minimum ₦1,000 and maximum ₦500,000 per request. Requests are reviewed before bank transfer. USD payouts are manual.</p><form id="payoutForm"><label>Amount<input id="payoutAmount" name="amount" type="number" min="1000" max="500000" step="1" required placeholder="1000"></label><label>Currency<select id="payoutCurrency" name="currency"><option value="NGN">NGN · Naira</option><option value="USD">USD · US dollar (manual payout)</option></select></label><button class="btn btn-outline" type="submit">Request withdrawal</button><div class="seller-message" id="payoutMessage"></div></form>');
      html+=sellerPanel("Payout history",payouts);
    }
    if(state.user.role==="admin"){
      const [apps,listings,payoutData,finance]=await Promise.all([api("/api/admin/seller-applications"),api("/api/admin/listings"),api("/api/admin/payouts"),api("/api/admin/finance")]);
      const financeMetrics=(rows,field,label)=>rows.map(x=>`<div class="seller-metric"><small>${label} · ${escapeHtml(x.currency)}</small><strong>${dollars((x[field]||0)/100,x.currency)}</strong></div>`).join("")||'<p>No recorded activity yet.</p>';
      const payoutTotals=(finance.payouts||[]).map(x=>`<div class="seller-row"><div><b>${escapeHtml(x.currency)} · ${escapeHtml(x.status)}</b><small>${x.count} request(s)</small></div><strong>${dollars(x.amount_cents/100,x.currency)}</strong></div>`).join("")||"<p>No payout requests yet.</p>";
      const financeHtml=`<p><b>Important:</b> This is the marketplace ledger, not your live bank/provider balance. Confirm settled funds, fees, refunds, and disputes in Flutterwave/Stripe.</p><div class="seller-metrics">${financeMetrics(finance.sales,"gross_cents","Paid orders gross")}${financeMetrics(finance.ledger,"commission_cents","Marketplace commission")}${financeMetrics(finance.ledger,"seller_earnings_cents","Seller earnings recorded")}${financeMetrics(finance.sellerLiabilities,"allocated_or_held_cents","Seller funds allocated/held")}</div><h4>Subscriptions (latest recorded payment per subscription)</h4><div class="seller-metrics">${financeMetrics(finance.subscriptions,"latest_subscription_amount_cents","Latest subscription amount")}</div><h4>Payout totals by status</h4>${payoutTotals}`;
      html+=sellerPanel("Owner · financial overview",financeHtml);
      html+=sellerPanel("Owner · recent buyer orders",(finance.recentOrders||[]).map(o=>`<div class="seller-row"><div><b>Order #${o.id} · ${dollars(o.total_cents/100,o.currency)}</b><small>${escapeHtml(o.buyer_name)} · ${escapeHtml(o.buyer_email)} · ${new Date(o.created_at+"Z").toLocaleDateString()}</small></div><span class="status">${escapeHtml(o.status)}</span></div>`).join("")||"<p>No orders recorded yet.</p>");
      html+=sellerPanel("Owner · seller applications",(apps.sellers||[]).map(x=>`<div class="seller-row"><div><b>${escapeHtml(x.name)}</b><small>${escapeHtml(x.email)} · ${escapeHtml(x.seller_status)}</small></div><div class="seller-actions"><button data-seller-status="approved" data-id="${x.id}">Approve</button><button data-seller-status="rejected" data-id="${x.id}">Reject</button></div></div>`).join("")||'<p>No seller applications.</p>');
      html+=sellerPanel("Owner · listing moderation",(listings.products||[]).filter(p=>p.seller_id).map(p=>`<div class="seller-row"><div><b>${escapeHtml(p.name)}</b><small>${escapeHtml(p.seller_name||"Seller")} · ${escapeHtml(p.currency)} ${dollars(p.price_cents/100,p.currency)} · ${escapeHtml(p.approval_status)}</small></div><div class="seller-actions"><button data-listing-status="approved" data-id="${p.id}">Approve</button><button data-listing-status="rejected" data-id="${p.id}">Reject</button></div></div>`).join("")||'<p>No seller listings awaiting review.</p>');
      html+=sellerPanel("Owner · payout review",(payoutData.payouts||[]).filter(p=>["requested","approved","processing"].includes(p.status)).map(p=>`<div class="seller-row"><div><b>${escapeHtml(p.seller_name)} · ${dollars(p.amount_cents/100,p.currency)}</b><small>${escapeHtml(p.email)} · ${escapeHtml(p.status)}${p.note?` · ${escapeHtml(p.note)}`:""}</small></div><div class="seller-actions">${p.status==="requested"?`<button data-payout-status="approved" data-id="${p.id}">Approve</button><button data-payout-status="rejected" data-id="${p.id}">Reject</button>`:p.status==="approved"?`<button data-payout-status="rejected" data-id="${p.id}">Reject</button>${p.currency==="NGN"?`<button data-payout-transfer="${p.id}">Send NGN payout</button>`:""}`:"Awaiting provider result"}</div></div>`).join("")||'<p>No payout requests awaiting review.</p>');
    }
    root.innerHTML=html;
  }catch(e){root.innerHTML=sellerPanel("Seller workspace",`<p>${escapeHtml(e.message)}</p><button class="btn btn-outline" id="applySeller">Apply / refresh seller status</button>`);}
}
async function init(){
  $("#year").textContent=new Date().getFullYear();
  const [products,categories,config]=await Promise.all([api("/api/products"),api("/api/categories"),api("/api/config")]);
  state.products=products.products;state.categories=categories.categories;renderProducts();renderCart();
  $("#paymentNote").textContent=`Prices may be shown in USD or NGN. ${config.usdCardCheckoutEnabled?"USD card checkout is available for eligible cards; your bank may apply conversion or international fees.":"USD card checkout is not enabled until the payment provider approves it."}`;
  const footnote=document.querySelector(".cart-footer .fine-print");if(footnote)footnote.textContent=config.paymentsEnabled?"Never pay twice if a confirmation is delayed. Orders are confirmed by the payment provider; seller payouts remain subject to review.":"Secure checkout is unavailable until a payment provider is configured.";
  await refreshMe();
  const params=new URLSearchParams(location.search);
  if(params.get("checkout")==="return" && params.get("transaction_id") && params.get("tx_ref")){
    try{const confirmed=await api("/api/checkout/confirm",{method:"POST",body:JSON.stringify({transaction_id:params.get("transaction_id"),tx_ref:params.get("tx_ref")})});state.cart=[];saveCart();await loadOrders();toast(`Payment confirmed for order #${confirmed.orderId}.`);}
    catch(err){toast(`${err.message} Please refresh your orders before trying to pay again.`);await loadOrders();}
  }
  if(params.get("checkout")==="success")toast("Payment submitted. Order status will update after provider verification.");
  if(params.get("checkout")==="cancelled")toast("Checkout was cancelled. Your bag is still here.");
  if(params.has("subscription")){toast("Subscription payment submitted. Your plan will activate after payment verification.");await renderSellerWorkspace();}
  if(params.has("checkout")||params.has("subscription"))history.replaceState({}, "", "/");
}
document.addEventListener("click",async e=>{
  const add=e.target.closest("[data-add]");
  if(add){const id=Number(add.dataset.add);const line=state.cart.find(x=>x.id===id);if(line){if(line.quantity<10)line.quantity++;else return toast("Maximum quantity is 10 per product.");}else state.cart.push({id,quantity:1});saveCart();toast("Added to your bag.");return;}
  const cat=e.target.closest("[data-category]");if(cat){state.category=cat.dataset.category;renderProducts();return;}
  const qty=e.target.closest("[data-qty]");if(qty){const id=Number(qty.dataset.qty),delta=Number(qty.dataset.delta),line=state.cart.find(x=>x.id===id);if(line){line.quantity+=delta;if(line.quantity<=0)state.cart=state.cart.filter(x=>x.id!==id);if(line.quantity>10)line.quantity=10;saveCart();}return;}
  const mode=e.target.closest("[data-mode]");if(mode){setAuthMode(mode.dataset.mode);return;}
  if(e.target.closest("#applySeller")){if(!state.user){setAuthOpen(true,"login");return;}try{const d=await api("/api/seller/apply",{method:"POST",body:JSON.stringify({})});state.user={...state.user,role:d.role,seller_status:d.seller_status};renderAuth();await renderSellerWorkspace();toast(d.message);}catch(err){toast(err.message);}return;}
  if(e.target.closest("#refreshSeller")){await renderSellerWorkspace();toast("Seller workspace refreshed.");return;}
  const subscribe=e.target.closest("[data-subscribe]");if(subscribe){try{const d=await api("/api/seller/subscription/checkout",{method:"POST",body:JSON.stringify({plan:subscribe.dataset.subscribe,currency:$("#subCurrency")?.value||"NGN"})});if(d.url)location.href=d.url;}catch(err){const msg=$("#sellerMessage");if(msg)msg.textContent=err.message;else toast(err.message);}return;}
  if(e.target.closest("#cancelSubscription")){if(!confirm("Cancel automatic renewal? Your paid access will continue until the current period ends."))return;try{const d=await api("/api/seller/subscription/cancel",{method:"POST",body:JSON.stringify({})});toast(d.message);await renderSellerWorkspace();}catch(err){toast(err.message);}return;}
  const transferPayout=e.target.closest("[data-payout-transfer]");if(transferPayout){if(!confirm("Initiate a real NGN bank transfer for this approved payout?"))return;try{const d=await api(`/api/admin/payouts/${transferPayout.dataset.payoutTransfer}/transfer`,{method:"POST",body:JSON.stringify({})});toast(d.message);await renderSellerWorkspace();}catch(err){toast(err.message);}return;}
  const sellerStatus=e.target.closest("[data-seller-status]");if(sellerStatus){try{await api(`/api/admin/sellers/${sellerStatus.dataset.id}`,{method:"PATCH",body:JSON.stringify({status:sellerStatus.dataset.sellerStatus})});await renderSellerWorkspace();toast("Seller status updated.");}catch(err){toast(err.message);}return;}
  const listingStatus=e.target.closest("[data-listing-status]");if(listingStatus){try{await api(`/api/admin/listings/${listingStatus.dataset.id}`,{method:"PATCH",body:JSON.stringify({status:listingStatus.dataset.listingStatus})});await renderSellerWorkspace();toast("Listing moderation updated.");}catch(err){toast(err.message);}return;}
  const payoutStatus=e.target.closest("[data-payout-status]");if(payoutStatus){try{await api(`/api/admin/payouts/${payoutStatus.dataset.id}`,{method:"PATCH",body:JSON.stringify({status:payoutStatus.dataset.payoutStatus})});await renderSellerWorkspace();toast("Payout status updated.");}catch(err){toast(err.message);}return;}
  if(e.target.closest("#cartOpen")){setCartOpen(true);return;}
  if(e.target.closest("#cartClose")||e.target.id==="overlay"){setCartOpen(false);return;}
  if(e.target.closest("#authButton")){if(state.user){await signOut();return;}setAuthOpen(true);return;} if(e.target.closest("#heroAccount")||e.target.closest("#ctaAccount")){if(state.user){location.href="/buyer";return;}setAuthOpen(true);return;}
  if(e.target.closest("[data-close-modal]")){setAuthOpen(false);return;}
});
$("#searchInput").addEventListener("input",e=>{state.query=e.target.value;renderProducts();});
$("#refreshOrders").addEventListener("click",loadOrders);
$("#authForm").addEventListener("submit",async e=>{
  e.preventDefault();const mode=state.authMode;const payload={email:$("#emailField").value.trim(),password:$("#passwordField").value};if(mode==="register")payload.name=$("#nameField").value.trim();
  $("#authSubmit").disabled=true;$("#authError").textContent="";
  try{const d=await api(`/api/${mode==="login"?"login":"register"}`,{method:"POST",body:JSON.stringify(payload)});if(d.needsVerification){$("#verifyEmailField").value=d.email;$("#authForm").classList.add("hidden");document.querySelector(".auth-tabs").classList.add("hidden");$("#verifyForm").classList.remove("hidden");$("#authTitle").textContent="Verify your email";$("#authSubtitle").textContent=d.message;return;}state.user=d.user;renderAuth();setAuthOpen(false);toast(mode==="login"?"Welcome back.":"Your email is verified and your account is ready.");await loadOrders();await renderSellerWorkspace();}
  catch(err){$("#authError").textContent=err.message;}
  finally{$("#authSubmit").disabled=false;}
});
$("#verifyForm").addEventListener("submit",async e=>{e.preventDefault();const email=$("#verifyEmailField").value.trim();const code=$("#verifyCodeField").value.trim();$("#verifyError").textContent="";try{const d=await api("/api/verify-email",{method:"POST",body:JSON.stringify({email,code})});state.user=d.user;renderAuth();setAuthOpen(false);toast(d.message);await loadOrders();await renderSellerWorkspace();}catch(err){$("#verifyError").textContent=err.message;}});
$("#resendCode").addEventListener("click",async()=>{try{const d=await api("/api/resend-verification",{method:"POST",body:JSON.stringify({email:$("#verifyEmailField").value.trim()})});$("#verifyError").textContent=d.message;}catch(err){$("#verifyError").textContent=err.message;}});
$("#checkoutButton").addEventListener("click",async()=>{
  if(!state.user){setCartOpen(false);setAuthOpen(true,"login");toast("Sign in to continue to checkout.");return;}
  $("#checkoutButton").disabled=true;
  try{const d=await api("/api/checkout",{method:"POST",body:JSON.stringify({items:state.cart.map(x=>({id:x.id,quantity:x.quantity}))})});
    if(d.url){location.href=d.url;return;}
    throw new Error("Secure payment checkout is not configured yet. Please try again later.");
  }catch(err){toast(err.message);}
  finally{$("#checkoutButton").disabled=false;}
});

$("#menuToggle").addEventListener("click",()=>{const nav=document.querySelector(".desktop-nav");const shown=nav.style.display==="flex";nav.style.display=shown?"none":"flex";if(!shown){nav.style.position="absolute";nav.style.top="70px";nav.style.left="0";nav.style.right="0";nav.style.padding="20px 7%";nav.style.background="#151512";nav.style.flexDirection="column";nav.style.borderBottom="1px solid #343126";}});
document.addEventListener("change",e=>{
  if(e.target.id==="payoutCurrency") { const amount=document.querySelector("#payoutAmount"); if(!amount)return; if(e.target.value==="NGN"){amount.min="1000";amount.max="500000";amount.step="1";amount.placeholder="1000";}else{amount.min="10";amount.max="2000";amount.step="0.01";amount.placeholder="10.00";} amount.value=""; }
});
document.addEventListener("submit",async e=>{
  if(e.target.id==="sellerProductForm") {e.preventDefault();const form=e.target;const payload=Object.fromEntries(new FormData(form).entries());payload.price=Number(payload.price);try{const d=await api("/api/seller/products",{method:"POST",body:JSON.stringify(payload)});$("#productMessage").textContent=d.message;form.reset();await renderSellerWorkspace();toast("Listing submitted for review.");}catch(err){$("#productMessage").textContent=err.message;} }
  if(e.target.id==="payoutAccountForm") {e.preventDefault();const form=e.target;const payload=Object.fromEntries(new FormData(form).entries());try{const d=await api("/api/seller/payout-account",{method:"POST",body:JSON.stringify(payload)});$("#payoutAccountMessage").textContent=d.message;form.reset();await renderSellerWorkspace();toast("Payout account verified.");}catch(err){$("#payoutAccountMessage").textContent=err.message;} }
  if(e.target.id==="payoutForm") {e.preventDefault();const form=e.target;const payload=Object.fromEntries(new FormData(form).entries());payload.amount=Number(payload.amount);try{const d=await api("/api/seller/payouts",{method:"POST",body:JSON.stringify(payload)});$("#payoutMessage").textContent=d.message;form.reset();await renderSellerWorkspace();toast("Payout request submitted.");}catch(err){$("#payoutMessage").textContent=err.message;} }
});
document.addEventListener("keydown",e=>{if(e.key==="Escape"){setCartOpen(false);setAuthOpen(false);}});
init().catch(err=>{console.error(err);$("#productGrid").innerHTML=`<div class="empty-state">Could not load the marketplace. Please refresh the page.</div>`;});
