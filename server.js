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
    fs.writeFileSync(dataFile, JSON.stringify({ users: [], products: [], orders: [], posts: [] }, null, 2));
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
  const user = { id: uuidv4(), username, passwordHash: hash, school: school || "", bio: "", birthday: "", gender: "", avatarUrl: "", stats: { positiveCount: 0, totalReceivedRatings: 0 } };
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
  const { text } = req.body;
  const db = readData();
  const post = { id: uuidv4(), userId: req.userId, text: text || "", images: (req.files || []).map(f => `/uploads/${f.filename}`), createdAt: Date.now() };
  db.posts.push(post);
  writeData(db);
  res.json({ post });
});

app.get("/api/posts", (req, res) => {
  const { userId } = req.query;
  const db = readData();
  const posts = userId ? db.posts.filter(p => p.userId === userId) : db.posts;
  res.json({ posts });
});

const port = parseInt(process.env.PORT || "3000", 10);
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
