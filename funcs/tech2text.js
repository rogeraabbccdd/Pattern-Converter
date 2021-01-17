const { convertInt } = require('./utils.js')
const bms = require('bms')
const fs = require('fs')

module.exports = async (file) => {
  console.log(`Converting ${file} to pt txt...`)
  const data = fs.readFileSync(file, 'utf-8')
  const tech = JSON.parse(data)
  const files = []

  for (const pattern of tech.patterns) {
    const bpms = []
    const bmstimings = []
    const wavs = []
    const notes = []
    let endpos = 0
    // add initbpm
    bpms.push({ pos: 0, bpm: pattern.patternMetadata.initBpm })
    // parse bpm events
    for (const event of pattern.bpmEvents) {
      bpms.push({ pos: event.pulse / 5, bpm: event.bpm })
      bmstimings.push(
        {
          type: 'bpm',
          beat: parseInt(event.pulse) / 5,
          bpm: event.bpm
        }
      )
    }
    // parse notes and collect keysound
    for (const note of pattern.packedNotes) {
      const data = note.split('|')
      let attr = 0
      const pos = data[1] / 5
      if (pos + 192 > endpos) {
        endpos = pos + 192
      }
      switch (data[0]) {
        case 'Baisc':
          attr = 0
          break
        case 'RepeatHead':
          attr = 10
          break
        case 'Repeat':
          attr = 11
          break
        case 'ChainHead':
          attr = 5
          break
        case 'ChainNode':
          attr = 6
          break
      }
      const idx = wavs.findIndex(wav => wav.file === data[3])
      const id = idx === -1 ? (wavs.length + 1).toString(16).padStart(4, 0).toUpperCase() : wavs[idx].id
      if (idx === -1) {
        wavs.push({ file: data[3], id })
      }
      notes.push({ pos, attr, duration: 6, keysound: id, track: parseInt(data[2]) })
    }
    // parse long notes
    for (const note of pattern.packedHoldNotes) {
      const data = note.split('|')
      let attr = 0
      const pos = data[2] / 5
      if (pos + 192 > endpos) {
        endpos = pos + 192
      }
      switch (data[0]) {
        case 'Hold':
          attr = 12
          break
        case 'RepeatHeadHold':
          attr = 10
          break
        case 'RepeatHold':
          attr = 11
          break
      }
      const idx = wavs.findIndex(wav => wav.file === data[4])
      const id = idx === -1 ? (wavs.length + 1).toString(16).padStart(4, 0).toUpperCase() : wavs[idx].id
      if (idx === -1) {
        wavs.push({ file: data[4], id })
      }
      notes.push({ pos, attr, duration: data[3] / 5, keysound: id, track: parseInt(data[1]) })
    }
    // parse drag notes
    for (const note of pattern.packedDragNotes) {
      const data = note.packedNote.split('|')
      const pos = data[1] / 5
      if (pos + 192 > endpos) {
        endpos = pos + 192
      }
      const idx = wavs.findIndex(wav => wav.file === data[3])
      const id = idx === -1 ? (wavs.length + 1).toString(16).padStart(4, 0).toUpperCase() : wavs[idx].id
      if (idx === -1) {
        wavs.push({ file: data[3], id })
      }
      const duration = note.packedNodes[1].split('|')[0] / 5
      notes.push({ pos, attr: 0, duration, keysound: id, track: parseInt(data[2]) })
    }

    // arrage notes
    let stringNotes = ''
    notes.map(note => {
      if (note.track > 3) note.track += 16
      return note
    })
    for (let i = 0; i < 64; i++) {
      stringNotes += '#0 TRACK_START 0 \'\'\r\n'
      // Add bpm change note
      if (i === 0) {
        for (const bpm of bpms) {
          stringNotes += `#${bpm.pos} BPM_CHANGE ${convertInt(bpm.bpm)}\r\n`
        }
      }
      // Add endpos note
      if (i === 20) {
        stringNotes += `#${endpos} NOTE 0000 127 64 0 6 0\r\n`
      }
      const noteintrack = notes.filter(note => note.track === i)
      for (const note of noteintrack) {
        stringNotes += `#${note.pos} NOTE ${note.keysound} 127 64 ${note.attr} ${note.duration} 0\r\n`
      }
    }
    // caculate song length
    const timing = new bms.Timing(pattern.patternMetadata.initBpm, bmstimings)
    const songlength = convertInt(timing.beatToSeconds(endpos / 48))
    // arrange wavs
    let stringWAV = ''
    for (const wav of wavs) {
      stringWAV += `#WAV${wav.id} ${wav.file}\r\n`
    }
    // write to file
    const output =
      `#SOUND_COUNT ${wavs.length}\r\n` +
      '#TRACK_COUNT 64\r\n' +
      '#POSITION_PER_MEASURE 192\r\n' +
      `#BPM ${convertInt(pattern.patternMetadata.initBpm)}\r\n` +
      `#END_POSITION ${convertInt(endpos)}\r\n` +
      `#TAGB ${songlength}\r\n` +
      stringWAV +
      'POSITION COMMAND PARAMETER\r\n' +
      stringNotes
    const filename = pattern.patternMetadata.patternName + '.txt'
    fs.writeFileSync(filename, output)
    files.push(filename)
  }
  return files
}
