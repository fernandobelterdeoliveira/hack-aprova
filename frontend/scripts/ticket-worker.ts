import {runWorker} from "../src/lib/jobs/worker"
import {TICKET_JOB} from "../src/lib/municipal/tickets"
runWorker({types:[TICKET_JOB],concurrency:2,pollMs:750}).catch(error=>{console.error(error);process.exitCode=1})
