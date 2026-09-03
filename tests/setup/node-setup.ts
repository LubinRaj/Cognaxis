import http from "node:http";
import https from "node:https";
import net from "node:net";

// Supertest starts an ephemeral server per request with listen(0), which binds the wildcard
// address inside the operating system's ephemeral port range. Desktop apps on macOS (VS Code
// helpers, ChatGPT, and similar) hold long-lived 127.0.0.1-specific HTTP listeners in that same
// range; SO_REUSEADDR lets a wildcard bind land on such a port, and loopback connections then
// route to the more-specific foreign socket, which answers an unknown /api path with a bare,
// header-less 404 or 401 (observed roughly once per twenty full parallel runs, always without the
// x-request-id header this app stamps on every response). Supertest needs the port synchronously,
// and Node resolves any explicit host asynchronously, so binding to loopback is not an option.
// Instead, allocate test ports from a fixed band well below the ephemeral range, spread across
// worker processes, retrying past any port that is genuinely in use.
// eslint-disable-next-line @typescript-eslint/unbound-method -- rebound explicitly via .call/.apply
const originalListen = net.Server.prototype.listen as (
  this: net.Server,
  ...args: unknown[]
) => net.Server;
const TEST_PORT_BAND_START = 20000;
const TEST_PORT_BAND_SIZE = 9000;
let portCursor = (process.pid * 613) % TEST_PORT_BAND_SIZE;
net.Server.prototype.listen = function (this: net.Server, ...args: unknown[]) {
  const callback = typeof args[1] === "function" ? (args[1] as () => void) : undefined;
  const isBareEphemeral =
    args[0] === 0 && (args.length === 1 || (args.length === 2 && callback !== undefined));
  if (!isBareEphemeral) return originalListen.apply(this, args);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    portCursor = (portCursor + 1) % TEST_PORT_BAND_SIZE;
    const swallowBindError = () => undefined;
    this.once("error", swallowBindError);
    originalListen.call(this, TEST_PORT_BAND_START + portCursor);
    if (this.address() !== null) {
      this.removeListener("error", swallowBindError);
      if (callback) this.once("listening", callback);
      return this;
    }
    // The failed bind emits its error on the next tick; the swallow listener stays to absorb it.
  }
  return callback ? originalListen.call(this, 0, callback) : originalListen.call(this, 0);
} as net.Server["listen"];

// Node 19+ enables keep-alive on the global agent. Supertest starts an ephemeral server per
// request, so an idle pooled socket can outlive its server; when the operating system recycles
// that ephemeral port for a different test app's server, a later request rides the stale socket
// to the old, still-lingering server and receives an unrelated response (observed as rare 401/404
// flakes under full parallel runs). Fresh sockets per request make delivery deterministic.
http.globalAgent = new http.Agent({ keepAlive: false });
https.globalAgent = new https.Agent({ keepAlive: false });

// A bare "expected 200, got 404" from supertest is undiagnosable in CI logs. Appending the
// response body to every status-assertion failure makes each mismatch self-explaining without
// touching individual tests.
const { Test } = await import("supertest");
type ResponseLike = { text?: string; headers?: Record<string, string> };
type StatusAssert = (status: number, res: ResponseLike) => Error | undefined;
const testPrototype = Test.prototype as unknown as { _assertStatus: StatusAssert };
const originalAssertStatus = testPrototype._assertStatus;
testPrototype._assertStatus = function (status, res) {
  const error = originalAssertStatus.call(this, status, res);
  if (error) {
    const headers = res?.headers ?? {};
    error.message +=
      ` — body: ${(res?.text ?? "<none>").slice(0, 500)}` +
      ` — x-request-id: ${headers["x-request-id"] ?? "<absent>"}` +
      ` — content-type: ${headers["content-type"] ?? "<absent>"}`;
  }
  return error;
};
