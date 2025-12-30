const express = require('express');
const router = express.Router();
const { getHRN5Connection } = require('../db/oracleAdmin');
const oracledb = require('oracledb');

/* ===============================
   DELETE EMPLOYEE + DROP USER
   DELETE /api/employees/:emp_id
================================ */
router.delete('/:emp_id', async (req, res) => {
  const userConn = req.db;   // HR đang login
  let HRN5Conn;
  let sessionsKilled = 0;

  const emp_id = req.params.emp_id;
  const oracle_username = `N5_${emp_id}`;

  try {
    /* ===============================
       (1) Kiểm tra employee tồn tại
    =============================== */
    const rs = await userConn.execute(
      `SELECT emp_id FROM hr_n5.employees WHERE emp_id = :id`,
      { id: emp_id }
    );

    if (rs.rows.length === 0) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    /* ===============================
       (2) KILL SESSION TRƯỚC KHI DROP
    =============================== */
    HRN5Conn = await getHRN5Connection();

    try {
      const checkSessions = await HRN5Conn.execute(
        `
        SELECT sid, serial#, username
        FROM v$session
        WHERE username = UPPER(:username)
          AND type = 'USER'
        `,
        { username: oracle_username },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      for (const s of checkSessions.rows) {
        try {
          await HRN5Conn.execute(
            `ALTER SYSTEM KILL SESSION '${s.SID},${s["SERIAL#"]}' IMMEDIATE`
          );
          sessionsKilled++;
        } catch (e) {
          console.warn(`Kill session failed SID=${s.SID}`, e.message);
        }
      }

      if (sessionsKilled > 0) {
        await new Promise(r => setTimeout(r, 1000));
      }

    } catch (e) {
      console.warn('Cannot access v$session – skip kill session:', e.message);
    }

    /* ===============================
       (3) DELETE EMPLOYEE
    =============================== */
    const delResult = await userConn.execute(
      `DELETE FROM hr_n5.employees WHERE emp_id = :id`,
      { id: emp_id },
      { autoCommit: true }
    );

    if (delResult.rowsAffected !== 1) {
      return res.status(400).json({ message: 'Delete employee failed' });
    }

    /* ===============================
       (4) CHECK LẠI SESSION
    =============================== */
    async function waitUntilNoSession(conn, username, retry = 5) {
      for (let i = 0; i < retry; i++) {
        const rs = await conn.execute(
          `SELECT COUNT(*) cnt FROM v$session WHERE username = UPPER(:u)`,
          { u: username },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (rs.rows[0].CNT === 0) return true;

        await new Promise(r => setTimeout(r, 1000)); // chờ 1s
      }
      return false;
    }
    if (!(await waitUntilNoSession(HRN5Conn, oracle_username))) {
    const finalCheck = await HRN5Conn.execute(
      `SELECT COUNT(*) cnt FROM v$session WHERE username = UPPER(:u)`,
      { u: oracle_username },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (finalCheck.rows[0].CNT > 0) {
      return res.status(400).json({
        message: `User ${oracle_username} still has active sessions`
      });
    }}

    /* ===============================
       (5) DROP USER
    =============================== */
    await HRN5Conn.execute(`DROP USER ${oracle_username} CASCADE`);
    await HRN5Conn.commit();

    res.json({
      message: 'Employee deleted & Oracle user dropped',
      emp_id,
      oracle_user: oracle_username,
      sessions_killed: sessionsKilled
    });

  } catch (err) {
    console.error('Delete error:', err);

    if (err.message?.includes('ORA-01940')) {
      return res.status(400).json({
        message: 'User is currently logged in',
        error: err.message
      });
    }

    res.status(500).json({
      message: 'Delete employee failed',
      error: err.message
    });

  } finally {
    if (HRN5Conn) {
      try { await HRN5Conn.close(); } catch {}
    }
  }
});

module.exports = router;
