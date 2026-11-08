// Native test suite for Analytics API & Metrics Verification
const API = 'http://localhost:5000/api';

async function req(method, endpoint, body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try {
    data = await res.json();
  } catch (e) {}
  return { status: res.status, data };
}

async function runAnalyticsTests() {
  console.log('==================================================');
  console.log('  ANALYTICS & METRICS VERIFICATION TESTS');
  console.log('==================================================\n');

  try {
    // 1. Security Check: Unauthenticated request must be blocked
    console.log('1. Testing unauthenticated access to /api/analytics/overview/1...');
    const unauth = await req('GET', '/analytics/overview/1');
    if (unauth.status === 401) {
      console.log('   ✅ PASSED: HTTP 401 Unauthorized correctly blocked unauthenticated access!\n');
    } else {
      console.log('   ❌ FAILED: Unexpected status code:', unauth.status);
    }

    // 2. Login with Org 1 Member (admin@workspace.local or rahul@workspace.local)
    console.log('2. Authenticating Org 1 Member (admin@workspace.local)...');
    let login = await req('POST', '/auth/login', {
      email: 'admin@workspace.local',
      password: 'password123',
    });
    if (login.status !== 200) {
      // Try rahul@workspace.local
      login = await req('POST', '/auth/login', {
        email: 'rahul@workspace.local',
        password: 'password123',
      });
    }
    if (login.status !== 200) throw new Error('Login failed: ' + JSON.stringify(login.data));
    const token = login.data.accessToken;
    console.log('   ✅ Authenticated successfully as Org 1 member.\n');

    // 3. Fetch analytics overview
    console.log('3. Requesting GET /api/analytics/overview/1...');
    const analytics = await req('GET', '/analytics/overview/1', null, token);
    if (analytics.status === 200) {
      console.log('   ✅ PASSED: HTTP 200 OK received with live data!');
      const { summary, tasks_by_status, tasks_by_priority, member_workload, ml_risk_distribution } = analytics.data;
      
      console.log('\n--- KPI Summary ---');
      console.log(`   Total Tasks:      ${summary.total_tasks}`);
      console.log(`   Completed Tasks:  ${summary.completed_tasks}`);
      console.log(`   Completion Rate:  ${summary.completion_rate}%`);
      console.log(`   Overdue Tasks:    ${summary.overdue_tasks}`);

      console.log('\n--- Status Distribution ---');
      (tasks_by_status || []).forEach(s => console.log(`   - ${s.status}: ${s.count}`));

      console.log('\n--- Priority Distribution ---');
      (tasks_by_priority || []).forEach(p => console.log(`   - ${p.priority}: ${p.count}`));

      console.log('\n--- Member Workload ---');
      (member_workload || []).forEach(m => console.log(`   - ${m.name}: ${m.task_count} active tasks`));

      console.log('\n--- ML Risk Predictions Distribution ---');
      if (ml_risk_distribution && ml_risk_distribution.length > 0) {
        ml_risk_distribution.forEach(r => console.log(`   - ${r.risk_level}: ${r.count}`));
      } else {
        console.log('   - (No predictions stored yet; will populate upon task updates)');
      }
    } else {
      console.log('   ❌ FAILED:', analytics.status, analytics.data);
    }

    // 4. Multi-Tenant Isolation Test: Request an organization where user has no membership
    console.log('\n--- SECURITY GUARD TEST: Multi-Tenant Boundary ---');
    console.log('4. Requesting analytics for non-member Organization ID 999999...');
    const isolated = await req('GET', '/analytics/overview/999999', null, token);
    if (isolated.status === 403) {
      console.log('   ✅ PASSED: HTTP 403 Forbidden correctly returned! (Tenant data is isolated)');
    } else {
      console.log('   Status returned:', isolated.status, isolated.data);
    }

    console.log('\n==================================================');
    console.log('  ALL ANALYTICS TESTS COMPLETED!');
    console.log('==================================================');
  } catch (err) {
    console.error('Test execution error:', err);
  }
}

runAnalyticsTests();
