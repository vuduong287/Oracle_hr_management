const oracledb = require('oracledb');

async function getAdminConnection() {
  return await oracledb.getConnection({
    user: 'HR_N5',
    password: '123',
    connectString: 'localhost:1521/freepdb1'
  });
}

module.exports = { getAdminConnection };
