# Deploy BreakTrace privately

The release ships a local and private single-operator workspace. The supported access pattern is a loopback listener reached over an SSH tunnel. The production server also requires a separate workspace password in the supplied service configuration. Each credential grants access to the whole workspace.

## Free hosting evaluation

| Option | Fit for the full stack |
| --- | --- |
| **Oracle Cloud Infrastructure Always Free A1** | Selected for a private deployment. Oracle documents a monthly allowance equivalent to two Arm OCPUs and 12 GB of memory in the home region, with up to 200 GB of included block storage across eligible resources. An eligible Ubuntu Arm VM can run Node, Chromium and MongoDB together. Availability varies by region and idle instances may be reclaimed. [Oracle Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) |
| Google Cloud Compute Engine Free Tier | The eligible e2-micro has 1 GB of memory. A VM can run Node and publish a browser UI, but that capacity is a poor fit for this project's local Chromium and MongoDB running together. Eligible hours and disk types also depend on location and quota. [Google Cloud Free Tier](https://docs.cloud.google.com/free/docs/free-cloud-features?hl=en), [e2 machine sizes](https://docs.cloud.google.com/compute/docs/general-purpose-machines) |
| Render Free web service | Supports Docker and a combined React/Express web service. The free instance has 512 MB of RAM, sleeps and lacks a persistent disk for evidence. A separate free database would preserve only catalog and run records. [Render free services](https://render.com/docs/free), [Render pricing](https://render.com/pricing) |
| Cloudflare Pages Free | Can serve a standalone static frontend. Its Functions run on Workers. The current app needs an Express process, persistent disk and local Chromium processes, so Pages is unsuitable as the complete host. [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/) |
| MongoDB Atlas Free | Optional database for a small workspace. It provides MongoDB with limited storage and deployment regions, and can pause after inactivity. Screenshots and repair artifacts still need disk on the app host. [Atlas Free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/) |

Hosting suitability is an assessment from the published limits and platform support. No provider account, VM or managed database was provisioned during release verification.

## OCI private VM

Use an Always Free-eligible `VM.Standard.A1.Flex` in the tenancy home region. Two OCPUs, 8 GB of RAM and a 50 GB boot volume fit the published limits for an otherwise unused tenancy. Choose Ubuntu 22.04 Arm64. Permit SSH from the operator’s network in the OCI security rules. Keep ports 4311 and 27017 closed to inbound cloud traffic. Use key-based SSH. Check the console’s actual price estimate and allowance before provisioning. [Playwright platform support](https://playwright.dev/docs/intro#system-requirements), [MongoDB platform support](https://www.mongodb.com/docs/community-platform-support/)

### Install the service

Install system-wide Node.js 24 and npm. Put the authorized release source in `/opt/breaktrace`. Build as the deployment user and keep the resulting tree readable by the service account.

```sh
cd /opt/breaktrace
npm ci
npm run build
sudo adduser --system --group --home /var/lib/breaktrace --no-create-home breaktrace
sudo env "PLAYWRIGHT_BROWSERS_PATH=/opt/breaktrace-browsers" "$(command -v node)" node_modules/playwright/cli.js install --with-deps chromium
sudo install -d -m 0700 /etc/breaktrace
sudo test -f /etc/breaktrace/breaktrace.env || sudo install -m 0600 /dev/null /etc/breaktrace/breaktrace.env
sudo install -m 0644 deploy/oci/breaktrace.service /etc/systemd/system/breaktrace.service
```

On an existing installation, preserve the environment file and the state directory. Generate a distinct password and put it in the environment file using `sudoedit`.

```sh
node -p "require('node:crypto').randomBytes(32).toString('base64url')"
sudoedit /etc/breaktrace/breaktrace.env
```

```dotenv
BREAKTRACE_PORT=4311
PLAYWRIGHT_BROWSERS_PATH=/opt/breaktrace-browsers
BREAKTRACE_OPERATOR_PASSWORD=<generated-password>
```

The service stores catalog data, runs and artifacts in `/var/lib/breaktrace` by default. The supplied unit requires operator authentication and runs under a dedicated user. Preserve the Chromium sandbox for enrolled targets. If the host denies unprivileged Chromium namespaces, fix host compatibility before enabling those targets. [Playwright browser installation](https://playwright.dev/docs/browsers)

### Enable MongoDB storage

For MongoDB mode, install MongoDB Community 8.0 with the official package instructions. On a new installation, use the packaged data directory and the supplied loopback-only config. Existing MongoDB data requires a planned configuration and credential migration. [MongoDB Community installation](https://www.mongodb.com/docs/v8.0/tutorial/install-mongodb-on-ubuntu/)

```sh
sudo install -m 0644 deploy/oci/mongod.conf /etc/mongod.conf
sudo systemctl enable --now mongod
mongosh admin
```

Use the localhost bootstrap on a fresh MongoDB data directory to create the database administrator. Then leave that session and connect as the administrator using the password prompt. [MongoDB localhost exception](https://www.mongodb.com/docs/v8.0/core/localhost-exception/)

```javascript
db.createUser({
  user: "breaktrace-admin",
  pwd: passwordPrompt(),
  roles: [{ role: "userAdmin", db: "breaktrace" }]
})
```

```sh
mongosh 'mongodb://127.0.0.1:27017/breaktrace?authSource=admin' --username breaktrace-admin --password
```

```javascript
db.createUser({
  user: "breaktrace-app",
  pwd: passwordPrompt(),
  roles: [{ role: "readWrite", db: "breaktrace" }]
})
```

Add the application URI with the percent-encoded application password. Keep the database administrator’s password out of the app environment.

```dotenv
BREAKTRACE_MONGO_URI=mongodb://breaktrace-app:<encoded-password>@127.0.0.1:27017/breaktrace?authSource=breaktrace
BREAKTRACE_MONGO_DB=breaktrace
```

### Start and check over SSH

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now breaktrace
sudo systemctl status breaktrace
sudo journalctl -u breaktrace -n 50
```

From the operator machine, forward local port 4311 to the VM loopback listener.

```sh
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:4311:127.0.0.1:4311 ubuntu@<vm-host>
```

Open `http://127.0.0.1:4311` and enter username `operator` with the workspace password. Confirm the dashboard reaches Live, run the Fieldwork baseline, export a report, then restart the service and confirm the run and artifact persist. Before enrolling an approved staging application, verify the target’s proof and run a read-only baseline under sandboxed Chromium. Keep the SSH tunnel and the loopback binds in place.

For backups, preserve the state directory and, in MongoDB mode, take an authenticated MongoDB backup. Confirm service and database recovery before relying on the VM as the only evidence store.

## Local Docker Compose

```sh
docker compose up --build --wait
node scripts/check-container.mjs
```

The base stack publishes port 4311 on host loopback. If workspace authentication is enabled in Compose, export the same `BREAKTRACE_OPERATOR_PASSWORD` to the shell running the probe. The MongoDB overlay additionally requires `BREAKTRACE_MONGO_USER`, `BREAKTRACE_MONGO_PASSWORD` and a `BREAKTRACE_MONGO_URI` that reaches service `mongo`. Its MongoDB port stays unpublished.

```sh
docker compose -f compose.yaml -f compose.mongo.yaml up --build --wait
```

On Docker hosts use an up-to-date engine and restrict external network access to application ports. The local container smoke covers the bundled fixture. The OCI service runs Chromium natively. Containerized external Chromium requires verified user namespace support and a compatible seccomp policy. [Docker port publishing](https://docs.docker.com/engine/network/port-publishing/), [Playwright Docker sandbox](https://playwright.dev/docs/docker)
