import 'dotenv/config'
import process from 'node:process'

const PDS_HOSTNAME = process.env.PDS_HOSTNAME ?? 'pds2.poltr.info'
const RAW_FIREHOSE = process.env.FIREHOSE_URL

export let FIREHOSE_SERVICE
if (RAW_FIREHOSE) {
  if (/\/xrpc\//.test(RAW_FIREHOSE)) {
    try {
      const u = new URL(RAW_FIREHOSE)
      FIREHOSE_SERVICE = `${u.protocol}//${u.host}`
    } catch {
      FIREHOSE_SERVICE = RAW_FIREHOSE.replace(/\/xrpc\/.*/, '')
    }
  } else {
    FIREHOSE_SERVICE = RAW_FIREHOSE
  }
} else {
  FIREHOSE_SERVICE = `wss://${PDS_HOSTNAME}`
}


// console.log('Using firehose service base:', FIREHOSE_SERVICE)
