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

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
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

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
