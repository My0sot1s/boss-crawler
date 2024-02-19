import { Builder, By, until } from 'selenium-webdriver'
import { Options } from 'selenium-webdriver/chrome.js'
import fs from 'fs'

import verify from './verify.js'
import makeExcel from './makeExcel.js'
import CONFIG from './config.js'

/* 要爬取的岗位 */
const target = CONFIG.searchTarget

let options = new Options()
let driver = await new Builder()
  .setChromeOptions(options)
  .forBrowser('chrome')
  .build()

/* 针对boss直聘反爬js脚本中识别的 Selenium 特征进行屏蔽，用 Devtools Command 可以保证屏蔽在网站脚本前执行 */
await driver.sendDevToolsCommand('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    const webdriverKeys = [
      'webdriver',
      '__driver_evaluate',
      '__webdriver_evaluate',
      '__selenium_evaluate',
      '__fxdriver_evaluate',
      '__driver_unwrapped',
      '__webdriver_unwrapped',
      '__selenium_unwrapped',
      '__fxdriver_unwrapped',
      '_Selenium_IDE_Recorder',
      '_selenium',
      'calledSelenium',
      '_WEBDRIVER_ELEM_CACHE',
      'ChromeDriverw',
      'driver-evaluate',
      'webdriver-evaluate',
      'selenium-evaluate',
      'webdriverCommand',
      'webdriver-evaluate-response',
      '__webdriverFunc',
      '__webdriver_script_fn',
      '__$webdriverAsyncExecutor',
      '__lastWatirAlert',
      '__lastWatirConfirm',
      '__lastWatirPrompt',
      '$chrome_asyncScriptInfo',
      '$cdc_asdjflasutopfhvcZLmcfl_',
    ]
    for (const key of webdriverKeys) {
      Object.defineProperty(navigator, key, {
        get: () => undefined,
      })
    }
    `,
})

/* 用户自行操作页面扫描二维码登录 */
async function login() {
  await driver.get('https://www.zhipin.com/web/user/?ka=header-login')
  await driver.wait(until.elementLocated(By.css('.rec-job-list')), 1000 * 1800)
  await sleep(2200)
}

/**
 * @description: 爬虫逻辑
 * @param {*} written 之前已经爬取过的数据
 * @return {*} 爬取完成后的数据
 */
async function getData(written) {
  await login()
  /* 读取最后一个已爬取城市的信息，如果没有已爬取数据，那就从头开始爬 */
  const now = written.length && written[written.length - 1]
  let write = !now
  try {
    /* 读取城市数据 */
    const json = fs.readFileSync('cityGroup.json', 'utf-8')
    const cities = JSON.parse(json).zpData.cityGroup
    let index = 0
    for (const group of cities) {
      const cityCount = cities.reduce(
        (pre, cur) => pre + cur.cityList.length,
        0
      )
      for (const city of group.cityList) {
        index++
        /* 找到当前已爬取的最后一个城市，从下个城市开始爬 */
        if (!write && city.name === now.city) {
          write = true
          continue
        }
        if (!write) continue
        console.log(`当前：${city.name}, ${index} of ${cityCount}`)
        const code = city.code
        await driver.get(
          `https://www.zhipin.com/job_detail/?query=${target}&city=${code}&page=1`
        )

        await sleep(10000 + Math.random() * 1000)
        /* 每个城市提取后的数据 */
        const cityPiece = []
        for (let page = 1; page <= 10; page++) {
          console.log('page' + page)
          /* 有时会出现被强制定向到主页的情况，以下解决 */
          await waitPageLoad(
            code,
            page,
            '.job-list-box, .job-box, .error-content .btn'
          )

          const currentUrl = await driver.getCurrentUrl()
          if (currentUrl.includes('verify-slider')) {
            /* 进入验证页面 */

            /* 找到开始验证按钮并点击 */
            const verifyBtn = await driver.findElement(
              By.css('.error-content .btn')
            )
            verifyBtn.click()

            /* 获取验证图片，这里为点选验证 */
            await driver.wait(
              until.elementLocated(By.css('.geetest_item_img')),
              1000 * 600
            )
            const verifyImgBox = await driver.findElement(
              By.css('.geetest_item_wrap')
            )
            let urlAttribute = null
            /* 等待图片被网站加载 */
            while (!urlAttribute || urlAttribute === 'none') {
              try {
                urlAttribute = await verifyImgBox.getCssValue(
                  'background-image'
                )
              } catch {
                await sleep(1000)
              }
            }
            /* 提取图片url，送至打码平台获取点击位置坐标，这里是用的图鉴，也可以自己找别的方式实现 */
            const imgUrl = urlAttribute.match(/url\("([^"]+)"\)/)[1]
            const points = await verify(imgUrl)
            console.log('点选验证', points)

            /* 模拟点选验证 */
            for (const point of points) {
              let click = await driver.findElement(By.css('.geetest_item_wrap'))
              const actions = driver.actions({ async: true })
              /* 以 306.55 * 343.333 尺寸的图片左上角为原点 */
              await actions
                .move({ origin: click, x: -153 + point.x, y: -172 + point.y })
                .click()
                .perform()
              await sleep(Math.random() * 2000)
            }
            const commit = await driver.findElement(
              By.css('.geetest_commit_tip')
            )
            await sleep(Math.random() * 15000)
            commit.click()

            await waitPageLoad(code, page, '.job-list-box, .job-box')
          }

          /* 如果弹出登录框，需要再次扫码登陆=录 */
          try {
            const loginBox = await driver.findElement(
              By.css('.boss-login-dialog')
            )
            console.log('人工扫码登录')

            /* 记录一个页面元素用于判断页面刷新 */
            const jobList = await driver.findElement(
              By.css('.job-list-box, .job-box')
            )

            /* 等待人工扫码登录 */
            await driver.wait(until.stalenessOf(loginBox), 1000 * 3600 * 0.5)
            /* 等待页面刷新 */
            await driver.wait(until.stalenessOf(jobList), 1000 * 3600 * 0.5)
            /* 等待页面加载完成 */
            await driver.wait(
              until.elementLocated(By.css('.job-list-box, .job-box')),
              1000 * 3600 * 0.5
            )
          } catch {}

          /* 获取工作信息卡片，一般一页有30条 */
          const jobs = await driver.findElements(By.css('.job-list-box > li'))
          const piece = await extractData(jobs)
          cityPiece.push(...piece)
          /* 找到翻页按钮，点击跳转到下一页 */
          let buttonList
          /* 只有一页结果，并出现评价搜索结果时拦截错误 */
          try {
            buttonList = await driver.findElement(
              By.css('.options-pages, .page')
            )
          } catch {
            console.log('没有找到翻页按钮')
            continue
          }
          const buttons = await buttonList.findElements(By.css('a'))
          for (let button of buttons) {
            const index = await button.getText()
            if (+index === page + 1) {
              /* 按钮可能被侧边栏阻挡，需要调整窗口大小 */
              while (true) {
                try {
                  button.click()
                  break
                } catch (e) {
                  console.log(e)
                  console.log('按钮无法点击')
                  await sleep(30000)
                }
              }
              break
            }
          }
          await sleep(500 + Math.random() * 1000)
        }
        written.push({
          city: city.name,
          data: cityPiece,
        })
        /* 每个城市爬完先存一次数据到表中，避免一些无法捕获错误带来的数据丢失，也会带来一些效率问题，等待解决() */
        fs.writeFileSync(CONFIG.jsonOutput, JSON.stringify(written), () => {})
        await makeExcel()
        await sleep(Math.random * 1000)
      }
    }
  } catch (e) {
    console.log(e)
  }
  return written
}

/**
 * @description: 解析爬虫获取的 HTML 元素，提取需要的信息
 * @param {*} jobs 获取到的 HTML 元素列表
 * @return {*} 提取到的数据，以对象的形式来包装
 */
async function extractData(jobs) {
  const piece = []
  for (const job of jobs) {
    const companyName = await job
      .findElement(By.css('.company-name'))
      .findElement(By.css('a'))
      .getText()

    const jobTitle = await job.findElement(By.css('.job-name')).getText()
    const salary = await job.findElement(By.css('.salary')).getText()

    const tagList = await job.findElement(By.className('tag-list'))
    const tags = await tagList.findElements(By.css('li'))
    const [exp, qualification] = await Promise.all(
      tags.map(async (item) => {
        const text = await item.getText()
        return text
      })
    )

    const companyTagList = await job.findElement(
      By.className('company-tag-list')
    )
    const companyTags = await companyTagList.findElements(By.css('li'))
    /* 有些公司会缺失融资阶段数据 */
    if (companyTags.length === 2) {
      companyTags.splice(1, 0, {
        getText: () => '暂无',
      })
    }
    const [industry, finacingStage, scale] = await Promise.all(
      companyTags.map(async (item) => {
        const text = await item.getText()
        return text
      })
    )
    piece.push({
      companyName,
      jobTitle,
      salary,
      exp,
      qualification,
      industry,
      finacingStage,
      scale,
    })
  }
  return piece
}

/**
 * @description: 等待页面加载完成，并在网站触发反爬机制，返回页面不符合预期时进行纠正
 * @param {*} code 城市对应的编码，用于拼接到 url 中
 * @param {*} page 当前的处于的页码
 * @param {*} selector 等待页面加载完成，判断出现的目标元素选择器
 * @return {*}
 */
async function waitPageLoad(code, page, selector) {
  const maxTryTime = 3
  let tryTime = 0
  while (true) {
    /* 等待超时三次，判断为返回了预期之外的页面，此时重定向回目标页面 */
    if (tryTime === maxTryTime) {
      await driver.get(
        `https://www.zhipin.com/job_detail/?query=${target}&city=${code}&page=${page}`
      )
      waitPageLoad(code, page, selector)
    }
    try {
      tryTime++
      await driver.wait(until.elementLocated(By.css(selector)), 1000 * 35)
      await sleep(1000 * 3.1)
      break
    } catch {
      const curUrl = await driver.getCurrentUrl()
      /* 被重定向回主页时，跳转回目标页面 */
      if (curUrl === 'https://www.zhipin.com/') {
        await driver.get(
          `https://www.zhipin.com/job_detail/?query=${target}&city=${code}&page=${page}`
        )
      }
      waitPageLoad(code, page, selector)
    }
  }
}

/**
 * @description: js模拟睡眠
 * @param {*} time 睡眠时间，以毫秒计
 * @return {*}
 */
function sleep(time) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve()
    }, time)
  })
}

/**
 * @description: 执行爬虫程序
 * @return {*}
 */
async function run() {
  /* 从 json 文件中读取已获取的数据，如果没有，就新创建一个 */
  try {
    fs.readFileSync(CONFIG.jsonOutput, 'utf-8')
  } catch {
    fs.writeFileSync(CONFIG.jsonOutput, JSON.stringify([]), () => {})
  }
  const written = JSON.parse(fs.readFileSync(CONFIG.jsonOutput, 'utf-8'))
  const data = await getData(written)
  fs.writeFileSync(CONFIG.jsonOutput, JSON.stringify(data), () => {})
  await makeExcel()
}

run()
