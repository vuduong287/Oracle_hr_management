const express = require('express');
const router = express.Router();
const { getAdminConnection } = require('../db/oracleAdmin');

/*
  PUT /api/departments/:dept_id/manager
  body: { new_manager_id }
*/
function getUserLabelsByDept(dept, isManager = false) {
  switch (dept.toUpperCase()) {

    case 'HR':
      return isManager
        ? {
            // HR manager
            maxRead:  'L5:HR,ACCT,IT',
            maxWrite: 'L5:HR,ACCT,IT',
            minWrite: 'L1'
          }
        : {
            // HR staff
            maxRead:  'L5:HR,ACCT,IT',
            maxWrite: 'L5:ACCT,IT',
            minWrite: 'L1'
          };

    case 'IT':
      return {
            // IT manager
            maxRead:  'L2:IT',
            maxWrite: 'L2:IT',
            minWrite: 'L1'
          };
  

    case 'ACCT':
      return {
        // ACCT không phân manager
        maxRead:  'L5:HR,IT,ACCT',
        maxWrite: 'L5:HR,IT,ACCT',
        minWrite: 'L1'
      };

    default:
      throw new Error('Invalid department');
  }
}

router.put('/:dept_id/manager', async (req, res) => {
  const userConn = req.db;      // user đang login
  let adminConn;

  const dept_id = req.params.dept_id;
  const { new_manager_id } = req.body;

  try {
    adminConn = await getAdminConnection();

    /* ===============================
       (1) LẤY MANAGER CŨ
    =============================== */
    const oldMgrRs = await adminConn.execute(
      `
      SELECT manager_id
      FROM hr_n5.departments
      WHERE dept_id = :dept
      `,
      { dept: dept_id }
    );

    if (oldMgrRs.rows.length === 0) {
      return res.status(404).json({ message: 'Department not found' });
    }

    const old_manager_id = oldMgrRs.rows[0][0];

    /* ===============================
       (2) UPDATE MANAGER_ID
    =============================== */
    const updateResult = await adminConn.execute(
      `
      UPDATE hr_n5.departments
      SET manager_id = :new_mgr
      WHERE dept_id = :dept
      `,
      {
        new_mgr: new_manager_id,
        dept: dept_id
      },
      { autoCommit: false }
    );

    if (updateResult.rowsAffected !== 1) {
      await adminConn.rollback();
      return res.status(400).json({
        message: 'Update manager failed'
      });
    }

    /* ===============================
       (3) HẠ USER LABEL MANAGER CŨ
    =============================== */
    if (old_manager_id) {
      const oldUserRs = await adminConn.execute(
        `
        SELECT full_name
        FROM hr_n5.employees
        WHERE emp_id = :id
        `,
        { id: old_manager_id },
        { outFormat: require('oracledb').OUT_FORMAT_OBJECT }
      );

      if (oldUserRs.rows.length === 1) {
        const oldUser = normalizeUsername(
          oldUserRs.rows[0].FULL_NAME,
          old_manager_id
        );

        const oldLabels = getUserLabelsByDept(dept_id, false);

        await adminConn.execute(
          `
          BEGIN
            SA_USER_ADMIN.SET_USER_LABELS(
              policy_name     => 'EMP_POLICY',
              user_name       => :u,
              max_read_label  => :r,
              max_write_label => :w,
              min_write_label => :m
            );
          END;
          `,
          {
            u: oldUser,
            r: oldLabels.maxRead,
            w: oldLabels.maxWrite,
            m: oldLabels.minWrite
          }
        );
      }
    }

    /* ===============================
       (4) NÂNG USER LABEL MANAGER MỚI
    =============================== */
    const newUserRs = await adminConn.execute(
      `
      SELECT full_name
      FROM hr_n5.employees
      WHERE emp_id = :id
      `,
      { id: new_manager_id },
      { outFormat: require('oracledb').OUT_FORMAT_OBJECT }
    );

    if (newUserRs.rows.length !== 1) {
      await adminConn.rollback();
      return res.status(400).json({
        message: 'New manager not found'
      });
    }

    const newUser = normalizeUsername(
      newUserRs.rows[0].FULL_NAME,
      new_manager_id
    );

    const newLabels = getUserLabelsByDept(dept_id, true);

    await adminConn.execute(
      `
      BEGIN
        SA_USER_ADMIN.SET_USER_LABELS(
          policy_name     => 'EMP_POLICY',
          user_name       => :u,
          max_read_label  => :r,
          max_write_label => :w,
          min_write_label => :m
        );
      END;
      `,
      {
        u: newUser,
        r: newLabels.maxRead,
        w: newLabels.maxWrite,
        m: newLabels.minWrite
      }
    );

    await adminConn.commit();

    res.json({
      message: 'Manager updated & user labels reassigned successfully',
      department: dept_id,
      old_manager: old_manager_id,
      new_manager: new_manager_id
    });

  } catch (err) {
    if (adminConn) await adminConn.rollback();
    console.error(err);
    res.status(500).json({
      message: 'Update manager failed',
      error: err.message
    });
  } finally {
    if (adminConn) {
      try { await adminConn.close(); } catch {}
    }
  }
});

module.exports = router;
