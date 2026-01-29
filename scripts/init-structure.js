import fs from "fs";
import path from "path";

const base = process.cwd();

const dirs = [
  "src/server/routes",
  "src/server/controllers",
  "src/server/db/migrations",
  "src/server/db/seeds",
  "src/server/middleware",
  "src/public/css",
  "src/public/js",
  "src/public/uploads",
  "src/views/layouts",
  "src/views/partials",
  "src/views/materials"
];

dirs.forEach(dir => {
  const full = path.join(base, dir);
  fs.mkdirSync(full, { recursive: true });
  console.log("📁 Created:", dir);
});

// plik app.js
const appJs = `
import express from "express";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use("/uploads", express.static("src/public/uploads"));
app.use(express.static("src/public"));

// EJS view engine
app.set("view engine", "ejs");
app.set("views", "./src/views");

// Simple route
app.get("/", (req, res) => {
  res.send("Aplikacja Opakowania działa 🚀");
});

app.listen(PORT, () => console.log("Server running on port", PORT));
`;

fs.writeFileSync(path.join(base, "app.js"), appJs.trim());
console.log("✅ Created: app.js");

// plik .env
const env = `PORT=3000
DATABASE_URL=postgres://opakowania:gZJ8yzex0r@localhost:5432/opakowania
SESSION_SECRET=devsecret`;
fs.writeFileSync(path.join(base, ".env"), env);
console.log("✅ Created: .env");

// README
const readme = `# Aplikacja Opakowania
Struktura projektu została utworzona automatycznie.
Uruchom serwer:
\`\`\`bash
npm run dev
\`\`\`
`;
fs.writeFileSync(path.join(base, "README.md"), readme);
console.log("✅ Created: README.md");
