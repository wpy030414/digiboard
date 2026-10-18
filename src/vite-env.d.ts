/// <reference types="vite/client" />

/** 字体资源 URL（PNG 导出时按需抓取并内嵌，避免把字体打进主 bundle）。 */
declare module '*.woff2?url' {
  const url: string
  export default url
}
