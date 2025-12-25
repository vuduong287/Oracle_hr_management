const oracledb = require('oracledb');

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

async function getConnection(username, password) {
  return await oracledb.getConnection({
    user: username,
    password: password,
    connectString: "localhost:1521/freepdb1"
  });
}

module.exports = { getConnection };
