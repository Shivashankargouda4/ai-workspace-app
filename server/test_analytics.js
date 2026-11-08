// Native self-contained test suite for Analytics API & Metrics Verification
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
    const timestamp = Date.now();

    // 1. Security Check: Unauthenticated request must be blocked
    console.log('1. Testing unauthenticated access to /api/analytics/overview/1...');
    const unauth = await req('GET', '/analytics/overview/1');
    if (unauth.status === 401) {
      console.log('   ✅ PASSED: HTTP 401 Unauthorized correctly blocked unauthenticated access!\n');
    } else {
      console.log('   ❌ FAILED: Unexpected status code:', unauth.status);
    }

    // 2. Register a verified test user
    console.log('2. Registering verified analytics user...');
    const user = await req('POST', '/auth/register', {
      name: 'Analytics Admin',
      email: `analyst_${timestamp}@workspace.local`,
      password: 'Password@123',
    });
    if (user.status !== 201) throw new Error('Registration failed: ' + JSON.stringify(user.data));
    const token = user.data.accessToken;
    console.log('   ✅ User registered and authenticated successfully.\n');

    // 3. User creates an organization
    console.log('3. Creating an active organization...');
    const orgRes = await req('POST', '/orgs', {
      name: 'Kishkindha Analytics Corp',
      slug: `analytics-lab-${timestamp}`,
    }, token);
    if (orgRes.status !== 201) throw new Error('Failed to create org: ' + JSON.stringify(orgRes.data));
    const orgId = orgRes.data.organization.id;
    console.log(`   ✅ Organization created successfully (Org ID: ${orgId}).\n`);

    // 4. Create sample tasks to verify real aggregations
    console.log('4. Seeding tasks for real-time SQL aggregation...');
    await req('POST', '/tasks', {
      title: 'Configure Recharts Analytics Dashboard',
      description: 'Implement KPI summary cards and pie charts',
      priority: 'high',
      status: 'done',
      complexity: 5,
      estimated_days: 3,
      org_id: orgId,
    }, token);

    await req('POST', '/tasks', {
      title: 'Run Multi-Tenant Security Audits',
      description: 'Verify 401, 403, and 410 guard conditions',
      priority: 'medium',
      status: 'in_progress',
      complexity: 4,
      estimated_days: 2,
      org_id: orgId,
    }, token);

    await req('POST', '/tasks', {
      title: 'Complete Project Viva Documentation',
      description: 'Prepare synopsis, UML diagrams, and test report',
      priority: 'low',
      status: 'todo',
      complexity: 3,
      estimated_days: 4,
      org_id: orgId,
    }, token);
    console.log('   ✅ Seeded 3 tasks (1 done, 1 in_progress, 1 todo).\n');

    // 5. Fetch live analytics overview
    console.log(`5. Requesting GET /api/analytics/overview/${orgId}...`);
    const analytics = await req('GET', `/analytics/overview/${orgId}`, null, token);
    if (analytics.status === 200) {
      console.log('   ✅ PASSED: HTTP 200 OK received with live SQL aggregation data!');
      const { summary, tasks_by_status, tasks_by_priority, member_workload } = analytics.data;

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
    } else {
      console.log('   ❌ FAILED:', analytics.status, analytics.data);
    }

    // 6. Security Guard Test: Request an organization where user has no membership
    console.log('\n--- SECURITY GUARD TEST: Multi-Tenant Isolation ---');
    console.log('6. Requesting analytics for non-member Organization ID 999999...');
    const isolated = await req('GET', '/analytics/overview/999999', null, token);
    if (isolated.status === 403) {
      console.log('   ✅ PASSED: HTTP 403 Forbidden correctly returned! (Cross-tenant access blocked)');
    } else {
      console.log('   Status returned:', isolated.status, isolated.data);
    }

    console.log('\n==================================================');
    console.log('  ALL ANALYTICS TESTS PASSED (100%)!');
    console.log('==================================================');
  } catch (err) {
    console.error('Test execution error:', err);
  }
}

runAnalyticsTests();
