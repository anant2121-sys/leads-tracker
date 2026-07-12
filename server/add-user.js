// Manually add one user to the database. Usage:
//   node add-user.js <email> <password> [role]
// role defaults to "admin" if omitted. Must be "admin" or "basic".

const bcrypt = require("bcrypt");
const db = require("./db");

const SALT_ROUNDS = 10;

const [, , email, password, role = "admin"] = process.argv;

if (!email || !password) {
  console.error("Usage: node add-user.js <email> <password> [role]");
  process.exit(1);
}

if (role !== "admin" && role !== "basic") {
  console.error(`Invalid role "${role}". Must be "admin" or "basic".`);
  process.exit(1);
}

const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
if (existing) {
  console.error(`A user with email "${email}" already exists (id ${existing.id}).`);
  process.exit(1);
}

const hashed = bcrypt.hashSync(password, SALT_ROUNDS);
const insert = db.prepare(
  "INSERT INTO users (email, password, role) VALUES (?, ?, ?)"
);
const result = insert.run(email, hashed, role);

console.log(`Added user "${email}" (role: ${role}, id: ${result.lastInsertRowid}).`);
