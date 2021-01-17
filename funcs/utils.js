const convertBit = (value) => {
  const b = Buffer.alloc(8)
  b[0] = value
  b[1] = value >> 8
  b[2] = value >> 16
  b[3] = value >> 24
  return Buffer.from(b).readFloatLE(0)
}

const convertInt = (data) => {
  const buff = Buffer.alloc(8)
  buff.writeFloatLE(data)
  return (buff[0] | buff[1] << 8 | buff[2] << 16 | buff[3] << 24) >>> 0
}

module.exports = {
  convertBit,
  convertInt
}
