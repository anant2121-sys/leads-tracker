const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("./db");
const { authenticate, requireAdmin, JWT_SECRET } = require("./auth");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_EXPIRES_IN = "2h";

app.use(cors());
app.use(express.json());

app.post("/login", async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const user = db.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?)").get(email);
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

  res.json({ token });
});

function rowToLead(row) {
  return { ...row, commentsHistory: JSON.parse(row.commentsHistory) };
}

app.get("/leads", authenticate, (req, res) => {
  const rows = db.prepare("SELECT * FROM leads").all();
  res.json(rows.map(rowToLead));
});

app.post("/leads", authenticate, (req, res) => {
  const {
    clientName,
    type,
    leadDate,
    leadDetails,
    contactPerson,
    contactEmail,
    contactPhone,
    dealValue,
    status,
    eta,
    notes,
    commentsHistory,
  } = req.body || {};

  if (!clientName) {
    return res.status(400).json({ error: "clientName is required." });
  }

  const result = db
    .prepare(
      `INSERT INTO leads
        (clientName, type, leadDate, leadDetails, contactPerson, contactEmail, contactPhone, dealValue, status, eta, notes, commentsHistory)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      clientName,
      type || "",
      leadDate || new Date().toISOString(),
      leadDetails || "",
      contactPerson || "",
      contactEmail || "",
      contactPhone || "",
      dealValue || "",
      status || "New",
      eta || "",
      notes || "",
      JSON.stringify(commentsHistory || [])
    );

  const row = db.prepare("SELECT * FROM leads WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(rowToLead(row));
});

app.put("/leads/:id", authenticate, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare("SELECT * FROM leads WHERE id = ?").get(id);
  if (!existing) {
    return res.status(404).json({ error: "Lead not found." });
  }

  const { status, commentsHistory } = req.body || {};

  db.prepare("UPDATE leads SET status = ?, commentsHistory = ? WHERE id = ?").run(
    status !== undefined ? status : existing.status,
    JSON.stringify(commentsHistory !== undefined ? commentsHistory : JSON.parse(existing.commentsHistory)),
    id
  );

  const row = db.prepare("SELECT * FROM leads WHERE id = ?").get(id);
  res.json(rowToLead(row));
});

const SALT_ROUNDS = 10;

app.post("/admin/users", authenticate, requireAdmin, async (req, res) => {
  const { email, password, role } = req.body || {};

  if (!email || !password || !role) {
    return res.status(400).json({ error: "email, password, and role are required." });
  }

  if (role !== "admin" && role !== "basic") {
    return res.status(400).json({ error: 'role must be "admin" or "basic".' });
  }

  const existing = db.prepare("SELECT id FROM users WHERE LOWER(email) = LOWER(?)").get(email);
  if (existing) {
    return res.status(409).json({ error: "A user with this email already exists." });
  }

  const hashed = await bcrypt.hash(password, SALT_ROUNDS);
  const result = db
    .prepare("INSERT INTO users (email, password, role) VALUES (?, ?, ?)")
    .run(email, hashed, role);

  res.status(201).json({ id: result.lastInsertRowid, email, role });
});

app.get("/admin/users", authenticate, requireAdmin, (req, res) => {
  const rows = db.prepare("SELECT id, email, role FROM users ORDER BY id").all();
  res.json(rows);
});

app.put("/admin/users/:id", authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!existing) {
    return res.status(404).json({ error: "User not found." });
  }

  const { email, role, password } = req.body || {};

  if (email !== undefined && !email) {
    return res.status(400).json({ error: "email cannot be empty." });
  }

  if (role !== undefined && role !== "admin" && role !== "basic") {
    return res.status(400).json({ error: 'role must be "admin" or "basic".' });
  }

  if (email !== undefined && email.toLowerCase() !== existing.email.toLowerCase()) {
    const emailTaken = db
      .prepare("SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ?")
      .get(email, id);
    if (emailTaken) {
      return res.status(409).json({ error: "A user with this email already exists." });
    }
  }

  const newEmail = email !== undefined ? email : existing.email;
  const newRole = role !== undefined ? role : existing.role;
  const newPassword = password ? await bcrypt.hash(password, SALT_ROUNDS) : existing.password;

  db.prepare("UPDATE users SET email = ?, role = ?, password = ? WHERE id = ?").run(
    newEmail,
    newRole,
    newPassword,
    id
  );

  res.json({ id: Number(id), email: newEmail, role: newRole });
});

app.put("/admin/users/:id/reset-password", authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { password } = req.body || {};

  if (!password) {
    return res.status(400).json({ error: "password is required." });
  }

  const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
  if (!existing) {
    return res.status(404).json({ error: "User not found." });
  }

  const hashed = await bcrypt.hash(password, SALT_ROUNDS);
  db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashed, id);

  res.json({ id: Number(id), message: "Password reset." });
});

app.delete("/admin/leads/clear", authenticate, requireAdmin, (req, res) => {
  const { confirm } = req.body || {};

  if (confirm !== true) {
    return res.status(400).json({ error: "Set confirm: true in the request body to clear all leads." });
  }

  const result = db.prepare("DELETE FROM leads").run();
  res.json({ message: "All leads cleared.", deletedCount: result.changes });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
