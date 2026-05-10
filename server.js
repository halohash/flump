import express from "express"
import { spawn } from "child_process"
import net from "net"
import { WebSocketServer } from "ws"
import fs from "fs"

const app = express()

const VNC_HOST = "127.0.0.1"
const VNC_PORT = 5901
const HTTP_PORT = 3000

let qemuProcess = null

function startQemu() {
  if (qemuProcess) return

  qemuProcess = spawn("qemu-system-x86_64", [
    "-m",
    "1024",
    "-hda",
    "/tmp/disk.img",
    "-vnc",
    `${VNC_HOST}:1`,
    "-display",
    "none"
  ])
}

function stopQemu() {
  if (qemuProcess) qemuProcess.kill("SIGKILL")
  qemuProcess = null
}

function createVncProxy(server) {
  const wss = new WebSocketServer({ server, path: "/vnc" })

  wss.on("connection", ws => {
    const socket = net.connect(VNC_PORT, VNC_HOST)

    ws.on("message", data => {
      socket.write(data)
    })

    socket.on("data", data => {
      ws.send(data)
    })

    ws.on("close", () => socket.destroy())
    socket.on("close", () => ws.close())
    socket.on("error", () => ws.close())
  })
}

app.use(express.static("public"))

app.get("/api/start", (req, res) => {
  startQemu()
  res.json({ status: "started" })
})

app.get("/api/stop", (req, res) => {
  stopQemu()
  res.json({ status: "stopped" })
})

const server = app.listen(HTTP_PORT)

createVncProxy(server)

startQemu()
