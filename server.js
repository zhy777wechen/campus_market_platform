import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import multer from "multer";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const __dirnamePath = path.resolve();
const dataFile = path.join(__dirnamePath, "data", "data.json");
const uploadsDir = path.join(__dirnamePath, "uploads");
const publicDir = path.join(__dirnamePath, "public");

if (!fs.existsSync(path.join(__dirnamePath, "data"))) fs.mkdirSync(path.join(__dirnamePath, "data"), { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  }
});
const upload = multer({ storage });

app.use("/uploads", express.static(uploadsDir));
app.use(express.static(publicDir));

function readData() {
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify({ users: [], products: [], orders: [], posts: [], messages: [] }, null, 2));
  }
  const raw = fs.readFileSync(dataFile, "utf-8");
  return JSON.parse(raw || "{}");
}

function writeData(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

function createToken(user) {
  return jwt.sign({ id: user.id }, process.env.JWT_SECRET || "change-me", { expiresIn: "7d" });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "unauthorized" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "change-me");
    req.userId = payload.id;
    next();
  } catch (e) {
    res.status(401).json({ error: "invalid_token" });
  }
}

app.post("/api/auth/register", async (req, res) => {
  const { username, password, school } = req.body;
  if (!username || !password) return res.status(400).json({ error: "missing_fields" });
  if (typeof password !== "string" || password.length < 8) return res.status(400).json({ error: "weak_password", min: 8 });
  const db = readData();
  const exists = db.users.find(u => u.username === username);
  if (exists) return res.status(400).json({ error: "username_exists" });
  const hash = await bcrypt.hash(password, 10);
  const user = { id: uuidv4(), username, passwordHash: hash, school: school || "", bio: "", birthday: "", gender: "", avatarUrl: "", stats: { positiveCount: 0, totalReceivedRatings: 0 }, following: [], followers: [] };
  db.users.push(user);
  writeData(db);
  const token = createToken(user);
  res.json({ token, user: { id: user.id, username: user.username, school: user.school, avatarUrl: user.avatarUrl } });
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  const db = readData();
  const user = db.users.find(u => u.username === username);
  if (!user) return res.status(400).json({ error: "invalid_credentials" });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(400).json({ error: "invalid_credentials" });
  const token = createToken(user);
  res.json({ token, user: { id: user.id, username: user.username, school: user.school, avatarUrl: user.avatarUrl } });
});

app.get("/api/users/me", authMiddleware, (req, res) => {
  const db = readData();
  const user = db.users.find(u => u.id === req.userId);
  if (!user) return res.status(404).json({ error: "not_found" });
  res.json({ user: { id: user.id, username: user.username, bio: user.bio, birthday: user.birthday, gender: user.gender, school: user.school, avatarUrl: user.avatarUrl } });
});

app.put("/api/users/me", authMiddleware, (req, res) => {
  const { username, bio, birthday, gender, school } = req.body;
  const db = readData();
  const user = db.users.find(u => u.id === req.userId);
  if (!user) return res.status(404).json({ error: "not_found" });
  if (username) user.username = username;
  if (bio !== undefined) user.bio = bio;
  if (birthday !== undefined) user.birthday = birthday;
  if (gender !== undefined) user.gender = gender;
  if (school !== undefined) user.school = school;
  writeData(db);
  res.json({ ok: true });
});

app.post("/api/users/me/avatar", authMiddleware, upload.single("avatar"), (req, res) => {
  const db = readData();
  const user = db.users.find(u => u.id === req.userId);
  if (!user) return res.status(404).json({ error: "not_found" });
  user.avatarUrl = req.file ? `/uploads/${req.file.filename}` : user.avatarUrl;
  writeData(db);
  res.json({ avatarUrl: user.avatarUrl });
});

app.post("/api/products", authMiddleware, upload.array("images", 6), (req, res) => {
  const { title, description, price } = req.body;
  if (!title || !price) return res.status(400).json({ error: "missing_fields" });
  const db = readData();
  const product = { id: uuidv4(), sellerId: req.userId, title, description: description || "", price: parseFloat(price), images: (req.files || []).map(f => `/uploads/${f.filename}`), status: "available", createdAt: Date.now() };
  db.products.push(product);
  writeData(db);
  res.json({ product });
});

app.get("/api/products", (req, res) => {
  const db = readData();
  res.json({ products: db.products });
});

app.get("/api/products/:id", (req, res) => {
  const db = readData();
  const product = db.products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: "not_found" });
  res.json({ product });
});

app.post("/api/orders", authMiddleware, (req, res) => {
  const { productId } = req.body;
  const db = readData();
  const product = db.products.find(p => p.id === productId);
  if (!product) return res.status(404).json({ error: "product_not_found" });
  if (product.status !== "available") return res.status(400).json({ error: "not_available" });
  const order = { id: uuidv4(), productId, buyerId: req.userId, sellerId: product.sellerId, status: "pending", ratings: [], createdAt: Date.now() };
  db.orders.push(order);
  product.status = "reserved";
  writeData(db);
  res.json({ order });
});

app.get("/api/orders", authMiddleware, (req, res) => {
  const db = readData();
  const orders = db.orders.filter(o => o.buyerId === req.userId || o.sellerId === req.userId);
  res.json({ orders });
});

app.post("/api/orders/:id/confirm", authMiddleware, (req, res) => {
  const db = readData();
  const order = db.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "not_found" });
  if (order.buyerId !== req.userId) return res.status(403).json({ error: "forbidden" });
  order.status = "completed";
  const product = db.products.find(p => p.id === order.productId);
  if (product) product.status = "sold";
  writeData(db);
  res.json({ ok: true });
});

app.post("/api/orders/:id/rate", authMiddleware, (req, res) => {
  const { score, comment } = req.body;
  const s = parseInt(score, 10);
  if (isNaN(s) || s < 1 || s > 5) return res.status(400).json({ error: "invalid_score" });
  const db = readData();
  const order = db.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "not_found" });
  if (order.status !== "completed") return res.status(400).json({ error: "not_completed" });
  if (order.buyerId !== req.userId && order.sellerId !== req.userId) return res.status(403).json({ error: "forbidden" });
  const toUserId = order.buyerId === req.userId ? order.sellerId : order.buyerId;
  const already = order.ratings.find(r => r.fromUserId === req.userId);
  if (already) return res.status(400).json({ error: "already_rated" });
  order.ratings.push({ id: uuidv4(), fromUserId: req.userId, toUserId, score: s, comment: comment || "", createdAt: Date.now() });
  const toUser = db.users.find(u => u.id === toUserId);
  if (toUser) {
    toUser.stats.totalReceivedRatings = (toUser.stats.totalReceivedRatings || 0) + 1;
    if (s >= 4) toUser.stats.positiveCount = (toUser.stats.positiveCount || 0) + 1;
  }
  writeData(db);
  res.json({ ok: true });
});

app.get("/api/users/:id/ratings", (req, res) => {
  const db = readData();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "not_found" });
  const positive = user.stats.positiveCount || 0;
  const total = user.stats.totalReceivedRatings || 0;
  const rate = total === 0 ? 0 : Math.round((positive / total) * 100);
  res.json({ positive, total, rate });
});

app.post("/api/posts", authMiddleware, upload.array("images", 6), (req, res) => {
  const { text, productId } = req.body;
  const db = readData();
  const post = { id: uuidv4(), userId: req.userId, text: text || "", images: (req.files || []).map(f => `/uploads/${f.filename}`), productId: productId || "", likesCount: 0, favoritesCount: 0, sharesCount: 0, likedBy: [], favoritedBy: [], sharedBy: [], createdAt: Date.now() };
  db.posts.push(post);
  writeData(db);
  res.json({ post });
});

app.get("/api/posts", (req, res) => {
  const { userId } = req.query;
  const db = readData();
  const posts = userId ? db.posts.filter(p => p.userId === userId) : db.posts;
  const result = posts.map(p => {
    let product = null;
    if (p.productId) {
      const prod = db.products.find(x => x.id === p.productId);
      if (prod) product = { id: prod.id, title: prod.title, price: prod.price, image: (prod.images || [])[0] || "" };
    }
    return { ...p, product };
  });
  res.json({ posts: result });
});

app.get("/api/products/discover", authMiddleware, (req, res) => {
  const db = readData();
  const me = db.users.find(u => u.id === req.userId);
  const items = db.products.map(p => {
    const seller = db.users.find(u => u.id === p.sellerId) || {};
    return { ...p, sellerSchool: seller.school || "", sellerName: seller.username || "" };
  });
  items.sort((a, b) => {
    const aSame = a.sellerSchool && me && a.sellerSchool === me.school ? 1 : 0;
    const bSame = b.sellerSchool && me && b.sellerSchool === me.school ? 1 : 0;
    if (bSame !== aSame) return bSame - aSame;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
  res.json({ products: items });
});

app.get("/api/school/posts", authMiddleware, (req, res) => {
  const { sort } = req.query;
  const db = readData();
  const me = db.users.find(u => u.id === req.userId);
  const posts = db.posts.filter(p => {
    const author = db.users.find(u => u.id === p.userId);
    return author && author.school === (me ? me.school : "");
  }).map(p => {
    const author = db.users.find(u => u.id === p.userId) || {};
    let product = null;
    if (p.productId) {
      const prod = db.products.find(x => x.id === p.productId);
      if (prod) product = { id: prod.id, title: prod.title, price: prod.price, image: (prod.images || [])[0] || "" };
    }
    return { ...p, authorName: author.username || "", product };
  });
  if (sort === "likes") posts.sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0));
  else posts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json({ posts });
});

app.post("/api/posts/:id/like", authMiddleware, (req, res) => {
  const db = readData();
  const post = db.posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: "not_found" });
  post.likedBy = post.likedBy || [];
  const idx = post.likedBy.indexOf(req.userId);
  if (idx >= 0) post.likedBy.splice(idx, 1); else post.likedBy.push(req.userId);
  post.likesCount = post.likedBy.length;
  writeData(db);
  res.json({ likesCount: post.likesCount, liked: post.likedBy.includes(req.userId) });
});

app.post("/api/posts/:id/favorite", authMiddleware, (req, res) => {
  const db = readData();
  const post = db.posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: "not_found" });
  post.favoritedBy = post.favoritedBy || [];
  const idx = post.favoritedBy.indexOf(req.userId);
  if (idx >= 0) post.favoritedBy.splice(idx, 1); else post.favoritedBy.push(req.userId);
  post.favoritesCount = post.favoritedBy.length;
  writeData(db);
  res.json({ favoritesCount: post.favoritesCount, favorited: post.favoritedBy.includes(req.userId) });
});

app.post("/api/posts/:id/share", authMiddleware, (req, res) => {
  const db = readData();
  const post = db.posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: "not_found" });
  post.sharedBy = post.sharedBy || [];
  if (!post.sharedBy.includes(req.userId)) post.sharedBy.push(req.userId);
  post.sharesCount = post.sharedBy.length;
  writeData(db);
  res.json({ sharesCount: post.sharesCount });
});

app.get("/api/users/:id/profile", authMiddleware, (req, res) => {
  const db = readData();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "not_found" });
  user.followers = user.followers || [];
  user.following = user.following || [];
  const isFollowing = user.followers.includes(req.userId);
  res.json({ user: { id: user.id, username: user.username, avatarUrl: user.avatarUrl, bio: user.bio, school: user.school }, followingCount: user.following.length, followersCount: user.followers.length, isFollowing });
});

app.post("/api/users/:id/follow", authMiddleware, (req, res) => {
  const db = readData();
  const target = db.users.find(u => u.id === req.params.id);
  const me = db.users.find(u => u.id === req.userId);
  if (!target || !me) return res.status(404).json({ error: "not_found" });
  me.following = me.following || [];
  target.followers = target.followers || [];
  if (!me.following.includes(target.id)) me.following.push(target.id);
  if (!target.followers.includes(me.id)) target.followers.push(me.id);
  writeData(db);
  res.json({ ok: true });
});

app.post("/api/users/:id/unfollow", authMiddleware, (req, res) => {
  const db = readData();
  const target = db.users.find(u => u.id === req.params.id);
  const me = db.users.find(u => u.id === req.userId);
  if (!target || !me) return res.status(404).json({ error: "not_found" });
  me.following = me.following || [];
  target.followers = target.followers || [];
  me.following = me.following.filter(x => x !== target.id);
  target.followers = target.followers.filter(x => x !== me.id);
  writeData(db);
  res.json({ ok: true });
});

app.get("/api/messages", authMiddleware, (req, res) => {
  const otherId = req.query.userId;
  const db = readData();
  const msgs = db.messages.filter(m => (m.fromUserId === req.userId && m.toUserId === otherId) || (m.fromUserId === otherId && m.toUserId === req.userId));
  msgs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  res.json({ messages: msgs });
});

app.post("/api/messages", authMiddleware, (req, res) => {
  const { toUserId, text } = req.body;
  if (!toUserId || !text) return res.status(400).json({ error: "missing_fields" });
  const db = readData();
  const msg = { id: uuidv4(), fromUserId: req.userId, toUserId, text, createdAt: Date.now() };
  db.messages.push(msg);
  writeData(db);
  res.json({ message: msg });
});

const port = parseInt(process.env.PORT || "3000", 10);
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
