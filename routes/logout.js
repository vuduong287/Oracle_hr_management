// routes/logout.js
const express = require('express');
const router = express.Router();

router.post('/', async (req, res) => {
  const conn = req.db;
  const oracleUser = req.oracleUser;

  try {
    // Đóng connection Oracle
    if (conn) {
      await conn.close();
      console.log(`Oracle connection closed for user: ${oracleUser}`);
    }

    res.json({
      message: 'Logged out successfully',
      user: oracleUser
    });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({
      message: 'Logout failed',
      error: err.message
    });
  }
});

module.exports = router;