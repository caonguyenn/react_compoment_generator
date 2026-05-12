/** @type {import('next').NextConfig} */
const nextConfig = {
  // Exclude design folders from TypeScript checking
  typescript: {
    ignoreBuildErrors: false,
  },
  webpack: (config, { isServer }) => {
    // Exclude designs folder from webpack compilation
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/node_modules', '**/designs/**'],
    };
    return config;
  },
};

export default nextConfig;
