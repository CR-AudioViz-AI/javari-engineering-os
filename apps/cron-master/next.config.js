/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@supabase/supabase-js'],
  },
  // Transpile workspace packages
  transpilePackages: ['@javari/shared', '@javari/llm'],
};

module.exports = nextConfig;
