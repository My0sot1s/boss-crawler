import fetch from 'node-fetch'

import CONFIG from './config.js'

const apiUrl = 'http://api.ttshitu.com/predict'

/**
 * @description: 请求图片链接，并将其转换为 base64 编码
 * @param {*} url 图片链接
 * @return {*}
 */
async function urlToBase64(url) {
  const response = await fetch(url)
  const buffer = await response.arrayBuffer()
  const base64data = Buffer.from(buffer).toString('base64')
  return base64data
}

/**
 * @description: 使用图鉴平台识别验证码，并将识别后的坐标返回
 * @param {*} imgUrl 图片链接
 * @return {*} 点选坐标数组
 */
export default async function verify(imgUrl) {
  const base64data = await urlToBase64(imgUrl)
  const res = await fetch(apiUrl, {
    method: 'POST',
    body: JSON.stringify({
      username: CONFIG.verify.username, //用户名
      password: CONFIG.verify.password, //密码
      typeid: '27',
      image: base64data,
    }),
  })
  const data = await res.json()
  const points = data.data.result.split('|').map((target) => {
    const [x, y] = target.split(',').map((coord) => +coord)
    return {
      x,
      y,
    }
  })
  return points
}