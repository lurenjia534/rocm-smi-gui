// next.config.ts
import type { NextConfig } from "next";

// 判断当前是否在生产环境
const isProd = process.env.NODE_ENV === "production";
// Tauri CLI 在 dev 模式下会把真实 IP 写入 TAURI_DEV_HOST，
// 以便在移动端 / 局域网访问；若未设置则回退到 localhost
const internalHost = process.env.TAURI_DEV_HOST || "localhost";
const nextConfig: NextConfig = {
    /**
     * 让 Next.js 走“静态导出”模式（SSG 而非 SSR）
     * https://nextjs.org/docs/pages/building-your-application/deploying/static-exports
     */
    output: "export",
    /**
     * SSG 模式下要禁用内置 Image 优化器，
     * 否则导出时会报 `export-image-api` 错误。
     */
    images: {
        unoptimized: true,
    },
    /**
     * 在开发模式下为静态资源添加 assetPrefix，
     * 让 WebView 能正确加载 `/public` 和 `.next` 里的文件。
     * 打包（生产）阶段则留空。
     */
    assetPrefix: isProd ? undefined : `http://${internalHost}:3000`,
};

export default nextConfig;
