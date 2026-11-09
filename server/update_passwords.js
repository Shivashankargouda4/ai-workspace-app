// Script to update demo account passwords safely
const bcrypt = require('bcryptjs');
const db = require('./src/config/db');

async function updatePasswords() {
  const newPassword = process.argv[2] || 'ShivaSecure2026!';
  console.log(`Hashing password: "${newPassword}" with 12 bcrypt salt rounds...`);
  const hash = await bcrypt.hash(newPassword, 12);

  const res = await db.query(
    'UPDATE users SET password_hash = $1 WHERE email LIKE $2 RETURNING id, name, email',
    [hash, '%@workspace.local']
  );

  console.log(`\nSuccessfully updated ${res.rows.length} accounts:`);
  res.rows.forEach(u => console.log(` - [ID ${u.id}] ${u.name} (${u.email})`));
  console.log(`\nNew login password for all 3 demo accounts is: ${newPassword}\n`);
  process.exit(0);
}

updatePasswords().catch(err => {
  console.error('Password update failed:', err);
  process.exit(1);
});
