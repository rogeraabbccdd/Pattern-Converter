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
      bpms.push({ pos: Math.round(event.pulse / 5), bpm: event.bpm })
      bmstimings.push(
        {
          type: 'bpm',
          beat: Math.round(parseInt(event.pulse) / 5),
          bpm: event.bpm
        }
      )
    }
    // parse notes and collect keysound
    for (const note of pattern.packedNotes) {
      const splitted = note.split('|')
      const data = {
        type: '',
        pulse: '',
        lane: '',
        volume: 1,
        pan: 0,
        endOfScanString: false,
        sound: ''
      }
      if (splitted[0] === 'E') {
        // new format
        // E|{type}|{pulse}|{lane}|{volume}|{pan}|{endOfScanString}|{sound}
        data.type = splitted[1]
        data.pulse = splitted[2]
        data.lane = parseInt(splitted[3])
        data.volume = splitted[4]
        data.pan = splitted[5]
        data.endOfScanString = splitted[6] === '1'
        data.sound = splitted[7]
      } else {
        // old format
        // {type}|{pulse}|{lane}|{sound}
        data.type = splitted[0]
        data.pulse = splitted[1]
        data.lane = parseInt(splitted[2])
        data.sound = splitted[3]
      }
      if (data.lane > 3) {
        data.lane += 12
        if (data.lane > 60) data.lane = 21
      }
      const pos = Math.round(data.pulse / 5)
      if (pos + 192 > endpos) {
        endpos = pos + 192
      }
      let attr = 0
      switch (data.type) {
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
      let id = '0000'
      if (data.sound.length > 0) {
        const idx = wavs.findIndex(wav => wav.file === data.sound)
        id = idx === -1 ? (wavs.length + 1).toString(16).padStart(4, 0).toUpperCase() : wavs[idx].id
        if (idx === -1 && data.sound.length > 0) {
          wavs.push({ file: data.sound, id })
        }
      }
      notes.push({ pos, attr, duration: 6, keysound: id, track: data.lane, volume: data.volume, pan: data.pan })

      if (data.endOfScanString && data.lane <= 3) {
        notes.push({ pos, attr: 0, duration: 6, keysound: '0000', track: data.lane + 4, volume: 1, pan: 0 })
      }
    }
    // parse long notes
    for (const note of pattern.packedHoldNotes) {
      const splitted = note.split('|')
      const data = {
        type: '',
        pulse: '',
        duration: '',
        lane: '',
        volume: 1,
        pan: 0,
        endOfScanString: false,
        sound: ''
      }
      if (splitted[0] === 'E') {
        // new format
        // E|{type}|{lane}|{pulse}|{duration}|{volume}|{pan}|{endOfScanString}|{sound}
        data.type = splitted[1]
        data.lane = parseInt(splitted[2])
        data.pulse = splitted[3]
        data.duration = splitted[4]
        data.volume = splitted[5]
        data.pan = splitted[6]
        data.endOfScanString = splitted[7] === '1'
        data.sound = splitted[8]
      } else {
        // old format
        // {type}|{lane}|{pulse}|{duration}|{sound}
        data.type = splitted[0]
        data.lane = parseInt(splitted[1])
        data.pulse = splitted[2]
        data.duration = splitted[3]
        data.sound = splitted[4]
      }
      if (data.lane > 3) {
        data.lane += 12
        if (data.lane > 60) data.lane = 21
      }
      const pos = Math.round(data.pulse / 5)
      if (pos + 192 > endpos) {
        endpos = pos + 192
      }
      let attr = 0
      switch (data.type) {
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
      let id = '0000'
      if (data.sound.length > 0) {
        const idx = wavs.findIndex(wav => wav.file === data.sound)
        id = idx === -1 ? (wavs.length + 1).toString(16).padStart(4, 0).toUpperCase() : wavs[idx].id
        if (idx === -1 && data.sound.length > 0) {
          wavs.push({ file: data.sound, id })
        }
      }
      notes.push({ pos, attr, duration: Math.round(data.duration / 5), keysound: id, track: data.lane, volume: data.volume, pan: data.pan })

      if (data.endOfScanString && data.lane <= 3) {
        notes.push({ pos, attr: 0, duration: 6, keysound: '0000', track: data.lane + 4, volume: 1, pan: 0 })
      }
    }
    // parse drag notes
    for (const note of pattern.packedDragNotes) {
      const data = note.packedNote.split('|')
      const pos = Math.round(data[1] / 5)
      if (pos + 192 > endpos) {
        endpos = pos + 192
      }
      let id = '0000'
      if (data[3].length > 0) {
        const idx = wavs.findIndex(wav => wav.file === data[3])
        id = idx === -1 ? (wavs.length + 1).toString(16).padStart(4, 0).toUpperCase() : wavs[idx].id
        if (idx === -1) {
          wavs.push({ file: data[3], id })
        }
      }
      const duration = Math.round(note.packedNodes[1].split('|')[0] / 5)
      notes.push({ pos, attr: 0, duration, keysound: id, track: parseInt(data[2]) })
    }

    // arrage notes
    let stringNotes = ''
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
      const noteintrack = notes.filter(note => parseInt(note.track) === i)
      for (const note of noteintrack) {
        const vol = note.volume ? Math.round(note.volume * 127) : 127
        const pan = note.pan ? Math.round((note.pan + 1) * (127 / 2)) : 64
        stringNotes += `#${note.pos} NOTE ${note.keysound} ${vol} ${pan} ${note.attr} ${note.duration} 0\r\n`
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
