import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@crm/shared', '@crm/database', 'react-big-calendar'],
  // Sequelize + pg can't be bundled cleanly by Turbopack — they do dynamic
  // dialect loading via `require('pg')` which the bundler can't statically
  // trace, especially with pnpm's strict node_modules layout. Mark them as
  // server-external so Next defers to Node's runtime resolver, which finds
  // `pg` via pnpm symlinks under `@crm/database`. Same pattern that fixes
  // similar errors with `mongoose`, `oracledb`, etc.
  serverExternalPackages: [
    'sequelize',
    'sequelize-typescript',
    'pg',
    'pg-hstore',
    'umzug',
  ],
}

export default nextConfig
