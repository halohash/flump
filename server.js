import express from "express"
import { spawn } from "child_process"
import net from "net"
import fs from "fs"
import { WebSocketServer } from "ws"

const app = express()

const PORT = 3000

const VNC_HOST = "127.0.0.1"
const VNC_PORT = 5901

const IMAGE_URL = "https://file.garden/aUYIWVAKvQxCBY-_/vm_node/main.img"
const IMAGE_PATH = "/tmp/disk.img"

let qemu = null

async function downloadImage() {
  if (fs.existsSync(IMAGE_PATH)) return

  const res = await fetch(IMAGE_URL)
  if (!res.ok) throw new Error("Failed to download VM image")

  const buffer = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(IMAGE_PATH, buffer)
}

function startQemu() {
  if (qemu) return

  qemu = spawn("qemu-system-x86_64", [
    "-m",
    "1024",
    "-hda",
    IMAGE_PATH,
    "-vnc",
    `${VNC_HOST}:1`,
    "-display",
    "none",
    "-no-reboot"
  ])
}

function stopQemu() {
  if (qemu) qemu.kill("SIGKILL")
  qemu = null
}

function createVncBridge(server) {
  const wss = new WebSocketServer({ server, path: "/vnc" })

  wss.on("connection", ws => {
    const socket = net.connect(VNC_PORT, VNC_HOST)

    ws.on("message", data => socket.write(data))
    socket.on("data", data => ws.send(data))

    ws.on("close", () => socket.destroy())
    socket.on("close", () => ws.close())
    socket.on("error", () => ws.close())
  })
}

app.use(express.static("public"))

app.get("/api/start", async (req, res) => {
  try {
    await downloadImage()
    startQemu()
    res.json({ status: "started" })
  } catch (e) {
    res.status(500).json({ error: "failed to start vm" })
  }
})

app.get("/api/stop", (req, res) => {
  stopQemu()
  res.json({ status: "stopped" })
})

app.get("/api/restart", async (req, res) => {
  stopQemu()
  setTimeout(startQemu, 2000)
  res.json({ status: "restarting" })
})

app.get("/api/status", (req, res) => {
  res.json({
    running: !!qemu
  })
})

const server = app.listen(PORT, () => {
  console.log("Server running on port", PORT)
})

createVncBridge(server)

startQemu()
