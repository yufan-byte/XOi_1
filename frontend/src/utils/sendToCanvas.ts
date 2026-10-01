/**
 * 发送资产到无限画布
 * 直接跳转到画布页面，通过 URL 参数传递图片数据
 */

interface CanvasImage {
  src: string
  name: string
  id?: number
  type?: string
  projectId?: number
}

/**
 * 发送图片到无限画布（直接跳转）
 * @param images 图片数组
 */
export function sendToCanvas(images: CanvasImage[], opts?: { from?: 'cornerScape' | 'assets' }) {
  if (!images || images.length === 0) {
    window.$message?.warning('没有可发送的图片')
    return
  }

  // 发起来源页标记：桥层 doSave 据此定点回归到对应接收页消费结果
  const fromParam =
    opts?.from && ['cornerScape', 'assets'].includes(opts.from)
      ? `&from=${encodeURIComponent(opts.from)}`
      : ''

  // 将图片数据编码到 URL 参数
  const importData = encodeURIComponent(JSON.stringify(images))

  // 直接跳转到画布页面（当前窗口）
  window.location.href = `/#/canvas?import=${importData}&source=xoi${fromParam}`

  window.$message?.success(`正在发送 ${images.length} 张图片到画布...`)
}

/**
 * 发送单个资产到画布
 * @param src 图片地址
 * @param name 图片名称
 * @param id 资产 ID（可选）
 */
export function sendSingleToCanvas(src: string, name: string, id?: number) {
  sendToCanvas([{ src, name, id }])
}
