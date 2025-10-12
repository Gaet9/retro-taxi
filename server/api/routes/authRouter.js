// require files where requests handlers are defined
const express = require("express");
const auth = require("../controllers/auth");

const router = express.Router();

router.post("/create-account", auth.register);
router.post("/login", auth.login);
router.post("/logout", auth.logout);

module.exports = router;
