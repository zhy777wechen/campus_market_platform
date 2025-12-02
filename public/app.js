const api = {
  base: "",
  headers() {
    const t = localStorage.getItem("token") || "";
    return t ? { Authorization: "Bearer " + t } : {};
  }
};

function isAuthed() { return !!localStorage.getItem("token"); }
function requireAuth() { if (!isAuthed()) location.href = "/index.html"; }
async function redirectIfAuthed() { if (isAuthed()) location.href = "/products.html"; }

async function postJSON(url, data) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  return r.json();
}

function bindAuth() {
  const loginBtn = document.getElementById("login-btn");
  const status = document.getElementById("status");
  if (loginBtn) loginBtn.onclick = async () => {
    const username = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    const data = await res.json();
    if (data.token) { localStorage.setItem("token", data.token); status.textContent = "登录成功"; setTimeout(() => location.href = "/products.html", 500); } else { status.textContent = JSON.stringify(data); }
  };
}

async function bindRegister() {
  const btn = document.getElementById("register-btn");
  const status = document.getElementById("register-status");
  if (btn) btn.onclick = async () => {
    const username = document.getElementById("register-username").value;
    const password = document.getElementById("register-password").value;
    const school = document.getElementById("register-school").value;
    if (!password || password.length < 8) { status.textContent = "密码至少8位"; return; }
    const data = await postJSON("/api/auth/register", { username, password, school });
    if (data.token) { localStorage.setItem("token", data.token); status.textContent = "注册成功"; setTimeout(() => location.href = "/products.html", 500); } else { status.textContent = JSON.stringify(data); }
  };
}

function tokenHeaders() { return { Authorization: "Bearer " + (localStorage.getItem("token") || "") }; }

async function loadProfile() {
  const res = await fetch("/api/users/me", { headers: tokenHeaders() });
  const data = await res.json();
  const c = document.getElementById("profile");
  if (!c) return;
  if (data.user) {
    c.querySelector("#username").value = data.user.username || "";
    c.querySelector("#bio").value = data.user.bio || "";
    c.querySelector("#birthday").value = data.user.birthday || "";
    c.querySelector("#gender").value = data.user.gender || "";
    c.querySelector("#school").value = data.user.school || "";
    document.getElementById("avatar").src = data.user.avatarUrl || "";
    const r = await fetch(`/api/users/${data.user.id}/ratings`);
    const s = await r.json();
    document.getElementById("rating-stats").textContent = `好评数 ${s.positive} / 好评率 ${s.rate}%`;
  }
}

function bindProfile() {
  const saveBtn = document.getElementById("save-profile");
  const avatarInput = document.getElementById("avatar-input");
  if (saveBtn) saveBtn.onclick = async () => {
    const payload = {
      username: document.getElementById("username").value,
      bio: document.getElementById("bio").value,
      birthday: document.getElementById("birthday").value,
      gender: document.getElementById("gender").value,
      school: document.getElementById("school").value
    };
    const res = await fetch("/api/users/me", { method: "PUT", headers: { ...tokenHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json();
    document.getElementById("profile-status").textContent = data.ok ? "已保存" : JSON.stringify(data);
  };
  if (avatarInput) avatarInput.onchange = async () => {
    const f = avatarInput.files[0];
    const fd = new FormData();
    fd.append("avatar", f);
    const res = await fetch("/api/users/me/avatar", { method: "POST", headers: tokenHeaders(), body: fd });
    const data = await res.json();
    if (data.avatarUrl) document.getElementById("avatar").src = data.avatarUrl;
  };
}

async function loadProducts() {
  const res = await fetch("/api/products");
  const data = await res.json();
  const list = document.getElementById("product-list");
  if (!list) return;
  list.innerHTML = "";
  data.products.forEach(p => {
    const div = document.createElement("div");
    div.className = "card";
    const img = p.images && p.images[0] ? `<img src="${p.images[0]}" style="max-width:100%">` : "";
    div.innerHTML = `${img}<h3>${p.title} - ￥${p.price}</h3><p>${p.description || ""}</p><p>状态：${p.status}</p><a href="/product.html?id=${p.id}">查看</a>`;
    list.appendChild(div);
  });
}

function bindCreateProduct() {
  const btn = document.getElementById("create-product");
  if (!btn) return;
  btn.onclick = async () => {
    const fd = new FormData();
    fd.append("title", document.getElementById("p-title").value);
    fd.append("description", document.getElementById("p-desc").value);
    fd.append("price", document.getElementById("p-price").value);
    const files = document.getElementById("p-images").files;
    for (let i = 0; i < files.length; i++) fd.append("images", files[i]);
    const res = await fetch("/api/products", { method: "POST", headers: tokenHeaders(), body: fd });
    const data = await res.json();
    document.getElementById("product-status").textContent = data.product ? "已发布" : JSON.stringify(data);
    loadProducts();
  };
}

async function loadProductDetail() {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const res = await fetch(`/api/products/${id}`);
  const data = await res.json();
  const c = document.getElementById("product-detail");
  if (!c || !data.product) return;
  const p = data.product;
  const imgs = (p.images || []).map(src => `<img src="${src}" style="max-width:100%">`).join("");
  c.innerHTML = `${imgs}<h2>${p.title}</h2><p>${p.description || ""}</p><p>￥${p.price}</p><p>状态：${p.status}</p>`;
  const buyBtn = document.getElementById("buy-btn");
  if (buyBtn) buyBtn.onclick = async () => {
    const res2 = await fetch("/api/orders", { method: "POST", headers: { ...tokenHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ productId: p.id }) });
    const d2 = await res2.json();
    document.getElementById("buy-status").textContent = d2.order ? "下单成功" : JSON.stringify(d2);
  };
}

async function loadOrders() {
  const res = await fetch("/api/orders", { headers: tokenHeaders() });
  const data = await res.json();
  const list = document.getElementById("orders");
  if (!list) return;
  list.innerHTML = "";
  data.orders.forEach(o => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `<p>订单 ${o.id}</p><p>状态：${o.status}</p>`;
    const confirmBtn = document.createElement("button");
    confirmBtn.textContent = "确认收货";
    confirmBtn.onclick = async () => {
      const r = await fetch(`/api/orders/${o.id}/confirm`, { method: "POST", headers: tokenHeaders() });
      const d = await r.json();
      loadOrders();
    };
    const rateBtn = document.createElement("button");
    rateBtn.textContent = "评价";
    rateBtn.onclick = async () => {
      const s = prompt("评分1-5", "5");
      const c = prompt("评价内容", "");
      const r = await fetch(`/api/orders/${o.id}/rate`, { method: "POST", headers: { ...tokenHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ score: s, comment: c }) });
      const d = await r.json();
      loadOrders();
    };
    list.appendChild(div);
    list.appendChild(confirmBtn);
    list.appendChild(rateBtn);
  });
}

function bindPost() {
  const btn = document.getElementById("post-btn");
  if (!btn) return;
  btn.onclick = async () => {
    const fd = new FormData();
    fd.append("text", document.getElementById("post-text").value);
    const files = document.getElementById("post-images").files;
    for (let i = 0; i < files.length; i++) fd.append("images", files[i]);
    const r = await fetch("/api/posts", { method: "POST", headers: tokenHeaders(), body: fd });
    const d = await r.json();
    loadMyPosts();
  };
}

async function loadMyPosts() {
  const me = await fetch("/api/users/me", { headers: tokenHeaders() });
  const m = await me.json();
  if (!m.user) return;
  const res = await fetch(`/api/posts?userId=${m.user.id}`);
  const data = await res.json();
  const list = document.getElementById("posts");
  if (!list) return;
  list.innerHTML = "";
  data.posts.forEach(p => {
    const div = document.createElement("div");
    div.className = "card";
    const imgs = (p.images || []).map(src => `<img src="${src}" style="max-width:100%">`).join("");
    div.innerHTML = `${imgs}<p>${p.text}</p>`;
    list.appendChild(div);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const path = location.pathname;
  if (path.endsWith("/index.html") || path === "/") {
    redirectIfAuthed();
    bindAuth();
    return;
  }
  if (path.endsWith("/register.html")) {
    redirectIfAuthed();
    bindRegister();
    return;
  }
  requireAuth();
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) logoutBtn.onclick = () => { localStorage.removeItem("token"); location.href = "/index.html"; };
  bindProfile();
  bindCreateProduct();
  bindPost();
  loadProfile();
  loadProducts();
  loadProductDetail();
  loadOrders();
  loadMyPosts();
});
