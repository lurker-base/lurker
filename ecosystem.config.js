module.exports = {
  apps: [
    {
      name: 'lurker-importer',
      script: '/data/.openclaw/workspace/lurker-project/scripts/token_importer.py',
      interpreter: 'python3',
      cwd: '/data/.openclaw/workspace/lurker-project',
      watch: false,
      autorestart: true,
      env: { PYTHONUNBUFFERED: '1' }
    },
    {
      name: 'lurker-lifecycle',
      script: '/data/.openclaw/workspace/lurker-project/scripts/lifecycle_core.py',
      interpreter: 'python3',
      cwd: '/data/.openclaw/workspace/lurker-project',
      watch: false,
      autorestart: true,
      env: { PYTHONUNBUFFERED: '1' }
    },
    {
      name: 'lurker-cleanup',
      script: '/data/.openclaw/workspace/lurker-project/scripts/cleanup_tokens.py',
      interpreter: 'python3',
      cwd: '/data/.openclaw/workspace/lurker-project',
      watch: false,
      autorestart: true,
      env: { PYTHONUNBUFFERED: '1' }
    },
    {
      name: 'lurker-scanner',
      script: '/data/.openclaw/workspace/lurker-project/scripts/scanner_cio_ultra.py',
      interpreter: 'python3',
      cwd: '/data/.openclaw/workspace/lurker-project',
      watch: false,
      autorestart: true,
      env: { PYTHONUNBUFFERED: '1' }
    },
    {
      name: 'lurker-auto-push',
      script: '/data/.openclaw/workspace/lurker-project/scripts/auto_push_loop.sh',
      interpreter: 'bash',
      cwd: '/data/.openclaw/workspace/lurker-project',
      watch: false,
      autorestart: true
    }
  ]
};
