const spawn = require('child_process').spawn
const path = require('path')

module.exports = (dir, file) => {
  console.log(`Converting ${file} to bytes...`)
  return new Promise((resolve, reject) => {
    const exedir = path.join(process.env.APPDATA, './Pattern-Converter')
    const child = spawn(path.join(exedir, 'bytes_to_text.exe'), [path.join(dir, file)])
    child.on('close', code => {
      reject(new Error('Failed to convert file to bytes.'))
    })
    setTimeout(() => {
      child.kill(2)
      resolve()
    }, 2000)
  })
}
