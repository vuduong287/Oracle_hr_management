const express = require('express');
const router = express.Router();
const { getAdminConnection } = require('../db/oracleAdmin');

/* ===============================
   HELPER: normalize username
   (PHẢI GIỐNG LÚC CREATE)
================================ */
function normalizeUsername(fullName, empId) {
  const noAccent = fullName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');

  const clean = noAccent
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  return `${clean}_${empId}`;
}

/* ===============================
   DELETE EMPLOYEE + DROP USER
   DELETE /api/employees/:emp_id
================================ */
router.delete('/:emp_id', async (req, res) => {
  const userConn = req.db;   // user đang login (HR)
  let adminConn;

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
      { id: emp_id }
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'Employee not found'
      });
    }

    const full_name = result.rows[0][1];
    const oracle_username = normalizeUsername(full_name, emp_id);

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
    adminConn = await getAdminConnection();

    await adminConn.execute(
      `DROP USER ${oracle_username} CASCADE`
    );

    // DDL auto-commit, commit thêm cho chắc
    await adminConn.commit();

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
    if (adminConn) {
      try { await adminConn.close(); } catch {}
    }
  }
});

module.exports = router;
