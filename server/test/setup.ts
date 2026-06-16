// Stellt ENV bereit, bevor src/config/env.ts beim Import geparst wird.
process.env.NODE_ENV = 'test'
process.env.PORT = '0'
process.env.DATABASE_PATH = ':memory:'
process.env.MASTER_KEY = Buffer.alloc(32, 7).toString('base64')
process.env.SESSION_SECRET = 'test-session-secret-0123456789'
process.env.ADMIN_BOOTSTRAP = 'test-bootstrap-token'
process.env.REVENUECAT_WEBHOOK_SECRET = 'test-rc-secret'
process.env.TZ = 'Europe/Berlin'
process.env.COOKIE_SECURE = 'false'
