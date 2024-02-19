import ExcelJS from 'exceljs'
import fs from 'fs'

import CONFIG from './config.js'

/**
 * @description: 从指定 json 文件中提取数据，创建 csv 表格并将数据写入
 * @return {*}
 */
export default async function makeExcel() {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet()
  sheet.columns = [
    { header: '城市', key: 'city' },
    { header: '公司名', key: 'companyName' },
    { header: '岗位名', key: 'jobTitle' },
    { header: '薪资', key: 'salary' },
    { header: '经验要求', key: 'exp' },
    { header: '学历要求', key: 'qualification' },
    { header: '行业', key: 'industry' },
    { header: '融资阶段', key: 'finacingStage' },
    { header: '规模', key: 'scale' },
  ]

  const data = JSON.parse(fs.readFileSync(CONFIG.jsonOutput))
  for (const city of data) {
    for (const job of city.data) {
      sheet.addRow({
        city: city.city,
        ...job,
      })
    }
  }

  await workbook.csv.writeFile(CONFIG.csvOutput, {
    encoding: 'utf-8',
    formatterOptions: {
      writeBOM: true,
    },
  })
}
