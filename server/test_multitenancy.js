const axios = require('axios');

const API = 'http://localhost:5000/api';

async function runMultiTenancyTests() {
  console.log('==================================================');
  console.log('  MULTI-TENANCY & ROLE-BASED ACCESS CONTROL TESTS');
  console.log('==================================================\n');

  try {
    const timestamp = Date.now();

    // 1. Register User A
    console.log('1. Registering User A...');
    const userARes = await axios.post(`${API}/auth/register`, {
      name: 'Alice Admin',
      email: `alice_${timestamp}@company.com`,
      password: 'Password@123',
    });
    const tokenA = userARes.data.accessToken;
    console.log('   ✅ User A registered.');

    // 2. Register User B
    console.log('2. Registering User B...');
    const userBRes = await axios.post(`${API}/auth/register`, {
      name: 'Bob Member',
      email: `bob_${timestamp}@company.com`,
      password: 'Password@123',
    });
    const tokenB = userBRes.data.accessToken;
    console.log('   ✅ User B registered.');

    // 3. User A creates Organization A
    console.log('3. User A creates Organization A (Alice becomes Admin)...');
    const orgARes = await axios.post(
      `${API}/orgs`,
      { name: 'Alpha Corp', slug: `alpha-${timestamp}` },
      { headers: { Authorization: `Bearer ${tokenA}` } }
    );
    const orgAId = orgARes.data.organization.id;
    console.log(`   ✅ Organization A created (ID: ${orgAId}).`);

    // 4. User B creates Organization B
    console.log('4. User B creates Organization B (Bob becomes Admin)...');
    const orgBRes = await axios.post(
      `${API}/orgs`,
      { name: 'Beta Industries', slug: `beta-${timestamp}` },
      { headers: { Authorization: `Bearer ${tokenB}` } }
    );
    const orgBId = orgBRes.data.organization.id;
    console.log(`   ✅ Organization B created (ID: ${orgBId}).`);

    // 5. TEST: User A attempts to access Org B (Should get 403 Forbidden)
    console.log('\n--- SECURITY TEST: Data Isolation Between Tenants ---');
    console.log('5. User A tries to access Org B data...');
    try {
      await axios.get(`${API}/orgs/${orgBId}`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      console.log('   ❌ FAILED: User A was allowed to view Org B!');
    } catch (err) {
      if (err.response?.status === 403) {
        console.log(`   ✅ PASSED: HTTP 403 Forbidden correctly returned! (${err.response.data.error})`);
      } else {
        console.log(`   ⚠️ Unexpected status: ${err.response?.status}`);
      }
    }

    // 6. User A invites User B to Org A as 'member'
    console.log('\n--- SECURITY TEST: Invitation & Role Enforcement ---');
    console.log('6. User A generates an invitation for User B with role "member"...');
    const inviteRes = await axios.post(
      `${API}/orgs/${orgAId}/invite`,
      { email: `bob_${timestamp}@company.com`, role: 'member' },
      { headers: { Authorization: `Bearer ${tokenA}` } }
    );
    const inviteToken = inviteRes.data.invitation.token;
    console.log(`   ✅ Invitation generated: ${inviteRes.data.inviteLink}`);

    // 7. User B accepts the invitation to join Org A
    console.log('7. User B accepts the invitation...');
    const acceptRes = await axios.post(
      `${API}/orgs/join/${inviteToken}`,
      {},
      { headers: { Authorization: `Bearer ${tokenB}` } }
    );
    console.log(`   ✅ User B joined Org A with role: "${acceptRes.data.role}".`);

    // 8. TEST: Re-using the invitation link (Should get 410 Gone / Rejected)
    console.log('8. User B attempts to re-use the same invitation link...');
    try {
      await axios.post(
        `${API}/orgs/join/${inviteToken}`,
        {},
        { headers: { Authorization: `Bearer ${tokenB}` } }
      );
      console.log('   ❌ FAILED: Expired/used invitation was accepted again!');
    } catch (err) {
      if (err.response?.status === 410) {
        console.log(`   ✅ PASSED: HTTP 410 correctly returned! (${err.response.data.error})`);
      } else {
        console.log(`   ⚠️ Unexpected status: ${err.response?.status}`);
      }
    }

    // 9. TEST: Member tries an Admin-only action (Create Department) -> Should get 403 Forbidden
    console.log('9. User B (Member in Org A) tries to create a Department (Admin-only)...');
    try {
      await axios.post(
        `${API}/orgs/${orgAId}/departments`,
        { name: 'Engineering' },
        { headers: { Authorization: `Bearer ${tokenB}` } }
      );
      console.log('   ❌ FAILED: Member was allowed to perform Admin action!');
    } catch (err) {
      if (err.response?.status === 403) {
        console.log(`   ✅ PASSED: HTTP 403 Forbidden correctly returned! (${err.response.data.error})`);
      } else {
        console.log(`   ⚠️ Unexpected status: ${err.response?.status}`);
      }
    }

    // 10. TEST: Unauthenticated request (Should get 401)
    console.log('\n--- SECURITY TEST: Authentication Guard ---');
    console.log('10. Requesting Org A with no token...');
    try {
      await axios.get(`${API}/orgs/${orgAId}`);
      console.log('   ❌ FAILED: Unauthenticated request was allowed!');
    } catch (err) {
      if (err.response?.status === 401) {
        console.log(`   ✅ PASSED: HTTP 401 Unauthorized correctly returned! (${err.response.data.error})`);
      }
    }

    console.log('\n==================================================');
    console.log('  ALL MULTI-TENANCY & RBAC TESTS COMPLETED!');
    console.log('==================================================\n');
  } catch (err) {
    console.error('Test execution error:', err.message);
  }
}

runMultiTenancyTests();
