// routes/insert.js
const express = require('express');
const router = express.Router();
const {getHRADMINConnection, getHRN5Connection  } = require('../db/oracleAdmin');
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


/* ===============================
   CREATE EMPLOYEE + CREATE USER
================================ */
router.post('/create', async (req, res) => {
  const userConn = req.db;   // user đang login
  let OLSConn;             // HR_ADMIN
  let HRN5Conn;           // HR_N5
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

  const oracle_username = 'N5_' + emp_id;

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
    
    );


    /* ===============================
       (2) CREATE ORACLE USER (HR_N5)
    =============================== */
    HRN5Conn = await getHRN5Connection();

    await HRN5Conn.execute(
      `CREATE USER ${oracle_username} IDENTIFIED BY "${oracle_password}" PROFILE prof_10_min`
    );

    await HRN5Conn.execute(
      `GRANT CREATE SESSION TO ${oracle_username}`
    );

    await HRN5Conn.execute(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON hr_n5.employees TO ${oracle_username}`
    );
    await HRN5Conn.execute(
      `GRANT SELECT, UPDATE ON hr_n5.departments TO ${oracle_username}`
    );
    await HRN5Conn.execute(
      `GRANT SELECT ON hr_n5.FGA_EMP_DEL TO ${oracle_username}`
    );
     await HRN5Conn.execute(
      `GRANT SELECT ON hr_n5.FGA_EMP_INS TO ${oracle_username}`
    );
     await HRN5Conn.execute(
      `GRANT SELECT ON hr_n5.FGA_EMP_UPD TO ${oracle_username}`
    );
    const labels = getUserLabelsByDept(dept);
    OLSConn = await getHRADMINConnection();
    await OLSConn.execute(
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

    await userConn.commit();
    await HRN5Conn.commit();
    await OLSConn.commit();

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
  if (OLSConn) {
    try { await OLSConn.close(); } catch {}
  }
  if (HRN5Conn) {
    try { await HRN5Conn.close(); } catch {}
  }
 }});

module.exports = router;