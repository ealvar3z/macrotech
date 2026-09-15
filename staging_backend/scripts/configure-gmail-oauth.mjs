import http from "node:http";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { google } from "googleapis";

const PROJECT_ID = "macrotech-approval-production";
const EXPECTED_ACCOUNT = "macrotech.quotations@gmail.com";
const SECRET_NAMES = {
  clientId: "macrotech-gmail-client-id",
  clientSecret: "macrotech-gmail-client-secret",
  refreshToken: "macrotech-gmail-refresh-token"
};

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function gcloud(args, input) {
  const command = process.platform === "win32" ? "gcloud.cmd" : "gcloud";
  const result = spawnSync(command, args, {
    input,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: input === undefined ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"]
  });
  if (result.status !== 0) {
    fail(result.stderr?.trim() || `gcloud failed: ${args.join(" ")}`);
  }
  return result.stdout.trim();
}

function ensureSecret(name, value) {
  const existing = gcloud(["secrets", "list", "--project", PROJECT_ID, "--filter", `name=${name}`, "--format", "value(name)"]);
  if (!existing) {
    gcloud(["secrets", "create", name, "--project", PROJECT_ID, "--replication-policy", "automatic"]);
  }
  gcloud(["secrets", "versions", "add", name, "--project", PROJECT_ID, "--data-file=-"], value);
}

const credentialPath = process.argv[2];
if (!credentialPath) {
  fail("Pass the path to the downloaded Google Desktop OAuth client JSON file.");
}

const activeAccount = gcloud(["auth", "list", "--filter", "status:ACTIVE", "--format", "value(account)"]);
if (activeAccount !== EXPECTED_ACCOUNT) {
  fail(`Active gcloud account must be ${EXPECTED_ACCOUNT}; found ${activeAccount || "none"}.`);
}

const activeProject = gcloud(["config", "get-value", "project"]);
if (activeProject !== PROJECT_ID) {
  fail(`Active gcloud project must be ${PROJECT_ID}; found ${activeProject || "none"}.`);
}

let payload;
try {
  payload = JSON.parse(fs.readFileSync(credentialPath, "utf8"));
} catch (error) {
  fail(`Could not read OAuth JSON: ${error instanceof Error ? error.message : String(error)}`);
}

const installed = payload.installed;
if (!installed?.client_id || !installed?.client_secret) {
  fail("The file must be a Google OAuth client of type Desktop app.");
}

const server = http.createServer();
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

const address = server.address();
if (!address || typeof address === "string") fail("Could not open the local OAuth callback port.");
const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;
const client = new google.auth.OAuth2(installed.client_id, installed.client_secret, redirectUri);

const authorizationUrl = client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  login_hint: EXPECTED_ACCOUNT,
  scope: ["https://www.googleapis.com/auth/gmail.send"]
});

console.log("Open this Google authorization URL in your browser:");
console.log(authorizationUrl);
console.log(`Sign in only as ${EXPECTED_ACCOUNT}. The refresh token will be stored directly in Secret Manager and will not be printed.`);

const code = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("OAuth authorization timed out after five minutes.")), 5 * 60 * 1000);
  server.on("request", (req, res) => {
    const url = new URL(req.url ?? "/", redirectUri);
    if (url.pathname !== "/oauth2callback") {
      res.writeHead(404).end("Not found");
      return;
    }
    const error = url.searchParams.get("error");
    const returnedCode = url.searchParams.get("code");
    if (error || !returnedCode) {
      res.writeHead(400, { "Content-Type": "text/plain" }).end("Authorization was not completed. You may close this tab.");
      clearTimeout(timer);
      reject(new Error(error || "Google did not return an authorization code."));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/plain" }).end("Macrotech Gmail authorization completed. You may close this tab.");
    clearTimeout(timer);
    resolve(returnedCode);
  });
});

server.close();
const { tokens } = await client.getToken(code);
if (!tokens.refresh_token) {
  fail("Google did not return a refresh token. Remove the app grant for this test client and run the consent flow again.");
}

ensureSecret(SECRET_NAMES.clientId, installed.client_id);
ensureSecret(SECRET_NAMES.clientSecret, installed.client_secret);
ensureSecret(SECRET_NAMES.refreshToken, tokens.refresh_token);

console.log("Gmail OAuth values were stored in Secret Manager without being displayed.");
console.log("Delete the downloaded OAuth JSON from Downloads after the worker deployment succeeds.");
