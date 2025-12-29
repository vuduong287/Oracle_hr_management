const express = require('express');
const router = express.Router();
const { getHRADMINConnection } = require('../db/oracleAdmin');
const oracledb = require('oracledb');

/* ===============================
   USER LABEL MAPPING
=============================== */
function getUserLabelsByDept(dept, isManager = false) {
  switch (dept.toUpperCase()) {
    case 'HR':
      return isManager
        ? { maxRead: 'L5:HR,ACCT,IT', maxWrite: 'L5:HR,ACCT,IT', minWrite: 'L1' }
        : { maxRead: 'L5:HR,ACCT,IT', maxWrite: 'L5:ACCT,IT', minWrite: 'L1' };

    case 'IT':
      return { maxRead: 'L2:IT', maxWrite: 'L2:IT', minWrite: 'L1' };

    case 'ACCT':
      return { maxRead: 'L5:HR,IT,ACCT', maxWrite: 'L5:HR,IT,ACCT', minWrite: 'L1' };

    default:
      throw new Error('Invalid department');
  }
}

router.get('/', async (req, res) => {
  const userConn = req.db;

  try {
    const rs = await userConn.execute(
      `
      SELECT
        dept_id,
        dept_name,
        manager_id
      FROM hr_n5.departments
      ORDER BY dept_id
      `,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.json({
      count: rs.rows.length,
      departments: rs.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: 'Failed to fetch departments',
      error: err.message
    });
  }
});
/* ===============================
   UPDATE MANAGER + USER LABEL
=============================== */
router.put('/:dept_id/manager', async (req, res) => {
  const userConn = req.db;
  let OLSConn;

  const { dept_id } = req.params;
  const { new_manager_id } = req.body;

  try {
    OLSConn = await getHRADMINConnection();

    /* 1️⃣ LẤY MANAGER CŨ */
    const oldMgrRs = await userConn.execute(
      `SELECT manager_id FROM hr_n5.departments WHERE dept_id = :d`,
      { d: dept_id }
    );

    if (oldMgrRs.rows.length === 0) {
      return res.status(404).json({ message: 'Department not found' });
    }

    const old_manager_id = oldMgrRs.rows[0][0];

    /* 2️⃣ UPDATE MANAGER_ID */
    const upd = await userConn.execute(
      `UPDATE hr_n5.departments SET manager_id = :m WHERE dept_id = :d`,
      { m: new_manager_id, d: dept_id },
      { autoCommit: false }
    );
    

    if (upd.rowsAffected !== 1) {
      await userConn.rollback();
      return res.status(400).json({ message: 'Update failed' });
    }

    /* 3️⃣ HẠ LABEL MANAGER CŨ */
    if (old_manager_id) {
      const rs = await userConn.execute(
        `SELECT full_name FROM hr_n5.employees WHERE emp_id = :i`,
        { i: old_manager_id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (rs.rows.length === 1) {
        const u = 'N5_' + old_manager_id;
        const l = getUserLabelsByDept(dept_id, false);

        await OLSConn.execute(
          `BEGIN
             SA_USER_ADMIN.SET_USER_LABELS(
               policy_name=>'EMP_POLICY',
               user_name=>:u,
               max_read_label=>:r,
               max_write_label=>:w,
               min_write_label=>:m
             );
           END;`,
          { u, r: l.maxRead, w: l.maxWrite, m: l.minWrite }
        );
      }
    }

    /* 4️⃣ NÂNG LABEL MANAGER MỚI */
    const newRs = await userConn.execute(
      `SELECT full_name FROM hr_n5.employees WHERE emp_id = :i`,
      { i: new_manager_id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (newRs.rows.length !== 1) {
      await userConn.rollback();
      return res.status(400).json({ message: 'New manager not found' });
    }

    const newUser = 'N5_' + new_manager_id;
    const newLabel = getUserLabelsByDept(dept_id, true);

    await OLSConn.execute(
      `BEGIN
         SA_USER_ADMIN.SET_USER_LABELS(
           policy_name=>'EMP_POLICY',
           user_name=>:u,
           max_read_label=>:r,
           max_write_label=>:w,
           min_write_label=>:m
         );
       END;`,
      { u: newUser, r: newLabel.maxRead, w: newLabel.maxWrite, m: newLabel.minWrite }
    );

    await userConn.commit();
    await OLSConn.commit();

    res.json({ message: 'Manager updated & user labels reassigned' });

  } catch (err) {
    await userConn.rollback();
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (OLSConn) await OLSConn.close();
  }
});

module.exports = router;
