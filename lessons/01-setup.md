# 1. Set up Node.js, npm, and MongoDB

Set up the tools and configuration for a Task Tracker API. **Node.js** runs JavaScript outside a browser. **npm** installs packages and runs commands defined by your project. **MongoDB** stores the tasks so they survive an app restart.

## Install Node.js 24 LTS

Use the latest patch in the Node.js 24 release line. LTS stands for long-term support. This tutorial uses Express 5 and MongoDB's official Node.js driver 7, both of which support Node.js 24. [Node.js release status](https://nodejs.org/en/about/previous-releases) · [Express 5 requirements](https://expressjs.com/en/guide/migrating-5/#installation) · [MongoDB driver compatibility](https://www.mongodb.com/docs/drivers/compatibility/)

- **Windows with PowerShell.** Select the Node.js 24 release on the download page and run the Windows MSI installer for your architecture. Open a new PowerShell window. If PowerShell blocks the npm script, use `npm.cmd` wherever the lessons use `npm`. [Node.js downloads](https://nodejs.org/en/download)
- **WSL 2 with Bash.** Install `nvm` inside your Linux distribution using Microsoft's guide. Reopen Bash, then run `nvm install 24` followed by `nvm use 24`. Use that same shell for the commands in these lessons. [Microsoft's Node.js on WSL guide](https://learn.microsoft.com/en-us/windows/dev-environment/javascript/nodejs-on-wsl)

In your chosen terminal, run `node --version` and `npm --version`. The first command should print `v24.x.x` with real minor and patch numbers. The second should print an npm version.

## Choose a MongoDB deployment

### Local MongoDB on Windows

Install MongoDB Community Server 8.0 using the Windows MSI and choose **Install MongoD as a Service** in the wizard. A service runs in the background. In PowerShell, check it with `Get-Service MongoDB`. If it is stopped, run `Start-Service MongoDB` from an administrator PowerShell window. Use `mongodb://127.0.0.1:27017` in the app. [MongoDB Community installation on Windows](https://www.mongodb.com/docs/v8.0/tutorial/install-mongodb-on-windows/)

### Local MongoDB from WSL 2

MongoDB's native installer supports specified Linux distributions and lists WSL as unsupported. For a local server in this workflow, use the official MongoDB Community container through Docker Desktop. Start Docker Desktop on Windows, enable its WSL 2 backend and integration for your distribution, and run `docker version` in WSL to check that it can reach the Docker server. [MongoDB platform note](https://www.mongodb.com/docs/v8.0/tutorial/install-mongodb-on-windows/) · [Docker Desktop WSL integration](https://docs.docker.com/desktop/features/wsl/)

```bash
docker run --name task-tracker-mongo -d -p 127.0.0.1:27017:27017 -v task-tracker-mongo-data:/data/db mongodb/mongodb-community-server:8.0-ubi9-slim
docker ps --filter name=task-tracker-mongo
```

The container runs MongoDB in the background, the port mapping publishes it on the local machine, and the named volume preserves the database files. Use `mongodb://127.0.0.1:27017` in the app. For later sessions, use `docker start task-tracker-mongo` to restart the same container. [MongoDB's Docker guide](https://www.mongodb.com/docs/v8.0/tutorial/install-mongodb-community-with-docker/) · [Official image tags](https://hub.docker.com/r/mongodb/mongodb-community-server/tags?name=8.0-ubi9-slim)

### MongoDB Atlas on either platform

Atlas hosts MongoDB for you. Create an Atlas cluster, create a **database user** with read and write access to `task_tracker`, and add your current public IP address to the project's IP access list. In the cluster's **Connect** dialog, choose **Drivers** and **Node.js**. Copy the connection URI, then replace the username and password placeholders with your database credentials. Percent-encode special characters in the credentials as described in the driver guide. [Atlas driver connection guide](https://www.mongodb.com/docs/atlas/driver-connection/) · [MongoDB connection URI format](https://www.mongodb.com/docs/drivers/node/current/connect/mongoclient/)

## Create your practice project

Open a terminal in an empty practice folder, such as `task-tracker-practice`. Create `package.json`, npm's project settings file, with this content. The `"type": "module"` setting lets you use JavaScript's `import` and `export` syntax in `.js` files.

```json
{
  "name": "task-tracker-api",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": "24.x"
  },
  "scripts": {
    "start": "node --env-file-if-exists=.env src/server.js",
    "test": "node --env-file-if-exists=.env --test"
  },
  "dependencies": {
    "express": "^5.3.0",
    "mongodb": "^7.8.0"
  }
}
```

Run `npm install`. npm writes `package-lock.json`, which records the exact installed versions, and places the packages in `node_modules/`.

Create `.gitignore` in the project root. Git uses it to skip files such as your private settings and installed packages.

```gitignore
node_modules/
.env
.env.*
!.env.example
npm-debug.log*
```

Create `.env.example` in the project root. It shows which settings the app reads.

```dotenv
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=task_tracker

# For Atlas, replace MONGODB_URI with the URI from your cluster's Connect dialog.
# mongodb+srv://<db_user>:<db_password>@<cluster_host>/

# Optional. Use a local or dedicated test MongoDB deployment.
# MONGODB_TEST_URI=mongodb://127.0.0.1:27017
```

Copy it to `.env` using `cp .env.example .env` in Bash or `Copy-Item .env.example .env` in PowerShell. Open `.env`. Keep the local URI if you chose a local server. If you chose Atlas, paste the completed connection URI into `MONGODB_URI`. Keep the file private.

## Check your setup

```bash
node --version
npm ls --depth=0
```

Expect Node.js 24 and both `express@5.x` and `mongodb@7.x` in the dependency list. You'll check the actual database connection in lesson 3.

[Next: Serve your first HTTP response](02-express-server.md)
