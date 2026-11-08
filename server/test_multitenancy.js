// Native fetch test suite (requires no external packages on Node.js v18+)

const API = 'http://localhost:5000/api';

async function req(method, endpoint, body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options = {
    method,
    headers,
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${API}${endpoint}`, options);
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = {};
  }
  return { status: res.status, data };
}

async function runMultiTenancyTests() {
  console.log('==================================================');
  console.log('  MULTI-TENANCY & ROLE-BASED ACCESS CONTROL TESTS');
  console.log('==================================================\n');

  try {
    const timestamp = Date.now();

    // 1. Register User A
    console.log('1. Registering User A...');
    const userA = await req('POST', '/auth/register', {
      name: 'Alice Admin',
      email: `alice_${timestamp}@company.com`,
      password: 'Password@123',
    });
    if (userA.status !== 201) throw new Error('Failed to register User A: ' + JSON.stringify(userA.data));
    const tokenA = userA.data.accessToken;
    console.log('   ✅ User A registered successfully.');

    // 2. Register User B
    console.log('2. Registering User B...');
    const userB = await req('POST', '/auth/register', {
      name: 'Bob Member',
      email: `bob_${timestamp}@company.com`,
      password: 'Password@123',
    });
    if (userB.status !== 201) throw new Error('Failed to register User B: ' + JSON.stringify(userB.data));
    const tokenB = userB.data.accessToken;
    console.log('   ✅ User B registered successfully.');

    // 3. User A creates Organization A
    console.log('3. User A creates Organization A (Alice becomes Admin)...');
    const orgA = await req('POST', '/orgs', { name: 'Alpha Corp', slug: `alpha-${timestamp}` }, tokenA);
    if (orgA.status !== 201) throw new Error('Failed to create Org A: ' + JSON.stringify(orgA.data));
    const orgAId = orgA.data.organization.id;
    console.log(`   ✅ Organization A created (ID: ${orgAId}).`);

    // 4. User B creates Organization B
    console.log('4. User B creates Organization B (Bob becomes Admin)...');
    const orgB = await req('POST', '/orgs', { name: 'Beta Industries', slug: `beta-${timestamp}` }, tokenB);
    if (orgB.status !== 201) throw new Error('Failed to create Org B: ' + JSON.stringify(orgB.data));
    const orgBId = orgB.data.organization.id;
    console.log(`   ✅ Organization B created (ID: ${orgBId}).`);

    // 5. TEST: User A attempts to access Org B (Should get 403 Forbidden)
    console.log('\n--- SECURITY TEST: Data Isolation Between Tenants ---');
    console.log('5. User A attempts to view Org B details...');
    const orgBAccess = await req('GET', `/orgs/${orgBId}`, null, tokenA);
    if (orgBAccess.status === 403) {
      console.log(`   ✅ PASSED: HTTP 403 Forbidden correctly returned! (${orgBAccess.data.error})`);
    } else {
      console.log(`   ❌ FAILED: Unexpected status ${orgBAccess.status}:`, orgBAccess.data);
    }

    // 6. User A invites User B to Org A as 'member'
    console.log('\n--- SECURITY TEST: Invitation & Role Enforcement ---');
    console.log('6. User A generates an invitation for User B with role "member"...');
    const invite = await req(
      'POST',
      `/orgs/${orgAId}/invite`,
      { email: `bob_${timestamp}@company.com`, role: 'member' },
      tokenA
    );
    if (invite.status !== 201) throw new Error('Failed to create invitation: ' + JSON.stringify(invite.data));
    const inviteToken = invite.data.invitation.token;
    console.log(`   ✅ Invitation token generated: ${invite.data.inviteLink}`);

    // 7. User B accepts the invitation to join Org A
    console.log('7. User B accepts the invitation...');
    const accept = await req('POST', `/orgs/join/${inviteToken}`, {}, tokenB);
    if (accept.status === 200) {
      console.log(`   ✅ User B joined Org A with role: "${accept.data.role}".`);
    } else {
      console.log(`   ❌ FAILED: Status ${accept.status}:`, accept.data);
    }

    // 8. TEST: Re-using the invitation link (Should get 410 Gone / Rejected)
    console.log('8. User B attempts to re-use the same invitation link...');
    const reuse = await req('POST', `/orgs/join/${inviteToken}`, {}, tokenB);
    if (reuse.status === 410) {
      console.log(`   ✅ PASSED: HTTP 410 Gone correctly returned! (${reuse.data.error})`);
    } else {
      console.log(`   ❌ FAILED: Reused invite accepted! Status: ${reuse.status}`);
    }

    // 9. TEST: Member tries an Admin-only action (Create Department) -> Should get 403 Forbidden
    console.log('9. User B (Member in Org A) tries to create a Department (Admin-only)...');
    const adminAction = await req(
      'POST',
      `/orgs/${orgAId}/departments`,
      { name: 'Engineering Dept' },
      tokenB
    );
    if (adminAction.status === 403) {
      console.log(`   ✅ PASSED: HTTP 403 Forbidden correctly returned! (${adminAction.data.error})`);
    } else {
      console.log(`   ❌ FAILED: Member allowed admin action! Status: ${adminAction.status}`);
    }

    // 10. TEST: Unauthenticated request (Should get 401)
    console.log('\n--- SECURITY TEST: Authentication Guard ---');
    console.log('10. Requesting Org A with no token...');
    const unauth = await req('GET', `/orgs/${orgAId}`, null, null);
    if (unauth.status === 401) {
      console.log(`   ✅ PASSED: HTTP 401 Unauthorized correctly returned! (${unauth.data.error})`);
    } else {
      console.log(`   ❌ FAILED: Unauthenticated access permitted! Status: ${unauth.status}`);
    }

    console.log('\n==================================================');
    console.log('  ALL MULTI-TENANCY & RBAC TESTS COMPLETED!');
    console.log('==================================================\n');
  } catch (err) {
    console.error('Test execution error:', err.message);
  }
}

runMultiTenancyTests();
