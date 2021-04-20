const spawn = require('child_process').spawn
const path = require('path')

module.exports = (file) => {
  console.log(`Parsing bytes ${file}...`)
  return new Promise((resolve, reject) => {
    const exedir = path.join(process.env.APPDATA, './Pattern-Converter')
    const child = spawn(path.join(exedir, 'bytes_to_text.exe'), [file])
    child.on('close', code => {
      reject(new Error('Failed to parse pt file. Please make sure your pt file is not encrypted.'))
    })
    setTimeout(() => {
      child.kill(2)
      resolve()
    }, 2000)
  })
}
