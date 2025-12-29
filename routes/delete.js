const express = require('express');
const router = express.Router();
const { getHRN5Connection } = require('../db/oracleAdmin');
const oracledb = require('oracledb');
/* ===============================
   HELPER: normalize username
   (PHẢI GIỐNG LÚC CREATE)
================================ */


/* ===============================
   DELETE EMPLOYEE + DROP USER
   DELETE /api/employees/:emp_id
================================ */
router.delete('/:emp_id', async (req, res) => {
  const userConn = req.db;   // user đang login (HR)
  let HRN5Conn;

  const emp_id = req.params.emp_id;

  try {
    /* ===============================
       (1) Lấy thông tin employee
    =============================== */
    const result = await userConn.execute(
      `
      SELECT emp_id, full_name
      FROM hr_n5.employees
      WHERE emp_id = :id
      `,
      { id: emp_id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'Employee not found'
      });
    }

    const full_name = result.rows[0].FULL_NAME;

    const oracle_username = 'N5_' + emp_id;

    /* ===============================
       (2) Xóa dữ liệu employee
    =============================== */
    await userConn.execute(
      `DELETE FROM hr_n5.employees WHERE emp_id = :id`,
      { id: emp_id },
      { autoCommit: true }
    );

    /* ===============================
       (3) DROP ORACLE USER (CASCADE)
    =============================== */
    HRN5Conn = await getHRN5Connection();

    await HRN5Conn.execute(
      `DROP USER ${oracle_username} CASCADE`
    );

    // DDL auto-commit, commit thêm cho chắc
    await HRN5Conn.commit();

    res.json({
      message: 'Employee and Oracle user deleted successfully',
      emp_id,
      oracle_user: oracle_username
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: 'Delete employee failed',
      error: err.message
    });
  } finally {
    if (HRN5Conn) {
      try { await HRN5Conn.close(); } catch {}
    }
  }
});

module.exports = router;
