module.exports = {
  apps: [
    {
      name: 'lurker-importer',
      script: 'scripts/token_importer.py',
      interpreter: 'python3',
      cwd: '/data/.openclaw/workspace/lurker-project',
      watch: false,
      restart_delay: 1000,
      autorestart: true,
      max_restarts: 10,
      min_uptime: 5000,
      env: {
        PYTHONUNBUFFERED: '1'
      }
    },
    {
      name: 'lurker-lifecycle',
      script: 'scripts/lifecycle_core.py',
      interpreter: 'python3',
      cwd: '/data/.openclaw/workspace/lurker-project',
      watch: false,
      restart_delay: 1000,
      autorestart: true,
      max_restarts: 10,
      min_uptime: 5000,
      env: {
        PYTHONUNBUFFERED: '1'
      }
    },
    {
      name: 'lurker-cleanup',
      script: 'scripts/cleanup_tokens.py',
      interpreter: 'python3',
      cwd: '/data/.openclaw/workspace/lurker-project',
      watch: false,
      restart_delay: 1000,
      autorestart: true,
      max_restarts: 10,
      min_uptime: 5000,
      env: {
        PYTHONUNBUFFERED: '1'
      }
    },
    {
      name: 'lurker-scanner',
      script: 'scripts/scanner_cio_ultra.py',
      interpreter: 'python3',
      cwd: '/data/.openclaw/workspace/lurker-project',
      watch: false,
      restart_delay: 1000,
      autorestart: true,
      max_restarts: 10,
      min_uptime: 5000,
      env: {
        PYTHONUNBUFFERED: '1'
      }
    },
    {
      name: 'lurker-auto-push',
      script: 'scripts/auto_push_loop.sh',
      interpreter: 'bash',
      cwd: '/data/.openclaw/workspace/lurker-project',
      watch: false,
      restart_delay: 1000,
      autorestart: true,
      max_restarts: 10,
      min_uptime: 10000
    }
  ]
};
