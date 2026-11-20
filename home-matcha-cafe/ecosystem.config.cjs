module.exports = {
  apps: [
    {
      name: 'matcha-cafe',
      script: './build/index.js',
      cwd: '/home/orangepi/Desktop/HomeMatchaCafe/HomeMatchaCafe/home-matcha-cafe',
      instances: 2,
      exec_mode: 'cluster',
      kill_timeout: 4000,
      wait_ready: false,
      env: {
        NODE_ENV: 'production',
        PORT: 9998,
        BODY_SIZE_LIMIT: '25M'
      }
    }
  ]
};
