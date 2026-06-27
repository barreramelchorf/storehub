/** @type {import('next').NextConfig} */
module.exports = {
  output: 'standalone',
  transpilePackages: ['@storehub/types', '@storehub/schemas'],
}
