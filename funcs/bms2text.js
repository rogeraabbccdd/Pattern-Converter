const { convertInt } = require('./utils.js')
const bms = require('bms')
const fs = require('fs')
const path = require('path')

module.exports = async (file) => {
  console.log(`Converting ${file} to pt txt...`)
  try {
    // BMS vars
    const bmsSource = fs.readFileSync(file, 'utf-8')
    const result = bms.Compiler.compile(bmsSource)
    const chart = result.chart
    const timing = bms.Timing.fromBMSChart(chart)
    const notes = bms.Notes.fromBMSChart(chart)
    // const positions = bms.Positioning.fromBMSChart(chart)
    const ks = bms.Keysounds.fromBMSChart(chart)

    // Keysounds
    const WAVS = []
    const WAVTypes = []
    const WAVFile = []
    let stringWAV = ''
    for (const id in ks._map) {
      const newid = (WAVS.length + 1).toString(16).padStart(4, 0).toUpperCase()
      const file = ks._map[id]
      const match = /([a-zA-Z]+)(\d*)_*(\S*)/g.exec(file)

      if (match && !WAVTypes.includes(match[1])) {
        WAVTypes.push(match[1])
      }

      // Prevent same keysound appear multiple times in #WAV
      // Sakura Fubuki [BMS]sakurafubuki_spn
      if (!WAVFile.includes(file)) {
        WAVS.push({ id, newid, file, type: match ? match[1] : '' })
        WAVFile.push(file)
        stringWAV += `#WAV${newid} ${file}\r\n`
      }
    }

    // NOTES
    const tracks = []
    const BGTracks = []
    for (let i = 0; i < 64; i++) {
      const str = i >= 20 ? '#0 VOLUME 117 0 0 0 0\r\n' : ''
      tracks.push(str)
      BGTracks.push([0])
    }
    let endPos = 0
    let songlength = 0
    for (const note of notes._notes) {
      // length of 1 measure in pt is 192
      // 4 beats in 1 measure
      // 1 beat = 48

      const start = note.beat * 48
      const ks = WAVS.filter(wav => wav.id.toUpperCase() === note.keysound.toUpperCase())[0]

      if (!note.column) {
        // background note
        if (ks) {
          const type = ks.type ? WAVTypes.indexOf(ks.type) : 43
          let track = type % 44 + 20
          // find empty track
          for (let i = track; i < 64; i++) {
            if (!BGTracks[i].includes(start)) {
              const isAnythingInRange = BGTracks[i].filter(pos => {
                return pos > start - 24
              }).length > 0
              if (!isAnythingInRange) {
                track = i
                break
              }
            } else if (i === 63) {
              i = 20
            } else {
              track = i
              break
            }
          }
          tracks[track] += `#${start} NOTE ${ks.newid} 127 64 0 6 0\r\n`
          BGTracks[track].push(start)
        }
      } else if (!note.endBeat) {
        const column = note.column === 'SC' ? 8 : parseInt(note.column)
        tracks[column] += `#${start} NOTE ${ks ? ks.newid : '0000'} 127 64 0 6 0\r\n`

        // add 1 measure delay at end
        const newend = (start + 6) + 192
        if (newend > endPos) {
          endPos = newend
        }
      } else {
        // long hold note
        const end = note.endBeat * 48
        const duration = end - start
        const column = note.column === 'SC' ? 8 : parseInt(note.column)
        tracks[column] += `#${start} NOTE ${ks ? ks.newid : '0000'} 127 64 0 ${duration} 0\r\n`

        // add 1 measure delay at end
        const newend = (end + 6) + 192
        if (newend > endPos) {
          endPos = newend
        }
      }
    }

    // BPM
    for (const data of timing._speedcore._segments) {
      const start = data.x * 48
      const bpm = convertInt(data.bpm)
      tracks[0] += `#${start} BPM_CHANGE ${bpm}\r\n`
    }
    const BPM = convertInt([0].bpm)

    // add song end note
    tracks[0] += `#${endPos} NOTE 0000 127 64 0 6 0\r\n`

    // caculate song length
    songlength = timing.beatToSeconds(endPos / 48)
    songlength = convertInt(songlength)

    // generate notes file string
    let stringNotes = ''
    for (let i = 0; i < tracks.length; i++) {
      stringNotes += '#0 TRACK_START 0 \'\'\r\n' + tracks[i]
    }
    for (let i = 0; i < 64 - tracks.length; i++) {
      stringNotes += '#0 TRACK_START 0 \'\'\r\n'
    }

    // Write File
    const output =
      `#SOUND_COUNT ${WAVS.length}\r\n` +
      '#TRACK_COUNT 64\r\n' +
      '#POSITION_PER_MEASURE 192\r\n' +
      `#BPM ${BPM}\r\n` +
      `#END_POSITION ${endPos}\r\n` +
      `#TAGB ${songlength}\r\n` +
      stringWAV +
      'POSITION COMMAND PARAMETER\r\n' +
      stringNotes
    fs.writeFileSync(path.parse(file).name + '.txt', output)
  } catch (error) {
    console.log(error + '\n')
  }
}
