    const { getConnection } = require('../db/oracle');

async function oracleAuth(req, res, next) {
  const { username, password } = req.headers;

  if (!username || !password) {
    return res.status(401).json({ message: 'Missing credentials' });
  }

  try {
    const conn = await getConnection(username, password);
    req.db = conn;
    req.oracleUser = username;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Oracle login failed' });
  }
}

module.exports = oracleAuth;
