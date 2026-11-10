// Native test suite for AI Assistant (Summarize & Action Items)
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

async function runAiTests() {
  console.log('==================================================');
  console.log('  AI ASSISTANT (SUMMARIZER & ACTION ITEMS) TESTS');
  console.log('==================================================\n');

  try {
    // 1. Login with demo account (password must be supplied via DEMO_PASSWORD env var)
    const demoPassword = process.env.DEMO_PASSWORD;
    if (!demoPassword) {
      throw new Error('DEMO_PASSWORD environment variable is not set. Run: $env:DEMO_PASSWORD = Read-Host "Demo password"');
    }
    console.log('1. Authenticating test user...');
    let login = await req('POST', '/auth/login', {
      email: 'admin@workspace.local',
      password: demoPassword,
    });
    if (login.status !== 200) throw new Error('Login failed: ' + JSON.stringify(login.data));
    const token = login.data.accessToken;
    console.log('   ✅ Authenticated successfully.\n');

    // 2. Test AI Summarizer
    console.log('2. Testing POST /api/ai/summarize...');
    const sampleText = `The development sprint for the MCA collaborative workspace project is progressing on track. 
The team successfully established the PostgreSQL database with 16 normalized tables and multi-tenant isolation.
The Machine Learning module for task delay prediction has been trained using Random Forest on 3,000 synthetic task records, achieving an accuracy of 89.3% and a recall of 94.5%.
Socket.IO bidirectional chat and real-time task status auditing in task_status_history are both fully operational.
The next upcoming sprint will focus on integrating analytics dashboards and finalizing the PWA configuration for Android.`;

    const summaryRes = await req('POST', '/ai/summarize', { text: sampleText }, token);
    if (summaryRes.status === 200) {
      console.log('   ✅ PASSED: AI Summary generated successfully!');
      console.log('   Source:', summaryRes.data.source);
      console.log('   Summary Output:\n' + summaryRes.data.summary);
    } else {
      console.log('   ❌ FAILED:', summaryRes.status, summaryRes.data);
    }

    // 3. Test AI Action-Item Extraction
    console.log('\n3. Testing POST /api/ai/action-items...');
    const meetingNotes = `1. Shiva will configure the Recharts analytics dashboard by Wednesday.
2. Rahul needs to verify the PWA manifest and mobile responsiveness by Thursday.
3. Priya will conduct the end-to-end multi-tenant security verification test.`;

    const actionRes = await req('POST', '/ai/action-items', { text: meetingNotes }, token);
    if (actionRes.status === 200 && Array.isArray(actionRes.data.action_items)) {
      console.log('   ✅ PASSED: Extracted structured action items!');
      console.log('   Source:', actionRes.data.source);
      console.log('   Extracted Tasks:', JSON.stringify(actionRes.data.action_items, null, 2));
    } else {
      console.log('   ❌ FAILED:', actionRes.status, actionRes.data);
    }

    // 4. Test Unauthenticated Guard
    console.log('\n--- SECURITY GUARD TEST ---');
    console.log('4. Calling /api/ai/summarize without token...');
    const unauthRes = await req('POST', '/ai/summarize', { text: 'Some random text without token' }, null);
    if (unauthRes.status === 401) {
      console.log(`   ✅ PASSED: HTTP 401 Unauthorized blocked unauthenticated AI access! (${unauthRes.data.error})`);
    } else {
      console.log('   ❌ FAILED: Unexpected status:', unauthRes.status);
    }

    console.log('\n==================================================');
    console.log('  ALL AI ASSISTANT TESTS COMPLETED!');
    console.log('==================================================\n');
  } catch (err) {
    console.error('Test execution failed:', err.message);
  }
}

runAiTests();
