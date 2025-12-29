const oracledb = require('oracledb');

async function getHRN5Connection() {
  return await oracledb.getConnection({
    user: 'HR_N5',
    password: '123',
    connectString: 'localhost:1521/freepdb1'
  });
}
async function getHRADMINConnection() {
  return await oracledb.getConnection({
    user: 'HR_ADMIN',
    password: '123',
    connectString: 'localhost:1521/freepdb1'
  });
}

module.exports = { getHRADMINConnection, getHRN5Connection };
