const express = require('express');
const router = express.Router();
const {getHRADMINConnection,getHRN5Connection } = require('../db/oracleAdmin');

/* =================================================
   USER LABEL mapping (đúng bộ bạn đang dùng)
================================================= */
function getUserLabelsByDept(dept) {
  switch (dept.toUpperCase()) {

    case 'HR':
      return {
        // HR staff (manager HR sẽ xử lý riêng)
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



/* =================================================
   UPDATE EMPLOYEE
   PUT /api/employees/:emp_id
================================================= */
router.put('/:emp_id', async (req, res) => {
  const userConn = req.db;   // user đang login
  let OLSConn;
  let HRN5Conn;

  const emp_id = req.params.emp_id;

  const {
    full_name,
    dob,
    email,
    dept_id,
    salary,
    tax_code
  } = req.body;

  try {
    /* =================================================
       (1) LẤY DỮ LIỆU HIỆN TẠI
    ================================================= */
    const rs = await userConn.execute(
      `
      SELECT full_name, dept_id
      FROM hr_n5.employees
      WHERE emp_id = :id
      `,
        { id: emp_id },
        { outFormat: require('oracledb').OUT_FORMAT_OBJECT }
    );

    if (rs.rows.length === 0) {
      return res.status(404).json({
        message: 'Employee not found'
      });
    }

    const oldName = rs.rows[0].FULL_NAME;
    const oldDept = rs.rows[0].DEPT_ID;

    /* =================================================
       (2) CHECK: NẾU ĐANG LÀ MANAGER → KHÔNG CHO UPDATE
    ================================================= */
    HRN5Conn = await getHRN5Connection();
    const mgrCheck = await HRN5Conn.execute(
      `
      SELECT COUNT(*)
      FROM hr_n5.departments
      WHERE manager_id = :id
      `,
      { id: emp_id }
    );

    if (mgrCheck.rows[0][0] > 0) {
      return res.status(403).json({
        message: 'Cannot update employee because this employee is currently a department manager'
      });
    }
    // dob từ frontend
    let dobValue = dob;

    // Nếu là ISO string -> cắt YYYY-MM-DD
    if (typeof dob === "string" && dob.includes("T")) {
      dobValue = dob.substring(0, 10); // "1995-03-08"
}


    /* =================================================
       (3) UPDATE TẤT CẢ FIELD
    ================================================= */
     const updateResult = await userConn.execute(
      `
      UPDATE hr_n5.employees
      SET
        full_name = NVL(:full_name, full_name),
        dob       = NVL(TO_DATE(:dob, 'YYYY-MM-DD'), dob),
        email     = NVL(:email, email),
        dept_id   = NVL(:dept_id, dept_id),
        salary    = NVL(:salary, salary),
        tax_code  = NVL(:tax_code, tax_code)
      WHERE emp_id = :id  
      `,
      {
        full_name,
        dob,
        email,
        dept_id,
        salary,
        tax_code,
        id: emp_id
      },
      { autoCommit: true }
    );
    if (updateResult.rowsAffected !== 1) {
      return res.status(400).json({
        message: 'Update failed – no row was updated'
      });
    }
    /* =================================================
       (4) CHỈ KHI ĐỔI DEPT → GÁN LẠI USER LABEL
    ================================================= */
    if (  updateResult.rowsAffected === 1 &&
        dept_id &&
        dept_id !== oldDept) {

      const oracleUser = 'N5_' + emp_id;
      const labels = getUserLabelsByDept(dept_id);

    
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
          u: oracleUser,
          max_read:  labels.maxRead,
          max_write: labels.maxWrite,
          min_write: labels.minWrite
        }
      );

      await OLSConn.commit();
    }

    res.json({
      message: 'Employee updated successfully',
      emp_id,
      dept_changed: dept_id && dept_id !== oldDept
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: 'Update employee failed',
      error: err.message
    });
  } finally {
  if (OLSConn) {
    try { await OLSConn.close(); } catch {}
  }
  if (HRN5Conn) {
    try { await HRN5Conn.close(); } catch {}
  }
}

});

module.exports = router;
