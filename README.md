# Render Deployment Guide - Item Request Portal

This directory contains a clean, standalone copy of the **Item Request Portal** ready for hosting on **Render**. 

We have separated this folder (`render_deploy`) so you can deploy it cleanly to Render without any local files or clutter interfering.

---

## 🛠️ Deployment Strategy
We are using a **Multi-Service Architecture**:
1. **Backend Web Service (Dockerized):** Runs the Express server and installs the Linux Oracle Thick Client dynamically. (Required because Oracle database drivers need system-level `.so` libraries).
2. **Frontend Static Site (Native):** Serves your React + Vite frontend globally, completely for free on Render's CDN.

---

## 📋 Prerequisites
1. **Render Account:** Sign up for a free account at [render.com](https://render.com).
2. **Git:** Download and install Git from [git-scm.com](https://git-scm.com) (if not already installed).
3. **GitHub Account:** Create a repository on GitHub (or GitLab/Bitbucket) to sync your code with Render.

---

## 🚀 Step-by-Step Deployment Instructions

### Step 1: Initialize Git and Push to GitHub

Since you are new to Git, here are the exact terminal commands to upload this directory to a new GitHub repository:

1. Open your terminal (e.g., PowerShell, Git Bash, or Command Prompt).
2. Navigate to this folder:
   ```bash
   cd "C:\Users\User\Desktop\Learning\vibe coding\Item Project\render_deploy"
   ```
3. Initialize a new Git repository:
   ```bash
   git init -b main
   ```
4. Stage all files in this directory for your first commit:
   ```bash
   git add .
   ```
5. Commit the files locally:
   ```bash
   git commit -m "Initial commit for Render deployment"
   ```
6. **Go to GitHub.com:**
   - Log in and click **New Repository**.
   - Set a name (e.g., `item-request-portal`).
   - Leave "Add a README", "Add .gitignore", and "Choose a license" **unchecked** (since we already have them).
   - Click **Create repository**.
7. Copy the commands under "**...or push an existing repository from the command line**" on GitHub. It will look like this:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git branch -M main
   git push -u origin main
   ```
8. Paste and run those commands in your terminal. Your code is now safely on GitHub!

---

### Step 2: Deploy the Backend (Docker Web Service)

1. Log into your **Render Dashboard** (https://dashboard.render.com).
2. Click **New +** (top right) and select **Web Service**.
3. Select **Connect repository** and choose the repository you just pushed.
4. Fill out the service settings:
   - **Name:** `item-request-api`
   - **Region:** Select the region closest to your Oracle Database (e.g., Frankfurt/Oregon).
   - **Branch:** `main`
   - **Runtime:** `Docker` *(Render will automatically find your root `Dockerfile` and build it!)*
5. Click **Advanced** and add the following **Environment Variables**:
   -
6. Scroll down and click **Create Web Service**.
   - *Render will start downloading the Node base image, install the Oracle Linux client libraries, copy your spreadsheets, compile the TypeScript backend, and start the server.*
   - Once successfully deployed, copy your backend's **Onrender URL** from the top-left of the page (e.g., `https://item-request-api.onrender.com`).

---

### Step 3: Deploy the Frontend (Static Site)

1. Go back to your **Render Dashboard**.
2. Click **New +** and select **Static Site**.
3. Connect the **same** GitHub repository.
4. Fill out the service settings:
   - **Name:** `item-request-portal`
   - **Branch:** `main`
   - **Build Command:** `cd frontend && npm install && npm run build`
   - **Publish Directory:** `frontend/dist`
5. Click **Advanced** and add this **Environment Variable**:
   - Key: `VITE_API_URL` | Value: `https://YOUR_BACKEND_URL.onrender.com/api` *(Replace with the URL you copied from Step 2, ensuring it ends with `/api`)*
6. Click **Create Static Site**.
   - *Render will build your frontend and deploy it to a global CDN.*
7. Once finished, click the live link provided at the top of the page. Your application is now live!

---

## 🐳 Optional: Run & Test Locally with Docker
If you want to install Docker on your machine to test the exact production setup locally:

1. Download and install **Docker Desktop** from [docker.com](https://www.docker.com/products/docker-desktop/).
2. Open a terminal inside the `render_deploy` directory.
3. Build the container:
   ```bash
   docker build -t item-request-portal .
   ```
4. Run the container:
   ```bash
   docker run -p 5000:5000 --env DB_HOST=79.72.15.113 item-request-portal
   ```
5. You can now access your API at `http://localhost:5000/health`.
