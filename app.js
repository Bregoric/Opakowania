import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";

import materialsRouter from "./src/server/routes/materials.js";
import i18nMiddleware from "./src/server/middleware/i18n.js";
import devRouter from "./src/server/routes/dev.js";
import tasksRouter from "./src/server/routes/tasks.js";
import mockAuth from './src/server/middleware/mockAuth.js';
import csrfLite from './src/server/middleware/csrfLite.js';
import tasksHistoryRouter from "./src/server/routes/tasksHistory.js";

dotenv.config();



const app = express();
const PORT = process.env.PORT || 4000;


// parsowanie body
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// cookies (MUSI być przed i18n)
app.use(cookieParser());
app.use(csrfLite);
app.use(mockAuth); 

// 🌍 i18n (MUSI być przed routes)
app.use(i18nMiddleware);

// statyki
app.use("/uploads", express.static("src/public/uploads"));
app.use(express.static("src/public"));

// EJS
app.set("view engine", "ejs");
app.set("views", "./src/views");

// Strona główna
app.get("/", (req, res) => {
  res.send("Aplikacja Opakowania działa 🚀");
});

// routes
app.use("/materials", materialsRouter);
app.use("/dev", devRouter);
app.use("/tasks", tasksHistoryRouter);
app.use("/tasks", tasksRouter);



app.listen(PORT, () =>
  console.log(`Server running on port ${PORT}`)
);

if (process.env.NODE_ENV !== 'production') {
  app.use(mockAuth);
}

function requireDevSecret(req, res, next) {
  const secret = process.env.DEV_SECRET;
  if (!secret) return next(); // jeśli nie ustawione, dopuszczamy (dev convenience)
  const header = req.headers['x-dev-secret'] || req.query.devSecret;
  if (header !== secret) return res.status(401).send('Dev endpoint secret required');
  next();
}

// użycie
if (process.env.NODE_ENV === 'development') {
  app.use('/dev', requireDevSecret, devRouter);
}
