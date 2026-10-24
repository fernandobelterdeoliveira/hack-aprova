// Compatibility entry point: prepare the current municipal scenarios instead of the old generic sample.
import {spawnSync} from "node:child_process"
const result=spawnSync(process.execPath,["--require","./scripts/tsx-windows-shim.cjs","--env-file=.env.local","--import","tsx","scripts/seed-municipal-showcase.mjs"],{stdio:"inherit"})
if(result.error)throw result.error
process.exitCode=result.status??1
