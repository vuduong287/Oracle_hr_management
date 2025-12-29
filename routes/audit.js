const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');

/* ===============================
   HELPER: extract emp_id from username
   vd: phamvankhang_202 -> 202
=============================== */
function getEmpIdFromUsername(username) {
  const match = username.match(/(\d{3})$/);
  return match ? Number(match[1]) : null;
}

/* ===============================
   CHECK: HR MANAGER ONLY
=============================== */
async function isHRManager(conn, empId) {
  const rs = await conn.execute(
    `
    SELECT 1
    FROM hr_n5.departments
    WHERE dept_id = 'HR'
      AND manager_id = :id
    `,
    { id: empId }
  );

  return rs.rows.length === 1;
}

/* ===============================
   GET AUDIT LOGS
   GET /api/audit
=============================== */
router.get('/', async (req, res) => {
  const conn = req.db;
  const oracleUser = req.oracleUser; // set trong oracleAuth

  try {
    /* 1️⃣ LẤY EMP_ID TỪ USERNAME */
    const empId = getEmpIdFromUsername(oracleUser);

    if (!empId) {
      return res.status(403).json({
        message: 'Invalid Oracle username format'
      });
    }

    /* 2️⃣ CHECK HR MANAGER */
    const allowed = await isHRManager(conn, empId);
    if (!allowed) {
      return res.status(403).json({
        message: 'Access denied: HR Manager only'
      });
    }

    /* 3️⃣ QUERY AUDIT TABLES */
    const ins = await conn.execute(
      `
      SELECT audit_id, db_user, event_time
      FROM hr_n5.fga_emp_ins
      ORDER BY event_time DESC
      `,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const upd = await conn.execute(
      `
      SELECT audit_id, db_user, event_time
      FROM hr_n5.fga_emp_upd
      ORDER BY event_time DESC
      `,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const del = await conn.execute(
      `
      SELECT audit_id, db_user, event_time
      FROM hr_n5.fga_emp_del
      ORDER BY event_time DESC
      `,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    /* 4️⃣ RESPONSE */
    res.json({
      insert_audit: ins.rows,
      update_audit: upd.rows,
      delete_audit: del.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: 'Failed to fetch audit logs',
      error: err.message
    });
  }
    finally {
        try { await conn.close(); } catch {}
    }
});

module.exports = router;
