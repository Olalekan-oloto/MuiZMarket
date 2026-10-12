(() => {
  const $ = s => document.querySelector(s);
  const products = [
    {id:1,name:'Instagram Content Kit',category:'Instagram Content Kits',description:'A coordinated set of post ideas, editable layouts and a simple content planner.',price:12,symbol:'◎'},
    {id:2,name:'Facebook Ad Creative Pack',category:'Facebook Marketing Assets',description:'Reusable campaign creative concepts and copy prompts for your next promotion.',price:15,symbol:'f'},
    {id:3,name:'X / Twitter Launch Planner',category:'X (Twitter) Resources',description:'A practical posting calendar with launch prompts and engagement ideas.',price:9,symbol:'𝕏'},
    {id:4,name:'Pinterest Pin Template Bundle',category:'Pinterest Templates',description:'Clean pin layouts and planning sheets for organizing visual content.',price:11,symbol:'P'},
    {id:5,name:'Digital Product Starter Guide',category:'E-books & Guides',description:'A beginner-friendly guide to planning and presenting a digital product.',price:8,symbol:'✦'},
    {id:6,name:'Small Business Brand Kit',category:'Design Templates',description:'A polished starter collection for keeping your brand visuals consistent.',price:18,symbol:'◇'}
  ];
  let category='All products', query='';
  let cart=[]; try { cart=JSON.parse(localStorage.getItem('muizmarket-demo-cart')||'[]'); } catch {}
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
  function render(){
    const list=products.filter(p=>(category==='All products'||p.category===category)&&`${p.name} ${p.category} ${p.description}`.toLowerCase().includes(query.toLowerCase()));
    $('#productGrid').innerHTML=list.length?list.map(p=>`<article class="product-card"><div class="product-top"><div class="product-symbol">${p.symbol}</div><span class="product-category">${esc(p.category)}</span></div><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p><div class="product-bottom"><div class="price">${money(p.price)} <small>USD</small></div><button class="add-btn" data-add="${p.id}">＋ Add to bag</button></div></article>`).join(''):'<div class="empty-state">No products found. Try another search or category.</div>';
    $('#productCountText').textContent=`${list.length} demo ${list.length===1?'product':'products'} in this preview`;
    const cats=['All products',...new Set(products.map(p=>p.category))];
    $('#categoryFilters').innerHTML=cats.map(c=>`<button class="filter-btn ${category===c?'active':''}" data-filter="${esc(c)}">${esc(c)}</button>`).join('');
    renderCart();
  }
  function renderCart(){
    const qty=cart.reduce((s,x)=>s+x.quantity,0); $('#cartCount').textContent=qty; $('#drawerCount').textContent=`(${qty})`;
    const lines=cart.map(x=>({...x,product:products.find(p=>p.id===x.id)})).filter(x=>x.product);
    $('#cartItems').innerHTML=lines.length?lines.map(x=>`<div class="cart-line"><div class="product-symbol">${x.product.symbol}</div><div class="cart-line-main"><b>${esc(x.product.name)}</b><small>${money(x.product.price)} each</small></div><div class="qty-control"><button data-qty="${x.id}" data-delta="-1">−</button><span>${x.quantity}</span><button data-qty="${x.id}" data-delta="1">+</button></div></div>`).join(''):'<div class="empty-state">Your bag is waiting for something good.</div>';
    $('#cartTotal').textContent=money(lines.reduce((s,x)=>s+x.product.price*x.quantity,0));
    $('#checkoutButton').disabled=true; $('#checkoutButton').style.opacity='.5';
    localStorage.setItem('muizmarket-demo-cart',JSON.stringify(cart));
  }
  function openCart(open){$('#cartDrawer').classList.toggle('open',open);$('#overlay').classList.toggle('open',open);$('#cartDrawer').setAttribute('aria-hidden',String(!open));}
  $('#year').textContent=new Date().getFullYear();
  $('#searchInput').addEventListener('input',e=>{query=e.target.value;render()});
  document.addEventListener('click',e=>{
    const add=e.target.closest('[data-add]'); if(add){const id=Number(add.dataset.add),line=cart.find(x=>x.id===id);if(line)line.quantity=Math.min(10,line.quantity+1);else cart.push({id,quantity:1});renderCart();return;}
    const filter=e.target.closest('[data-filter]');if(filter){category=filter.dataset.filter;render();return;}
    const platform=e.target.closest('.platform-category');if(platform){category=platform.dataset.category;render();$('#marketplace').scrollIntoView({behavior:'smooth'});return;}
    const qty=e.target.closest('[data-qty]');if(qty){const line=cart.find(x=>x.id===Number(qty.dataset.qty));if(line){line.quantity+=Number(qty.dataset.delta);if(line.quantity<1)cart=cart.filter(x=>x!==line);renderCart();}return;}
    if(e.target.closest('#cartOpen'))openCart(true);
    if(e.target.closest('#cartClose')||e.target.id==='overlay')openCart(false);
    if(e.target.closest('#authButton')||e.target.closest('#heroAccount')||e.target.closest('#ctaAccount'))alert('This GitHub Pages preview is for design testing. Sign-in and account features need the Node.js backend to be deployed separately.');
    if(e.target.closest('#checkoutButton'))alert('Checkout is disabled in this static preview. A secure backend and payment-provider configuration are required.');
    if(e.target.closest('#applySeller')||e.target.closest('#refreshSeller')||e.target.closest('#refreshOrders'))alert('Seller, account and order features require the Node.js backend. This preview lets you test the visual design and product browsing.');
    if(e.target.closest('#menuToggle')){const nav=document.querySelector('.desktop-nav');nav.style.display=nav.style.display==='flex'?'':'flex';nav.style.flexDirection='column';}
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape')openCart(false)});
  $('#productGrid').innerHTML=''; render();
  const seller=$('#sellerWorkspace'); if(seller)seller.innerHTML='<div class="seller-panel"><h3>Seller workspace preview</h3><p>Seller applications, listings, subscriptions and payouts require the live Node.js backend.</p></div>';
  const orders=$('#ordersList'); if(orders)orders.innerHTML='<div class="empty-state">Order history requires the live Node.js backend.</div>';
})();
