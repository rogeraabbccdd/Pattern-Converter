const spawn = require('child_process').spawn
const path = require('path')

module.exports = (file) => {
  console.log(`Parsing pt ${file}...`)
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(process.cwd(), 'pt_to_text.exe'), [file])
    child.on('close', code => {
      reject(new Error('Failed to parse pt file. Please make sure your pt file is not encrypted.'))
    })
    setTimeout(() => {
      child.kill(2)
      resolve()
    }, 2000)
  })
}
