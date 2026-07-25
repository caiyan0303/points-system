// 安全数组工具 — 确保永远有数组返回
export const safeArray = (v) => Array.isArray(v) ? v : []

// 替换所有 .map 调用为安全版本
export const safeMap = (v, fn) => safeArray(v).map(fn)

// 安全对象访问
export const safeGet = (obj, path, def = null) => {
  try {
    return path.split('.').reduce((acc, key) => acc?.[key], obj) ?? def
  } catch { return def }
}