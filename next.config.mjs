/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  transpilePackages: ["fabric"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push({
        canvas: "commonjs canvas",
        jsdom: "commonjs jsdom",
      });
    }
    return config;
  },
};

export default nextConfig;
