module.exports = {
  apps: [{
    name: 'videofixer',
    script: './dist/index.js',
    cwd: '/var/www/videofixer',
    // Must stay at 1 — the per-video encode lock (EncodeService's in-process
    // Set) is not shared across cluster workers, so cluster mode would
    // silently break the "one fix at a time per video" guarantee.
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production'
    },
    error_file: '/home/meno/.pm2/logs/videofixer-error.log',
    out_file: '/home/meno/.pm2/logs/videofixer-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};
