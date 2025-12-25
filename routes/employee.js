const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  const conn = req.db;

  try {
    const result = await conn.execute(
      `
      SELECT
       *
      FROM hr_n5.employees
      ORDER BY emp_id
      `,
      [],
      { outFormat: require('oracledb').OUT_FORMAT_OBJECT }
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Query error:', err);
    res.status(500).json({ message: 'Query failed' });
  } finally {
    if (conn) {
      try {
        await conn.close();
      } catch (e) {}
    }
  }
});

module.exports = router;
