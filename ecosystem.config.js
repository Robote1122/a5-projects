/**
 * ecosystem.config.js
 * PM2 конфигурация для автозапуска Vzmakh Chat.
 * Запуск: pm2 start ecosystem.config.js
 */ 
module.exports = {
  apps: [
    {
      name: 'vzmakh-chat',
      script: './server/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 8001,
        AI_ENABLED: true,
        AI_SERVICE_URL: 'http://localhost:8002',
      },
      env_file: './server/.env',
      watch: false,
      autorestart: true,
      max_memory_restart: '300M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
    },
    {
      name: 'vzmakh-ai',
      script: 'uvicorn',
      args: 'ai-service.app:app --host 0.0.0.0 --port 8002',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        PYTHONPATH: './ai-service',
      },
      env_file: './ai-service/.env',
      watch: false,
      autorestart: true,
      max_memory_restart: '500M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/pm2-ai-error.log',
      out_file: './logs/pm2-ai-out.log',
    },
  ],
};