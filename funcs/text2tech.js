const { convertBit } = require('./utils.js')
const bms = require('bms')
const fs = require('fs')

const regexWAV = /#WAV(.{4})\s(.*)/g
const regexBPM = /#BPM\s(.*)/g
const regexTrack = /#0 TRACK_START 0 ''/g
const regexBPMChange = /#(\d+) BPM_CHANGE (\d+)/g
const regexNote = /#(\d+) NOTE (\S+) (\d+) (\d+) (\d+) (\d+) (\d+)/g

module.exports = async (file) => {
  console.log(`Converting ${file} to tech...`)
  try {
    const wavs = []
    let initbpm = 0
    const notes = []
    const bpmEvents = []
    const video = {}
    const bmstimings = []

    // read pt text
    const data = fs.readFileSync(file, 'utf8')
    const lines = data.split(/\r\n/g)

    let trackno = -1

    // analyze by line
    for await (const line of lines) {
      // i don't know why regex.exec() only parse odd lines
      // track data
      let matches = line.matchAll(regexBPM)
      for (const match of matches) {
        initbpm = convertBit(match[1])
      }
      // parse keysounds
      matches = line.matchAll(regexWAV)
      for (const match of matches) {
        wavs.push({ id: match[1].toString(), file: match[2] })
      }
      // parse tracks
      matches = line.match(regexTrack)
      if (matches) {
        trackno++
      }
      // parse bpm changes
      matches = line.matchAll(regexBPMChange)
      for (const match of matches) {
        const bpm = convertBit(match[2])
        bpmEvents.push(
          {
            pulse: parseInt(match[1]) * 5,
            bpm: bpm
          }
        )
        bmstimings.push(
          {
            type: 'bpm',
            beat: parseInt(match[1]) / 48,
            bpm
          }
        )
      }
      // parse notes
      matches = line.matchAll(regexNote)
      for (const match of matches) {
        const wav = wavs.filter(wav => wav.id === match[2])
        if (match[5] === '100') {
          video.beat = parseInt(match[1]) * 5
        } else {
          notes.push(
            {
              pulse: parseInt(match[1]) * 5,
              keysound: {
                id: match[2],
                file: wav.length > 0 ? wav[0].file : ''
              },
              // resolve repeat note attr
              attr: notes.length > 1 && notes[notes.length - 1].attr === '10' && match[5] === '10' ? '11' : match[5],
              duration: parseInt(match[6]),
              duration2: parseInt(match[6]) * 5,
              track: trackno
            }
          )
        }
      }
    }
    // convert beat to ms
    const Timing = new bms.Timing(initbpm, bmstimings)
    notes.sort((a, b) => {
      return b.timing - a.timing
    })
    // convert data
    video.offset = Math.round(Timing.beatToSeconds(video.beat)) / 1000

    const tech = {
      patternMetadata: {
        initBpm: bpmEvents[0].bpm * 1.0,
        bgaOffset: video.offset,
        controlScheme: 0,
        lanes: 0,
        firstBeatOffset: 0.0,
        bps: 4
      },
      bpmEvents,
      packedNotes: [],
      packedHoldNotes: [],
      packedDragNotes: []
    }
    for (const note of notes) {
      switch (note.attr) {
        case '0':
          if (note.duration === 6) {
            tech.packedNotes.push(`Basic|${note.pulse}|${note.track}|${note.keysound.file}`)
          } else {
            tech.packedDragNotes.push({
              // convert timing and duration only
              // drag note format is really different between tech and pt
              packedNote: `Drag|${note.pulse}|${note.track}|${note.keysound.file}`,
              packedNodes: [
                '0|0|0|0|0|0',
                `${note.duration2}|0|0|0|0|0`
              ]
            })
          }
          break
        case '5':
          tech.packedNotes.push(`ChainHead|${note.pulse}|${note.track}|${note.keysound.file}`)
          break
        case '6':
          tech.packedNotes.push(`ChainNode|${note.pulse}|${note.track}|${note.keysound.file}`)
          break
        case '10':
          if (note.duration === 6) {
            tech.packedNotes.push(`RepeatHead|${note.pulse}|${note.track}|${note.keysound.file}`)
          } else {
            tech.packedHoldNotes.push(`RepeatHeadHold|${note.track}|${note.pulse}|${note.duration2}|${note.keysound.file}`)
          }
          break
        case '11':
          if (note.duration === 6) {
            tech.packedNotes.push(`Repeat|${note.pulse}|${note.track}|${note.keysound.file}`)
          } else {
            tech.packedHoldNotes.push(`RepeatHold|${note.track}|${note.pulse}|${note.duration2}|${note.keysound.file}`)
          }
          break
        case '12':
          tech.packedHoldNotes.push(`Hold|${note.track}|${note.pulse}|${note.duration2}|${note.keysound.file}`)
          break
      }
    }
    fs.writeFileSync(file + '.tech', JSON.stringify(tech, null, '\t'))
  } catch (error) {
    console.log(error)
  }
}
