import { db, DEFAULT_SETTINGS } from "./firebase-config.js";
import {
  collection, onSnapshot, addDoc, serverTimestamp, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ---------- DEFAULT PLACEHOLDER ----------
const DEFAULT_PRODUCT_IMAGE = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><rect width='400' height='400' fill='#f3d7d9'/><text x='50%' y='50%' font-size='28' fill='#a8616f' text-anchor='middle' dy='.3em' font-family='serif'>Blume Arts</text></svg>`
);

/**
 * Universal Image Source Priority:
 * 1. product.imageUrl
 * 2. product.imageBase64
 * 3. product.imageURL / image_url / image
 * 4. DEFAULT_PRODUCT_IMAGE
 */
function getProductImage(product) {
  if (!product) return DEFAULT_PRODUCT_IMAGE;
  const url = product.imageUrl || product.imageBase64 || product.imageURL || product.image_url || product.image || "";
  return (typeof url === "string" && url.trim()) ? url.trim() : DEFAULT_PRODUCT_IMAGE;
}

// ---------- STATE ----------
let PRODUCTS = [];
let CATEGORIES = [];
let SETTINGS = { ...DEFAULT_SETTINGS };
let CART = JSON.parse(localStorage.getItem("blume_cart") || "[]");
let activeProduct = null;
let pdQty = 1;
let pdSelectedColor = null;
let currentStep = 1;
let checkoutMode = "cart"; // "cart" | "buyNow"
let buyNowItem = null;
let lastOrder = null;

const $ = (sel) => document.querySelector(sel);
const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

// ---------- TOAST ----------
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------- SETTINGS ----------
async function loadSettings() {
  try {
    const snap = await getDoc(doc(db, "settings", "business"));
    if (snap.exists()) SETTINGS = { ...SETTINGS, ...snap.data() };
  } catch (e) { console.warn("Using default settings:", e.message); }
  applySettingsToUI();
}
function applySettingsToUI() {
  $("#contactPhone").textContent = SETTINGS.phone;
  $("#contactEmail").textContent = SETTINGS.email;
  $("#contactInsta").textContent = SETTINGS.instagram;
  $("#footerPhone").textContent = SETTINGS.phone;
  $("#footerEmail").textContent = SETTINGS.email;
  $("#footerInsta").textContent = SETTINGS.instagram;
  $("#footerInsta").href = SETTINGS.instagramUrl;
  $("#footerText").textContent = SETTINGS.footerText || SETTINGS.description;
  $("#callBtn").href = "tel:" + SETTINGS.phone.replace(/\s/g, "");
  $("#emailBtn").href = "mailto:" + SETTINGS.email;
  $("#instaBtn").href = SETTINGS.instagramUrl;
  $("#waBtn").href = `https://wa.me/${SETTINGS.whatsapp}`;
}

// ---------- PRODUCTS ----------
function loadProducts() {
  onSnapshot(collection(db, "products"), (snap) => {
    PRODUCTS = [];
    snap.forEach((d) => PRODUCTS.push({ id: d.id, ...d.data() }));
    // Client-side sort by timestamp (supports docs with or without createdAt)
    PRODUCTS.sort((a, b) => {
      const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0);
      const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0);
      return tB - tA;
    });
    renderProducts();
  }, (err) => {
    console.warn("Product listener error:", err.message);
    $("#productGrid").innerHTML = `<div class="empty-state">Unable to load products.</div>`;
  });
}

function loadCategories() {
  onSnapshot(collection(db, "categories"), (snap) => {
    CATEGORIES = [];
    snap.forEach((d) => { if (d.data().hidden !== true) CATEGORIES.push({ id: d.id, ...d.data() }); });
    const sel = $("#categoryFilter");
    sel.innerHTML = `<option value="">All Categories</option>` +
      CATEGORIES.map(c => `<option value="${c.name}">${c.name}</option>`).join("");
  });
}

function getFilteredProducts() {
  let list = PRODUCTS.filter(p => p.available !== false);
  const search = $("#searchInput").value.trim().toLowerCase();
  const cat = $("#categoryFilter").value;
  const sort = $("#sortFilter").value;
  if (search) list = list.filter(p => (p.name || "").toLowerCase().includes(search));
  if (cat) list = list.filter(p => p.category === cat);
  if (sort === "price-asc") list.sort((a, b) => (a.price || 0) - (b.price || 0));
  else if (sort === "price-desc") list.sort((a, b) => (b.price || 0) - (a.price || 0));
  else if (sort === "featured") list = list.filter(p => p.featured);
  return list;
}

function renderProducts() {
  const grid = $("#productGrid");
  const list = getFilteredProducts();
  if (!list.length) {
    grid.innerHTML = `<div class="empty-state">No products found. Please check back soon ✿</div>`;
    return;
  }

  grid.innerHTML = list.map((p, i) => {
    const imageSource = getProductImage(p);
    return `
      <div class="product-card" style="animation-delay:${i * 0.05}s" data-id="${p.id}">
        <div class="product-img-wrap">
          <img src="${imageSource}" alt="${p.name}" loading="lazy">
          ${p.featured ? '<span class="product-badge">Featured</span>' : ""}
        </div>
        <div class="product-info">
          <h3>${p.name}</h3>
          <div class="desc">${(p.description || "").slice(0, 60)}</div>
          <div class="price-row">
            <span class="price">${money(p.price)}</span>
            <span class="stock-tag ${p.stock === 0 ? "out" : ""}">${p.stock === 0 ? "Out of Stock" : "In Stock"}</span>
          </div>
          <div class="card-actions">
            <button class="btn btn-outline add-cart" data-id="${p.id}">Add to Cart</button>
            <button class="btn btn-primary buy-now" data-id="${p.id}">Buy Now</button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  grid.querySelectorAll(".product-img-wrap, h3").forEach(el => {
    el.closest(".product-card").addEventListener("click", (e) => {
      if (e.target.closest(".card-actions")) return;
      openProductModal(el.closest(".product-card").dataset.id);
    });
  });

  grid.querySelectorAll(".add-cart").forEach(btn => btn.addEventListener("click", (e) => {
    e.stopPropagation();
    quickAddToCart(btn.dataset.id);
  }));

  grid.querySelectorAll(".buy-now").forEach(btn => btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const p = PRODUCTS.find(x => x.id === btn.dataset.id);
    buyNowItem = { ...p, qty: 1, color: (p.colors || [])[0] || null };
    startCheckout("buyNow");
  }));
}

// ---------- PRODUCT MODAL ----------
function openProductModal(id) {
  activeProduct = PRODUCTS.find(p => p.id === id);
  if (!activeProduct) return;
  pdQty = 1;
  pdSelectedColor = (activeProduct.colors || [])[0] || null;

  const imageSource = getProductImage(activeProduct);
  $("#pdImage").src = imageSource;
  $("#pdName").textContent = activeProduct.name;
  $("#pdPrice").textContent = money(activeProduct.price);
  $("#pdDesc").textContent = activeProduct.description || "";
  $("#pdQty").textContent = pdQty;

  renderPdOptions();
  updatePdTotal();
  $("#productOverlay").classList.add("open");
}

function renderPdOptions() {
  let html = "";
  if (activeProduct.colors && activeProduct.colors.length) {
    html += `<div class="option-group"><label>Available Colors</label><div class="chip-row" id="colorChips">`;
    html += activeProduct.colors.map(c => `<button class="chip ${c === pdSelectedColor ? "selected" : ""}" data-color="${c}">${c}</button>`).join("");
    html += `</div></div>`;
  }
  if (activeProduct.customFields) {
    Object.entries(activeProduct.customFields).forEach(([k, v]) => {
      html += `<div class="option-group"><label>${k}</label><div class="chip-row"><span class="chip selected" style="cursor:default">${v}</span></div></div>`;
    });
  }
  $("#pdOptions").innerHTML = html;
  document.querySelectorAll("#colorChips .chip").forEach(chip => chip.addEventListener("click", () => {
    pdSelectedColor = chip.dataset.color;
    renderPdOptions();
  }));
}
function updatePdTotal() { $("#pdTotal").textContent = money(activeProduct.price * pdQty); }

$("#closeProduct").addEventListener("click", () => $("#productOverlay").classList.remove("open"));
$("#productOverlay").addEventListener("click", (e) => { if (e.target.id === "productOverlay") e.currentTarget.classList.remove("open"); });
$("#pdMinus").addEventListener("click", () => { if (pdQty > 1) pdQty--; $("#pdQty").textContent = pdQty; updatePdTotal(); });
$("#pdPlus").addEventListener("click", () => { pdQty++; $("#pdQty").textContent = pdQty; updatePdTotal(); });
$("#pdAddCart").addEventListener("click", () => {
  addToCart(activeProduct, pdQty, pdSelectedColor);
  $("#productOverlay").classList.remove("open");
  toast("Added to cart ✿");
});
$("#pdBuyNow").addEventListener("click", () => {
  buyNowItem = { ...activeProduct, qty: pdQty, color: pdSelectedColor };
  $("#productOverlay").classList.remove("open");
  startCheckout("buyNow");
});

// ---------- CART ----------
function saveCart() { localStorage.setItem("blume_cart", JSON.stringify(CART)); renderCartBadge(); }

function addToCart(product, qty, color) {
  const key = product.id + "|" + (color || "");
  const existing = CART.find(i => i.key === key);
  const imageSource = getProductImage(product);

  if (existing) existing.qty += qty;
  else CART.push({ key, id: product.id, name: product.name, price: product.price, imageUrl: imageSource, imageBase64: imageSource, color, qty });
  saveCart();
  renderCart();
}

function quickAddToCart(id) {
  const p = PRODUCTS.find(x => x.id === id);
  addToCart(p, 1, (p.colors || [])[0] || null);
  toast("Added to cart ✿");
}

function renderCartBadge() {
  const count = CART.reduce((s, i) => s + i.qty, 0);
  const badge = $("#cartBadge");
  badge.textContent = count;
  badge.style.display = count ? "flex" : "none";
}

function cartTotal() { return CART.reduce((s, i) => s + i.price * i.qty, 0); }

function renderCart() {
  const wrap = $("#cartItems");
  if (!CART.length) {
    wrap.innerHTML = `<div class="cart-empty">Your cart is empty ✿<br>Start adding some handmade love!</div>`;
    $("#cartFooter").style.display = "none";
    return;
  }

  wrap.innerHTML = CART.map(item => {
    const imageSource = getProductImage(item);
    return `
      <div class="cart-item" data-key="${item.key}">
        <img src="${imageSource}" alt="${item.name}">
        <div class="cart-item-info">
          <h4>${item.name}</h4>
          <div class="meta">${item.color ? item.color + " · " : ""}${money(item.price)}</div>
          <div class="cart-item-controls">
            <div class="qty-control">
              <button class="dec">−</button><span>${item.qty}</span><button class="inc">+</button>
            </div>
            <a class="remove">Remove</a>
          </div>
        </div>
      </div>
    `;
  }).join("");

  $("#cartFooter").style.display = "block";
  $("#cartSubtotal").textContent = money(cartTotal());
  $("#cartTotal").textContent = money(cartTotal());

  wrap.querySelectorAll(".cart-item").forEach(el => {
    const key = el.dataset.key;
    el.querySelector(".inc").addEventListener("click", () => { changeQty(key, 1); });
    el.querySelector(".dec").addEventListener("click", () => { changeQty(key, -1); });
    el.querySelector(".remove").addEventListener("click", () => { CART = CART.filter(i => i.key !== key); saveCart(); renderCart(); });
  });
}

function changeQty(key, delta) {
  const item = CART.find(i => i.key === key);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) CART = CART.filter(i => i.key !== key);
  saveCart(); renderCart();
}

$("#cartToggle").addEventListener("click", () => { $("#cartDrawer").classList.add("open"); $("#drawerOverlay").classList.add("open"); });
$("#closeCart").addEventListener("click", closeDrawer);
$("#drawerOverlay").addEventListener("click", closeDrawer);
function closeDrawer() { $("#cartDrawer").classList.remove("open"); $("#drawerOverlay").classList.remove("open"); }

// ---------- SEARCH & FILTERS ----------
$("#searchToggle").addEventListener("click", () => {
  document.getElementById("shop").scrollIntoView({ behavior: "smooth" });
  setTimeout(() => $("#searchInput").focus(), 400);
});
$("#searchInput").addEventListener("input", renderProducts);
$("#categoryFilter").addEventListener("change", renderProducts);
$("#sortFilter").addEventListener("change", renderProducts);

// ---------- MOBILE MENU ----------
$("#hamburger").addEventListener("click", () => $("#mobileMenu").classList.toggle("open"));
document.querySelectorAll("#mobileMenu a").forEach(a => a.addEventListener("click", () => $("#mobileMenu").classList.remove("open")));

// ---------- CHECKOUT ----------
function getCheckoutItems() {
  if (checkoutMode === "buyNow" && buyNowItem) {
    return [{ name: buyNowItem.name, price: buyNowItem.price, qty: buyNowItem.qty, color: buyNowItem.color }];
  }
  return CART.map(i => ({ name: i.name, price: i.price, qty: i.qty, color: i.color }));
}
function getCheckoutTotal() { return getCheckoutItems().reduce((s, i) => s + i.price * i.qty, 0); }

function startCheckout(mode) {
  checkoutMode = mode;
  if (mode === "cart" && !CART.length) { toast("Your cart is empty"); return; }
  currentStep = 1;
  showStep(1);
  renderOrderLines();
  closeDrawer();
  $("#checkoutOverlay").classList.add("open");
}
$("#checkoutBtn").addEventListener("click", () => startCheckout("cart"));
$("#closeCheckout").addEventListener("click", () => $("#checkoutOverlay").classList.remove("open"));

function renderOrderLines() {
  const items = getCheckoutItems();
  $("#checkoutOrderLines").innerHTML = items.map(i => `
    <div class="order-line"><span>${i.name} ${i.color ? "(" + i.color + ")" : ""} × ${i.qty}</span><span>${money(i.price * i.qty)}</span></div>
  `).join("") + `<div class="order-line" style="font-weight:700;color:var(--rose-deep)"><span>Total</span><span>${money(getCheckoutTotal())}</span></div>`;
}

function showStep(n) {
  currentStep = n;
  document.querySelectorAll(".step-dot").forEach(d => {
    const s = Number(d.dataset.step);
    d.classList.toggle("active", s === n);
    d.classList.toggle("done", s < n);
  });
  document.querySelectorAll(".checkout-step").forEach(s => s.classList.toggle("active", Number(s.dataset.step) === n));
  $("#backStep").style.visibility = n === 1 ? "hidden" : "visible";
  $("#nextStep").textContent = n === 5 ? "Confirm Order on WhatsApp" : "Continue";
  if (n === 5) renderFinalSummary();
}

function validateStep(n) {
  if (n === 2) {
    const name = $("#custName").value.trim(), mobile = $("#custMobile").value.trim(), wa = $("#custWhatsapp").value.trim();
    if (!name || !mobile || !wa) { toast("Please fill all required fields"); return false; }
  }
  if (n === 3) {
    const req = ["addrHouse", "addrStreet", "addrArea", "addrCity", "addrDistrict", "addrState", "addrPincode"];
    for (const id of req) if (!$("#" + id).value.trim()) { toast("Please complete the delivery address"); return false; }
  }
  return true;
}

$("#nextStep").addEventListener("click", () => {
  if (!validateStep(currentStep)) return;
  if (currentStep === 5) { submitOrder(); return; }
  showStep(currentStep + 1);
});
$("#backStep").addEventListener("click", () => { if (currentStep > 1) showStep(currentStep - 1); });

function renderFinalSummary() {
  const items = getCheckoutItems();
  const addr = fullAddress();
  $("#finalSummary").innerHTML = `
    <div class="summary-block"><h4>Customer</h4>
      <p>${$("#custName").value}<br>${$("#custMobile").value} ${$("#custEmail").value ? "· " + $("#custEmail").value : ""}</p></div>
    <div class="summary-block"><h4>Delivery Address</h4><p>${addr.replace(/\n/g, "<br>")}</p></div>
    <div class="summary-block"><h4>Order Items</h4>
      ${items.map(i => `<div class="order-line"><span>${i.name} ${i.color ? "(" + i.color + ")" : ""} × ${i.qty}</span><span>${money(i.price * i.qty)}</span></div>`).join("")}
      <div class="order-line" style="font-weight:700;color:var(--rose-deep)"><span>Total</span><span>${money(getCheckoutTotal())}</span></div>
    </div>
    ${$("#specialNotes").value.trim() ? `<div class="summary-block"><h4>Special Instructions</h4><p>${$("#specialNotes").value}</p></div>` : ""}
  `;
}
function fullAddress() {
  return [
    "House No: " + $("#addrHouse").value,
    "Street: " + $("#addrStreet").value,
    "Area: " + $("#addrArea").value,
    "City: " + $("#addrCity").value,
    "District: " + $("#addrDistrict").value,
    "State: " + $("#addrState").value,
    "Pincode: " + $("#addrPincode").value,
  ].join("\n");
}

async function generateOrderId() {
  const n = Date.now().toString().slice(-6);
  return "BA-" + n;
}

function buildWhatsappMessage(orderId, items, total) {
  let msg = `━━━━━━━━━━━━━━━━━━\n🌸 ${SETTINGS.businessName.toUpperCase()}\nNEW ORDER\n━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `Order ID: ${orderId}\n\n🛍️ ORDER DETAILS\n\n`;
  items.forEach((i, idx) => {
    msg += `${idx + 1}. ${i.name}${i.color ? " (" + i.color + ")" : ""}\nQuantity: ${i.qty}\nPrice: ${money(i.price)}\nSubtotal: ${money(i.price * i.qty)}\n\n`;
  });
  msg += `━━━━━━━━━━━━━━━━━━\n\n💰 TOTAL: ${money(total)}\n\n👤 CUSTOMER DETAILS\n\n`;
  msg += `Name: ${$("#custName").value}\nMobile: ${$("#custMobile").value}\nWhatsApp: ${$("#custWhatsapp").value}\n\n📍 DELIVERY ADDRESS\n\n${fullAddress()}\n\n`;
  msg += `📝 SPECIAL INSTRUCTIONS\n\n${$("#specialNotes").value.trim() || "None"}\n\n`;
  msg += `━━━━━━━━━━━━━━━━━━\nThank you for choosing\n${SETTINGS.businessName.toUpperCase()} ❤️\n━━━━━━━━━━━━━━━━━━`;
  return msg;
}

async function submitOrder() {
  const items = getCheckoutItems();
  const total = getCheckoutTotal();
  const orderId = await generateOrderId();
  const orderData = {
    orderId,
    customerName: $("#custName").value,
    mobile: $("#custMobile").value,
    whatsapp: $("#custWhatsapp").value,
    email: $("#custEmail").value || "",
    address: {
      house: $("#addrHouse").value, street: $("#addrStreet").value, area: $("#addrArea").value,
      city: $("#addrCity").value, district: $("#addrDistrict").value, state: $("#addrState").value, pincode: $("#addrPincode").value,
    },
    products: items,
    subtotal: total,
    total,
    status: "Pending",
    notes: $("#specialNotes").value || "",
    createdAt: serverTimestamp(),
  };

  try {
    await addDoc(collection(db, "orders"), orderData);
  } catch (e) {
    console.warn("Order not saved to Firestore:", e.message);
  }

  const waMessage = buildWhatsappMessage(orderId, items, total);
  const waUrl = `https://wa.me/${SETTINGS.whatsapp}?text=${encodeURIComponent(waMessage)}`;
  lastOrder = { orderId, waUrl };

  if (checkoutMode === "cart") { CART = []; saveCart(); renderCart(); }
  buyNowItem = null;

  $("#checkoutOverlay").classList.remove("open");
  $("#confirmOrderId").textContent = orderId;
  $("#confirmOverlay").classList.add("open");
  window.open(waUrl, "_blank");
}

$("#openWhatsappBtn").addEventListener("click", () => { if (lastOrder) window.open(lastOrder.waUrl, "_blank"); });
$("#continueShoppingBtn").addEventListener("click", () => {
  $("#confirmOverlay").classList.remove("open");
  document.getElementById("shop").scrollIntoView({ behavior: "smooth" });
});

// ---------- INIT ----------
renderCartBadge();
renderCart();
loadSettings();
loadCategories();
loadProducts();
