const express = require('express');
const bodyParser = require('body-parser');
const oracleAuth = require('./middleware/auth');
const employeeRoutes = require('./routes/employee');
const insertRoutes   = require('./routes/insert');
const deleteRoutes = require('./routes/delete');
const updateRoutes = require('./routes/update');
const updatedeptmanagerRoutes = require('./routes/departments');
const app = express();
app.use(bodyParser.json());
const cors = require('cors');
const path = require('path');

app.use(cors());
/* ===============================
   SERVE FRONTEND (index.html)
=============================== */
app.use(express.static(path.join(__dirname, 'frontend')));

/* Trang chủ */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});
// API cần đăng nhập Oracle
app.use('/api/employees', oracleAuth, insertRoutes);
app.use('/api/employees', oracleAuth,employeeRoutes);
app.use('/api/employees', oracleAuth, deleteRoutes);
app.use('/api/employees', oracleAuth, updateRoutes);
app.use('/api/departments', oracleAuth, updatedeptmanagerRoutes);
app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
