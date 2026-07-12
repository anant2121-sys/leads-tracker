const bcrypt = require("bcrypt");
const db = require("./db");

const SALT_ROUNDS = 10;

const users = [
  { email: "admin@example.com", password: "Admin123!", role: "admin" },
  { email: "user@example.com", password: "User123!", role: "basic" },
];

const insert = db.prepare(
  "INSERT OR IGNORE INTO users (email, password, role) VALUES (?, ?, ?)"
);

for (const u of users) {
  const hashed = bcrypt.hashSync(u.password, SALT_ROUNDS);
  insert.run(u.email, hashed, u.role);
}

console.log("Seeded users:");
users.forEach((u) => console.log(`  ${u.email} / ${u.password} (${u.role})`));
