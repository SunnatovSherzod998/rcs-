const fetch = globalThis.fetch;

async function main() {
  const res = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'admin', password: process.env.ADMIN_PASSWORD || 'ADMIN' })
  });
  const data = await res.json();
  console.log('Login:', data.token ? 'SUCCESS' : 'FAILED', data.error || '');
  if (!data.token) return;

  const empRes = await fetch('http://localhost:3000/api/catalogs/employees', {
    headers: { 'Authorization': 'Bearer ' + data.token }
  });
  const empData = await empRes.json();
  console.log('Employees:', empRes.status, 'Total:', empData.total, 'Rows:', empData.rows?.length);

  const optsRes = await fetch('http://localhost:3000/api/catalogs/employees/options', {
    headers: { 'Authorization': 'Bearer ' + data.token }
  });
  const optsData = await optsRes.json();
  console.log('Options:', optsRes.status, 'Count:', optsData.length);
}

main().catch(console.error);
