// Some restricted Windows service accounts cannot resolve os.userInfo().
// tsx only needs the username to create a namespaced temporary directory.
const os = require("node:os")

try {
  os.userInfo()
} catch {
  os.userInfo = () => ({
    uid: -1,
    gid: -1,
    username: process.env.USERNAME || "lexiloop-worker",
    homedir: process.env.USERPROFILE || process.cwd(),
    shell: null,
  })
}
