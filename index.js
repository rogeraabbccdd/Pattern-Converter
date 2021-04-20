// Notes:
// 1 measure is 192 in DJMAX
// 1 measure is 960 in TECHMANIA
// 4 beat in bms = 1 measure
const path = require('path')

const pt2text = require('./funcs/pt2text.js')
const bytes2text = require('./funcs/bytes2text.js')
const text2bytes = require('./funcs/text2bytes.js')
const text2tech = require('./funcs/text2tech.js')
const bms2text = require('./funcs/bms2text.js')
const tech2text = require('./funcs/tech2text.js')
const ts2text = require('./funcs/ts2text.js')
const osu2text = require('./funcs/osu2text.js')
const copyfiles = require('./funcs/copyfiles.js')

const { version } = require('./package.json')

const main = async () => {
  console.log(`Pattern Converter Version: ${version} by Kento`)
  console.log('=================================== \n')
  await copyfiles()
  console.log('\n')
  let fileCount = 0
  for (let i = 2; i < process.argv.length; i++) {
    const ext = path.extname(process.argv[i])
    try {
      if (ext === '.pt') {
        fileCount++
        await pt2text(process.argv[i])
        await text2tech(path.dirname(process.argv[i]), path.basename(process.argv[i], path.extname(process.argv[i])) + '.txt')
      } else if (ext === '.bytes') {
        fileCount++
        await bytes2text(process.argv[i])
        await text2tech(path.dirname(process.argv[i]), path.basename(process.argv[i], path.extname(process.argv[i])) + '.txt')
      } else if (ext === '.bms' || ext === '.bme') {
        fileCount++
        await bms2text(path.dirname(process.argv[i]), process.argv[i])
        await text2bytes(path.dirname(process.argv[i]), path.basename(process.argv[i], path.extname(process.argv[i])) + '.txt')
        await text2tech(path.dirname(process.argv[i]), path.basename(process.argv[i], path.extname(process.argv[i])) + '.txt')
      } else if (ext === '.tech') {
        fileCount++
        const texts = await tech2text(path.dirname(process.argv[i]), process.argv[i])
        for (const text of texts) {
          await text2bytes(path.dirname(process.argv[i]), text)
        }
      } else if (ext === '.xml') {
        fileCount++
        await ts2text(path.dirname(process.argv[i]), process.argv[i])
        await text2bytes(path.dirname(process.argv[i]), path.basename(process.argv[i], path.extname(process.argv[i])) + '.txt')
        await text2tech(path.dirname(process.argv[i]), path.basename(process.argv[i], path.extname(process.argv[i])) + '.txt')
      } else if (ext === '.txt') {
        fileCount++
        await text2bytes(path.dirname(process.argv[i]), process.argv[i])
        await text2tech(path.dirname(process.argv[i]), process.argv[i])
      } else if (ext === '.osu') {
        fileCount++
        const result = await osu2text(path.dirname(process.argv[i]), process.argv[i])
        switch (result) {
          case 'version':
            console.log('Only osu file format v14 supported.')
            break
          case 'mode':
            console.log('Only support osu mania mode.')
            break
          default:
            await text2bytes(path.dirname(process.argv[i]), path.basename(process.argv[i], path.extname(process.argv[i])) + '.txt')
            await text2tech(path.dirname(process.argv[i]), path.basename(process.argv[i], path.extname(process.argv[i])) + '.txt')
            break
        }
      }
    } catch (error) {
      console.log(error)
    }
    console.log('\n')
  }
  if (fileCount === 0) {
    console.log('Please drag or drop your text to this program.\n')
  }
  console.log('=================================== \n')
  console.log('Press any key to exit')
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.on('data', process.exit.bind(process, 0))
}

main()
