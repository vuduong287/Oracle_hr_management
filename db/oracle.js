const oracledb = require('oracledb');

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

// 1. Kết nối bằng user trung gian HR_N5
async function getHrConnection() {
  return await oracledb.getConnection({
    user: 'HR_N5',
    password: '123',               // <<< password HR_N5
    connectString: 'localhost:1521/freepdb1'
  });
}

// 2. Kiểm tra emp_id từ username

async function checkEmpIdExists(username) {
  // Lấy 3 số cuối
  const match = username.match(/(\d{3})$/);
  if (!match) return false;

  const empId = Number(match[1]);

  let conn;
  try {
    conn = await getHrConnection();

    const result = await conn.execute(
      `SELECT 1
         FROM hr_n5.employees
        WHERE emp_id = :empId`,
      { empId }
    );

    return result.rows.length > 0;
  } catch (err) {
    console.error('Check emp_id error:', err);
    return false;
  } finally {
    if (conn) await conn.close();
  }
}

// 3. Hàm connect chính (EXPORT)
async function getConnection(username, password) {
  // 3.1 Check emp_id trước
  const isValid = await checkEmpIdExists(username);

  if (!isValid) {
    throw new Error('Tài khoản không gắn với nhân viên hợp lệ');
  }

  // 3.2 Pass check → connect bằng user thật
  return await oracledb.getConnection({
    user: username,
    password: password,
    connectString: 'localhost:1521/freepdb1'
  });
}

module.exports = { getConnection };
