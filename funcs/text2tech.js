const { convertBit } = require('./utils.js')
const bms = require('bms')
const fs = require('fs')
const path = require('path')

const regexWAV = /#WAV(.{4})\s(.*)/g
const regexBPM = /#BPM\s(.*)/g
const regexTrack = /#0 TRACK_START \d+ ''/g
const regexBPMChange = /#(\d+) BPM_CHANGE (\d+)/g
const regexNote = /#(\d+) NOTE (\S+) (\d+) (\d+) (\d+) (\d+) (\d+)/g

module.exports = async (dir, file) => {
  console.log(`Converting ${file} to tech...`)
  try {
    const wavs = []
    let initbpm = 0
    const notes = []
    const bpmEvents = []
    const video = {}
    const bmstimings = []

    // read pt text
    const data = fs.readFileSync(path.join(dir, file), 'utf8')
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
            bpm
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
              index: notes.length,
              pos: parseInt(match[1]),
              pulse: parseInt(match[1]) * 5,
              keysound: {
                id: match[2],
                file: wav.length > 0 ? wav[0].file : ''
              },
              attr: match[5],
              duration: parseInt(match[6]),
              duration2: parseInt(match[6]) * 5,
              // (vel / 127)^4
              vol: Math.round(Math.pow(parseInt(match[3]) / 127, 4) * 100) / 100,
              pan: Math.round(parseInt(match[4]) / 127 * 100) / 100 - 0.5,
              track: trackno,
              eos: 0,
              nodes: [
                {
                  anchor: {
                    pulse: 0,
                    lane: 0
                  },
                  controlLeft: {
                    pulse: 0,
                    lane: 0
                  },
                  controlRight: {
                    pulse: 0,
                    lane: 0
                  }
                },
                {
                  anchor: {
                    pulse: parseInt(match[6]) * 5,
                    lane: 0
                  },
                  controlLeft: {
                    pulse: 0,
                    lane: 0
                  },
                  controlRight: {
                    pulse: 0,
                    lane: 0
                  }
                }
              ]
            }
          )
        }
      }
    }
    // convert beat to ms
    const Timing = new bms.Timing(initbpm, bmstimings)

    // convert data
    video.offset = Math.round(Timing.beatToSeconds(video.beat)) / 1000
    notes.sort((a, b) => a.pos - b.pos)

    const repeat = [false, false, false, false]
    const chain = { active: false, start: 0 }
    for (const i in notes) {
      if (notes[i].track < 4) {
        // Convert repeat notes and chain notes
        if (notes[i].attr === '10') {
          if (!repeat[notes[i].track]) repeat[notes[i].track] = true
          else notes[i].attr = '11'
        } else if (notes[i].attr === '11' && repeat[notes[i].track]) {
          repeat[notes[i].track] = false
        } else if (notes[i].attr === '5') {
          chain.active = true
          chain.start = notes[i].pos
        } else if (notes[i].attr === '0' && notes[i].duration === 6 && chain.active && notes[i].pos > chain.start) {
          notes[i].attr = '6'
        } else if (notes[i].attr === '6') {
          chain.active = false
        }

        // is eos note or not
        if (notes[i].pos % 192 === 0) {
          const eosIdx = notes.findIndex(note => note.track === notes[i].track + 4 && note.pos === notes[i].pos)
          notes[i].eos = eosIdx > -1 ? 1 : 0
        }
      } else if (notes[i].track >= 4 && notes[i].track <= 7) {
        // find drag notes with special notes
        const target = notes.filter(note => {
          return note.track === notes[i].track - 4 && note.duration > 6 && note.attr === '0' && note.pos < notes[i].pos && notes[i].pos <= note.pos + note.duration
        }).sort((a, b) => b.pos - a.pos)[0]

        if (target) {
          const targetidx = notes.indexOf(target)
          if (notes[targetidx].nodes.length === 2 && notes[targetidx].nodes[1].anchor.pulse === notes[targetidx].duration2) {
            notes[targetidx].nodes.pop()
          }
          // anchorLane = (e.Attribute - 60f) * distanceToPreviousNode / 5400f
          const pulse = notes[i].pulse - notes[targetidx].pulse
          const distanceToPreviousNode = notes[targetidx].nodes.length === 1 ? pulse : pulse - notes[targetidx].nodes[notes[targetidx].nodes.length - 1].anchor.pulse
          notes[targetidx].nodes.push({
            anchor: {
              pulse,
              lane: (notes[i].attr - 60) * distanceToPreviousNode / 5400
            },
            controlLeft: {
              pulse: 0,
              lane: 0
            },
            controlRight: {
              pulse: 0,
              lane: 0
            }
          })
        }
      }
    }

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
      if (note.track >= 4 && note.track <= 7) continue
      switch (note.attr) {
        case '5':
          tech.packedNotes.push(`E|ChainHead|${note.pulse}|${note.track}|${note.vol}|${note.pan}|${note.eos}|${note.keysound.file}`)
          break
        case '6':
          tech.packedNotes.push(`E|ChainNode|${note.pulse}|${note.track}|${note.vol}|${note.pan}|${note.eos}|${note.keysound.file}`)
          break
        case '10':
          if (note.duration === 6) {
            tech.packedNotes.push(`E|RepeatHead|${note.pulse}|${note.track}|${note.vol}|${note.pan}|${note.eos}|${note.keysound.file}`)
          } else {
            tech.packedHoldNotes.push(`E|RepeatHeadHold|${note.track}|${note.pulse}|${note.duration2}|${note.vol}|${note.pan}|${note.eos}|${note.keysound.file}`)
          }
          break
        case '11':
          if (note.duration === 6) {
            tech.packedNotes.push(`E|Repeat|${note.pulse}|${note.track}|${note.vol}|${note.pan}|${note.eos}|${note.keysound.file}`)
          } else {
            tech.packedHoldNotes.push(`E|RepeatHold|${note.track}|${note.pulse}|${note.duration2}|${note.vol}|${note.pan}|${note.eos}|${note.keysound.file}`)
          }
          break
        case '12':
          // E|<type>|<lane>|<pulse>|<duration>|<volume>|<pan>|<end-of-scan>|<keysound>
          tech.packedHoldNotes.push(`E|Hold|${note.track}|${note.pulse}|${note.duration2}|${note.vol}|${note.pan}|${note.eos}|${note.keysound.file}`)
          break
        default:
          if (note.duration === 6) {
            // E|<type>|<pulse>|<lane>|<volume>|<pan>|<end-of-scan>|<keysound>
            tech.packedNotes.push(`E|Basic|${note.pulse}|${note.track}|${note.vol}|${note.pan}|${note.eos}|${note.keysound.file}`)
          } else {
            const nodes = note.nodes.map(node => {
              node = `${node.anchor.pulse}|${node.anchor.lane}|${node.controlLeft.pulse}|${node.controlLeft.lane}|${node.controlRight.pulse}|${node.controlRight.lane}`
              return node
            })
            tech.packedDragNotes.push({
              // convert timing and duration only
              // drag note format is really different between tech and pt
              packedNote: `E|Drag|${note.pulse}|${note.track}|${note.vol}|${note.pan}|1|${note.keysound.file}`,
              // <anchor pulse>|<anchor lane>|<left control point pulse>|<left control point lane>|<right control point pulse>|<right control point lane>
              packedNodes: nodes
            })
          }
          break
      }
    }
    fs.writeFileSync(path.join(dir, file + '.tech'), JSON.stringify(tech, null, '\t'))
  } catch (error) {
    console.log(error)
  }
}
