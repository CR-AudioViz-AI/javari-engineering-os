export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>🤖 Javari Engineering OS</h1>
      <p>Master Cron Orchestrator</p>
      <ul>
        <li><a href="/api/health">Health Check</a></li>
        <li><a href="/api/cron/master">Master Cron Status</a></li>
      </ul>
      <hr />
      <p style={{ color: '#666' }}>
        This service runs ONE cron job that orchestrates ALL autonomous tasks.
      </p>
    </main>
  );
}
