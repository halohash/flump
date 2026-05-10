import { fetch } from "undici"
import express from "express"
import { spawn } from "child_process"
import fs from "fs"
import net from "net"
import { WebSocketServer } from "ws"

const app = express()

const PORT = process.env.PORT || 3000

const VNC_HOST = "127.0.0.1"
const VNC_PORT = 5901

const IMAGE_URL =
  "https://cloud-images.ubuntu.com/minimal/releases/jammy/release/ubuntu-22.04-minimal-cloudimg-amd64.img"

const IMAGE_PATH = "/tmp/disk.img"

let qemu = null

function log(msg) {
  console.log("[VM]", msg)
}

async function downloadImage() {
  log("Downloading disk image...")

  const res = await fetch(IMAGE_URL)

  log("Fetch status: " + res.status)

  if (!res.ok) {
    throw new Error("Failed to download image")
  }

  const buffer = Buffer.from(await res.arrayBuffer())

  fs.writeFileSync(IMAGE_PATH, buffer)

  log("Image saved to " + IMAGE_PATH)
  log("Size: " + fs.statSync(IMAGE_PATH).size)
}

function startQemu() {
  if (qemu) return

  if (!fs.existsSync(IMAGE_PATH)) {
    throw new Error("Disk image missing before QEMU start")
  }

  log("Starting QEMU...")

  qemu = spawn(
    "qemu-system-x86_64",
    [
      "-m",
      "1024",
      "-drive",
      `file=${IMAGE_PATH},format=raw`,
      "-vnc",
      `${VNC_HOST}:1`,
      "-display",
      "none",
      "-no-reboot"
    ],
    { stdio: "pipe" }
  )

  qemu.on("error", (err) => {
    console.log("QEMU ERROR:", err)
  })

  qemu.stdout.on("data", (d) => {
    console.log("QEMU:", d.toString())
  })

  qemu.stderr.on("data", (d) => {
    console.log("QEMU STDERR:", d.toString())
  })
}

function stopQemu() {
  if (qemu) {
    log("Stopping QEMU...")
    qemu.kill("SIGKILL")
    qemu = null
  }
}

function createVncBridge(server) {
  const wss = new WebSocketServer({ server, path: "/vnc" })

  wss.on("connection", (ws) => {
    const socket = net.connect(VNC_PORT, VNC_HOST)

    ws.on("message", (data) => socket.write(data))
    socket.on("data", (data) => ws.send(data))

    ws.on("close", () => socket.destroy())
    socket.on("close", () => ws.close())
  })
}

app.get("/api/start", async (req, res) => {
  try {
    log("START REQUEST RECEIVED")

    await downloadImage()

    log("File exists check: " + fs.existsSync(IMAGE_PATH))

    startQemu()

    res.json({ status: "started" })
  } catch (e) {
    console.log("START ERROR:", e)
    res.status(500).json({ error: e.message })
  }
})

app.get("/api/stop", (req, res) => {
  stopQemu()
  res.json({ status: "stopped" })
})

app.get("/api/status", (req, res) => {
  res.json({
    running: !!qemu,
    diskExists: fs.existsSync(IMAGE_PATH)
  })
})

app.use(express.static("public"))

const server = app.listen(PORT, () => {
  log("Server running on port " + PORT)
})

createVncBridge(server)
