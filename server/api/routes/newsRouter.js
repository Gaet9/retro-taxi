// require files where requests handlers are defined
const express = require("express");
const newsQueries = require("../db/newsQueries");
const verifyToken = require("../middlewares/auth-middleware");
const verifyAdmin = require("../middlewares/admin-middleware");

const router = express.Router();

// admin only
router.post("/send", verifyToken, verifyAdmin, newsQueries.send_newsletter);
router.post("/generate", verifyToken, verifyAdmin, newsQueries.create_newsletter);

module.exports = router;
