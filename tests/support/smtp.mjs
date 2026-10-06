/**
 * A mail catcher for the browser tests: a small SMTP server on this machine
 * that takes whatever the app sends and keeps it, so a test can read the
 * email that went out (who it was from and to, its headers and its text).
 * No dependencies, and no TLS: the app sends unencrypted only to this
 * machine (src/lib/server/mail.js).
 *
 *   const mail = await startMailCatcher(2525);
 *   mail.refuse = /nobody@/;          // answer 550 for matching recipients
 *   ... await until(() => mail.messages.length) ...
 *   await mail.close();
 *
 * The app must be started with SMTP_HOST=127.0.0.1 and SMTP_PORT set to the
 * same port (and any SMTP_USER and SMTP_PASSWORD).
 */
import net from "node:net";

/** Decode a quoted-printable body. */
const unQuote = (text) =>
  Buffer.from(
    text.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))),
    "latin1"
  ).toString("utf8");

/** Split a message into headers (lower-cased names, folded lines joined) and its decoded text. */
function parse(envelope, raw) {
  const split = raw.indexOf("\r\n\r\n");
  const head = split < 0 ? raw : raw.slice(0, split);
  const body = split < 0 ? "" : raw.slice(split + 4);
  const headers = {};
  for (const line of head.replace(/\r\n[ \t]+/g, " ").split("\r\n")) {
    const at = line.indexOf(":");
    if (at > 0) headers[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim();
  }
  const encoding = (headers["content-transfer-encoding"] ?? "").toLowerCase();
  const text = encoding === "quoted-printable" ? unQuote(body)
    : encoding === "base64" ? Buffer.from(body, "base64").toString("utf8")
    : body;
  return { from: envelope.from, to: envelope.to, headers, text: text.replace(/\r\n/g, "\n"), raw };
}

export async function startMailCatcher(port = 2525) {
  const catcher = { messages: [], logins: [], refuse: null };
  const sockets = new Set();

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    const say = (line) => socket.write(`${line}\r\n`);
    let buffer = "";
    let envelope = { from: null, to: [] };
    let data = null; // the message's lines, after DATA
    let login = null; // the next AUTH step, when the client sends it in parts

    say("220 catcher.test ESMTP ready");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("latin1");
      let end;
      while ((end = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);

        if (data) {
          if (line === ".") {
            catcher.messages.push(parse(envelope, Buffer.from(data.join("\r\n"), "latin1").toString("utf8")));
            data = null;
            envelope = { from: null, to: [] };
            say(`250 2.0.0 Ok: queued as ${catcher.messages.length}`);
          } else {
            data.push(line.startsWith("..") ? line.slice(1) : line);
          }
          continue;
        }

        if (login) {
          const value = Buffer.from(line, "base64").toString("utf8");
          if (login === "plain") {
            catcher.logins.push(value.split("\0")[1] ?? "");
          } else if (login === "user") {
            catcher.logins.push(value);
            login = "pass";
            say("334 UGFzc3dvcmQ6");
            continue;
          }
          login = null;
          say("235 2.7.0 Authentication successful");
          continue;
        }

        const [verb = "", ...rest] = line.split(" ");
        const arg = rest.join(" ");
        switch (verb.toUpperCase()) {
          case "EHLO":
            socket.write("250-catcher.test\r\n250-AUTH PLAIN LOGIN\r\n250-8BITMIME\r\n250 SMTPUTF8\r\n");
            break;
          case "HELO":
            say("250 catcher.test");
            break;
          case "AUTH": {
            const [mechanism = "", initial] = arg.split(" ");
            if (mechanism.toUpperCase() === "PLAIN" && initial) {
              catcher.logins.push(Buffer.from(initial, "base64").toString("utf8").split("\0")[1] ?? "");
              say("235 2.7.0 Authentication successful");
            } else if (mechanism.toUpperCase() === "PLAIN") {
              login = "plain";
              say("334 ");
            } else if (mechanism.toUpperCase() === "LOGIN") {
              login = "user";
              say("334 VXNlcm5hbWU6");
            } else {
              say("504 5.5.4 Unrecognized authentication type");
            }
            break;
          }
          case "MAIL":
            envelope.from = arg.match(/<([^>]*)>/)?.[1] ?? null;
            say("250 2.1.0 Ok");
            break;
          case "RCPT": {
            const to = arg.match(/<([^>]*)>/)?.[1] ?? "";
            if (catcher.refuse?.test(to)) {
              say(`550 5.1.1 <${to}>: Recipient address rejected: User unknown`);
            } else {
              envelope.to.push(to);
              say("250 2.1.5 Ok");
            }
            break;
          }
          case "DATA":
            if (!envelope.to.length) {
              say("554 5.5.1 No valid recipients");
            } else {
              data = [];
              say("354 End data with <CR><LF>.<CR><LF>");
            }
            break;
          case "RSET":
            envelope = { from: null, to: [] };
            say("250 2.0.0 Ok");
            break;
          case "NOOP":
            say("250 2.0.0 Ok");
            break;
          case "QUIT":
            say("221 2.0.0 Bye");
            socket.end();
            break;
          default:
            say("502 5.5.2 Command not recognized");
        }
      }
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  catcher.close = () =>
    new Promise((resolve) => {
      for (const s of sockets) s.destroy();
      server.close(() => resolve());
    });
  return catcher;
}
