import { db, auth, DEFAULT_SETTINGS, firebaseConfig } from "./firebase-config.js";
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  signInWithEmailAndPassword, onAuthStateChanged, signOut,
  sendPasswordResetEmail, updatePassword, createUserWithEmailAndPassword,
  signOut as secondarySignOut, getAuth
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, setDoc, getDoc,
  getDocs, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const $ = (s) => document.querySelector(s);
let PRODUCTS = [], CATEGORIES = [], ORDERS = [], ADMIN_USERS = [];
let editingProductId = null;
let editingCategoryId = null;
let uploadedImageBase64 = "";

let currentUserProfile = null; // { uid, name, email, role, status }
let editingAdminUid = null;
let removingAdminUid = null;
let changingPwAdminUid = null;
let adminUsersUnsubscribe = null;

// ============================================================
// 1. AUTHENTICATION & LOGIN FLOW
// ============================================================

$("#loginBtn").addEventListener("click", async () => {
  const email = $("#loginEmail").value.trim();
  const pw = $("#loginPassword").value;
  $("#loginError").style.display = "none";
  if (!email || !pw) {
    showLoginError("Please enter both email and password.");
    return;
  }
  try {
    await signInWithEmailAndPassword(auth, email, pw);
  } catch (e) {
    showLoginError("Invalid email or password.");
  }
});

$("#logoutBtn").addEventListener("click", () => {
  if (adminUsersUnsubscribe) {
    adminUsersUnsubscribe();
    adminUsersUnsubscribe = null;
  }
  signOut(auth);
});

function showLoginError(msg) {
  $("#loginError").textContent = msg;
  $("#loginError").style.display = "block";
}

// Forgot Password Flow
$("#forgotPasswordBtn").addEventListener("click", (e) => {
  e.preventDefault();
  $("#forgotEmailInput").value = $("#loginEmail").value.trim();
  $("#forgotError").style.display = "none";
  $("#forgotSuccess").style.display = "none";
  $("#forgotPasswordModalOverlay").classList.add("open");
});

$("#cancelForgotBtn").addEventListener("click", () => {
  $("#forgotPasswordModalOverlay").classList.remove("open");
});

$("#sendResetEmailBtn").addEventListener("click", async () => {
  const email = $("#forgotEmailInput").value.trim();
  $("#forgotError").style.display = "none";
  $("#forgotSuccess").style.display = "none";

  if (!email || !email.includes("@")) {
    $("#forgotError").textContent = "Please enter a valid email address.";
    $("#forgotError").style.display = "block";
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    $("#forgotSuccess").textContent = "Password reset email sent. Please check your inbox.";
    $("#forgotSuccess").style.display = "block";
  } catch (e) {
    $("#forgotError").textContent = e.message || "Failed to send password reset email.";
    $("#forgotError").style.display = "block";
  }
});

// Auth state observer & Profile validation
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      const userRef = doc(db, "adminUsers", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        const allAdminsSnap = await getDocs(collection(db, "adminUsers"));
        const primaryEmail = (DEFAULT_SETTINGS.email || "sumithasenthil777@gmail.com").toLowerCase();

        if (allAdminsSnap.empty || (user.email && user.email.toLowerCase() === primaryEmail)) {
          const initialProfile = {
            uid: user.uid,
            name: user.displayName || "Primary Admin",
            email: user.email,
            role: "Primary Admin",
            status: "active",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastLoginAt: serverTimestamp()
          };
          await setDoc(userRef, initialProfile);
          currentUserProfile = initialProfile;
        } else {
          showLoginError("You do not have admin access.");
          signOut(auth);
          return;
        }
      } else {
        currentUserProfile = userSnap.data();
      }

      if (currentUserProfile.status === "disabled") {
        showLoginError("Your admin access has been disabled. Please contact the Primary Admin.");
        signOut(auth);
        return;
      }

      await updateDoc(userRef, {
        lastLoginAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      $("#sidebarUserName").textContent = currentUserProfile.name || user.email;
      $("#sidebarUserRole").textContent = currentUserProfile.role || "Admin";

      applyRolePermissions(currentUserProfile.role);

      $("#loginWrap").style.display = "none";
      $("#adminLayout").classList.add("active");
      initData();
    } catch (err) {
      console.error("Error authenticating admin:", err);
      showLoginError("Access denied: " + err.message);
      signOut(auth);
    }
  } else {
    currentUserProfile = null;
    $("#loginWrap").style.display = "flex";
    $("#adminLayout").classList.remove("active");
  }
});

// ============================================================
// 2. ROLE-BASED ACCESS CONTROL (RBAC)
// ============================================================

function applyRolePermissions(role) {
  const navDashboard = $("#navDashboard");
  const navProducts = $("#navProducts");
  const navCategories = $("#navCategories");
  const navOrders = $("#navOrders");
  const navSettings = $("#navSettings");
  const navAccess = $("#navAccess");

  [navDashboard, navProducts, navCategories, navOrders, navSettings, navAccess].forEach(el => {
    if (el) el.classList.remove("hidden");
  });

  if ($("#addProductBtn")) $("#addProductBtn").style.display = "inline-block";
  if ($("#addCategoryBtn")) $("#addCategoryBtn").style.display = "inline-block";
  if ($("#saveSettingsBtn")) $("#saveSettingsBtn").style.display = "inline-block";

  if (role === "Primary Admin") {
    // Full Access
  } else if (role === "Admin") {
    if (navSettings) navSettings.classList.add("hidden");
    if (navAccess) navAccess.classList.add("hidden");

    const currentTab = $(".tab-link.active")?.dataset.tab;
    if (currentTab === "settings" || currentTab === "access") {
      switchTab("dashboard");
    }
  } else if (role === "Manager") {
    if (navCategories) navCategories.classList.add("hidden");
    if (navSettings) navSettings.classList.add("hidden");
    if (navAccess) navAccess.classList.add("hidden");

    if ($("#addProductBtn")) $("#addProductBtn").style.display = "none";

    const currentTab = $(".tab-link.active")?.dataset.tab;
    if (currentTab === "settings" || currentTab === "access" || currentTab === "categories") {
      switchTab("dashboard");
    }
  }
}

function switchTab(tabName) {
  document.querySelectorAll(".tab-link").forEach(l => l.classList.remove("active"));
  document.querySelectorAll(".tab-view").forEach(v => v.classList.remove("active"));
  const link = $(`[data-tab="${tabName}"]`);
  const view = $(`#tab-${tabName}`);
  if (link) link.classList.add("active");
  if (view) view.classList.add("active");
}

document.querySelectorAll(".tab-link").forEach(link => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const tab = link.dataset.tab;
    if (currentUserProfile.role !== "Primary Admin") {
      if (tab === "access" || tab === "settings") return;
      if (currentUserProfile.role === "Manager" && tab === "categories") return;
    }
    switchTab(tab);
  });
});

// ============================================================
// 3. DATA INITIALIZATION & REAL-TIME LISTENERS
// ============================================================

function initData() {
  onSnapshot(collection(db, "products"), (snap) => {
    PRODUCTS = []; snap.forEach(d => PRODUCTS.push({ id: d.id, ...d.data() }));
    PRODUCTS.sort((a, b) => {
      const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0);
      const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0);
      return tB - tA;
    });
    renderProductsTable(); renderDashboard(); populateCategorySelect();
  });

  onSnapshot(collection(db, "categories"), (snap) => {
    CATEGORIES = []; snap.forEach(d => CATEGORIES.push({ id: d.id, ...d.data() }));
    renderCategoriesTable(); populateCategorySelect();
  });

  onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc")), (snap) => {
    ORDERS = []; snap.forEach(d => ORDERS.push({ id: d.id, ...d.data() }));
    renderOrdersTable(); renderDashboard();
  });

  if (currentUserProfile && currentUserProfile.role === "Primary Admin") {
    if (adminUsersUnsubscribe) adminUsersUnsubscribe();
    adminUsersUnsubscribe = onSnapshot(collection(db, "adminUsers"), (snap) => {
      ADMIN_USERS = [];
      snap.forEach(d => ADMIN_USERS.push({ uid: d.id, ...d.data() }));
      renderAdminUsersTable();
      renderAdminStats();
    });
  }

  loadSettingsForm();
}

// ============================================================
// 4. DASHBOARD
// ============================================================

function renderDashboard() {
  $("#statTotalProducts").textContent = PRODUCTS.length;
  $("#statActiveProducts").textContent = PRODUCTS.filter(p => p.available !== false).length;
  $("#statOutOfStock").textContent = PRODUCTS.filter(p => Number(p.stock) === 0).length;
  $("#statTotalOrders").textContent = ORDERS.length;
  $("#statPendingOrders").textContent = ORDERS.filter(o => o.status === "Pending").length;
  $("#statCompletedOrders").textContent = ORDERS.filter(o => o.status === "Delivered").length;
  const sales = ORDERS.filter(o => o.status !== "Cancelled").reduce((s, o) => s + (o.total || 0), 0);
  $("#statTotalSales").textContent = "₹" + sales.toLocaleString("en-IN");
}

// ============================================================
// 5. PRODUCTS MANAGEMENT (IMAGE COMPRESSION & UNIFIED imageUrl)
// ============================================================

function getAdminProductImageSrc(p) {
  if (!p) return "";
  return p.imageUrl || p.imageBase64 || p.imageURL || p.image_url || p.image || "";
}

/**
 * Resizes and compresses an image file before storing in Firestore.
 * Maximum dimensions: 800x800px.
 * Format: WebP (or JPEG fallback). Quality ~0.75.
 */
function compressAndConvertToBase64(file) {
  return new Promise((resolve, reject) => {
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!file || !validTypes.includes(file.type.toLowerCase())) {
      return reject(new Error("Unable to process this image. Please select a valid JPG, JPEG, PNG, or WEBP file."));
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to process this image. Please try another image."));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Unable to process this image. Please try another image."));
      img.onload = () => {
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        let dataUrl = canvas.toDataURL("image/webp", 0.75);
        if (!dataUrl.startsWith("data:image/webp")) {
          dataUrl = canvas.toDataURL("image/jpeg", 0.75);
        }

        // Safety check for Firestore 1 MiB document limit (~850KB max)
        if (dataUrl.length > 850000) {
          dataUrl = canvas.toDataURL("image/jpeg", 0.5);
          if (dataUrl.length > 850000) {
            return reject(new Error("Image is too large. Please select a smaller image or lower-resolution image."));
          }
        }

        resolve(dataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function populateCategorySelect() {
  $("#fCategory").innerHTML = CATEGORIES.map(c => `<option value="${c.name}">${c.name}</option>`).join("");
}

function renderProductsTable() {
  const isManager = currentUserProfile?.role === "Manager";
  $("#productsTbody").innerHTML = PRODUCTS.map(p => `
    <tr>
      <td><img src="${getAdminProductImageSrc(p)}" onerror="this.style.visibility='hidden'"></td>
      <td>${p.name}</td>
      <td>${p.category || "—"}</td>
      <td>₹${p.price}</td>
      <td>${p.stock ?? "—"}</td>
      <td><span class="pill ${p.available !== false ? "yes" : "no"} ${!isManager ? 'toggle-visible' : ''}" data-id="${p.id}" style="${!isManager ? 'cursor:pointer' : ''}">${p.available !== false ? "Visible" : "Hidden"}</span></td>
      <td><span class="pill ${p.featured ? "yes" : "no"} ${!isManager ? 'toggle-featured' : ''}" data-id="${p.id}" style="${!isManager ? 'cursor:pointer' : ''}">${p.featured ? "Yes" : "No"}</span></td>
      <td class="row-actions">
        ${!isManager ? `<span class="icon-action edit-product" data-id="${p.id}" title="Edit">✏️</span>` : ''}
        ${currentUserProfile?.role !== "Manager" ? `<span class="icon-action delete-product" data-id="${p.id}" title="Delete">🗑️</span>` : ''}
        ${isManager ? `<span style="opacity:.5; font-size:.78rem">View Only</span>` : ''}
      </td>
    </tr>
  `).join("") || `<tr><td colspan="8" style="text-align:center;opacity:.6;padding:30px">No products yet. Click "Add Product" to get started.</td></tr>`;

  if (!isManager) {
    document.querySelectorAll(".toggle-visible").forEach(el => el.addEventListener("click", () => {
      const p = PRODUCTS.find(x => x.id === el.dataset.id);
      updateDoc(doc(db, "products", p.id), { available: !(p.available !== false), updatedAt: serverTimestamp() });
    }));
    document.querySelectorAll(".toggle-featured").forEach(el => el.addEventListener("click", () => {
      const p = PRODUCTS.find(x => x.id === el.dataset.id);
      updateDoc(doc(db, "products", p.id), { featured: !p.featured, updatedAt: serverTimestamp() });
    }));
    document.querySelectorAll(".edit-product").forEach(el => el.addEventListener("click", () => openProductModal(el.dataset.id)));
    document.querySelectorAll(".delete-product").forEach(el => el.addEventListener("click", () => {
      if (confirm("Delete this product permanently?")) deleteDoc(doc(db, "products", el.dataset.id));
    }));
  }
}

function openProductModal(id) {
  if (currentUserProfile?.role === "Manager") return;
  editingProductId = id || null;
  uploadedImageBase64 = "";
  $("#customFieldsWrap").innerHTML = "";
  $("#fImageFile").value = "";

  if (id) {
    const p = PRODUCTS.find(x => x.id === id);
    $("#productModalTitle").textContent = "Edit Product";
    $("#fName").value = p.name || "";
    $("#fPrice").value = p.price || "";
    $("#fStock").value = p.stock ?? 10;
    $("#fCategory").value = p.category || "";
    $("#fColors").value = (p.colors || []).join(", ");
    $("#fDescription").value = p.description || "";
    $("#fAvailable").value = String(p.available !== false);
    $("#fFeatured").value = String(!!p.featured);
    uploadedImageBase64 = getAdminProductImageSrc(p);

    if (uploadedImageBase64) {
      $("#fImagePreview").src = uploadedImageBase64;
      $("#fImagePreview").style.display = "block";
    } else {
      $("#fImagePreview").style.display = "none";
    }
    Object.entries(p.customFields || {}).forEach(([k, v]) => addCustomFieldRow(k, v));
  } else {
    $("#productModalTitle").textContent = "Add Product";
    ["fName", "fPrice", "fColors", "fDescription"].forEach(id => $("#" + id).value = "");
    $("#fStock").value = 10;
    $("#fAvailable").value = "true";
    $("#fFeatured").value = "false";
    $("#fImagePreview").style.display = "none";
  }
  $("#productModalOverlay").classList.add("open");
}

$("#addProductBtn").addEventListener("click", () => openProductModal(null));
$("#cancelProductBtn").addEventListener("click", () => $("#productModalOverlay").classList.remove("open"));

function addCustomFieldRow(key = "", value = "") {
  const row = document.createElement("div");
  row.className = "custom-field-row";
  row.innerHTML = `<input placeholder="Field name" class="cf-key" value="${key}"><input placeholder="Value" class="cf-val" value="${value}"><span class="icon-action remove-cf">✕</span>`;
  row.querySelector(".remove-cf").addEventListener("click", () => row.remove());
  $("#customFieldsWrap").appendChild(row);
}
$("#addCustomFieldBtn").addEventListener("click", () => addCustomFieldRow());

// Handle image selection, client-side compression & Base64 conversion
$("#fImageFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const base64Data = await compressAndConvertToBase64(file);
    uploadedImageBase64 = base64Data;
    $("#fImagePreview").src = base64Data;
    $("#fImagePreview").style.display = "block";
  } catch (err) {
    alert(err.message || "Unable to process this image. Please try another image.");
    $("#fImageFile").value = "";
  }
});

// Save Product to Firestore
$("#saveProductBtn").addEventListener("click", async () => {
  if (currentUserProfile?.role === "Manager") return;
  const name = $("#fName").value.trim();
  const price = Number($("#fPrice").value);
  if (!name || !price) {
    alert("Product name and price are required.");
    return;
  }

  const customFields = {};
  document.querySelectorAll(".custom-field-row").forEach(row => {
    const k = row.querySelector(".cf-key").value.trim();
    const v = row.querySelector(".cf-val").value.trim();
    if (k) customFields[k] = v;
  });

  const existingProduct = editingProductId ? PRODUCTS.find(x => x.id === editingProductId) : null;

  // Store uploaded image URL consistently in imageUrl (and imageBase64 for backwards compat)
  const finalImageUrl = uploadedImageBase64 || getAdminProductImageSrc(existingProduct);

  const data = {
    name,
    price,
    stock: Number($("#fStock").value) || 0,
    category: $("#fCategory").value || "",
    colors: $("#fColors").value.split(",").map(s => s.trim()).filter(Boolean),
    description: $("#fDescription").value.trim(),
    imageUrl: finalImageUrl,
    imageBase64: finalImageUrl,
    available: $("#fAvailable").value === "true",
    featured: $("#fFeatured").value === "true",
    customFields,
    updatedAt: serverTimestamp(),
  };

  if (!editingProductId || !existingProduct?.createdAt) {
    data.createdAt = existingProduct?.createdAt || serverTimestamp();
  }

  // Firestore Document Size Validation (Safe limit: 900 KB)
  const approxSize = new Blob([JSON.stringify(data)]).size;
  if (approxSize > 900000) {
    alert("Please select a smaller image or lower-resolution image.");
    return;
  }

  try {
    if (editingProductId) {
      await updateDoc(doc(db, "products", editingProductId), data);
    } else {
      await addDoc(collection(db, "products"), data);
    }
    alert("Product saved successfully.");
    $("#productModalOverlay").classList.remove("open");
  } catch (err) {
    alert("Product could not be saved. Please check your connection and try again.");
    console.error("Firestore save error:", err);
  }
});

// ============================================================
// 6. CATEGORIES MANAGEMENT
// ============================================================

function renderCategoriesTable() {
  $("#categoriesTbody").innerHTML = CATEGORIES.map(c => `
    <tr>
      <td>${c.name}</td>
      <td><span class="pill ${!c.hidden ? "yes" : "no"} toggle-cat" data-id="${c.id}" style="cursor:pointer">${!c.hidden ? "Visible" : "Hidden"}</span></td>
      <td class="row-actions">
        <span class="icon-action edit-cat" data-id="${c.id}">✏️</span>
        <span class="icon-action delete-cat" data-id="${c.id}">🗑️</span>
      </td>
    </tr>
  `).join("") || `<tr><td colspan="3" style="text-align:center;opacity:.6;padding:30px">No categories yet.</td></tr>`;

  document.querySelectorAll(".toggle-cat").forEach(el => el.addEventListener("click", () => {
    const c = CATEGORIES.find(x => x.id === el.dataset.id);
    updateDoc(doc(db, "categories", c.id), { hidden: !c.hidden });
  }));
  document.querySelectorAll(".edit-cat").forEach(el => el.addEventListener("click", () => openCategoryModal(el.dataset.id)));
  document.querySelectorAll(".delete-cat").forEach(el => el.addEventListener("click", () => {
    if (confirm("Delete this category?")) deleteDoc(doc(db, "categories", el.dataset.id));
  }));
}
function openCategoryModal(id) {
  editingCategoryId = id || null;
  const c = id ? CATEGORIES.find(x => x.id === id) : null;
  $("#categoryModalTitle").textContent = id ? "Edit Category" : "Add Category";
  $("#cName").value = c ? c.name : "";
  $("#categoryModalOverlay").classList.add("open");
}
$("#addCategoryBtn").addEventListener("click", () => openCategoryModal(null));
$("#cancelCategoryBtn").addEventListener("click", () => $("#categoryModalOverlay").classList.remove("open"));
$("#saveCategoryBtn").addEventListener("click", async () => {
  const name = $("#cName").value.trim();
  if (!name) { alert("Category name is required."); return; }
  if (editingCategoryId) await updateDoc(doc(db, "categories", editingCategoryId), { name });
  else await addDoc(collection(db, "categories"), { name, hidden: false });
  $("#categoryModalOverlay").classList.remove("open");
});

// ============================================================
// 7. ORDERS MANAGEMENT
// ============================================================

const STATUSES = ["Pending", "Confirmed", "Processing", "Ready", "Delivered", "Cancelled"];
function renderOrdersTable() {
  $("#ordersTbody").innerHTML = ORDERS.map(o => `
    <tr>
      <td>${o.orderId}</td>
      <td>${o.customerName}</td>
      <td>${o.mobile}</td>
      <td>₹${(o.total || 0).toLocaleString("en-IN")}</td>
      <td>${o.createdAt?.toDate ? o.createdAt.toDate().toLocaleDateString() : "—"}</td>
      <td><select class="status-select" data-id="${o.id}">${STATUSES.map(s => `<option ${s === o.status ? "selected" : ""}>${s}</option>`).join("")}</select></td>
      <td><span class="icon-action view-order" data-id="${o.id}">👁️</span></td>
    </tr>
  `).join("") || `<tr><td colspan="7" style="text-align:center;opacity:.6;padding:30px">No orders yet.</td></tr>`;

  document.querySelectorAll(".status-select").forEach(sel => sel.addEventListener("change", () => {
    updateDoc(doc(db, "orders", sel.dataset.id), { status: sel.value });
  }));
  document.querySelectorAll(".view-order").forEach(el => el.addEventListener("click", () => openOrderModal(el.dataset.id)));
}
function openOrderModal(id) {
  const o = ORDERS.find(x => x.id === id);
  const addr = o.address || {};
  $("#orderModalBody").innerHTML = `
    <h3>Order ${o.orderId}</h3>
    <p style="margin-bottom:14px;opacity:.7;font-size:.85rem">${o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString() : ""}</p>
    <div class="form-group"><label>Customer</label><p>${o.customerName} · ${o.mobile}${o.whatsapp ? " · WA: " + o.whatsapp : ""}${o.email ? " · " + o.email : ""}</p></div>
    <div class="form-group"><label>Delivery Address</label><p>${addr.house || ""}, ${addr.street || ""}, ${addr.area || ""}, ${addr.city || ""}, ${addr.district || ""}, ${addr.state || ""} - ${addr.pincode || ""}</p></div>
    <div class="form-group"><label>Products</label>
      ${(o.products || []).map(p => `<div class="custom-field-row" style="justify-content:space-between"><span>${p.name} ${p.color ? "(" + p.color + ")" : ""} × ${p.qty}</span><span>₹${(p.price * p.qty).toLocaleString("en-IN")}</span></div>`).join("")}
    </div>
    <div class="form-group"><label>Total</label><p style="font-weight:600;color:var(--rose-deep)">₹${(o.total || 0).toLocaleString("en-IN")}</p></div>
    ${o.notes ? `<div class="form-group"><label>Customer Notes</label><p>${o.notes}</p></div>` : ""}
    <div class="form-actions"><button class="btn outline" id="closeOrderModal">Close</button></div>
  `;
  $("#orderModalOverlay").classList.add("open");
  $("#closeOrderModal").addEventListener("click", () => $("#orderModalOverlay").classList.remove("open"));
}

// ============================================================
// 8. SETTINGS MANAGEMENT
// ============================================================

async function loadSettingsForm() {
  let s = { ...DEFAULT_SETTINGS };
  try {
    const snap = await getDoc(doc(db, "settings", "business"));
    if (snap.exists()) s = { ...s, ...snap.data() };
  } catch (e) { console.warn(e.message); }
  $("#setBusinessName").value = s.businessName || "";
  $("#setPhone").value = s.phone || "";
  $("#setWhatsapp").value = s.whatsapp || "";
  $("#setEmail").value = s.email || "";
  $("#setInstagram").value = s.instagram || "";
  $("#setInstagramUrl").value = s.instagramUrl || "";
  $("#setAddress").value = s.address || "";
  $("#setDescription").value = s.description || "";
  $("#setDeliveryInfo").value = s.deliveryInfo || "";
  $("#setFooterText").value = s.footerText || "";
}
$("#saveSettingsBtn").addEventListener("click", async () => {
  if (currentUserProfile?.role !== "Primary Admin") return;
  const data = {
    businessName: $("#setBusinessName").value.trim(),
    phone: $("#setPhone").value.trim(),
    whatsapp: $("#setWhatsapp").value.trim(),
    email: $("#setEmail").value.trim(),
    instagram: $("#setInstagram").value.trim(),
    instagramUrl: $("#setInstagramUrl").value.trim(),
    address: $("#setAddress").value.trim(),
    description: $("#setDescription").value.trim(),
    deliveryInfo: $("#setDeliveryInfo").value.trim(),
    footerText: $("#setFooterText").value.trim(),
  };
  try {
    await setDoc(doc(db, "settings", "business"), data, { merge: true });
    alert("Settings saved successfully.");
  } catch (e) {
    alert("Could not save settings: " + e.message);
  }
});

// ============================================================
// 9. ACCESS MANAGEMENT (PRIMARY ADMIN ONLY)
// ============================================================

function renderAdminStats() {
  const total = ADMIN_USERS.length;
  const active = ADMIN_USERS.filter(u => u.status === "active").length;
  const disabled = ADMIN_USERS.filter(u => u.status === "disabled").length;
  $("#statTotalAdmins").textContent = total;
  $("#statActiveAdmins").textContent = active;
  $("#statDisabledAdmins").textContent = disabled;
}

function renderAdminUsersTable() {
  if (!$("#adminUsersTbody")) return;
  const currentUid = auth.currentUser?.uid;

  $("#adminUsersTbody").innerHTML = ADMIN_USERS.map(u => {
    const isPrimaryAdmin = u.role === "Primary Admin";
    const isSelf = u.uid === currentUid;
    const roleClass = u.role === "Primary Admin" ? "primary" : (u.role === "Admin" ? "admin" : "manager");
    const statusClass = u.status === "active" ? "active" : "disabled";

    const createdStr = u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString() : (u.createdAt || "—");
    const lastLoginStr = u.lastLoginAt?.toDate ? u.lastLoginAt.toDate().toLocaleString() : "—";

    return `
      <tr>
        <td><strong>${u.name || "Admin User"}</strong> ${isSelf ? '<span style="font-size:.7rem; background:var(--blush); padding:2px 6px; border-radius:10px; margin-left:4px">(You)</span>' : ''}</td>
        <td>${u.email}</td>
        <td><span class="pill ${roleClass}">${u.role}</span></td>
        <td><span class="pill ${statusClass}">${u.status === "active" ? "Active" : "Disabled"}</span></td>
        <td>${createdStr}</td>
        <td>${lastLoginStr}</td>
        <td>
          <div class="row-actions">
            <button class="btn-action-text edit-admin" data-uid="${u.uid}">Edit</button>
            <button class="btn-action-text change-pw-admin" data-uid="${u.uid}">Change Password</button>
            ${!isPrimaryAdmin ? `
              <button class="btn-action-text toggle-status-admin" data-uid="${u.uid}" data-status="${u.status}">
                ${u.status === "active" ? "Disable" : "Enable"}
              </button>
              <button class="btn-action-text danger remove-admin" data-uid="${u.uid}">Remove</button>
            ` : `
              <span style="font-size:.75rem; opacity:.5; padding:4px;">Protected</span>
            `}
          </div>
        </td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="7" style="text-align:center;opacity:.6;padding:30px">No admin accounts found.</td></tr>`;

  document.querySelectorAll(".edit-admin").forEach(b => b.addEventListener("click", () => openAdminModal(b.dataset.uid)));
  document.querySelectorAll(".change-pw-admin").forEach(b => b.addEventListener("click", () => openChangePwModal(b.dataset.uid)));
  document.querySelectorAll(".toggle-status-admin").forEach(b => b.addEventListener("click", () => toggleAdminStatus(b.dataset.uid, b.dataset.status)));
  document.querySelectorAll(".remove-admin").forEach(b => b.addEventListener("click", () => openRemoveAdminModal(b.dataset.uid)));
}

async function createAdminUserSecured(email, password, name, role, status) {
  const secondaryAppName = "SecondaryAdminAuthApp_" + Date.now();
  const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
  const secondaryAuth = getAuth(secondaryApp);

  try {
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const newUid = userCredential.user.uid;

    await secondarySignOut(secondaryAuth);
    await deleteApp(secondaryApp);

    await setDoc(doc(db, "adminUsers", newUid), {
      uid: newUid,
      name: name,
      email: email,
      role: role,
      status: status,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastLoginAt: null
    });

    return { success: true, uid: newUid };
  } catch (error) {
    try { await deleteApp(secondaryApp); } catch (e) {}
    throw error;
  }
}

function openAdminModal(uid = null) {
  editingAdminUid = uid;
  $("#adminModalError").style.display = "none";
  $("#adminModalSuccess").style.display = "none";

  if (uid) {
    const u = ADMIN_USERS.find(x => x.uid === uid);
    $("#adminModalTitle").textContent = "Edit Admin";
    $("#adminName").value = u ? u.name : "";
    $("#adminEmail").value = u ? u.email : "";
    $("#adminEmail").disabled = true;
    $("#adminRole").value = u ? u.role : "Admin";
    $("#adminStatus").value = u ? u.status : "active";

    $("#adminPasswordGroup").style.display = "none";
    $("#adminConfirmPasswordGroup").style.display = "none";
  } else {
    $("#adminModalTitle").textContent = "Add Admin";
    $("#adminName").value = "";
    $("#adminEmail").value = "";
    $("#adminEmail").disabled = false;
    $("#adminPassword").value = "";
    $("#adminConfirmPassword").value = "";
    $("#adminRole").value = "Admin";
    $("#adminStatus").value = "active";

    $("#adminPasswordGroup").style.display = "block";
    $("#adminConfirmPasswordGroup").style.display = "block";
  }

  $("#adminModalOverlay").classList.add("open");
}

$("#addAdminBtn").addEventListener("click", () => openAdminModal(null));
$("#cancelAdminBtn").addEventListener("click", () => $("#adminModalOverlay").classList.remove("open"));

$("#saveAdminBtn").addEventListener("click", async () => {
  const name = $("#adminName").value.trim();
  const email = $("#adminEmail").value.trim();
  const role = $("#adminRole").value;
  const status = $("#adminStatus").value;
  $("#adminModalError").style.display = "none";
  $("#adminModalSuccess").style.display = "none";

  if (!name || !email) {
    showAdminModalError("Please provide both Name and Email.");
    return;
  }

  if (editingAdminUid) {
    try {
      await updateDoc(doc(db, "adminUsers", editingAdminUid), {
        name,
        role,
        status,
        updatedAt: serverTimestamp()
      });
      $("#adminModalOverlay").classList.remove("open");
    } catch (err) {
      showAdminModalError("Could not update admin: " + err.message);
    }
  } else {
    const pw = $("#adminPassword").value;
    const confirmPw = $("#adminConfirmPassword").value;

    if (!pw || pw.length < 6) {
      showAdminModalError("Password must be at least 6 characters long.");
      return;
    }
    if (pw !== confirmPw) {
      showAdminModalError("Passwords do not match.");
      return;
    }

    try {
      await createAdminUserSecured(email, pw, name, role, status);
      $("#adminModalSuccess").textContent = "Admin account created successfully.";
      $("#adminModalSuccess").style.display = "block";
      setTimeout(() => {
        $("#adminModalOverlay").classList.remove("open");
      }, 1200);
    } catch (err) {
      showAdminModalError(err.message || "Failed to create admin user.");
    }
  }
});

function showAdminModalError(msg) {
  $("#adminModalError").textContent = msg;
  $("#adminModalError").style.display = "block";
}

async function toggleAdminStatus(uid, currentStatus) {
  const newStatus = currentStatus === "active" ? "disabled" : "active";
  try {
    await updateDoc(doc(db, "adminUsers", uid), {
      status: newStatus,
      updatedAt: serverTimestamp()
    });
  } catch (err) {
    alert("Could not change status: " + err.message);
  }
}

function openChangePwModal(uid) {
  changingPwAdminUid = uid;
  const u = ADMIN_USERS.find(x => x.uid === uid);
  if (!u) return;

  $("#changePwAdminInfo").textContent = `Admin Account: ${u.name} (${u.email})`;
  $("#changePwError").style.display = "none";
  $("#changePwSuccess").style.display = "none";
  $("#newAdminPassword").value = "";
  $("#confirmNewAdminPassword").value = "";

  if (uid === auth.currentUser?.uid) {
    $("#directPwUpdateGroup").style.display = "block";
  } else {
    $("#directPwUpdateGroup").style.display = "none";
  }

  $("#changePwModalOverlay").classList.add("open");
}

$("#cancelChangePwBtn").addEventListener("click", () => $("#changePwModalOverlay").classList.remove("open"));

$("#sendResetPwAdminBtn").addEventListener("click", async () => {
  const u = ADMIN_USERS.find(x => x.uid === changingPwAdminUid);
  if (!u) return;
  $("#changePwError").style.display = "none";
  $("#changePwSuccess").style.display = "none";

  try {
    await sendPasswordResetEmail(auth, u.email);
    $("#changePwSuccess").textContent = `Password reset email sent to ${u.email}.`;
    $("#changePwSuccess").style.display = "block";
  } catch (err) {
    $("#changePwError").textContent = err.message || "Could not send reset email.";
    $("#changePwError").style.display = "block";
  }
});

$("#updateAdminPwBtn").addEventListener("click", async () => {
  const newPw = $("#newAdminPassword").value;
  const confirmPw = $("#confirmNewAdminPassword").value;
  $("#changePwError").style.display = "none";
  $("#changePwSuccess").style.display = "none";

  if (!newPw || newPw.length < 6) {
    $("#changePwError").textContent = "New password must be at least 6 characters.";
    $("#changePwError").style.display = "block";
    return;
  }
  if (newPw !== confirmPw) {
    $("#changePwError").textContent = "Passwords do not match.";
    $("#changePwError").style.display = "block";
    return;
  }

  try {
    await updatePassword(auth.currentUser, newPw);
    $("#changePwSuccess").textContent = "Password updated successfully.";
    $("#changePwSuccess").style.display = "block";
    setTimeout(() => $("#changePwModalOverlay").classList.remove("open"), 1200);
  } catch (err) {
    $("#changePwError").textContent = err.message || "Failed to update password.";
    $("#changePwError").style.display = "block";
  }
});

function openRemoveAdminModal(uid) {
  removingAdminUid = uid;
  const u = ADMIN_USERS.find(x => x.uid === uid);
  if (!u) return;

  if (u.role === "Primary Admin") {
    alert("Primary Admin access cannot be removed.");
    return;
  }

  $("#removeAdminDetails").textContent = `${u.name} · ${u.email} (${u.role})`;
  $("#removeAdminModalOverlay").classList.add("open");
}

$("#cancelRemoveAdminBtn").addEventListener("click", () => $("#removeAdminModalOverlay").classList.remove("open"));

$("#confirmRemoveAdminBtn").addEventListener("click", async () => {
  if (!removingAdminUid) return;
  try {
    await deleteDoc(doc(db, "adminUsers", removingAdminUid));
    $("#removeAdminModalOverlay").classList.remove("open");
  } catch (err) {
    alert("Could not remove admin access: " + err.message);
  }
});
