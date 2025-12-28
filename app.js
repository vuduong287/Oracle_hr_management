const express = require('express');
const bodyParser = require('body-parser');
const oracleAuth = require('./middleware/auth');
const employeeRoutes = require('./routes/employee');
const insertRoutes   = require('./routes/insert');
const deleteRoutes = require('./routes/delete');
const updateRoutes = require('./routes/update');
const app = express();
app.use(bodyParser.json());
const cors = require('cors');

app.use(cors());

// API cần đăng nhập Oracle
app.use('/api/employees', oracleAuth, insertRoutes);
app.use('/api/employees', oracleAuth,employeeRoutes);
app.use('/api/employees', oracleAuth, deleteRoutes);
app.use('/api/employees', oracleAuth, updateRoutes);
app.listen(3000, () => {
  console.log('Server running on port 3000');
});
