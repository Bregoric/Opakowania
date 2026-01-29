// src/server/middleware/mockAuth.js
// PROSTY MOCK AUTH do dev. W prod podmień na prawdziwy middleware.
export default function mockAuth(req, res, next) {
    if (process.env.NODE_ENV !== 'production') {
      // Jeśli chcesz skokowo testować różnych userów, ustaw ?asUser=UUID w URL
      const asUser = req.query.asUser || process.env.DEV_DEFAULT_USER;
      if (asUser) {
        req.user = { id: asUser, locale: req.cookies?.lang || 'pl' };
      } else {
        // fallback — prosty stały mock user (możesz ustawić DEV_DEFAULT_USER w .env)
        req.user = { id: '00000000-0000-0000-0000-000000000001', locale: 'pl' };
      }
    }
    next();
  }
  