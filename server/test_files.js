// Native test suite for File Upload & Authenticated Download
const API = 'http://localhost:5000/api';

async function req(method, endpoint, body = null, token = null, isFormData = false) {
  const headers = {};
  if (!isFormData) headers['Content-Type'] = 'application/json';
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

async function runFileTests() {
  console.log('==================================================');
  console.log('  SECURE FILE UPLOAD & REPOSITORY TESTS');
  console.log('==================================================\n');

  try {
    // 1. Authenticate user
    console.log('1. Authenticating test user (alice@example.com)...');
    let login = await req('POST', '/auth/login', {
      email: 'alice@example.com',
      password: 'password123',
    });
    if (login.status !== 200) {
      login = await req('POST', '/auth/login', {
        email: 'test@example.com',
        password: 'Test@12345',
      });
    }
    if (login.status !== 200) throw new Error('Login failed: ' + JSON.stringify(login.data));
    const token = login.data.accessToken;
    console.log('   ✅ Authenticated successfully.\n');

    // 2. Upload a test document using FormData
    console.log('2. Uploading test file (project_specification.txt)...');
    const formData = new FormData();
    const fileContent = 'AI-Powered Collaborative Workspace Project Specification Document - Confidential';
    const blob = new Blob([fileContent], { type: 'text/plain' });
    formData.append('file', blob, 'project_specification.txt');
    formData.append('workspaceId', '1');
    formData.append('orgId', '1');

    const uploadRes = await req('POST', '/files/upload', formData, token, true);
    if (uploadRes.status === 201) {
      console.log('   ✅ PASSED: File uploaded successfully (HTTP 201 Created)!');
      console.log('   File ID:', uploadRes.data.file.id);
      console.log('   File Name:', uploadRes.data.file.name);
      console.log('   Storage Path:', uploadRes.data.file.path);
      console.log('   MIME Type:', uploadRes.data.file.mime_type);

      const fileId = uploadRes.data.file.id;

      // 3. List workspace files
      console.log('\n3. Listing files for Workspace ID 1...');
      const listRes = await req('GET', '/files/workspace/1', null, token);
      if (listRes.status === 200) {
        console.log(`   ✅ PASSED: Retrieved ${listRes.data.files.length} workspace file(s).`);
        listRes.data.files.slice(0, 3).forEach(f => {
          console.log(`   - [ID ${f.id}] ${f.name} (${(f.size / 1024).toFixed(1)} KB) - Uploaded by ${f.uploader_name || 'System'}`);
        });
      }

      // 4. Authenticated download check
      console.log(`\n4. Testing authenticated download for File ID ${fileId}...`);
      const dlRes = await fetch(`${API}/files/${fileId}/download`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (dlRes.status === 200) {
        const text = await dlRes.text();
        console.log('   ✅ PASSED: File downloaded successfully!');
        console.log('   Downloaded Content Content-Length:', text.length);
        console.log('   Downloaded Content Match:', text === fileContent);
      } else {
        console.log('   ❌ FAILED: Download status', dlRes.status);
      }

      // 5. Unauthenticated download check
      console.log('\n--- SECURITY GUARD TEST: Unauthenticated Download Attempt ---');
      const unauthDl = await fetch(`${API}/files/${fileId}/download`);
      if (unauthDl.status === 401) {
        console.log('   ✅ PASSED: HTTP 401 Unauthorized blocked unauthenticated download!');
      } else {
        console.log('   Status code:', unauthDl.status);
      }

    } else {
      console.log('   ❌ FAILED:', uploadRes.status, uploadRes.data);
    }

    console.log('\n==================================================');
    console.log('  ALL FILE REPOSITORY TESTS COMPLETED!');
    console.log('==================================================');
  } catch (err) {
    console.error('File test error:', err);
  }
}

runFileTests();
