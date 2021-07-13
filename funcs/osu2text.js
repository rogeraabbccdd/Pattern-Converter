const { convertInt } = require('./utils.js')
const fs = require('fs')
const path = require('path')
const LineByLine = require('n-readlines')

module.exports = async (dir, file) => {
  console.log(`Converting ${file} to pt text...`)

  const keys = [14, 42, 71, 99, 128, 156, 184, 213, 241, 270, 298, 327, 355, 384, 412, 440, 469, 497]
  try {
    const liner = new LineByLine(path.join(dir, file))
    let line = liner.next()

    const hitSounds = { 0: 'hitnormal.wav', 2: 'hitwhistle.wav', 4: 'hitfinish.wav', 8: 'hitclap.wav' }
    let lineNumber = 0
    const regexSection = /^\[(.+)\]/gim
    let section = ''
    let sampleSet = ''
    const wavs = []
    const notes = []
    let timings = []
    let parsedTiming = false
    // read osu file
    while (line) {
      lineNumber++
      const text = line.toString('utf-8').trim()
      if (text.length !== 0) {
        if (lineNumber === 1 && text !== 'osu file format v14') return 'version'

        // parse sections
        const sectionText = regexSection.exec(text)
        if (sectionText !== null) {
          section = sectionText[1]
          if (section === 'TimingPoints') {
            parsedTiming = true
          }

          if (sectionText[1] !== 'TimingPoints' && parsedTiming) {
            const tmp = timings[timings.length - 1]
            timings.push({ bpm: tmp.bpm, vol: tmp.vol, ms: tmp.ms, interval: tmp.interval })
          }
          line = liner.next()
          continue
        }

        // collect data
        switch (section) {
          case 'General': {
            if (text.includes('Mode') && text.replace('Mode:', '').trim() !== '3') {
              return 'mode'
            } else if (text.toUpperCase().includes('SAMPLESET')) {
              sampleSet = text.replace(/sampleset:/gi, '').trim().toLowerCase()
            }
            break
          }
          case 'Events': {
            const data = text.split(',')
            if (data[0] === 'Sample') {
              const ms = parseInt(data[1])
              const posTaken = notes.find(note => note.track === 20 && note.ms === ms)
              const track = posTaken ? 21 : 20
              notes.push({ attr: 0, ms, wavFile: data[3], vol: parseInt(data[4]), track, endms: 0 })
              if (!wavs.some(wav => wav.file === data[3].replace(/"/g, ''))) wavs.push({ file: data[3].replace(/"/g, '') })
            }
            break
          }
          case 'TimingPoints': {
            // time,beatLength,meter,sampleSet,sampleIndex,volume,uninherited,effects
            const data = text.split(',')
            let bpm = 60
            if (data[1] > 0) {
              bpm = Math.round(60000 / data[1] * 100) / 100
            } else {
              bpm = timings[timings.length - 1].bpm * Math.abs(100 / data[1])
            }
            const vol = parseInt(data[5]) / 100
            timings.push({ bpm, vol, ms: parseInt(data[0]), interval: parseFloat(data[1]) })
            break
          }
          case 'HitObjects': {
            const tmp = text.split(',')
            const tmp2 = tmp[5].split(':')
            tmp.pop()
            const data = tmp.concat(tmp2)
            // x,y,time,type,hitSound,endTime:hitSample
            const track = keys.indexOf(parseInt(data[0]))
            const endms = parseInt(data[5]) > 0 ? parseInt(data[5]) : 0
            const ms = parseInt(data[2])
            let vol = parseInt(data[8])
            if (vol === 0) {
              for (const i in timings) {
                if (ms > timings[i].ms) {
                  vol = timings[i].vol
                } else if (timings[i].ms === ms) {
                  vol = timings[i].vol
                  break
                }
              }
            }
            let wavFile = data[data.length - 1]
            if (wavFile.trim().length === 0) {
              let count = 0
              for (const i in hitSounds) {
                const ks = data[4] & i
                if (ks > 0) {
                  wavFile = `${sampleSet}-${hitSounds[ks]}`
                  if (!wavs.some(wav => wav.file === wavFile.replace(/"/g, ''))) wavs.push({ file: wavFile.replace(/"/g, '') })
                  count++
                  if (count === 1) notes.push({ attr: 0, ms, wavFile, vol, bg: false, endms, track })
                  else notes.push({ attr: 0, ms, wavFile, vol, bg: true, endms, track: 20 + count })
                } else {
                  notes.push({ attr: 0, ms, wavFile, vol, bg: true, endms: 0, track })
                }
              }
            } else {
              notes.push({ attr: 0, ms, wavFile, vol, bg: true, endms, track })
            }
            break
          }
        }
      }
      line = liner.next()
    }
    // map keysounds
    wavs.map((wav, i) => {
      wav.id = (i + 1).toString(16).padStart(4, 0).toUpperCase()
      return wav
    })

    // map notes
    const startpos = 384
    const BPM = timings[0].bpm
    // caculate timing start pos
    // 1 beat ms = 60000 / BPM
    // 1 beat = 48 pos
    for (let i = 0; i < timings.length; i++) {
      if (i === 0) {
        timings[i].beat = 0
        timings[i].pos = 0
      } else {
        timings[i].beat = timings[i - 1].beat + (timings[i].ms - timings[i - 1].ms) / timings[i - 1].interval
        timings[i].pos = startpos + Math.round(timings[i].beat * 48)
      }
    }
    timings = timings.filter((item, index, self) => {
      return index === 0 ? true : (item.bpm !== self[index - 1].bpm || item.vol !== self[index - 1].vol)
    })
    notes.map(note => {
      note.wavid = note.wavid ? wavs.find(wav => wav.file.replace(/"/g, '') === note.wavFile.replace(/"/g, '')).id : 0
      // find current timing point
      let timingidx = 0
      let found = false
      for (let i = 0; i < timings.length; i++) {
        if (timings[i].ms === note.ms) {
          timingidx = i
          found = true
          break
        } else if (timings[i].ms > note.ms) {
          timingidx = i - 1
          found = true
          break
        }
      }
      if (!found) timingidx = timings.length - 1
      const timing = timings[timingidx]
      note.pos = timing.pos + Math.round(((note.ms - timing.ms) / timing.interval) * 48)
      let duration = 6
      note.attr = 0
      if (note.endms > 0) {
        const endpos = timing.pos + Math.round(((note.endms - timing.ms) / timing.interval) * 48)
        duration = endpos - note.pos
        note.attr = 12
      }
      note.duration = duration
      if (timingidx === 0) {
        note.pos += startpos
      }
      note.volume = Math.round(127 * Math.pow(note.vol, 1 / 4))
      return note
    })
    notes.sort((a, b) => a.pos - b.pos)
    const endPos = notes[notes.length - 1].pos + notes[notes.length - 1].duration + 192
    notes.push({
      attr: 0,
      pos: endPos,
      duration: 6,
      volume: 127
    })
    const songlength = convertInt(Math.ceil(endPos / 48 * (60000 / BPM)))

    let stringWAV = ''
    for (const wav of wavs) {
      stringWAV += `#WAV${wav.id} ${wav.file}\r\n`
    }

    let stringNotes = ''
    for (let i = 0; i < 64; i++) {
      stringNotes += '#0 TRACK_START 0 \'\'\r\n'
      if (i === 0) {
        for (const j in timings) {
          if (parseInt(j) === 0 || (parseInt(j) > 0 && timings[parseInt(j)].bpm !== timings[parseInt(j) - 1].bpm)) {
            stringNotes += `#${timings[j].pos} BPM_CHANGE ${convertInt(timings[j].bpm)}\r\n`
          }
        }
      }
      for (const note of notes) {
        if (note.track === i) {
          stringNotes += `#${note.pos} NOTE ${note.wavid} ${note.volume} 64 ${note.attr} ${note.duration} 0\r\n`
        }
      }
    }

    // Write File
    const output =
      `#SOUND_COUNT ${wavs.length}\r\n` +
      '#TRACK_COUNT 64\r\n' +
      '#POSITION_PER_MEASURE 192\r\n' +
      `#BPM ${convertInt(BPM)}\r\n` +
      `#END_POSITION ${endPos}\r\n` +
      `#TAGB ${songlength}\r\n` +
      stringWAV +
      'POSITION COMMAND PARAMETER\r\n' +
      stringNotes
    fs.writeFileSync(path.join(dir, path.parse(file).name + '.txt'), output)
  } catch (error) {
    console.log(error)
  }
}
