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
    const pid = document.getElementById("post-product-id") ? document.getElementById("post-product-id").value : "";
    if (pid) fd.append("productId", pid);
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
    const productCard = p.product ? `<div style="display:flex;align-items:center;border:1px solid #e5e7eb;border-radius:10px;padding:8px;margin-top:8px"><img src="${p.product.image || ''}" style="width:60px;height:60px;object-fit:cover;border-radius:6px;margin-right:8px"><div><div style="font-weight:600">${p.product.title}</div><div class="muted">￥${p.product.price}</div></div></div>` : "";
    div.innerHTML = `${imgs}<p>${p.text}</p>${productCard}<div style="margin-top:8px"><button data-like="${p.id}">点赞(${p.likesCount||0})</button> <button data-fav="${p.id}">收藏(${p.favoritesCount||0})</button> <button data-share="${p.id}">转发(${p.sharesCount||0})</button></div>`;
    div.querySelector(`[data-like="${p.id}"]`).onclick = async () => { const r = await fetch(`/api/posts/${p.id}/like`, { method: "POST", headers: tokenHeaders() }); const d = await r.json(); loadMyPosts(); };
    div.querySelector(`[data-fav="${p.id}"]`).onclick = async () => { const r = await fetch(`/api/posts/${p.id}/favorite`, { method: "POST", headers: tokenHeaders() }); const d = await r.json(); loadMyPosts(); };
    div.querySelector(`[data-share="${p.id}"]`).onclick = async () => { const r = await fetch(`/api/posts/${p.id}/share`, { method: "POST", headers: tokenHeaders() }); const d = await r.json(); loadMyPosts(); };
    list.appendChild(div);
  });
}

async function loadDiscover() {
  const res = await fetch("/api/products/discover", { headers: tokenHeaders() });
  const data = await res.json();
  const list = document.getElementById("discover-list");
  if (!list) return;
  list.innerHTML = "";
  data.products.forEach(p => {
    const div = document.createElement("div");
    div.className = "card";
    const img = p.images && p.images[0] ? `<img src="${p.images[0]}" style="max-width:100%">` : "";
    div.innerHTML = `${img}<h3>${p.title} - ￥${p.price}</h3><p class="muted">${p.sellerName || ''} · ${p.sellerSchool || ''}</p><a href="/product.html?id=${p.id}">查看</a>`;
    list.appendChild(div);
  });
}

async function loadAlumni(sort) {
  const res = await fetch(`/api/school/posts?sort=${sort||'time'}`, { headers: tokenHeaders() });
  const data = await res.json();
  const list = document.getElementById("alumni-posts");
  if (!list) return;
  list.innerHTML = "";
  data.posts.forEach(p => {
    const div = document.createElement("div");
    div.className = "card";
    const imgs = (p.images || []).map(src => `<img src="${src}" style="max-width:100%">`).join("");
    const productCard = p.product ? `<div style="display:flex;align-items:center;border:1px solid #e5e7eb;border-radius:10px;padding:8px;margin-top:8px"><img src="${p.product.image || ''}" style="width:60px;height:60px;object-fit:cover;border-radius:6px;margin-right:8px"><div><div style="font-weight:600">${p.product.title}</div><div class="muted">￥${p.product.price}</div></div></div>` : "";
    div.innerHTML = `${imgs}<p>${p.text}</p><div class="muted">${p.authorName || ''}</div>${productCard}<div style="margin-top:8px"><button data-like="${p.id}">点赞(${p.likesCount||0})</button> <button data-fav="${p.id}">收藏(${p.favoritesCount||0})</button> <button data-share="${p.id}">转发(${p.sharesCount||0})</button></div>`;
    div.querySelector(`[data-like="${p.id}"]`).onclick = async () => { await fetch(`/api/posts/${p.id}/like`, { method: "POST", headers: tokenHeaders() }); loadAlumni(sort); };
    div.querySelector(`[data-fav="${p.id}"]`).onclick = async () => { await fetch(`/api/posts/${p.id}/favorite`, { method: "POST", headers: tokenHeaders() }); loadAlumni(sort); };
    div.querySelector(`[data-share="${p.id}"]`).onclick = async () => { await fetch(`/api/posts/${p.id}/share`, { method: "POST", headers: tokenHeaders() }); loadAlumni(sort); };
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
  if (path.endsWith("/discover.html")) {
    loadDiscover();
    return;
  }
  if (path.endsWith("/alumni.html")) {
    const s = document.getElementById("alumni-sort");
    if (s) { s.onchange = () => loadAlumni(s.value); }
    loadAlumni(s ? s.value : "time");
    return;
  }
  if (path.endsWith("/user.html")) {
    loadUserPage();
    return;
  }
  if (path.endsWith("/chat.html")) {
    initChatPage();
    return;
  }
});

async function loadUserPage() {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const res = await fetch(`/api/users/${id}/profile`, { headers: tokenHeaders() });
  const data = await res.json();
  const c = document.getElementById("user-profile");
  if (!c || !data.user) return;
  c.innerHTML = `<img src="${data.user.avatarUrl||''}" class="round"><h3>${data.user.username}</h3><p class="muted">${data.user.school||''}</p><p>${data.user.bio||''}</p><p>关注 ${data.followingCount} · 粉丝 ${data.followersCount}</p><button id="follow-btn">${data.isFollowing?"取消关注":"关注"}</button>`;
  const btn = document.getElementById("follow-btn");
  if (btn) btn.onclick = async () => {
    const url = data.isFollowing ? `/api/users/${id}/unfollow` : `/api/users/${id}/follow`;
    await fetch(url, { method: "POST", headers: tokenHeaders() });
    loadUserPage();
  };
  const chatLink = document.getElementById("chat-link");
  if (chatLink) chatLink.href = `/chat.html?userId=${id}`;
}

async function initChatPage() {
  const params = new URLSearchParams(location.search);
  const otherId = params.get("userId");
  const list = document.getElementById("messages");
  const input = document.getElementById("chat-text");
  const send = document.getElementById("chat-send");
  async function refresh() {
    const r = await fetch(`/api/messages?userId=${otherId}`, { headers: tokenHeaders() });
    const d = await r.json();
    list.innerHTML = "";
    d.messages.forEach(m => {
      const div = document.createElement("div");
      div.className = "card";
      div.innerHTML = `<div>${m.text}</div>`;
      list.appendChild(div);
    });
  }
  if (send) send.onclick = async () => {
    const t = input.value;
    if (!t) return;
    await fetch(`/api/messages`, { method: "POST", headers: { ...tokenHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ toUserId: otherId, text: t }) });
    input.value = "";
    refresh();
  };
  refresh();
}
