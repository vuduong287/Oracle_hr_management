// routes/insert.js
const express = require('express');
const router = express.Router();
const { getAdminConnection } = require('../db/oracleAdmin');
/* ===============================
   HELPER FUNCTIONS
================================ */
function getUserLabelsByDept(dept) {
  switch (dept.toUpperCase()) {

    case 'HR':
      return {
        maxRead:  'L5:HR,ACCT,IT',
        maxWrite: 'L5:ACCT,IT',
        minWrite: 'L1'
      };

    case 'IT':
      return {
        maxRead:  'L2:IT',
        maxWrite: 'L2:IT',
        minWrite: 'L1'
      };

    case 'ACCT':
      return {
        maxRead:  'L5:HR,IT,ACCT',
        maxWrite: 'L5:HR,IT,ACCT',
        minWrite: 'L1'
      };

    default:
      throw new Error('Invalid department');
  }
}


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
   CREATE EMPLOYEE + CREATE USER
================================ */
router.post('/create', async (req, res) => {
  const userConn = req.db;   // user đang login
  let adminConn;             // HR_N5

  const {
    emp_id,
    full_name,
    dob,
    email,
    dept,
    salary,
    tax_code,
    oracle_password
  } = req.body;

  // validate
  if (
    !emp_id ||
    !full_name ||
    !dob ||
    !email ||
    !dept ||
    !salary ||
    !tax_code ||
    !oracle_password
  ) {
    return res.status(400).json({ message: 'Missing parameters' });
  }

  const oracle_username = normalizeUsername(full_name, emp_id);

  try {
    /* ===============================
       (1) INSERT EMPLOYEE (user)
    =============================== */
    await userConn.execute(
      `
      INSERT INTO hr_n5.employees
        (emp_id, full_name, dob, email, dept_id, salary, tax_code)
      VALUES
        (
          :emp_id,
          :full_name,
          TO_DATE(:dob, 'YYYY-MM-DD'),
          :email,
          :dept,
          :salary,
          :tax_code
        )
      `,
      {
        emp_id,
        full_name,
        dob,        // '1995-03-10'
        email,
        dept,
        salary,
        tax_code
      },
      { autoCommit: true }
    );


    /* ===============================
       (2) CREATE ORACLE USER (HR_N5)
    =============================== */
    adminConn = await getAdminConnection();

    await adminConn.execute(
      `CREATE USER ${oracle_username} IDENTIFIED BY "${oracle_password}"`
    );

    await adminConn.execute(
      `GRANT CREATE SESSION TO ${oracle_username}`
    );

    await adminConn.execute(
      `GRANT SELECT, INSERT ON hr_n5.employees TO ${oracle_username}`
    );

    const labels = getUserLabelsByDept(dept);

    await adminConn.execute(
      `
      BEGIN
        SA_USER_ADMIN.SET_USER_LABELS(
          policy_name     => 'EMP_POLICY',
          user_name       => :u,
          max_read_label  => :max_read,
          max_write_label => :max_write,
          min_write_label => :min_write
        );
      END;
      `,
      {
        u: oracle_username,
        max_read:  labels.maxRead,
        max_write: labels.maxWrite,
        min_write: labels.minWrite
      }
    );
    await adminConn.execute(
        `
        CREATE USER ${oracle_username}
        IDENTIFIED BY "${oracle_password}"
        PROFILE prof_10_min
        `
        );

    await adminConn.commit();

    res.json({
      message: 'Employee created successfully',
      emp_id,
      full_name,
      oracle_user: oracle_username,
      labels
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: 'Create employee failed',
      error: err.message
    });
  } finally {
    if (adminConn) {
      try { await adminConn.close(); } catch {}
    }
  }
});

module.exports = router;