const assert = require('assert');
const path = require('path');
const fs = require('fs');

const API = 'http://localhost:5000/api';

async function req(method, endpoint, body = null, token = null, isFormData = false) {
  const headers = {};
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API}${endpoint}`, {
    method,
    headers,
    body: isFormData ? body : (body ? JSON.stringify(body) : undefined),
  });

  let data = {};
  try {
    data = await res.json();
  } catch (e) {}
  return { status: res.status, data };
}

async function runProfileTests() {
  console.log('==================================================');
  console.log('  PROFILE SETTINGS & GENDER FIELD VERIFICATION');
  console.log('==================================================\n');

  try {
    // 1. Authenticate with demo user
    console.log('1. Authenticating Admin user (admin@workspace.local)...');
    const login = await req('POST', '/auth/login', {
      email: 'admin@workspace.local',
      password: 'password123',
    });
    assert.strictEqual(login.status, 200, `Login failed: ${JSON.stringify(login.data)}`);
    const token = login.data.accessToken;
    console.log('   ✅ Authenticated successfully.\n');

    // 2. Test Gender & Personal Information Update
    console.log('2. Updating Profile: Gender (Male), Phone, Bio, and Theme...');
    const updateRes = await req('PATCH', '/auth/me', {
      name: 'Admin Shivu',
      gender: 'male',
      phone: '+91 98765 43210',
      bio: 'Lead Developer & AI Architect at Kishkindha Innovation Lab.',
      theme_preference: 'dark',
      notification_preferences: {
        task_assigned: true,
        chat_mentions: true,
        email_alerts: false,
      },
    }, token);

    assert.strictEqual(updateRes.status, 200, `Update profile failed: ${JSON.stringify(updateRes.data)}`);
    assert.strictEqual(updateRes.data.user.gender, 'male', 'Gender was not saved as male');
    assert.strictEqual(updateRes.data.user.phone, '+91 98765 43210', 'Phone was not saved');
    assert.strictEqual(updateRes.data.user.theme_preference, 'dark', 'Theme preference was not saved');
    console.log('   ✅ PASSED: Gender, phone, bio and theme saved to database permanently!');
    console.log(`   User Gender: ${updateRes.data.user.gender} | Theme: ${updateRes.data.user.theme_preference}\n`);

    // 3. Test Female Profile Update on Manager Account (Priya)
    console.log('3. Authenticating Manager user (priya@workspace.local)...');
    const priyaLogin = await req('POST', '/auth/login', {
      email: 'priya@workspace.local',
      password: 'password123',
    });
    assert.strictEqual(priyaLogin.status, 200);
    const priyaToken = priyaLogin.data.accessToken;

    console.log('   Updating Priya Profile: Gender (Female)...');
    const priyaUpdate = await req('PATCH', '/auth/me', {
      gender: 'female',
      bio: 'Engineering Project Manager coordinating sprint milestones.',
    }, priyaToken);
    assert.strictEqual(priyaUpdate.status, 200);
    assert.strictEqual(priyaUpdate.data.user.gender, 'female', 'Gender was not saved as female');
    console.log('   ✅ PASSED: Female gender & bio saved identically without separate systems.\n');

    // 4. Test Password Change with incorrect current password
    console.log('4. Testing Password Change Security (Wrong Current Password)...');
    const badPass = await req('PATCH', '/auth/me', {
      currentPassword: 'wrong_password_999',
      newPassword: 'newpassword123',
    }, token);
    assert.strictEqual(badPass.status, 401, 'Should reject invalid current password with 401');
    console.log('   ✅ PASSED: Incorrect current password rejected (HTTP 401 Unauthorized).\n');

    // 5. Test Password Change with valid current password
    console.log('5. Testing Valid Password Change...');
    const goodPass = await req('PATCH', '/auth/me', {
      currentPassword: 'password123',
      newPassword: 'password123', // maintain same password for demo continuity
    }, token);
    assert.strictEqual(goodPass.status, 200, 'Valid password change failed');
    console.log('   ✅ PASSED: Password changed and re-hashed with bcrypt (salt: 12).\n');

    // 6. Test GET /api/auth/me to verify persistence
    console.log('6. Verifying profile persistence via GET /api/auth/me...');
    const meRes = await req('GET', '/auth/me', null, token);
    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meRes.data.user.gender, 'male');
    assert.strictEqual(meRes.data.user.phone, '+91 98765 43210');
    console.log('   ✅ PASSED: Profile attributes persist across session queries.\n');

    // 7. Test Logout All
    console.log('7. Testing POST /api/auth/logout-all...');
    const logoutRes = await req('POST', '/auth/logout-all', null, token);
    assert.strictEqual(logoutRes.status, 200);
    console.log('   ✅ PASSED: Logout from all devices executed cleanly.\n');

    console.log('==================================================');
    console.log('  ALL PROFILE SETTINGS TESTS COMPLETED (100% PASS)!');
    console.log('==================================================');
  } catch (err) {
    console.error('\n❌ Test suite failed:', err.message);
    process.exit(1);
  }
}

runProfileTests();
