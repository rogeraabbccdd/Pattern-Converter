const { convertInt } = require('./utils.js')
const fs = require('fs')
const path = require('path')
const LineByLine = require('n-readlines')

module.exports = async (file) => {
  console.log(`Converting ${file} to pt text...`)
  try {
    const liner = new LineByLine(file)
    let line = liner.next()
    const hitSounds = { 0: 'hitnormal.wav', 2: 'hitwhistle.wav', 4: 'hitfinish.wav', 8: 'hitclap.wav' }
    let lineNumber = 0
    const regexSection = /\[(.+)\]/gim
    let section = ''
    let sampleSet = ''
    const wavs = []
    const notes = []
    const timings = []
    // read osu file
    while (line) {
      lineNumber++
      const text = line.toString('utf-8').trim()
      if (text.length !== 0) {
        if (lineNumber === 1 && text !== 'osu file format v14') return 'version'

        // parse sections
        const sectionTest = regexSection.exec(text)
        if (sectionTest !== null) {
          section = sectionTest[1]
          line = liner.next()
          continue
        }

        // collect data
        switch (section) {
          case 'General': {
            if (text.includes('Mode') && text.replace('Mode:', '').trim() !== '3') {
              return 'mode'
            } else if (text.includes('SampleSet')) {
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
              bpm = Math.round(60000 / data[1])
            } else {
              bpm = timings[timings.length - 1].bpm * Math.abs(100 / data[1])
            }
            const vol = parseInt(data[5]) > 0 ? parseInt(data[5]) : timings[timings.length - 1].vol
            timings.push({ bpm, vol, ms: data[0] })
            break
          }
          case 'HitObjects': {
            const tmp = text.split(',')
            const tmp2 = tmp[5].split(':')
            tmp.pop()
            const data = tmp.concat(tmp2)
            // x,y,time,type,hitSound,endTime:hitSample
            const track = data[0] === '64' ? 0 : data[0] === '192' ? 1 : data[0] === '320' ? 2 : 3
            const endms = parseInt(data[5]) > 0 ? parseInt(data[5]) : 0
            const ms = parseInt(data[2])
            let vol = parseInt(data[8])
            if (vol === 0) {
              for (const i in timings) {
                if (timings[i].ms > ms) {
                  vol = timings[i - 1].vol
                } else if (timings[i].ms === ms) {
                  vol = timings[i].vol
                }
              }
            }
            let wavFile = data[data.length - 1]
            if (wavFile.trim().length === 0) {
              wavFile = `${sampleSet}-${hitSounds[data[4]]}`
            }
            notes.push({ attr: 0, ms, wavFile, vol, bg: false, endms, track })
            if (!wavs.some(wav => wav.file === wavFile.replace(/"/g, ''))) wavs.push({ file: wavFile.replace(/"/g, '') })
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
    const startms = timings[0].ms
    const startpos = 384
    const BPM = timings[0].bpm
    timings.map(timing => {
      timing.pos = startpos + (Math.round((timing.ms - startms) / (60000 / BPM) * 100) / 100 * 48)
      return timing
    })
    notes.map(note => {
      note.wavid = wavs.find(wav => wav.file.replace(/"/g, '') === note.wavFile.replace(/"/g, '')).id
      // 1 beat ms = 60000 / BPM
      // 1 beat = 48 pos
      note.pos = startpos + Math.round(Math.round((note.ms - startms) / (60000 / BPM) * 100) / 100 * 48)
      let duration = 6
      if (note.endms > 0) {
        duration = (startpos + Math.round(Math.round((note.endms - startms) / (60000 / BPM) * 100) / 100 * 48)) - note.pos
      }
      note.duration = duration
      note.volume = Math.round(note.vol / 100 * 127)
      return note
    })
    notes.sort((a, b) => a.pos - b.pos)
    const endPos = notes[notes.length - 1].pos + 192
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
          stringNotes += `#${note.pos} NOTE ${note.wavid} ${note.volume} 64 0 ${note.duration} 0\r\n`
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
    fs.writeFileSync(path.parse(file).name + '.txt', output)
  } catch (error) {
    console.log(error)
  }
}
