import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const siteDir = resolve(here, "../bubu-teacher-workflow");
const chromePath =
  process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function ensureInsideRoot(filePath) {
  const normalizedRoot = siteDir.endsWith(sep) ? siteDir : siteDir + sep;
  const normalizedFile = resolve(filePath);
  return normalizedFile === siteDir || normalizedFile.startsWith(normalizedRoot);
}

async function startStaticServer() {
  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const rel = decodeURIComponent(url.pathname.slice(1));
      const filePath = resolve(siteDir, rel || "index.html");
      if (!ensureInsideRoot(filePath) || !existsSync(filePath)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const ext = filePath.toLowerCase().split(".").pop();
      const type = ext === "html" ? "text/html; charset=utf-8" : "application/octet-stream";
      res.writeHead(200, { "Content-Type": type });
      res.end(readFileSync(filePath));
    } catch (error) {
      res.writeHead(500);
      res.end(String(error?.stack || error));
    }
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  return server;
}

function connectCdp(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();

  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    if (!data.id || !pending.has(data.id)) return;
    const { resolve: resolvePending, reject } = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) reject(new Error(data.error.message || JSON.stringify(data.error)));
    else resolvePending(data.result || {});
  });

  return new Promise((resolveConnect, rejectConnect) => {
    socket.addEventListener("open", () => {
      resolveConnect({
        send(method, params = {}) {
          const id = ++seq;
          socket.send(JSON.stringify({ id, method, params }));
          return new Promise((resolveSend, rejectSend) => {
            pending.set(id, { resolve: resolveSend, reject: rejectSend });
          });
        },
        close() {
          socket.close();
        },
      });
    });
    socket.addEventListener("error", () => rejectConnect(new Error("CDP WebSocket failed")));
  });
}

async function launchChrome(port) {
  const userDataDir = await mkdtemp(join(tmpdir(), "bubu-class-sync-"));
  const chrome = spawn(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-extensions",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return { chrome, userDataDir };
    } catch {}
    await sleep(100);
  }
  throw new Error("Chrome did not start CDP in time.");
}

async function openCdpPage(cdpPort, url) {
  const create = await fetch(`http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent(url)}`, {
    method: "PUT",
  });
  assert.ok(create.ok, `Could not create CDP page: ${create.status}`);
  const target = await create.json();
  const page = await connectCdp(target.webSocketDebuggerUrl);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Page.navigate", { url });
  await waitFor(page, "document.readyState === 'complete'", "page load");
  return page;
}

async function evalIn(page, expression) {
  const result = await page.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed");
  }
  return result.result?.value;
}

async function waitFor(page, expression, label, timeoutMs = 6000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const value = await evalIn(page, expression);
    if (value) return value;
    await sleep(120);
  }
  throw new Error(`Timed out waiting for ${label}: ${expression}`);
}

async function main() {
  const server = await startStaticServer();
  const cdpPort = 9338;
  let chrome;
  let userDataDir;
  let board;
  let student;
  try {
    ({ chrome, userDataDir } = await launchChrome(cdpPort));
    const port = server.address().port;
    const boardUrl = `http://127.0.0.1:${port}/${encodeURIComponent("步步_白板端_大屏.html")}`;
    const studentUrl = `http://127.0.0.1:${port}/${encodeURIComponent("步步_学生端_平板.html")}`;

    board = await openCdpPage(cdpPort, boardUrl);
    student = await openCdpPage(cdpPort, studentUrl);
    await evalIn(board, "localStorage.clear(); true");
    await evalIn(student, "localStorage.clear(); true");
    await waitFor(board, "document.querySelector('#sceneRoot')?.children.length > 0", "whiteboard initial render");
    await waitFor(student, "document.querySelector('#classStage')?.children.length > 0", "student initial render");

    await evalIn(board, "selectScene('live', true); true");
    await waitFor(board, "!!document.querySelector('[data-act=\"livePush\"]')", "live push button");
    await evalIn(board, "document.querySelector('[data-act=\"livePush\"]').click(); true");
    await waitFor(
      student,
      "document.querySelector('.s-panel.active')?.dataset.pane === 'classroom' && document.querySelector('#classTitle')?.textContent.includes('随堂')",
      "student receives live question",
    );

    await evalIn(
      student,
      "document.querySelector('#optList .opt[data-opt=\"C\"]').click(); document.querySelector('#optSubmit').click(); true",
    );
    await waitFor(
      board,
      "document.querySelector('[data-sync-role=\"live-progress\"]')?.textContent.includes('1 / 28')",
      "board live progress updates from student submission",
    );
    await waitFor(
      board,
      "document.querySelector('[data-sync-role=\"typical-reason\"]')?.textContent.includes('C')",
      "board shows submitted option distribution",
    );

    await evalIn(board, "selectScene('draw', true); true");
    await waitFor(board, "!!document.querySelector('[data-act=\"drawAccept\"]')", "draw accept button");
    await evalIn(board, "document.querySelector('[data-act=\"drawAccept\"]').click(); true");
    await waitFor(student, "document.body.innerText.includes('轮到你回答')", "target student prompt");

    await evalIn(
      board,
      "writeBubuSync({source:'board', drawCall:{id:'other-student-test', target:'陈小刚', targetId:'chen-xiaogang', question:'说一说 4/9 为什么接近 1/2', status:'called', at:Date.now()}, classroom:{scene:'draw', title:'抽人提问', desc:'陈小刚正在回答'}}); true",
    );
    await waitFor(student, "document.body.innerText.includes('正在听陈小刚回答')", "listener student prompt");

    console.log("Classroom sync smoke test passed.");
  } finally {
    board?.close();
    student?.close();
    server.close();
    if (chrome) chrome.kill();
    if (userDataDir) {
      await sleep(300);
      try {
        await rm(userDataDir, { recursive: true, force: true });
      } catch {}
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
