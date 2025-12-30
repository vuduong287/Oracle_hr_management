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
    } catch (error) {
        console.error('Oracle auth error:', error);
        res.status(403).json({
            message: 'Authentication failed',
            error: error.message
        });
    }
}

module.exports = oracleAuth;
