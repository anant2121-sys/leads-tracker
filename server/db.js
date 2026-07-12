const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const dbPath = path.join(__dirname, "leads.db");
const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'basic'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clientName TEXT NOT NULL,
    type TEXT,
    leadDate TEXT,
    leadDetails TEXT,
    contactPerson TEXT,
    contactEmail TEXT,
    contactPhone TEXT,
    dealValue TEXT,
    status TEXT,
    eta TEXT,
    notes TEXT,
    commentsHistory TEXT NOT NULL DEFAULT '[]'
  )
`);

module.exports = db;
