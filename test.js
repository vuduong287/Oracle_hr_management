const oracledb = require("oracledb");

async function testConnection() {
  let connection;

  try {
    connection = await oracledb.getConnection({
      user: "hr_emp_201",
      password: "123",
      connectString: "localhost:1521/FREEPDB1"
    });

    console.log("✅ Kết nối Oracle thành công!");

    // Test query
    const result = await connection.execute(
      `SELECT * FROM hr_n5.employees`
    );

    console.log("📅 SYSDATE từ Oracle:", result.rows[0][0]);

  } catch (err) {
    console.error("❌ Lỗi kết nối Oracle:");
    console.error(err);

  } finally {
    if (connection) {
      try {
        await connection.close();
        console.log("🔒 Đã đóng kết nối");
      } catch (err) {
        console.error(err);
      }
    }
  }
}

testConnection();
