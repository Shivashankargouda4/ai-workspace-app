// Script to update demo account passwords safely
const bcrypt = require('bcryptjs');
const db = require('./src/config/db');

async function updatePasswords() {
  const newPassword = process.argv[2] || process.env.DEMO_PASSWORD;
  if (!newPassword || newPassword.length < 8) {
    console.error('Provide password via DEMO_PASSWORD env var or CLI arg (min 8 chars).');
    process.exit(1);
  }
  console.log('Hashing new password with 12 bcrypt salt rounds...');
  const hash = await bcrypt.hash(newPassword, 12);

  const res = await db.query(
    'UPDATE users SET password_hash = $1 WHERE email LIKE $2 RETURNING id, name, email',
    [hash, '%@workspace.local']
  );

  console.log(`\nSuccessfully updated ${res.rows.length} account(s):`);
  res.rows.forEach(u => console.log(` - [ID ${u.id}] ${u.name} (${u.email})`));
  console.log('\nPasswords updated successfully (value not echoed for security).\n');
  process.exit(0);
}

updatePasswords().catch(err => {
  console.error('Password update failed:', err);
  process.exit(1);
});
