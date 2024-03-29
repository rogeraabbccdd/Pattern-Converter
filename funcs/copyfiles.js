const fs = require('fs')
const path = require('path')

module.exports = () => {
  console.log('Extracting required tools...')
  return new Promise((resolve, reject) => {
    let pt = false
    let bytes = false
    const outdir = path.join(process.env.APPDATA, './Pattern-Converter')
    let exists = fs.existsSync(outdir)
    if (!exists) {
      fs.mkdirSync(outdir)
    }
    exists = fs.existsSync(path.join(outdir, './pt_to_text.exe'))
    if (!exists) {
      const readpt = fs.createReadStream(path.join(__dirname, '../exe/pt_to_text.exe'))
      const writept = fs.createWriteStream(path.join(outdir, './pt_to_text.exe'), { flag: 'w', mode: 0o777 })
      readpt.once('end', () => {
        setTimeout(() => {
          pt = true
          if (pt && bytes) {
            resolve()
          }
        }, 2000)
      })
      writept.once('error', err => {
        reject(new Error(err))
      })
      readpt.once('error', err => {
        reject(new Error(err))
      })
      readpt.pipe(writept)
    } else pt = true

    exists = fs.existsSync(path.join(outdir, './bytes_to_text.exe'))
    if (!exists) {
      const readbytes = fs.createReadStream(path.join(__dirname, '../exe/bytes_to_text.exe'))
      const writebytes = fs.createWriteStream(path.join(outdir, './bytes_to_text.exe'), { flag: 'w', mode: 0o777 })
      readbytes.once('end', () => {
        setTimeout(() => {
          bytes = true
          if (pt && bytes) {
            resolve()
          }
        }, 2000)
      })
      writebytes.once('error', err => {
        reject(new Error(err))
      })
      readbytes.once('error', err => {
        reject(new Error(err))
      })
      readbytes.pipe(writebytes)
    } else bytes = true

    if (pt && bytes) resolve()
  })
}
