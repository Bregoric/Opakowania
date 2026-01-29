// src/server/middleware/csrfLite.js
import crypto from 'crypto';

export default function csrfLite(req, res, next) {
  // używamy cookie 'csrfToken' (nie secure dla dev)
  let token = req.cookies?.csrfToken;
  if (!token) {
    token = crypto.randomBytes(16).toString('hex');
    // cookie na sesję, secure=false w dev
    res.cookie('csrfToken', token, { httpOnly: false }); // httpOnly false => klient JS widzi token
  }
  // expose to views
  res.locals.csrfToken = token;
  next();
}
