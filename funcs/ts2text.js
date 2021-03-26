const parser = require('fast-xml-parser')
const { convertInt } = require('./utils.js')
const fs = require('fs')
const path = require('path')

module.exports = async (file) => {
  console.log(`Converting ${file} to pt txt...`)

  try {
    const xml = fs.readFileSync(file, 'utf-8')
    const json = parser.parse(xml, {
      parseAttributeValue: true,
      ignoreAttributes: false,
      attributeNamePrefix: ''
    }).root

    // tempo = song bpm, tps = tick bpm * 6.4
    // pt = 192 per measure, 4 beat = 192
    // scale = 192 / tps
    // tick 2 pos = tick * scale
    const scale = 192 / json.header.songinfo.tpm

    // tapsonic pattern file only have 1 bg sound
    let stringWAV = ''
    if (Array.isArray(json.instrument.ins)) {
      const id = (1).toString(16).padStart(4, 0).toUpperCase()
      const file = json.instrument.ins[0].name
      stringWAV += `#WAV${id} ${file}\r\n`
    } else {
      const id = (1).toString(16).padStart(4, 0).toUpperCase()
      const file = json.instrument.ins.name
      stringWAV += `#WAV${id} ${file}\r\n`
    }

    const bpms = []
    if (Array.isArray(json.tempo.tempo)) {
      for (const tempo of json.tempo.tempo) {
        const pos = Math.round(tempo.tick * scale)
        bpms.push({
          value: tempo.tempo,
          pos
        })
      }
    } else {
      const pos = Math.round(json.tempo.tempo.tick * scale)
      bpms.push({
        value: json.tempo.tempo.tempo,
        pos
      })
    }

    const notes = []
    for (const track of json.note_list.track) {
      if (Array.isArray(track.note)) {
        for (const note of track.note) {
          const pos = Math.round(note.tick * scale)
          notes.push({
            track: track.idx,
            pos,
            ins: note.ins || 0
          })
        }
      } else {
        const pos = Math.round(track.note.tick * scale)
        notes.push({
          track: track.idx,
          pos,
          ins: track.note.ins || 0
        })
      }
    }

    let stringNotes = ''
    for (let i = 0; i < 64; i++) {
      stringNotes += '#0 TRACK_START 0 \'\'\r\n'
      if (i === 0) {
        for (const bpm of bpms) {
          stringNotes += `#${bpm.pos} BPM_CHANGE ${convertInt(bpm.value)}\r\n`
        }
      }
      for (const note of notes) {
        if (note.track === i) {
          const sid = (i === 31 && note.ins === 1) ? '0001' : '0000'
          stringNotes += `#${note.pos} NOTE ${sid} 127 64 0 6 0\r\n`
        }
      }
    }

    // write to file
    const output =
    '#SOUND_COUNT 1\r\n' +
    '#TRACK_COUNT 64\r\n' +
    '#POSITION_PER_MEASURE 192\r\n' +
    `#BPM ${convertInt(json.header.songinfo.tempo)}\r\n` +
    `#END_POSITION ${convertInt(Math.round(json.header.songinfo.end_tick * scale))}\r\n` +
    `#TAGB ${convertInt(json.header.songinfo.ms / 1000)}\r\n` +
    stringWAV +
    'POSITION COMMAND PARAMETER\r\n' +
    stringNotes
    fs.writeFileSync(path.parse(file).name + '.txt', output)
  } catch (error) {
    console.log(error + '\n')
  }
}
