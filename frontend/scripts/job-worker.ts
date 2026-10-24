import { runWorker } from "../src/lib/jobs/worker"

const once = process.argv.includes("--once")
runWorker({ once }).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
